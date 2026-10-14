// Total XP required to reach each level (level 1 = 0 XP).
// Levels 1–100 come straight from the sheet. Above 100 the sheet only lists
// every 10th level, so those are anchors and the gaps are interpolated.
const TOTAL_XP_1_TO_100 = [
  0, 100, 212, 337, 478, 635, 812, 1009, 1230, 1478,
  1755, 2065, 2413, 2803, 3239, 3728, 4275, 4888, 5575, 6344,
  7205, 8170, 9250, 10460, 11816, 13333, 15033, 16937, 19070, 21458,
  24133, 27129, 30485, 34243, 38452, 43166, 48446, 54360, 60983, 68401,
  76709, 86014, 96436, 108108, 121181, 135823, 152222, 170588, 191159, 214198,
  240002, 268902, 301270, 337523, 378125, 423601, 474533, 531576, 595466, 667022,
  747164, 836924, 937455, 1050049, 1176155, 1317394, 1475581, 1652751, 1851181, 2073422,
  2322333, 2601113, 2913347, 3263048, 3654714, 4093380, 4584685, 5134948, 5751241, 6441490,
  7214569, 8080418, 9050168, 10136288, 11352742, 12715171, 14241092, 15950123, 17864238, 20008046,
  22409112, 25098305, 28110202, 31483526, 35261649, 39493147, 44232425, 49540416, 55485366, 61033903,
]

const ANCHORS_ABOVE_100 = {
  110: 186915284,
  120: 674462148,
  130: 2562763195,
  140: 9876277257,
  150: 38201997890,
  160: 147909375566,
  170: 572813259665,
  180: 2218493928967,
  190: 8592323321144,
  200: 33278583467707,
  210: 128890091483878,
  220: 499199745957762,
  230: 1933433375798384,
  240: 7488314487089727,
}

export const MAX_LEVEL = 240

// TOTAL_XP[level] -> total XP needed for that level
export const TOTAL_XP = [0, ...TOTAL_XP_1_TO_100]
// Levels above 100 that are not in the sheet (interpolated)
export const ESTIMATED_LEVELS = new Set()

for (let base = 100; base < MAX_LEVEL; base += 10) {
  const from = TOTAL_XP[base]
  const to = ANCHORS_ABOVE_100[base + 10]
  for (let i = 1; i < 10; i++) {
    // Geometric interpolation: XP grows by a constant factor per level within each decade
    TOTAL_XP[base + i] = Math.round(from * Math.pow(to / from, i / 10))
    ESTIMATED_LEVELS.add(base + i)
  }
  TOTAL_XP[base + 10] = to
}
