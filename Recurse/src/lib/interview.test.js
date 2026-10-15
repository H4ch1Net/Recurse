import { describe, expect, it } from 'vitest'
import {
  BEHAVIORAL_QUESTIONS,
  crossedWarning,
  feedbackPrompt,
  formatClock,
  interviewReadiness,
  interviewStats,
  interviewXP,
  mergeResult,
  normalizeComplexity,
  offlineChecklist,
  parseFeedback,
  parseValue,
  pickProblems,
  pickQuestions,
  problemTier,
  rubricAverage,
  sameComplexity,
  scoreInterview,
  secondsLeft,
  starCheck,
  testRate,
  wantedDifficulties
} from './interview'
import { createRandom } from './random'

const NOW = new Date('2026-10-15T12:00:00Z').getTime()
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString()

const c = (id, difficulty, set = 'hash-maps') => ({ id, difficulty, set, title: id })
const CHALLENGES = [
  c('warm-1', 'easy', 'warmups'),
  c('hm-easy-1', 'easy', 'hash-maps'),
  c('hm-easy-2', 'easy', 'hash-maps'),
  c('hm-med-1', 'medium', 'hash-maps'),
  c('tp-easy-1', 'easy', 'two-pointers'),
  c('tp-med-1', 'medium', 'two-pointers'),
  c('bits-1', 'easy', 'bits'),
  c('bits-2', 'easy', 'bits')
]

describe('pickProblems', () => {
  it('gives one medium for a coding interview and never draws warm-ups for "Surprise me"', () => {
    for (let seed = 1; seed < 30; seed++) {
      const picked = pickProblems({ challenges: CHALLENGES, format: 'coding', shape: 'medium', now: NOW, random: createRandom(seed) })
      expect(picked).toHaveLength(1)
      expect(picked[0].difficulty).toBe('medium')
      expect(picked[0].set).not.toBe('warmups')
    }
  })

  it('prefers unsolved problems and avoids ones solved in the last 14 days', () => {
    const solved = { 'hm-med-1': { solved: daysAgo(3), last: daysAgo(3) } }
    for (let seed = 1; seed < 30; seed++) {
      const [pick] = pickProblems({ challenges: CHALLENGES, format: 'coding', solved, now: NOW, random: createRandom(seed) })
      expect(pick.id).toBe('tp-med-1')
    }
  })

  it('prefers a problem solved long ago over one solved recently', () => {
    const solved = { 'hm-med-1': { last: daysAgo(30) }, 'tp-med-1': { last: daysAgo(2) } }
    const [pick] = pickProblems({ challenges: CHALLENGES, format: 'coding', solved, now: NOW, random: createRandom(4) })
    expect(pick.id).toBe('hm-med-1')
  })

  it('avoids problems seen in a recent mock interview', () => {
    const interviews = [{ date: daysAgo(1), problems: [{ id: 'hm-med-1' }] }]
    const [pick] = pickProblems({ challenges: CHALLENGES, format: 'coding', interviews, now: NOW, random: createRandom(9) })
    expect(pick.id).toBe('tp-med-1')
  })

  it('still picks something when every problem was solved recently', () => {
    const solved = Object.fromEntries(CHALLENGES.map((x) => [x.id, { last: daysAgo(1) }]))
    expect(pickProblems({ challenges: CHALLENGES, format: 'coding', solved, now: NOW, random: createRandom(2) })).toHaveLength(1)
  })

  it('gives two easy problems from different sets when asked', () => {
    for (let seed = 1; seed < 30; seed++) {
      const picked = pickProblems({ challenges: CHALLENGES, format: 'coding', shape: 'easy2', now: NOW, random: createRandom(seed) })
      expect(picked.map((p) => p.difficulty)).toEqual(['easy', 'easy'])
      expect(picked[0].set).not.toBe(picked[1].set)
    }
  })

  it('switches to two easy problems when the chosen pattern has no medium', () => {
    expect(wantedDifficulties('coding', 'medium', CHALLENGES.filter((x) => x.set === 'bits'))).toEqual(['easy', 'easy'])
    const picked = pickProblems({ challenges: CHALLENGES, format: 'coding', pattern: 'bits', now: NOW, random: createRandom(3) })
    expect(picked.map((p) => p.id).sort()).toEqual(['bits-1', 'bits-2'])
  })

  it('gives an online assessment an easy then a medium problem', () => {
    const picked = pickProblems({ challenges: CHALLENGES, format: 'oa', pattern: 'two-pointers', now: NOW, random: createRandom(5) })
    expect(picked.map((p) => p.id)).toEqual(['tp-easy-1', 'tp-med-1'])
  })

  it('falls back to another difficulty when a set is missing one', () => {
    const picked = pickProblems({ challenges: CHALLENGES, format: 'oa', pattern: 'bits', now: NOW, random: createRandom(5) })
    expect(picked).toHaveLength(2)
    expect(picked.every((p) => p.set === 'bits')).toBe(true)
  })

  it('ranks tiers', () => {
    expect(problemTier(c('x', 'easy'), { now: NOW })).toBe(0)
    expect(problemTier(c('x', 'easy'), { solved: { x: { solved: daysAgo(20) } }, now: NOW })).toBe(1)
    expect(problemTier(c('x', 'easy'), { solved: { x: { solved: daysAgo(20), last: daysAgo(5) } }, now: NOW })).toBe(2)
  })
})

