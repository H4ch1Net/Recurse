// Mock interviews: formats, picking problems and questions, the STAR checklist, the rubric,
// the verdict and optional AI feedback. Everything except the AI call is pure, so it is
// tested in interview.test.js; the screens live in pages/MockInterview*.jsx.
import { callAI, extractJSON } from './ai'
import { shuffle } from './random'

export const DAY_MS = 86400000
/** Problems solved, or seen in a mock, within this many days are avoided by "Surprise me". */
export const RECENT_DAYS = 14
/** Behavioral answers get this many seconds each. */
export const QUESTION_SECONDS = 180
/** Coding timer warnings, in seconds left. */
export const WARNINGS = [600, 120]
export const BEHAVIORAL_WARNINGS = [30]
export const HISTORY_LIMIT = 30

export const FORMATS = [
  {
    id: 'coding',
    title: 'Coding interview',
    minutes: 45,
    kind: 'coding',
    blurb: 'One medium problem or two easy ones, run like a phone screen or onsite round.',
    rules: [
      'Forty-five minutes on the clock. At zero the editor locks and the review opens.',
      'No hints and no reference solution until it is over, just like the real thing.',
      'Work through five steps: clarify, plan, code, test, wrap up. Your typed notes are your thinking out loud.',
      'Submit runs the hidden tests. Only submitted results count.'
    ]
  },
  {
    id: 'oa',
    title: 'Online assessment',
    minutes: 70,
    kind: 'coding',
    blurb: 'Two problems scored by hidden tests, like HackerRank or CodeSignal.',
    rules: [
      'Seventy minutes for two problems, an easier one first.',
      'Nobody is watching, so only the hidden tests count. The examples you can see do not.',
      'Submit as often as you like. Your best submission for each problem is the one that counts.',
      'No hints and no reference solution until it is over.'
    ]
  },
  {
    id: 'behavioral',
    title: 'Behavioral',
    minutes: 12,
    kind: 'behavioral',
    blurb: 'Four questions, three minutes each, answered as STAR stories.',
    rules: [
      'Four questions from different areas: conflict, failure, deadlines, learning, leadership, feedback, projects.',
      'Three minutes per question. Say your answer out loud first if you can, then type it or its bullet points.',
      'Structure every answer as Situation, Task, Action, Result. Add a number and what you learned.',
      'The checklist under the answer box shows which parts your answer already covers.'
    ]
  }
]

export const FORMAT_MAP = new Map(FORMATS.map((f) => [f.id, f]))
export const getFormat = (id) => FORMAT_MAP.get(id) || null

/** Coding interview shapes. "medium" falls back to two easy problems when the pool has no medium. */
export const CODING_SHAPES = [
  { id: 'medium', label: 'One medium' },
  { id: 'easy2', label: 'Two easy' }
]

// ---- Steps ------------------------------------------------------------------------

const STEP_CLARIFY = {
  id: 'clarify',
  title: 'Clarify',
  guide: 'Restate the problem, ask what is unclear and pin down the edge cases. Do not write code yet.',
  fields: [
    { id: 'questions', label: 'Questions and assumptions', rows: 4, placeholder: 'Can the input be empty? Can values repeat or be negative? I will assume...' },
    { id: 'example', label: 'One example of your own, with the expected output', rows: 2, placeholder: 'nums = [4, 1, 4], target = 8 gives [0, 2]' }
  ]
}

const STEP_PLAN = {
  id: 'plan',
  title: 'Plan',
  guide: 'Say the brute force and its cost, then the better approach. Get the complexity down before you code.',
  fields: [
    { id: 'approach', label: 'Approach, in plain words or pseudocode', rows: 5, placeholder: 'Brute force checks every pair, O(n^2). Better: one pass with a map from value to index...' },
    { id: 'planTime', label: 'Time', line: true, placeholder: 'O(n)' },
    { id: 'planSpace', label: 'Space', line: true, placeholder: 'O(n)' }
  ]
}

const STEP_CODE = {
  id: 'code',
  title: 'Code',
  guide: 'Write clean code with clear names. Narrate decisions, not keystrokes. Run the examples when you are ready.',
  fields: [{ id: 'narration', label: 'Decisions while coding (optional)', rows: 3, placeholder: 'Using a dict so each lookup is O(1). Returning early when...' }]
}

const STEP_TEST = {
  id: 'test',
  title: 'Test',
  guide: 'Trace one example by hand, then try your own edge cases. Submit to run the hidden tests.',
  fields: [{ id: 'edgeCases', label: 'Edge cases you checked, and what happened', rows: 3, placeholder: 'Empty list returns []. One element... Duplicates...' }]
}

const STEP_WRAP = {
  id: 'wrap',
  title: 'Wrap up',
  guide: 'State the final complexity, defining n, and what you would improve with more time.',
  fields: [
    { id: 'finalTime', label: 'Final time complexity', line: true, placeholder: 'O(n), n is the length of nums' },
    { id: 'finalSpace', label: 'Final space complexity', line: true, placeholder: 'O(n) for the map' },
    { id: 'improve', label: 'What you would improve or trade off', rows: 3, placeholder: 'If memory were tight I would sort first and use two pointers, O(n log n) time...' }
  ]
}

const STEP_READ = {
  id: 'read',
  title: 'Read',
  guide: 'Read the constraints closely. Hidden tests hit the edges: list the ones you will need to handle.',
  fields: [
    { id: 'edgeList', label: 'Edge cases the hidden tests will probably try', rows: 3, placeholder: 'Empty input, one element, all equal, negatives, the largest size...' },
    { id: 'approach', label: 'Approach and its complexity', rows: 3, placeholder: 'Sort, then sweep once: O(n log n) time.' }
  ]
}

