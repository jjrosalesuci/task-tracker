import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ErrorBanner } from './components/ErrorBanner'
import { Icon } from './components/Icons'
import { LanguageSwitch } from './components/LanguageSwitch'
import { Spinner } from './components/Spinner'
import { TaskReport } from './components/TaskReport'
import { useAuth } from './contexts/AuthContext'
import { useI18n } from './contexts/I18nContext'
import { navigate, useRoute } from './hooks/useRoute'
import { api } from './lib/api'
import { matchesTaskSearch, quadrantFromFlags, shouldWarnTaskCount } from './lib/task-utils'
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
  return { id: task.id, title: task.title, description: task.description, scope: task.matrix === 'WORK' ? 'professional' : 'personal', quadrant, completed: task.status === 'COMPLETED', completedAt: task.completedAt, position: task.position, dueDate: task.dueDate, ownerId: task.ownerId, owner: task.owner, assignee: task.assignedTo, assigneeEmail: task.assignedTo?.email, createdAt: task.createdAt, updatedAt: task.updatedAt }
}

function toApi(task: { title: string; description: string; scope: Scope; quadrant: Quadrant; dueDate: string; assignedToId?: string | null }) {
  const q = quadrants.find((item) => item.key === task.quadrant)!
  return { title: task.title, description: task.description || null, matrix: task.scope === 'professional' ? 'WORK' : 'PERSONAL', urgent: q.urgent, important: q.important, dueDate: task.dueDate ? new Date(`${task.dueDate}T23:59:59.000Z`).toISOString() : null, assignedToId: task.assignedToId ?? null }
}

function dateValue(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

function localDay() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function Popover({ label, trigger, children, className = '' }: { label: string; trigger: ReactNode; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])
  return <details ref={ref} open={open} className={`popover ${className}`} onKeyDown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      event.currentTarget.querySelector('summary')?.focus()
    }
  }} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <summary aria-label={label} aria-expanded={open} title={label} onClick={(event) => { event.preventDefault(); setOpen(!open) }}>{trigger}</summary>
    <div className="popover-panel" hidden={!open} onClick={(event) => {
      if ((event.target as Element).closest('button') && ref.current) {
        setOpen(false)
        ref.current.querySelector('summary')?.focus()
      }
    }}>{children}</div>
  </details>
}