describe('pickQuestions', () => {
  it('picks four questions from four different categories', () => {
    for (let seed = 1; seed < 20; seed++) {
      const qs = pickQuestions({ random: createRandom(seed) })
      expect(qs).toHaveLength(4)
      expect(new Set(qs.map((q) => q.category)).size).toBe(4)
    }
  })

  it('avoids questions from the last behavioral mocks when it can', () => {
    const first = pickQuestions({ random: createRandom(1) })
    const interviews = [{ format: 'behavioral', questions: first.map((q) => ({ id: q.id })) }]
    const next = pickQuestions({ interviews, random: createRandom(1) })
    expect(next.some((q) => first.some((f) => f.id === q.id))).toBe(false)
  })

  it('has a solid bank that covers the core areas', () => {
    const categories = new Set(BEHAVIORAL_QUESTIONS.map((q) => q.category))
    for (const needed of ['conflict', 'failure', 'deadline', 'learning', 'leadership', 'feedback', 'project']) expect(categories.has(needed)).toBe(true)
    expect(BEHAVIORAL_QUESTIONS.length).toBeGreaterThanOrEqual(14)
  })
})

describe('starCheck', () => {
  const strong = `Last semester I was on a team of four building a course scheduling app for our software engineering class. My task was the search feature, and we had two weeks before the demo.
A teammate wanted to load every course into the browser, and I worried it would be slow. I timed both approaches on the real catalog of 3,000 courses, wrote up the numbers and suggested a server-side search with an index. I paired with him to build it so he owned half of it.
As a result, search dropped from about 4 seconds to under 300 ms and we demoed on time. I learned to settle disagreements with a quick measurement instead of opinions, and I still do that today.`

  it('finds every part of a strong answer', () => {
    const check = starCheck(strong)
    expect(check.situation && check.task && check.action && check.result && check.number && check.reflection).toBe(true)
    expect(check.coverage).toBe(1)
    expect(check.flags).toEqual([])
  })

  it('reads explicit STAR labels', () => {
    const check = starCheck('S: club website for 40 members\nT: add a login page\nA: researched sessions\nR: shipped it')
    expect(check.situation && check.task && check.action && check.result).toBe(true)
    expect(starCheck('Task: fix it').situation).toBe(false)
  })

  it('flags "we" stories, blame and very short answers', () => {
    const check = starCheck('We built an app. We used React and we shipped it, and we were happy. It was his fault it was late.')
    const ids = check.flags.map((f) => f.id)
    expect(ids).toContain('we')
    expect(ids).toContain('blame')
    expect(ids).toContain('short')
    expect(check.action).toBe(false)
  })

  it('handles empty text', () => {
    const check = starCheck('')
    expect(check.words).toBe(0)
    expect(check.hits).toBe(0)
    expect(check.flags).toEqual([])
  })
})

