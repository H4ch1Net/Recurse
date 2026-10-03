import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useApp } from '../state/context'

const ICONS = { good: CircleCheck, bad: CircleAlert, neutral: Info }

export default function Toasts({ placement = 'bottom' }) {
  const { toasts, dismissToast } = useApp()
  return (
    <div className={`toast-region ${placement}`} role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone] || Info
        return (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            <Icon size={18} className="icon" />
            <span>{toast.message}</span>
            <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
