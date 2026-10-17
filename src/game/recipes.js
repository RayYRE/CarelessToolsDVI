import { JOBS } from './jobs.js'

// Materials used by one craft attempt, keyed by job name: [[quantity, material], ...]

const METALS = ['Bronze', 'Iron', 'Steel', 'Cobalt', 'Meteoric']
// Logs paired with each metal for rods and hoes
const METAL_LOGS = ['Logs', 'Oak logs', 'Willow logs', 'Yew logs', 'Magic logs']
const WOODS = ['', 'Oak', 'Willow', 'Maple', 'Yew', 'Magic']
const logs = (wood) => (wood ? `${wood} logs` : 'Logs')

const BARS = {
  'Bronze bar': [[1, 'Copper'], [1, 'Tin']],
  'Iron bar': [[1, 'Iron']],
  'Steel bar': [[1, 'Iron'], [2, 'Coal']],
  'Cobalt bar': [[1, 'Cobalt'], [3, 'Coal']],
  'Meteoric bar': [[1, 'Meteoric'], [4, 'Coal']],
}

// Bars per metal item
const BAR_ITEMS = {
  Smithing: { pickaxe: 2, axe: 2, blade: 1, shield: 3, helm: 2, plate: 5, greaves: 4, pan: 1, hammer: 2, knife: 1, greatsword: 2 },
  Crafting: { needle: 1, mortar: 2 },
}

// Leather and cloth pieces: material per set, pieces per craft
const HIDES = {
  Pelt: 'Gnawer pelt',
  Bogskin: 'Bogling skin',
  Chitin: 'Husk chitin',
  Fur: 'Rimewolf fur',
  Scale: 'Ember scale',
  Troll: 'Troll hide',
}
const BOLTS = { Homespun: 'Homespun bolt', Silk: 'Silk bolt', Gilded: 'Gilded bolt', Voidweave: 'Voidweave bolt' }
const PIECES = { coif: 2, chaps: 3, jerkin: 5, hood: 2, skirt: 3, robe: 5 }

