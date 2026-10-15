// @vitest-environment jsdom
// Render smoke tests for the developer tool widgets (git-sim, terminal, regex-tester,
// http-explorer, json-explorer): each mounts, responds to typing and clicks, grades its
// checklist and never shows an em dash. Simulator logic is tested in the per-type tests.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GitSim from '../widgets/git-sim.jsx'
import Terminal from '../widgets/terminal.jsx'
import RegexTester from '../widgets/regex-tester.jsx'
import HttpExplorer from '../widgets/http-explorer.jsx'
import JsonExplorer from '../widgets/json-explorer.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.matchMedia = (query) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })

let root = null
let host = null

async function mount(Widget, props = {}, extra = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const onComplete = vi.fn()
  await act(async () => root.render(<Widget props={props} onComplete={onComplete} {...extra} />))
  return onComplete
}

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  root = null
})

const buttons = (text) => [...host.querySelectorAll('button')].filter((b) => b.textContent.trim().startsWith(text))
const click = async (el) => act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const noEmDash = () => expect(host.textContent).not.toMatch(/—/)
const settle = (ms = 30) => act(() => new Promise((r) => setTimeout(r, ms)))

function setValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
}
const key = (el, k, opts = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }))

/** Type a command into a console input and press Enter. */
async function type(line) {
  const input = host.querySelector('.terminal-input')
  await act(async () => setValue(input, line))
  await act(async () => key(input, 'Enter'))
}
const screen = () => host.querySelector('.terminal-screen').textContent
const doneTasks = () => host.querySelectorAll('.w-task.done').length

describe('terminal widget', () => {
  it('runs commands, completes paths and grades tasks', async () => {
    await mount(Terminal, { scenario: 'navigation' })
    noEmDash()
    await type('pwd')
    expect(screen()).toContain('/home/learner')
    expect(doneTasks()).toBe(1)
    const input = host.querySelector('.terminal-input')
    await act(async () => setValue(input, 'cd proj'))
    await act(async () => key(input, 'Tab'))
    expect(input.value).toBe('cd projects/')
    await act(async () => key(input, 'ArrowUp'))
    expect(input.value).toBe('pwd')
    await type('cat nope')
    expect(screen()).toContain('cat: nope: No such file or directory')
    expect(host.querySelector('.w-feedback').textContent).toMatch(/path does not exist/)
    await type('clear')
    expect(screen()).not.toContain('No such file')
  })
  it('completes the permissions scenario', async () => {
    const onComplete = await mount(Terminal, { scenario: 'permissions' })
    for (const line of ['ls -l scripts', './scripts/deploy.sh', 'chmod u+x scripts/deploy.sh', './scripts/deploy.sh', 'chmod 600 scripts/secret.txt']) await type(line)
    await settle(1000)
    expect(doneTasks()).toBe(5)
    expect(onComplete).toHaveBeenCalledTimes(1)
    noEmDash()
  })
  it('offers a scenario picker when standalone', async () => {
    await mount(Terminal, {}, { standalone: true })
    await click(buttons('Pipes and filters')[0])
    expect(host.textContent).toContain('first 5 lines')
  })
})

describe('git-sim widget', () => {
  it('builds history from typed commands and buttons', async () => {
    await mount(GitSim, { scenario: 'basics' })
    noEmDash()
    expect(host.textContent).toContain('No repository yet')
    await type('git init')
    expect(screen()).toContain('Initialized empty Git repository')
    await type('git status')
    await click(host.querySelector('[aria-label="Stage README.md"]'))
    expect(screen()).toContain('git add README.md')
    await type('git commit -m "First"')
    expect(host.querySelectorAll('.gitsim-node')).toHaveLength(1)
    expect(host.querySelector('.gitsim-label.head')).toBeTruthy()
    await click(host.querySelector('[aria-label="Edit README.md"]'))
    expect(host.querySelector('.gitsim-badge.modified')).toBeTruthy()
    const input = host.querySelector('.terminal-input')
    await act(async () => setValue(input, 'git com'))
    await act(async () => key(input, 'Tab'))
    expect(input.value).toBe('git commit ')
    expect(doneTasks()).toBe(4)
    noEmDash()
  })
  it('walks through a merge conflict with the resolve buttons', async () => {
    const onComplete = await mount(GitSim, { scenario: 'merge-conflict' })
    await type('git merge spanish')
    expect(screen()).toContain('CONFLICT (content): Merge conflict in greeting.txt')
    expect(host.querySelector('.gitsim-badge.conflict')).toBeTruthy()
    await type('git status')
    await click(buttons('Keep spanish')[0])
    await click(buttons('Mark resolved')[0])
    await type('git commit')
    await settle(1000)
    expect(host.querySelector('.gitsim-merge-core')).toBeTruthy()
    expect(doneTasks()).toBe(5)
    expect(onComplete).toHaveBeenCalledTimes(1)
    noEmDash()
  })
  it('shows faded commits after a rebase', async () => {
    await mount(GitSim, { scenario: 'rebase' })
    await type('git rebase main')
    expect(host.querySelectorAll('.gitsim-node.ghost').length).toBe(2)
    expect(host.textContent).toContain('Faded commits are on no branch')
  })
})

