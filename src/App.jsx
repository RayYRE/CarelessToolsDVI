import { useEffect, useMemo, useState } from 'react'
import { FAILURES, JOBS, RARITIES, SKILL_GROUPS, isGathering } from './data/jobs.js'
import { ESTIMATED_LEVELS, MAX_LEVEL } from './data/levels.js'
import { parseExport, parseStats } from './lib/importStats.js'
import {
  actionTime,
  clampLevel,
  expectedMultiplier,
  failChance,
  fixedCountPlan,
  gatheringPlan,
  fmt,
  formatDuration,
  levelForXp,
  oddsMultiplier,
  rarityChances,
  xpForLevel,
  xpPerAction,
} from './lib/xp.js'
import './App.css'

const STORAGE_KEY = 'xp-calc-settings'
const RARER = RARITIES.slice(1)

const DEFAULTS = {
  skill: 'Mining',
  jobId: 0,
  xpGain: 95,
  // Current XP per skill, e.g. { Mining: 8171 } (filled by import or by hand)
  skillXp: {},
  targetXp: xpForLevel(99),
  // Per-skill bonuses, e.g. { Mining: 286 } (filled by import or by hand)
  luck: {},
  speed: {},
  // Gathering
  rareFind: 0,
  // Processing
  counts: { Uncommon: 0, Rare: 0, Epic: 0, Legendary: 0 },
}

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }
  } catch {
    return DEFAULTS
  }
}

const num = (v) => Number(v) || 0
const pct = (p) =>
  p >= 0.01 ? `${(p * 100).toFixed(2)}%` : p > 0 ? `${(p * 100).toPrecision(2)}%` : '0%'

// Level + XP input pair: editing the level snaps XP to that level's start
function XpInput({ label, xp, onChange }) {
  const level = levelForXp(xp)
  return (
    <fieldset className="xp-input">
      <legend>{label}</legend>
      <label>
        Level
        <input
          type="number"
          min={1}
          max={MAX_LEVEL}
          value={level}
          onChange={(e) => onChange(xpForLevel(clampLevel(e.target.value)))}
        />
      </label>
      <label>
        XP
        <input
          type="number"
          min={0}
          value={xp}
          onChange={(e) => onChange(Math.max(0, num(e.target.value)))}
        />
      </label>
      {ESTIMATED_LEVELS.has(level) && <small className="warn">Level {level} XP is estimated</small>}
    </fieldset>
  )
}

