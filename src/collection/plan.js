import { expectedMultiplier, levelForXp, walk, xpPerAction } from '../core/xp.js'
import {
  MILESTONES,
  hasLogItem,
  itemName,
  milestoneReached,
  milestonePoints,
  nextMilestoneIndex,
  pointsBetween,
} from '../game/collection.js'
import { JOBS, isGathering } from '../game/jobs.js'
import { RARITIES } from '../game/rarities.js'
import { RECIPES, materialsFor } from '../game/recipes.js'

const key = (item, rarity) => `${item}|${rarity}`

/**
 * Plays a list of planned steps in order. Each step crafts one item at one rarity up to its
 * next collection milestone, starting from the counts left by the steps before it, so
 * planning the same cell twice plans the tier after.
 *
 * steps: [{ job: job name, rarity: rarity name }]
 * chances: rarity chances from the player's luck (rarityChances), used by gathering skills
 * Returns the computed steps plus the end state: XP, level, and a lookup for planned counts.
 */
export function runPlan({ steps, startXp = 0, xpGain, speed, collection, chances, skills }) {
  // `skills` ({ skill: { startXp, speed, xpGain } }) plans several skills in one go, each with
  // its own XP; without it everything runs on startXp, xpGain and speed
  const per = skills
    ? Object.fromEntries(Object.entries(skills).map(([k, v]) => [k, { ...v, xp: v.startXp }]))
    : null
  const xpOf = (sk) => (per ? per[sk].xp : xp)
  const counts = {}
  const have = (item, rarity) => counts[key(item, rarity)] ?? collection[item]?.[rarity] ?? 0
  let xp = startXp
  let seconds = 0
  let points = 0
  // Gathering: gathers planned so far per item. Every rarity of an item comes from the same
  // gathers, so each step only adds what it still needs on top of these.
  const gathered = {}

  const rows = steps.map((step) => {
    const job = JOBS.find((j) => j.name === step.job)
    const rarity = RARITIES.find((r) => r.name === step.rarity)
    if (!job || !rarity || (per && !per[job.skill])) return null
    const item = itemName(job)
    const levelBefore = levelForXp(xpOf(job.skill))
    let r = tierStep(job, rarity, have(item, rarity.name), xpOf(job.skill), per ? per[job.skill].xpGain : xpGain, per ? per[job.skill].speed : speed, {
      chances,
      have: (name) => have(item, name),
    }, step.to)
    // A by-product row whose milestone an earlier row's gathers already reached: no gathers or
    // points of its own (the earlier row counted them), kept to show what it was going to earn
    if (r.done && step.from !== undefined && step.from < step.to) {
      const chance = chances?.find((c) => c.name === rarity.name)?.chance ?? 0
      r = {
        done: false,
        byProduct: true,
        from: step.from,
        to: step.to,
        items: 0,
        gained: {},
        materials: [],
        xpGained: 0,
        seconds: 0,
        points: 0,
        byPoints: pointsBetween(step.from, step.to, rarity.name),
        byGathers: chance > 0 ? Math.ceil((step.to - step.from) / chance) : 0,
      }
    }
    for (const [name, qty] of Object.entries(r.gained)) counts[key(item, name)] = have(item, name) + qty
    if (per) per[job.skill].xp += r.xpGained
    else xp += r.xpGained
    seconds += r.seconds
    points += r.points + (r.sidePoints ?? 0)
    if (r.gathers !== undefined) gathered[item] = (gathered[item] ?? 0) + r.gathers
    return {
      ...step,
      ...r,
      item,
      skill: job.skill,
      needLevel: job.level,
      locked: job.level > levelBefore,
      levelBefore,
      levelAfter: levelForXp(xpOf(job.skill)),
      totalSeconds: seconds,
      // Gathers this item needs in total by the end of this step
      itemGathers: gathered[item],
    }
  })

  const kept = rows.filter(Boolean)
  // Several skills: each one's level before and after, instead of a single XP and level
  const levels = per
    ? Object.fromEntries(Object.entries(per).map(([k, v]) => [k, { from: levelForXp(v.startXp), to: levelForXp(v.xp) }]))
    : undefined
  return {
    rows: kept,
    xp,
    level: levelForXp(xp),
    levels,
    xpGained: kept.reduce((sum, r) => sum + r.xpGained, 0),
    xpFor: xpOf,
    seconds,
    points,
    have,
    materials: totalMaterials(kept),
  }
}

