import { Braces, Briefcase, ChartColumn, CircuitBoard, Cloud, Code, Cpu, Globe, GraduationCap, Network, Router, Shield, Sigma } from 'lucide-react'

// Icon names a path's `icon` field may use.
const ICONS = { network: Network, code: Code, cpu: Cpu, globe: Globe, shield: Shield, sigma: Sigma, braces: Braces, briefcase: Briefcase, chart: ChartColumn, circuit: CircuitBoard, cloud: Cloud, graduation: GraduationCap, router: Router }

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
