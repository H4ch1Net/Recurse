import { createContext, useContext } from 'react'

export const AppContext = createContext(null)

/** Access app state and actions. Must be used inside <AppProvider>. */
export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}
