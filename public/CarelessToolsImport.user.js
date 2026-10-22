// ==UserScript==
// @name         CarelessToolsImport
// @namespace    https://carelesstoolsdvi.carelesscapybara.workers.dev/
// @downloadURL  https://carelesstoolsdvi.carelesscapybara.workers.dev/CarelessToolsImport.user.js
// @updateURL    https://carelesstoolsdvi.carelesscapybara.workers.dev/CarelessToolsImport.user.js
// @version      1.6
// @description  Reads your Deep Vein Idle character (skills, house, masteries, collection log, storage, Your bonuses stats) for Careless Tools. Never sends game commands.
// @match        https://deepveinidle.com/*
// @match        https://carelesstoolsdvi.carelesscapybara.workers.dev/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

// Trimmed from the dvi-lab "Deep Vein Idle · Character import" userscript (v2.6.0):
// market capture removed, only the player fields Careless Tools reads are kept, and the
// "Your bonuses" stats are read from the game page.
// It answers the same request events, so the app works with either script.
(function () {
  'use strict'

  const STORAGE_KEY = 'careless-character-snapshot-v1'
  const STATS_KEY = 'careless-stats-v1'
  const STATS_CHECK_MS = 5000
  const STATS_PEEK_MS = 3000 // how long the stats window stays invisibly open per peek
  const STATS_RETRY_MS = 30 * 1000 // wait before trying again if a peek found nothing
  const STATS_PEEK_TRIES = 3
  // Everything the app reads from the player (see parseSnapshot in src/import/parse.js)
  const FIELDS = [
    'lastTick',
    'skills',
    'house',
    'masteries',
    'collections',
    // Storage, for planning with what you have: bank and overflow are { itemId: qty },
    // pack is [{ itemId, qty }], homeBank is null until bought
    'bank',
    'pack',
    'overflow',
    'homeBank',
  ]

  // Runs in a Worker so parsing the game's large messages never blocks the page
  function captureWorker() {
    'use strict'
    const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v)
    let epoch = 0
    let snapshot = null
    let revision = 0

    function frame(raw, at) {
      let f
      try {
        f = JSON.parse(raw)
      } catch {
        return
      }
      if (!Number.isInteger(f?.tick) || !Array.isArray(f.m)) return
      for (const m of f.m) {
        if (m?.t !== 'welcome' && m?.t !== 'snapshot') continue
        const you = m.you
        if (!isObject(you) || !isObject(you.skills)) throw Error('Incompatible character data')
        const player = Object.fromEntries(
          self.FIELDS.filter((k) => Object.hasOwn(you, k)).map((k) => [k, you[k]]),
        )
        snapshot = { version: 2, capturedAt: at, player }
        revision++
      }
    }

    self.onmessage = ({ data: d }) => {
      try {
        if (d.type === 'init') {
          self.FIELDS = d.fields
          return
        }
        if (d.type === 'reset') {
          epoch = d.epoch
          snapshot = null
          revision = 0
          return
        }
        if (d.epoch !== epoch) return
        if (d.type === 'frame') {
          const before = revision
          frame(d.raw, d.at)
          if (revision !== before) self.postMessage({ type: 'snapshot', epoch, snapshot })
        }
      } catch (error) {
        self.postMessage({ type: 'failed', epoch, error: error.message })
      }
    }
    self.postMessage({ type: 'ready' })
  }

  if (location.origin === 'https://deepveinidle.com') {
    captureOnGame()
  } else {
    answerRequests()
  }

  // On the game: watch its websocket and save the latest character snapshot
  function captureOnGame() {
    const page = unsafeWindow
    const NativeSocket = page.WebSocket
    let latestSocket
    let epoch = 0
    let worker
    let stopped = false
    let hideTimer
    let status = 'Waiting for game data'
    const queued = [] // frames that arrive before the worker is ready
    let ready = false

    const observer = new MutationObserver(() => {
      if (!document.getElementById('careless-capture')) mount()
    })

    function mount() {
      if (!document.documentElement || document.getElementById('careless-capture')) return
      const el = document.createElement('div')
      el.id = 'careless-capture'
      el.setAttribute('role', 'status')
      el.style.cssText =
        'position:fixed;bottom:8px;left:8px;z-index:99999;max-width:calc(100vw - 32px);' +
        'padding:6px 10px;border:1px solid #756440;border-radius:6px;background:#171c24;' +
        'color:#e6d6ae;font:12px sans-serif;pointer-events:none'
      el.textContent = status
      document.documentElement.append(el)
    }

    function show(text, hideAfterMs) {
      status = text
      clearTimeout(hideTimer)
      observer.observe(document, { childList: true, subtree: true })
      mount()
      document.getElementById('careless-capture').textContent = text
      if (hideAfterMs) {
        hideTimer = setTimeout(() => {
          observer.disconnect()
          document.getElementById('careless-capture')?.remove()
        }, hideAfterMs)
      }
    }

    function failure(error) {
      if (stopped) return
      stopped = true
      worker?.terminate()
      show(`Careless Tools capture failed: ${error.message}. Refresh the game.`)
      console.error('[Careless Tools character import]', error)
    }

    function send(data) {
      if (stopped) return
      if (!ready) {
        queued.push(data)
        return
      }
      worker.postMessage(data)
    }

    // The game resyncs (new snapshot, sometimes a reconnect) whenever the tab comes back into
    // focus. Every resync is still saved, but the status messages only show on the first load.
    let characterCaptured = false

    page.WebSocket = new Proxy(NativeSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args)
        const url = new URL(String(args[0]), location.href)
        if (url.host === location.host && url.pathname === '/ws') {
          latestSocket = socket
          epoch++
          if (!stopped && !characterCaptured) show('Waiting for game data')
          send({ type: 'reset', epoch })
          socket.addEventListener('message', (event) => {
            if (stopped || socket !== latestSocket || typeof event.data !== 'string') return
            send({ type: 'frame', epoch, at: Date.now(), raw: event.data })
          })
        }
        return socket
      },
    })

    // "Your bonuses" only appears in the page once the stats window has been drawn; after that
    // it stays, so check it every few seconds and save it when it changes
    let lastStats
    async function captureStats() {
      if (stopped) return
      const group = [...document.querySelectorAll('.stats-group')].find((g) =>
        g.querySelector('.stats-bonus'),
      )
      if (!group || group.outerHTML === lastStats) return
      const firstTime = lastStats === undefined
      lastStats = group.outerHTML
      try {
        await GM_setValue(STATS_KEY, { html: lastStats, capturedAt: Date.now() })
        if (firstTime) show('Careless Tools: stats captured', 5000)
      } catch (error) {
        failure(Error(`Could not save stats: ${error.message}`))
      }
    }
    setInterval(captureStats, STATS_CHECK_MS)

    // The game recalculates the stats window on every update but only draws it while it's
    // open (`this.root.hidden || this.render()`). So un-hide it invisibly for a few seconds,
    // let the game draw it, read it, and hide it again. Skipped while the player has it open.
    // Only done until the bonuses are captured once per page load; after that the 5-second check
    // still picks up changes whenever the player opens the stats menu themselves.
    let peekTries = 0
    function retryPeek() {
      if (lastStats === undefined && peekTries < STATS_PEEK_TRIES) setTimeout(peekStats, STATS_RETRY_MS)
    }
    function peekStats() {
      if (stopped || lastStats !== undefined) return
      peekTries++
      const veil = document.querySelector('[data-stats]')
      if (!veil || !veil.hidden) {
        retryPeek()
        return
      }
      veil.style.setProperty('visibility', 'hidden', 'important') // invisible and unclickable
      veil.hidden = false
      let ended = false
      const end = async () => {
        if (ended) return
        ended = true
        clearTimeout(timer)
        document.removeEventListener('pointerdown', end, true)
        document.removeEventListener('keydown', end, true)
        await captureStats()
        veil.hidden = true
        veil.style.removeProperty('visibility')
        retryPeek()
      }
      const timer = setTimeout(end, STATS_PEEK_MS)
      // Any click or key press ends the peek first (capture phase), so if it was the player
      // opening the stats menu, the game opens it normally right after
      document.addEventListener('pointerdown', end, true)
      document.addEventListener('keydown', end, true)
    }
    let peeking = false
    function startPeeking() {
      if (peeking) return
      peeking = true
      setTimeout(peekStats, STATS_PEEK_MS)
    }

    show(status)
    try {
      const url = URL.createObjectURL(
        new Blob([`(${captureWorker.toString()})()`], { type: 'text/javascript' }),
      )
      worker = new Worker(url)
      worker.onmessage = async ({ data: d }) => {
        if (stopped) return
        if (d.type === 'ready') {
          URL.revokeObjectURL(url)
          ready = true
          worker.postMessage({ type: 'init', fields: FIELDS })
          for (const data of queued.splice(0)) worker.postMessage(data)
          return
        }
        if (d.epoch !== epoch) return
        if (d.type === 'failed') failure(Error(d.error))
        if (d.type === 'snapshot') {
          try {
            await GM_setValue(STORAGE_KEY, d.snapshot)
            if (!characterCaptured) show('Careless Tools: character captured', 5000)
            characterCaptured = true
            // The game's UI is up once the character arrives, so the stats window can be read
            startPeeking()
          } catch (error) {
            failure(Error(`Could not save character: ${error.message}`))
          }
        }
      }
      worker.onerror = () => failure(Error('Worker failed'))
    } catch (error) {
      failure(error)
    }
    page.addEventListener(
      'pagehide',
      () => {
        stopped = true
        worker?.terminate()
        observer.disconnect()
      },
      { once: true },
    )
  }

  // On Careless Tools: hand the saved snapshot to the page when it asks.
  // The document is shared between the userscript and page worlds, so events carry JSON strings.
  function answerRequests() {
    document.addEventListener('dvi-character-request', async (event) => {
      if (typeof event.detail !== 'string') return
      let data
      try {
        data = JSON.parse(event.detail)
      } catch {
        return
      }
      if (
        data?.source !== 'dvi-simulator' ||
        !['probe', 'read'].includes(data.action) ||
        typeof data.id !== 'string' ||
        data.id.length > 100
      )
        return
      const reply = { source: 'dvi-character-script', id: data.id, version: 'careless-1.0' }
      try {
        if (data.action === 'probe') reply.ready = true
        else {
          const snapshot = await GM_getValue(STORAGE_KEY, null)
          const stats = await GM_getValue(STATS_KEY, null)
          // The stats ride along on the snapshot as { html, capturedAt }
          if (snapshot || stats) reply.snapshot = { version: 2, ...snapshot, stats }
          else reply.snapshot = null
        }
      } catch (error) {
        reply.error = String(error.message || error)
      }
      document.dispatchEvent(new CustomEvent('dvi-character-response', { detail: JSON.stringify(reply) }))
    })
  }
})()
