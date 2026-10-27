import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Builds the personal profit userscript: `npm run build:profit`
// -> userscripts/CarelessToolsProfit.user.js (install that file in Tampermonkey)

const here = fileURLToPath(new URL('.', import.meta.url))
const ITEMS_DIR = fileURLToPath(new URL('../../src/assets/items/', import.meta.url))

const HEADER = `// ==UserScript==
// @name         Careless Tools · Profit
// @namespace    https://carelesstoolsdvi.carelesscapybara.workers.dev/
// @version      1.0
// @description  Shows estimated profit next to each job's xp/h in Deep Vein Idle. Read-only: never sends game commands.
// @match        https://deepveinidle.com/*
// @match        https://cn.deepveinidle.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
`

// `virtual:item-ids`: { normalised item name: base item ID }, from the icon file names
// ("13-maple-logs.svg" -> { maplelogs: 13 }), without bundling the icons themselves
function itemIds() {
  const ID = '\0item-ids'
  return {
    name: 'item-ids',
    resolveId: (id) => (id === 'virtual:item-ids' ? ID : null),
    load(id) {
      if (id !== ID) return null
      const ids = {}
      for (const file of readdirSync(ITEMS_DIR)) {
        const m = file.match(/^(\d+)-(.+)\.svg$/)
        if (m) ids[m[2].toLowerCase().replace(/[^a-z0-9]/g, '')] = Number(m[1])
      }
      return `export default ${JSON.stringify(ids)}`
    },
  }
}

export default defineConfig({
  root: here,
  plugins: [itemIds()],
  build: {
    outDir: '..',
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: 'main.js',
      formats: ['iife'],
      name: 'CarelessToolsProfit',
      fileName: () => 'CarelessToolsProfit.user.js',
    },
    rollupOptions: { output: { banner: HEADER } },
  },
})
