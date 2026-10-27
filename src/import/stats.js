import { SKILL_GROUPS } from '../game/jobs.js'
import { MISSING_XP_SOURCES } from '../profile/xpGain.js'

// Parsing the stats screen's "Your bonuses". Kept apart from parse.js (no item icons) so the
// profit userscript can use it too.

export const ALL_SKILLS = [...SKILL_GROUPS.Gathering, ...SKILL_GROUPS.Processing]

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

export const matchSkill = (name, skills = ALL_SKILLS) =>
  skills.find((s) => s.toLowerCase() === name.toLowerCase())
