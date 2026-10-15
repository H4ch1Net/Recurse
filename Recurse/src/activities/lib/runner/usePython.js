import { useSyncExternalStore } from 'react'
import { getPythonStatus, subscribePython } from './pyRunner.js'

/** Live Python loader status: { state: 'idle' | 'loading' | 'restarting' | 'ready' | 'error', ... }. */
export function usePythonStatus() {
  return useSyncExternalStore(subscribePython, getPythonStatus, getPythonStatus)
}

/** Text for the loading states, or '' when there is nothing to say. */
export function pythonStatusText(status) {
  if (status.state === 'loading') return status.firstTime ? 'Downloading Python, about 10 MB, only the first time' : 'Starting Python'
  if (status.state === 'restarting') return 'Restarting Python after the last run was stopped'
  return ''
}
