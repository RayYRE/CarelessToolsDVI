// Careless Tools · Profit (personal userscript, built by userscripts/profit/vite.config.js)
//
// Shows estimated profit next to each job's xp/h in the game's job list. Read-only: it reads
// the game's own messages and page and adds text to the page; it never sends anything.
//
//   actions/h  = the game's xp/h ÷ XP per action (our job data × your XP gain [× avg rarity])
//   profit/h   = actions/h × (value of what an action gives − value of what it uses)
//
// Prices come from the market's `marketStock` summary (best buy/sell order per item ID) when the
// market is opened, and until then from the game's public price feed; remembered between sessions. Your bonuses come from the stats window, read the same way as
// the CarelessToolsImport userscript.

import { expectedMultiplier, failChance, oddsMultiplier, rarityChances } from '../../src/core/xp.js'
import {
  MILESTONES,
  formatMilestone,
  itemName,
  milestonePoints,
  nextMilestoneIndex,
} from '../../src/game/collection.js'
import { JOBS, isGathering } from '../../src/game/jobs.js'
import { RARITIES } from '../../src/game/rarities.js'
import { COMMON_ONLY } from '../../src/game/recipes.js'
import { parseStats } from '../../src/import/stats.js'
import { skillXpGain } from '../../src/profile/xpGain.js'
import ITEM_IDS from 'virtual:item-ids'

const SETTINGS_KEY = 'careless-profit-settings'
const PRICES_KEY = 'careless-profit-prices'
const STATS_KEY = 'careless-profit-stats'
const DEFAULT_SETTINGS = {
  price: 'bid', // 'bid' = sell now to the highest buy order, 'ask' = list at the lowest sell order
  tax: true, // take market tax off every item's value
  unit: 'hour', // 'hour' | 'day' | 'action'
  log: true, // show collection log progress on each job
}
// Outcomes rarer than this per action may lack a price without blanking the row (left out)
const IGNORE_MISSING_BELOW = 0.01
// Public price feed (refreshed by the game every 5 minutes), used until the market is opened
const PRICE_FEED_URL = '/api/market/prices.json'
const PRICE_FEED_REFRESH_MS = 5 * 60 * 1000
const STATS_CHECK_MS = 5000
const STATS_PEEK_MS = 3000

const page = unsafeWindow
const state = {
  settings: { ...DEFAULT_SETTINGS },
  // items: { itemId: [ask, bid] }; source: 'market' (opened in game) or 'feed' (price feed)
  prices: { items: {}, capturedAt: null, source: null },
  taxBp: 0, // market tax in basis points, from the welcome message
  bank: {}, // itemId -> qty across bank, pack, overflow, home bank
  collections: {}, // itemId -> collection log count
  feedIds: {}, // normalised item name -> base item ID, from the price feed (items our list lacks)
  stats: null, // { profile: { xpGain, xpGainSources, luck, rareFind }, capturedAt }
}

// ---------------------------------------------------------------- storage

async function load() {
  state.settings = { ...DEFAULT_SETTINGS, ...((await GM_getValue(SETTINGS_KEY, null)) ?? {}) }
  state.prices = (await GM_getValue(PRICES_KEY, null)) ?? state.prices
  state.stats = await GM_getValue(STATS_KEY, null)
  render()
}

let pricesSaveTimer
function savePricesSoon() {
  clearTimeout(pricesSaveTimer)
  pricesSaveTimer = setTimeout(() => GM_setValue(PRICES_KEY, state.prices), 1000)
}