// Materials across every step, merged by material and rarity, largest first
function totalMaterials(rows) {
  const totals = {}
  for (const m of rows.flatMap((r) => r.materials)) {
    const k = key(m.material, m.rarity)
    totals[k] = { ...m, quantity: (totals[k]?.quantity ?? 0) + m.quantity }
  }
  return Object.values(totals).sort((a, b) => b.quantity - a.quantity)
}

// Craft one item/rarity from `collected` up to its next milestone, starting at `xp`.
// Gathering skills can't pick a rarity, so they go through gatherStep using `gather`:
// { chances, have(rarityName) } with the player's rarity chances and the item's current counts.
// `target` (optional) pins the milestone to reach, so a planned step keeps its tier however the
// plan is reordered; without it the step aims for the next milestone above `collected`.
export function tierStep(job, rarity, collected, xp, xpGain, speed, gather, target) {
  const index = target === undefined ? nextMilestoneIndex(collected) : collected >= target ? -1 : MILESTONES.indexOf(target)
  if (index < 0) {
    return { done: true, from: collected, to: collected, items: 0, gained: {}, materials: [], xpGained: 0, seconds: 0, points: 0 }
  }
  if (isGathering(job.skill)) return gatherStep(job, rarity, collected, index, xp, xpGain, speed, gather)
  const items = MILESTONES[index] - collected
  const perItem = xpPerAction(job.xp, rarity.multiplier, xpGain)
  const xpGained = items * perItem
  // Failed attempts (burns) don't count toward the log, so walk the extra attempts
  const run = walk(job, xp, xp + xpGained, perItem, Infinity, speed)
  const attempts = Math.ceil(run.attempts - 1e-9)
  return {
    from: collected,
    to: MILESTONES[index],
    items,
    gained: { [rarity.name]: items },
    attempts,
    materials: materialsFor(job.name, attempts, rarity.name) ?? [],
    xpGained,
    seconds: run.seconds,
    points: pointsBetween(collected, MILESTONES[index], rarity.name),
  }
}

// Gather until `rarity` reaches its next milestone. Each gather rolls a rarity with the
// player's luck, so this takes (needed ÷ chance) gathers on average, and the other rarities
// rise by their own expected share along the way (earning any milestones they pass).
function gatherStep(job, rarity, collected, index, xp, xpGain, speed, { chances, have }) {
  const needed = MILESTONES[index] - collected
  const chance = chances.find((c) => c.name === rarity.name)?.chance ?? 0
  if (!(chance > 0)) {
    // Luck so high this rarity never rolls (every roll lands on a better one)
    return { done: true, impossible: true, from: collected, to: collected, items: 0, gained: {}, materials: [], xpGained: 0, seconds: 0, points: 0 }
  }
  const gathers = needed / chance
  const gained = Object.fromEntries(
    chances.filter((c) => c.chance > 0).map((c) => [c.name, c.name === rarity.name ? needed : gathers * c.chance]),
  )
  // Other rarities that reach a new milestone from these gathers, with their own points
  const side = Object.entries(gained)
    .filter(([name]) => name !== rarity.name)
    .map(([name, qty]) => ({
      rarity: name,
      from: have(name),
      to: milestoneReached(have(name) + qty),
      points: pointsBetween(have(name), have(name) + qty, name),
      // Per-gather chance, to work out the gathers needed to reach `to`
      chance: chances.find((c) => c.name === name)?.chance ?? 0,
    }))
    .filter((s) => s.points > 0)
  const perItem = xpPerAction(job.xp, expectedMultiplier(chances), xpGain)
  const run = walk(job, xp, xp + gathers * perItem, perItem, Infinity, speed)
  return {
    from: collected,
    to: MILESTONES[index],
    items: Math.ceil(gathers - 1e-9),
    gathers,
    // Per-gather chance of the planned rarity, for the side rows made when this step is folded
    chance,
    gained,
    attempts: Math.ceil(run.attempts - 1e-9),
    materials: [],
    xpGained: gathers * perItem,
    seconds: run.seconds,
    // Points for the planned rarity only; `side` holds the rest
    points: pointsBetween(collected, MILESTONES[index], rarity.name),
    side,
    sidePoints: side.reduce((sum, s) => sum + s.points, 0),
  }
}

