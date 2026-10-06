import { describe, expect, it } from 'vitest'
import { addDays, compareTaskDates, dateValue, localDay, matchesTaskView, nextMonday, quadrantFromFlags, relativeDueDate, shouldWarnTaskCount } from './task-utils'
import type { Task } from '../types'

const task: Task = { id: 'task', title: 'Task', scope: 'personal', quadrant: 'not-urgent-important', completed: false, position: 0 }

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

  it('orders calendar due dates first, missing dates last and ties by position', () => {
    const tasks = [
      { ...task, id: 'none', dueDate: null },
      { ...task, id: 'late', dueDate: '2026-10-09T00:00:00Z' },
      { ...task, id: 'tie', position: 5, dueDate: '2026-10-06T00:00:00Z' },
      { ...task, id: 'first', dueDate: '2026-10-06T23:59:59Z' },
    ]
    expect(tasks.sort(compareTaskDates).map((item) => item.id)).toEqual(['first', 'tie', 'late', 'none'])
  })

  it('uses local calendar days without shifting stored UTC dates', () => {
    expect(localDay(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06')
    expect(dateValue('2026-10-06T23:59:59.000Z')).toBe('2026-10-06')
    expect(relativeDueDate('2026-10-05T23:59:59Z', '2026-10-06')).toBe('overdue')
    expect(relativeDueDate('2026-10-06T23:59:59Z', '2026-10-06')).toBe('today')
    expect(relativeDueDate('2026-10-07T00:00:00Z', '2026-10-06')).toBe('tomorrow')
    expect(relativeDueDate('2026-10-08', '2026-10-06')).toBeNull()
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('always postpones to a strictly future Monday including on Mondays', () => {
    expect(nextMonday('2026-10-05')).toBe('2026-10-12')
    expect(nextMonday('2026-10-06')).toBe('2026-10-12')
    expect(nextMonday('2026-10-11')).toBe('2026-10-12')
  })

  it('filters today including overdue, a seven-day window, and completed tasks', () => {
    const today = '2026-10-06'
    expect(matchesTaskView({ ...task, dueDate: '2026-10-05' }, 'today', today)).toBe(true)
    expect(matchesTaskView({ ...task, dueDate: today }, 'today', today)).toBe(true)
    expect(matchesTaskView({ ...task, dueDate: '2026-10-07' }, 'today', today)).toBe(false)
    expect(matchesTaskView(task, 'today', today)).toBe(false)
    expect(matchesTaskView({ ...task, dueDate: '2026-10-05' }, 'week', today)).toBe(false)
    expect(matchesTaskView({ ...task, dueDate: today }, 'week', today)).toBe(true)
    expect(matchesTaskView({ ...task, dueDate: '2026-10-12' }, 'week', today)).toBe(true)
    expect(matchesTaskView({ ...task, dueDate: '2026-10-13' }, 'week', today)).toBe(false)
    expect(matchesTaskView({ ...task, completed: true }, 'completed', today)).toBe(true)
    expect(matchesTaskView(task, 'completed', today)).toBe(false)
    expect(matchesTaskView({ ...task, dueDate: today, completed: true }, 'today', today)).toBe(false)
  })
})
