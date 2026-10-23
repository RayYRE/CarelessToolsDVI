import { useEffect, useRef, useState } from 'react'
import { RARITIES } from '../game/rarities.js'

// Settings button with a pop-out for the greedy search: which item levels and rarities it may
// plan. `off` is { levels: [15, 30], rarities: ['Legendary'] }, listing what's switched off.
export default function SearchSettings({ levels, playerLevel, off, onChange }) {
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
  const offCount = (off.levels?.length ?? 0) + (off.rarities?.length ?? 0)

  return (
    <span className="popover-anchor" ref={ref}>
      <button
        type="button"
        className={`chip${offCount ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Choose which item levels and rarities the search may use"
        onClick={() => setOpen(!open)}
      >
        Settings{offCount ? ` (${offCount} off)` : ''}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Search settings">
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
          <button
            type="button"
            className="chip"
            disabled={!offCount}
            onClick={() => onChange({ levels: [], rarities: [] })}
          >
            Enable all
          </button>
        </div>
      )}
    </span>
  )
}
