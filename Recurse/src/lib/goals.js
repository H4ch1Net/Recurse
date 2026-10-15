// Goals: what a learner wants to achieve. Every goal is a path (a collection); its `kind` decides
// which group it appears in when someone picks what they are working toward.

export const GOAL_GROUPS = [
  { kind: 'career', title: 'Start a career', blurb: 'Everything an entry-level role asks for, from the first lesson to the interview.' },
  { kind: 'certification', title: 'Earn a certification', blurb: 'The whole exam blueprint, hands-on labs and timed practice exams.' },
  { kind: 'school', title: 'Get through school', blurb: 'A companion for the courses in a degree, in the order you take them.' },
  { kind: 'foundation', title: 'Build foundations', blurb: 'Core knowledge that many goals build on.' }
]

export const KIND_LABELS = { career: 'Career', certification: 'Certification', school: 'Degree companion', foundation: 'Foundations' }

/** Paths grouped by kind, in GOAL_GROUPS order, leaving out empty groups. */
export function groupGoals(collections) {
  return GOAL_GROUPS.map((group) => ({ ...group, paths: collections.filter((c) => (c.kind || 'foundation') === group.kind) })).filter((g) => g.paths.length > 0)
}

/** The subjects a set of goals touches, used to suggest topics and tailor Today. */
export function goalSubjects(goalIds, collections, packMap) {
  const subjects = new Set()
  for (const id of goalIds) {
    const path = collections.find((c) => c.id === id)
    for (const packId of path?.packIds || []) {
      const subject = packMap.get(packId)?.subject
      if (subject) subjects.add(subject)
    }
  }
  return [...subjects]
}
