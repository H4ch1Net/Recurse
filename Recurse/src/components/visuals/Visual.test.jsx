// @vitest-environment jsdom
// Every fixture draws without throwing, shows its title and caption, and never uses an em dash.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import Visual from './Visual'
import { VISUAL_FIXTURES } from './fixtures'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root
let host
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
})

function draw(spec) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<Visual spec={spec} />))
  return host
}

describe('Visual', () => {
  for (const f of VISUAL_FIXTURES) {
    it(`draws ${f.name}`, () => {
      const el = draw(f.spec)
      expect(el.querySelector('.visual-failed')).toBeNull()
      expect(el.querySelector('.visual-pending')).toBeNull()
      if (f.spec.title) expect(el.textContent).toContain(f.spec.title.replace(/`|\*\*/g, ''))
      expect(el.textContent).not.toContain('\u2014')
    })
  }
  it('draws nothing for an unknown type', () => {
    expect(draw({ type: 'pie' }).innerHTML).toBe('')
  })
})
