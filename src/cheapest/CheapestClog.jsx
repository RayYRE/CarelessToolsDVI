import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import IconSelect from '../components/IconSelect.jsx'
import { fmt, formatDuration } from '../core/format.js'
import { usePersistentState } from '../core/storage.js'
import { formatMilestone } from '../game/collection.js'
import { iconFor, skillIcon } from '../game/icons.js'
import { SKILL_GROUPS } from '../game/jobs.js'
import { RARITIES } from '../game/rarities.js'
import { CRAFT_MODES, PRICE_MODES, SELL_MODES, cheapestSteps } from './costs.js'
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
  const [settings, set] = usePersistentState('cheapest-clog', { skill: 'All', mode: 'ask', craft: 'cheapest', sell: 'bid', off: [] })
  const { skill, mode, craft, sell, off } = settings
  const rarities = useMemo(() => RARITIES.filter((r) => !off.includes(r.name)), [off])
  const setSkill = (s) => set({ skill: s })
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
  const shown = rows.filter((r) => skill === 'All' || r.skill === skill).slice(0, LIMIT)

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
          <h2>Cheapest clog ({shown.length} steps)</h2>
          <div className="chips">
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
            ? ` Crafted items are sold at the ${sellInfo.label.toLowerCase()} price${prices.taxBp ? ` after ${prices.taxBp / 100}% market tax` : ''}, and coins / point is the cost less the sale.`
            : ' Selling is off: coins / point is just the cost of the materials.'}
          {missingAverage && ' The averages come from the price feed, which has not loaded.'} Gathering is not
          priced yet.
        </p>
        <div className="table-wrap">
          <table className="align-center">
            <thead>
              <tr>
                <th>Item</th>
                <th>Rarity</th>
                <th>Tier</th>
                <th>Points</th>
                <th>Cost</th>
                {selling && <th>Sells for</th>}
                {selling && <th>Net cost</th>}
                <th>Coins / point</th>
                <th>Time</th>
                <th>Materials</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.job}|${r.rarity}`}>
                  <td className="left">
                    <span className="with-icon">
                      <Icon src={iconFor(r.item)} />
                      <span>{r.item}</span>
                    </span>
                  </td>
                  <td className={`rarity-${r.rarity.toLowerCase()}`}>{r.rarity}</td>
                  <td>
                    {formatMilestone(r.from)} → {formatMilestone(r.to)}
                  </td>
                  <td>{r.points}</td>
                  <td>{fmt(r.cost)}</td>
                  {selling && (
                    <td>
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
                    </td>
                  )}
                  {selling && <td>{fmt(r.net)}</td>}
                  <td>{fmt(r.perPoint)}</td>
                  <td>{formatDuration(r.seconds)}</td>
                  <td className="cost-cell left">
                    <Materials parts={r.parts} priceLabel={modeInfo.label.toLowerCase()} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!shown.length && <p className="hint">Nothing priced for this skill yet.</p>}
      </section>
    </>
  )
}
