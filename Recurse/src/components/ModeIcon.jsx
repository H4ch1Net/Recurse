import { Eye, Hammer, MessageSquareText, Scale, Zap } from 'lucide-react'

const ICONS = { scale: Scale, hammer: Hammer, eye: Eye, zap: Zap, message: MessageSquareText }

/** The icon for a learning approach. */
export default function ModeIcon({ mode, size = 18 }) {
  const Icon = ICONS[mode?.icon] || Scale
  return <Icon size={size} />
}
