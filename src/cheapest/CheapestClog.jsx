import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import IconSelect from '../components/IconSelect.jsx'
import { fmt } from '../core/format.js'
import { usePersistentState } from '../core/storage.js'
import { formatMilestone } from '../game/collection.js'
import { iconFor, skillIcon } from '../game/icons.js'
import { SKILL_GROUPS } from '../game/jobs.js'
import { RARITIES } from '../game/rarities.js'
import { CRAFT_MODES, MARKET_FEE_BP, PRICE_MODES, SELL_MODES, cheapestSteps } from './costs.js'
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
        <Line label={selling ? 'Net cost' : 'Cost'} strong>
          {fmt(r.net)}
        </Line>
        <Line label="Points">{r.points}</Line>
        <Line label="Coins / point" strong>
          {fmt(r.perPoint)}
        </Line>
        <Line label="Actions">{fmt(r.attempts)}</Line>
        <Line label="XP gained">{fmt(r.xpGained)}</Line>
      </section>
    </div>
  )
}

// Settings button with a pop-out for which market price materials are costed at, whether they
// are bought or crafted, what the crafted items sell for, and which rarities are listed (`off`
// lists those switched off)
function MarketSettings({ mode, craft, sell, off, onChange }) {
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
        title="Choose the prices used for buying and selling, whether materials are bought or crafted, and which rarities are listed"
        onClick={() => setOpen(!open)}
      >
        Settings
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Price settings">
          <div className="popover-columns" style={{ gridTemplateColumns: 'repeat(2, auto)' }}>
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
            <legend>Rarities</legend>
            {RARITIES.map((r) => (
              <label key={r.name} className="check">
                <input
                  type="checkbox"
                  checked={!off.includes(r.name)}
                  onChange={() =>
                    onChange({ off: off.includes(r.name) ? off.filter((n) => n !== r.name) : [...off, r.name] })
                  }
                />
                <span className={`rarity-${r.name.toLowerCase()}`}>{r.name}</span>
              </label>
            ))}
          </fieldset>
          </div>
        </div>
      )}
    </span>
  )
}

// Draft: the next collection log tiers you could craft, cheapest coins per point first,
// priced from the market prices the userscript captures (Import tab).
export default function CheapestClog({ profile }) {
  const [settings, set] = usePersistentState('cheapest-clog', { skill: 'All', mode: 'ask', craft: 'cheapest', sell: 'bid', off: [], hidden: [] })
  const { skill, mode, craft, sell, off, hidden } = settings
  const rarities = useMemo(() => RARITIES.filter((r) => !off.includes(r.name)), [off])
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
    () => (hasPrices && !missingAverage ? cheapestSteps({ profile: { ...profile, prices }, mode, craft, sell, rarities }) : []),
    [profile, prices, hasPrices, mode, craft, sell, rarities, missingAverage],
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
            <MarketSettings mode={mode} craft={craft} sell={sell} off={off} onChange={set} />
          </div>
        </div>
        <p className="hint">
          Prices from {prices.capturedAt ? new Date(prices.capturedAt).toLocaleString() : 'unknown time'} (
          {prices.source === 'market' ? 'live market' : 'public price feed'}
          {!imported && <>, because no prices are imported: see the <a href="#import">Import tab</a></>}). Materials are costed at the {modeInfo.label.toLowerCase()} price
          ({modeInfo.hint.toLowerCase()}); {craftInfo.hint.toLowerCase()}. ⓘ marks a material with no market
          price at this setting, costed at its craft price.
          {selling
            ? ` Crafted items are sold at the ${sellInfo.label.toLowerCase()} price after the ${(prices.taxBp ?? MARKET_FEE_BP) / 100}% market fee, and coins / point is the cost less the sale.`
            : ' Selling is off: coins / point is just the cost of the materials.'}
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
                <th>Points</th>
                <th>{selling ? 'Net cost' : 'Cost'}</th>
                <th>Coins / point</th>
                <th title="Crafting attempts the step takes, burned or failed ones included">Actions</th>
                <th>Materials</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const key = `${r.job}|${r.rarity}`
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
                      <td>{r.points}</td>
                      <td>
                        {selling ? (
                          <div className="net-cell">
                            <strong>{fmt(r.net)}</strong>
                            <small>
                              {fmt(r.cost)} −{' '}
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
                              )}
                            </small>
                          </div>
                        ) : (
                          fmt(r.cost)
                        )}
                      </td>
                      <td className="strong-cell">{fmt(r.perPoint)}</td>
                      <td>{fmt(r.attempts)}</td>
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
