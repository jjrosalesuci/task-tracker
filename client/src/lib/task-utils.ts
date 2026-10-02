import type { Quadrant, Task } from '../types'

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
