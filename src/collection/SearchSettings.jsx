import { useEffect, useRef, useState } from 'react'
import { RARITIES } from '../game/rarities.js'

// Settings button with a pop-out for the greedy search: which item levels and rarities it may
// plan. `off` is { levels: [15, 30], rarities: ['Legendary'] }, listing what's switched off.
// Gathering also gets a depth: how many steps the search plans (nothing else limits it there)
export default function SearchSettings({
  levels,
  playerLevel,
  off,
  onChange,
  gathering,
  depth,
  onDepth,
  rank,
  onRank,
  skills,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on a click outside the pop-out or on Escape
  useEffect(() => {
    if (!open) return
    const onPointer = (e) => ref.current?.contains(e.target) || setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (list, value) => {
    const current = off[list] ?? []
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    onChange({ ...off, [list]: next })
  }
  const offCount = (off.levels?.length ?? 0) + (off.rarities?.length ?? 0) + (off.skills?.length ?? 0)

  return (
    <span className="popover-anchor" ref={ref}>
      <button
        type="button"
        className={`chip${offCount ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Choose which skills, item levels and rarities the search may use"
        onClick={() => setOpen(!open)}
      >
        Settings{offCount ? ` (${offCount} off)` : ''}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Search settings">
          {/* One grid so the controls line up with the columns below: search by over item levels,
              search depth over rarities */}
          <div className="popover-columns" style={{ gridTemplateColumns: `repeat(${skills ? 3 : 2}, auto)` }}>
            {gathering && (
              <label title="What the search picks first: the tier needing the fewest gathers, or the tier with the most points per gather">
                Search by
                <select value={rank} onChange={(e) => onRank(e.target.value)}>
                  <option value="gathers">Lowest gathers</option>
                  <option value="points">Points / action</option>
                </select>
              </label>
            )}
            {gathering && (
              <label title="Gathering uses no materials, so the search plans about this many rows, by-product rows included">
                Search depth (rows)
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={depth}
                  onChange={(e) => onDepth(Math.min(100, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
                />
              </label>
            )}
            {gathering && skills && <span />}
            {skills && (
              <fieldset>
                <legend>Skills</legend>
                {skills.map((skill) => (
                  <label key={skill} className="check">
                    <input
                      type="checkbox"
                      checked={!off.skills?.includes(skill)}
                      onChange={() => toggle('skills', skill)}
                    />
                    {skill}
                  </label>
                ))}
              </fieldset>
            )}
            <fieldset>
              <legend>Item levels</legend>
              {levels.map((level) => (
                <label key={level} className="check">
                  <input
                    type="checkbox"
                    checked={!off.levels?.includes(level)}
                    onChange={() => toggle('levels', level)}
                  />
                  Level {level}
                  {level > playerLevel && <small className="hint-inline"> (not unlocked yet)</small>}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Rarities</legend>
              {RARITIES.map((r) => (
                <label key={r.name} className="check">
                  <input
                    type="checkbox"
                    checked={!off.rarities?.includes(r.name)}
                    onChange={() => toggle('rarities', r.name)}
                  />
                  <span className={`rarity-${r.name.toLowerCase()}`}>{r.name}</span>
                </label>
              ))}
            </fieldset>
          </div>
          <button
            type="button"
            className="chip"
            disabled={!offCount}
            onClick={() => onChange({ levels: [], rarities: [], skills: [] })}
          >
            Enable all
          </button>
        </div>
      )}
    </span>
  )
}
