// Enhanceable gear, built from the shared game icons in src/assets/items

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
  [110, 134], // Metal blades, shields, helms, plates, greaves
  [140, 157], // Bows and staffs
  [181, 186], // Silver, gold and meteoric rings and amulets
  [260, 274], // Leather armour
  [304, 315], // Cloth armour
  [328, 354], // Horse, quivers, grimoires, troll/drake/wightweave/colossus gear
  [357, 358], // Leviathan amulet, Wyrm ring
  [390, 395], // Greatswords
]
const isEnhanceable = (id) => ENHANCEABLE_RANGES.some(([from, to]) => id >= from && id <= to)

// Tier of each material word in an icon's filename
const TIER_BY_MATERIAL = {
  // Tools, weapons, armour
  bronze: 1, iron: 2, steel: 3, cobalt: 4, meteoric: 5, colossus: 6,
  // Fletcher weapons and staffs (the plain bow or staff has no material word)
  oak: 2, willow: 3, maple: 3, yew: 4, magic: 5,
  // Accessories
  silver: 2, gold: 3, horse: 4, wyrm: 6, leviathan: 6,
  // Mage gear
  homespun: 1, linen: 1, silk: 2, gilded: 4, voidweave: 5, wightweave: 6,
  // Range gear
  pelt: 1, bogskin: 2, chitin: 3, fur: 4, scale: 5, troll: 6, drake: 6,
}
const PLAIN_ITEMS = new Set(['shortbow', 'longbow', 'staff'])

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
    const tier = PLAIN_ITEMS.has(slug) ? 1 : TIER_BY_MATERIAL[words[0]]
    return { id, name: capitalise(words.join(' ')), type: words.at(-1), tier, icon }
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
