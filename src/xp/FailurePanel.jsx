import { fmt, formatDuration, pct } from '../core/format.js'
import { failChance } from '../core/xp.js'

export default function FailurePanel({ failure, job, currentLevel, targetLevel, failed }) {
  const { never, stun } = job.fail
  return (
    <section className="panel">
      <h2>{failure.label}</h2>
      <p className="hint">
        {job.name}: {job.fail.chance}% at level {job.level}, dropping evenly to 0% at level {never}.
        Failed attempts give no XP{stun ? ` and add a ${stun}s stun` : ''}.
      </p>
      <div className="controls">
        <div className="stat">
          <span>Now (level {currentLevel})</span>
          <strong>{pct(failChance(job, currentLevel))}</strong>
        </div>
        <div className="stat">
          <span>At target (level {targetLevel})</span>
          <strong>{pct(failChance(job, targetLevel))}</strong>
        </div>
        <div className="stat">
          <span>{failure.noun} (expected)</span>
          <strong>≈ {fmt(failed)}</strong>
        </div>
        {stun > 0 && (
          <div className="stat">
            <span>Time stunned</span>
            <strong>{formatDuration(failed * stun)}</strong>
          </div>
        )}
      </div>
    </section>
  )
}
