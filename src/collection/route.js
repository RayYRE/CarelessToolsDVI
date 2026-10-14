import { actionTime, failChance, levelForXp, walk, xpForLevel, xpPerAction } from '../core/xp.js'
import { MILESTONES, itemName, milestonePoints, nextMilestoneIndex } from '../game/collection.js'
import { JOBS } from '../game/jobs.js'
import { RARITIES } from '../game/rarities.js'

const MAX_STEPS = 5000

function skillJobs(skill, speedPercent, excluded = []) {
  return JOBS.filter((j) => j.skill === skill && !excluded.includes(itemName(j))).map((j) => ({
    ...j,
    time: actionTime(j.time, speedPercent),
    item: itemName(j),
  }))
}

// XP per second crafting this job at Common rarity (burns included)
const commonRate = (job, level, xpGain) =>
  (xpPerAction(job.xp, 1, xpGain) * (1 - failChance(job, level))) / job.time

// The unlocked job with the best Common XP per second at this level
function bestJob(jobs, level, xpGain) {
  let best = null
  for (const j of jobs) {
    if (j.level > level) continue
    const rate = commonRate(j, level, xpGain)
    if (!best || rate > best.rate) best = { job: j, rate }
  }
  return best
}

// Fastest-possible time from level 1 to any XP, levelling with the best item at every level.
// Lets a step's time be compared with plain levelling over the same XP, including items
// that unlock partway through.
function baselineClock(jobs, targetLevel, xpGain) {
  const rate = []
  const cumulative = [0, 0] // cumulative[level] = seconds from level 1 to the start of level
  for (let level = 1; level <= targetLevel; level++) {
    rate[level] = bestJob(jobs, level, xpGain)?.rate ?? 0
    const span = xpForLevel(level + 1) - xpForLevel(level)
    // A level with nothing to craft (all excluded) adds no baseline time
    cumulative[level + 1] = cumulative[level] + (rate[level] > 0 ? span / rate[level] : 0)
  }
  return (xp) => {
    const level = Math.min(levelForXp(xp), targetLevel)
    return cumulative[level] + (rate[level] > 0 ? (xp - xpForLevel(level)) / rate[level] : 0)
  }
}

/**
 * Greedy route to targetLevel that picks up collection log milestones on the way.
 *
 * Each step crafts one item at one rarity up to its next milestone. Steps are scored by
 * points per *extra* second: the step's time minus the time plain levelling (best item at
 * each level) would need for the same useful XP (XP past the target is wasted). Levelling with the best item is
 * therefore almost free, so its milestones come first, and the route detours to other items
 * or rarities only when their points are worth the extra time.
 *
 * maxMilestone: { Common: 7, Rare: 1, Legendary: -1, ... } highest milestone index to plan
 * per rarity (-1 = don't craft that rarity), since rarer crafts need rarer materials.
 * minPointsPerHour: skip detours worth fewer points per extra hour than this. When nothing
 * qualifies, the route just levels with the best item (Infinity = fastest possible route).
 * excluded: item names never to craft (too expensive), for milestones or levelling.
 */
