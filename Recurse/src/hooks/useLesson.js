import { useEffect, useState } from 'react'
import { cachedLesson, loadLesson, rememberLesson } from '../lib/packs'

/**
 * The full lesson for a pack. Returns { lesson, loading, error }. Built-in lessons are
 * fetched on first use and cached; user packs already carry their full lesson.
 */
export function useLesson(pack, enabled = true) {
  const [state, setState] = useState(() => ({ id: pack?.id, lesson: cachedLesson(pack), error: null }))
  const current = state.id === pack?.id ? state : { id: pack?.id, lesson: cachedLesson(pack), error: null }
  useEffect(() => {
    if (!enabled || !pack || current.lesson) return
    let alive = true
    loadLesson(pack)
      .then((lesson) => {
        rememberLesson(pack.id, lesson)
        if (alive) setState({ id: pack.id, lesson, error: null })
      })
      .catch((error) => alive && setState({ id: pack.id, lesson: null, error }))
    return () => {
      alive = false
    }
  }, [pack, enabled, current.lesson])
  return { lesson: current.lesson, loading: enabled && Boolean(pack?.lesson) && !current.lesson && !current.error, error: current.error }
}
