import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ErrorBanner } from './components/ErrorBanner'
import { Icon } from './components/Icons'
import { LanguageSwitch } from './components/LanguageSwitch'
import { Spinner } from './components/Spinner'
import { useAuth } from './contexts/AuthContext'
import { useI18n } from './contexts/I18nContext'
import { navigate, useRoute } from './hooks/useRoute'
import { api } from './lib/api'
import { quadrantFromFlags, shouldWarnTaskCount } from './lib/task-utils'
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages'
import type { Quadrant, Scope, Task, User } from './types'

const quadrants: { key: Quadrant; urgent: boolean; important: boolean; title: 'urgentImportant' | 'notUrgentImportant' | 'urgentNotImportant' | 'notUrgentNotImportant'; hint: 'urgentImportantHint' | 'notUrgentImportantHint' | 'urgentNotImportantHint' | 'notUrgentNotImportantHint' }[] = [
  { key: 'urgent-important', urgent: true, important: true, title: 'urgentImportant', hint: 'urgentImportantHint' },
  { key: 'not-urgent-important', urgent: false, important: true, title: 'notUrgentImportant', hint: 'notUrgentImportantHint' },
  { key: 'urgent-not-important', urgent: true, important: false, title: 'urgentNotImportant', hint: 'urgentNotImportantHint' },
  { key: 'not-urgent-not-important', urgent: false, important: false, title: 'notUrgentNotImportant', hint: 'notUrgentNotImportantHint' },
]

function fromApi(task: any): Task {
  const quadrant = quadrantFromFlags(task.urgent, task.important)
  return { id: task.id, title: task.title, description: task.description, scope: task.matrix === 'WORK' ? 'professional' : 'personal', quadrant, completed: task.status === 'COMPLETED', position: task.position, dueDate: task.dueDate, ownerId: task.ownerId, owner: task.owner, assignee: task.assignedTo, assigneeEmail: task.assignedTo?.email, createdAt: task.createdAt, updatedAt: task.updatedAt }
}

function toApi(task: { title: string; description: string; scope: Scope; quadrant: Quadrant; dueDate: string; assignedToId?: string | null }) {
  const q = quadrants.find((item) => item.key === task.quadrant)!
  return { title: task.title, description: task.description || null, matrix: task.scope === 'professional' ? 'WORK' : 'PERSONAL', urgent: q.urgent, important: q.important, dueDate: task.dueDate ? new Date(`${task.dueDate}T23:59:59.000Z`).toISOString() : null, assignedToId: task.assignedToId ?? null }
}