// The steps that plan one gathering tier: the tier itself first, with all the gathers it needs,
// then a by-product row for every other rarity those gathers push past a milestone (shortest
// first). A by-product row is pinned to its milestone with the count it started from; it needs
// no gathers of its own as long as it stays below the row that fills it.
// `have(item, rarity)` and `xp` are the state before the steps.
// Returns { steps, counts (new count per rarity of the item), xp }.
export function expandGatherStep({ job, rarity, rarities, chances, xpGain, speed, have, xp }) {
  const item = itemName(job)
  const main = tierStep(job, rarity, have(item, rarity.name), xp, xpGain, speed, {
    chances,
    have: (name) => have(item, name),
  })
  if (main.done || !main.points) return { steps: [], counts: {}, xp, gathers: 0 }
  const counts = {}
  for (const [name, qty] of Object.entries(main.gained)) counts[name] = have(item, name) + qty
  const gathersFor = (x) => (x.chance > 0 ? (x.to - x.from) / x.chance : Infinity)
  const steps = [{ job: job.name, rarity: rarity.name, from: Math.floor(main.from), to: main.to }]
  main.side
    .filter((x) => rarities.some((r) => r.name === x.rarity))
    .sort((a, b) => gathersFor(a) - gathersFor(b))
    .forEach((x) => steps.push({ job: job.name, rarity: x.rarity, from: Math.floor(x.from), to: x.to }))
  return { steps, counts, xp: xp + main.xpGained, gathers: main.gathers }
}

// Gathering uses no materials, so nothing limits the search except `depth`: the number of
// steps it plans. Each round takes the best tier across all items: the most points per gather
// (default) or the fewest gathers, per `rank`. A step's gathers are counted from the counts the earlier steps left, so the item just worked on stays cheap while
// its next tiers are, and the search hops to another item once those cost more than that item's.
function searchGathering({ skill, startXp, xpGain, speed, collection, off, rarities, chances, depth, rank }) {
  const jobs = JOBS.filter((j) => j.skill === skill && hasLogItem(j) && !off.levels?.includes(j.level))
  const counts = {}
  const have = (item, rarity) => counts[key(item, rarity)] ?? collection[item]?.[rarity] ?? 0
  let xp = startXp
  const steps = []
  let used = 0
  const gathered = {}

  while (used < depth) {
    const level = levelForXp(xp)
    let best = null
    for (const job of jobs) {
      if (job.level > level) continue
      const item = itemName(job)
      for (const rarity of rarities) {
        const step = tierStep(job, rarity, have(item, rarity.name), xp, xpGain, speed, {
          chances,
          have: (name) => have(item, name),
        })
        if (step.done || !step.points) continue
        // rank 'gathers': fewest gathers first; 'points': most points (own + by-products) per gather
        const score =
          rank === 'points'
            ? (step.points + (step.sidePoints ?? 0)) / Math.max(step.gathers, 1e-9)
            : -step.gathers
        if (!best || score > best.score) best = { job, item, rarity, step, score }
      }
    }
    if (!best) break

    const { job, item, rarity } = best
    const out = expandGatherStep({ job, rarity, rarities, chances, xpGain, speed, have, xp })
    if (!out.steps.length) break
    for (const [name, qty] of Object.entries(out.counts)) counts[key(item, name)] = qty
    xp = out.xp
    gathered[item] = (gathered[item] ?? 0) + out.gathers
    // Tag each step with its item and the item's gathers so far, to group them below
    out.steps.forEach((step, i) => steps.push({ ...step, item, main: i === 0, cum: gathered[item] }))
    // By-product rows count toward the depth too; the last pick may run past it
    used += out.steps.length
  }
  return groupByItem(steps)
}