export const RECIPES = {
  ...BARS,

  // Metal items made from bars (Smithing and Crafting)
  ...Object.fromEntries(
    Object.values(BAR_ITEMS).flatMap((items) =>
      Object.entries(items).flatMap(([item, n]) =>
        METALS.map((m) => [`${m} ${item}`, [[n, `${m} bar`]]]),
      ),
    ),
  ),

  // Fletching
  ...Object.fromEntries(
    METALS.flatMap((m, i) => [
      [`${m} rod`, [[1, `${m} bar`], [1, METAL_LOGS[i]]]],
      [`${m} hoe`, [[1, `${m} bar`], [2, METAL_LOGS[i]]]],
    ]),
  ),
  ...Object.fromEntries(
    WOODS.flatMap((w) => [
      [w ? `${w} shortbow` : 'Shortbow', [[1, logs(w)]]],
      [w ? `${w} longbow` : 'Longbow', [[2, logs(w)]]],
      [w ? `${w} staff` : 'Staff', [[2, logs(w)]]],
    ]),
  ),
  'Pelt quiver': [[2, 'Gnawer pelt'], [1, 'Logs']],
  'Bogskin quiver': [[2, 'Bogling skin'], [1, 'Oak logs']],
  'Chitin quiver': [[2, 'Husk chitin'], [1, 'Willow logs']],
  'Fur quiver': [[2, 'Rimewolf fur'], [1, 'Maple logs']],
  'Scale quiver': [[2, 'Ember scale'], [1, 'Yew logs']],
  'Troll quiver': [[2, 'Troll hide'], [1, 'Magic logs']],

  // Herblore
  "Gatherer's draught": [[1, 'Sage'], [1, 'Gnawer pelt']],
  'Swift draught': [[1, 'Sage'], [1, 'Husk chitin']],
  "Hunter's brew": [[1, 'Nightshade'], [1, 'Cairn bone']],
  'Nourishing draught': [[1, 'Nightshade'], [1, 'Wraith dust']],
  "Warrior's tonic": [[1, 'Dragonleaf'], [1, 'Wraith dust']],
  'Haste draught': [[1, 'Dragonleaf'], [1, 'Rimewolf fur']],
  'Elixir of the vein': [[1, 'Nightshade'], [1, 'Dragonleaf'], [1, 'Stalker claw']],
  'Abyssal tonic': [[1, 'Dragonleaf'], [1, 'Horror ichor']],

  // Crafting
  'Cut gem': [[1, 'Rough gem']],
  'Silver ring': [[1, 'Silver'], [1, 'Cut gem']],
  'Gold ring': [[1, 'Gold'], [1, 'Cut gem']],
  'Meteoric ring': [[1, 'Meteoric bar'], [2, 'Cut gem']],
  'Wyrm ring': [[1, 'Wyrm ember'], [2, 'Cut gem']],
  'Silver amulet': [[1, 'Silver'], [1, 'Cut gem']],
  'Gold amulet': [[1, 'Gold'], [1, 'Cut gem']],
  'Meteoric amulet': [[1, 'Meteoric bar'], [2, 'Cut gem']],
  'Leviathan amulet': [[1, 'Leviathan scale'], [2, 'Cut gem']],
  ...Object.fromEntries(
    Object.entries({ ...HIDES, ...BOLTS }).flatMap(([set, material]) =>
      Object.entries(PIECES).map(([piece, n]) => [`${set} ${piece}`, [[n, material]]]),
    ),
  ),
  'Wightweave hood': [[2, 'Voidweave bolt'], [1, 'Ice wight shard']],
  'Wightweave robe': [[5, 'Voidweave bolt'], [3, 'Ice wight shard']],
  'Wightweave skirt': [[3, 'Voidweave bolt'], [2, 'Ice wight shard']],
  'Pelt gloves': [[4, 'Gnawer pelt']],
  'Bogskin gloves': [[2, 'Bogling skin'], [1, 'Bog pearl']],
  'Chitin gloves': [[2, 'Husk chitin'], [1, 'Dry sigil']],
  'Bone gloves': [[2, 'Cairn bone'], [1, 'Cairn token']],
  'Scale gloves': [[2, 'Ember scale'], [1, 'Ember heart']],
  'Linen grimoire': [[3, 'Homespun bolt']],
  'Silk grimoire': [[3, 'Silk bolt'], [1, 'Bogling skin']],
  'Gilded grimoire': [[3, 'Gilded bolt'], [1, 'Wraith dust']],
  'Voidweave grimoire': [[3, 'Voidweave bolt'], [2, 'Stalker claw']],
  'Wightweave grimoire': [[3, 'Voidweave bolt'], [2, 'Ice wight shard']],

  // Cooking: one raw fish per attempt (burned attempts still use it up)
  ...Object.fromEntries(
    JOBS.filter((j) => j.skill === 'Cooking').map((j) => {
      const fish = j.name.replace(/^Cook /, '')
      return [j.name, [[1, fish[0].toUpperCase() + fish.slice(1)]]]
    }),
  ),
}

// Materials that only come in Common, whatever the craft's rarity
const COMMON_ONLY = ['Coal']

/**
 * Materials for `attempts` crafts of a job at a rarity: [{ material, quantity, rarity }], or
 * null if the recipe is unknown. Rarer crafts use materials of the same rarity (except
 * COMMON_ONLY ones), and every attempt uses materials, including burned/failed ones.
 */
export function materialsFor(jobName, attempts, rarity) {
  const recipe = RECIPES[jobName]
  if (!recipe) return null
  return recipe.map(([n, material]) => ({
    material,
    quantity: n * attempts,
    rarity: COMMON_ONLY.includes(material) ? 'Common' : rarity,
  }))
}
