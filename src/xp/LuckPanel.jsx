import { fmt, num, pct } from '../core/format.js'
import { xpPerAction } from '../core/xp.js'

export default function LuckPanel({ skill, profile, setProfile, xpGain, odds, chances, baseXp }) {
  const { luck, rareFind } = profile
  return (
    <section className="panel">
      <h2>Luck &amp; rare-find</h2>
      <div className="controls">
        <label title="Tool (Uncommon +25%, Rare +75%, Epic +200%, Legendary +500%) + amulet">
          Luck in {skill} (%)
          <input
            type="number"
            min={0}
            value={luck[skill] ?? 0}
            onChange={(e) => setProfile({ luck: { ...luck, [skill]: num(e.target.value) } })}
          />
        </label>
        <label title="Hunter's brew, Vein Blessing, hot skill, town events, lucky shrine, Rare-find mastery">
          Rare-find (%)
          <input
            type="number"
            min={0}
            value={rareFind}
            onChange={(e) => setProfile({ rareFind: num(e.target.value) })}
          />
        </label>
        <div className="stat">
          <span>Odds multiplier</span>
          <strong>×{odds.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
        </div>
      </div>
      <p className="hint">
        Luck = tool (Uncommon +25%, Rare +75%, Epic +200%, Legendary +500%) + amulet.
      </p>
      <p className="hint">
        Rare-find = brew + Vein Blessing + hot skill + town events + lucky shrine + mastery, added
        together.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rarity</th>
              <th>Chance / action</th>
              <th>1 in</th>
              <th>XP / action</th>
            </tr>
          </thead>
          <tbody>
            {chances.map((r) => (
              <tr key={r.name} className="static">
                <td>{r.name}</td>
                <td>{pct(r.chance)}</td>
                <td>{r.chance > 0 ? fmt(1 / r.chance) : '—'}</td>
                <td>{fmt(xpPerAction(baseXp, r.multiplier, xpGain))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
