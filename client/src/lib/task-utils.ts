import type { Quadrant, Task } from '../types'

export type TaskView = 'owned' | 'today' | 'week' | 'completed' | 'assigned' | 'report'

export function dateValue(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

export function localDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function addDays(day: string, count: number) {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + count)
  return localDay(date)
}

export function nextMonday(day = localDay()) {
  const weekday = new Date(`${day}T12:00:00`).getDay()
  return addDays(day, (8 - weekday) % 7 || 7)
}

export function relativeDueDate(value: string, today = localDay()) {
  const day = dateValue(value)
  if (day < today) return 'overdue'
  if (day === today) return 'today'
  if (day === addDays(today, 1)) return 'tomorrow'
  return null
}

export function compareTaskDates(a: Task, b: Task) {
  return (dateValue(a.dueDate) || '9999-99-99').localeCompare(dateValue(b.dueDate) || '9999-99-99') || a.position - b.position
}

export function matchesTaskView(task: Task, view: TaskView, today = localDay()) {
  if (view === 'report') return true
  if (view === 'completed') return task.completed
  if (task.completed) return false
  const due = dateValue(task.dueDate)
  if (view === 'today') return !!due && due <= today
  if (view === 'week') return !!due && due >= today && due < addDays(today, 7)
  return true
}

export function matchesTaskSearch(task: Task, search: string) {
  const query = search.trim().toLocaleLowerCase()
  return !query || [task.title, task.description, task.owner?.email, task.assignee?.name, task.assignee?.email]
    .some((value) => value?.toLocaleLowerCase().includes(query))
}

export function quadrantFromFlags(urgent: boolean, important: boolean): Quadrant {
  if (urgent && important) return 'urgent-important'
  if (important) return 'not-urgent-important'
  if (urgent) return 'urgent-not-important'
  return 'not-urgent-not-important'
}

export function shouldWarnTaskCount(count: number) {
  return count > 10
}
