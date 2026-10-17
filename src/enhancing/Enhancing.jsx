import { useState } from 'react'
import { fmt, formatDuration } from '../core/format.js'
import { usePersistentState } from '../core/storage.js'
import {
  coinCost,
  compareProtectLevels,
  simulateRuns,
  successChance,
  voidshardCost,
} from './enhance.js'
import ItemPicker from './ItemPicker.jsx'
import { DEFAULT_ITEM_ID, TIERS, itemById } from './items.js'

const SECONDS_PER_ATTEMPT = 2.4
const MAX_TARGET_LEVEL = 30
const MAX_ENHANCING_LEVEL = 99
const MIN_PROTECTION_THRESHOLD = 2

// Coin cost multiplier per rarity (separate from the XP and collection multipliers)
const RARITY_OPTIONS = [
  [1, 'Common'],
  [3, 'Uncommon'],
  [8, 'Rare'],
  [20, 'Epic'],
  [50, 'Legendary'],
]
// Rarity name in lower case for a multiplier, e.g. 20 -> "epic"
const rarityKey = (multiplier) =>
  RARITY_OPTIONS.find(([value]) => value === +multiplier)[1].toLowerCase()

// sortedValues must already be sorted; fraction is 0.5 for the median, 0.9 for the 90th percentile
const percentile = (sortedValues, fraction) =>
  sortedValues[Math.min(sortedValues.length - 1, Math.floor(fraction * sortedValues.length))]

const DEFAULT_FORM = {
  currentLevel: 0,
  targetLevel: 10,
  itemId: DEFAULT_ITEM_ID,
  rarityMultiplier: 1,
  enhancingLevel: 1,
  lecternLevel: 0,
  masteryLevel: 0,
  protectAt: '',
  voidshardPrice: 0,
  scrollPrice: 0,
  itemPrice: 0,
  hourlyRate: 0,
  coinBudget: '',
  voidshardBudget: '',
  scrollBudget: '',
}