export const STEPS = {
  coding: [STEP_CLARIFY, STEP_PLAN, STEP_CODE, STEP_TEST, STEP_WRAP],
  oa: [STEP_READ, STEP_CODE, STEP_TEST]
}

export const stepsFor = (format) => STEPS[format] || []

// ---- Picking problems ---------------------------------------------------------------

const DIFFICULTY_RANK = { easy: 0, medium: 1, hard: 2 }
const FALLBACK = { easy: ['easy', 'medium', 'hard'], medium: ['medium', 'hard', 'easy'], hard: ['hard', 'medium', 'easy'] }
const difficultyOf = (c) => (c.difficulty in DIFFICULTY_RANK ? c.difficulty : 'medium')

const timeOf = (value) => {
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : null
}

/** Challenge ids used in mock interviews within the last `days`. */
export function recentInterviewProblems(interviews = [], now = Date.now(), days = RECENT_DAYS) {
  const ids = new Set()
  for (const record of interviews || []) {
    const at = timeOf(record?.date)
    if (at === null || now - at >= days * DAY_MS) continue
    for (const p of record.problems || []) if (p?.id) ids.add(p.id)
  }
  return ids
}

/**
 * How much a challenge should be avoided: 0 never solved (best), 1 solved a while ago,
 * 2 solved in the last two weeks or seen in a recent mock interview.
 */
export function problemTier(challenge, { solved = {}, recentMock = new Set(), now = Date.now() } = {}) {
  if (recentMock.has(challenge.id)) return 2
  const entry = solved?.[challenge.id]
  if (!entry) return 0
  const at = timeOf(entry.last || entry.solved)
  if (at === null) return 1
  return now - at < RECENT_DAYS * DAY_MS ? 2 : 1
}

/** Challenges a pick can draw from: one set, or everything except warm-ups for "Surprise me". */
export function interviewPool(challenges = [], pattern = 'surprise') {
  if (pattern && pattern !== 'surprise') return challenges.filter((c) => c.set === pattern)
  const pool = challenges.filter((c) => c.set !== 'warmups')
  return pool.length ? pool : challenges
}

/** The difficulties to pick, in order. */
export function wantedDifficulties(format, shape, pool = []) {
  if (format === 'oa') return ['easy', 'medium']
  if (format !== 'coding') return []
  if (shape === 'easy2') return ['easy', 'easy']
  return pool.some((c) => difficultyOf(c) !== 'easy') ? ['medium'] : ['easy', 'easy']
}

/**
 * Pick the problems for a coding interview or online assessment. Prefers challenges the
 * learner has never solved, then ones solved more than two weeks ago, and avoids anything
 * solved or seen in a mock in the last two weeks. Two problems come from different sets
 * when the pool allows. Easier problems come first.
 */
export function pickProblems({ challenges = [], format = 'coding', shape = 'medium', pattern = 'surprise', solved = {}, interviews = [], now = Date.now(), random = Math.random } = {}) {
  const pool = interviewPool(challenges, pattern)
  const wanted = wantedDifficulties(format, shape, pool)
  const recentMock = recentInterviewProblems(interviews, now)
  const ranked = shuffle(pool, random)
    .map((c) => ({ c, tier: problemTier(c, { solved, recentMock, now }) }))
    .sort((a, b) => a.tier - b.tier)
  const chosen = []
  for (const difficulty of wanted) {
    for (const d of FALLBACK[difficulty]) {
      const options = ranked.filter((r) => difficultyOf(r.c) === d && !chosen.includes(r.c))
      if (!options.length) continue
      const best = options[0].tier
      const pick = options.find((r) => r.tier === best && !chosen.some((c) => c.set === r.c.set)) || options[0]
      chosen.push(pick.c)
      break
    }
  }
  return chosen.sort((a, b) => DIFFICULTY_RANK[difficultyOf(a)] - DIFFICULTY_RANK[difficultyOf(b)])
}

// ---- Behavioral questions -------------------------------------------------------------

export const BEHAVIORAL_CATEGORIES = {
  conflict: 'Team conflict',
  failure: 'Failure',
  deadline: 'Tight deadline',
  learning: 'Learning fast',
  leadership: 'Leadership',
  feedback: 'Feedback',
  project: 'Proudest project',
  ambiguity: 'Ambiguity'
}

