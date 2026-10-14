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

// Name of the item a job produces, as it appears in the collection log
export const itemName = (job) =>
  job.skill === 'Cooking' ? job.name.replace(/^Cook /, 'Cooked ') : job.name
