import { fsrs, createEmptyCard, Rating, State } from 'ts-fsrs'

export { Rating, State }

export function createScheduler(retention = 0.9) {
  return fsrs({ request_retention: retention })
}

export function createNewCard(now = new Date()) {
  return createEmptyCard(now)
}

export function scheduleNext(card, retention, grade, now = new Date()) {
  const scheduler = createScheduler(retention)
  const result = scheduler.next(card, now, grade)
  return result.card
}

export function previewReview(card, retention, now = new Date()) {
  const scheduler = createScheduler(retention)
  return scheduler.repeat(card, now)
}

export function gradeLabel(grade) {
  if (grade === Rating.Again) return 'Again'
  if (grade === Rating.Hard) return 'Hard'
  if (grade === Rating.Good) return 'Good'
  if (grade === Rating.Easy) return 'Easy'
  return 'Manual'
}

export function gradeForIndex(index) {
  return [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy][index] ?? Rating.Good
}
