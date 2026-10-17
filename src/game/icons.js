import { itemName } from './collection.js'

// Game SVG icons, bundled by Vite as URLs. Files are named "<game id>-<item-name>.svg".
const glob = (files) =>
  Object.fromEntries(
    Object.entries(files).map(([path, url]) => [
      normalize(
        path
          .split('/')
          .pop()
          .replace(/^\d+-/, '')
          .replace(/\.svg$/i, ''),
      ),
      url,
    ]),
  )

// "Gatherer's draught" / "gatherers-draught" → "gatherersdraught"
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

const ITEMS = glob(
  import.meta.glob('../assets/items/*.svg', { eager: true, query: '?url', import: 'default' }),
)
const SKILLS = glob(
  import.meta.glob('../assets/skills/*.svg', { eager: true, query: '?url', import: 'default' }),
)

// URL of an item's icon, or undefined if there isn't one
export const iconFor = (name) => ITEMS[normalize(name)]

export const skillIcon = (skill) => SKILLS[normalize(`skill ${skill}`)]

// Icon for what a job produces: the crafted item, or the gathered resource
export function jobIcon(job) {
  if (job.skill === 'Woodcutting') return iconFor(job.name === 'Tree' ? 'Logs' : `${job.name} logs`)
  return iconFor(itemName(job))
}