export default function Enhancing() {
  const [saved, set] = usePersistentState('enhancing-calculator-form', DEFAULT_FORM)
  // Fall back if a saved rarity no longer exists
  const form = RARITY_OPTIONS.some(([value]) => value === +saved.rarityMultiplier)
    ? saved
    : { ...saved, rarityMultiplier: DEFAULT_FORM.rarityMultiplier }
  const [simulation, setSimulation] = useState(null)

  const updateField = (key) => (event) => set({ [key]: event.target.value })

  const numberFrom = (key, fallback = 0) => parseFloat(form[key]) || fallback
  const budgetFrom = (key) => (form[key] === '' ? Infinity : parseFloat(form[key]))

  const numberField = (label, key, props = {}) => (
    <label>
      {label}
      <input type="number" value={form[key]} onChange={updateField(key)} {...props} />
    </label>
  )

  // Cleaned-up values the calculator actually uses
  const user = {
    start: Math.max(0, Math.floor(numberFrom('currentLevel'))),
    target: Math.min(MAX_TARGET_LEVEL, Math.floor(numberFrom('targetLevel'))),
    tierPrice: TIERS[itemById(form.itemId).tier - 1].price,
    rarityMultiplier: +form.rarityMultiplier,
    enhancingLevel: Math.min(MAX_ENHANCING_LEVEL, Math.max(1, numberFrom('enhancingLevel', 1))),
    lecternLevel: numberFrom('lecternLevel'),
    masteryLevel: numberFrom('masteryLevel'),
    // Only the simulation uses these; the comparison table tries every protect level itself
    protectionOn: form.protectAt !== '',
    protectionThreshold: +form.protectAt,
  }

  const isValid = user.target >= 1 && user.start < user.target

  const stepLevels = isValid
    ? Array.from({ length: user.target - user.start }, (_, i) => user.start + i)
    : []
  const noMissChance = stepLevels.reduce((chance, level) => chance * successChance(level, user), 1)
  const noMissCoins = stepLevels.reduce((total, level) => total + coinCost(level, user), 0)
  const noMissVoidshards = stepLevels.reduce((total, level) => total + voidshardCost(level), 0)

  // Material cost = coins + priced shards and scrolls, total cost = item + materials + the value of your time
  const withCosts = (totals) => {
    const hours = (totals.attempts * SECONDS_PER_ATTEMPT) / 3600
    const materialCost =
      totals.coins +
      totals.voidshards * numberFrom('voidshardPrice') +
      totals.scrolls * numberFrom('scrollPrice')
    const totalCost = numberFrom('itemPrice') + materialCost + numberFrom('hourlyRate') * hours
    return { ...totals, hours, materialCost, totalCost }
  }

  // One row per protect-at choice
  const protectRows = isValid
    ? compareProtectLevels(user, MIN_PROTECTION_THRESHOLD).map(withCosts)
    : []
  const lowestTotal = Math.min(...protectRows.map((row) => row.totalCost))

  const runSimulation = () =>
    setSimulation(
      simulateRuns(user, {
        coinBudget: budgetFrom('coinBudget'),
        voidshardBudget: budgetFrom('voidshardBudget'),
        scrollBudget: budgetFrom('scrollBudget'),
      }),
    )

  // [label, sorted values, formatter] per column; costs are worked out per run, then sorted
  const simulationColumns = (() => {
    if (!simulation) return []
    const runCosts = simulation.runs.map(withCosts)
    const sortedBy = (key) => runCosts.map((run) => run[key]).sort((a, b) => a - b)
    return [
      ['Attempts', simulation.attempts, fmt],
      ['Time', simulation.attempts.map((n) => n * SECONDS_PER_ATTEMPT), formatDuration],
      ['Coins', simulation.coins, fmt],
      ['Voidshards', simulation.voidshards, fmt],
      ['Scrolls', simulation.scrolls, fmt],
      ['Mat cost', sortedBy('materialCost'), fmt],
      ['Total cost', sortedBy('totalCost'), fmt],
    ]
  })()

  return (
    <>
      <section className="panel">
        <h2>Setup</h2>
        <ItemPicker
          selectedId={form.itemId}
          rarity={rarityKey(form.rarityMultiplier)}
          onSelect={(itemId) => set({ itemId })}
        />
        <div className="controls">
          {numberField('Current +', 'currentLevel', { min: 0 })}
          {numberField('Target +', 'targetLevel', { min: 1 })}
          <label>
            Rarity
            <select
              className={`rarity-${rarityKey(form.rarityMultiplier)}`}
              value={form.rarityMultiplier}
              onChange={updateField('rarityMultiplier')}
            >
              {RARITY_OPTIONS.map(([multiplier, name]) => (
                <option
                  key={multiplier}
                  value={multiplier}
                  className={`rarity-${name.toLowerCase()}`}
                >
                  {name}
                </option>
              ))}
            </select>
          </label>
          {numberField('Enhancing level', 'enhancingLevel', { min: 1, max: MAX_ENHANCING_LEVEL })}
          {numberField('Rune lectern level', 'lecternLevel', { min: 0, step: 1 })}
          {numberField('Mastery level', 'masteryLevel', { min: 0, step: 1 })}
        </div>
        {isValid && (
          <>
            <p className="hint">Per attempt with your current stats. Check these match the game.</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Chance</th>
                    <th>Coins</th>
                    <th>Voidshards</th>
                  </tr>
                </thead>
                <tbody>
                  {stepLevels.map((level) => (
                    <tr key={level} className="static">
                      <td>
                        +{level} → +{level + 1}
                      </td>
                      <td>{(successChance(level, user) * 100).toFixed(1)}%</td>
                      <td>{fmt(coinCost(level, user))}</td>
                      <td>{fmt(voidshardCost(level))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">
              Chance to reach +{user.target} with no misses: {(noMissChance * 100).toFixed(1)}%
              <br />
              Cost with no misses: {fmt(noMissCoins)} coins and {fmt(noMissVoidshards)} Voidshards
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Prices</h2>
        <div className="controls">
          {numberField('Voidshard price (coins)', 'voidshardPrice', { min: 0 })}
          {numberField('Protection scroll price (coins)', 'scrollPrice', { min: 0 })}
          {numberField('Item price (coins)', 'itemPrice', { min: 0 })}
          {numberField('Your time (coins / hr)', 'hourlyRate', { min: 0 })}
        </div>
      </section>

      {!isValid && (
        <section className="panel">
          <span className="warn">Target must be higher than the current +.</span>
        </section>
      )}

      {isValid && (
        <section className="panel">
          <h2>
            Protect-at comparison: +{user.start} → +{user.target}
          </h2>
          <p className="hint">Highlighted row = lowest total cost.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Protect</th>
                  <th>Attempts</th>
                  <th>Time</th>
                  <th>Coins</th>
                  <th>Voidshards</th>
                  <th>Scrolls</th>
                  <th>Mat cost</th>
                  <th>Total cost</th>
                </tr>
              </thead>
              <tbody>
                {protectRows.map((row) => (
                  <tr
                    key={row.protectAt ?? 'none'}
                    className={`static${row.totalCost === lowestTotal ? ' selected' : ''}`}
                  >
                    <td>{row.protectAt === null ? 'None' : `+${row.protectAt}`}</td>
                    <td>{fmt(row.attempts)}</td>
                    <td>{formatDuration(row.hours * 3600)}</td>
                    <td>{fmt(row.coins)}</td>
                    <td>{fmt(row.voidshards)}</td>
                    <td>{fmt(row.scrolls)}</td>
                    <td>{fmt(row.materialCost)}</td>
                    <td>{fmt(row.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Simulate runs</h2>
        <div className="controls">
          <label>
            Protect at
            <select value={form.protectAt} onChange={updateField('protectAt')}>
              <option value="">None</option>
              {protectRows
                .filter((row) => row.protectAt !== null)
                .map((row) => (
                  <option key={row.protectAt} value={row.protectAt}>
                    +{row.protectAt}
                  </option>
                ))}
            </select>
          </label>
          {numberField('Coins available', 'coinBudget', { placeholder: 'unlimited' })}
          {numberField('Voidshards available', 'voidshardBudget', { placeholder: 'unlimited' })}
          {numberField('Protection scrolls owned', 'scrollBudget', { placeholder: 'unlimited' })}
        </div>
        <button
          type="button"
          className="run-simulation"
          disabled={!isValid}
          onClick={runSimulation}
        >
          Run simulation
        </button>

        {simulation && (
          <div className="simulation">
            <div className="result">
              <div className="stat">
                <span>Chance to succeed</span>
                <strong>
                  {+((simulation.reachedTarget / simulation.runCount) * 100).toFixed(1)}%
                </strong>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Percentile</th>
                    {simulationColumns.map(([label]) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0.25, 0.5, 0.75, 0.9, 0.95, 0.99].map((fraction) => (
                    <tr key={fraction} className="static">
                      <td>{fraction * 100}%</td>
                      {simulationColumns.map(([label, sortedValues, format]) => (
                        <td key={label}>{format(percentile(sortedValues, fraction))}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
