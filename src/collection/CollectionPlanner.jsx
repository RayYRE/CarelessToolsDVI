import { useMemo, useState } from 'react'
import IconSelect from '../components/IconSelect.jsx'
import XpInput from '../components/XpInput.jsx'
import { num } from '../core/format.js'
import { usePersistentState } from '../core/storage.js'
import { levelForXp, oddsMultiplier, rarityChances } from '../core/xp.js'
import { hasLogItem } from '../game/collection.js'
import { skillIcon } from '../game/icons.js'
import { JOBS, SKILL_GROUPS, isGathering } from '../game/jobs.js'
import { hasXpSources, skillXpGain } from '../profile/xpGain.js'
import CollectionLog from './CollectionLog.jsx'
import { maximisePoints, runPlan } from './plan.js'
import TierPlan from './TierPlan.jsx'

const DEFAULTS = {
  skill: 'Smithing',
}

// Stable empty plan so the memo below doesn't rerun every render
const NO_STEPS = []

export default function CollectionPlanner({ profile, setProfile }) {
  const [settings, set] = usePersistentState('collection-planner', DEFAULTS)
  const { skill, logGroups, plans } = settings
  const { skillXp, speed, collection, luck, rareFind } = profile
  // XP gain that applies to this skill (stats total minus bonuses for other skill types)
  const xpGain = skillXpGain(profile, skill)
  const currentXp = skillXp[skill] ?? 0
  const currentLevel = levelForXp(currentXp)
  const hasCollection = Object.keys(collection).length > 0

  const skillSpeed = speed[skill] ?? 0
  // Gathering rolls each item's rarity with luck instead of picking it
  const gathering = isGathering(skill)
  const odds = oddsMultiplier(luck[skill] ?? 0, rareFind)
  const chances = useMemo(() => rarityChances(odds), [odds])

  // Planned tier steps for this skill, in the order they were added
  const steps = plans?.[skill] ?? NO_STEPS
  const setSteps = (next) => set({ plans: { ...plans, [skill]: next } })
  const plan = useMemo(
    () => runPlan({ steps, startXp: currentXp, xpGain, speed: skillSpeed, collection, chances }),
    [steps, currentXp, xpGain, skillSpeed, collection, chances],
  )

  // Build the plan that earns the most points from what's in storage
  const inventory = profile.inventory?.items ?? {}
  const hasInventory = Object.keys(inventory).length > 0
  const [maximiseNote, setMaximiseNote] = useState(null)
  // Item levels and rarities switched off for the search, per skill
  const searchOff = settings.searchOff?.[skill] ?? {}
  const setSearchOff = (next) => set({ searchOff: { ...settings.searchOff, [skill]: next } })
  const jobLevels = [
    ...new Set(JOBS.filter((j) => j.skill === skill && hasLogItem(j)).map((j) => j.level)),
  ].sort(
    (a, b) => a - b,
  )
  const maximise = () => {
    if (steps.length && !window.confirm(`Replace your ${steps.length} planned steps?`)) return
    const best = maximisePoints({
      skill,
      startXp: currentXp,
      xpGain,
      speed: skillSpeed,
      collection,
      inventory,
      off: searchOff,
    })
    setSteps(best)
    setMaximiseNote(
      best.length
        ? `Planned ${best.length} steps using only what's in your storage.`
        : `Nothing in your storage completes a ${skill} tier with these settings.`,
    )
  }

  return (
    <>
      <section className="panel controls">
        <IconSelect
          label="Skill"
          value={skill}
          onChange={(s) => set({ skill: s })}
          options={Object.entries(SKILL_GROUPS).flatMap(([group, skills]) =>
            skills.map((s) => ({ value: s, label: s, icon: skillIcon(s), group })),
          )}
        />
        <label>
          XP gain (%)
          <input
            type="number"
            value={profile.xpGain}
            onChange={(e) => setProfile({ xpGain: num(e.target.value) })}
          />
          {hasXpSources(profile) || !profile.xpGain ? (
            <small className="hint-inline">
              {xpGain}% effective XP gain
            </small>
          ) : (
            <small className="hint-inline warn">
              Sources not imported, may be inaccurate. <a href="#import">Fix</a>
            </small>
          )}
        </label>
        <label>
          {skill} speed (%)
          <input
            type="number"
            min={0}
            value={skillSpeed}
            onChange={(e) => setProfile({ speed: { ...speed, [skill]: num(e.target.value) } })}
          />
        </label>
        {gathering && (
          <>
            <label title="Tool (Uncommon +25%, Rare +75%, Epic +200%, Legendary +500%) + amulet">
              Luck in {skill} (%)
              <input
                type="number"
                min={0}
                value={luck[skill] ?? 0}
                onChange={(e) => setProfile({ luck: { ...luck, [skill]: num(e.target.value) } })}
              />
            </label>
            <label title="Hunter's brew, Vein Blessing, hot skill, town events, lucky shrine, Rare-find mastery">
              Rare-find (%)
              <input
                type="number"
                min={0}
                value={rareFind}
                onChange={(e) => setProfile({ rareFind: num(e.target.value) })}
              />
            </label>
          </>
        )}
      </section>

      <section className="panel xp-pair">
        <XpInput
          label={`Current ${skill}`}
          xp={currentXp}
          onChange={(v) => setProfile({ skillXp: { ...skillXp, [skill]: v } })}
        />
      </section>

      <TierPlan
        plan={plan}
        startLevel={currentLevel}
        onRemove={(indices) => setSteps(steps.filter((_, j) => !indices.includes(j)))}
        onClear={() => setSteps([])}
        gathering={gathering}
        canMaximise={hasInventory && !gathering}
        onMaximise={maximise}
        search={{ levels: jobLevels, playerLevel: currentLevel, off: searchOff, onChange: setSearchOff }}
        note={maximiseNote}
      />
      
      {!hasCollection && (
        <p className="hint">
          No collection imported yet. <a href="#import">Import your character JSON</a> to see
          your real collection log.
        </p>
      )}

      <CollectionLog
        skill={skill}
        level={currentLevel}
        collection={collection}
        shown={logGroups?.[skill] ?? {}}
        onShown={(groups) => set({ logGroups: { ...logGroups, [skill]: groups } })}
        plan={plan}
        xpGain={xpGain}
        speed={skillSpeed}
        chances={chances}
        onPlan={(job, rarity) => setSteps([...steps, { job, rarity }])}
        onUnplan={(job, rarity) =>
          setSteps(steps.filter((s) => s.job !== job || s.rarity !== rarity))
        }
      />

    </>
  )
}
