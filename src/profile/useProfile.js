import { useCallback } from 'react'
import { readStorage, usePersistentState } from '../core/storage.js'

// The player's own numbers, shared by every tool and filled by the imports
const DEFAULT_PROFILE = {
  xpGain: 95,
  rareFind: 0,
  // Per-skill maps, e.g. { Mining: 8171 }
  skillXp: {},
  luck: {},
  speed: {},
  // Collection log counts: { "Bronze bar": { Common: 228, Uncommon: 74 } }
  collection: {},
}

// Before the profile existed these lived in the XP calculator's settings
function migrateFromXpCalc() {
  const old = readStorage('xp-calc-settings')
  if (!old) return null
  const { xpGain, rareFind, skillXp, luck, speed } = old
  return Object.fromEntries(
    Object.entries({ xpGain, rareFind, skillXp, luck, speed }).filter(([, v]) => v !== undefined),
  )
}

export function useProfile() {
  const [profile, setProfile, setRaw] = usePersistentState(
    'dvi-profile',
    DEFAULT_PROFILE,
    migrateFromXpCalc,
  )

  // Imports merge per-key maps (luck, speed, skillXp, collection) instead of replacing them
  const mergeImport = useCallback(
    (patch) =>
      setRaw((s) => {
        const next = { ...s }
        for (const [key, value] of Object.entries(patch)) {
          next[key] = value && typeof value === 'object' ? { ...s[key], ...value } : value
        }
        return next
      }),
    [setRaw],
  )

  return { profile, setProfile, mergeImport }
}
