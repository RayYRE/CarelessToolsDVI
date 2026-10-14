import { isGathering } from './jobs.js'

// Which skills each XP gain source on the stats screen boosts, matched by its label.
// Sources not listed here boost every skill.
const SCOPES = [
  { match: /^home\b|\(combat\)/i, appliesTo: 'combat only', applies: () => false },
  { match: /^gatherer/i, appliesTo: 'gathering skills', applies: (skill) => isGathering(skill) },
]

const ALL = { appliesTo: 'all skills', applies: () => true }

export const xpSourceScope = (label) => SCOPES.find((s) => s.match.test(label)) ?? ALL
