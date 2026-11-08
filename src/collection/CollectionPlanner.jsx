import { useMemo, useState } from 'react'
import IconSelect from '../components/IconSelect.jsx'
import XpInput from '../components/XpInput.jsx'
import { num } from '../core/format.js'
import { usePersistentState } from '../core/storage.js'
import { levelForXp, oddsMultiplier, rarityChances } from '../core/xp.js'
import { MILESTONES, hasLogItem, itemName, nextMilestoneIndex } from '../game/collection.js'
import { skillIcon } from '../game/icons.js'
import { JOBS, SKILL_GROUPS, isGathering } from '../game/jobs.js'
import { hasXpSources, skillXpGain } from '../profile/xpGain.js'
import CollectionLog from './CollectionLog.jsx'
import { RARITIES } from '../game/rarities.js'
import { expandGatherStep, maximisePoints, maximisePointsAll, runPlan } from './plan.js'
import TierPlan from './TierPlan.jsx'

const DEFAULTS = {
  skill: 'Smithing',
}

// Stable empty plan so the memo below doesn't rerun every render
const NO_STEPS = []

// One skill's controls, tier plan and collection log. `selector` is the skill picker, shown in
// its controls when it is the only skill on the page; `heading` names it when several are stacked.
function SkillPlanner({ skill, profile, setProfile, settings, set, selector, heading }) {
  const { logGroups, plans } = settings
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
  // Gathering search depth (steps planned), per skill
  const searchRank = settings.searchRank?.[skill] ?? 'points'
  const setSearchRank = (r) => set({ searchRank: { ...settings.searchRank, [skill]: r } })
  const searchDepth = settings.searchDepth?.[skill] ?? 10
  const setSearchDepth = (n) => set({ searchDepth: { ...settings.searchDepth, [skill]: n } })
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
      chances,
      depth: searchDepth,
      rank: searchRank,
    })
    setSteps(best)
    setMaximiseNote(
      best.length
        ? gathering
          ? `Planned ${best.length} steps, ${searchRank === 'points' ? 'most points per action' : 'fewest gathers'} first.`
          : `Planned ${best.length} steps using only what's in your storage.`
        : `Nothing in your storage completes a ${skill} tier with these settings.`,
    )
  }

  return (
    <>
      {heading && <h2 className="skill-heading">{heading}</h2>}
      <section className="panel controls">
        {selector}
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
        onReorder={(order) => setSteps(order.map((i) => steps[i]))}
        gathering={gathering}
        canMaximise={gathering || hasInventory}
        onMaximise={maximise}
        search={{
          levels: jobLevels,
          playerLevel: currentLevel,
          off: searchOff,
          onChange: setSearchOff,
          gathering,
          depth: searchDepth,
          onDepth: setSearchDepth,
          rank: searchRank,
          onRank: setSearchRank,
        }}
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
        // The step is pinned to the tier it aims for now, so reordering never changes it
        onPlan={(job, rarity) => {
          const j = JOBS.find((x) => x.name === job)
          const next = MILESTONES[nextMilestoneIndex(plan.have(itemName(j), rarity))]
          if (gathering) {
            // Same as Calculate points: the other rarities this tier fills come first as steps
            const { steps: added } = expandGatherStep({
              job: j,
              rarity: RARITIES.find((r) => r.name === rarity),
              rarities: RARITIES,
              chances,
              xpGain,
              speed: skillSpeed,
              have: plan.have,
              xp: plan.xp,
            })
            setSteps([...steps, ...added])
            return
          }
          setSteps([...steps, { job, rarity, to: next }])
        }}
        onUnplan={(job, rarity) =>
          setSteps(steps.filter((s) => s.job !== job || s.rarity !== rarity))
        }
      />

    </>
  )
}

// All: one tier plan and one search across every processing skill, with the setup (XP gain, each
// skill's speed and XP) behind a button and each skill's collection log below.
const ALL = 'All'

