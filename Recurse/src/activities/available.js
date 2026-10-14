import { ACTIVITIES } from './catalog'

// Types that have a widget in this build (the catalog may list a type before its widget exists).
const files = Object.keys(import.meta.glob('./widgets/*.jsx'))
export const AVAILABLE_TYPES = new Set(files.map((path) => path.slice('./widgets/'.length, -'.jsx'.length)))

export const AVAILABLE_ACTIVITIES = ACTIVITIES.filter((a) => AVAILABLE_TYPES.has(a.type))
