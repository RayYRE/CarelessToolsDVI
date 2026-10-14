import { fmt, num } from '../core/format.js'
import { levelForXp, xpPerAction } from '../core/xp.js'
import { RARITIES } from '../game/rarities.js'

const RARER = RARITIES.slice(1)

export default function CountsPanel({ counts, setCounts, xpGain, plan, baseXp, currentXp, targetXp }) {
  // Where the rarer actions alone get you (expected, burns included)
  const reachedXp = currentXp + plan.fixedXp
  const reachedLevel = levelForXp(reachedXp)
  const overshoot = plan.fixedActions > 0 && plan.commonActions === 0
  return (
    <section className="panel">
      <h2>Mixed rarity</h2>
      <p className="hint">Enter how many actions you'll do at each rarity. The rest is Common.</p>
      <div className="controls">
        {RARER.map((r) => (
          <label key={r.name}>
            {r.name} (×{r.multiplier}, {fmt(xpPerAction(baseXp, r.multiplier, xpGain))} XP)
            <input
              type="number"
              min={0}
              value={counts[r.name] ?? 0}
              onChange={(e) => setCounts({ ...counts, [r.name]: Math.max(0, num(e.target.value)) })}
            />
          </label>
        ))}
        <div className="stat">
          <span>Common (rest)</span>
          <strong>{fmt(plan.commonActions)}</strong>
        </div>
      </div>
      {plan.fixedActions > 0 && (
        <p className={overshoot ? 'warn' : 'hint'}>
          {overshoot
            ? `The rarer actions alone go past the target (level ${levelForXp(targetXp)}): `
            : 'The rarer actions alone reach '}
          level {reachedLevel} ({fmt(reachedXp)} XP
          {overshoot ? `, ${fmt(reachedXp - targetXp)} over` : ''}).
        </p>
      )}
    </section>
  )
}
