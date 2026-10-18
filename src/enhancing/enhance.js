// Game rules, written as named constants
const BASE_CHANCE_FLOOR = 0.2 // chance never drops below 20%
const CHANCE_LOST_PER_LEVEL = 0.06 // each + costs 6% base chance
// Sources of "Enhance odds" on the stats screen (%). They multiply, not add: Home +13%,
// Enhancing level +9.4% and Masteries +0.25% show as +24% in game (1.13 × 1.094 × 1.0025)
const ODDS_PER_ENHANCING_LEVEL = 0.2 // per Enhancing level above 1
const ODDS_PER_LECTERN_LEVEL = 1 // per Rune lectern level (shown as "Home")
const ODDS_PER_MASTERY_POINT = 0.25 // per Enhancing mastery point
const VOIDSHARDS_PER_STEP = 3 // attempt costs 3 × (N + 1) Voidshards
const MAX_ATTEMPTS_PER_RUN = 1e6 // safety stop for simulated runs
const SIMULATION_RUNS = 10000

// Chance before any bonuses, when going from +level to +(level + 1)
export const baseChance = (level) => Math.max(BASE_CHANCE_FLOOR, 1 - level * CHANCE_LOST_PER_LEVEL)

// Enhance odds (%) split into its sources, matching the stats screen
export const enhanceOddsSources = (user) => ({
  Home: ODDS_PER_LECTERN_LEVEL * user.lecternLevel,
  'Enhancing level': ODDS_PER_ENHANCING_LEVEL * (user.enhancingLevel - 1),
  Masteries: ODDS_PER_MASTERY_POINT * user.masteryPoints,
})

// Total Enhance odds (%)
export const enhanceOdds = (user) =>
  (Object.values(enhanceOddsSources(user)).reduce((total, value) => total * (1 + value / 100), 1) -
    1) *
  100

// Chance with the Enhance odds bonus applied
export const successChance = (level, user) =>
  Math.min(1, baseChance(level) * (1 + enhanceOdds(user) / 100))

export const coinCost = (level, user) => user.tierPrice * user.rarityMultiplier * (level + 1)

export const voidshardCost = (level) => VOIDSHARDS_PER_STEP * (level + 1)

// Where the piece lands after a failed attempt
const levelAfterMiss = (level, user) =>
  user.protectionOn && level >= user.protectionThreshold ? level - 1 : 0

const usesScrollOnMiss = (level, user) => user.protectionOn && level >= user.protectionThreshold

// Expected totals from every starting +, as { attempts, coins, voidshards, scrolls }
export function solveExpectedCosts(user) {
  const target = user.target
  const matrix = []
  const costs = []

  for (let level = 0; level < target; level++) {
    const row = new Array(target).fill(0)
    const pSuccess = successChance(level, user)
    const pMiss = 1 - pSuccess

    row[level] += 1
    if (level + 1 < target) row[level + 1] -= pSuccess
    row[levelAfterMiss(level, user)] -= pMiss

    matrix.push(row)
    costs.push([
      1,
      coinCost(level, user),
      voidshardCost(level),
      usesScrollOnMiss(level, user) ? pMiss : 0,
    ])
  }

  // Gauss–Jordan elimination
  for (let col = 0; col < target; col++) {
    let pivot = col
    for (let row = col + 1; row < target; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row
    }
    ;[matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]]
    ;[costs[col], costs[pivot]] = [costs[pivot], costs[col]]

    for (let row = 0; row < target; row++) {
      if (row === col) continue
      const factor = matrix[row][col] / matrix[col][col]
      if (!factor) continue
      for (let j = col; j < target; j++) matrix[row][j] -= factor * matrix[col][j]
      for (let j = 0; j < 4; j++) costs[row][j] -= factor * costs[col][j]
    }
  }

  return costs.map((cost, level) => {
    const divisor = matrix[level][level]
    return {
      attempts: cost[0] / divisor,
      coins: cost[1] / divisor,
      voidshards: cost[2] / divisor,
      scrolls: cost[3] / divisor,
    }
  })
}

export function simulateRuns(
  user,
  { coinBudget = Infinity, voidshardBudget = Infinity, scrollBudget = Infinity },
  runCount = SIMULATION_RUNS,
) {
  let reachedTarget = 0,
    stoppedNoFunds = 0,
    stoppedNoScrolls = 0
  const attempts = [],
    coins = [],
    voidshards = [],
    scrolls = []

  for (let run = 0; run < runCount; run++) {
    let level = user.start
    let attemptsUsed = 0,
      coinsSpent = 0,
      voidshardsSpent = 0,
      scrollsUsed = 0

    while (attemptsUsed < MAX_ATTEMPTS_PER_RUN) {
      if (level >= user.target) {
        reachedTarget++
        break
      }

      const nextCoins = coinCost(level, user)
      const nextVoidshards = voidshardCost(level)
      if (
        coinsSpent + nextCoins > coinBudget ||
        voidshardsSpent + nextVoidshards > voidshardBudget
      ) {
        stoppedNoFunds++
        break
      }

      coinsSpent += nextCoins
      voidshardsSpent += nextVoidshards
      attemptsUsed++

      if (Math.random() < successChance(level, user)) {
        level++
      } else if (usesScrollOnMiss(level, user)) {
        if (scrollsUsed >= scrollBudget) {
          stoppedNoScrolls++
          break
        }
        scrollsUsed++
        level--
      } else {
        level = 0
      }
    }

    attempts.push(attemptsUsed)
    coins.push(coinsSpent)
    voidshards.push(voidshardsSpent)
    scrolls.push(scrollsUsed)
  }

  // Unsorted, one entry per run, so costs that combine several totals can be worked out per run
  const runs = attempts.map((_, i) => ({
    attempts: attempts[i],
    coins: coins[i],
    voidshards: voidshards[i],
    scrolls: scrolls[i],
  }))

  ;[attempts, coins, voidshards, scrolls].forEach((list) => list.sort((a, b) => a - b))
  return {
    runCount,
    reachedTarget,
    stoppedNoFunds,
    stoppedNoScrolls,
    runs,
    attempts,
    coins,
    voidshards,
    scrolls,
  }
}

// Expected totals from user.start for every protect-at choice, plus a no-protection row.
// Protecting at or above the target never uses a scroll, so those are covered by the no-protection row.
export function compareProtectLevels(user, minThreshold) {
  const rows = [
    { protectAt: null, ...solveExpectedCosts({ ...user, protectionOn: false })[user.start] },
  ]
  for (let protectAt = minThreshold; protectAt < user.target; protectAt++) {
    const config = { ...user, protectionOn: true, protectionThreshold: protectAt }
    rows.push({ protectAt, ...solveExpectedCosts(config)[user.start] })
  }
  return rows
}
