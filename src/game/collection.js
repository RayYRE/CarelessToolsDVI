import { RARITIES } from './rarities.js'

// Collection log: each item/rarity pays points when its collected count hits a milestone
export const MILESTONES = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7]
// Points for a Common (Normal) item; other rarities multiply by their `points`
const BASE_POINTS = [1, 1, 3, 10, 35, 120, 420, 1500]

export function milestonePoints(index, rarityName) {
  return BASE_POINTS[index] * (RARITIES.find((r) => r.name === rarityName)?.points ?? 1)
}

// Index of the next milestone above `collected`, or -1 if all are done
export const nextMilestoneIndex = (collected) => MILESTONES.findIndex((m) => m > collected)

export const formatMilestone = (n) => (n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}k` : `${n}`)

// Thieving cloth jobs and the bolt each one steals
const BOLTS = {
  'Linen line': 'Homespun bolt',
  'Silk cart': 'Silk bolt',
  'Gilded loom': 'Gilded bolt',
  'Reliquary vestry': 'Voidweave bolt',
}

// Name of the item a job produces, as it appears in the collection log
export function itemName(job) {
  if (job.skill === 'Cooking') return job.name.replace(/^Cook /, 'Cooked ')
  if (job.skill === 'Woodcutting') return job.name === 'Tree' ? 'Logs' : `${job.name} logs`
  return BOLTS[job.name] ?? job.name
}

// Highest milestone at or below `count` (0 if none): the tier a count has reached
export const milestoneReached = (count) => MILESTONES.findLast((m) => m <= count) ?? 0

// Jobs with their own collection log entry. Thieving stalls pay coins, not a logged item.
export const hasLogItem = (job) => !job.stall

// Points from every milestone passed going from `before` to `after` collected
export function pointsBetween(before, after, rarityName) {
  let points = 0
  MILESTONES.forEach((m, i) => {
    if (before < m && after >= m) points += milestonePoints(i, rarityName)
  })
  return points
}
