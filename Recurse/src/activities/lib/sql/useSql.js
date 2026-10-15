import { useSyncExternalStore } from 'react'
import { getSqlStatus, subscribeSql } from './engine.js'

/** Live sql.js loader status: { state: 'idle' | 'loading' | 'restarting' | 'ready' | 'error', ... }. */
export function useSqlStatus() {
  return useSyncExternalStore(subscribeSql, getSqlStatus, getSqlStatus)
}

/** Text for the loading states, or '' when there is nothing to say. */
export function sqlStatusText(status) {
  if (status.state === 'loading') return status.firstTime ? 'Downloading SQLite, about 700 KB, only the first time' : 'Starting SQLite'
  if (status.state === 'restarting') return 'Restarting SQLite after the last run was stopped'
  return ''
}
