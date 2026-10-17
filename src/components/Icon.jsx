// Small game icon; renders nothing when there's no SVG for it. Decorative, since the name is
// always shown next to it.
export default function Icon({ src, size = 20 }) {
  if (!src) return null
  return <img className="icon" src={src} alt="" width={size} height={size} loading="lazy" />
}