export const BEHAVIORAL_QUESTIONS = [
  {
    id: 'conflict-disagree',
    category: 'conflict',
    question: 'Tell me about a time you disagreed with a teammate about how to do something. What happened?',
    lookFor: 'A disagreement about the work, not about personalities. You listened, used evidence to decide, and the relationship survived. It is fine if you turned out to be wrong.'
  },
  {
    id: 'conflict-difficult',
    category: 'conflict',
    question: 'Describe a time you worked with someone who was hard to work with. How did you handle it?',
    lookFor: 'Empathy and a direct, private conversation, not complaining to others. What you changed in how you worked together, and how the project turned out.'
  },
  {
    id: 'failure-mistake',
    category: 'failure',
    question: 'Tell me about a time you made a mistake. What did you do about it?',
    lookFor: 'A real mistake with limited stakes, owned without blaming anyone. How you fixed it fast, told the right people, and what you changed so it would not happen again.'
  },
  {
    id: 'failure-plan',
    category: 'failure',
    question: 'Tell me about something you built that did not work the way you planned.',
    lookFor: 'What went wrong and why, what you tried next, and the specific lesson you now apply. Not a disguised success story.'
  },
  {
    id: 'deadline-tight',
    category: 'deadline',
    question: 'Tell me about a time you had to deliver something under a tight deadline.',
    lookFor: 'How you cut scope and set priorities, who you kept informed, and what you delivered on time. Bonus: what you would plan differently.'
  },
  {
    id: 'deadline-juggle',
    category: 'deadline',
    question: 'Describe a time you had too many things to do at once. How did you decide what came first?',
    lookFor: 'A clear way of prioritizing (impact, deadlines, dependencies), saying no or renegotiating honestly, and the outcome for each task.'
  },
  {
    id: 'learning-fast',
    category: 'learning',
    question: 'Tell me about a time you had to learn a new technology or skill quickly.',
    lookFor: 'What you had to learn, by when, how you learned it (docs, a small experiment, asking a specific person) and what you delivered with it.'
  },
  {
    id: 'learning-unknown',
    category: 'learning',
    question: 'Describe a task you were given that you did not know how to do. How did you get started?',
    lookFor: 'Breaking the unknown into questions, finding answers efficiently, asking for help at the right moment, and finishing the task.'
  },
  {
    id: 'leadership-initiative',
    category: 'leadership',
    question: 'Tell me about a time you took the lead without being asked.',
    lookFor: 'Ownership: you saw a problem, proposed a plan, got others on board and followed through. Leadership without a title counts.'
  },
  {
    id: 'leadership-helped',
    category: 'leadership',
    question: 'Describe a time you helped a teammate who was stuck or struggling.',
    lookFor: 'How you noticed, how you helped without taking over, and how the teammate and the project did afterward.'
  },
  {
    id: 'feedback-critical',
    category: 'feedback',
    question: 'Tell me about a time you received critical feedback. What did you do with it?',
    lookFor: 'Coachability: you listened without getting defensive, asked questions to understand, changed something concrete and can show the result.'
  },
  {
    id: 'feedback-disagree',
    category: 'feedback',
    question: 'Tell me about a time you disagreed with feedback from a manager, professor or code reviewer.',
    lookFor: 'Respectful disagreement backed by evidence, openness to being wrong, and a decision everyone could commit to.'
  },
  {
    id: 'project-proud',
    category: 'project',
    question: 'What project are you proudest of, and what was your part in it?',
    lookFor: 'Your own contribution (say "I"), one or two technical decisions and why you made them, and the result with a number or real users.'
  },
  {
    id: 'project-hard',
    category: 'project',
    question: 'Tell me about the hardest technical problem you have solved.',
    lookFor: 'Why it was hard, how you narrowed it down, the options you weighed, and how you knew it was fixed.'
  },
  {
    id: 'ambiguity-unclear',
    category: 'ambiguity',
    question: 'Tell me about a time the requirements were unclear. What did you do?',
    lookFor: 'You asked targeted questions, wrote down assumptions, built something small to check them, and adjusted when you learned more.'
  },
  {
    id: 'ambiguity-broke',
    category: 'ambiguity',
    question: 'Tell me about a time something broke and nobody knew why. How did you handle it?',
    lookFor: 'A calm, systematic approach: reproduce, narrow down, communicate status, fix, and prevent a repeat.'
  }
]

const QUESTION_MAP = new Map(BEHAVIORAL_QUESTIONS.map((q) => [q.id, q]))
export const getQuestion = (id) => QUESTION_MAP.get(id) || null

/** Four questions from different categories, preferring ones not asked in the last three behavioral mocks. */
export function pickQuestions({ count = 4, interviews = [], random = Math.random } = {}) {
  const recent = new Set(
    (interviews || [])
      .filter((i) => i?.format === 'behavioral')
      .slice(0, 3)
      .flatMap((i) => (i.questions || []).map((q) => q.id))
  )
  const ranked = shuffle(BEHAVIORAL_QUESTIONS, random)
    .map((q) => ({ q, seen: recent.has(q.id) ? 1 : 0 }))
    .sort((a, b) => a.seen - b.seen)
  const out = []
  const categories = new Set()
  for (const { q } of ranked) {
    if (out.length >= count) break
    if (categories.has(q.category)) continue
    categories.add(q.category)
    out.push(q)
  }
  return out
}

// ---- STAR checklist ---------------------------------------------------------------------

const label = (names) => new RegExp(`(^|\\n)\\s*[-*]?\\s*(?:${names})\\s*[:.)-]`, 'i')

const STAR_RULES = {
  situation: {
    label: label('s|situation|context'),
    cue: /\b(when I was|while I was|during|at my|last (year|summer|semester|spring|fall|winter|month|week)|this (year|summer|semester)|semester|internship|hackathon|club|class|course|my team|our team|team of|project|job|company|startup|we were|I was working|working on|part-time|volunteer)\b/i
  },
  task: {
    label: label('t|task|goal'),
    cue: /\b(my (goal|job|task|role|responsibility)|the goal|our goal|the task|I (needed|had|was asked|was supposed|wanted) to|we (needed|had) to|I was (responsible|in charge|tasked|assigned)|responsible for|in charge of|assigned|deadline|had to|needed to|the (challenge|problem) was|aim was)\b/i
  },
  action: {
    label: label('a|action|actions'),
    cue: null
  },
  result: {
    label: label('r|result|results|outcome'),
    cue: /\b(as a result|result(ed|s)?|in the end|ended up|outcome|shipped|launched|released|deployed|improved|reduced|increased|cut|saved|won|passed|delivered|finished|completed|on time|which (meant|led)|led to|dropped|grew|went from|adopted|still uses?|got (an?|the|our|my))\b/i
  }
}