function AppShell() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [scope, setScope] = useState<Scope>('personal')
  const [view, setView] = useState<'owned' | 'assigned' | 'report'>('owned')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>()
  const [editing, setEditing] = useState<Task | null | undefined>(undefined)
  const [notice, setNotice] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [search, setSearch] = useState('')
  const [newQuadrant, setNewQuadrant] = useState<Quadrant>('urgent-important')
  const [dragged, setDragged] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<Quadrant | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const loadId = useRef(0)
  const mutationPending = useRef(false)

  const load = useCallback(async () => {
    const id = ++loadId.current
    setLoading(true); setError(undefined)
    setTasks([]); setDragged(null); setDropTarget(null)
    try {
      const matrix = scope === 'professional' ? 'WORK' : 'PERSONAL'
      const result = await api<{ tasks: any[] }>(view === 'report' ? '/tasks?scope=all' : `/tasks?matrix=${matrix}&scope=${view}`)
      if (id === loadId.current) setTasks(result.tasks.map(fromApi))
    } catch (caught) { if (id === loadId.current) setError(caught) } finally { if (id === loadId.current) setLoading(false) }
  }, [scope, view])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!mobileMenu) return
    function dismiss(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setMobileMenu(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setMobileMenu(false); menuRef.current?.focus() }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [mobileMenu])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && editing === undefined) {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [editing])

  const activeTasks = useMemo(() => tasks.filter((task) => !task.completed), [tasks])
  const grouped = useMemo(() => quadrants.reduce<Record<Quadrant, Task[]>>((all, q) => {
    all[q.key] = activeTasks.filter((task) => task.quadrant === q.key).sort((a, b) => a.position - b.position)
    return all
  }, { 'urgent-important': [], 'not-urgent-important': [], 'urgent-not-important': [], 'not-urgent-not-important': [] }), [activeTasks])
  const query = search.trim().toLocaleLowerCase()
  const matches = (task: Task) => matchesTaskSearch(task, search)
  const dueTasks = tasks.filter((task) => !task.completed && task.dueDate && dateValue(task.dueDate) <= localDay())

  function createTask(quadrant: Quadrant = 'urgent-important') {
    setNewQuadrant(quadrant)
    setEditing(null)
  }

  async function saveTask(form: { title: string; description: string; quadrant: Quadrant; dueDate: string; assigneeEmail: string }) {
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
  }

  async function toggle(task: Task) {
    const id = loadId.current
    try {
      const result = await api<{ task: any }>(`/tasks/${task.id}`, { method: 'PATCH', body: { status: task.completed ? 'PENDING' : 'COMPLETED' } })
      if (id !== loadId.current) return
      setTasks((current) => current.map((item) => item.id === task.id ? fromApi(result.task) : item))
    } catch (caught) { if (id === loadId.current) setError(caught) }
  }

  async function remove(task: Task) {
    if (!window.confirm(t('deleteConfirm'))) return
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' })
      setTasks((current) => current.filter((item) => item.id !== task.id)); setNotice(t('taskDeleted'))
    } catch (caught) { setError(caught) }
  }

  async function move(task: Task, direction: -1 | 1) {
    if (view !== 'owned' || mutationPending.current) return
    const list = grouped[task.quadrant], index = list.findIndex((item) => item.id === task.id), next = index + direction
    if (next < 0 || next >= list.length) return
    const reordered = [...list]; [reordered[index], reordered[next]] = [reordered[next], reordered[index]]
    mutationPending.current = true
    const id = loadId.current
    try {
      await api('/tasks/reorder/batch', { method: 'POST', body: { items: reordered.map((item, position) => ({ id: item.id, position })) } })
      if (id !== loadId.current) return
      setTasks((current) => current.map((item) => { const position = reordered.findIndex((nextItem) => nextItem.id === item.id); return position < 0 ? item : { ...item, position } }))
      setNotice(t('taskMoved'))
    } catch (caught) { if (id === loadId.current) setError(caught) } finally { mutationPending.current = false }
  }

  async function moveTo(task: Task, quadrant: Quadrant) {
    if (view !== 'owned' || task.ownerId !== user?.id || task.quadrant === quadrant || mutationPending.current) return
    const target = quadrants.find((item) => item.key === quadrant)!
    const position = Math.max(-1, ...grouped[quadrant].map((item) => item.position)) + 1
    const id = loadId.current
    mutationPending.current = true
    try {
      const result = await api<{ task: any }>(`/tasks/${task.id}`, { method: 'PATCH', body: { urgent: target.urgent, important: target.important, position } })
      if (id !== loadId.current) return
      setTasks((current) => current.map((item) => item.id === task.id ? fromApi(result.task) : item))
      setNotice(t('taskMoved'))
    } catch (caught) { if (id === loadId.current) setError(caught) } finally { mutationPending.current = false }
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">{t('skipToContent')}</a>
    <header className="topbar">
      <button ref={menuRef} className="icon-button menu-toggle" aria-label={t('menu')} aria-expanded={mobileMenu} aria-controls="main-navigation" onClick={() => setMobileMenu(!mobileMenu)}><Icon name="menu" /></button>
      <div className="brand-compact"><span className="brand-dot" />{t('appName')}</div>
      <nav ref={navRef} id="main-navigation" className={mobileMenu ? 'topnav open' : 'topnav'}>
        <button className={view === 'owned' ? 'nav-button active' : 'nav-button'} aria-current={view === 'owned' ? 'page' : undefined} onClick={() => { setView('owned'); setSearch(''); setMobileMenu(false) }}><Icon name="grid" />{t('overview')}</button>
        <button className={view === 'assigned' ? 'nav-button active' : 'nav-button'} aria-current={view === 'assigned' ? 'page' : undefined} onClick={() => { setView('assigned'); setSearch(''); setMobileMenu(false) }}><Icon name="inbox" />{t('assigned')}</button>
        <button className={view === 'report' ? 'nav-button active' : 'nav-button'} aria-current={view === 'report' ? 'page' : undefined} onClick={() => { setView('report'); setSearch(''); setMobileMenu(false) }}><Icon name="inbox" />{t('taskReport')}</button>
      </nav>
      <div className="top-actions">
        <div className="quick-search"><Icon name="search" /><input ref={searchRef} type="search" aria-label={t('searchTasks')} placeholder={t('searchTasks')} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearch('') }} />{search ? <button className="icon-button" aria-label={t('clearSearch')} onClick={() => setSearch('')}><Icon name="close" /></button> : <kbd>⌘ K / Ctrl K</kbd>}</div>
        <Popover label={t('notifications')} trigger={<><Icon name="bell" />{dueTasks.length > 0 && <span className="notification-dot" />}</>} className="notifications">
          <h2>{t('dueNotifications')}</h2>
          {dueTasks.length ? <ul>{dueTasks.map((task) => <li key={task.id}><button onClick={() => setSearch(task.title)}><strong>{task.title}</strong><span>{t(dateValue(task.dueDate) < localDay() ? 'overdue' : 'today')}</span></button></li>)}</ul> : <p>{t('noNotifications')}</p>}
        </Popover>
        <LanguageSwitch />
        <Popover label={t('userMenu')} trigger={<span className="avatar">{(user?.name || user?.email || '').slice(0, 2).toUpperCase()}</span>} className="user-menu">
          <strong>{user?.name}</strong><p>{user?.email}</p><button onClick={() => void logout()}><Icon name="logout" />{t('logout')}</button>
        </Popover>
      </div>
    </header>
    <main id="main" className="workspace">
      <div className="workspace-heading"><div><p className="eyebrow">{t(view === 'report' ? 'taskReport' : view === 'assigned' ? 'assigned' : 'overview')}</p><h1>{t('welcome', { name: user?.name || user?.email.split('@')[0] || '' })}</h1></div>{view !== 'report' && <button className="button button-primary" onClick={() => createTask()} disabled={view === 'assigned'}><Icon name="plus" />{t('newTask')}</button>}</div>
      {view !== 'report' && <div className="scope-tabs" role="tablist">{(['personal', 'professional'] as Scope[]).map((item) => <button key={item} role="tab" aria-selected={scope === item} className={scope === item ? 'scope-tab active' : 'scope-tab'} onClick={() => setScope(item)}>{t(item)}</button>)}</div>}
      {error ? <ErrorBanner error={error} onRetry={() => void load()} /> : null}
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label={t('close')}>×</button></div>}
      {!loading && view !== 'report' && query && !activeTasks.some(matches) && <p className="search-empty" role="status">{t('noResults')}</p>}
      {loading ? <Spinner label={t('loading')} /> : view === 'report' ? <TaskReport tasks={tasks} userId={user!.id} search={search} onClearSearch={() => setSearch('')} onToggle={toggle} quadrants={quadrants} /> : view === 'assigned' && activeTasks.length === 0 ? <div className="empty-state"><Icon name="inbox" /><p>{t('emptyAssigned')}</p></div> : <div className="matrix-grid">{quadrants.map((quadrant, quadrantIndex) => {
        const visible = grouped[quadrant.key].filter(matches)
        return <section className={`quadrant quadrant-${quadrant.key}${dropTarget === quadrant.key ? ' drop-target' : ''}`} key={quadrant.key} aria-labelledby={`heading-${quadrant.key}`}
          onDragOver={(event) => {
            if (dragged && view === 'owned') { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(quadrant.key) }
          }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null) }}
          onDrop={(event) => {
            event.preventDefault()
            const task = tasks.find((item) => item.id === dragged)
            setDragged(null); setDropTarget(null)
            if (task) void moveTo(task, quadrant.key)
          }}>
          <div className="quadrant-heading"><Icon name={['bolt', 'calendar', 'user', 'trash'][quadrantIndex]} /><div><h2 id={`heading-${quadrant.key}`}>{t(quadrant.title)}</h2><p>{t(quadrant.hint)}</p></div><span className="task-count" aria-label={t('taskCount', { count: visible.length })}>{visible.length}</span></div>
          {shouldWarnTaskCount(grouped[quadrant.key].length) && <div className="limit-warning" role="status">⚠ {t('tooManyTasks')}</div>}
          <div className="task-list">{visible.map((task) => <TaskCard key={task.id} task={task} index={grouped[quadrant.key].indexOf(task)} total={grouped[quadrant.key].length} canEdit={view === 'owned' && task.ownerId === user?.id} onEdit={() => setEditing(task)} onDelete={() => void remove(task)} onToggle={() => void toggle(task)} onMove={(direction) => void move(task, direction)} onMoveTo={(target) => void moveTo(task, target)} onDragStart={() => setDragged(task.id)} onDragEnd={() => { setDragged(null); setDropTarget(null) }} />)}
            {visible.length === 0 && <div className="empty-quadrant"><Icon name={['bolt', 'calendar', 'user', 'trash'][quadrantIndex]} /><p>{t(dropTarget === quadrant.key ? 'dropHere' : query ? 'noResults' : 'emptyQuadrant')}</p>{view === 'owned' && !query && <><small>{t('dragHint')}</small><button className="button button-ghost" onClick={() => createTask(quadrant.key)}><Icon name="plus" />{t('newTask')}</button></>}</div>}
          </div>
        </section>
      })}</div>}
    </main>
    {editing !== undefined && <TaskDialog task={editing} initialQuadrant={newQuadrant} onClose={() => setEditing(undefined)} onSave={saveTask} />}
  </div>
}

