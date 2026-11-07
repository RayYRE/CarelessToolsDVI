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
  perAction: (s) => pointsPerAction(s),
}

// Gathers for a side rarity to get from its start to its milestone (Infinity if it never rolls)
const sideGathers = (x) => (x.chance > 0 ? Math.ceil((x.to - x.from) / x.chance) : Infinity)

// Collection points per item crafted (processing skills); 0 when nothing is crafted or scored
const pointsPerAction = (s) => (!s.done && s.items > 0 ? s.points / s.items : 0)

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
      // Copy each material too: the totals below must not change the plan's own steps,
      // which are reused on every render
      groups.set(key, {
        ...s,
        materials: s.materials.map((m) => ({ ...m })),
        side: (s.side ?? []).map((x) => ({ ...x })),
        indices: [i],
      })
      return
    }
    // Other rarities filled while gathering: merge by rarity, first start to last tier
    for (const x of s.side ?? []) {
      const same = g.side.find((y) => y.rarity === x.rarity)
      if (same) {
        same.to = Math.max(same.to, x.to)
        same.points += x.points
      } else g.side.push({ ...x })
    }
    g.indices.push(i)
    g.to = s.to
    g.items += s.items
    g.itemGathers = s.itemGathers
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

// Gathering: all of an item's rarities come from the same gathers, so the step needing the most
// gathers becomes the item's main row and every shorter one is listed beneath it as a side row.
function foldByItem(groups) {
  const byItem = new Map()
  for (const g of groups) {
    const list = byItem.get(g.item)
    if (list) list.push(g)
    else byItem.set(g.item, [g])
  }
  const rank = (name) => RARITIES.findIndex((r) => r.name === name)
  const out = []
  for (const list of byItem.values()) {
    if (list.length === 1) {
      out.push(list[0])
      continue
    }
    const main = list.reduce((a, b) => ((b.itemGathers ?? 0) > (a.itemGathers ?? 0) ? b : a))
    const folded = { ...main, side: main.side.map((x) => ({ ...x })), indices: [...main.indices] }
    // Merge a rarity's range into the main row or into an existing side row of the same rarity
    const absorb = (x) => {
      const target = x.rarity === folded.rarity ? folded : folded.side.find((y) => y.rarity === x.rarity)
      if (target) {
        target.from = Math.min(target.from, x.from)
        target.to = Math.max(target.to, x.to)
        target.points += x.points
      } else folded.side.push({ rarity: x.rarity, from: x.from, to: x.to, points: x.points, chance: x.chance })
    }
    for (const g of list) {
      if (g === main) continue
      folded.indices.push(...g.indices)
      if (g.levelBefore !== undefined && g.indices[0] < main.indices[0]) folded.levelBefore = g.levelBefore
      absorb(g)
      g.side.forEach(absorb)
    }
    folded.indices.sort((a, b) => a - b)
    folded.side.sort((a, b) => rank(b.rarity) - rank(a.rarity))
    out.push(folded)
  }
  return out.sort((a, b) => a.indices[0] - b.indices[0])
}

export default function TierPlan({
  plan,
  startLevel,
  gathering,
  onRemove,
  onClear,
  canMaximise,
  onMaximise,
  note,
  search,
}) {
  const { rows } = plan
  // Processing plans start sorted by points per item, best first; click a heading to change it.
  // That column doesn't exist for gathering, so it is ignored there.
  const [chosen, setSort] = useState({ column: 'perAction', dir: -1 })
  const sort = gathering && chosen?.column === 'perAction' ? null : chosen
  // Grouped rows in plan order (by each group's first step), or sorted by a column
  const shown = gathering ? foldByItem(groupSteps(rows)) : groupSteps(rows)
  if (sort) {
    const value = SORT_VALUES[sort.column]
    shown.sort((a, b) => (value(a) - value(b)) * sort.dir || a.indices[0] - b.indices[0])
  }
  const sortProps = { sort, onSort: setSort }
  // Gathering: each item's gathers are shared by all its rarities, so count each item once
  const totalGathers = Object.values(Object.fromEntries(rows.map((s) => [s.item, s.itemGathers ?? 0]))).reduce(
    (sum, n) => sum + n,
    0,
  )
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
              gathering
                ? 'Plan the best tiers by points per gather, as many steps as the search depth in Settings'
                : canMaximise
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
              <span>XP after tier plan</span>
              <strong>{fmt(plan.xp)}</strong>
            </div>
            <div className="stat">
              <span>{gathering ? 'Expected gathers' : 'Items to craft'}</span>
              <strong>{fmt(gathering ? totalGathers : rows.reduce((sum, s) => sum + s.items, 0))}</strong>
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
                  {gathering ? (
                    <th title="Gathers of this item needed by the end of this row. All rarities come from the same gathers, so rows overlap instead of adding up.">
                      Gathers (running total)
                    </th>
                  ) : (
                    <th>Actions</th>
                  )}
                  <th>Cost</th>
                  <th>Level after</th>
                  <SortHeader label="Points" column="points" {...sortProps} />
                  {!gathering && <SortHeader label="Pts/action" column="perAction" {...sortProps} />}
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => [
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
                    <td>{fmt(gathering ? s.itemGathers : s.items)}</td>
                    <td>
                      <Materials list={s.materials} />
                    </td>
                    <td>
                      {s.levelBefore === s.levelAfter ? s.levelAfter : `${s.levelBefore} → ${s.levelAfter}`}
                    </td>
                    <td>{s.points ? `+${fmt(s.points)}` : '—'}</td>
                    {!gathering && (
                      <td>{pointsPerAction(s) ? pointsPerAction(s).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</td>
                    )}
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
                  </tr>,
                  // Other rarities this row's gathers push past a milestone, scored on their own
                  // fewest gathers to reach the milestone first
                  ...[...s.side].sort((a, b) => sideGathers(a) - sideGathers(b)).map((x) => (
                    <tr
                      key={`${s.item}|${s.rarity}|${x.rarity}`}
                      className="static side"
                      title={`Rolled while gathering ${s.item} (${s.rarity})`}
                    >
                      <td />
                      <td>↳ {s.item}</td>
                      <td className={`rarity-${x.rarity.toLowerCase()}`}>{x.rarity}</td>
                      <td>
                        {fmt(Math.floor(x.from))} → {formatMilestone(x.to)}
                      </td>
                      <td title="Gathers to reach this milestone. They happen on the way to the row above: no extra actions needed">
                        {gathering && x.chance > 0 ? fmt(sideGathers(x)) : '—'}
                      </td>
                      <td>—</td>
                      <td />
                      <td>+{fmt(x.points)}</td>
                      {!gathering && <td />}
                      <td />
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
