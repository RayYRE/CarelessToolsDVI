import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import IconSelect from '../components/IconSelect.jsx'
import { fmt } from '../core/format.js'
import { usePersistentState } from '../core/storage.js'
import { MILESTONES, formatMilestone } from '../game/collection.js'
import { iconFor, skillIcon } from '../game/icons.js'
import { SKILL_GROUPS } from '../game/jobs.js'
import { RARITIES } from '../game/rarities.js'
import { CRAFT_MODES, DEFAULT_TIER_RANGE, MARKET_FEE_BP, PRICE_MODES, SELL_MODES, cheapestSteps } from './costs.js'
import { mergePrices, useFeedPrices } from './priceFeed.js'

const LIMIT = 50

// "1,234 Iron, 2,468 Coal", with rarer materials coloured by rarity and a note on those made
// from their own recipe instead of bought
function Materials({ parts, priceLabel }) {
  return parts.map((p, i) => (
    <span key={`${p.rarity}|${p.material}`} className="material">
      {i > 0 && ', '}
      {fmt(p.quantity)} <Icon src={iconFor(p.material)} size={16} />
      {p.rarity === 'Common' ? (
        p.material
      ) : (
        <span className={`rarity-${p.rarity.toLowerCase()}`} title={`${p.rarity} ${p.material}`}>
          {p.material}
        </span>
      )}
      {p.how === 'make' && (
        <small title={p.noPrice ? '' : 'Made from its recipe'}> (made)</small>
      )}
      {p.noPrice && (
        <span
          className="price-flag"
          role="img"
          aria-label="No market price"
          title={`No ${priceLabel} price on the market for this material (or something it is made from), so its craft price is used`}
        >
          {' ⓘ'}
        </span>
      )}
    </span>
  ))
}

// Green for a profit, red for a loss
const tone = (n) => (n > 0 ? 'profit' : n < 0 ? 'loss' : undefined)

// One line of a detail card: a label and a value
const Line = ({ label, children, strong }) => (
  <div className={`detail-line${strong ? ' strong' : ''}`}>
    <span>{label}</span>
    <span>{children}</span>
  </div>
)

// The cards shown when a row is opened: what the materials cost, what the crafted items sell
// for, and what the step gives
function Detail({ r, selling, sellInfo, modeInfo }) {
  const gross = (r.unitSale ?? 0) * r.items
  return (
    <div className="detail-cards">
      <section className="detail-card">
        <h3>Materials ({r.parts.length})</h3>
        <p className="detail-sub">
          Costed at the {modeInfo.label.toLowerCase()} price, for {fmt(r.attempts)} actions
        </p>
        {r.parts.map((p) => (
          <Line
            key={`${p.rarity}|${p.material}`}
            label={
              <span className="with-icon">
                <Icon src={iconFor(p.material)} size={16} />
                <span className={p.rarity === 'Common' ? undefined : `rarity-${p.rarity.toLowerCase()}`} title={`${p.rarity} ${p.material}`}>
                  {p.material}
                </span>
                {p.how === 'make' && <small> (made)</small>}
                {p.noPrice && (
                  <span
                    className="price-flag"
                    role="img"
                    aria-label="No market price"
                    title={`No ${modeInfo.label.toLowerCase()} price on the market for this material (or something it is made from), so its craft price is used`}
                  >
                    {' ⓘ'}
                  </span>
                )}
              </span>
            }
          >
            <small>
              {fmt(p.quantity)} × {fmt(p.unit)} ={' '}
            </small>
            {fmt(p.quantity * p.unit)}
          </Line>
        ))}
        <Line label="Total cost" strong>
          {fmt(r.cost)}
        </Line>
      </section>

      <section className="detail-card">
        <h3>Sell</h3>
        {!selling ? (
          <p className="detail-sub">Selling is off.</p>
        ) : r.noSale ? (
          <p className="detail-sub">
            No {sellInfo.label.toLowerCase()} price on the market for this item, so the sale is not counted.
          </p>
        ) : (
          <>
            <p className="detail-sub">At the {sellInfo.label.toLowerCase()} price</p>
            <Line label="Price each">{fmt(r.unitSale)}</Line>
            <Line label="Items crafted">{fmt(r.items)}</Line>
            <Line label="Gross">{fmt(gross)}</Line>
            <Line label={`Market fee (${r.taxBp / 100}%)`}>-{fmt(gross - r.revenue)}</Line>
            <Line label="Sale" strong>
              {fmt(r.revenue)}
            </Line>
          </>
        )}
      </section>

      <section className="detail-card">
        <h3>Result</h3>
        {selling ? (
          <Line label="Profit" strong>
            <span className={tone(r.profit)}>{fmt(r.profit)}</span>
          </Line>
        ) : (
          <Line label="Cost" strong>
            {fmt(r.cost)}
          </Line>
        )}
        <Line label="Points">{r.points}</Line>
        <Line label="Profit / point" strong>
          <span className={tone(r.perPoint)}>{fmt(r.perPoint)}</span>
        </Line>
        <Line label="Actions">{fmt(r.attempts)}</Line>
        <Line label="XP gained">{fmt(r.xpGained)}</Line>
      </section>
    </div>
  )
}