function dateValue(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

function AppShell() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [scope, setScope] = useState<Scope>('personal')
  const [view, setView] = useState<'owned' | 'assigned'>('owned')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>()
  const [editing, setEditing] = useState<Task | null | undefined>(undefined)
  const [notice, setNotice] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(undefined)
    try {
      const matrix = scope === 'professional' ? 'WORK' : 'PERSONAL'
      const result = await api<{ tasks: any[] }>(`/tasks?matrix=${matrix}&scope=${view}`)
      setTasks(result.tasks.map(fromApi))
    } catch (caught) { setError(caught) } finally { setLoading(false) }
  }, [scope, view])
  useEffect(() => { void load() }, [load])

  const grouped = useMemo(() => quadrants.reduce<Record<Quadrant, Task[]>>((all, q) => {
    all[q.key] = tasks.filter((task) => task.quadrant === q.key).sort((a, b) => a.position - b.position)
    return all
  }, { 'urgent-important': [], 'not-urgent-important': [], 'urgent-not-important': [], 'not-urgent-not-important': [] }), [tasks])

  async function saveTask(form: { title: string; description: string; quadrant: Quadrant; dueDate: string; assigneeEmail: string }) {
    try {
      let assignedToId: string | null = null
      if (form.assigneeEmail.trim()) {
        const found = await api<{ user: User | null }>(`/users/search?email=${encodeURIComponent(form.assigneeEmail.trim())}`)
        if (!found.user) throw new Error(t('userNotFound'))
        assignedToId = found.user.id
      }
      const body = toApi({ ...form, scope, assignedToId })
      if (editing) {
        const result = await api<{ task: any }>(`/tasks/${editing.id}`, { method: 'PATCH', body })
        setTasks((current) => current.map((item) => item.id === editing.id ? fromApi(result.task) : item))
        setNotice(t('taskUpdated'))
      } else {
        const result = await api<{ task: any }>('/tasks', { method: 'POST', body })
        setTasks((current) => [...current, fromApi(result.task)])
        setNotice(t('taskSaved'))
      }
      setEditing(undefined)
    } catch (caught) { setError(caught) }
  }

  async function toggle(task: Task) {
    try {
      const result = await api<{ task: any }>(`/tasks/${task.id}`, { method: 'PATCH', body: { status: task.completed ? 'PENDING' : 'COMPLETED' } })
      setTasks((current) => current.map((item) => item.id === task.id ? fromApi(result.task) : item))
    } catch (caught) { setError(caught) }
  }

  async function remove(task: Task) {
    if (!window.confirm(t('deleteConfirm'))) return
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' })
      setTasks((current) => current.filter((item) => item.id !== task.id)); setNotice(t('taskDeleted'))
    } catch (caught) { setError(caught) }
  }

  async function move(task: Task, direction: -1 | 1) {
    const list = grouped[task.quadrant], index = list.findIndex((item) => item.id === task.id), next = index + direction
    if (next < 0 || next >= list.length) return
    const reordered = [...list]; [reordered[index], reordered[next]] = [reordered[next], reordered[index]]
    try {
      await api('/tasks/reorder/batch', { method: 'POST', body: { items: reordered.map((item, position) => ({ id: item.id, position })) } })
      setTasks((current) => current.map((item) => { const position = reordered.findIndex((nextItem) => nextItem.id === item.id); return position < 0 ? item : { ...item, position } }))
      setNotice(t('taskMoved'))
    } catch (caught) { setError(caught) }
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">{t('skipToContent')}</a>
    <header className="topbar">
      <button className="icon-button menu-toggle" aria-label={t('menu')} onClick={() => setMobileMenu(!mobileMenu)}><Icon name="menu" /></button>
      <div className="brand-compact"><span className="brand-dot" />{t('appName')}</div>
      <nav className={mobileMenu ? 'topnav open' : 'topnav'}>
        <button className={view === 'owned' ? 'nav-button active' : 'nav-button'} onClick={() => { setView('owned'); setMobileMenu(false) }}><Icon name="grid" />{t('overview')}</button>
        <button className={view === 'assigned' ? 'nav-button active' : 'nav-button'} onClick={() => { setView('assigned'); setMobileMenu(false) }}><Icon name="inbox" />{t('assigned')}</button>
      </nav>
      <div className="top-actions"><LanguageSwitch /><span className="user-email">{user?.email}</span><button className="icon-button" aria-label={t('logout')} onClick={() => void logout()}><Icon name="logout" /></button></div>
    </header>
    <main id="main" className="workspace">
      <div className="workspace-heading"><div><p className="eyebrow">{view === 'assigned' ? t('assigned') : t('overview')}</p><h1>{t('welcome', { name: user?.email.split('@')[0] ?? '' })}</h1></div><button className="button button-primary" onClick={() => setEditing(null)} disabled={view === 'assigned'}><Icon name="plus" />{t('newTask')}</button></div>
      <div className="scope-tabs" role="tablist">{(['personal', 'professional'] as Scope[]).map((item) => <button key={item} role="tab" aria-selected={scope === item} className={scope === item ? 'scope-tab active' : 'scope-tab'} onClick={() => setScope(item)}>{t(item)}</button>)}</div>
      {error ? <ErrorBanner error={error} onRetry={() => void load()} /> : null}
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label={t('close')}>×</button></div>}
      {loading ? <Spinner label={t('loading')} /> : view === 'assigned' && tasks.length === 0 ? <div className="empty-state"><Icon name="inbox" /><p>{t('emptyAssigned')}</p></div> : <div className="matrix-grid">{quadrants.map((quadrant) => <section className={`quadrant quadrant-${quadrant.key}`} key={quadrant.key} aria-labelledby={`heading-${quadrant.key}`}><div className="quadrant-heading"><div><h2 id={`heading-${quadrant.key}`}>{t(quadrant.title)}</h2><p>{t(quadrant.hint)}</p></div><span className="task-count">{t('taskCount', { count: grouped[quadrant.key].length })}</span></div>{shouldWarnTaskCount(grouped[quadrant.key].length) && <div className="limit-warning" role="status">⚠ {t('tooManyTasks')}</div>}<div className="task-list">{grouped[quadrant.key].map((task, index) => <TaskCard key={task.id} task={task} index={index} total={grouped[quadrant.key].length} canEdit={view === 'owned'} onEdit={() => setEditing(task)} onDelete={() => void remove(task)} onToggle={() => void toggle(task)} onMove={(direction) => void move(task, direction)} />)}{grouped[quadrant.key].length === 0 && <p className="empty-quadrant">{t('emptyQuadrant')}</p>}</div></section>)}</div>}
    </main>
    {editing !== undefined && <TaskDialog task={editing} onClose={() => setEditing(undefined)} onSave={saveTask} />}
  </div>
}

