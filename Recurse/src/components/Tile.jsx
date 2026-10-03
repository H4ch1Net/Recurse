import { subjectHue } from '../lib/subjects'

export default function Tile({ pack, size = '' }) {
  return (
    <span className={`tile ${size}`} style={{ '--hue': subjectHue(pack.subject) }} aria-hidden="true">
      {pack.icon}
    </span>
  )
}
