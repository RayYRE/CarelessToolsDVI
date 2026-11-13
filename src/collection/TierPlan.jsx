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
  index: (s) => s.indices[0],
  points: (s) => s.points,
  // What the Actions cell shows: gathers to reach a by-product's tier, else the row's count
  actions: (s) => (s.byProduct ? s.byGathers : (s.itemGathers ?? s.items)),
  perAction: (s) => pointsPerAction(s),
}

// Gathering: gathers of this item already counted by earlier rows (the column is cumulative)
const earlierGathers = (s) => Math.max(0, Math.round((s.itemGathers ?? 0) - s.items))

const perActionText = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

// Collection points per item crafted, or per gather, counting the by-product points the row's
// gathers earn from other rarities too; 0 when nothing is done or scored
const pointsPerAction = (s) =>
  !s.done && s.items > 0 ? (s.points + (s.sidePoints ?? 0)) / s.items : 0


// Column heading that sorts on click: highest first, then lowest first, then plan order
function SortHeader({ label, column, sort, onSort, title }) {
  const active = sort?.column === column
  const next = !active ? { column, dir: -1 } : sort.dir === -1 ? { column, dir: 1 } : null
  return (
    <th title={title} aria-sort={active ? (sort.dir === -1 ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="sort-header" onClick={() => onSort(next)}>
        {label}
        {active && (sort.dir === -1 ? ' ↓' : ' ↑')}
      </button>
    </th>
  )
}

// The # heading: plan order (shown ↑, the default for gathering) or reversed (↓). Clicking it
// from any other sort goes to plan order first, then toggles.
function IndexHeader({ sort, onSort }) {
  const reversed = sort?.column === 'index'
  const inOrder = sort === null
  const next = inOrder ? { column: 'index', dir: -1 } : null
  return (
    <th aria-sort={reversed ? 'descending' : inOrder ? 'ascending' : 'none'}>
      <button type="button" className="sort-header" title="Plan order" onClick={() => onSort(next)}>
        #{inOrder && ' ↑'}
        {reversed && ' ↓'}
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
function groupSteps(rows, merge = true) {
  const groups = new Map()
  rows.forEach((s, i) => {
    const key = merge ? `${s.item}|${s.rarity}` : `row${i}`
    const g = groups.get(key)
    if (!g) {
      // Copy each material too: the totals below must not change the plan's own steps,
      // which are reused on every render
      groups.set(key, {
        ...s,
        materials: s.materials.map((m) => ({ ...m })),
        indices: [i],
      })
      return
    }
    g.indices.push(i)
    g.to = s.to
    g.items += s.items
    g.itemGathers = s.itemGathers
    g.points += s.points
    g.sidePoints = (g.sidePoints ?? 0) + (s.sidePoints ?? 0)
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

export default function TierPlan({
  plan,
  startLevel,
  gathering,
  onRemove,
  onClear,
  onReorder,
  canMaximise,
  onMaximise,
  note,
  search,
}) {
  const { rows } = plan
  // Processing plans start sorted by points per action, best first; gathering plans start in
  // plan order. Click a heading to change it (null = plan order).
  const [chosen, setSort] = useState(undefined)
  const sort = chosen === undefined ? (gathering ? null : { column: 'perAction', dir: -1 }) : chosen
  // Grouped rows in plan order (by each group's first step), or sorted by a column
  const shown = groupSteps(rows, !gathering)
  if (sort) {
    const value = SORT_VALUES[sort.column]
    shown.sort((a, b) => (value(a) - value(b)) * sort.dir || a.indices[0] - b.indices[0])
  }
  const sortProps = { sort, onSort: setSort }
  // Drag a row by its handle onto another to move it there. The new plan order is what is shown
  // (so a sorted view becomes the plan order), with each row's steps kept together.
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null)
  const rowKey = (s) => String(s.indices[0])
  const endDrag = () => {
    setDrag(null)
    setOver(null)
  }
  const dropOn = (targetKey) => {
    const from = shown.findIndex((s) => rowKey(s) === drag)
    const to = shown.findIndex((s) => rowKey(s) === targetKey)
    endDrag()
    if (from < 0 || to < 0 || from === to) return
    const next = [...shown]
    next.splice(to, 0, next.splice(from, 1)[0])
    setSort(null)
    onReorder(next.flatMap((s) => s.indices))
  }
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
                ? 'Plan the best tiers by the ranking and depth chosen in Settings'
                : canMaximise
                ? 'Plan the tiers that earn the most points with what is in your storage'
                : 'Import from the userscript (v1.6 or later) to plan with your storage'
            }
            onClick={onMaximise}
          >
            Calculate points (Uses items in Bank | Userscript 1.6)
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
            {plan.levels ? (
              <>
                <div className="stat">
                  <span>Levels</span>
                  <strong className="levels">
                    {Object.entries(plan.levels).map(([skill, l]) => (
                      <span key={skill}>
                        {skill} {l.from === l.to ? l.to : `${l.from} → ${l.to}`}
                      </span>
                    ))}
                  </strong>
                </div>
                <div className="stat">
                  <span>XP gained</span>
                  <strong>{fmt(plan.xpGained)}</strong>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
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
            <table className="align-center">
              <thead>
                <tr>
                  <th aria-label="Drag to reorder" />
                  <IndexHeader {...sortProps} />
                  <th className="left">Item</th>
                  <SortHeader label="Rarity" column="rarity" {...sortProps} />
                  <SortHeader label="Tier" column="tier" {...sortProps} />
                  <SortHeader
                    label={gathering ? 'Actions (running total)' : 'Actions'}
                    column="actions"
                    title={
                      gathering
                        ? 'Gathers of this item needed by the end of this row. All rarities come from the same gathers, so rows overlap instead of adding up.'
                        : undefined
                    }
                    {...sortProps}
                  />
                  {!gathering && <th>Cost</th>}
                  <th>Level after</th>
                  <SortHeader label="Points" column="points" {...sortProps} />
                  <SortHeader label="Pts/action" column="perAction" {...sortProps} />
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr
                    key={rowKey(s)}
                    className={`static${s.byProduct ? ' by-product' : ''}${drag === rowKey(s) ? ' dragging' : ''}${over === rowKey(s) && !(drag === rowKey(s)) ? ' drop-target' : ''}`}
                    onDragOver={(e) => {
                      if (!drag) return
                      e.preventDefault()
                      setOver(rowKey(s))
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      dropOn(rowKey(s))
                    }}
                  >
                    <td>
                      <span
                        className="drag-handle"
                        draggable
                        title="Drag to reorder"
                        aria-label={`Drag ${s.item} (${s.rarity}) to reorder`}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', rowKey(s))
                          const row = e.currentTarget.closest('tr')
                          if (row) e.dataTransfer.setDragImage(row, 0, 0)
                          setDrag(rowKey(s))
                        }}
                        onDragEnd={endDrag}
                      >
                        ⠿
                      </span>
                    </td>
                    <td>{s.indices[0] + 1}</td>
                    <td className="left">
                      <span className="with-icon">
                        <Icon src={iconFor(s.item)} />
                        {s.item}
                      </span>
                      {plan.levels && (
                        <div>
                          <small className="cat">{s.skill}</small>
                        </div>
                      )}
                      {s.locked && <small className="hint-inline warn"> needs level {s.needLevel}</small>}
                    </td>
                    <td className={`rarity-${s.rarity.toLowerCase()}`}>{s.rarity}</td>
                    <td>{s.done ? 'All done' : `${fmt(s.from)} → ${formatMilestone(s.to)}`}</td>
                    <td>
                      {s.byProduct ? (
                        <span title="Gathers to reach this tier. They happen during the row above: no extra actions needed">
                          ↑ {fmt(s.byGathers)}
                        </span>
                      ) : (
                        <>
                          {fmt(gathering ? s.itemGathers : s.items)}
                          {gathering && earlierGathers(s) > 0 && (
                            <small
                              className="hint-inline"
                              title={`Cumulative: includes ${fmt(earlierGathers(s))} gathers already counted by earlier ${s.item} rows in the plan, so this row only adds ${fmt(s.items)}`}
                            >
                              {' '}
                              (+{fmt(s.items)} · {fmt(earlierGathers(s))} earlier)
                            </small>
                          )}
                        </>
                      )}
                    </td>
                    {!gathering && (
                      <td className="cost-cell left">
                        <Materials list={s.materials} />
                      </td>
                    )}
                    <td>
                      {s.levelBefore === s.levelAfter ? s.levelAfter : `${s.levelBefore} → ${s.levelAfter}`}
                    </td>
                    <td>
                      {s.byProduct ? (
                        <span title="Earned by the gathers of a row above: counted in the plan total and that row's Pts/action">
                          ↑+{fmt(s.byPoints)}
                        </span>
                      ) : (
                        <>
                          {s.points ? `+${fmt(s.points)}` : '—'}
                          {s.sidePoints > 0 && (
                            <small
                              className="hint-inline"
                              title={`+${fmt(s.sidePoints)} more points from other rarities that these gathers also fill`}
                            >
                              {' '}
                              +{fmt(s.sidePoints)}
                            </small>
                          )}
                        </>
                      )}
                    </td>
                    <td>{pointsPerAction(s) ? perActionText(pointsPerAction(s)) : '—'}</td>
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
