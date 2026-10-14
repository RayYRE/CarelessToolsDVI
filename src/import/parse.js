import { SKILL_GROUPS } from '../game/jobs.js'
import { rarityFromGameName } from '../game/rarities.js'

const ALL_SKILLS = [...SKILL_GROUPS.Gathering, ...SKILL_GROUPS.Processing]

// Parse the in-game stats screen ("Your bonuses") that players copy and paste.
// Labels and values may be on the same line or on separate lines, e.g.
//   XP gain
//   +71%
// Returns only the fields it found, ready to merge into settings.
export function parseStats(text) {
  const result = { luck: {}, speed: {} }
  const found = []
  const re = /(XP gain|Luck in ([A-Za-z]+)|Luck elsewhere|Rare-find|([A-Za-z]+) speed)\s*([+-]?\d+(?:\.\d+)?)\s*%/gi

  for (const [, label, luckSkill, speedSkill, value] of text.matchAll(re)) {
    const v = Number(value)
    const lower = label.toLowerCase()
    if (lower === 'xp gain') {
      result.xpGain = v
      found.push(`XP gain ${v}%`)
    } else if (lower === 'rare-find') {
      result.rareFind = v
      found.push(`Rare-find ${v}%`)
    } else if (lower === 'luck elsewhere') {
      result.luckElsewhere = v
    } else if (luckSkill) {
      const skill = matchSkill(luckSkill)
      if (skill) result.luck[skill] = v
    } else if (speedSkill) {
      const skill = matchSkill(speedSkill)
      if (skill) result.speed[skill] = v
    }
  }

  // "Luck elsewhere" covers every gathering skill not listed on its own
  if (result.luckElsewhere !== undefined) {
    for (const s of SKILL_GROUPS.Gathering) result.luck[s] ??= result.luckElsewhere
  }
  delete result.luckElsewhere

  const luckCount = Object.keys(result.luck).length
  const speedCount = Object.keys(result.speed).length
  if (luckCount) found.push(`luck for ${luckCount} skills`)
  if (speedCount) found.push(`speed for ${speedCount} skills`)
  if (!luckCount) delete result.luck
  if (!speedCount) delete result.speed

  return { settings: result, found }
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
