import { useState } from 'react'
import { fmt } from '../core/format.js'
import Icon from '../components/Icon.jsx'
import { formatMilestone } from '../game/collection.js'
import { iconFor } from '../game/icons.js'
import { RARITIES } from '../game/rarities.js'
import SearchSettings from './SearchSettings.jsx'

// Columns the steps can be sorted by. Sorting only changes the display: the plan still runs
// in its own order (shown in #), since each step starts where the ones before it left off.
const SORT_VALUES = {
  rarity: (s) => RARITIES.findIndex((r) => r.name === s.rarity),
  tier: (s) => s.to,
  points: (s) => s.points,
}

// Column heading that sorts on click: highest first, then lowest first, then plan order
function SortHeader({ label, column, sort, onSort }) {
  const active = sort?.column === column
  const next = !active ? { column, dir: -1 } : sort.dir === -1 ? { column, dir: 1 } : null
  return (
    <th aria-sort={active ? (sort.dir === -1 ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="sort-header" onClick={() => onSort(next)}>
        {label}
        {active && (sort.dir === -1 ? ' ↓' : ' ↑')}
      </button>
    </th>
  )
}

// "1,234 Iron, 2,468 Coal", with rarer materials coloured by rarity
function Materials({ list }) {
  if (!list.length) return '—'
  return list.map((m, i) => (
    <span key={`${m.rarity}|${m.material}`} className="material">
      {i > 0 && ', '}
      {fmt(m.quantity)} <Icon src={iconFor(m.material)} size={16} />
      {m.rarity === 'Common' ? (
        m.material
      ) : (
        // Rarity shown by colour only to keep the table narrow; the name is in the tooltip
        <span className={`rarity-${m.rarity.toLowerCase()}`} title={`${m.rarity} ${m.material}`}>
          {m.material}
        </span>
      )}
    </span>
  ))
}

// One table row per item and rarity: its planned tiers merged, e.g. 1 → 10 and 10 → 100
// become 1 → 100. Rows keep the plan positions of their steps, for # and for removing them.
function groupSteps(rows) {
  const groups = new Map()
  rows.forEach((s, i) => {
    const key = `${s.item}|${s.rarity}`
    const g = groups.get(key)
    if (!g) {
      groups.set(key, { ...s, materials: [...s.materials], indices: [i] })
      return
    }
    g.indices.push(i)
    g.to = s.to
    g.items += s.items
    g.points += s.points
    g.levelAfter = s.levelAfter
    g.done = g.done && s.done
    for (const m of s.materials) {
      const same = g.materials.find((x) => x.material === m.material && x.rarity === m.rarity)
      if (same) same.quantity += m.quantity
      else g.materials.push({ ...m })
    }
  })
  return [...groups.values()]
}

export default function TierPlan({ plan, startLevel, onRemove, onClear, canMaximise, onMaximise, note, search }) {
  const { rows } = plan
  const [sort, setSort] = useState(null)
  // Grouped rows in plan order (by each group's first step), or sorted by a column
  const shown = groupSteps(rows)
  if (sort) {
    const value = SORT_VALUES[sort.column]
    shown.sort((a, b) => (value(a) - value(b)) * sort.dir || a.indices[0] - b.indices[0])
  }
  const sortProps = { sort, onSort: setSort }
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Tier plan ({rows.length} steps)</h2>
        <div className="chips">
          {rows.length > 0 && (
            <button type="button" className="chip" title="Remove every planned step" onClick={onClear}>
              Clear
            </button>
          )}
          <button
            type="button"
            className="chip"
            disabled={!canMaximise}
            title={
              canMaximise
                ? 'Plan the tiers that earn the most points with what is in your storage'
                : 'Import from the userscript (v1.6 or later) to plan with your storage'
            }
            onClick={onMaximise}
          >
            Calculate points (Greedy search | Userscript 1.6)
          </button>
          <SearchSettings {...search} />
        </div>
      </div>
      {note && <p className="hint">{note}</p>}
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
              <span>Collection points</span>
              <strong>+{fmt(plan.points)}</strong>
            </div>
          </div>
          <p className="plan-cost">
            <span>Total cost</span> <Materials list={plan.materials} />
          </p>
          <div className="table-wrap">
            <table className="align-left">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <SortHeader label="Rarity" column="rarity" {...sortProps} />
                  <SortHeader label="Tier" column="tier" {...sortProps} />
                  <th>Items needed</th>
                  <th>Cost</th>
                  <th>Level after</th>
                  <SortHeader label="Points" column="points" {...sortProps} />
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={`${s.item}|${s.rarity}`} className="static">
                    <td>{s.indices[0] + 1}</td>
                    <td>
                      <span className="with-icon">
                        <Icon src={iconFor(s.item)} />
                        {s.item}
                      </span>
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
                    <td>{s.points ? `+${fmt(s.points)}` : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="exclude"
                        title={`Remove ${s.item} (${s.rarity}) from the plan`}
                        aria-label={`Remove ${s.item} (${s.rarity}) from the plan`}
                        onClick={() => onRemove(s.indices)}
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
