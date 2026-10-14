import { RARITIES } from '../data/jobs.js'
import { MAX_LEVEL, TOTAL_XP } from '../data/levels.js'

export function clampLevel(level) {
  return Math.min(Math.max(Math.floor(level) || 1, 1), MAX_LEVEL)
}

export function xpForLevel(level) {
  return TOTAL_XP[clampLevel(level)]
}

export function levelForXp(xp) {
  let level = 1
  while (level < MAX_LEVEL && TOTAL_XP[level + 1] <= xp) level++
  return level
}

// XP per attempt after the rarity multiplier and the % XP gain bonus
export function xpPerAction(baseXp, rarityMultiplier, xpGainPercent) {
  return baseXp * rarityMultiplier * (1 + xpGainPercent / 100)
}

// Odds = base × (1 + luck) × (1 + rare-find). Luck = tool + amulet, rare-find = everything else.
export function oddsMultiplier(toolLuck, amuletLuckPercent, rareFindPercent) {
  return (1 + toolLuck + amuletLuckPercent / 100) * (1 + rareFindPercent / 100)
}

// Chance per action of each exact rarity. Base odds are "this tier or better",
// so a tier's chance is its cumulative chance minus the next tier's.
export function rarityChances(odds) {
  const atLeast = RARITIES.map((r) => Math.min(1, odds / r.oneIn))
  return RARITIES.map((r, i) => ({ ...r, chance: atLeast[i] - (atLeast[i + 1] ?? 0) }))
}

// Average XP multiplier per action across the rarity chances
export function expectedMultiplier(chances) {
  return chances.reduce((sum, r) => sum + r.chance * r.multiplier, 0)
}

// Chance (0–1) that an attempt fails (burn / caught) at a given level.
// Falls linearly from fail.chance at the job's level to 0 at fail.never.
export function failChance(job, level) {
  const f = job.fail
  if (!f || level >= f.never) return 0
  if (level <= job.level) return f.chance / 100
  return ((f.chance / 100) * (f.never - level)) / (f.never - job.level)
}

// Expected attempts to earn XP from startXp up to targetXp, recalculating the
// fail chance at every level-up. Stops early after maxAttempts if given.
function walk(job, startXp, targetXp, xpPerSuccess, maxAttempts = Infinity) {
  let xp = startXp
  let attempts = 0
  let failed = 0
  if (xpPerSuccess <= 0) return { xp, attempts, failed }
  while (xp < targetXp && attempts < maxAttempts) {
    const level = levelForXp(xp)
    const success = 1 - failChance(job, level)
    const levelEnd = Math.min(level < MAX_LEVEL ? TOTAL_XP[level + 1] : Infinity, targetXp)
    const xpPerAttempt = xpPerSuccess * success
    const toLevelEnd = (levelEnd - xp) / xpPerAttempt
    const n = Math.min(toLevelEnd, maxAttempts - attempts)
    attempts += n
    failed += n * (1 - success)
    // Snap to the boundary to avoid floating-point creep
    xp = n === toLevelEnd ? levelEnd : xp + n * xpPerAttempt
  }
  return { xp, attempts, failed }
}

const roundUp = (n) => Math.ceil(n - 1e-9)

function finishPlan(job, startXp, attempts, failed, endXp, extra = {}) {
  const actions = roundUp(attempts)
  return {
    ...extra,
    actions,
    failed,
    xpGained: Math.max(0, endXp - startXp),
    seconds: actions * job.time + failed * (job.fail?.stun ?? 0),
  }
}

// Gathering: every attempt earns the same average XP (luck already folded into xpPerSuccess)
export function gatheringPlan(job, currentXp, targetXp, xpPerSuccess) {
  const w = walk(job, currentXp, targetXp, xpPerSuccess)
  return finishPlan(job, currentXp, w.attempts, w.failed, w.xp)
}

// Processing: fixed numbers of rarer attempts first, then Common attempts for the rest
export function fixedCountPlan(job, currentXp, targetXp, xpGainPercent, counts) {
  let xp = currentXp
  let fixedActions = 0
  let failed = 0
  for (const r of RARITIES.slice(1)) {
    const n = Math.max(0, Math.floor(counts[r.name] || 0))
    if (!n) continue
    const w = walk(job, xp, Infinity, xpPerAction(job.xp, r.multiplier, xpGainPercent), n)
    xp = w.xp
    failed += w.failed
    fixedActions += n
  }
  const fixedXp = xp - currentXp
  const w = walk(job, xp, targetXp, xpPerAction(job.xp, 1, xpGainPercent))
  const commonActions = roundUp(w.attempts)
  return finishPlan(job, currentXp, fixedActions + commonActions, failed + w.failed, Math.max(xp, w.xp), {
    fixedActions,
    fixedXp,
    commonActions,
  })
}

export function formatDuration(totalSeconds) {
  if (!isFinite(totalSeconds) || totalSeconds <= 0) return '0s'
  const s = Math.round(totalSeconds)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts = []
  if (d) parts.push(`${d.toLocaleString()}d`)
  if (h) parts.push(`${h}h`)
  if (m && !d) parts.push(`${m}m`)
  if (sec && !d && !h) parts.push(`${sec}s`)
  return parts.join(' ')
}

export const fmt = (n) => Math.round(n).toLocaleString()