function LuckPanel({ skill, settings, set, odds, chances, baseXp }) {
  const { luck, rareFind, xpGain } = settings
  return (
    <section className="panel">
      <h2>Luck &amp; rare-find</h2>
      <div className="controls">
        <label title="Tool (Uncommon +25%, Rare +75%, Epic +200%, Legendary +500%) + amulet">
          Luck in {skill} (%)
          <input
            type="number"
            min={0}
            value={luck[skill] ?? 0}
            onChange={(e) => set({ luck: { ...luck, [skill]: num(e.target.value) } })}
          />
        </label>
        <label title="Hunter's brew, Vein Blessing, hot skill, town events, lucky shrine, Rare-find mastery">
          Rare-find (%)
          <input
            type="number"
            min={0}
            value={rareFind}
            onChange={(e) => set({ rareFind: num(e.target.value) })}
          />
        </label>
        <div className="stat">
          <span>Odds multiplier</span>
          <strong>×{odds.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
        </div>
      </div>
      <p className="hint">
        Luck = tool (Uncommon +25%, Rare +75%, Epic +200%, Legendary +500%) + amulet.
      </p>
      <p className="hint">
        Rare-find = brew + Vein Blessing + hot skill + town events + lucky shrine + mastery, added
        together.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rarity</th>
              <th>Chance / action</th>
              <th>1 in</th>
              <th>XP / action</th>
            </tr>
          </thead>
          <tbody>
            {chances.map((r) => (
              <tr key={r.name} className="static">
                <td>{r.name}</td>
                <td>{pct(r.chance)}</td>
                <td>{r.chance > 0 ? fmt(1 / r.chance) : '—'}</td>
                <td>{fmt(xpPerAction(baseXp, r.multiplier, xpGain))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CountsPanel({ settings, set, plan, baseXp }) {
  const { counts, xpGain } = settings
  return (
    <section className="panel">
      <h2>Rarity mix</h2>
      <p className="hint">Enter how many actions you'll do at each rarity. The rest is Common.</p>
      <div className="controls">
        {RARER.map((r) => (
          <label key={r.name}>
            {r.name} (×{r.multiplier}, {fmt(xpPerAction(baseXp, r.multiplier, xpGain))} XP)
            <input
              type="number"
              min={0}
              value={counts[r.name] ?? 0}
              onChange={(e) =>
                set({ counts: { ...counts, [r.name]: Math.max(0, num(e.target.value)) } })
              }
            />
          </label>
        ))}
        <div className="stat">
          <span>Common (rest)</span>
          <strong>{fmt(plan.commonActions)}</strong>
        </div>
      </div>
      {plan.fixedActions > 0 && plan.commonActions === 0 && (
        <p className="warn">The rarer actions alone reach the target.</p>
      )}
    </section>
  )
}

function FailurePanel({ failure, job, currentLevel, targetLevel, failed }) {
  const { never, stun } = job.fail
  return (
    <section className="panel">
      <h2>{failure.label}</h2>
      <p className="hint">
        {job.name}: {job.fail.chance}% at level {job.level}, dropping evenly to 0% at level {never}.
        Failed attempts give no XP{stun ? ` and add a ${stun}s stun` : ''}.
      </p>
      <div className="controls">
        <div className="stat">
          <span>Now (level {currentLevel})</span>
          <strong>{pct(failChance(job, currentLevel))}</strong>
        </div>
        <div className="stat">
          <span>At target (level {targetLevel})</span>
          <strong>{pct(failChance(job, targetLevel))}</strong>
        </div>
        <div className="stat">
          <span>{failure.noun} (expected)</span>
          <strong>≈ {fmt(failed)}</strong>
        </div>
        {stun > 0 && (
          <div className="stat">
            <span>Time stunned</span>
            <strong>{formatDuration(failed * stun)}</strong>
          </div>
        )}
      </div>
    </section>
  )
}

// One paste box: runs `parse` on the text and hands the result to onImport
function ImportBox({ title, hint, placeholder, parse, fallbackError, onImport }) {
  const [text, setText] = useState('')
  const [message, setMessage] = useState(null)

  const runImport = () => {
    const { settings, found, error } = parse(text)
    if (!found.length) {
      setMessage({ warn: true, text: error ?? fallbackError })
      return
    }
    onImport(settings)
    setMessage({ warn: false, text: `Imported ${found.join(', ')}.` })
    setText('')
  }

  return (
    <div className="import-box">
      <h3>{title}</h3>
      <p className="hint">{hint}</p>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
      />
      <button type="button" onClick={runImport} disabled={!text.trim()}>
        Import
      </button>
      {message && <p className={message.warn ? 'warn' : 'hint'}>{message.text}</p>}
    </div>
  )
}

function ImportPanel({ onImport }) {
  return (
    <details className="panel import">
      <summary>Import from the game</summary>
      <div className="import-grid">
        <ImportBox
          title="Character export (JSON)"
          hint="Settings -> Privacy -> Export my character"
          placeholder={`{
  "game": "Deep Vein Idle",
  "skills": { ... }
}`}
          parse={parseExport}
          fallbackError="No skills found in this export."
          onImport={onImport}
        />
        <ImportBox
          title="Stats export"
          hint="Copy your Stat page starting from Offence."
          placeholder={`Offence
Combat style
Combat level
Max hit
...`}
          parse={parseStats}
          fallbackError='No stats recognised — paste the "Your bonuses" section.'
          onImport={onImport}
        />
      </div>
    </details>
  )
}

function App() {
  const [settings, setSettings] = useState(loadSettings)
  const { skill, jobId, xpGain, skillXp, targetXp, luck, speed, rareFind, counts } = settings
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }))
  // Imports merge per-skill maps (luck, speed, skillXp) instead of replacing them
  const mergeImport = (patch) =>
    setSettings((s) => {
      const next = { ...s }
      for (const [key, value] of Object.entries(patch)) {
        next[key] = value && typeof value === 'object' ? { ...s[key], ...value } : value
      }
      return next
    })
  const currentXp = skillXp[skill] ?? 0

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // storage unavailable; settings just won't persist
    }
  }, [settings])

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
    <main>
      <h1>XP Action Calculator</h1>

      <ImportPanel onImport={mergeImport} />

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
          <input type="number" value={xpGain} onChange={(e) => set({ xpGain: num(e.target.value) })} />
        </label>
        <label>
          {skill} speed (%)
          <input
            type="number"
            min={0}
            value={skillSpeed}
            onChange={(e) => set({ speed: { ...speed, [skill]: num(e.target.value) } })}
          />
        </label>
      </section>

      <section className="panel xp-pair">
        <XpInput
          label={`Current ${skill}`}
          xp={currentXp}
          onChange={(v) => set({ skillXp: { ...skillXp, [skill]: v } })}
        />
        <XpInput label="Target" xp={targetXp} onChange={(v) => set({ targetXp: v })} />
      </section>

      {gathering ? (
        <LuckPanel skill={skill} settings={settings} set={set} odds={odds} chances={chances} baseXp={job.xp} />
      ) : (
        <CountsPanel settings={settings} set={set} plan={selected.plan} baseXp={job.xp} />
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
        {gathering && (
          <p className="hint">Average over many actions — actual luck will vary.</p>
        )}
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
    </main>
  )
}

export default App
