// @vitest-environment jsdom
// Render smoke tests for the networking widgets: each one mounts, responds to its
// main controls, and never shows an em dash. Logic is tested in the per-type tests.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SubnetDrill from '../widgets/subnet-drill.jsx'
import PacketJourney from '../widgets/packet-journey.jsx'
import MacLearning from '../widgets/mac-learning.jsx'
import OsiLayers from '../widgets/osi-layers.jsx'
import TcpHandshake from '../widgets/tcp-handshake.jsx'
import StpElection from '../widgets/stp-election.jsx'
import VlanTrunk from '../widgets/vlan-trunk.jsx'
import { OSI_CARDS } from './osi-layers'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
// Pretend the learner prefers reduced motion: animations shrink to a blink, which
// keeps these tests fast and exercises the reduced-motion path.
window.matchMedia = (query) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })

let root = null
let host = null

async function mount(Widget, props = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const onComplete = vi.fn()
  await act(async () => root.render(<Widget props={props} onComplete={onComplete} />))
  return onComplete
}

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  root = null
})

const buttons = (text) => [...host.querySelectorAll('button')].filter((b) => b.textContent.trim().startsWith(text))
const click = async (el) => act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const noEmDash = () => expect(host.textContent).not.toMatch(/\u2014/)

/** Wait for rAF-driven animations to finish. */
const settle = (ms = 50) => act(() => new Promise((r) => setTimeout(r, ms)))

function setInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('network widgets render', () => {
  it('subnet-drill: drill checks typed answers and the calculator responds', async () => {
    await mount(SubnetDrill, { difficulty: 'easy' })
    noEmDash()
    const inputs = host.querySelectorAll('.subnet-fields input')
    expect(inputs.length).toBe(5)
    await act(async () => setInput(inputs[0], '1.2.3.4'))
    await click(buttons('Check')[0])
    expect(host.textContent).toMatch(/Worked solution/)
    await click(buttons('Calculator')[0])
    const calc = host.querySelectorAll('.subnet-calc input')
    await act(async () => setInput(calc[1], '/19'))
    expect(host.textContent).toContain('255.255.224.0')
    noEmDash()
  })

  it('mac-learning: a prediction sends a frame and the switch learns', async () => {
    await mount(MacLearning)
    await click(buttons('Flood')[0])
    await settle(600)
    expect(host.querySelector('.mac-table tbody').textContent).toContain('00aa.aaaa.aaaa')
    noEmDash()
  })

  it('osi-layers: click a card, click a layer, check', async () => {
    const done = await mount(OsiLayers)
    for (const card of OSI_CARDS) {
      const el = [...host.querySelectorAll('.osi-card')].find((b) => b.querySelector('.osi-card-label').textContent === card.label)
      await click(el)
      await click(host.querySelectorAll('.osi-layer')[7 - card.layer])
    }
    await click(buttons('Check')[0])
    expect(done).toHaveBeenCalledTimes(1)
    expect(done.mock.calls[0][0].score).toBe(1)
    noEmDash()
  })

  it('tcp-handshake: steps and asks a question', async () => {
    await mount(TcpHandshake)
    await click(buttons('Step')[0])
    await settle(400)
    await click(buttons('Step')[0])
    await settle(100)
    expect(host.querySelector('.tcp-question')).not.toBeNull()
    noEmDash()
  })

  it('stp-election: predicts and converges', async () => {
    const done = await mount(StpElection)
    const pills = (label) => [...host.querySelectorAll(`[aria-label="${label}"] button`)]
    await click(pills('Predicted root bridge').find((b) => b.textContent === 'SW3'))
    const selects = [...host.querySelectorAll('.stp-panel select')]
    const choose = async (select, value) => act(async () => {
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await choose(selects[0], 'SW1:Gi0/2')
    await choose(selects[1], 'SW2:Gi0/2')
    await choose(selects[2], 'SW4:Gi0/2')
    await choose(selects[3], 'SW2:Gi0/1')
    await click(buttons('Converge')[0])
    await settle(1000)
    expect(host.textContent).toContain('Why the tree came out this way')
    expect(done).toHaveBeenCalled()
    noEmDash()
  }, 10000)

  it('vlan-trunk: pings and explains a failure', async () => {
    await mount(VlanTrunk)
    expect(host.textContent).toContain('show vlan brief')
    const access = [...host.querySelectorAll('.vlan-panel select')]
    await act(async () => {
      access[0].value = '10'
      access[0].dispatchEvent(new Event('change', { bubbles: true }))
    })
    await click(buttons('Ping')[0])
    await settle(800)
    expect(host.querySelector('.vlan-result')).not.toBeNull()
    noEmDash()
  }, 10000)

  it('packet-journey: steps to the first checkpoint', async () => {
    await mount(PacketJourney)
    expect(host.textContent).toContain('A wants to ping B')
    await click(buttons('Step')[0])
    expect(host.querySelector('.journey-question')).not.toBeNull()
    await click(buttons('B is on another subnet')[0])
    await settle(400)
    expect(host.textContent).toContain('Is B on my subnet?')
    noEmDash()
  })
})
