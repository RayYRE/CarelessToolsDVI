// Gathering skills roll rarity with luck; processing skills use fixed counts
export const SKILL_GROUPS = {
  Gathering: ['Mining', 'Fishing', 'Woodcutting', 'Thieving'],
  Processing: ['Cooking', 'Smithing', 'Fletching', 'Herblore', 'Crafting'],
}

export const isGathering = (skill) => SKILL_GROUPS.Gathering.includes(skill)

// Labels for skills whose jobs can fail (see `fail` on each job)
export const FAILURES = {
  Cooking: { label: 'Burn chance', noun: 'Burned' },
  Thieving: { label: 'Caught chance', noun: 'Stunned' },
}

const METAL_LEVELS = [1, 15, 30, 60, 85]
const METALS = ['Bronze', 'Iron', 'Steel', 'Cobalt', 'Meteoric']
const WOOD_LEVELS = [1, 15, 30, 45, 60, 75]
const WOODS = ['', 'Oak', 'Willow', 'Maple', 'Yew', 'Magic']

// fail (optional): { chance, never, stun } — chance (%) of a failed attempt at the job's level,
// falling linearly to 0 at level `never`; stun = extra seconds lost per failure
const job = (skill, category, level, name, xp, time, fail) => ({ skill, category, level, name, xp, time, fail })

// Cooking: burns 30% at the job's level, never 25 levels later
const burns = (level) => ({ chance: 30, never: level + 25, stun: 0 })
const caught = (chance, never, stun) => ({ chance, never, stun })

// Thieving stalls: rarity doesn't change their XP. Instead a successful steal may also `drop`
// an item (1 in `oneIn`), and only that drop rolls a rarity with luck.
const stall = (level, name, xp, time, fail, drop) => ({
  ...job('Thieving', 'Stalls', level, name, xp, time, fail),
  stall: true,
  drop,
})
const drop = (item, oneIn) => ({ item, oneIn })

// Metal-tiered items (Bronze 1 → Meteoric 85)
const metalTier = (skill, category, item, xps, time = 3) =>
  METALS.map((m, i) => job(skill, category, METAL_LEVELS[i], `${m} ${item}`, xps[i], time))

// Wood-tiered items ("Staff", "Oak staff", ...)
const woodTier = (skill, category, item, xps, time = 3) =>
  WOODS.map((w, i) =>
    job(skill, category, WOOD_LEVELS[i], w ? `${w} ${item.toLowerCase()}` : item, xps[i], time),
  )

// Crafting armour sets: three pieces sharing a level and time
const armourSet = (category, material, level, pieces, xps, time) =>
  pieces.map((p, i) => job('Crafting', category, level, `${material} ${p}`, xps[i], time))

const SMALL = [8, 13, 41, 120, 276]
const MEDIUM = [17, 27, 83, 240, 552]
const LEATHER = ['coif', 'chaps', 'jerkin']
const CLOTH = ['hood', 'skirt', 'robe']

