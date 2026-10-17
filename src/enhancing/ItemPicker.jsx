import { useState } from 'react'
import { ITEMS, TIERS } from './items.js'

// Searchable grid of item icons; the chosen item sets the tier price.
// `rarity` (e.g. "epic") colours the frames like the game does.
export default function ItemPicker({ selectedId, rarity, onSelect }) {
  const [search, setSearch] = useState('')
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = ITEMS.filter((item) =>
    words.every((word) => item.name.toLowerCase().includes(word)),
  )
  const selected = ITEMS.find((item) => item.id === selectedId) ?? ITEMS[0]
  const tier = TIERS[selected.tier - 1]

  return (
    <div className="picker" data-rarity={rarity}>
      <div className="picker-head">
        <img src={selected.icon} alt="" />
        <div>
          <b>{selected.name}</b>
          <span>{tier.label}</span>
        </div>
        <input
          type="search"
          placeholder={`Search ${ITEMS.length} items`}
          aria-label="Search items"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="picker-grid">
        {shown.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === selected.id ? 'tile on' : 'tile'}
            title={`${item.name} (T${item.tier})`}
            aria-label={item.name}
            aria-pressed={item.id === selected.id}
            onClick={() => onSelect(item.id)}
          >
            <img src={item.icon} alt="" />
          </button>
        ))}
        {shown.length === 0 && <span className="hint">No items match.</span>}
      </div>
    </div>
  )
}
