// Shared app context: document, actions, read-only flag, today.
import { createContext, useContext } from 'react'

export const RadarContext = createContext(null)

export function useRadar() {
  const ctx = useContext(RadarContext)
  if (!ctx) throw new Error('useRadar must be used inside <RadarContext.Provider>')
  return ctx
}

// UI context: lets the update toast know a sheet is open (a SW reload must
// never destroy unsaved form input).
export const UiContext = createContext({ sheetCount: 0, incSheet: () => {}, decSheet: () => {} })

export function useUi() {
  return useContext(UiContext)
}
