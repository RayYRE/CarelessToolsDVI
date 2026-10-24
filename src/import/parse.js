import { SKILL_GROUPS } from '../game/jobs.js'
import { itemNameById } from '../game/itemNames.js'
import { RARITIES, rarityFromGameName } from '../game/rarities.js'
import { MISSING_XP_SOURCES } from '../profile/xpGain.js'

const ALL_SKILLS = [...SKILL_GROUPS.Gathering, ...SKILL_GROUPS.Processing]
// The export also holds Enhancing XP, used by the Enhancing tab
const EXPORT_SKILLS = [...ALL_SKILLS, 'Enhancing']

// Labels that end the list of XP gain sources on the stats screen
const NOT_AN_XP_SOURCE =
  /^(luck\b|rare-find|max hit|attack speed|move speed|food healing|enhance odds)|speed$/i

// The stats screen's HTML ("Your bonuses" .stats-group): each bonus has a head
// (<span>label</span><b>+71%</b>) followed by its sources (<span>label<b>+15%</b></span>)
function htmlPairs(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return [...doc.querySelectorAll('.stats-bonus-head, .stats-src > span')].flatMap((el) => {
    const valueEl = el.querySelector('b')
    if (!valueEl) return []
    const value = parseFloat(valueEl.textContent)
    const label = el.textContent.slice(0, -valueEl.textContent.length).trim()
    return label && Number.isFinite(value) ? [[label, value]] : []
  })
}

// Split the pasted stats into [label, value] pairs. Labels and values may be on the same
// line ("XP gain +71%") or on separate lines ("XP gain" then "+71%").
function statPairs(text) {
  if (text.trimStart().startsWith('<')) return htmlPairs(text)
  const pairs = []
  let label = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(.*?)\s*([+-]?\d+(?:\.\d+)?)\s*%$/)
    if (m && m[1]) pairs.push([m[1], Number(m[2])])
    else if (m && label) pairs.push([label, Number(m[2])])
    label = m ? null : line
  }
  return pairs
}

// Parse the in-game stats screen ("Your bonuses") that players copy and paste.
// The lines right after "XP gain" are its sources (Home (combat), Gatherer's brew, Guild...),
// which matter because some only boost certain skills.
// Returns only the fields it found, ready to merge into the profile.
export function parseStats(text) {
  const result = { luck: {}, speed: {} }
  const found = []
  let sources = null // collecting XP gain sources while not null
  let luckElsewhere

  for (const [label, v] of statPairs(text)) {
    const lower = label.toLowerCase()
    if (lower === 'xp gain') {
      result.xpGain = v
      sources = []
      continue
    }
    if (sources && !NOT_AN_XP_SOURCE.test(label)) {
      sources.push({ label, value: v })
      continue
    }
    if (sources) {
      result.xpGainSources = sources
      sources = null
    }

    if (lower === 'rare-find') {
      result.rareFind = v
    } else if (lower === 'luck elsewhere') {
      luckElsewhere = v
    } else if (lower.startsWith('luck in ')) {
      const skill = matchSkill(label.slice(8))
      if (skill) result.luck[skill] = v
    } else if (lower.endsWith(' speed')) {
      const skill = matchSkill(label.slice(0, -6))
      if (skill) result.speed[skill] = v
    }
  }
  if (sources) result.xpGainSources = sources

  // "Luck elsewhere" covers every gathering skill not listed on its own
  if (luckElsewhere !== undefined) {
    for (const s of SKILL_GROUPS.Gathering) result.luck[s] ??= luckElsewhere
  }

  if (result.xpGain !== undefined) {
    const n = result.xpGainSources?.length
    found.push(`XP gain ${result.xpGain}%${n ? ` (${n} sources)` : ''}`)
  }
  if (result.rareFind !== undefined) found.push(`Rare-find ${result.rareFind}%`)
  const luckCount = Object.keys(result.luck).length
  const speedCount = Object.keys(result.speed).length
  if (luckCount) found.push(`luck for ${luckCount} skills`)
  if (speedCount) found.push(`speed for ${speedCount} skills`)
  if (!luckCount) delete result.luck
  if (!speedCount) delete result.speed

  // XP gain without its source lines can't be split per skill, so ask for them
  const warning =
    result.xpGain !== undefined && !result.xpGainSources?.length ? MISSING_XP_SOURCES : undefined

  return { settings: result, found, warning }
}

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
  if (!stats?.found.length) return player
  return {
    settings: { ...player.settings, ...stats.settings },
    found: [...player.found, ...stats.found],
    warning: stats.warning,
    // Only an error when neither part had anything
    error: player.found.length ? undefined : player.error,
  }
}

const matchSkill = (name, skills = ALL_SKILLS) => skills.find((s) => s.toLowerCase() === name.toLowerCase())
