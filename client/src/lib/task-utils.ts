import type { Quadrant } from '../types'

export function quadrantFromFlags(urgent: boolean, important: boolean): Quadrant {
  if (urgent && important) return 'urgent-important'
  if (important) return 'not-urgent-important'
  if (urgent) return 'urgent-not-important'
  return 'not-urgent-not-important'
}

export function shouldWarnTaskCount(count: number) {
  return count > 10
}