function TaskCard({ task, index, total, canEdit, onEdit, onDelete, onToggle, onMove }: { task: Task; index: number; total: number; canEdit: boolean; onEdit: () => void; onDelete: () => void; onToggle: () => void; onMove: (direction: -1 | 1) => void }) {
  const { t } = useI18n()
  const overdue = task.dueDate && !task.completed && new Date(task.dueDate) < new Date()
  return <article className={task.completed ? 'task-card completed' : 'task-card'}><div className="task-card-main"><button className="check-button" aria-label={task.completed ? t('reopen') : t('complete')} onClick={onToggle}><Icon name="check" /></button><div className="task-copy"><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}<div className="task-meta">{task.dueDate && <span className={overdue ? 'due overdue' : 'due'}><Icon name="calendar" />{t('due')} {new Date(task.dueDate).toLocaleDateString()}</span>}{task.assignee?.email && <span>{t('assignedTo')}: {task.assignee.email}</span>}{task.owner?.email && <span>{t('assignedBy')}: {task.owner.email}</span>}</div></div></div><div className="task-actions">{canEdit ? <><button onClick={onEdit} aria-label={t('edit')}><Icon name="edit" /></button><button onClick={onDelete} aria-label={t('delete')}><Icon name="trash" /></button><button disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('moveUp')}><Icon name="up" /></button><button disabled={index === total - 1} onClick={() => onMove(1)} aria-label={t('moveDown')}><Icon name="down" /></button></> : <span className="readonly-note">{t('assignedReadOnly')}</span>}</div></article>
}

function TaskDialog({ task, onClose, onSave }: { task: Task | null; onClose: () => void; onSave: (form: { title: string; description: string; quadrant: Quadrant; dueDate: string; assigneeEmail: string }) => Promise<void> }) {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true)
    const data = new FormData(event.currentTarget)
    await onSave({ title: String(data.get('title')), description: String(data.get('description') || ''), quadrant: String(data.get('quadrant')) as Quadrant, dueDate: String(data.get('dueDate') || ''), assigneeEmail: String(data.get('assigneeEmail') || '') })
    setSaving(false)
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="task-dialog" onSubmit={submit}><div className="dialog-heading"><h2>{task ? t('editTask') : t('newTask')}</h2><button type="button" className="icon-button" onClick={onClose} aria-label={t('close')}><Icon name="close" /></button></div><label>{t('title')}<input name="title" defaultValue={task?.title} required maxLength={200} autoFocus /></label><label>{t('description')}<textarea name="description" defaultValue={task?.description ?? ''} maxLength={5000} rows={4} /></label><label>{t('moveTo')}<select name="quadrant" defaultValue={task?.quadrant ?? 'urgent-important'}>{quadrants.map((quadrant) => <option key={quadrant.key} value={quadrant.key}>{t(quadrant.title)}</option>)}</select></label><label>{t('dueDate')}<input name="dueDate" type="date" defaultValue={dateValue(task?.dueDate)} /></label><label>{t('assignEmail')}<input name="assigneeEmail" type="email" defaultValue={task?.assigneeEmail ?? ''} placeholder={t('assignOptional')} /></label><div className="dialog-actions"><button type="button" className="button button-ghost" onClick={onClose}>{t('cancel')}</button><button className="button button-primary" disabled={saving}>{saving ? t('loading') : t('save')}</button></div></form></div>
}

export function App() {
  const route = useRoute()
  const { user, loading } = useAuth()
  if (loading) return <Spinner label="Loading…" />
  if (user && (route === '/login' || route === '/register' || route === '/forgot-password' || route === '/reset-password')) navigate('/', true)
  if (!user) {
    if (route === '/register') return <RegisterPage />
    if (route === '/forgot-password') return <ForgotPasswordPage />
    if (route === '/reset-password') return <ResetPasswordPage />
    return <LoginPage />
  }
  return <AppShell />
}
