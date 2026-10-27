import { expectedMultiplier, levelForXp, walk, xpPerAction } from '../core/xp.js'
import { MILESTONES, itemName, milestonePoints, nextMilestoneIndex, pointsBetween } from '../game/collection.js'
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
export function runPlan({ steps, startXp, xpGain, speed, collection, chances }) {
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
    if (!job || !rarity) return null
    const item = itemName(job)
    const levelBefore = levelForXp(xp)
    const r = tierStep(job, rarity, have(item, rarity.name), xp, xpGain, speed, {
      chances,
      have: (name) => have(item, name),
    })
    for (const [name, qty] of Object.entries(r.gained)) counts[key(item, name)] = have(item, name) + qty
    xp += r.xpGained
    seconds += r.seconds
    points += r.points
    if (r.gathers !== undefined) gathered[item] = (gathered[item] ?? 0) + r.gathers
    return {
      ...step,
      ...r,
      item,
      needLevel: job.level,
      locked: job.level > levelBefore,
      levelBefore,
      levelAfter: levelForXp(xp),
      totalSeconds: seconds,
      // Gathers this item needs in total by the end of this step
      itemGathers: gathered[item],
    }
  })

  const kept = rows.filter(Boolean)
  return { rows: kept, xp, level: levelForXp(xp), seconds, points, have, materials: totalMaterials(kept) }
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
export function tierStep(job, rarity, collected, xp, xpGain, speed, gather) {
  const index = nextMilestoneIndex(collected)
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
    points: milestonePoints(index, rarity.name),
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
  const points = Object.entries(gained).reduce(
    (sum, [name, qty]) => sum + pointsBetween(have(name), have(name) + qty, name),
    0,
  )
  const perItem = xpPerAction(job.xp, expectedMultiplier(chances), xpGain)
  const run = walk(job, xp, xp + gathers * perItem, perItem, Infinity, speed)
  return {
    from: collected,
    to: MILESTONES[index],
    items: Math.ceil(gathers - 1e-9),
    gathers,
    gained,
    attempts: Math.ceil(run.attempts - 1e-9),
    materials: [],
    xpGained: gathers * perItem,
    seconds: run.seconds,
    points,
  }
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
}) {
  const jobs = JOBS.filter(
    (j) => j.skill === skill && RECIPES[j.name] && !off.levels?.includes(j.level),
  )
  const rarities = RARITIES.filter((r) => !off.rarities?.includes(r.name))
  const stock = {}
  for (const [item, byRarity] of Object.entries(inventory)) {
    for (const [rarity, qty] of Object.entries(byRarity)) stock[key(item, rarity)] = qty
  }
  const counts = {}
  const have = (item, rarity) => counts[key(item, rarity)] ?? collection[item]?.[rarity] ?? 0
  let xp = startXp
  const steps = []

  while (steps.length < maxSteps) {
    const level = levelForXp(xp)
    let best = null
    for (const job of jobs) {
      if (job.level > level) continue
      const item = itemName(job)
      for (const rarity of rarities) {
        const step = tierStep(job, rarity, have(item, rarity.name), xp, xpGain, speed)
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
    xp += step.xpGained
    steps.push({ job: job.name, rarity: rarity.name })
  }
  return steps
}
