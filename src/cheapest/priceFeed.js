import { useEffect, useState } from 'react'
import { rarityFromGameName } from '../game/rarities.js'

// The game's public price feed (refreshed every 5 minutes, open to any site)
const FEED_URL = 'https://deepveinidle.com/api/market/prices.json'

// Like the imported prices, plus the averages: { items: { "Iron bar": { Common: [ask, bid, avg7d, avg30d] } }, taxBp,
// capturedAt, source }. Gear with a + level is skipped.
function parseFeed(feed) {
  const items = {}
  for (const entry of Object.values(feed?.items ?? {})) {
    const rarity = rarityFromGameName(entry?.rarity)
    if (!rarity || entry.plus || !entry.name) continue
    items[entry.name] = { ...items[entry.name], [rarity.name]: [entry.lowestSell || 0, entry.highestBuy || 0, entry.avg7d || 0, entry.avg30d || 0] }
  }
  return { items, taxBp: 0, capturedAt: Date.parse(feed?.generatedAt) || Date.now(), source: 'feed' }
}

// Imported prices (live from the market: ask and bid) with the feed's averages added, so every
// price mode works at once. Either may be missing; the imported entry wins for ask and bid.
export function mergePrices(imported, feed) {
  if (!feed) return imported
  if (!imported) return feed
  const items = {}
  for (const [name, byRarity] of Object.entries(feed.items)) {
    items[name] = {}
    for (const [rarity, f] of Object.entries(byRarity)) {
      const i = imported.items[name]?.[rarity]
      items[name][rarity] = i ? [i[0], i[1], f[2], f[3]] : f
    }
  }
  // Items only the import knows keep their ask and bid
  for (const [name, byRarity] of Object.entries(imported.items)) {
    for (const [rarity, i] of Object.entries(byRarity)) {
      if (!items[name]?.[rarity]) items[name] = { ...items[name], [rarity]: [i[0], i[1], 0, 0] }
    }
  }
  return { ...imported, items }
}

// Prices from the public feed, loaded once while `enabled`. It is the only source of the averages.
// Returns { prices, error }. Kept in memory only: the feed is large and always fresh.
export function useFeedPrices(enabled) {
  const [state, setState] = useState({ prices: null, error: null })

  useEffect(() => {
    if (!enabled || state.prices) return
    let cancelled = false
    fetch(FEED_URL)
      .then((response) => {
        if (!response.ok) throw Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((feed) => !cancelled && setState({ prices: parseFeed(feed), error: null }))
      .catch((error) => !cancelled && setState({ prices: null, error: error.message }))
    return () => {
      cancelled = true
    }
  }, [enabled, state.prices])

  return state
}