describe('regex-tester widget', () => {
  it('solves a puzzle live and moves on', async () => {
    const onComplete = await mount(RegexTester, { puzzles: [{ prompt: 'Digits', match: ['a1'], noMatch: ['b'] }, { prompt: 'Only b', match: ['b'], noMatch: ['a'] }] })
    noEmDash()
    const input = host.querySelector('.regex-input')
    await act(async () => setValue(input, '\\d'))
    await settle(200)
    expect(host.querySelectorAll('.regex-case.ok')).toHaveLength(2)
    expect(host.querySelector('.regex-dot.solved')).toBeTruthy()
    await click(buttons('Next puzzle')[0])
    await act(async () => setValue(host.querySelector('.regex-input'), '('))
    expect(host.textContent).toContain('Not a valid pattern yet')
    await act(async () => setValue(host.querySelector('.regex-input'), 'b'))
    await settle(200)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
  it('highlights matches and groups in the playground', async () => {
    await mount(RegexTester, {})
    await click(buttons('Playground')[0])
    await settle(250)
    expect(host.textContent).toMatch(/2 matches/)
    expect(host.querySelectorAll('.regex-preview mark').length).toBe(2)
    expect(host.textContent).toContain('group 1')
    noEmDash()
  })
})

describe('http-explorer widget', () => {
  it('sends requests and shows the raw exchange', async () => {
    await mount(HttpExplorer, { scenario: 'rest-basics' })
    noEmDash()
    await click(buttons('Send')[0])
    await settle(150)
    expect(host.querySelector('.http-pre').textContent).toMatch(/^GET \/api\/tasks HTTP\/1\.1\nHost: api\.example\.test/)
    expect(host.querySelector('.http-status').textContent).toContain('200')
    expect(doneTasks()).toBe(1)
    await click(buttons('POST')[0])
    await click(buttons('Send')[0])
    await settle(150)
    expect(host.querySelector('.http-status').textContent).toContain('201')
    expect(host.textContent).toContain('Your new task has id 4')
    expect(host.querySelectorAll('.http-history-item')).toHaveLength(2)
    noEmDash()
  })
  it('reports invalid JSON in the body editor and a 415 without Content-Type', async () => {
    await mount(HttpExplorer, { scenario: 'errors' })
    await act(async () => setValue(host.querySelector('.http-method'), 'POST'))
    await act(async () => setValue(host.querySelector('.http-bodytext'), '{"title": }'))
    expect(host.textContent).toMatch(/Line 1, column 11/)
    await click(buttons('Send')[0])
    await settle(150)
    expect(host.querySelector('.http-status').textContent).toContain('415')
    expect(doneTasks()).toBe(1)
  })
})

describe('json-explorer widget', () => {
  it('shows paths, parse errors and runs the quiz', async () => {
    const onComplete = await mount(JsonExplorer, {})
    noEmDash()
    const row = [...host.querySelectorAll('.json-row')].find((r) => r.textContent.startsWith('hostname'))
    await click(row)
    expect(host.querySelector('.json-path').textContent).toBe('response.device.hostname')
    expect(host.textContent).toContain('data["device"]["hostname"]')
    await act(async () => setValue(host.querySelector('.json-text'), '{"a": 1,}'))
    expect(host.textContent).toMatch(/Line 1, column 9: Trailing commas/)
    await click(buttons('Sample')[0])
    await click(buttons('Quiz')[0])
    const answer = host.querySelector('.json-answer input')
    await act(async () => setValue(answer, '192.168.10.1'))
    await click(buttons('Check')[0])
    expect(host.textContent).toContain('Correct.')
    await click(buttons('Next question')[0])
    // Click question: the second interface's name.
    const toggles = [...host.querySelectorAll('.json-row')].filter((r) => r.querySelector('.json-index')?.textContent === '1')
    await click(toggles[0].querySelector('.json-toggle'))
    const nameRow = [...host.querySelectorAll('.json-row')].find((r) => r.textContent.includes('"GigabitEthernet0/0/1"'))
    await click(nameRow)
    expect(host.textContent).toContain('Correct.')
    await click(buttons('Next question')[0])
    await click(buttons('null')[0])
    await click(buttons('Next question')[0])
    await click(buttons('response.hostname')[0])
    expect(host.textContent).toContain('Not quite')
    await click(buttons('Next question')[0])
    await act(async () => setValue(host.querySelector('.json-answer input'), '30'))
    await click(buttons('Check')[0])
    await click(buttons('See my score')[0])
    expect(host.querySelector('.json-score').textContent).toBe('4 / 5')
    expect(onComplete).toHaveBeenCalledWith({ score: 0.8, detail: '4 of 5 correct' })
    noEmDash()
  })
})
