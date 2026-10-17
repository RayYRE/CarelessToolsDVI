import { fmt, formatDuration } from '../core/format.js'
import { formatMilestone } from '../game/collection.js'

// "1,234 Iron, 2,468 Coal", with rarer materials named and coloured by rarity
function Materials({ list }) {
  if (!list.length) return '—'
  return list.map((m, i) => (
    <span key={`${m.rarity}|${m.material}`} className="material">
      {i > 0 && ', '}
      {fmt(m.quantity)}{' '}
      {m.rarity === 'Common' ? (
        m.material
      ) : (
        <span className={`rarity-${m.rarity.toLowerCase()}`}>
          {m.rarity} {m.material}
        </span>
      )}
    </span>
  ))
}

export default function TierPlan({ plan, startLevel, onRemove, onClear }) {
  const { rows } = plan
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Tier plan ({rows.length} steps)</h2>
        {rows.length > 0 && (
          <button type="button" className="chip" title="Remove every planned step" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="hint">Click a rarity in the collection log to plan its next tier.</p>
      ) : (
        <>
          <div className="result">
            <div className="stat">
              <span>Level</span>
              <strong>
                {startLevel} → {plan.level}
              </strong>
            </div>
            <div className="stat">
              <span>Items to craft</span>
              <strong>{fmt(rows.reduce((sum, s) => sum + s.items, 0))}</strong>
            </div>
            <div className="stat">
              <span>Time (excluding movement)</span>
              <strong>{formatDuration(plan.seconds)}</strong>
            </div>
            <div className="stat">
              <span>Collection points</span>
              <strong>+{fmt(plan.points)}</strong>
            </div>
          </div>
          <p className="plan-cost">
            <span>Total cost</span> <Materials list={plan.materials} />
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Rarity</th>
                  <th>Tier</th>
                  <th>Items needed</th>
                  <th>Cost</th>
                  <th>Level after</th>
                  <th>Time</th>
                  <th>Pts</th>
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={i} className="static">
                    <td>{i + 1}</td>
                    <td>
                      {s.item}
                      {s.locked && <small className="hint-inline warn"> needs level {s.needLevel}</small>}
                    </td>
                    <td className={`rarity-${s.rarity.toLowerCase()}`}>{s.rarity}</td>
                    <td>{s.done ? 'All done' : `${fmt(s.from)} → ${formatMilestone(s.to)}`}</td>
                    <td>{fmt(s.items)}</td>
                    <td>
                      <Materials list={s.materials} />
                    </td>
                    <td>
                      {s.levelBefore === s.levelAfter ? s.levelAfter : `${s.levelBefore} → ${s.levelAfter}`}
                    </td>
                    <td>{formatDuration(s.seconds)}</td>
                    <td>{s.points ? `+${fmt(s.points)}` : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="exclude"
                        title={`Remove ${s.item} (${s.rarity}) from the plan`}
                        aria-label={`Remove ${s.item} (${s.rarity}) from the plan`}
                        onClick={() => onRemove(i)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