// Tier ranges per rarity: { min, max, off }. Older saves are converted: the one "Go up to"
// (`upTo`, null = next tier) for every rarity, rarities switched off (`off`), and a max of null
// (the old "Off" choice) all become this shape.
function tiersFrom({ tiers, upTo = null, off = [] }) {
  const from = tiers ?? Object.fromEntries(
    RARITIES.map((r) => [r.name, { min: 1, max: upTo ?? 'next', off: off.includes(r.name) }]),
  )
  return Object.fromEntries(
    Object.entries(from).map(([name, t]) => [name, t.max === null ? { ...t, max: 'next', off: true } : t]),
  )
}

// <select> values are strings: 'next' = next tier, else a milestone
const parseMax = (v) => (v === 'next' ? 'next' : Number(v))

// One row per rarity: whether it's listed, and the lowest and highest tier it lists
function TierRanges({ tiers, onChange }) {
  const set = (rarity, patch) =>
    onChange({ ...tiers, [rarity]: { ...(tiers[rarity] ?? DEFAULT_TIER_RANGE), ...patch } })
  return (
    <fieldset className="tier-ranges">
      <legend>Tiers per rarity</legend>
      <div className="tier-grid">
        <span />
        <span title="Only list tiers that end at or above this count">Min</span>
        <span title="List tiers up to this count; Next tier lists just the one after what you have">Max</span>
        {RARITIES.map((r) => {
          const { min, max, off } = tiers[r.name] ?? DEFAULT_TIER_RANGE
          // A numeric max below min lists nothing
          const empty = typeof max === 'number' && max < min
          return (
            <Fragment key={r.name}>
              <label className="check" title={off ? `List ${r.name}` : `Stop listing ${r.name}`}>
                <input type="checkbox" checked={!off} onChange={() => set(r.name, { off: !off })} />
                <span className={`rarity-${r.name.toLowerCase()}${off ? ' muted' : ''}`}>{r.name}</span>
              </label>
              <select
                aria-label={`${r.name} lowest tier`}
                value={min}
                disabled={off}
                className={empty ? 'invalid' : undefined}
                onChange={(e) => set(r.name, { min: Number(e.target.value) })}
              >
                {MILESTONES.map((m) => (
                  <option key={m} value={m}>
                    {formatMilestone(m)}
                  </option>
                ))}
              </select>
              <select
                aria-label={`${r.name} highest tier`}
                value={String(max)}
                disabled={off}
                className={empty ? 'invalid' : undefined}
                title={empty ? 'Max is below Min, so nothing is listed for this rarity' : undefined}
                onChange={(e) => set(r.name, { max: parseMax(e.target.value) })}
              >
                <option value="next">Next tier</option>
                {MILESTONES.map((m) => (
                  <option key={m} value={m}>
                    {formatMilestone(m)}
                  </option>
                ))}
              </select>
            </Fragment>
          )
        })}
      </div>
    </fieldset>
  )
}

