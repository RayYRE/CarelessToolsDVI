// Item names by game ID, read from the icon file names ("40-bronze-bar.svg" -> 40: "Bronze bar")
const files = import.meta.glob('../assets/items/*.svg', { eager: true, query: '?url', import: 'default' })

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1)

const NAMES = Object.fromEntries(
  Object.keys(files)
    .map((path) => path.match(/\/(\d+)-(.+)\.svg$/))
    .filter(Boolean)
    .map(([, id, slug]) => [id, capitalise(slug.replaceAll('-', ' '))]),
)

export const itemNameById = (id) => NAMES[id]
