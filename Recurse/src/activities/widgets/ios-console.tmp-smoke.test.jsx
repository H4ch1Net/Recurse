// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import IosConsole from './ios-console.jsx'
import { getConsoleLab } from '../lib/ios/labs.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function type(input, text) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
function key(input, k, extra = {}) {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }))
}

describe('ios-console widget smoke', () => {
  it('runs a full lab and completes', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    let result = null
    await act(async () => root.render(<IosConsole props={{ lab: 'cl-d2-vlans' }} onComplete={(r) => (result = r)} />))
    const input = el.querySelector('.iosc-input')
    expect(el.textContent).toContain('SW1 con0 is now available')
    for (const cmd of getConsoleLab('cl-d2-vlans').solution) {
      await act(async () => type(input, cmd))
      await act(async () => key(input, 'Enter'))
    }
    expect(el.textContent).toContain('% Lab check passed: VLAN 10 exists')
    expect(el.textContent).toContain('All checks passed')
    expect(result.score).toBe(1)
    // help with ? and Tab
    await act(async () => type(input, 'sh'))
    await act(async () => key(input, '?'))
    expect(el.textContent).toContain('sh?')
    await act(async () => key(input, 'Tab'))
    expect(input.value).toBe('show ')
    await act(async () => type(input, 'show vl'))
    await act(async () => key(input, 'Enter'))
    expect(el.textContent).toContain('1002 fddi-default')
    // history
    await act(async () => key(input, 'ArrowUp'))
    expect(input.value).toBe('show vl')
    await act(async () => root.unmount())
  })

  it('reveals solution steps after confirming and lowers the score', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    let result = null
    await act(async () => root.render(<IosConsole props={{ lab: 'cl-d4-ntp' }} onComplete={(r) => (result = r)} />))
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Show the solution step by step'))
    await act(async () => btn.click())
    const show = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Show it'))
    await act(async () => show.click())
    expect(el.querySelector('.iosc-steps').textContent).toContain('enable')
    const hint = [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hint')
    await act(async () => hint.click())
    const input = el.querySelector('.iosc-input')
    for (const cmd of getConsoleLab('cl-d4-ntp').solution) {
      await act(async () => type(input, cmd))
      await act(async () => key(input, 'Enter'))
    }
    expect(result.score).toBeLessThan(1)
    expect(result.score).toBeGreaterThan(0.5)
    await act(async () => root.unmount())
  })

  it('sandbox switches device and completes warm-up', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    let result = null
    await act(async () => root.render(<IosConsole props={{}} standalone onComplete={(r) => (result = r)} />))
    expect(el.querySelector('select')).not.toBeNull()
    const swBtn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Switch'))
    await act(async () => swBtn.click())
    expect(el.textContent).toContain('Switch con0 is now available')
    const input = el.querySelector('.iosc-input')
    await act(async () => type(input, '?'))
    for (const cmd of ['en', 'conf t', 'hostname SW9', 'do show vlan brief']) {
      await act(async () => type(input, cmd))
      await act(async () => key(input, 'Enter'))
    }
    expect(result).toEqual({ score: 1, detail: 'IOS sandbox warm-up' })
    await act(async () => key(input, 'z', { ctrlKey: true }))
    expect(el.textContent).toContain('SW9#')
    await act(async () => root.unmount())
  })
})
