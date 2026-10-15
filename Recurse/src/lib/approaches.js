// Learning approaches: how a learner prefers to move through a topic. Every approach keeps
// the parts research supports for everyone (retrieval practice, spacing, interleaving,
// feedback); they differ in what comes first and what gets emphasis. The quiz finds the
// approach someone will enjoy and stick with; the experiment measures what actually
// helped them recall more.

export const STRATEGIES = [
  {
    id: 'retrieval',
    title: 'Retrieval practice',
    evidence: 'high',
    summary: 'Pulling an answer out of memory strengthens it far more than reading it again. Even failed attempts help when feedback follows.',
    inRecurse: 'Every card, lesson check, pop quiz and exam is a retrieval attempt.',
    source: 'Roediger and Karpicke (2006), Psychological Science; Dunlosky et al. (2013) rated practice testing "high utility".'
  },
  {
    id: 'spacing',
    title: 'Spaced practice',
    evidence: 'high',
    summary: 'Reviews spread over days beat the same time crammed into one sitting, and the gap should grow as memory gets stronger.',
    inRecurse: 'FSRS schedules each card, lab and challenge right before you are likely to forget it.',
    source: 'Cepeda et al. (2006) meta-analysis, Psychological Bulletin; Dunlosky et al. (2013) rated distributed practice "high utility".'
  },
  {
    id: 'interleaving',
    title: 'Interleaving',
    evidence: 'moderate',
    summary: 'Mixing topics in one session feels harder than blocking them, but it teaches you to choose the right method, which is what exams and jobs demand.',
    inRecurse: 'Daily review, pop quizzes and recall roulette mix cards across topics.',
    source: 'Rohrer and Taylor (2007), Instructional Science; Brunmair and Richter (2019) meta-analysis, Psychological Bulletin.'
  },
  {
    id: 'pretesting',
    title: 'Pretesting and productive failure',
    evidence: 'moderate',
    summary: 'Trying a question or problem before you are taught it, and getting it wrong, makes the later explanation stick better.',
    inRecurse: 'Test-first mode asks a question before each lesson section; hands-on mode starts with the lab.',
    source: 'Kornell, Hays and Bjork (2009), JEP: Learning, Memory, and Cognition; Sinha and Kapur (2021) meta-analysis, Review of Educational Research.'
  },
  {
    id: 'self-explanation',
    title: 'Self-explanation and teaching',
    evidence: 'moderate',
    summary: 'Explaining why something works, to yourself or to an imagined learner, exposes gaps and links new ideas to what you already know.',
    inRecurse: 'The Feynman screen, and "say it in your words" prompts in teach-it-back mode.',
    source: 'Chi et al. (1994), Cognitive Science; Fiorella and Mayer (2013), Contemporary Educational Psychology.'
  },
  {
    id: 'dual-coding',
    title: 'Words plus visuals',
    evidence: 'moderate',
    summary: 'Words paired with a relevant diagram or animation are remembered better than words alone. Decorative pictures do not count.',
    inRecurse: 'Interactive visualizations, simulators and diagrams inside lessons.',
    source: 'Mayer (2009), Multimedia Learning; Paivio (1986), dual coding theory.'
  },
  {
    id: 'worked-examples',
    title: 'Worked examples, then practice',
    evidence: 'moderate',
    summary: 'Beginners learn faster from studying a fully worked solution, then solving similar problems with less and less help.',
    inRecurse: 'Lessons trace examples step by step; labs and challenges give hints in stages.',
    source: 'Sweller and Cooper (1985); Renkl (2014), Cognitive Science.'
  },
  {
    id: 'learning-styles',
    title: 'What does not hold up: matching your "style"',
    evidence: 'myth',
    summary: 'Labeling yourself a visual, auditory or kinesthetic learner and studying only that way does not improve results in controlled studies. Preferences are real, and they matter for motivation, but the best method usually depends on the material.',
    inRecurse: 'So Recurse measures what works for you instead of assigning a label.',
    source: 'Pashler et al. (2008), Psychological Science in the Public Interest.'
  }
]

