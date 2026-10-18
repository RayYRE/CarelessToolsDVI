// multiplier:  XP multiplier for an action of this rarity
// oneIn:       base odds of rolling this tier *or better* (gathering skills)
// toolLuck:    luck a tool of this rarity adds (gathering skills only)
// points:      collection log point multiplier
export const RARITIES = [
  { name: 'Common', multiplier: 1, oneIn: 1, toolLuck: 0, points: 1 },
  { name: 'Uncommon', multiplier: 1.5, oneIn: 40, toolLuck: 0.25, points: 3 },
  { name: 'Rare', multiplier: 3, oneIn: 400, toolLuck: 0.75, points: 10 },
  { name: 'Epic', multiplier: 8, oneIn: 8000, toolLuck: 2, points: 30 },
  { name: 'Legendary', multiplier: 25, oneIn: 150000, toolLuck: 5, points: 100 },
]