describe('scoring', () => {
  const problem = (passed, total, hiddenPassed, hiddenTotal) => ({ best: { passed, total, hiddenPassed, hiddenTotal, allPassed: passed === total } })

  it('needs every rubric dimension before it scores', () => {
    expect(rubricAverage({ communication: 3, problemSolving: 3, coding: 3 }, 'coding')).toBeNull()
    expect(rubricAverage({ communication: 3, problemSolving: 3, coding: 3, verification: 4 }, 'coding')).toBe(3.25)
    expect(scoreInterview({ format: 'coding', rubric: { communication: 3 } }).score).toBeNull()
  })

  it('weights a coding interview 60% rubric and 40% tests', () => {
    const rubric = { communication: 4, problemSolving: 4, coding: 4, verification: 4 }
    expect(scoreInterview({ format: 'coding', rubric, problems: [problem(10, 10, 6, 6)] })).toMatchObject({ score: 100, verdict: 'strong', passed: true })
    const solid = { communication: 3, problemSolving: 3, coding: 3, verification: 3 }
    expect(scoreInterview({ format: 'coding', rubric: solid, problems: [problem(10, 10, 6, 6)] })).toMatchObject({ score: 80, verdict: 'pass' })
    expect(scoreInterview({ format: 'coding', rubric: solid, problems: [{}] })).toMatchObject({ score: 40, verdict: 'notyet', passed: false })
  })

  it('caps the verdict at borderline when any dimension scores 1', () => {
    const rubric = { communication: 1, problemSolving: 4, coding: 4, verification: 4 }
    expect(scoreInterview({ format: 'coding', rubric, problems: [problem(10, 10, 6, 6)] })).toMatchObject({ score: 85, verdict: 'borderline', passed: false })
  })

  it('scores an online assessment on hidden tests only', () => {
    const problems = [problem(8, 10, 4, 6), problem(3, 10, 0, 7)]
    expect(testRate(problems, { hiddenOnly: true })).toBeCloseTo((4 / 6 + 0) / 2)
    const result = scoreInterview({ format: 'oa', problems: [problem(10, 10, 6, 6), problem(9, 10, 5, 6)] })
    expect(result.score).toBe(92)
    expect(result.verdict).toBe('strong')
  })

  it('mixes rubric and STAR coverage for behavioral', () => {
    const rubric = { structure: 3, ownership: 3, impact: 3, reflection: 3 }
    const answers = [{ star: { coverage: 1 } }, { star: { coverage: 0.5 } }]
    expect(scoreInterview({ format: 'behavioral', rubric, answers }).score).toBe(Math.round((0.7 * (2 / 3) + 0.3 * 0.75) * 100))
  })

  it('keeps the best submission and counts runs', () => {
    let r = mergeResult(undefined, { kind: 'run', passed: 2, total: 2 })
    r = mergeResult(r, { kind: 'submit', passed: 7, total: 9, hiddenPassed: 5, hiddenTotal: 7 })
    r = mergeResult(r, { kind: 'submit', passed: 4, total: 9, hiddenPassed: 2, hiddenTotal: 7 })
    r = mergeResult(r, { kind: 'custom' })
    expect(r).toEqual({ runs: 1, submits: 2, custom: 1, best: { passed: 7, total: 9, hiddenPassed: 5, hiddenTotal: 7, allPassed: false } })
  })

  it('awards more XP for a pass', () => {
    expect(interviewXP({ format: 'coding', verdict: 'notyet' })).toBe(60)
    expect(interviewXP({ format: 'coding', verdict: 'strong' })).toBe(100)
    expect(interviewXP({ format: 'behavioral', verdict: 'pass' })).toBe(65)
  })
})