// Prices from the public feed, while the market hasn't been opened this session (its live
// prices win). Only replaces what's saved when the feed is newer.
let liveMarketSeen = false
async function loadPriceFeed() {
  // Once the market's live prices are in, the feed is only needed once (for item names)
  if (liveMarketSeen && Object.keys(state.feedIds).length) return
  try {
    const response = await fetch(PRICE_FEED_URL, { cache: 'no-store' })
    if (!response.ok) throw Error(`HTTP ${response.status}`)
    const feed = await response.json()
    // The feed names every item: learn IDs for items our own list doesn't have
    let learned = 0
    for (const [id, item] of Object.entries(feed.items ?? {})) {
      if (item?.rarity !== 'Normal' || item.plus || !item.name) continue
      const key = normalize(item.name)
      if (ITEM_IDS[key] === undefined && state.feedIds[key] === undefined) {
        state.feedIds[key] = Number(id)
        learned++
      }
    }
    if (learned) render()
    const at = Date.parse(feed.generatedAt) || Date.now()
    if (liveMarketSeen || (state.prices.capturedAt ?? 0) >= at) return
    const items = {}
    for (const [id, item] of Object.entries(feed.items ?? {})) {
      items[id] = [item?.lowestSell || 0, item?.highestBuy || 0]
    }
    state.prices = { items, capturedAt: at, source: 'feed' }
    savePricesSoon()
    render()
  } catch (error) {
    console.warn('[Careless Tools profit] price feed unavailable:', error.message)
  }
}

// ---------------------------------------------------------------- game messages

function onFrame(raw) {
  let f
  try {
    f = JSON.parse(raw)
  } catch {
    return
  }
  if (!Array.isArray(f?.m)) return
  let changed = false
  for (const m of f.m) {
    if (m?.t === 'welcome' && Number.isFinite(m.marketTaxBp)) state.taxBp = m.marketTaxBp
    if ((m?.t === 'welcome' || m?.t === 'snapshot') && m.you) {
      state.bank = storageFrom(m.you)
      if (m.you.collections && typeof m.you.collections === 'object') state.collections = m.you.collections
      changed = true
      startPeeking()
    }
    // Every item's best prices: [itemId, ask, bid, volume]; 0 means no orders
    if (m?.t === 'marketStock' && Array.isArray(m.summary)) {
      const items = {}
      for (const [id, ask, bid] of m.summary) items[id] = [ask || 0, bid || 0]
      state.prices = { items, capturedAt: Date.now(), source: 'market' }
      liveMarketSeen = true
      savePricesSoon()
      changed = true
    }
    // Individual items' books, e.g. when one is opened in the market
    const tops = m?.t === 'marketBooks' ? m.tops : m?.t === 'marketBook' ? [m.top] : []
    for (const top of Array.isArray(tops) ? tops : []) {
      if (!Number.isSafeInteger(top?.itemId)) continue
      state.prices.items[top.itemId] = [top.ask || 0, top.bid || 0]
      state.prices.capturedAt = Date.now()
      savePricesSoon()
      changed = true
    }
  }
  if (changed) render()
}

function storageFrom(you) {
  const bank = {}
  const add = (id, qty) => {
    if (Number.isFinite(qty) && qty > 0) bank[id] = (bank[id] ?? 0) + qty
  }
  for (const store of [you.bank, you.overflow, you.homeBank]) {
    if (store && typeof store === 'object') for (const [id, qty] of Object.entries(store)) add(+id, qty)
  }
  for (const slot of Array.isArray(you.pack) ? you.pack : []) add(slot?.itemId, slot?.qty)
  return bank
}

const NativeSocket = page.WebSocket
page.WebSocket = new Proxy(NativeSocket, {
  construct(target, args) {
    const socket = Reflect.construct(target, args)
    const url = new URL(String(args[0]), location.href)
    if (url.host === location.host && url.pathname === '/ws') {
      socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') onFrame(event.data)
      })
    }
    return socket
  },
})

// ---------------------------------------------------------------- your bonuses

// Same approach as CarelessToolsImport: "Your bonuses" is only drawn while the stats window is
// open, so read it whenever it's there, and once per page load open it invisibly to draw it.
let lastStatsHtml
function captureStats() {
  const group = [...document.querySelectorAll('.stats-group')].find((g) => g.querySelector('.stats-bonus'))
  if (!group || group.outerHTML === lastStatsHtml) return
  lastStatsHtml = group.outerHTML
  const { settings } = parseStats(lastStatsHtml)
  if (settings.xpGain === undefined) return
  state.stats = { profile: { luck: {}, ...settings }, capturedAt: Date.now() }
  GM_setValue(STATS_KEY, state.stats)
  render()
}
setInterval(captureStats, STATS_CHECK_MS)