const ACTION = /\bI\s+(?:then\s+|first\s+|also\s+|quickly\s+|eventually\s+|finally\s+|immediately\s+)?(?:[a-z]+ed|built|wrote|rewrote|made|took|set|led|ran|spoke|met|told|chose|found|began|sat|went|did|drew|broke|split|gave|got|kept|read|taught|thought|brought|sent|put|dug|caught|knew|left|paid|sold|won)\b/gi
const NUMBER = /\d|%|\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million|dozen|half|double|doubled|twice|triple|tripled|percent)\b/i
const REFLECTION = /\b(I learned|learned|taught me|lesson|next time|in hindsight|looking back|I would (now|do|have)|I'd (do|now|have)|would do differently|since then|now I|I now|realized|takeaway|from then on|going forward|I still)\b/i
const BLAME = /\b(his fault|her fault|their fault|not my fault|blamed?|lazy|incompetent|useless|stupid|idiot)\b/i

export const STAR_PARTS = [
  { id: 'situation', label: 'Situation', tip: 'Open with one or two sentences of context: where, when, who.' },
  { id: 'task', label: 'Task', tip: 'Say what you needed to get done and why it mattered.' },
  { id: 'action', label: 'Action', tip: 'Spend most of the answer on what you did, step by step, starting sentences with "I".' },
  { id: 'result', label: 'Result', tip: 'End with what happened. Stories that just stop lose the point.' },
  { id: 'number', label: 'A number', tip: 'Quantify something: time saved, users, bugs, before and after.' },
  { id: 'reflection', label: 'Reflection', tip: 'Close with what you learned or would do differently.' }
]

const countMatches = (text, regex) => (text.match(regex) || []).length
export const wordCount = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length

/**
 * Which STAR parts an answer covers, from labels ("S:", "Task:") or wording cues, plus a
 * number, a reflection, word count, "I" versus "we", and red flags.
 */
export function starCheck(text = '') {
  const t = String(text || '')
  const words = wordCount(t)
  const actions = countMatches(t, ACTION)
  const has = (part) => STAR_RULES[part].label.test(t) || Boolean(STAR_RULES[part].cue?.test(t))
  const iCount = countMatches(t, /\bI\b/g)
  const weCount = countMatches(t, /\bwe\b/gi)
  const parts = {
    situation: words >= 8 && has('situation'),
    task: has('task'),
    action: STAR_RULES.action.label.test(t) || actions >= 2,
    result: has('result'),
    number: NUMBER.test(t),
    reflection: REFLECTION.test(t)
  }
  const flags = []
  if (words > 0 && words < 60) flags.push({ id: 'short', text: 'Short. A full story is usually 150 to 300 words spoken, about two minutes.' })
  if (words > 400) flags.push({ id: 'long', text: 'Long. Past three minutes, interviewers lose the thread. Trim the situation.' })
  if (weCount >= 3 && weCount > iCount) flags.push({ id: 'we', text: 'More "we" than "I". Say what you did.' })
  if (BLAME.test(t)) flags.push({ id: 'blame', text: 'This may read as blaming someone. Focus on what you did.' })
  const hits = STAR_PARTS.filter((p) => parts[p.id]).length
  return { ...parts, words, actions, iCount, weCount, flags, hits, coverage: hits / STAR_PARTS.length }
}

// ---- Rubric and verdict ------------------------------------------------------------------

export const LEVELS = ['Missing', 'Partial', 'Solid', 'Strong']

const COMMUNICATION = {
  id: 'communication',
  title: 'Communication',
  question: 'Could the interviewer follow your thinking the whole time?',
  levels: [
    'Long silences or no notes. The interviewer could not tell what you were doing or why.',
    'Some decisions explained, but you jumped into code before stating a plan or went quiet when stuck.',
    'Restated the problem, asked a question, stated the plan before coding and narrated decisions.',
    'Clear throughout: precise questions, trade-offs said out loud and an easy walkthrough at the end.'
  ]
}

const PROBLEM_SOLVING = {
  id: 'problemSolving',
  title: 'Problem solving',
  question: 'Did you find a good approach and improve it?',
  levels: [
    'No working approach, or stuck on the first idea.',
    'Reached a brute force but did not improve it, or needed the approach handed to you.',
    'Found a reasonable approach on your own, stated its complexity and saw the obvious improvements.',
    'Reached an optimal or near-optimal approach and explained why it fits the constraints better than the alternatives.'
  ]
}

const CODING = {
  id: 'coding',
  title: 'Coding',
  question: 'Is the code correct, readable and idiomatic?',
  levels: [
    'The code did not run or was mostly unfinished.',
    'Mostly works but hard to read: unclear names, tangled conditions or bugs you did not find.',
    'Correct and readable, with clear names and a sensible structure.',
    'Clean, idiomatic code written steadily, with helpers where they help and nothing wasted.'
  ]
}

const VERIFICATION = {
  id: 'verification',
  title: 'Verification',
  question: 'Did you check your own code before the tests did?',
  levels: [
    'Did not test. The tests found the bugs for you.',
    'Ran the given examples, but no edge cases of your own.',
    'Traced an example by hand and tested edge cases such as empty input, one element or duplicates.',
    'Found and fixed your own bugs before submitting and covered the boundaries the constraints allow.'
  ]
}

export const RUBRICS = {
  coding: [COMMUNICATION, PROBLEM_SOLVING, CODING, VERIFICATION],
  oa: [PROBLEM_SOLVING, CODING, VERIFICATION],
  behavioral: [
    {
      id: 'structure',
      title: 'Structure',
      question: 'Was each story easy to follow?',
      levels: [
        'No clear story: context, actions and outcome mixed together or missing.',
        'Some STAR parts, but the context ran long or the story stopped without a result.',
        'A clear situation, task, action and result in about two minutes.',
        'Tight and easy to follow, with most of the time on your actions and a strong ending.'
      ]
    },
    {
      id: 'ownership',
      title: 'Your actions',
      question: 'Is it clear what you did?',
      levels: [
        'Mostly "we" or general statements. It is unclear what you did.',
        'Some of your actions, but vague ("I helped with the backend").',
        'Specific actions in the first person, with the reasons behind them.',
        'Specific actions, the judgment behind each choice and how you brought others along.'
      ]
    },
    {
      id: 'impact',
      title: 'Results',
      question: 'Did each story land on a concrete outcome?',
      levels: [
        'No result, or the story just stops.',
        'A result, but vague ("it went well").',
        'A concrete result with a number or a clear before and after.',
        'A measured result, how you measured it, and why it mattered to the team or users.'
      ]
    },
    {
      id: 'reflection',
      title: 'Reflection',
      question: 'Did you show what you learned?',
      levels: [
        'No lesson, or a lesson anyone could claim without the story.',
        'A generic lesson ("communication is important").',
        'A specific lesson tied to this story.',
        'A specific lesson and what you have done differently since, with an example.'
      ]
    }
  ]
}

export const rubricFor = (format) => RUBRICS[format] || []

/** Mean of the rubric scores (1 to 4), or null until every dimension is rated. */
export function rubricAverage(rubric = {}, format = 'coding') {
  const dims = rubricFor(format)
  if (!dims.length) return null
  const scores = dims.map((d) => Number(rubric?.[d.id]))
  if (scores.some((s) => !(s >= 1 && s <= 4))) return null
  return scores.reduce((sum, s) => sum + s, 0) / scores.length
}

/**
 * Share of tests passed across the problems, from each problem's best submission (a problem
 * with `results.best`, or the results object itself). A problem never submitted counts as
 * zero. hiddenOnly scores only the hidden tests (online assessments).
 */
export function testRate(problems = [], { hiddenOnly = false } = {}) {
  if (!problems.length) return 0
  const rates = problems.map((p) => {
    const best = p?.results?.best ?? p?.best
    if (!best) return 0
    const total = hiddenOnly && best.hiddenTotal ? best.hiddenTotal : best.total
    const passed = hiddenOnly && best.hiddenTotal ? best.hiddenPassed : best.passed
    return total ? passed / total : 0
  })
  return rates.reduce((sum, r) => sum + r, 0) / rates.length
}

/** Merge a new test summary into a problem's results: keeps the best submission and counts runs. */
export function mergeResult(prior = {}, summary) {
  const next = { runs: prior.runs || 0, submits: prior.submits || 0, best: prior.best || null, custom: prior.custom || 0 }
  if (!summary) return next
  if (summary.kind === 'custom') return { ...next, custom: next.custom + 1 }
  if (summary.kind !== 'submit') return { ...next, runs: next.runs + 1 }
  const entry = {
    passed: summary.passed || 0,
    total: summary.total || 0,
    hiddenPassed: summary.hiddenPassed || 0,
    hiddenTotal: summary.hiddenTotal || 0,
    allPassed: Boolean(summary.allPassed)
  }
  const better = !next.best || entry.passed > next.best.passed || (entry.passed === next.best.passed && entry.hiddenPassed >= next.best.hiddenPassed)
  return { ...next, submits: next.submits + 1, best: better ? entry : next.best }
}

export const VERDICTS = {
  strong: { id: 'strong', label: 'Strong pass', tone: 'good', note: 'This would likely be a strong hire signal. Keep the habits that got you here.' },
  pass: { id: 'pass', label: 'Pass', tone: 'good', note: 'A solid round. Tighten the weakest dimension and it becomes a strong one.' },
  borderline: { id: 'borderline', label: 'Borderline', tone: 'warn', note: 'Close. One weak area is enough to tip a real decision either way.' },
  notyet: { id: 'notyet', label: 'Not yet', tone: 'bad', note: 'Not there yet, and that is what practice rounds are for. Work on the lowest scores below.' }
}

const verdictFor = (score) => (score >= 85 ? 'strong' : score >= 65 ? 'pass' : score >= 45 ? 'borderline' : 'notyet')

/**
 * The overall score (0 to 100) and verdict, kept simple:
 *   coding interview: 60% rubric, 40% tests passed
 *   online assessment: hidden tests only
 *   behavioral: 70% rubric, 30% STAR coverage of the answers
 * A rubric score of 1 anywhere caps the verdict at borderline. Returns score null until the
 * rubric is complete (online assessments do not need it).
 */
export function scoreInterview({ format, rubric = {}, problems = [], answers = [] } = {}) {
  const avg = rubricAverage(rubric, format)
  const rubricPct = avg === null ? null : (avg - 1) / 3
  let value
  if (format === 'oa') value = testRate(problems, { hiddenOnly: true })
  else if (rubricPct === null) return { score: null, verdict: null, passed: false, rubricAverage: null }
  else if (format === 'behavioral') {
    const coverage = answers.length ? answers.reduce((sum, a) => sum + (a?.star?.coverage || 0), 0) / answers.length : 0
    value = 0.7 * rubricPct + 0.3 * coverage
  } else value = 0.6 * rubricPct + 0.4 * testRate(problems)
  const score = Math.round(value * 100)
  let verdict = verdictFor(score)
  const anyOne = format !== 'oa' && rubricFor(format).some((d) => Number(rubric[d.id]) === 1)
  if (anyOne && (verdict === 'strong' || verdict === 'pass')) verdict = 'borderline'
  return { score, verdict, passed: verdict === 'strong' || verdict === 'pass', rubricAverage: avg }
}

/** XP for a saved mock interview. */
export function interviewXP({ format, verdict } = {}) {
  const base = format === 'behavioral' ? 40 : 60
  const bonus = verdict === 'strong' ? 40 : verdict === 'pass' ? 25 : 0
  return base + bonus
}

// ---- Timer ----------------------------------------------------------------------------

/** Seconds left on a deadline (ms), never below zero. */
export function secondsLeft(deadline, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

/** The warning mark crossed between two readings of the time left, or null. */
export function crossedWarning(previousLeft, left, marks = WARNINGS) {
  if (previousLeft === null || previousLeft === undefined) return null
  return marks.find((mark) => previousLeft > mark && left <= mark) ?? null
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}

// ---- Custom test cases ---------------------------------------------------------------

/**
 * Parse a value typed for a custom test: JSON, plus Python spellings (None, True, False,
 * single-quoted strings). Throws with a readable message.
 */
export function parseValue(text) {
  const raw = String(text ?? '').trim()
  if (!raw) throw new Error('Enter a value.')
  try {
    return JSON.parse(raw)
  } catch {
    // Try the Python spellings below.
  }
  const converted = raw
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_, body) => JSON.stringify(body.replace(/\\'/g, "'")))
    .replace(/\bNone\b/g, 'null')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/,\s*([\]}])/g, '$1')
  try {
    return JSON.parse(converted)
  } catch {
    throw new Error(`Could not read ${raw.length > 30 ? 'that value' : `"${raw}"`}. Use JSON, like [1, 2] or "text".`)
  }
}

