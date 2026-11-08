import Icon from '../components/Icon.jsx'
import { fmt } from '../core/format.js'
import { levelForXp } from '../core/xp.js'
import {
  MILESTONES,
  formatMilestone,
  hasLogItem,
  itemName,
  milestoneReached,
  milestonePoints,
} from '../game/collection.js'
import { jobIcon, skillIcon } from '../game/icons.js'
import { JOBS, isGathering } from '../game/jobs.js'
import { RARITIES } from '../game/rarities.js'
import { tierStep } from './plan.js'

// Reached milestone count, points earned, and progress toward the next milestone for one rarity
function rarityProgress(collected, rarity) {
  let reached = -1
  let points = 0
  MILESTONES.forEach((m, i) => {
    if (collected >= m) {
      reached = i
      points += milestonePoints(i, rarity)
    }
  })
  const prev = reached >= 0 ? MILESTONES[reached] : 0
  const next = MILESTONES[reached + 1]
  const fill = next === undefined ? 1 : (collected - prev) / (next - prev)
  return {
    label: reached >= 0 ? formatMilestone(MILESTONES[reached]) : '0',
    points,
    fill,
  }
}

export default function CollectionLog({
  skill,
  level,
  collection,
  shown,
  onShown,
  plan,
  xpGain,
  speed,
  chances,
  onPlan,
  onUnplan,
}) {
  const jobs = JOBS.filter((j) => j.skill === skill && hasLogItem(j))
  const gathering = isGathering(skill)
  // Level requirement groups, each toggled on its own. Unset groups are shown if unlocked.
  const groups = [...new Set(jobs.map((j) => j.level))].sort((a, b) => a - b)
  const isShown = (g) => shown[g] ?? g <= level
  const visible = jobs.filter((j) => isShown(j.level))

  const rows = visible.map((j) => {
    const item = itemName(j)
    const counts = collection[item] ?? {}
    const cells = RARITIES.map((r) => {
      // The next tier starts from wherever the plan so far leaves this cell
      const next = tierStep(j, r, plan.have(item, r.name), plan.xpFor(skill), xpGain, speed, {
        chances,
        have: (name) => plan.have(item, name),
      })
      const planned = plan.rows.filter((s) => s.job === j.name && s.rarity === r.name).length
      const collected = counts[r.name] ?? 0
      // Tier this cell reaches once every planned step is done. Gathering also fills the
      // rarities it didn't target, so those cells can move up a tier without being planned.
      const target = milestoneReached(plan.have(item, r.name))
      return {
        r,
        ...rarityProgress(counts[r.name] ?? 0, r.name),
        next,
        planned,
        target: target > milestoneReached(collected) ? target : null,
      }
    })
    return {
      job: j,
      key: j.name,
      item,
      level: j.level,
      total: RARITIES.reduce((sum, r) => sum + (counts[r.name] ?? 0), 0),
      points: cells.reduce((sum, c) => sum + c.points, 0),
      cells,
    }
  })

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="with-icon">
          <Icon src={skillIcon(skill)} size={24} />
          {skill} collection log
        </h2>
        <div className="chips">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              className={`chip${isShown(g) ? ' active' : ''}${g > level ? ' locked' : ''}`}
              aria-pressed={isShown(g)}
              title={g > level ? `Level ${g} items (not unlocked yet)` : `Level ${g} items`}
              onClick={() => onShown({ ...shown, [g]: !isShown(g) })}
            >
              Level {g}
            </button>
          ))}
          {/* Always shown so the chips don't shift; disabled while nothing is selected */}
          <button
            type="button"
            className="chip"
            title="Deselect every level group"
            disabled={!groups.some(isShown)}
            onClick={() => onShown(Object.fromEntries(groups.map((g) => [g, false])))}
          >
            Clear all
          </button>
        </div>
      </div>
      <p className="hint">
        Showing {visible.length} of {jobs.length} items. Toggle level groups to show or hide them.
        Click a rarity to plan it to its next tier; hover for the items needed and the level
        you&apos;d reach.
        {gathering &&
          ' Gathering rolls rarity with your luck, so counts are averages and the other rarities fill up along the way.'}
      </p>
      <ul className="log">
        {rows.map((row) => (
          <li key={row.key} className="log-row">
            <div className="log-name">
              <Icon src={jobIcon(row.job)} size={28} />
              <strong>{row.item}</strong>
              <small>{fmt(row.total)} total</small>
            </div>
            <div className="log-rarities">
              {row.cells.map(({ r, label, fill, next, planned, target }) => (
                <div key={r.name} className="log-cell-wrap">
                  <button
                    type="button"
                    className={`log-cell rarity-${r.name.toLowerCase()}${planned ? ' planned' : ''}`}
                    disabled={next.done}
                    title={
                      next.impossible
                        ? `${row.item} (${r.name}): never rolls with your luck`
                        : next.done
                        ? `${row.item} (${r.name}): every tier done`
                        : `Plan ${row.item} (${r.name}) to ${formatMilestone(next.to)}: ` +
                          `${gathering ? '≈' : ''}${fmt(next.items)} ${gathering ? 'gathers' : 'items'}` +
                          ` → level ${levelForXp(plan.xpFor(skill) + next.xpGained)}` +
                          (gathering && next.points
                            ? `, +${fmt(next.points)} pts` +
                              (next.sidePoints ? ` (+${fmt(next.sidePoints)} from other rarities)` : '')
                            : '') +
                          (next.materials.length
                            ? `\nCost: ${next.materials
                                .map((m) => `${fmt(m.quantity)} ${m.rarity === 'Common' ? '' : `${m.rarity} `}${m.material}`)
                                .join(', ')}`
                            : '')
                    }
                    onClick={() => onPlan(row.job.name, r.name)}
                  >
                    <span className="log-letter">{r.name[0]}</span>
                    <span className="log-count">
                      {label}
                      {target !== null && <b> → {formatMilestone(target)}</b>}
                    </span>
                    <span className="log-bar">
                      <i style={{ width: `${Math.round(fill * 100)}%` }} />
                    </span>
                  </button>
                  {planned > 0 && (
                    <button
                      type="button"
                      className="log-reset"
                      title={`Remove planned ${row.item} (${r.name}) tiers`}
                      aria-label={`Remove planned ${row.item} (${r.name}) tiers`}
                      onClick={() => onUnplan(row.job.name, r.name)}
                    >
                      ↺
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="log-points">
              <strong>{fmt(row.points)}</strong> pts
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