export function planRoute({
  skill,
  startXp,
  targetLevel,
  xpGain,
  speed,
  collection,
  maxMilestone,
  minPointsPerHour = 0,
  excluded = [],
}) {
  const jobs = skillJobs(skill, speed, excluded)
  const targetXp = xpForLevel(targetLevel)
  const clock = baselineClock(jobs, targetLevel, xpGain)
  const counts = {}
  const have = (item, rarity) => counts[`${item}|${rarity}`] ?? collection[item]?.[rarity] ?? 0

  let xp = startXp
  let seconds = 0
  let points = 0
  const steps = []

  while (xp < targetXp && steps.length < MAX_STEPS) {
    const level = levelForXp(xp)
    let best = null

    for (const job of jobs) {
      if (job.level > level) continue
      for (const rarity of RARITIES) {
        const collected = have(job.item, rarity.name)
        const index = nextMilestoneIndex(collected)
        if (index < 0 || index > (maxMilestone[rarity.name] ?? -1)) continue

        const items = MILESTONES[index] - collected
        const perItem = xpPerAction(job.xp, rarity.multiplier, xpGain)
        const xpGained = items * perItem
        const run = walk(job, xp, xp + xpGained, perItem)
        const time = run.attempts * job.time
        const pts = milestonePoints(index, rarity.name)
        const useful = Math.min(xpGained, targetXp - xp)
        const extra = time - (clock(xp + useful) - clock(xp))
        // Detours below the threshold are skipped; near-free steps (levelling anyway) always pass
        if (extra > 1 && (pts / extra) * 3600 < minPointsPerHour) continue
        const score = pts / Math.max(extra, 1)
        const xpRate = useful / time
        if (!best || score > best.score || (score === best.score && xpRate > best.xpRate)) {
          best = { job, rarity, collected, index, items, xpGained, run, time, pts, score, xpRate }
        }
      }
    }
    if (!best) {
      // Nothing worth a detour: level up with the best item, collecting any milestones it passes
      const step = levelUpStep(jobs, level, xp, targetXp, xpGain, have, maxMilestone)
      if (!step) break
      for (const [key, value] of Object.entries(step.counts)) counts[key] = value
      xp += step.xpGained
      seconds += step.seconds
      points += step.points
      const prev = steps.at(-1)
      if (prev?.levelling && prev.job === step.job) {
        // Merge consecutive level-up chunks on the same item into one row
        Object.assign(prev, {
          items: prev.items + step.items,
          attempts: prev.attempts + step.attempts,
          burned: prev.burned + step.burned,
          xpGained: prev.xpGained + step.xpGained,
          points: prev.points + step.points,
          seconds: prev.seconds + step.seconds,
          milestone: step.milestone,
        })
        Object.assign(prev, { levelAfter: levelForXp(xp), totalSeconds: seconds, totalPoints: points })
      } else {
        steps.push({
          ...step,
          levelBefore: level,
          levelAfter: levelForXp(xp),
          totalSeconds: seconds,
          totalPoints: points,
        })
      }
      continue
    }

    counts[`${best.job.item}|${best.rarity.name}`] = MILESTONES[best.index]
    xp += best.xpGained
    seconds += best.time
    points += best.pts
    steps.push({
      job: best.job,
      rarity: best.rarity.name,
      from: best.collected,
      milestone: MILESTONES[best.index],
      items: best.items,
      attempts: Math.ceil(best.run.attempts - 1e-9),
      burned: best.run.failed,
      xpGained: best.xpGained,
      points: best.pts,
      seconds: best.time,
      levelBefore: level,
      levelAfter: levelForXp(xp),
      totalSeconds: seconds,
      totalPoints: points,
    })
  }

  return { steps, points, seconds, endXp: xp, endLevel: levelForXp(xp), reachedTarget: xp >= targetXp }
}

// Craft the best Common item up to the next level (or the target). Awards any Common
// milestones the count passes, within the Common cap.
function levelUpStep(jobs, level, xp, targetXp, xpGain, have, maxMilestone) {
  const best = bestJob(jobs, level, xpGain)
  if (!best) return null
  const { job } = best
  const perItem = xpPerAction(job.xp, 1, xpGain)
  const levelEnd = Math.min(xpForLevel(level + 1), targetXp)
  const items = Math.ceil((levelEnd - xp) / perItem - 1e-9)
  const xpGained = items * perItem
  const run = walk(job, xp, xp + xpGained, perItem)
  const from = have(job.item, 'Common')
  const to = from + items
  let points = 0
  MILESTONES.forEach((m, i) => {
    if (m > from && m <= to && i <= (maxMilestone.Common ?? -1)) points += milestonePoints(i, 'Common')
  })
  return {
    levelling: true,
    job,
    rarity: 'Common',
    from,
    milestone: to,
    items,
    attempts: Math.ceil(run.attempts - 1e-9),
    burned: run.failed,
    xpGained,
    points,
    seconds: run.attempts * job.time,
    counts: { [`${job.item}|Common`]: to },
  }
}