export const JOBS = [
  job('Mining', '', 1, 'Copper', 2, 3),
  job('Mining', '', 1, 'Tin', 3, 3),
  job('Mining', '', 15, 'Iron', 5, 3.6),
  job('Mining', '', 30, 'Silver', 9, 4.2),
  job('Mining', '', 40, 'Coal', 14, 4.8),
  job('Mining', '', 55, 'Gold', 22, 5.4),
  job('Mining', '', 65, 'Cobalt', 37, 6.6),
  job('Mining', '', 85, 'Meteoric', 59, 7.8),

  job('Fishing', '', 1, 'Shrimp', 2, 3),
  job('Fishing', '', 5, 'Sardine', 3, 3),
  job('Fishing', '', 20, 'Trout', 7, 3.6),
  job('Fishing', '', 30, 'Salmon', 11, 4.2),
  job('Fishing', '', 45, 'Tuna', 17, 4.8),
  job('Fishing', '', 60, 'Lobster', 28, 6),
  job('Fishing', '', 75, 'Swordfish', 44, 6.6),
  job('Fishing', '', 90, 'Shark', 60, 7.8),

  job('Woodcutting', '', 1, 'Tree', 3, 3),
  job('Woodcutting', '', 15, 'Oak', 7, 3.6),
  job('Woodcutting', '', 30, 'Willow', 11, 4.2),
  job('Woodcutting', '', 45, 'Maple', 18, 4.8),
  job('Woodcutting', '', 60, 'Yew', 29, 6),
  job('Woodcutting', '', 75, 'Magic', 48, 7.2),

  stall(1, 'Bread stall', 8, 3.6, caught(25, 30, 4.8)),
  stall(25, 'Silk stall', 30, 4.2, caught(30, 60, 6), drop('Nightshade seed', 30)),
  stall(50, 'Gem stall', 80, 4.8, caught(32, 85, 7.2), drop('Rough gem', 25)),
  stall(75, 'Relic stall', 200, 5.4, caught(35, 110, 9), drop('Voidshard', 33)),
  job('Thieving', 'Cloth', 1, 'Linen line', 7, 4.2, caught(25, 30, 4.8)),
  job('Thieving', 'Cloth', 25, 'Silk cart', 26, 4.8, caught(30, 60, 6)),
  job('Thieving', 'Cloth', 50, 'Gilded loom', 70, 5.4, caught(32, 85, 7.2)),
  job('Thieving', 'Cloth', 75, 'Reliquary vestry', 175, 6, caught(35, 110, 9)),

  job('Cooking', '', 1, 'Cook shrimp', 4, 2.4, burns(1)),
  job('Cooking', '', 5, 'Cook sardine', 5, 2.4, burns(5)),
  job('Cooking', '', 20, 'Cook trout', 10, 2.4, burns(20)),
  job('Cooking', '', 30, 'Cook salmon', 14, 2.4, burns(30)),
  job('Cooking', '', 45, 'Cook tuna', 22, 2.4, burns(45)),
  job('Cooking', '', 60, 'Cook lobster', 36, 2.4, burns(60)),
  job('Cooking', '', 75, 'Cook swordfish', 59, 2.4, burns(75)),
  job('Cooking', '', 90, 'Cook shark', 92, 2.4, burns(90)),

  ...metalTier('Smithing', 'Bars', 'bar', [6, 8, 35, 108, 253], 2.4),
  ...metalTier('Smithing', 'Pickaxes', 'pickaxe', MEDIUM),
  ...metalTier('Smithing', 'Pans', 'pan', SMALL),
  ...metalTier('Smithing', 'Hammers', 'hammer', MEDIUM),
  ...metalTier('Smithing', 'Knives', 'knife', SMALL),
  ...metalTier('Smithing', 'Axes', 'axe', MEDIUM),
  ...metalTier('Smithing', 'Weapons', 'blade', SMALL),
  ...metalTier('Smithing', 'Two-handers', 'greatsword', MEDIUM),
  ...metalTier('Smithing', 'Shields', 'shield', [25, 40, 124, 360, 828]),
  ...metalTier('Smithing', 'Helmets', 'helm', MEDIUM),
  ...metalTier('Smithing', 'Bodies', 'plate', [42, 67, 207, 600, 1380]),
  ...metalTier('Smithing', 'Legs', 'greaves', [34, 53, 165, 480, 1104]),

  ...metalTier('Fletching', 'Rods', 'rod', SMALL),
  ...metalTier('Fletching', 'Hoes', 'hoe', MEDIUM),
  ...woodTier('Fletching', 'Shortbows', 'Shortbow', [5, 11, 17, 27, 43, 70]),
  ...woodTier('Fletching', 'Longbows', 'Longbow', [10, 22, 34, 54, 86, 140]),
  ...woodTier('Fletching', 'Staffs', 'Staff', [8, 22, 40, 65, 100, 150]),
  job('Fletching', 'Quivers', 1, 'Pelt quiver', 14, 3),
  job('Fletching', 'Quivers', 15, 'Bogskin quiver', 34, 3),
  job('Fletching', 'Quivers', 30, 'Chitin quiver', 70, 3),
  job('Fletching', 'Quivers', 60, 'Fur quiver', 150, 3),
  job('Fletching', 'Quivers', 85, 'Scale quiver', 320, 3),
  job('Fletching', 'Quivers', 95, 'Troll quiver', 700, 3.6),

  job('Herblore', '', 1, "Gatherer's draught", 30, 3.6),
  job('Herblore', '', 20, 'Swift draught', 70, 3.6),
  job('Herblore', '', 35, "Hunter's brew", 120, 3.6),
  job('Herblore', '', 50, 'Nourishing draught', 240, 3.6),
  job('Herblore', '', 60, "Warrior's tonic", 300, 3.6),
  job('Herblore', '', 70, 'Haste draught', 460, 4.2),
  job('Herblore', '', 80, 'Elixir of the vein', 700, 4.2),
  job('Herblore', '', 95, 'Abyssal tonic', 1600, 4.2),

  ...metalTier('Crafting', 'Needles', 'needle', SMALL),
  ...metalTier('Crafting', 'Mortars', 'mortar', MEDIUM),
  job('Crafting', 'Gems', 1, 'Cut gem', 16, 3),
  job('Crafting', 'Rings', 20, 'Silver ring', 58, 3.6),
  job('Crafting', 'Rings', 45, 'Gold ring', 156, 3.6),
  job('Crafting', 'Rings', 75, 'Meteoric ring', 455, 4.2),
  job('Crafting', 'Rings', 95, 'Wyrm ring', 1200, 4.8),
  job('Crafting', 'Amulets', 30, 'Silver amulet', 84, 3.6),
  job('Crafting', 'Amulets', 55, 'Gold amulet', 221, 3.6),
  job('Crafting', 'Amulets', 85, 'Meteoric amulet', 618, 4.2),
  job('Crafting', 'Amulets', 95, 'Leviathan amulet', 1400, 4.8),
  ...armourSet('Leather', 'Pelt', 1, LEATHER, [8, 12, 20], 3.6),
  ...armourSet('Leather', 'Bogskin', 15, LEATHER, [22, 33, 55], 3.6),
  ...armourSet('Leather', 'Chitin', 30, LEATHER, [60, 90, 150], 3.6),
  ...armourSet('Leather', 'Fur', 60, LEATHER, [180, 270, 450], 4.2),
  ...armourSet('Leather', 'Scale', 85, LEATHER, [460, 690, 1150], 4.2),
  ...armourSet('Leather', 'Troll', 95, LEATHER, [1250, 1900, 3100], 4.8),
  ...armourSet('Cloth', 'Homespun', 1, CLOTH, [9, 14, 23], 3.6),
  ...armourSet('Cloth', 'Silk', 25, CLOTH, [50, 75, 125], 3.6),
  ...armourSet('Cloth', 'Gilded', 50, CLOTH, [145, 215, 360], 4.2),
  ...armourSet('Cloth', 'Voidweave', 75, CLOTH, [380, 570, 950], 4.2),
  ...armourSet('Cloth', 'Wightweave', 90, CLOTH, [1000, 1500, 2500], 4.8),
  job('Crafting', 'Gloves', 5, 'Pelt gloves', 10, 3.6),
  job('Crafting', 'Gloves', 25, 'Bogskin gloves', 28, 3.6),
  job('Crafting', 'Gloves', 45, 'Chitin gloves', 75, 3.6),
  job('Crafting', 'Gloves', 65, 'Bone gloves', 225, 4.2),
  job('Crafting', 'Gloves', 85, 'Scale gloves', 575, 4.2),
  job('Crafting', 'Grimoires', 1, 'Linen grimoire', 16, 3.6),
  job('Crafting', 'Grimoires', 25, 'Silk grimoire', 85, 3.6),
  job('Crafting', 'Grimoires', 50, 'Gilded grimoire', 230, 4.2),
  job('Crafting', 'Grimoires', 75, 'Voidweave grimoire', 560, 4.2),
  job('Crafting', 'Grimoires', 90, 'Wightweave grimoire', 1200, 4.8),
].map((j, id) => ({ ...j, id }))
