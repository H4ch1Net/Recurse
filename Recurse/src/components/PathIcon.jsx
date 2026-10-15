import { Code, Cpu, Globe, Network, Shield, Sigma } from 'lucide-react'

const ICONS = { network: Network, code: Code, cpu: Cpu, globe: Globe, shield: Shield, sigma: Sigma }

/** A learning path's emblem: its icon on a tile in the path's color. */
export default function PathIcon({ collection, size = 'md' }) {
  const Icon = ICONS[collection.icon] || Code
  const px = size === 'lg' ? 30 : size === 'sm' ? 16 : 22
  return (
    <span className={`path-icon ${size}`} style={{ '--hue': collection.hue }} aria-hidden="true">
      <Icon size={px} />
    </span>
  )
}
