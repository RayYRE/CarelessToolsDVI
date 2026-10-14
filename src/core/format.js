export const fmt = (n) => Math.round(n).toLocaleString()

export const num = (v) => Number(v) || 0

export const pct = (p) =>
  p >= 0.01 ? `${(p * 100).toFixed(2)}%` : p > 0 ? `${(p * 100).toPrecision(2)}%` : '0%'

export function formatDuration(totalSeconds) {
  if (!isFinite(totalSeconds) || totalSeconds <= 0) return '0s'
  const s = Math.round(totalSeconds)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts = []
  if (d) parts.push(`${d.toLocaleString()}d`)
  if (h) parts.push(`${h}h`)
  if (m && !d) parts.push(`${m}m`)
  if (sec && !d && !h) parts.push(`${sec}s`)
  return parts.join(' ')
}
