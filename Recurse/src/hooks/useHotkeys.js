import { useEffect, useEffectEvent } from 'react'

const isTyping = (target) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/**
 * Bind single-key shortcuts. Keys are matched against event.key (letters lowercased).
 * Handlers are skipped while typing in a field unless the binding sets allowInInput,
 * and while a dialog is open. A binding is a function or { handler, allowInInput }.
 * A handler that returns false lets the event continue normally.
 */
export function useHotkeys(bindings, enabled = true) {
  const onKey = useEffectEvent((event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
    if (document.querySelector('[role="dialog"]')) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const binding = bindings[key]
    if (!binding) return
    const handler = typeof binding === 'function' ? binding : binding.handler
    if (isTyping(event.target) && !binding.allowInInput) return
    if (handler(event) !== false) event.preventDefault()
  })
  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