// ---- Offline checklist -----------------------------------------------------------------

const filled = (value, minWords = 1) => wordCount(value) >= minWords

const COMPLEXITY_WORDS = { constant: '1', logarithmic: 'logn', linear: 'n', linearithmic: 'nlogn', quadratic: 'n2', cubic: 'n3', exponential: '2n' }

/** The inside of the first O(...) in a text, with nested parentheses kept. */
function bigOBody(text) {
  const start = text.search(/\bo\s*\(/)
  if (start < 0) return null
  let depth = 0
  let out = ''
  for (let i = text.indexOf('(', start); i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' && depth++ === 0) continue
    if (ch === ')' && --depth === 0) break
    out += ch
  }
  return out
}

/** Normalize a complexity like "O(n log n) for the sort" to "nlogn" for comparison. */
export function normalizeComplexity(text) {
  const t = String(text || '').toLowerCase().trim()
  const body = bigOBody(t)
  if (body === null) {
    const word = Object.keys(COMPLEXITY_WORDS).find((w) => t.startsWith(w))
    if (word) return COMPLEXITY_WORDS[word]
  }
  const core = body ?? t.split(/[,;]| where | for /)[0]
  return core.replace(/\s+/g, '').replace(/[*^]/g, '').replace(/\u00b2/g, '2').replace(/\blg\b/g, 'log')
}

export function sameComplexity(a, b) {
  const x = normalizeComplexity(a)
  return Boolean(x) && x === normalizeComplexity(b)
}

/**
 * Things to check without AI, computed from the notes and results.
 * Each: { id, label, ok, tip }.
 */
export function offlineChecklist({ format, problems = [], notes = {}, answers = [] } = {}) {
  const list = []
  const every = (fn) => problems.length > 0 && problems.every(fn)
  const n = (p) => notes[p.id] || {}
  if (format === 'coding') {
    list.push({ id: 'clarify', label: 'Asked a clarifying question or stated an assumption', ok: every((p) => filled(n(p).questions, 4)), tip: 'Interviewers leave room on purpose. Ask about empty input, duplicates and limits before planning.' })
    list.push({ id: 'example', label: 'Wrote an example of your own with its expected output', ok: every((p) => filled(n(p).example, 2)), tip: 'Your own example catches misunderstandings before they cost you twenty minutes.' })
    list.push({ id: 'plan', label: 'Stated the approach before coding', ok: every((p) => filled(n(p).approach, 8)), tip: 'Say the plan and get a nod first. It is the easiest communication credit there is.' })
    list.push({ id: 'planComplexity', label: 'Gave time and space complexity in the plan', ok: every((p) => filled(n(p).planTime) && filled(n(p).planSpace)), tip: 'Stating complexity up front shows you chose the approach on purpose.' })
    list.push({ id: 'ownCase', label: 'Tried an edge case of your own', ok: every((p) => (p.results?.custom || 0) > 0 || filled(n(p).edgeCases, 3)), tip: 'Empty input, one element, duplicates, negatives: run at least one before submitting.' })
    list.push({ id: 'passed', label: 'All tests passed, hidden ones included', ok: every((p) => p.results?.best?.allPassed), tip: 'Hidden tests usually fail on edge cases. Compare your edge case list with the constraints.' })
    list.push({ id: 'final', label: 'Restated the final complexity at the end', ok: every((p) => filled(n(p).finalTime) && filled(n(p).finalSpace)), tip: 'End by saying what n is and both costs. It is the last thing the interviewer writes down.' })
    const withReference = problems.filter((p) => p.complexity?.time)
    if (withReference.length) {
      list.push({
        id: 'matches',
        label: 'Final time complexity matches the reference',
        ok: withReference.every((p) => sameComplexity(n(p).finalTime, p.complexity.time)),
        tip: `The reference is ${withReference.map((p) => p.complexity.time).join(' and ')}. If yours differs, check whether it is really slower, or explain why.`
      })
    }
    list.push({ id: 'improve', label: 'Named an improvement or trade-off', ok: every((p) => filled(n(p).improve, 4)), tip: 'One sentence on what you would change with more time shows judgment.' })
  } else if (format === 'oa') {
    list.push({ id: 'edges', label: 'Listed the edge cases before coding', ok: every((p) => filled(n(p).edgeList, 3)), tip: 'Read the constraints line by line. Each one hints at a hidden test.' })
    list.push({ id: 'ownCase', label: 'Tried an edge case of your own', ok: every((p) => (p.results?.custom || 0) > 0 || filled(n(p).edgeCases, 3)), tip: 'Use the custom case box to run the inputs the examples do not cover.' })
    list.push({ id: 'submitted', label: 'Submitted every problem', ok: every((p) => (p.results?.submits || 0) > 0), tip: 'An unsubmitted problem scores zero. Submit a brute force early, then improve it.' })
    list.push({ id: 'hidden', label: 'Every hidden test passed', ok: every((p) => p.results?.best && p.results.best.hiddenPassed === p.results.best.hiddenTotal), tip: 'Partial credit counts in most assessments, but full marks on the first problem matter most.' })
  } else if (format === 'behavioral') {
    const checks = answers.map((a) => a.star || starCheck(a.text))
    const all = (fn) => checks.length > 0 && checks.every(fn)
    const share = (fn) => (checks.length ? checks.filter(fn).length / checks.length : 0)
    list.push({ id: 'answered', label: 'Answered every question', ok: all((c) => c.words >= 40), tip: 'Even a short story with a result beats a blank. Keep six to eight stories ready.' })
    list.push({ id: 'situation', label: 'Every answer sets the scene briefly', ok: all((c) => c.situation), tip: 'One or two sentences of context, then move on.' })
    list.push({ id: 'action', label: 'Every answer spends time on what you did', ok: all((c) => c.action), tip: 'Action is the heart of STAR. Start sentences with "I" and say why you chose each step.' })
    list.push({ id: 'result', label: 'Every answer ends with a result', ok: all((c) => c.result), tip: 'Finish with the outcome. A story that just stops loses the point.' })
    list.push({ id: 'number', label: 'At least half the answers include a number', ok: share((c) => c.number) >= 0.5, tip: 'Time saved, users, bugs, a before and after. Numbers make a claim believable.' })
    list.push({ id: 'reflection', label: 'Every answer says what you learned', ok: all((c) => c.reflection), tip: 'Close with the lesson and what you do differently now.' })
    list.push({ id: 'ownership', label: 'More "I" than "we"', ok: all((c) => !c.flags.some((f) => f.id === 'we')), tip: 'Say "we" for the team, "I" for your part. The interviewer is hiring you.' })
    list.push({ id: 'noBlame', label: 'No blaming or badmouthing', ok: all((c) => !c.flags.some((f) => f.id === 'blame')), tip: 'Describe what happened and what you did, not whose fault it was.' })
  }
  return list
}

// ---- Readiness and stats ------------------------------------------------------------------

/** The interviews part of path readiness: the average score of the three most recent mocks. */
export function interviewReadiness(interviews = []) {
  const list = (interviews || []).filter((i) => typeof i?.score === 'number')
  const recent = list.slice(0, 3)
  const value = recent.reduce((sum, i) => sum + Math.max(0, Math.min(100, i.score)) / 100, 0) / 3
  const passed = list.filter((i) => i.passed).length
  return { value, detail: list.length ? `${passed} of ${list.length} passed` : 'none yet' }
}

/** Totals for the Portfolio. bestRubric is the best rubric average (1 to 4) on a coding or behavioral mock. */
export function interviewStats(interviews = []) {
  const list = interviews || []
  const averages = list.filter((i) => i.format !== 'oa').map((i) => rubricAverage(i.rubric, i.format)).filter((a) => a !== null)
  return {
    total: list.length,
    passed: list.filter((i) => i.passed).length,
    bestRubric: averages.length ? Math.max(...averages) : null,
    bestScore: list.length ? Math.max(...list.map((i) => i.score || 0)) : null
  }
}

// ---- AI feedback ------------------------------------------------------------------------

const clip = (text, max) => {
  const t = String(text || '').trim()
  return t.length > max ? `${t.slice(0, max)}...` : t
}

const noDashes = (text) => String(text || '').replace(/\s*\u2014\s*/g, ', ').replace(/\u2013/g, '-')

/** The prompt for written feedback on a finished mock. */
export function feedbackPrompt({ format, problems = [], notes = {}, answers = [], seconds = 0, limit = 0 }) {
  const dims = rubricFor(format)
  const system = `You are an experienced software engineering interviewer giving feedback to a student after a mock ${format === 'behavioral' ? 'behavioral' : format === 'oa' ? 'online assessment' : 'coding'} interview for an internship.
The typed notes are the candidate's thinking out loud. Judge what they show, be specific and kind, and quote short phrases from the notes when useful. Never invent things they did not write.
Score each rubric dimension from 1 to 4: 1 missing, 2 partial, 3 solid, 4 strong.
Reply with only a JSON object with these keys:
{"summary": "2 sentences", "strengths": ["2 or 3 short points"], "improvements": ["2 or 3 short, concrete points"], "rubric": {${dims.map((d) => `"${d.id}": 1-4`).join(', ')}}, "nextStep": "one concrete thing to practice next"}`
  const parts = [`Time used: ${Math.round(seconds / 60)} of ${Math.round(limit / 60)} minutes.`]
  if (format === 'behavioral') {
    answers.forEach((a, i) => {
      parts.push(`Question ${i + 1}: ${a.question}\nAnswer (${wordCount(a.text)} words):\n${clip(a.text, 2500) || '(no answer)'}`)
    })
  } else {
    problems.forEach((p, i) => {
      const note = notes[p.id] || {}
      const best = p.results?.best
      const fields = stepsFor(format).flatMap((s) => s.fields).filter((f) => filled(note[f.id])).map((f) => `${f.label}: ${clip(note[f.id], 800)}`)
      parts.push([
        `Problem ${i + 1}: ${p.title} (${p.difficulty})`,
        clip(p.prompt, 1200),
        p.complexity?.time ? `Reference complexity: time ${p.complexity.time}, space ${p.complexity.space || 'n/a'}.` : '',
        `Tests: ${best ? `${best.passed} of ${best.total} passed, hidden ${best.hiddenPassed} of ${best.hiddenTotal}` : 'never submitted'}.`,
        fields.length ? `Notes:\n${fields.join('\n')}` : 'Notes: none written.',
        p.code ? `Final code (${p.language || 'javascript'}):\n${clip(p.code, 4000)}` : 'No code saved.'
      ].filter(Boolean).join('\n'))
    })
  }
  return { system, user: parts.join('\n\n') }
}

/** Normalize a parsed AI reply: strings trimmed, scores clamped to 1..4, no dashes. */
export function parseFeedback(parsed, format) {
  const list = (value) => (Array.isArray(value) ? value : value ? [value] : []).map((s) => noDashes(String(s).trim())).filter(Boolean).slice(0, 4)
  const rubric = {}
  for (const d of rubricFor(format)) {
    const n = Math.round(Number(parsed?.rubric?.[d.id]))
    if (n >= 1 && n <= 4) rubric[d.id] = n
  }
  return {
    summary: noDashes(String(parsed?.summary || '').trim()),
    strengths: list(parsed?.strengths),
    improvements: list(parsed?.improvements),
    rubric,
    nextStep: noDashes(String(parsed?.nextStep || '').trim())
  }
}

export async function interviewFeedback(config, session, { signal } = {}) {
  const { system, user } = feedbackPrompt(session)
  const reply = await callAI(config, system, user, { maxTokens: 1500, signal })
  return parseFeedback(extractJSON(reply), session.format)
}

// ---- Sessions -----------------------------------------------------------------------------

/** Drafts written during a mock interview are kept apart from the learner's practice drafts. */
export const DRAFT_SCOPE = 'mock_'
const ACTIVE_KEY = 'recurse_interview_active'
const LANGUAGE_KEY = 'recurse_code_language'

/** A new interview in progress. Problems and questions are stored by id with a few labels. */
export function createSession({ id, format, shape = 'medium', pattern = 'surprise', problems = [], questions = [], now = Date.now() }) {
  const f = getFormat(format)
  return {
    id,
    format,
    shape,
    pattern,
    startedAt: now,
    limit: f?.kind === 'behavioral' ? questions.length * QUESTION_SECONDS : (f?.minutes || 45) * 60,
    phase: 'run',
    current: 0,
    problems: problems.map((p) => ({ id: p.id, title: p.title, difficulty: p.difficulty, set: p.set || null, topic: p.topic || null })),
    questions: questions.map((q) => ({ id: q.id })),
    steps: {},
    notes: {},
    results: {},
    code: {},
    // The first answer's clock starts now; each later one starts when the learner moves on.
    answers: questions.length ? { [questions[0].id]: { text: '', startedAt: now } } : {},
    rubric: {},
    feedback: null,
    endedAt: null
  }
}

/** Seconds actually spent: wall time up to the end, capped at the limit; behavioral sums the answers. */
export function timeUsed(session, now = Date.now()) {
  if (!session) return 0
  if (session.format === 'behavioral') {
    return Object.values(session.answers || {}).reduce((sum, a) => sum + Math.min(QUESTION_SECONDS, Math.max(0, a?.seconds || 0)), 0)
  }
  const end = session.endedAt || now
  return Math.max(0, Math.min(session.limit, Math.round((end - session.startedAt) / 1000)))
}

function store() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The interview in progress, or null. Survives reloads and leaving the page. */
export function loadActive() {
  try {
    const value = JSON.parse(store()?.getItem(ACTIVE_KEY) || 'null')
    return value && typeof value === 'object' && value.id && getFormat(value.format) ? value : null
  } catch {
    return null
  }
}

export function saveActive(session) {
  try {
    if (session) store()?.setItem(ACTIVE_KEY, JSON.stringify(session))
    else store()?.removeItem(ACTIVE_KEY)
  } catch {
    // Storage full or blocked: the interview just will not survive a reload.
  }
}

const draftStorageKey = (id, language) => `recurse_code_${DRAFT_SCOPE}${id}_${language}`

/** The code written for a problem during the mock, in the language last used. */
export function readMockDraft(id, preferred) {
  try {
    const s = store()
    const order = [preferred, s?.getItem(LANGUAGE_KEY), 'javascript', 'python'].filter(Boolean)
    for (const language of [...new Set(order)]) {
      const code = s?.getItem(draftStorageKey(id, language))
      if (code) return { code, language }
    }
  } catch {
    // Nothing saved.
  }
  return null
}

/** Start every mock from the starter code. */
export function clearMockDrafts(ids = []) {
  try {
    for (const id of ids) for (const language of ['javascript', 'python']) store()?.removeItem(draftStorageKey(id, language))
  } catch {
    // Nothing to clear.
  }
}
