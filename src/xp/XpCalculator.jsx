import { useMemo } from 'react'
import XpInput from '../components/XpInput.jsx'
import { fmt, formatDuration, num, pct } from '../core/format.js'
import { usePersistentState } from '../core/storage.js'
import {
  actionTime,
  expectedMultiplier,
  failChance,
  fixedCountPlan,
  gatheringPlan,
  levelForXp,
  oddsMultiplier,
  rarityChances,
  xpForLevel,
  xpPerAction,
} from '../core/xp.js'
import { FAILURES, JOBS, SKILL_GROUPS, isGathering } from '../game/jobs.js'
import { MAX_LEVEL } from '../game/levels.js'
import CountsPanel from './CountsPanel.jsx'
import FailurePanel from './FailurePanel.jsx'
import LuckPanel from './LuckPanel.jsx'

// This tool's own settings; the player's stats live in the shared profile
const DEFAULTS = {
  skill: 'Mining',
  jobId: 0,
  targetXp: xpForLevel(99),
  // Processing: number of rarer actions in the mix
  counts: { Uncommon: 0, Rare: 0, Epic: 0, Legendary: 0 },
}

export default function XpCalculator({ profile, setProfile }) {
  const [settings, set] = usePersistentState('xp-calc-settings', DEFAULTS)
  const { skill, jobId, targetXp, counts } = settings
  const { xpGain, skillXp, luck, speed, rareFind } = profile
  const currentXp = skillXp[skill] ?? 0

  const gathering = isGathering(skill)
  const skillJobs = useMemo(() => JOBS.filter((j) => j.skill === skill), [skill])
  const job = skillJobs.find((j) => j.id === jobId) ?? skillJobs[0]
  const currentLevel = levelForXp(currentXp)
  const remaining = Math.max(0, targetXp - currentXp)

  const odds = oddsMultiplier(luck[skill] ?? 0, rareFind)
  const skillSpeed = speed[skill] ?? 0
  const chances = rarityChances(odds)
  const avgMultiplier = expectedMultiplier(chances)

  const failure = FAILURES[skill]
  const targetLevel = levelForXp(targetXp)

  const rows = skillJobs.map((baseJob) => {
    const j = { ...baseJob, time: actionTime(baseJob.time, skillSpeed) }
    const plan = gathering
      ? gatheringPlan(j, currentXp, targetXp, xpPerAction(j.xp, avgMultiplier, xpGain))
      : fixedCountPlan(j, currentXp, targetXp, xpGain, counts)
    // Averages per attempt over the whole grind, failures and stuns included.
    // With nothing left to earn, fall back to the rate at the current level.
    const fail = failChance(j, currentLevel)
    const perAction = plan.actions
      ? plan.xpGained / plan.actions
      : xpPerAction(j.xp, gathering ? avgMultiplier : 1, xpGain) * (1 - fail)
    const xpPerHour = plan.seconds
      ? (plan.xpGained / plan.seconds) * 3600
      : (perAction / (j.time + fail * (j.fail?.stun ?? 0))) * 3600
    // Gathering worst case: no luck at all, every drop Common (×1)
    const maxPlan = gathering ? gatheringPlan(j, currentXp, targetXp, xpPerAction(j.xp, 1, xpGain)) : null
    return { ...j, plan, maxPlan, fail, perAction, xpPerHour, actions: plan.actions, seconds: plan.seconds }
  })
  const selected = rows.find((r) => r.id === job.id)
  const gain = (1 + xpGain / 100).toFixed(2)

  const changeSkill = (newSkill) => {
    const jobs = JOBS.filter((j) => j.skill === newSkill)
    const newLevel = levelForXp(skillXp[newSkill] ?? 0)
    // Default to the best unlocked job, and make sure the target is above the new skill's XP
    const best = jobs.filter((j) => j.level <= newLevel).at(-1) ?? jobs[0]
    const minTarget = xpForLevel(Math.min(newLevel + 1, MAX_LEVEL))
    set({ skill: newSkill, jobId: best.id, targetXp: Math.max(targetXp, minTarget) })
  }

  return (
    <>
      <section className="panel controls">
        <label>
          Skill
          <select value={skill} onChange={(e) => changeSkill(e.target.value)}>
            {Object.entries(SKILL_GROUPS).map(([group, skills]) => (
              <optgroup key={group} label={group}>
                {skills.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Job
          <select value={job.id} onChange={(e) => set({ jobId: Number(e.target.value) })}>
            {skillJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.category ? `${j.category} – ` : ''}
                {j.name} (lvl {j.level})
              </option>
            ))}
          </select>
        </label>
        <label>
          XP gain (%)
          <input
            type="number"
            value={xpGain}
            onChange={(e) => setProfile({ xpGain: num(e.target.value) })}
          />
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
        <XpInput label="Target" xp={targetXp} onChange={(v) => set({ targetXp: v })} />
      </section>

      {gathering ? (
        <LuckPanel
          skill={skill}
          profile={profile}
          setProfile={setProfile}
          odds={odds}
          chances={chances}
          baseXp={job.xp}
        />
      ) : (
        <CountsPanel
          counts={counts}
          setCounts={(c) => set({ counts: c })}
          xpGain={xpGain}
          plan={selected.plan}
          baseXp={job.xp}
          currentXp={currentXp}
          targetXp={targetXp}
        />
      )}

      {failure && job.fail && (
        <FailurePanel
          failure={failure}
          job={job}
          currentLevel={currentLevel}
          targetLevel={targetLevel}
          failed={selected.plan.failed}
        />
      )}

      <section className="panel result">
        <div className="stat big">
          <span>{gathering ? 'Expected actions' : 'Actions needed'}</span>
          <strong>
            {gathering && '≈ '}
            {fmt(selected.actions)}
          </strong>
        </div>
        {gathering && (
          <div className="stat">
            <span>Max actions (all Common)</span>
            <strong>{fmt(selected.maxPlan.actions)}</strong>
            <small className="hint-inline">{formatDuration(selected.maxPlan.seconds)}</small>
          </div>
        )}
        <div className="stat">
          <span>XP remaining</span>
          <strong>{fmt(remaining)}</strong>
        </div>
        <div className="stat">
          <span>Avg XP / action</span>
          <strong>{selected.perAction.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
        </div>
        <div className="stat">
          <span>Time (excluding movement)</span>
          <strong>{formatDuration(selected.seconds)}</strong>
          <small className="hint-inline">
            {+selected.time.toFixed(2)}s / action
            {skillSpeed ? ` (base ${job.time}s, +${skillSpeed}% speed)` : ''}
          </small>
        </div>
        {job.level > currentLevel && (
          <p className="warn">Requires level {job.level} — you are level {currentLevel}.</p>
        )}
        <p className="formula">
          {gathering
            ? `⌈ ${fmt(remaining)} ÷ (${job.xp} × avg ×${avgMultiplier.toFixed(4)} × ${gain}${job.fail ? ' × success' : ''}) ⌉ = ${fmt(selected.actions)}`
            : `${fmt(selected.plan.fixedActions)} rarer + ⌈ (${fmt(remaining)} − ${fmt(selected.plan.fixedXp)}) ÷ (${job.xp} × ${gain}${job.fail ? ' × success' : ''}) ⌉ Common = ${fmt(selected.actions)}`}
        </p>
        {gathering && <p className="hint">Average over many actions — actual luck will vary.</p>}
        {selected.plan.failed > 0 && (
          <p className="hint">
            Includes ≈{fmt(selected.plan.failed)} {failure.noun.toLowerCase()} attempts that give no
            XP. Success chance is recalculated at every level-up.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>All {skill} jobs</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Lvl</th>
                {failure && <th>{failure.noun} now</th>}
                <th>Avg XP/action</th>
                <th>XP/hr</th>
                <th>Actions</th>
                {gathering && <th>Max (all Common)</th>}
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={[r.id === job.id && 'selected', r.level > currentLevel && 'locked']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => set({ jobId: r.id })}
                >
                  <td>
                    {r.category && <span className="cat">{r.category}</span>}
                    {r.name}
                  </td>
                  <td>{r.level}</td>
                  {failure && <td>{pct(r.fail)}</td>}
                  <td>{r.perAction.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                  <td>{fmt(r.xpPerHour)}</td>
                  <td>{fmt(r.actions)}</td>
                  {gathering && <td>{fmt(r.maxPlan.actions)}</td>}
                  <td>{formatDuration(r.seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
