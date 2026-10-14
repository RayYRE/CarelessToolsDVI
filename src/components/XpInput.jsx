import { num } from '../core/format.js'
import { clampLevel, levelForXp, xpForLevel } from '../core/xp.js'
import { ESTIMATED_LEVELS, MAX_LEVEL } from '../game/levels.js'

// Level + XP input pair: editing the level snaps XP to that level's start
export default function XpInput({ label, xp, onChange }) {
  const level = levelForXp(xp)
  return (
    <fieldset className="xp-input">
      <legend>{label}</legend>
      <label>
        Level
        <input
          type="number"
          min={1}
          max={MAX_LEVEL}
          value={level}
          onChange={(e) => onChange(xpForLevel(clampLevel(e.target.value)))}
        />
      </label>
      <label>
        XP
        <input
          type="number"
          min={0}
          value={xp}
          onChange={(e) => onChange(Math.max(0, num(e.target.value)))}
        />
      </label>
      {ESTIMATED_LEVELS.has(level) && <small className="warn">Level {level} XP is estimated</small>}
    </fieldset>
  )
}
