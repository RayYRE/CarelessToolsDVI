import { levelForXp } from '../core/xp.js'
import { hasLogItem, itemName } from '../game/collection.js'
import { JOBS, isGathering } from '../game/jobs.js'
import { RARITIES } from '../game/rarities.js'
import { RECIPES, materialsFor } from '../game/recipes.js'
import { skillXpGain } from '../profile/xpGain.js'
import { tierStep } from '../collection/plan.js'

// Draft of the Cheapest Clog maths. Prices are { items: { item: { Rarity: [ask, bid, avg7d, avg30d] } } }
// where ask is the lowest sell order, bid the highest buy order, and 0 (or missing) means no price.

// Which price buying a material is costed at
export const PRICE_MODES = [
  { id: 'ask', label: 'Ask', hint: 'Lowest sell order: buy now', index: 0 },
  { id: 'bid', label: 'Bid', hint: 'Highest buy order: list an order and wait', index: 1 },
  { id: 'avg7d', label: '7 day average', hint: 'Average trade price over 7 days', index: 2 },
  { id: 'avg30d', label: '30 day average', hint: 'Average trade price over 30 days', index: 3 },
]

// Market fee on a sale, in basis points (3%). An import carries the game's own figure, which wins.
export const MARKET_FEE_BP = 300

// Selling the crafted items: off, or one of the same prices (ask = list at the lowest sell order,
// bid = sell now to the highest buy order)
export const SELL_MODES = [
  { id: 'off', label: "Don't sell", hint: 'Count only what the materials cost' },
  ...PRICE_MODES,
]

const priceOf = (prices, item, rarity, mode) =>
  prices.items[item]?.[rarity]?.[PRICE_MODES.find((m) => m.id === mode)?.index ?? 0] || null

// Whether materials are bought, made from their own recipe, or whichever costs less
export const CRAFT_MODES = [
  { id: 'cheapest', label: 'Buy or craft, cheapest', hint: 'Make a material from its recipe when that costs less than buying it' },
  { id: 'buy', label: 'Buy only', hint: 'Always buy from the market; craft only when nobody is selling it at the chosen price' },
  { id: 'make', label: 'Craft only', hint: 'Always make from the recipe when there is one: the cost from raw materials' },
]

// What one unit of an item costs, buying it at the chosen price or making it from its own recipe
// (a Steel bar can be bought, or smelted from Iron and Coal), as `craft` allows.
// Returns { cost, how: 'buy' | 'make', noPrice } or null when it can't be had. `noPrice` is true when
// the item (or something it is made from) has no market price in this mode, so its craft price is
// used instead. `seen` stops recipe loops.
export function unitCost(prices, item, rarity, mode = 'ask', craft = 'cheapest', seen = new Set()) {
  const id = `${item}|${rarity}`
  if (seen.has(id)) return null
  const buy = priceOf(prices, item, rarity, mode)
  let make = null
  let makeNoPrice = false
  // Buy only still crafts when there is nothing to buy
  if (RECIPES[item] && (craft !== 'buy' || buy === null)) {
    seen.add(id)
    let total = 0
    for (const m of materialsFor(item, 1, rarity)) {
      const part = unitCost(prices, m.material, m.rarity, mode, craft, seen)
      if (!part) {
        total = null
        break
      }
      total += part.cost * m.quantity
      makeNoPrice ||= part.noPrice
    }
    seen.delete(id)
    make = total
  }
  if (craft === 'make' && make !== null) return { cost: make, how: 'make', noPrice: makeNoPrice }
  if (buy !== null && (make === null || buy <= make)) return { cost: buy, how: 'buy', noPrice: false }
  if (make === null) return null
  return { cost: make, how: 'make', noPrice: buy === null || makeNoPrice }
}

// Every processing tier up to `upTo` (a milestone such as 1000; null = just the next tier),
// priced from the market (less what the crafted items sell for, if selling is on) and ranked by
// profit per point, best first. Each tier of an item is its own row, starting where the one
// before it ends. Gathering uses no materials, so it isn't priced here (its cost is time).
export function cheapestSteps({ profile, mode = 'ask', craft = 'cheapest', sell = 'off', upTo = null, rarities = RARITIES }) {
  const prices = profile.prices ?? { items: {} }
  // Selling pays the market fee
  const feeBp = prices.taxBp ?? MARKET_FEE_BP
  const keep = 1 - feeBp / 10000
  // One unit's cost doesn't depend on how many are bought, so work each out once
  const unitCache = new Map()
  const unitOf = (material, rarity) => {
    const key = `${material}|${rarity}`
    if (!unitCache.has(key)) unitCache.set(key, unitCost(prices, material, rarity, mode, craft))
    return unitCache.get(key)
  }
  const rows = []
  for (const job of JOBS) {
    if (isGathering(job.skill) || !hasLogItem(job) || !RECIPES[job.name]) continue
    const startXp = profile.skillXp[job.skill] ?? 0
    if (job.level > levelForXp(startXp)) continue
    const xpGain = skillXpGain(profile, job.skill)
    const speed = profile.speed[job.skill] ?? 0
    const item = itemName(job)
    for (const rarity of rarities) {
      let collected = profile.collection[item]?.[rarity.name] ?? 0
      // XP carries from tier to tier, so later tiers burn less
      let xp = startXp
      for (;;) {
        const step = tierStep(job, rarity, collected, xp, xpGain, speed)
        if (step.done || (upTo !== null && step.to > upTo)) break
        collected = step.to
        xp += step.xpGained
        const row = priceStep(step)
        if (row) rows.push(row)
        if (upTo === null) break
      }

      // Materials are priced one unit at a time, so a big step is only as accurate as the quote
      function priceStep(step) {
        if (!step.points) return null
        let cost = 0
        const parts = []
        for (const m of step.materials) {
          const unit = unitOf(m.material, m.rarity)
          if (!unit) return null
          cost += unit.cost * m.quantity
          parts.push({ ...m, unit: unit.cost, how: unit.how, noPrice: unit.noPrice })
        }
        // Every item crafted can be sold; with no price in this mode the sale just isn't counted
        const unitSale = sell === 'off' ? null : priceOf(prices, item, rarity.name, sell)
        const revenue = unitSale ? unitSale * keep * step.items : 0
        const profit = revenue - cost
        return {
          job: job.name,
          item,
          skill: job.skill,
          rarity: rarity.name,
          from: step.from,
          to: step.to,
          points: step.points,
          seconds: step.seconds,
          cost,
          items: step.items,
          attempts: step.attempts,
          xpGained: step.xpGained,
          unitSale,
          taxBp: feeBp,
          revenue,
          // What the sale leaves after the materials: negative when the materials cost more
          profit,
          noSale: sell !== 'off' && !unitSale,
          perPoint: profit / step.points,
          parts,
        }
      }
    }
  }
  return rows.sort((a, b) => b.perPoint - a.perPoint)
}