describe('timer', () => {
  it('counts down to zero', () => {
    expect(secondsLeft(NOW + 90500, NOW)).toBe(91)
    expect(secondsLeft(NOW - 5000, NOW)).toBe(0)
  })

  it('fires each warning once, when it is crossed', () => {
    expect(crossedWarning(601, 600)).toBe(600)
    expect(crossedWarning(600, 599)).toBeNull()
    expect(crossedWarning(121, 119)).toBe(120)
    expect(crossedWarning(null, 100)).toBeNull()
    expect(crossedWarning(31, 30, [30])).toBe(30)
  })

  it('formats the clock', () => {
    expect(formatClock(2700)).toBe('45:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(4200)).toBe('1:10:00')
  })
})

describe('parseValue', () => {
  it('reads JSON and Python spellings', () => {
    expect(parseValue('[1, 2, 3]')).toEqual([1, 2, 3])
    expect(parseValue('"abc"')).toBe('abc')
    expect(parseValue("['a', 'b']")).toEqual(['a', 'b'])
    expect(parseValue('[3, 9, None, True, False]')).toEqual([3, 9, null, true, false])
    expect(parseValue('[1, 2,]')).toEqual([1, 2])
  })

  it('explains what it could not read', () => {
    expect(() => parseValue('')).toThrow(/Enter a value/)
    expect(() => parseValue('[1, 2')).toThrow(/Use JSON/)
  })
})

describe('complexity', () => {
  it('normalizes common spellings', () => {
    expect(normalizeComplexity('O(n log n) for the sort')).toBe('nlogn')
    expect(normalizeComplexity('O((V + E) log V) with a heap')).toBe('(v+e)logv')
    expect(normalizeComplexity('linear')).toBe('n')
    expect(sameComplexity('O(n), n is the length', 'O(n)')).toBe(true)
    expect(sameComplexity('o(N^2)', 'O(n^2)')).toBe(true)
    expect(sameComplexity('O(R * C)', 'O(r*c)')).toBe(true)
    expect(sameComplexity('', 'O(n)')).toBe(false)
    expect(sameComplexity('O(n log n)', 'O(n)')).toBe(false)
  })
})

describe('offlineChecklist', () => {
  it('checks a coding interview from notes and results', () => {
    const problems = [{ id: 'p', complexity: { time: 'O(n)' }, results: { custom: 1, submits: 1, best: { allPassed: true } } }]
    const notes = { p: { questions: 'Can the list be empty? I assume it cannot.', example: '[1, 2] gives 3', approach: 'One pass with a hash map from value to index, checking the complement first.', planTime: 'O(n)', planSpace: 'O(n)', finalTime: 'O(n)', finalSpace: 'O(n)', improve: 'Sort and use two pointers to save memory.' } }
    const list = offlineChecklist({ format: 'coding', problems, notes })
    expect(list.every((item) => item.ok)).toBe(true)
    const empty = offlineChecklist({ format: 'coding', problems, notes: {} })
    expect(empty.find((i) => i.id === 'plan').ok).toBe(false)
    expect(empty.find((i) => i.id === 'ownCase').ok).toBe(true)
  })

  it('checks behavioral answers with the STAR rules', () => {
    const list = offlineChecklist({ format: 'behavioral', answers: [{ text: 'We did it. We were great. We won.' }] })
    expect(list.find((i) => i.id === 'ownership').ok).toBe(false)
    expect(list.find((i) => i.id === 'answered').ok).toBe(false)
  })
})

describe('readiness and stats', () => {
  it('averages the three most recent mocks', () => {
    expect(interviewReadiness([]).value).toBe(0)
    expect(interviewReadiness([]).detail).toBe('none yet')
    const list = [{ score: 90, passed: true }, { score: 60 }, { score: 30 }, { score: 100, passed: true }]
    expect(interviewReadiness(list).value).toBeCloseTo(0.6)
    expect(interviewReadiness(list).detail).toBe('2 of 4 passed')
  })

  it('finds the best rubric', () => {
    const stats = interviewStats([
      { format: 'coding', rubric: { communication: 3, problemSolving: 3, coding: 4, verification: 2 }, score: 70, passed: true },
      { format: 'oa', score: 95, passed: true },
      { format: 'behavioral', rubric: { structure: 4, ownership: 4, impact: 3, reflection: 3 }, score: 80, passed: true }
    ])
    expect(stats).toEqual({ total: 3, passed: 3, bestRubric: 3.5, bestScore: 95 })
    expect(interviewStats([]).bestRubric).toBeNull()
  })
})

describe('AI feedback', () => {
  it('builds a prompt with notes, results and code', () => {
    const { system, user } = feedbackPrompt({
      format: 'coding',
      seconds: 1800,
      limit: 2700,
      problems: [{ id: 'p', title: 'Two Sum', difficulty: 'easy', prompt: 'Find two numbers.', code: 'function twoSum() {}', language: 'javascript', results: { best: { passed: 3, total: 9, hiddenPassed: 1, hiddenTotal: 6 } } }],
      notes: { p: { approach: 'Hash map of seen values' } }
    })
    expect(system).toMatch(/"communication": 1-4/)
    expect(user).toMatch(/30 of 45 minutes/)
    expect(user).toMatch(/Approach, in plain words or pseudocode: Hash map of seen values/)
    expect(user).toMatch(/hidden 1 of 6/)
    expect(user).toMatch(/function twoSum/)
  })

  it('normalizes the reply', () => {
    const dash = String.fromCharCode(0x2014)
    const out = parseFeedback({ summary: `Good start ${dash} clear plan.`, strengths: 'Clear plan', improvements: ['Test edge cases', ''], rubric: { communication: 5, coding: '3', problemSolving: 0 }, nextStep: 'Trace by hand.' }, 'coding')
    expect(out.summary).toBe('Good start, clear plan.')
    expect(out.strengths).toEqual(['Clear plan'])
    expect(out.improvements).toEqual(['Test edge cases'])
    expect(out.rubric).toEqual({ coding: 3 })
  })
})