function AllPlanner({ profile, setProfile, settings, set, selector }) {
  const skills = SKILL_GROUPS.Processing
  const { skillXp, speed, collection } = profile
  const [setupOpen, setSetupOpen] = useState(false)
  const [note, setNote] = useState(null)
  const gains = Object.fromEntries(skills.map((s) => [s, skillXpGain(profile, s)]))
  const levels = Object.fromEntries(skills.map((s) => [s, levelForXp(skillXp[s] ?? 0)]))

  const steps = settings.plans?.[ALL] ?? NO_STEPS
  const setSteps = (next) => set({ plans: { ...settings.plans, [ALL]: next } })
  const perSkill = useMemo(
    () => Object.fromEntries(skills.map((s) => [s, { startXp: skillXp[s] ?? 0, speed: speed[s] ?? 0, xpGain: gains[s] }])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skillXp, speed, profile.xpGain, profile.xpGainSources],
  )
  const plan = useMemo(() => runPlan({ steps, collection, skills: perSkill }), [steps, collection, perSkill])

  const inventory = profile.inventory?.items ?? {}
  const hasInventory = Object.keys(inventory).length > 0
  const searchOff = settings.searchOff?.[ALL] ?? {}
  const searchDepth = settings.searchDepth?.[ALL] ?? 100
  const jobLevels = [
    ...new Set(JOBS.filter((j) => skills.includes(j.skill) && hasLogItem(j)).map((j) => j.level)),
  ].sort((a, b) => a - b)

  const maximise = () => {
    if (steps.length && !window.confirm(`Replace your ${steps.length} planned steps?`)) return
    // Skills switched off in Settings are left out of the search, but still run in the plan
    const enabled = Object.fromEntries(Object.entries(perSkill).filter(([s]) => !searchOff.skills?.includes(s)))
    const best = maximisePointsAll({ skills: enabled, collection, inventory, off: searchOff, maxSteps: searchDepth })
    setSteps(best)
    setNote(
      best.length
        ? `Planned ${best.length} steps across all processing skills using only what's in your storage.`
        : 'Nothing in your storage completes a tier with these settings.',
    )
  }
  const planStep = (job, rarity) => {
    const j = JOBS.find((x) => x.name === job)
    const to = MILESTONES[nextMilestoneIndex(plan.have(itemName(j), rarity))]
    setSteps([...steps, { job, rarity, to }])
  }
  const unplanStep = (job, rarity) => setSteps(steps.filter((s) => s.job !== job || s.rarity !== rarity))

  return (
    <>
      <section className="panel controls">
        {selector}
        <div className="field">
          <span aria-hidden="true">&nbsp;</span>
          <button
            type="button"
            className={`chip setup-button${setupOpen ? ' active' : ''}`}
            aria-expanded={setupOpen}
            onClick={() => setSetupOpen(!setupOpen)}
          >
            Setup
          </button>
        </div>
      </section>

      {setupOpen && (
        <section className="panel">
          <h2>Setup</h2>
          <div className="controls">
            <label>
              XP gain (%)
              <input type="number" value={profile.xpGain} onChange={(e) => setProfile({ xpGain: num(e.target.value) })} />
              {hasXpSources(profile) || !profile.xpGain ? (
                <small className="hint-inline">Applies to every skill below, minus any source that does not apply to it</small>
              ) : (
                <small className="hint-inline warn">
                  Sources not imported, may be inaccurate. <a href="#import">Fix</a>
                </small>
              )}
            </label>
          </div>
          <div className="setup-rows">
            {skills.map((s) => (
              <XpInput
                key={s}
                label={`Current ${s}`}
                xp={skillXp[s] ?? 0}
                onChange={(v) => setProfile({ skillXp: { ...skillXp, [s]: v } })}
              >
                <label>
                  Speed (%)
                  <input
                    type="number"
                    min={0}
                    value={speed[s] ?? 0}
                    onChange={(e) => setProfile({ speed: { ...speed, [s]: num(e.target.value) } })}
                  />
                </label>
              </XpInput>
            ))}
          </div>
        </section>
      )}

      <TierPlan
        plan={plan}
        startLevel={0}
        onRemove={(indices) => setSteps(steps.filter((_, j) => !indices.includes(j)))}
        onClear={() => setSteps([])}
        onReorder={(order) => setSteps(order.map((i) => steps[i]))}
        gathering={false}
        canMaximise={hasInventory}
        onMaximise={maximise}
        search={{
          levels: jobLevels,
          playerLevel: Math.max(...Object.values(levels)),
          off: searchOff,
          onChange: (next) => set({ searchOff: { ...settings.searchOff, [ALL]: next } }),
          gathering: false,
          skills,
          depth: searchDepth,
          onDepth: (n) => set({ searchDepth: { ...settings.searchDepth, [ALL]: n } }),
        }}
        note={note}
      />

      {!Object.keys(collection).length && (
        <p className="hint">
          No collection imported yet. <a href="#import">Import your character JSON</a> to see your
          real collection log.
        </p>
      )}

      {skills.map((s) => (
        <CollectionLog
          key={s}
          skill={s}
          level={levels[s]}
          collection={collection}
          shown={settings.logGroups?.[s] ?? {}}
          onShown={(groups) => set({ logGroups: { ...settings.logGroups, [s]: groups } })}
          plan={plan}
          xpGain={gains[s]}
          speed={speed[s] ?? 0}
          onPlan={planStep}
          onUnplan={unplanStep}
        />
      ))}
    </>
  )
}

export default function CollectionPlanner({ profile, setProfile }) {
  const [settings, set] = usePersistentState('collection-planner', DEFAULTS)
  const { skill } = settings
  const selector = (
    <IconSelect
      label="Skill"
      value={skill}
      onChange={(s) => set({ skill: s })}
      options={Object.entries(SKILL_GROUPS).flatMap(([group, skills]) => [
        ...(group === 'Processing' ? [{ value: ALL, label: 'All', group }] : []),
        ...skills.map((s) => ({ value: s, label: s, icon: skillIcon(s), group })),
      ])}
    />
  )
  const common = { profile, setProfile, settings, set, selector }
  if (skill === ALL) return <AllPlanner {...common} />
  return <SkillPlanner key={skill} skill={skill} {...common} />
}