let peeked = false
function startPeeking() {
  if (peeked) return
  peeked = true
  setTimeout(peekStats, STATS_PEEK_MS)
}
function peekStats() {
  const veil = document.querySelector('[data-stats]')
  if (lastStatsHtml || !veil || !veil.hidden) return
  veil.style.setProperty('visibility', 'hidden', 'important')
  veil.hidden = false
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    clearTimeout(timer)
    document.removeEventListener('pointerdown', end, true)
    document.removeEventListener('keydown', end, true)
    captureStats()
    veil.hidden = true
    veil.style.removeProperty('visibility')
  }
  const timer = setTimeout(end, STATS_PEEK_MS)
  // A click or key press ends the peek first, so the game handles it normally
  document.addEventListener('pointerdown', end, true)
  document.addEventListener('keydown', end, true)
}

// ---------------------------------------------------------------- prices

const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const itemId = (name, rarityIndex) => {
  const base = ITEM_IDS[normalize(name)] ?? state.feedIds[normalize(name)]
  return base === undefined ? undefined : base + 1000 * rarityIndex
}

// What one item is worth with the chosen price, after tax; null if there's no price
function value(name, rarityIndex) {
  if (normalize(name) === 'coins') return 1
  const entry = state.prices.items[itemId(name, rarityIndex)]
  const price = entry?.[state.settings.price === 'ask' ? 0 : 1]
  if (!price) return null
  return state.settings.tax ? price * (1 - state.taxBp / 10000) : price
}

// Average value of one item whose rarity is rolled with `chances`. `perAction` is how often the
// item comes per action (1 for the main output, 1/260 for a "1 in 260" drop), so a rarity that's
// rare per action can be left out when it has no price.
// Returns { value, missing: [rarity names left out] } or null when a likely rarity has no price.
function rolledValue(name, chances, perAction = 1) {
  let total = 0
  const missing = []
  for (const [i, r] of chances.entries()) {
    if (r.chance <= 0) continue
    const v = value(name, i)
    if (v === null) {
      if (r.chance * perAction >= IGNORE_MISSING_BELOW) return null
      missing.push(r.name)
      continue
    }
    total += r.chance * v
  }
  return { value: total, missing }
}

// ---------------------------------------------------------------- reading the job list

const num = (text) => Number(String(text).replace(/,/g, ''))

// "Each chop: 1× Maple logs · 18 xp|Bitterroot seed: 1 in 260|Pet, Acorn squirrel: 1 in 3,000,000"
function parseTip(lines) {
  const parts = (lines ?? '').split('|')
  // "Each chop: 1× Maple logs · 18 xp", and on some jobs just "Each chop: 1× Maple logs"
  const main = parts[0]?.match(/^Each [^:]+:\s*([\d,]+)×\s*(.+?)\s*(?:·|$)/)
  const drops = parts
    .slice(1)
    .map((p) => p.match(/^(.+?):\s*1 in ([\d,]+)$/))
    .filter((m) => m && !m[1].startsWith('Pet'))
    .map((m) => ({ item: m[1].trim(), oneIn: num(m[2]) }))
  return { output: main ? { qty: num(main[1]), item: main[2] } : null, drops }
}

// "2 Steel bar · +25% mining speed…" or "Iron + 2 Coal · …" -> [{ qty, item }]
function parseCost(title) {
  const list = (title ?? '').split(' · ')[0]
  if (!list) return []
  return list.split(' + ').map((part) => {
    const m = part.trim().match(/^(\d+)\s+(.+)$/)
    return m ? { qty: +m[1], item: m[2] } : { qty: 1, item: part.trim() }
  })
}

const materialRarity = (item, rarityIndex) => (COMMON_ONLY.includes(item) ? 0 : rarityIndex)

// The crafting rarity the game is using for the list: a picked one, or with "Best first" the
// rarest that any row can make at least once from what's in storage
function craftingRarity(rows) {
  const picked = document.querySelector('[data-rarity-choices] button[aria-pressed="true"]')
  if (!picked) return 0
  if (picked.dataset.rarity !== undefined) return +picked.dataset.rarity
  for (let r = RARITIES.length - 1; r > 0; r--) {
    const canMakeOne = rows.some(({ cost }) =>
      cost.length > 0 &&
      cost.every(({ qty, item }) => (state.bank[itemId(item, materialRarity(item, r))] ?? 0) >= qty),
    )
    if (canMakeOne) return r
  }
  return 0
}

