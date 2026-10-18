// Enhanceable gear, built from the shared game icons in src/assets/items
import { JOBS } from '../game/jobs.js'

// Base price per tier; an item's cost per attempt starts from its tier's price
export const TIERS = [
  { price: 100, label: 'T1' },
  { price: 300, label: 'T2' },
  { price: 1000, label: 'T3' },
  { price: 3000, label: 'T4' },
  { price: 8000, label: 'T5' },
  { price: 20000, label: 'T6' },
]

// Game IDs of gear that can be enhanced. The icon folder also has ores, bars, logs, tools
// and so on, and some of those names start with a material word (Iron, Magic logs), so the
// gear is listed here rather than guessed from file names.
const ENHANCEABLE_RANGES = [
  [80, 94], // Pickaxes, rods, axes
  [110, 134], // Metal blades, shields, helms, plates, greaves
  [140, 157], // Bows and staffs
  [181, 186], // Silver, gold and meteoric rings and amulets
  [260, 274], // Leather armour
  [304, 315], // Cloth armour
  [323, 327], // Gloves
  [328, 354], // Horse, quivers, grimoires, troll/drake/wightweave/colossus gear
  [357, 358], // Leviathan amulet, Wyrm ring
  [360, 389], // Pans, hammers, knives, needles, mortars, hoes
  [390, 395], // Greatswords
  [629, 635], // Drakestring bows, Emberwood staff, Abyssweave set
]
const isEnhanceable = (id) => ENHANCEABLE_RANGES.some(([from, to]) => id >= from && id <= to)

// Level needed for each item: crafted gear comes from the job list, the rest is listed here
const LEVELS = {
  ...Object.fromEntries(JOBS.map((job) => [job.name, job.level])),
  'Colossus blade': 99,
  'Colossus shield': 99,
  'Colossus helm': 99,
  'Colossus plate': 99,
  'Colossus greaves': 99,
  'Colossus greatsword': 99,
  'Drake coif': 99,
  'Drake jerkin': 99,
  'Drake chaps': 99,
  'Drake quiver': 99,
  'Drakestring shortbow': 95,
  'Drakestring longbow': 95,
  'Emberwood staff': 95,
  'Abyssweave hood': 99,
  'Abyssweave robe': 99,
  'Abyssweave skirt': 99,
  'Abyssweave grimoire': 99,
}
// Items whose level isn't known, so their tier is set directly
const TIER_OVERRIDES = { Horse: 4 }

// Lowest level of each tier: T1 1–14, T2 15–29, T3 30–49, T4 50–74, T5 75–89, T6 90+
const TIER_LEVELS = [1, 15, 30, 50, 75, 90]
const tierForLevel = (level) => TIER_LEVELS.findLastIndex((min) => level >= min) + 1

const icons = import.meta.glob('../assets/items/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// "../assets/items/110-bronze-blade.svg" -> { id: "110", name: "Bronze blade", type: "blade", tier: 1, icon }
const parsed = Object.entries(icons)
  .map(([path, icon]) => {
    const [, id, slug] = path.match(/\/(\d+)-(.+)\.svg$/)
    const words = slug.split('-')
    const name = capitalise(words.join(' '))
    const tier = TIER_OVERRIDES[name] ?? (LEVELS[name] && tierForLevel(LEVELS[name]))
    return { id, name, type: words.at(-1), tier, icon }
  })
  .filter((item) => isEnhanceable(+item.id) && item.tier)

// Keep each item type together (all rings, all amulets, ...) in order of its lowest ID, then by tier,
// so later additions like the Wyrm ring sit with the other rings instead of at the end
const typeOrder = {}
for (const item of [...parsed].sort((a, b) => a.id - b.id)) typeOrder[item.type] ??= item.id

export const ITEMS = parsed.sort(
  (a, b) => typeOrder[a.type] - typeOrder[b.type] || a.tier - b.tier || a.id - b.id,
)

export const DEFAULT_ITEM_ID = ITEMS[0].id
export const itemById = (id) => ITEMS.find((item) => item.id === id) ?? ITEMS[0]
