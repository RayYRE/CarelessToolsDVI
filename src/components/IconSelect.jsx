import { useEffect, useId, useRef, useState } from 'react'
import Icon from './Icon.jsx'

/**
 * Dropdown like <select>, but options can show an icon (native options can't).
 *
 * options: [{ value, label, icon?, detail?, group? }]. Consecutive options sharing a
 * `group` get a heading. Keyboard: arrows/Home/End move, Enter/Space picks, Escape closes.
 */
export default function IconSelect({ label, value, options, onChange }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef(null)
  const list = useRef(null)
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const selected = options[selectedIndex]

  // Close when clicking anywhere else
  useEffect(() => {
    if (!open) return
    const onDown = (e) => !root.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Keep the highlighted option in view
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const show = () => {
    setActive(selectedIndex)
    setOpen(true)
  }
  const pick = (i) => {
    onChange(options[i].value)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    const last = options.length - 1
    const moves = {
      ArrowDown: () => (open ? setActive(Math.min(active + 1, last)) : show()),
      ArrowUp: () => (open ? setActive(Math.max(active - 1, 0)) : show()),
      Home: () => open && setActive(0),
      End: () => open && setActive(last),
      Enter: () => (open ? pick(active) : show()),
      ' ': () => (open ? pick(active) : show()),
      Escape: () => setOpen(false),
      Tab: () => setOpen(false),
    }
    if (!moves[e.key]) return
    if (e.key !== 'Tab') e.preventDefault()
    moves[e.key]()
  }

  return (
    <div className="field icon-select" ref={root}>
      <span id={`${id}-label`}>{label}</span>
      <button
        type="button"
        className="icon-select-button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <Option option={selected} />
        <span className="icon-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul className="icon-select-list" role="listbox" id={`${id}-list`} ref={list} aria-labelledby={`${id}-label`}>
          {options.map((o, i) => (
            <li key={o.value} role="presentation">
              {o.group && o.group !== options[i - 1]?.group && (
                <div className="icon-select-group" role="presentation">
                  {o.group}
                </div>
              )}
              <div
                id={`${id}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                className={`icon-select-option${i === active ? ' active' : ''}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(i)}
              >
                <Option option={o} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Option({ option }) {
  if (!option) return null
  return (
    <span className="with-icon">
      <Icon src={option.icon} />
      <span>{option.label}</span>
      {option.detail && <small className="icon-select-detail">{option.detail}</small>}
    </span>
  )
}
