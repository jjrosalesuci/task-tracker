import { describe, expect, it } from 'vitest'
import { quadrantFromFlags, shouldWarnTaskCount } from './task-utils'

describe('task matrix helpers', () => {
  it('maps all Eisenhower quadrants', () => {
    expect(quadrantFromFlags(true, true)).toBe('urgent-important')
    expect(quadrantFromFlags(false, true)).toBe('not-urgent-important')
    expect(quadrantFromFlags(true, false)).toBe('urgent-not-important')
    expect(quadrantFromFlags(false, false)).toBe('not-urgent-not-important')
  })

  it('warns only after ten active tasks', () => {
    expect(shouldWarnTaskCount(10)).toBe(false)
    expect(shouldWarnTaskCount(11)).toBe(true)
  })
})
