import { describe, expect, it } from 'vitest'
import { calendarDaysBetween, dayKey, formatDuration, formatInterval } from './dates'

describe('dates', () => {
  it('uses local calendar days', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(calendarDaysBetween(new Date(2026, 0, 1, 23), new Date(2026, 0, 2, 1))).toBe(1)
  })

  it('formats intervals compactly', () => {
    expect(formatInterval(60000)).toBe('1m')
    expect(formatInterval(10 * 60000)).toBe('10m')
    expect(formatInterval(3 * 3600000)).toBe('3h')
    expect(formatInterval(4 * 86400000)).toBe('4d')
    expect(formatInterval(90 * 86400000)).toBe('3mo')
    expect(formatInterval(400 * 86400000)).toBe('1.1y')
  })

  it('formats durations', () => {
    expect(formatDuration(42)).toBe('42s')
    expect(formatDuration(600)).toBe('10m')
    expect(formatDuration(3900)).toBe('1h 5m')
  })
})