// ---------------------------------------------------------------- profit per job

function gatheringProfit(job, row, profile, skill, level) {
  const { output, drops } = parseTip(row.tip)
  if (!output) return null
  const chances = rarityChances(oddsMultiplier(profile.luck?.[skill] ?? 0, profile.rareFind ?? 0))
  const gain = 1 + skillXpGain(profile, skill) / 100
  // Stalls get no rarity XP bonus; everything else gathers at the average rarity multiplier
  const xpPerSuccess = job.xp * (job.stall ? 1 : expectedMultiplier(chances)) * gain
  const successes = row.xpPerHour / xpPerSuccess
  const attempts = successes / (1 - failChance(job, level))

  const missing = []
  // Coins are fixed; anything else is an item whose rarity is rolled (stall loot included)
  const main =
    normalize(output.item) === 'coins' ? { value: 1, missing: [] } : rolledValue(output.item, chances)
  if (!main) return null
  missing.push(...main.missing.map((r) => `${r} ${output.item}`))
  let perSuccess = output.qty * main.value
  for (const d of drops) {
    const v = rolledValue(d.item, chances, 1 / d.oneIn)
    if (!v) return null
    missing.push(...v.missing.map((r) => `${r} ${d.item}`))
    perSuccess += v.value / d.oneIn
  }
  const lines = [`${output.qty}× ${output.item}`, ...drops.map((d) => `${d.item}: 1 in ${d.oneIn}`)]
  return { perHour: successes * perSuccess, attempts, missing, lines }
}

function craftingProfit(job, row, profile, skill, level, rarityIndex) {
  if (!row.cost.length) return null
  const outValue = value(itemName(job), rarityIndex)
  if (outValue === null) return null
  let inValue = 0
  for (const { qty, item } of row.cost) {
    const v = value(item, materialRarity(item, rarityIndex))
    if (v === null) return null
    inValue += qty * v
  }
  const gain = 1 + skillXpGain(profile, skill) / 100
  const successes = row.xpPerHour / (job.xp * RARITIES[rarityIndex].multiplier * gain)
  // Burned attempts give no XP or item but still use materials
  const attempts = successes / (1 - failChance(job, level))
  return {
    perHour: successes * outValue - attempts * inValue,
    attempts,
    missing: [],
    lines: [`${RARITIES[rarityIndex].name}: ${row.cost.map((c) => `${c.qty} ${c.item}`).join(' + ')}`],
  }
}

// ---------------------------------------------------------------- showing it

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const UNITS = { hour: ['/h', 1], day: ['/d', 24], action: ['/action', null] }

function label(result) {
  const [suffix, factor] = UNITS[state.settings.unit]
  const amount = factor === null ? result.perHour / result.attempts : result.perHour * factor
  const text = Math.abs(amount) < 100 ? amount.toFixed(1) : compact.format(amount)
  return `${amount > 0 ? '+' : ''}${text}${suffix}`
}

function tooltip(result) {
  const lines = [
    ...result.lines,
    `≈ ${compact.format(result.attempts)} actions/h`,
    `${compact.format(result.perHour)} coins/h · ${compact.format(result.perHour * 24)} coins/day`,
  ]
  if (result.missing.length) lines.push(`No price, left out: ${result.missing.join(', ')}`)
  if (state.prices.capturedAt) {
    const from = state.prices.source === 'feed' ? ' (price feed)' : ''
    lines.push(`Prices from ${new Date(state.prices.capturedAt).toLocaleString()}${from}`)
  }
  return lines.join('\n')
}

let renderQueued = false
function render() {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    annotate()
  })
}