function TaskCard({ task, index, total, canEdit, onEdit, onDelete, onToggle, onMove, onMoveTo, onDragStart, onDragEnd }: { task: Task; index: number; total: number; canEdit: boolean; onEdit: () => void; onDelete: () => void; onToggle: () => void; onMove: (direction: -1 | 1) => void; onMoveTo: (quadrant: Quadrant) => void; onDragStart: () => void; onDragEnd: () => void }) {
  const { t, locale } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const overdue = task.dueDate && !task.completed && dateValue(task.dueDate) < localDay()
  const priority = task.quadrant === 'urgent-important' ? 'high' : task.quadrant === 'not-urgent-not-important' ? 'low' : 'medium'
  return <article className={task.completed ? 'task-card completed' : 'task-card'} aria-label={task.title} draggable={canEdit} onDragStart={(event) => {
    if (!canEdit || (event.target as Element).closest('button, summary, select, input')) { event.preventDefault(); return }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', task.id)
    onDragStart()
  }} onDragEnd={onDragEnd}>
    <div className="task-card-main"><button className="check-button" aria-label={task.completed ? t('reopen') : t('complete')} aria-pressed={task.completed} onClick={onToggle}>{task.completed && <Icon name="check" />}</button>
      <div className="task-copy"><h3>{task.title}</h3>{task.description && <p id={`description-${task.id}`} className={expanded ? 'expanded' : undefined}>{task.description}</p>}
        <div className="task-meta">
          {task.dueDate && <span className={overdue ? 'due overdue' : 'due'} title={t('dueDate')}><Icon name="calendar" /><time dateTime={dateValue(task.dueDate)}>{dateValue(task.dueDate) === localDay() ? t('today') : new Date(`${dateValue(task.dueDate)}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</time>{overdue && <span>{t('overdue')}</span>}</span>}
          {task.assignee?.email && <span title={`${t('assignedTo')}: ${task.assignee.email}`}><Icon name="user" />{task.assignee.name || task.assignee.email.split('@')[0]}</span>}
          <span className={`priority priority-${priority}`} title={t('priority')}><i />{t(priority)}</span>
        </div>
      </div>
      <div className="task-actions">
        {canEdit && <button className="quick-edit" onClick={onEdit} aria-label={t('edit')}><Icon name="edit" /></button>}
        <Popover label={t('taskActions', { title: task.title })} trigger={<Icon name="more" />}>
          {task.owner?.email && <p className="owner-detail">{t('assignedBy')}: {task.owner.email}</p>}
          {task.description && <button aria-expanded={expanded} aria-controls={`description-${task.id}`} onClick={() => setExpanded(!expanded)}><Icon name={expanded ? 'up' : 'down'} />{t(expanded ? 'collapseDescription' : 'expandDescription')}</button>}
          <button onClick={onToggle}><Icon name="check" />{task.completed ? t('reopen') : t('complete')}</button>
          {canEdit ? <>
            <button onClick={onEdit}><Icon name="edit" />{t('edit')}</button>
            <label className="move-select">{t('moveTo')}<select aria-label={t('moveTo')} value={task.quadrant} onChange={(event) => onMoveTo(event.target.value as Quadrant)}>{quadrants.map((quadrant) => <option key={quadrant.key} value={quadrant.key}>{t(quadrant.title)}</option>)}</select></label>
            <button disabled={index === 0} onClick={() => onMove(-1)}><Icon name="up" />{t('moveUp')}</button>
            <button disabled={index === total - 1} onClick={() => onMove(1)}><Icon name="down" />{t('moveDown')}</button>
            <button className="danger-action" onClick={onDelete}><Icon name="trash" />{t('delete')}</button>
          </> : <p className="readonly-note">{t('assignedReadOnly')}</p>}
        </Popover>
      </div>
    </div>
  </article>
}

function TaskDialog({ task, initialQuadrant, onClose, onSave }: { task: Task | null; initialQuadrant: Quadrant; onClose: () => void; onSave: (form: { title: string; description: string; quadrant: Quadrant; dueDate: string; assigneeEmail: string }) => Promise<void> }) {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>()
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current!
    const opener = document.activeElement as HTMLElement | null
    dialog.showModal()
    dialog.querySelector<HTMLInputElement>('input[name="title"]')?.focus()
    return () => { dialog.close(); opener?.focus() }
  }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true)
    const data = new FormData(event.currentTarget)
    setError(undefined)
    try {
      await onSave({ title: String(data.get('title')), description: String(data.get('description') || ''), quadrant: String(data.get('quadrant')) as Quadrant, dueDate: String(data.get('dueDate') || ''), assigneeEmail: String(data.get('assigneeEmail') || '') })
    } catch (caught) { setError(caught) } finally { setSaving(false) }
  }
  return <dialog ref={dialogRef} className="task-dialog" aria-labelledby="task-dialog-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose() }}>
    <form onSubmit={submit}><div className="dialog-heading"><h2 id="task-dialog-title">{task ? t('editTask') : t('newTask')}</h2><button type="button" className="icon-button" disabled={saving} onClick={onClose} aria-label={t('close')}><Icon name="close" /></button></div>
      {error ? <ErrorBanner error={error} /> : null}
      <fieldset disabled={saving}>
        <label>{t('title')}<input name="title" defaultValue={task?.title} required maxLength={200} autoFocus /></label>
        <label>{t('description')}<textarea name="description" defaultValue={task?.description ?? ''} maxLength={5000} rows={3} /></label>
        <label>{t('moveTo')}<select name="quadrant" defaultValue={task?.quadrant ?? initialQuadrant}>{quadrants.map((quadrant) => <option key={quadrant.key} value={quadrant.key}>{t(quadrant.title)}</option>)}</select></label>
        <div className="dialog-fields"><label>{t('dueDate')}<input name="dueDate" type="date" defaultValue={dateValue(task?.dueDate)} /></label><label>{t('assignEmail')}<input name="assigneeEmail" type="email" defaultValue={task?.assigneeEmail ?? ''} placeholder={t('assignOptional')} /></label></div>
        <div className="dialog-actions"><button type="button" className="button button-ghost" onClick={onClose}>{t('cancel')}</button><button className="button button-primary">{saving ? t('loading') : task ? t('save') : t('createTask')}</button></div>
      </fieldset>
    </form>
  </dialog>
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
