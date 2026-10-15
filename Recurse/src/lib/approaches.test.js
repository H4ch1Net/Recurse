import { describe, expect, it } from 'vitest'
import { QUIZ, MODES, assignMethods, experimentCorrect, experimentScores, modeFromExperiment, rankModes, scoreQuiz, EXPERIMENT_WORDS } from './approaches'
import { createRandom } from './random'

describe('approach quiz', () => {
  it('only awards points to known modes', () => {
    const ids = new Set(MODES.map((m) => m.id))
    for (const q of QUIZ) for (const a of q.a) for (const mode of Object.keys(a.score)) expect(ids.has(mode)).toBe(true)
  })
  it('scores answers and ranks the winner first', () => {
    const totals = scoreQuiz(QUIZ.map(() => 0))
    expect(totals.builder).toBeGreaterThan(0)
    const ranked = rankModes({ builder: 5, visual: 5, challenger: 1, explainer: 0, balanced: 5 })
    expect(ranked[0].id).toBe('balanced')
  })
})

describe('recall experiment', () => {
  it('splits the words into three groups of six without overlap', () => {
    const groups = assignMethods(createRandom(3))
    const all = Object.values(groups).flat()
    expect(Object.keys(groups)).toEqual(['reread', 'test', 'picture'])
    expect(all).toHaveLength(18)
    expect(new Set(all).size).toBe(18)
    expect(new Set(all)).toEqual(new Set(EXPERIMENT_WORDS.map((w) => w.word)))
  })
  it('checks answers leniently and scores per method', () => {
    expect(experimentCorrect('zorvel', ' The Fish ')).toBe(true)
    expect(experimentCorrect('zorvel', 'fishes')).toBe(false)
    const groups = { reread: ['zorvel', 'tamquo'], test: ['brisna', 'olumet'], picture: ['kevrid', 'paslin'] }
    const scores = experimentScores(groups, { zorvel: 'fish', brisna: 'mountain', olumet: 'sun', kevrid: 'moon' })
    expect(scores).toEqual({ reread: 0.5, test: 1, picture: 0.5 })
    expect(modeFromExperiment(scores)).toBe('challenger')
    expect(modeFromExperiment({ reread: 0.5, test: 0.5, picture: 0.2 })).toBeNull()
  })
})