export const MODES = [
  {
    id: 'balanced',
    label: 'Balanced',
    tagline: 'Read, try, recall, explain.',
    icon: 'scale',
    description: 'Lessons in the order they were written, with activities where they fit, a check after each section and the occasional pop quiz. A solid default for anything.',
    changes: ['Lessons as written, checks after each section', 'Pop quizzes now and then', 'Explain-it prompt at the end of a lesson'],
    research: ['retrieval', 'spacing', 'interleaving'],
    preset: { popQuiz: 'sometimes' }
  },
  {
    id: 'builder',
    label: 'Hands-on first',
    tagline: 'Try it, break it, then read why.',
    icon: 'hammer',
    description: 'Each lesson section opens with its lab, simulator or coding problem. You struggle a little first, then the explanation lands on a mind that knows what it is missing.',
    changes: ['Activities and labs come before the reading', 'Topic pages lead with labs and challenges', 'Labs and challenges come back for redo on a schedule'],
    research: ['pretesting', 'worked-examples', 'retrieval'],
    preset: { popQuiz: 'sometimes' }
  },
  {
    id: 'visual',
    label: 'See it first',
    tagline: 'Watch it work, then name it.',
    icon: 'eye',
    description: 'Diagrams, code and interactive visualizations lead each section, and the text explains what you just saw. Best for processes and structures: algorithms, packets, protocols.',
    changes: ['Visuals, diagrams and simulations open each section', 'Text follows as narration', 'Key terms shown as a visual glossary'],
    research: ['dual-coding', 'worked-examples', 'retrieval'],
    preset: { popQuiz: 'sometimes' }
  },
  {
    id: 'challenger',
    label: 'Test me first',
    tagline: 'Guess, check, repeat.',
    icon: 'zap',
    description: 'A question before each section, more pop quizzes from older topics, and timed quizzes. The most effortful mode and, for most people, the one that remembers the most.',
    changes: ['A pretest question opens each lesson section', 'Pop quizzes in every session', 'Quizzes and exams suggested more often'],
    research: ['pretesting', 'retrieval', 'interleaving'],
    preset: { popQuiz: 'often' }
  },
  {
    id: 'explainer',
    label: 'Teach it back',
    tagline: 'If you can explain it, you know it.',
    icon: 'message',
    description: 'After each section you put the idea in your own words in a sentence or two, and every lesson ends with a full Feynman explanation with feedback.',
    changes: ['A short "say it in your words" prompt after each section', 'Feynman explanation is the main next step', 'Key terms open in self-quiz mode'],
    research: ['self-explanation', 'retrieval', 'spacing'],
    preset: { popQuiz: 'sometimes' }
  }
]

export const MODE_MAP = Object.fromEntries(MODES.map((m) => [m.id, m]))

export function modeOf(settings) {
  return MODE_MAP[settings?.learningMode] || MODE_MAP.balanced
}

// ---- The preference quiz ---------------------------------------------------------
// Each answer adds points to modes. It asks about habits and what keeps you going,
// not about senses, so the result is a starting point for how you like to study.

export const QUIZ = [
  {
    q: 'You open a brand-new tool or app. What do you do first?',
    a: [
      { text: 'Start clicking around and see what happens', score: { builder: 3 } },
      { text: 'Look for a diagram or a quick demo of how it works', score: { visual: 3 } },
      { text: 'Read the getting-started guide from the top', score: { balanced: 2, explainer: 1 } },
      { text: 'Give myself a small task and see if I can do it', score: { challenger: 2, builder: 1 } }
    ]
  },
  {
    q: 'A friend asks you to explain something you learned last week. How does that feel?',
    a: [
      { text: 'Great, explaining is how I find out what I really know', score: { explainer: 3 } },
      { text: 'Fine if I can draw it for them', score: { visual: 2, explainer: 1 } },
      { text: 'Easier to just show them', score: { builder: 2 } },
      { text: 'I would want to quiz myself first', score: { challenger: 2 } }
    ]
  },
  {
    q: 'Which study session sounds most satisfying?',
    a: [
      { text: 'Beating my best score on a timed quiz', score: { challenger: 3 } },
      { text: 'Getting a lab or program working after a struggle', score: { builder: 3 } },
      { text: 'Watching an animation finally make a concept click', score: { visual: 3 } },
      { text: 'Writing a clear summary that ties it all together', score: { explainer: 3 } }
    ]
  },
  {
    q: 'You are stuck on a hard problem. What helps most?',
    a: [
      { text: 'Seeing a worked example, step by step', score: { visual: 1, balanced: 2 } },
      { text: 'Talking it through, even to a rubber duck', score: { explainer: 3 } },
      { text: 'Trying three different approaches until one works', score: { builder: 3 } },
      { text: 'A hint, then trying again', score: { challenger: 2, balanced: 1 } }
    ]
  },
  {
    q: 'How do you feel about getting questions wrong while learning?',
    a: [
      { text: 'Good: I would rather find the gaps early', score: { challenger: 3 } },
      { text: 'Fine, as long as I see why right away', score: { balanced: 2, visual: 1 } },
      { text: 'I prefer to learn it properly first, then test', score: { balanced: 2, explainer: 1 } },
      { text: 'I learn more from things breaking than from questions', score: { builder: 3 } }
    ]
  },
  {
    q: 'What usually makes you quit a course or tutorial?',
    a: [
      { text: 'Too much reading before doing anything', score: { builder: 3 } },
      { text: 'Walls of text with no pictures or examples', score: { visual: 3 } },
      { text: 'Not knowing whether I actually understood it', score: { challenger: 2, explainer: 1 } },
      { text: 'Rushing through without connecting the ideas', score: { explainer: 2, balanced: 1 } }
    ]
  },
  {
    q: 'Pick the note you would rather have from a lesson.',
    a: [
      { text: 'A labeled diagram', score: { visual: 3 } },
      { text: 'A list of questions to test myself', score: { challenger: 3 } },
      { text: 'A working code snippet or config I can reuse', score: { builder: 3 } },
      { text: 'A paragraph in my own words', score: { explainer: 3 } }
    ]
  },
  {
    q: 'How much time can you usually give a study session?',
    a: [
      { text: '10 minutes here and there', score: { challenger: 2, balanced: 1 } },
      { text: 'About half an hour', score: { balanced: 2 } },
      { text: 'An hour or more to get deep into something', score: { builder: 2, explainer: 1 } },
      { text: 'It varies a lot', score: { balanced: 2 } }
    ]
  }
]