function annotate() {
  for (const list of document.querySelectorAll('[data-routes]')) {
    const heading = list.querySelector('.route-heading')?.textContent.match(/^(.*?)\s+(\d+)$/)
    if (!heading) continue
    const [, skill, levelText] = heading
    const level = +levelText
    const rows = [...list.querySelectorAll('button.route')].map((el) => ({
      el,
      name: el.querySelector('.route-name')?.textContent.trim(),
      xpPerHour: num(el.querySelector('.route-meta')?.textContent.match(/([\d,]+)\s*xp\/h/)?.[1] ?? NaN),
      tip: el.querySelector('.route-drops:not(.route-where):not(.route-order)')?.dataset.tipLines,
      cost: parseCost(el.querySelector('.route-cost')?.title),
    }))
    const rarity = isGathering(skill) ? 0 : craftingRarity(rows.filter((r) => r.xpPerHour > 0))
    const profile = state.stats?.profile

    for (const row of rows) {
      const job = JOBS.find((j) => j.skill === skill && (j.name === row.name || itemName(j) === row.name))
      let result = null
      if (job && profile && row.xpPerHour > 0) {
        result = isGathering(skill)
          ? gatheringProfit(job, row, profile, skill, level)
          : craftingProfit(job, row, profile, skill, level, rarity)
      }
      show(row.el, result)
      // Collection log: what a gathering job collects (from its tooltip), or the crafted item
      // Straight from the game's row, so it works for jobs our list doesn't know too
      const logItem = isGathering(skill)
        ? parseTip(row.tip).output?.item
        : job
          ? itemName(job)
          : row.name
      const allRarities = RARITIES.map((_, i) => i)
      showLog(row.el, state.settings.log && logItem && normalize(logItem) !== 'coins' ? logItem : null, allRarities)
    }
  }
}

// Collection log counts for an item at some rarities: "10.6k · 5k · 540 · 23 · 1", each in its
// rarity colour (our own classes: the game's rarity-* styles only apply inside its own widgets);
// hover for exact counts and the next milestone's points
function showLog(el, item, rarityIndexes) {
  let span = el.querySelector('.careless-log')
  const base = item && itemId(item, 0)
  if (base === undefined || base === null) {
    span?.remove()
    return
  }
  const parts = rarityIndexes.map((i) => {
    const r = RARITIES[i]
    const count = state.collections[base + 1000 * i] ?? 0
    const next = nextMilestoneIndex(count)
    return {
      r,
      text: count < 1000 ? String(count) : compact.format(count).toLowerCase(),
      title:
        next < 0
          ? `${r.name}: ${count.toLocaleString()}, every milestone done`
          : `${r.name}: ${count.toLocaleString()} / ${formatMilestone(MILESTONES[next])} → +${milestonePoints(next, r.name)} pts`,
    }
  })
  const key = parts.map((p) => p.text).join('|')
  if (span?.dataset.key === key) return
  if (!span) {
    span = document.createElement('span')
    span.className = 'careless-log'
    el.querySelector('.route-meta')?.after(span)
  }
  span.dataset.key = key
  span.title = [`${item} collection log`, ...parts.map((p) => p.title)].join('\n')
  span.replaceChildren(
    ...parts.flatMap((p, n) => {
      const part = document.createElement('span')
      part.className = `careless-${p.r.name.toLowerCase()}`
      part.textContent = p.text
      return n ? [' · ', part] : [part]
    }),
  )
}

function show(el, result) {
  let span = el.querySelector('.careless-profit')
  if (!result || !Number.isFinite(result.perHour)) {
    span?.remove()
    return
  }
  if (!span) {
    span = document.createElement('span')
    span.className = 'careless-profit'
    // Inside the xp/h text, to its left (the xp/h is still read correctly: "+1.2M/h55,360 xp/h")
    el.querySelector('.route-meta')?.prepend(span)
  }
  const text = label(result)
  const title = tooltip(result)
  const tone = result.perHour > 0 ? 'up' : result.perHour < 0 ? 'down' : ''
  if (span.textContent !== text) span.textContent = text
  if (span.title !== title) span.title = title
  if (span.dataset.tone !== tone) span.dataset.tone = tone
}

// The game redraws its lists often; re-annotate after any change (our own edits settle at once)
new MutationObserver(render).observe(document, { childList: true, subtree: true, characterData: true })

// ---------------------------------------------------------------- settings pop-out