// One block per item, at the item's first position: the step with the most gathers on top, then
// the rest as by-product rows (pinned to their tiers, they need no gathers of their own below it).
function groupByItem(tagged) {
  const groups = new Map()
  tagged.forEach((t, i) => {
    if (!groups.has(t.item)) groups.set(t.item, { at: i, rows: [] })
    groups.get(t.item).rows.push(t)
  })
  return [...groups.values()]
    .sort((a, b) => a.at - b.at)
    .flatMap((g) => {
      const top = g.rows.filter((r) => r.main).reduce((a, b) => (b.cum > a.cum ? b : a))
      // Rows of the same rarity below the top one are one by-product row, first start to last tier
      const rest = []
      for (const r of g.rows.filter((r) => r !== top && !(r.rarity === top.rarity && r.to <= top.to)).sort((a, b) => a.cum - b.cum)) {
        const same = rest.find((x) => x.rarity === r.rarity)
        if (same) {
          same.from = Math.min(same.from, r.from)
          same.to = Math.max(same.to, r.to)
        } else rest.push({ ...r })
      }
      return [top, ...rest].map(({ item, main, cum, ...step }) => step)
    })
}

/**
 * Builds a plan that collects as many points as possible using only what's in storage.
 * Greedy: each round takes the affordable next tier with the most points for the smallest
 * share of the materials it uses, takes those materials out of storage, puts the crafted
 * items in (so new bars can feed later crafts), and repeats until nothing more fits.
 * Jobs unlock as the plan's XP raises the level. Returns steps for runPlan.
 */
// `off` ({ levels, rarities }) lists item levels and rarities the search must not plan.
export function maximisePoints({
  skill,
  startXp,
  xpGain,
  speed,
  collection,
  inventory,
  off = {},
  maxSteps = 300,
  chances,
  depth = 10,
  rank = 'points',
}) {
  const rarities = RARITIES.filter((r) => !off.rarities?.includes(r.name))
  if (isGathering(skill)) {
    return searchGathering({ skill, startXp, xpGain, speed, collection, off, rarities, chances, depth, rank })
  }
  return searchProcessing({ skills: { [skill]: { startXp, speed, xpGain } }, collection, inventory, off, maxSteps })
}

// The same search across several processing skills at once, sharing one storage and one plan.
// skills: { skill: { startXp, speed, xpGain } }. Crafted items go back into storage, so one
// skill's bars can feed another's crafts.
export function maximisePointsAll({ skills, collection, inventory, off = {}, maxSteps = 300 }) {
  return searchProcessing({ skills, collection, inventory, off, maxSteps })
}

function searchProcessing({ skills, collection, inventory, off = {}, maxSteps }) {
  const rarities = RARITIES.filter((r) => !off.rarities?.includes(r.name))
  const jobs = JOBS.filter((j) => skills[j.skill] && RECIPES[j.name] && !off.levels?.includes(j.level))
  const stock = {}
  for (const [item, byRarity] of Object.entries(inventory)) {
    for (const [rarity, qty] of Object.entries(byRarity)) stock[key(item, rarity)] = qty
  }
  const counts = {}
  const have = (item, rarity) => counts[key(item, rarity)] ?? collection[item]?.[rarity] ?? 0
  const xps = Object.fromEntries(Object.entries(skills).map(([k, v]) => [k, v.startXp]))
  const steps = []

  while (steps.length < maxSteps) {
    let best = null
    for (const job of jobs) {
      const { speed, xpGain } = skills[job.skill]
      if (job.level > levelForXp(xps[job.skill])) continue
      const item = itemName(job)
      for (const rarity of rarities) {
        const step = tierStep(job, rarity, have(item, rarity.name), xps[job.skill], xpGain, speed)
        if (step.done || !step.points) continue
        // Cost = share of each material this uses up; unaffordable steps are skipped
        let cost = 0
        for (const m of step.materials) {
          const available = stock[key(m.material, m.rarity)] ?? 0
          cost = m.quantity > available ? Infinity : cost + m.quantity / available
        }
        if (!(cost < Infinity)) continue
        const score = step.points / cost
        if (!best || score > best.score || (score === best.score && step.seconds < best.step.seconds)) {
          best = { job, item, rarity, step, score }
        }
      }
    }
    if (!best) break

    const { job, item, rarity, step } = best
    for (const m of step.materials) stock[key(m.material, m.rarity)] -= m.quantity
    stock[key(item, rarity.name)] = (stock[key(item, rarity.name)] ?? 0) + step.items
    counts[key(item, rarity.name)] = step.to
    xps[job.skill] += step.xpGained
    steps.push({ job: job.name, rarity: rarity.name, to: step.to })
  }
  return steps
}
