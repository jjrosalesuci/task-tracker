export type Scope = 'personal' | 'professional'
export type Quadrant = 'urgent-important' | 'not-urgent-important' | 'urgent-not-important' | 'not-urgent-not-important'

export interface User {
  id: string
  name: string
  email: string
  locale?: 'es' | 'en'
}

export interface Task {
  id: string
  title: string
  description?: string | null
  scope: Scope
  quadrant: Quadrant
  completed: boolean
  position: number
  dueDate?: string | null
  ownerId?: string
  owner?: Pick<User, 'id' | 'name' | 'email'>
  assignee?: Pick<User, 'id' | 'name' | 'email'> | null
  assigneeEmail?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface TaskInput {
  title: string
  description?: string
  scope: Scope
  quadrant: Quadrant
  dueDate?: string | null
  assigneeEmail?: string
}