/** Total points per mode for a list of chosen answer indexes. */
export function scoreQuiz(answers) {
  const totals = Object.fromEntries(MODES.map((m) => [m.id, 0]))
  answers.forEach((choice, i) => {
    const answer = QUIZ[i]?.a[choice]
    if (!answer) return
    for (const [mode, points] of Object.entries(answer.score)) totals[mode] += points
  })
  return totals
}

/** Modes ordered by score, ties broken toward balanced (the safe default). */
export function rankModes(totals) {
  return MODES.map((m) => ({ ...m, score: totals[m.id] || 0 }))
    .sort((a, b) => b.score - a.score || (a.id === 'balanced' ? -1 : b.id === 'balanced' ? 1 : 0))
}

// ---- The recall experiment ------------------------------------------------------
// Eighteen invented words from a made-up language, so nobody starts with an advantage.
// Each learner gets a random split into three methods of six words, studies them, does
// a short distraction task, then is tested on all eighteen. An optional second test a
// day later shows what lasted.

export const EXPERIMENT_WORDS = [
  { word: 'zorvel', meaning: 'fish', icon: 'Fish' },
  { word: 'tamquo', meaning: 'tree', icon: 'TreePine' },
  { word: 'brisna', meaning: 'mountain', icon: 'Mountain' },
  { word: 'olumet', meaning: 'sun', icon: 'Sun' },
  { word: 'kevrid', meaning: 'moon', icon: 'Moon' },
  { word: 'paslin', meaning: 'key', icon: 'Key' },
  { word: 'drunok', meaning: 'book', icon: 'BookOpen' },
  { word: 'velasq', meaning: 'ship', icon: 'Ship' },
  { word: 'mirgot', meaning: 'house', icon: 'House' },
  { word: 'fenzar', meaning: 'fire', icon: 'Flame' },
  { word: 'quelim', meaning: 'cloud', icon: 'Cloud' },
  { word: 'astrop', meaning: 'apple', icon: 'Apple' },
  { word: 'nubrel', meaning: 'bird', icon: 'Bird' },
  { word: 'hostiv', meaning: 'bell', icon: 'Bell' },
  { word: 'grenda', meaning: 'anchor', icon: 'Anchor' },
  { word: 'lupset', meaning: 'leaf', icon: 'Leaf' },
  { word: 'cravon', meaning: 'umbrella', icon: 'Umbrella' },
  { word: 'jisket', meaning: 'crown', icon: 'Crown' }
]

export const METHODS = [
  { id: 'reread', label: 'Reread', blurb: 'Study each word twice, like rereading your notes.' },
  { id: 'test', label: 'Self-test', blurb: 'Study each word once, then quiz yourself with feedback.' },
  { id: 'picture', label: 'Picture it', blurb: 'Study each word once with a picture, and imagine a scene that links them.' }
]

/** Randomly split the words into three groups of six, one per method. */
export function assignMethods(random = Math.random) {
  const words = [...EXPERIMENT_WORDS]
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[words[i], words[j]] = [words[j], words[i]]
  }
  return Object.fromEntries(METHODS.map((m, i) => [m.id, words.slice(i * 6, i * 6 + 6).map((w) => w.word)]))
}

export function meaningOf(word) {
  return EXPERIMENT_WORDS.find((w) => w.word === word)?.meaning
}

/** Lenient check: case, spaces and a leading article do not matter. */
export function experimentCorrect(word, answer) {
  const clean = (s) => String(s ?? '').trim().toLowerCase().replace(/^(a|an|the)\s+/, '').replace(/[^a-z]/g, '')
  return clean(answer) === clean(meaningOf(word))
}

/** Recall score per method (0..1) for a test: answers maps word -> typed meaning. */
export function experimentScores(groups, answers) {
  return Object.fromEntries(
    Object.entries(groups).map(([method, words]) => [method, words.filter((w) => experimentCorrect(w, answers[w])).length / words.length])
  )
}

/** Which approach the measured results point to. */
export function modeFromExperiment(scores) {
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])
  if (!best.length || best[0][1] === best[1]?.[1]) return null
  return { test: 'challenger', picture: 'visual', reread: 'balanced' }[best[0][0]]
}