function settingsPanel() {
  const age = (t) => (t ? `${Math.round((Date.now() - t) / 60000)} min ago` : 'not yet')
  const s = state.settings
  const radio = (name, v, text) =>
    `<label><input type="radio" name="${name}" value="${v}"${s[name] === v ? ' checked' : ''}> ${text}</label>`
  return `
    <strong>Careless Tools · Profit</strong>
    <fieldset><legend>Price</legend>
      ${radio('price', 'bid', 'Sell now (highest buy order)')}
      ${radio('price', 'ask', 'List it (lowest sell order)')}
    </fieldset>
    <label><input type="checkbox" name="tax"${s.tax ? ' checked' : ''}> Take off market tax (${state.taxBp / 100}%)</label>
    <fieldset><legend>Show</legend>
      ${radio('unit', 'hour', 'Per hour')}
      ${radio('unit', 'day', 'Per day')}
      ${radio('unit', 'action', 'Per action')}
    </fieldset>
    <label><input type="checkbox" name="log"${s.log ? ' checked' : ''}> Show collection log progress</label>
    <small>Prices: ${Object.keys(state.prices.items).length} items, ${age(state.prices.capturedAt)}${
      state.prices.source === 'feed' ? ' (price feed, updates every 5 min)' : ''
    }.<br>Open the market for live prices.<br>
      Bonuses: ${age(state.stats?.capturedAt)}.</small>`
}

function mountSettings() {
  if (document.getElementById('careless-profit-settings')) return
  const style = document.createElement('style')
  style.textContent = `
    .careless-profit { margin-right: 8px; font-size: 0.9em; }
    .careless-profit[data-tone="up"] { color: #8fd47e; }
    .careless-profit[data-tone="down"] { color: #e0846f; }
    /* Own full-width line under the xp/h (spans the row whether the job row is a grid or flex) */
    .careless-log { display: block; grid-column: 1 / -1; flex-basis: 100%; width: 100%; text-align: right;
      margin-top: 2px; font-size: 0.8em; }
    /* Rarity colours, as on the Careless Tools site */
    .careless-log .careless-uncommon { color: #88c977; }
    .careless-log .careless-rare { color: #769fcc; }
    .careless-log .careless-epic { color: #b993d4; }
    .careless-log .careless-legendary { color: #dfb964; }
    #careless-profit-settings { position: fixed; right: 8px; bottom: 8px; z-index: 99998; font: 12px sans-serif; color: #e6d6ae; }
    #careless-profit-settings > button { padding: 4px 8px; border: 1px solid #756440; border-radius: 6px; background: #171c24; color: inherit; cursor: pointer; }
    #careless-profit-settings .panel { position: absolute; right: 0; bottom: calc(100% + 6px); display: flex; flex-direction: column; gap: 8px;
      min-width: 240px; padding: 10px; border: 1px solid #756440; border-radius: 6px; background: #171c24; }
    #careless-profit-settings fieldset { margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 2px; }
    #careless-profit-settings legend { padding: 0 0 2px; opacity: 0.8; }
    #careless-profit-settings small { opacity: 0.8; line-height: 1.4; }`
  document.head.append(style)

  const root = document.createElement('div')
  root.id = 'careless-profit-settings'
  root.innerHTML = '<button type="button" title="Careless Tools profit settings">Profit ⚙</button>'
  const button = root.querySelector('button')
  let panel = null
  const close = () => {
    panel?.remove()
    panel = null
  }
  button.addEventListener('click', () => {
    if (panel) return close()
    panel = document.createElement('div')
    panel.className = 'panel'
    panel.innerHTML = settingsPanel()
    panel.addEventListener('change', (e) => {
      const { name, type, value: v, checked } = e.target
      state.settings = { ...state.settings, [name]: type === 'checkbox' ? checked : v }
      GM_setValue(SETTINGS_KEY, state.settings)
      render()
    })
    root.append(panel)
  })
  document.addEventListener('pointerdown', (e) => panel && !root.contains(e.target) && close())
  document.body.append(root)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSettings)
else mountSettings()

load().then(loadPriceFeed)
setInterval(loadPriceFeed, PRICE_FEED_REFRESH_MS)
