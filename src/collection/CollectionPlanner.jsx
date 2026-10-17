import { useMemo } from 'react'
import XpInput from '../components/XpInput.jsx'
import { num } from '../core/format.js'
import { usePersistentState } from '../core/storage.js'
import { levelForXp } from '../core/xp.js'
import { SKILL_GROUPS } from '../game/jobs.js'
import { hasXpSources, skillXpGain } from '../profile/xpGain.js'
import CollectionLog from './CollectionLog.jsx'
import { runPlan } from './plan.js'
import TierPlan from './TierPlan.jsx'

const DEFAULTS = {
  skill: 'Smithing',
}

// Stable empty plan so the memo below doesn't rerun every render
const NO_STEPS = []

export default function CollectionPlanner({ profile, setProfile }) {
  const [settings, set] = usePersistentState('collection-planner', DEFAULTS)
  const { skill, logGroups, plans } = settings
  const { skillXp, speed, collection } = profile
  // XP gain that applies to this skill (stats total minus bonuses for other skill types)
  const xpGain = skillXpGain(profile, skill)
  const currentXp = skillXp[skill] ?? 0
  const currentLevel = levelForXp(currentXp)
  const hasCollection = Object.keys(collection).length > 0

  const skillSpeed = speed[skill] ?? 0

  // Planned tier steps for this skill, in the order they were added
  const steps = plans?.[skill] ?? NO_STEPS
  const setSteps = (next) => set({ plans: { ...plans, [skill]: next } })
  const plan = useMemo(
    () => runPlan({ steps, startXp: currentXp, xpGain, speed: skillSpeed, collection }),
    [steps, currentXp, xpGain, skillSpeed, collection],
  )

  return (
    <>
      <section className="panel controls">
        <label>
          Skill
          <select value={skill} onChange={(e) => set({ skill: e.target.value })}>
            {SKILL_GROUPS.Processing.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
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
        onRemove={(i) => setSteps(steps.filter((_, j) => j !== i))}
        onClear={() => setSteps([])}
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
        onPlan={(job, rarity) => setSteps([...steps, { job, rarity }])}
        onUnplan={(job, rarity) =>
          setSteps(steps.filter((s) => s.job !== job || s.rarity !== rarity))
        }
      />

    </>
  )
}
