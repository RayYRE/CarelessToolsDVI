import Icon from '../components/Icon.jsx'
import { fmt, formatDuration } from '../core/format.js'
import { iconFor } from '../game/icons.js'

// Expected drops from a Thieving stall over the plan: a successful steal drops the item
// 1 in `drop.oneIn` times, then the drop's rarity is rolled with the usual luck chances
export default function DropPanel({ drop, plan, chances }) {
  const steals = Math.max(0, plan.actions - plan.failed)
  const total = steals / drop.oneIn
  const perHour = plan.seconds ? (total / plan.seconds) * 3600 : 0
  const count = (n) => n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 1 : 0 })
  return (
    <section className="panel">
      <h2 className="with-icon">
        <Icon src={iconFor(drop.item)} size={24} />
        {drop.item} drops
      </h2>
      <p className="hint">
        1 in {drop.oneIn} successful steals, then the rarity is rolled with your luck. Over the plan
        (≈{fmt(steals)} successful steals, {formatDuration(plan.seconds)}): ≈{count(total)}{' '}
        {drop.item}, {count(perHour)} / hr.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rarity</th>
              <th>1 in (steals)</th>
              <th>Expected</th>
              <th>Per hour</th>
            </tr>
          </thead>
          <tbody>
            {chances.map((r) => (
              <tr key={r.name} className="static">
                <td>{r.name}</td>
                <td>{r.chance > 0 ? fmt(drop.oneIn / r.chance) : '—'}</td>
                <td>{count(total * r.chance)}</td>
                <td>{count(perHour * r.chance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
