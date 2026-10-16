// @vitest-environment jsdom
// Every visual in every built-in pack, in lessons and question exhibits, draws without failing.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import Visual from './Visual'
import { visualList } from '../../lib/visuals'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const packs = Object.values(import.meta.glob('../../data/packs/*.json', { eager: true, import: 'default' }))

describe('pack visuals', () => {
  for (const pack of packs) {
    const specs = [
      ...(pack.lesson?.sections || []).flatMap((s, i) => visualList(s).map((spec) => [`section ${i + 1}`, spec])),
      ...pack.questions.flatMap((q) => visualList(q).map((spec) => [q.id, spec]))
    ]
    if (!specs.length) continue
    it(`${pack.id}: ${specs.length} visuals draw`, () => {
      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      const failed = []
      for (const [where, spec] of specs) {
        act(() => root.render(<Visual spec={spec} />))
        if (host.querySelector('.visual-failed, .visual-pending') || !host.querySelector('figure.visual')) failed.push(`${where} (${spec.type})`)
      }
      act(() => root.unmount())
      host.remove()
      expect(failed).toEqual([])
    })
  }
})
