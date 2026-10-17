// Game SVG icons from src/assets/icons (see the README there), bundled by Vite as URLs
const files = import.meta.glob('../assets/icons/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

// "Gatherer's draught" / "gatherers_draught.svg" → "gatherersdraught"
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

const ICONS = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [normalize(path.split('/').pop().replace(/\.svg$/i, '')), url]),
)

// URL of an item's icon, or undefined if there isn't one
export const iconFor = (itemName) => ICONS[normalize(itemName)]
