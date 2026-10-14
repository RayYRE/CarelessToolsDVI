import { xpSourceScope } from '../game/xpSources.js'

// The stats screen's XP gain total includes sources that only boost some skills
// (e.g. Home (combat), Gatherer's brew). Returns the sources that don't apply to `skill`.
export function xpGainDeductions(profile, skill) {
  return (profile.xpGainSources ?? []).filter((s) => !xpSourceScope(s.label).applies(skill))
}

// XP gain (%) that actually applies to `skill`
export function skillXpGain(profile, skill) {
  return xpGainDeductions(profile, skill).reduce((gain, s) => gain - s.value, profile.xpGain)
}

// Without the source lines we can't tell which parts of the total apply to which skills
export const hasXpSources = (profile) => (profile.xpGainSources ?? []).length > 0

export const MISSING_XP_SOURCES =
  'XP gain sources are missing. On the stats page, click "XP gain" under Your ' +
  'bonuses, then copy and import again. Until then the XP gain may include bonuses that ' +
  "don't apply to these skills (e.g. Home (combat)), so results won't be accurate."
