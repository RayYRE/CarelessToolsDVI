import { SKILL_GROUPS } from '../game/jobs.js'
import { rarityFromGameName } from '../game/rarities.js'
import { MISSING_XP_SOURCES } from '../profile/xpGain.js'

const ALL_SKILLS = [...SKILL_GROUPS.Gathering, ...SKILL_GROUPS.Processing]

// Labels that end the list of XP gain sources on the stats screen
const NOT_AN_XP_SOURCE =
  /^(luck\b|rare-find|max hit|attack speed|move speed|food healing|enhance odds)|speed$/i

// Split the pasted stats into [label, value] pairs. Labels and values may be on the same
// line ("XP gain +71%") or on separate lines ("XP gain" then "+71%").
function statPairs(text) {
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
  const skillXp = {}
  for (const [name, value] of Object.entries(data?.skills ?? {})) {
    const skill = matchSkill(name)
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

const matchSkill = (name) => ALL_SKILLS.find((s) => s.toLowerCase() === name.toLowerCase())
