import { actionTime, levelForXp, walk, xpPerAction } from '../core/xp.js'
import { MILESTONES, itemName, milestonePoints, nextMilestoneIndex } from '../game/collection.js'
import { JOBS } from '../game/jobs.js'
import { RARITIES } from '../game/rarities.js'
import { RECIPES, materialsFor } from '../game/recipes.js'

const key = (item, rarity) => `${item}|${rarity}`

/**
 * Plays a list of planned steps in order. Each step crafts one item at one rarity up to its
 * next collection milestone, starting from the counts left by the steps before it, so
 * planning the same cell twice plans the tier after.
 *
 * steps: [{ job: job name, rarity: rarity name }]
 * Returns the computed steps plus the end state: XP, level, and a lookup for planned counts.
 */
export function runPlan({ steps, startXp, xpGain, speed, collection }) {
  const counts = {}
  const have = (item, rarity) => counts[key(item, rarity)] ?? collection[item]?.[rarity] ?? 0
  let xp = startXp
  let seconds = 0
  let points = 0

  const rows = steps.map((step) => {
    const job = JOBS.find((j) => j.name === step.job)
    const rarity = RARITIES.find((r) => r.name === step.rarity)
    if (!job || !rarity) return null
    const item = itemName(job)
    const levelBefore = levelForXp(xp)
    const r = tierStep(job, rarity, have(item, rarity.name), xp, xpGain, speed)
    counts[key(item, rarity.name)] = r.to
    xp += r.xpGained
    seconds += r.seconds
    points += r.points
    return {
      ...step,
      ...r,
      item,
      needLevel: job.level,
      locked: job.level > levelBefore,
      levelBefore,
      levelAfter: levelForXp(xp),
      totalSeconds: seconds,
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

// Craft one item/rarity from `collected` up to its next milestone, starting at `xp`
export function tierStep(job, rarity, collected, xp, xpGain, speed) {
  const index = nextMilestoneIndex(collected)
  if (index < 0) {
    return { done: true, from: collected, to: collected, items: 0, materials: [], xpGained: 0, seconds: 0, points: 0 }
  }
  const items = MILESTONES[index] - collected
  const perItem = xpPerAction(job.xp, rarity.multiplier, xpGain)
  const xpGained = items * perItem
  // Failed attempts (burns) don't count toward the log, so walk the extra attempts
  const run = walk(job, xp, xp + xpGained, perItem)
  const attempts = Math.ceil(run.attempts - 1e-9)
  return {
    from: collected,
    to: MILESTONES[index],
    items,
    attempts,
    materials: materialsFor(job.name, attempts, rarity.name) ?? [],
    xpGained,
    seconds: run.attempts * actionTime(job.time, speed) + run.failed * (job.fail?.stun ?? 0),
    points: milestonePoints(index, rarity.name),
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
