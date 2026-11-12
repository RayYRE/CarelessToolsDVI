import { itemNameById } from '../game/itemNames.js'
import { RARITIES, rarityFromGameName } from '../game/rarities.js'
import { ALL_SKILLS, matchSkill, parseStats } from './stats.js'

// The stats parser lives in stats.js; re-exported for the import panel
export { parseStats }

// The export also holds Enhancing XP, used by the Enhancing tab
const EXPORT_SKILLS = [...ALL_SKILLS, 'Enhancing']

// Parse the game's JSON character export: skill XP and collection log counts.
// Returns { settings: { skillXp, collection }, found, error }.
export function parseExport(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return { settings: {}, found: [], error: 'Not valid JSON — paste the whole export.' }
  }
  // A userscript snapshot pasted by hand
  if (data?.player?.skills) return parseSnapshot(data)
  const skillXp = {}
  for (const [name, value] of Object.entries(data?.skills ?? {})) {
    const skill = matchSkill(name, EXPORT_SKILLS)
    const xp = Number(value?.xp)
    if (skill && Number.isFinite(xp)) skillXp[skill] = xp
  }
  // collection: { "Bronze bar": { Common: 228, Uncommon: 74 } }
  const collection = {}
  for (const entry of Array.isArray(data?.collection) ? data.collection : []) {
    const rarity = rarityFromGameName(entry?.rarity)
    const qty = Number(entry?.qty)
    if (!entry?.name || !rarity || !Number.isFinite(qty)) continue
    collection[entry.name] = { ...collection[entry.name], [rarity.name]: qty }
  }

  const count = Object.keys(skillXp).length
  if (!count) return { settings: {}, found: [], error: 'No skills found in this export.' }
  const who = data.character?.name ? ` for ${data.character.name}` : ''
  const found = [`XP for ${count} skills${who}`]
  const settings = { skillXp }
  const items = Object.keys(collection).length
  if (items) {
    found.push(`collection log (${items} items)`)
    settings.collection = collection
  }
  return { settings, found }
}

// Parse the snapshot from the "Character import" userscript: { player: { skills, house, collections } }.
// Skills are plain XP numbers; collections are keyed by item ID, where ID = base ID + 1000 × rarity
// (4 = Silver, 1004 = Uncommon Silver, 4004 = Legendary Silver).
// Returns { settings: { skillXp, collection, lecternLevel, enhanceMastery }, found, error }.
// Everything you own across storage, as { "Iron bar": { Common: 120, Uncommon: 4 } }.
// Item IDs are base ID + 1000 × rarity; gear with a + level adds 10,000 per level and is
// skipped, since it's never a crafting material.
function inventoryFrom(player) {
  const items = {}
  const add = (id, qty) => {
    id = Number(id)
    if (!Number.isFinite(qty) || qty <= 0 || !(id < 10000)) return
    const rarity = RARITIES[Math.floor(id / 1000)]
    const name = itemNameById(id % 1000)
    if (!rarity || !name) return
    items[name] = { ...items[name], [rarity.name]: (items[name]?.[rarity.name] ?? 0) + qty }
  }
  const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v)
  for (const store of [player.bank, player.overflow, player.homeBank]) {
    if (isMap(store)) for (const [id, qty] of Object.entries(store)) add(id, qty)
  }
  for (const slot of Array.isArray(player.pack) ? player.pack : []) add(slot?.itemId, slot?.qty)
  return items
}

function parsePlayer(player) {
  const skillXp = {}
  for (const [name, xp] of Object.entries(player?.skills ?? {})) {
    const skill = matchSkill(name, EXPORT_SKILLS)
    if (skill && Number.isFinite(xp)) skillXp[skill] = xp
  }
  const count = Object.keys(skillXp).length
  if (!count) return { settings: {}, found: [], error: 'No skills found in this snapshot.' }

  const collection = {}
  for (const [id, qty] of Object.entries(player.collections ?? {})) {
    const rarity = RARITIES[Math.floor(id / 1000)]
    const name = itemNameById(id % 1000)
    if (!rarity || !name || !Number.isFinite(qty)) continue
    collection[name] = { ...collection[name], [rarity.name]: qty }
  }

  const settings = { skillXp }
  const found = [`XP for ${count} skills`]
  const items = Object.keys(collection).length
  if (items) {
    settings.collection = collection
    found.push(`collection log (${items} items)`)
  }
  // Older userscript versions don't send storage; leave the saved inventory alone then
  if (player.bank || player.pack) {
    const inventory = inventoryFrom(player)
    // Wrapped so an import replaces the whole inventory (imports merge maps key by key)
    settings.inventory = { items: inventory }
    found.push(`storage (${Object.keys(inventory).length} items)`)
  }
  const lectern = player.house?.lectern
  if (Number.isFinite(lectern)) {
    settings.lecternLevel = lectern
    found.push(`Rune lectern level ${lectern}`)
  }
  // Missing until the first point is spent, so a missing key means 0
  const enhanceMastery = player.masteries?.enhance ?? 0
  if (Number.isFinite(enhanceMastery)) {
    settings.enhanceMastery = enhanceMastery
    found.push(`${enhanceMastery} Enhancing mastery points`)
  }
  return { settings, found }
}

// A whole userscript snapshot: the player, plus the "Your bonuses" stats HTML that the
// Careless Tools userscript adds as stats: { html, capturedAt } (the dvi-lab script has none)
export function parseSnapshot(snapshot) {
  const player = parsePlayer(snapshot?.player)
  const stats = snapshot?.stats?.html ? parseStats(snapshot.stats.html) : null
  const prices = pricesFrom(snapshot?.prices)
  if (!stats?.found.length && !prices) return player
  return {
    settings: { ...player.settings, ...stats?.settings, ...(prices && { prices }) },
    found: [
      ...player.found,
      ...(stats?.found ?? []),
      ...(prices ? [`market prices (${Object.keys(prices.items).length} items, ${prices.source})`] : []),
    ],
    warning: stats?.warning,
    // Only an error when no part had anything
    error: player.found.length || prices ? undefined : player.error,
  }
}

// Market prices from the userscript: { items: { itemId: [ask, bid, volume] }, taxBp, capturedAt,
// source }. Returned by item name and rarity like the inventory: { "Iron bar": { Common: [ask, bid] } },
// where 0 means no orders. Gear with a + level (ID 10,000 and up) is skipped.
// Wrapped in `items` so an import replaces every price (imports merge maps key by key).
function pricesFrom(prices) {
  if (!prices?.items || typeof prices.items !== 'object') return null
  const items = {}
  for (const [id, entry] of Object.entries(prices.items)) {
    const rarity = RARITIES[Math.floor(id / 1000)]
    const name = itemNameById(id % 1000)
    if (!(id < 10000) || !rarity || !name || !Array.isArray(entry)) continue
    items[name] = { ...items[name], [rarity.name]: [entry[0] || 0, entry[1] || 0] }
  }
  if (!Object.keys(items).length) return null
  return {
    items,
    taxBp: Number.isFinite(prices.taxBp) ? prices.taxBp : 0,
    capturedAt: prices.capturedAt ?? null,
    source: prices.source ?? 'feed',
  }
}

