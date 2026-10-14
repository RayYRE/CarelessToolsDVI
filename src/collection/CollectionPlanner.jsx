import { useMemo } from 'react'
import XpInput from '../components/XpInput.jsx'
import { fmt, formatDuration, num } from '../core/format.js'
import { usePersistentState } from '../core/storage.js'
import { clampLevel, levelForXp } from '../core/xp.js'
import { MILESTONES, formatMilestone, itemName } from '../game/collection.js'
import { JOBS, SKILL_GROUPS } from '../game/jobs.js'
import { RARITIES } from '../game/rarities.js'
import { planRoute } from './route.js'

const DEFAULTS = {
  skill: 'Smithing',
  targetLevel: 80,
  minPointsPerHour: 100,
  // Highest milestone index to plan per rarity (-1 = don't craft it)
  maxMilestone: { Common: 7, Uncommon: 2, Rare: 1, Epic: 0, Legendary: -1 },
  // Item names left out of the route (too expensive)
  excluded: [],
}

const CAP_OPTIONS = [-1, ...MILESTONES.map((_, i) => i)]

export default function CollectionPlanner({ profile, setProfile }) {
  const [settings, set] = usePersistentState('collection-planner', DEFAULTS)
  const { skill, targetLevel, minPointsPerHour, maxMilestone, excluded } = settings
  const { xpGain, skillXp, speed, collection } = profile
  const currentXp = skillXp[skill] ?? 0
  const currentLevel = levelForXp(currentXp)
  const hasCollection = Object.keys(collection).length > 0

  const skillSpeed = speed[skill] ?? 0
  const options = useMemo(
    () => ({
      skill,
      startXp: currentXp,
      targetLevel,
      xpGain,
      speed: skillSpeed,
      collection,
      maxMilestone,
      excluded,
    }),
    [skill, currentXp, targetLevel, xpGain, skillSpeed, collection, maxMilestone, excluded],
  )
  const route = useMemo(() => planRoute({ ...options, minPointsPerHour }), [options, minPointsPerHour])
  // Same route levelling as fast as possible, for comparison
  const fastest = useMemo(() => planRoute({ ...options, minPointsPerHour: Infinity }), [options])

  const exclude = (item) => set({ excluded: [...excluded, item] })
  const include = (item) => set({ excluded: excluded.filter((i) => i !== item) })
  // Excluded items belonging to this skill
  const skillExcluded = JOBS.filter((j) => j.skill === skill)
    .map(itemName)
    .filter((item) => excluded.includes(item))

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
          Target level
          <input
            type="number"
            min={1}
            value={targetLevel}
            onChange={(e) => set({ targetLevel: clampLevel(e.target.value) })}
          />
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
        <label>
          Skip detours worth less than (points per extra hour)
          <input
            type="number"
            min={0}
            value={minPointsPerHour}
            onChange={(e) => set({ minPointsPerHour: Math.max(0, num(e.target.value)) })}
          />
          <small className="hint-inline">
            0 = take every milestone. Higher = closer to the fastest route.
          </small>
        </label>
      </section>

      <section className="panel">
        <h2>Rarities to craft</h2>
        <p className="hint">
          Rarer crafts need rarer materials, so cap each rarity at the milestone you can afford.
        </p>
        <div className="controls">
          {RARITIES.map((r) => (
            <label key={r.name}>
              <span className={`rarity-${r.name.toLowerCase()}`}>
                {r.name} (×{r.multiplier} XP, ×{r.points} pts)
              </span>
              <select
                value={maxMilestone[r.name] ?? -1}
                onChange={(e) =>
                  set({ maxMilestone: { ...maxMilestone, [r.name]: Number(e.target.value) } })
                }
              >
                {CAP_OPTIONS.map((i) => (
                  <option key={i} value={i}>
                    {i < 0 ? "Don't craft" : `Up to ${formatMilestone(MILESTONES[i])}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="panel result">
        <div className="stat big">
          <span>Collection points</span>
          <strong>+{fmt(route.points)}</strong>
        </div>
        <div className="stat">
          <span>Time to level {route.endLevel}</span>
          <strong>{formatDuration(route.seconds)}</strong>
        </div>
        <div className="stat">
          <span>Fastest route</span>
          <strong>{formatDuration(fastest.seconds)}</strong>
          <small className="hint-inline">+{fmt(fastest.points)} pts</small>
        </div>
        <div className="stat">
          <span>Extra for milestones</span>
          <strong>{formatDuration(route.seconds - fastest.seconds)}</strong>
          <small className="hint-inline">+{fmt(route.points - fastest.points)} pts</small>
        </div>
        {currentLevel >= targetLevel && (
          <p className="warn">Already level {currentLevel} — raise the target level.</p>
        )}
        {!route.reachedTarget && currentLevel < targetLevel && (
          <p className="warn">
            Stops at level {route.endLevel}: every item unlocked there is excluded.
          </p>
        )}
        {!hasCollection && (
          <p className="hint">
            Assuming nothing collected yet. <a href="#import">Import your character JSON</a> to
            start from your real collection log.
          </p>
        )}
        <p className="hint">
          Burned food doesn&apos;t count, so cooking steps include extra attempts. Material costs
          aren&apos;t included.
        </p>
      </section>

      {skillExcluded.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <h2>Excluded items</h2>
            <button
              type="button"
              className="chip"
              title={`Add all excluded ${skill} items back`}
              onClick={() => set({ excluded: excluded.filter((i) => !skillExcluded.includes(i)) })}
            >
              Reset
            </button>
          </div>
          <div className="chips">
            {skillExcluded.map((item) => (
              <button key={item} type="button" className="chip" onClick={() => include(item)}>
                {item} <span aria-hidden="true">↺</span>
              </button>
            ))}
          </div>
          <p className="hint">Click an item to add it back to the route.</p>
        </section>
      )}

      <section className="panel">
        <h2>Route ({route.steps.length} steps)</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Rarity</th>
                <th>Milestone</th>
                <th>Craft</th>
                <th>Pts</th>
                <th>Level</th>
                <th>Time</th>
                <th>Total</th>
                <th aria-label="Exclude" />
              </tr>
            </thead>
            <tbody>
              {route.steps.map((s, i) => (
                <tr key={i} className={`static${s.levelling ? ' levelling' : ''}`}>
                  <td>{i + 1}</td>
                  <td>
                    {s.job.category && <span className="cat">{s.job.category}</span>}
                    {s.job.item}
                  </td>
                  <td className={`rarity-${s.rarity.toLowerCase()}`}>{s.rarity}</td>
                  <td>
                    {s.levelling
                      ? 'Level up'
                      : `${fmt(s.from)} → ${formatMilestone(s.milestone)}`}
                  </td>
                  <td>{fmt(s.items)}</td>
                  <td>{s.points ? `+${fmt(s.points)}` : '—'}</td>
                  <td>
                    {s.levelBefore === s.levelAfter ? s.levelAfter : `${s.levelBefore} → ${s.levelAfter}`}
                  </td>
                  <td>{formatDuration(s.seconds)}</td>
                  <td>{formatDuration(s.totalSeconds)}</td>
                  <td>
                    <button
                      type="button"
                      className="exclude"
                      title={`Exclude ${s.job.item} from the route`}
                      aria-label={`Exclude ${s.job.item} from the route`}
                      onClick={() => exclude(s.job.item)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