// Settings button with a pop-out for which market price materials are costed at, whether they
// are bought or crafted, what the crafted items sell for, and which tiers each rarity lists
function MarketSettings({ mode, craft, sell, tiers, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on a click outside the pop-out or on Escape
  useEffect(() => {
    if (!open) return
    const onPointer = (e) => ref.current?.contains(e.target) || setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="popover-anchor" ref={ref}>
      <button
        type="button"
        className="chip"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Choose the prices used for buying and selling, whether materials are bought or crafted, and which tiers each rarity lists"
        onClick={() => setOpen(!open)}
      >
        Settings
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Price settings">
          <div className="popover-columns" style={{ gridTemplateColumns: 'repeat(3, auto)' }}>
          <fieldset>
            <legend>Material price</legend>
            {PRICE_MODES.map((m) => (
              <label key={m.id} className="check" title={m.hint}>
                <input
                  type="radio"
                  name="price-mode"
                  checked={m.id === mode}
                  onChange={() => onChange({ mode: m.id })}
                />
                {m.label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Sell crafted items at</legend>
            {SELL_MODES.map((m) => (
              <label key={m.id} className="check" title={m.hint}>
                <input
                  type="radio"
                  name="sell-mode"
                  checked={m.id === sell}
                  onChange={() => onChange({ sell: m.id })}
                />
                {m.label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Materials</legend>
            {CRAFT_MODES.map((m) => (
              <label key={m.id} className="check" title={m.hint}>
                <input
                  type="radio"
                  name="craft-mode"
                  checked={m.id === craft}
                  onChange={() => onChange({ craft: m.id })}
                />
                {m.label}
              </label>
            ))}
          </fieldset>
          <TierRanges tiers={tiers} onChange={(next) => onChange({ tiers: next })} />
          </div>
        </div>
      )}
    </span>
  )
}

// Draft: the next collection log tiers you could craft, cheapest coins per point first,
// priced from the market prices the userscript captures (Import tab).
export default function CheapestClog({ profile }) {
  const [settings, set] = usePersistentState('cheapest-clog', { skill: 'All', mode: 'ask', craft: 'cheapest', sell: 'bid', hidden: [] })
  const { skill, mode, craft, sell, hidden } = settings
  // Lowest and highest tier listed per rarity (older saves are converted on the fly)
  const tiers = useMemo(() => tiersFrom(settings), [settings])
  const setSkill = (s) => set({ skill: s })
  // Rows opened to show their cost details
  const [open, setOpen] = useState(() => new Set())
  const toggle = (key) =>
    setOpen((s) => {
      const next = new Set(s)
      if (!next.delete(key)) next.add(key)
      return next
    })
  const modeInfo = PRICE_MODES.find((m) => m.id === mode) ?? PRICE_MODES[0]
  const craftInfo = CRAFT_MODES.find((m) => m.id === craft) ?? CRAFT_MODES[0]

  // The feed is always loaded: it is the only source of the averages, and the fallback when no
  // prices are imported. Imported prices (live from the market) win for Ask and Bid.
  const feed = useFeedPrices(true)
  const imported = Object.keys(profile.prices?.items ?? {}).length > 0
  // Live ask and bid from the import, with the feed's averages added
  const prices = useMemo(
    () => mergePrices(imported ? profile.prices : null, feed.prices),
    [imported, profile.prices, feed.prices],
  )
  const hasPrices = Boolean(prices)
  // Averages only exist in the feed
  const missingAverage = (mode.startsWith('avg') || sell.startsWith('avg')) && !feed.prices
  const selling = sell !== 'off'
  const sellInfo = SELL_MODES.find((m) => m.id === sell) ?? SELL_MODES[0]

  const rows = useMemo(
    () => (hasPrices && !missingAverage ? cheapestSteps({ profile: { ...profile, prices }, mode, craft, sell, tiers }) : []),
    [profile, prices, hasPrices, mode, craft, sell, tiers, missingAverage],
  )
  // Rows removed with the X, remembered per tier so the next tier of an item still shows up
  const rowKey = (r) => `${r.job}|${r.rarity}|${r.to}`
  const visible = rows.filter((r) => (skill === 'All' || r.skill === skill) && !hidden.includes(rowKey(r)))
  const shown = visible.slice(0, LIMIT)
  const hiddenCount = rows.filter((r) => (skill === 'All' || r.skill === skill) && hidden.includes(rowKey(r))).length

  if (!hasPrices) {
    return (
      <section className="panel">
        <p className="hint">
          {feed.error
            ? `Could not load the price feed (${feed.error}). Update the CarelessToolsImport userscript (1.7 or newer) and import on the Import tab instead.`
            : 'Loading market prices…'}
        </p>
      </section>
    )
  }

  return (
    <>
      <section className="panel controls">
        <IconSelect
          label="Skill"
          value={skill}
          onChange={setSkill}
          options={[
            { value: 'All', label: 'All' },
            ...SKILL_GROUPS.Processing.map((s) => ({ value: s, label: s, icon: skillIcon(s) })),
          ]}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Cheapest collection log ({shown.length} steps)</h2>
          <div className="chips">
            {hiddenCount > 0 && (
              <button
                type="button"
                className="chip"
                title="Show the rows you removed again"
                onClick={() => set({ hidden: [] })}
              >
                Restore removed ({hiddenCount})
              </button>
            )}
            <MarketSettings mode={mode} craft={craft} sell={sell} tiers={tiers} onChange={set} />
          </div>
        </div>
        <p className="hint">
          Prices from {prices.capturedAt ? new Date(prices.capturedAt).toLocaleString() : 'unknown time'} (
          {prices.source === 'market' ? 'live market' : 'public price feed'}
          {!imported && <>, because no prices are imported: see the <a href="#import">Import tab</a></>}). Materials are costed at the {modeInfo.label.toLowerCase()} price
          ({modeInfo.hint.toLowerCase()}); {craftInfo.hint.toLowerCase()}. ⓘ marks a material with no market
          price at this setting, costed at its craft price.
          {selling
            ? ` Crafted items are sold at the ${sellInfo.label.toLowerCase()} price after the ${(prices.taxBp ?? MARKET_FEE_BP) / 100}% market fee. Profit is the sale minus the materials' cost, and profit / point divides that by the points.`
            : " Selling is off, so profit / point is just the materials' cost per point, as a loss."}
          {missingAverage && ' The averages come from the price feed, which has not loaded.'} Gathering is not
          priced yet.
        </p>
        <div className="table-wrap">
          <table className="align-center">
            <thead>
              <tr>
                <th aria-label="Show details" />
                <th>Item</th>
                <th>Tier</th>
                <th title="Crafting attempts the step takes, burned or failed ones included">Actions</th>
                <th>{selling ? 'Profit' : 'Cost'}</th>
                <th>Profit / point</th>
                <th>Points</th>
                <th>Materials</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const key = rowKey(r)
                const isOpen = open.has(key)
                return (
                  <Fragment key={key}>
                    <tr className={`clickable${isOpen ? ' open' : ''}`} onClick={() => toggle(key)}>
                      <td>
                        <button
                          type="button"
                          className="row-toggle"
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? 'Hide' : 'Show'} cost details for ${r.rarity} ${r.item}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggle(key)
                          }}
                        >
                          {isOpen ? '▼' : '▶'}
                        </button>
                      </td>
                      <td className="left">
                        <span className="with-icon">
                          <Icon src={iconFor(r.item)} />
                          <span
                            className={r.rarity === 'Common' ? undefined : `rarity-${r.rarity.toLowerCase()}`}
                            title={`${r.rarity} ${r.item}`}
                          >
                            {r.item}
                          </span>
                        </span>
                      </td>
                      <td>
                        {formatMilestone(r.from)} → {formatMilestone(r.to)}
                      </td>
                      <td>{fmt(r.attempts)}</td>
                      <td>
                        {selling ? (
                          <div className="net-cell">
                            <strong className={tone(r.profit)}>{fmt(r.profit)}</strong>
                            <small>
                              {r.noSale ? (
                                <span
                                  className="price-flag"
                                  role="img"
                                  aria-label="No sell price"
                                  title={`No ${sellInfo.label.toLowerCase()} price on the market for this item, so the sale is not counted`}
                                >
                                  ⓘ
                                </span>
                              ) : (
                                fmt(r.revenue)
                              )}{' '}
                              − {fmt(r.cost)}
                            </small>
                          </div>
                        ) : (
                          fmt(r.cost)
                        )}
                      </td>
                      <td className={`strong-cell ${tone(r.perPoint) ?? ''}`}>{fmt(r.perPoint)}</td>
                      <td>{r.points}</td>
                      <td className="cost-cell left">
                        <Materials parts={r.parts} priceLabel={modeInfo.label.toLowerCase()} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="exclude"
                          title={`Remove ${r.item} (${r.rarity}) from the list`}
                          aria-label={`Remove ${r.item} (${r.rarity}) from the list`}
                          onClick={(e) => {
                            e.stopPropagation()
                            set({ hidden: [...hidden, rowKey(r)] })
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="detail-row">
                        <td colSpan={9}>
                          <Detail r={r} selling={selling} sellInfo={sellInfo} modeInfo={modeInfo} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {!shown.length && <p className="hint">Nothing priced for this skill yet.</p>}
      </section>
    </>
  )
}
