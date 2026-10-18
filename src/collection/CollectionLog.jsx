import Icon from '../components/Icon.jsx'
import { fmt } from '../core/format.js'
import { levelForXp } from '../core/xp.js'
import { MILESTONES, formatMilestone, itemName, milestonePoints } from '../game/collection.js'
import { jobIcon, skillIcon } from '../game/icons.js'
import { JOBS } from '../game/jobs.js'
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
  onPlan,
  onUnplan,
}) {
  const jobs = JOBS.filter((j) => j.skill === skill)
  // Level requirement groups, each toggled on its own. Unset groups are shown if unlocked.
  const groups = [...new Set(jobs.map((j) => j.level))].sort((a, b) => a - b)
  const isShown = (g) => shown[g] ?? g <= level
  const visible = jobs.filter((j) => isShown(j.level))

  const rows = visible.map((j) => {
    const item = itemName(j)
    const counts = collection[item] ?? {}
    const cells = RARITIES.map((r) => {
      // The next tier starts from wherever the plan so far leaves this cell
      const next = tierStep(j, r, plan.have(item, r.name), plan.xp, xpGain, speed)
      const planned = plan.rows.filter((s) => s.job === j.name && s.rarity === r.name).length
      return {
        r,
        ...rarityProgress(counts[r.name] ?? 0, r.name),
        next,
        planned,
        // Tier this cell reaches once every planned step is done
        target: plan.have(item, r.name),
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
                      next.done
                        ? `${row.item} (${r.name}): every tier done`
                        : `Plan ${row.item} (${r.name}) to ${formatMilestone(next.to)}: ` +
                          `${fmt(next.items)} items → level ${levelForXp(plan.xp + next.xpGained)}` +
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
                      {planned > 0 && <b> → {formatMilestone(target)}</b>}
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
