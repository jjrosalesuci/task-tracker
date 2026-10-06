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
import { addDays, compareTaskDates, dateValue, localDay, matchesTaskSearch, matchesTaskView, nextMonday, quadrantFromFlags, relativeDueDate, shouldWarnTaskCount, type TaskView } from './lib/task-utils'
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
  const { t, locale } = useI18n()
  const [scope, setScope] = useState<Scope>('personal')
  const [view, setView] = useState<TaskView>('owned')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>()
  const [editing, setEditing] = useState<Task | null | undefined>(undefined)
  const [notice, setNotice] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Partial<Record<Quadrant, boolean>>>({})
  const [bulkMoving, setBulkMoving] = useState(false)
  const [desktop, setDesktop] = useState(() => window.matchMedia?.('(min-width: 1100px)').matches ?? false)
  const [newQuadrant, setNewQuadrant] = useState<Quadrant>('urgent-important')
  const [dragged, setDragged] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<Quadrant | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const loadId = useRef(0)
  const mutationPending = useRef(false)
  const pendingTasks = useRef(new Set<string>())

  function changeContext(nextScope: Scope, nextView: TaskView) {
    if (nextScope !== scope || nextView !== view) {
      ++loadId.current
      setSelectedId(null); setSheetId(null); setEditing(undefined); setCollapsed({})
      setTasks([]); setLoading(true)
    }
    setScope(nextScope); setView(nextView); setSearch(''); setMobileMenu(false)
  }

  const load = useCallback(async () => {
    const id = ++loadId.current
    setLoading(true); setError(undefined)
    setTasks([]); setDragged(null); setDropTarget(null)
    try {
      const matrix = scope === 'professional' ? 'WORK' : 'PERSONAL'
      const result = await api<{ tasks: any[] }>(view === 'report' ? '/tasks?scope=all' : `/tasks?matrix=${matrix}&scope=${view === 'assigned' ? 'assigned' : 'owned'}`)
      if (id === loadId.current) setTasks(result.tasks.map(fromApi))
    } catch (caught) { if (id === loadId.current) setError(caught) } finally { if (id === loadId.current) setLoading(false) }
  }, [scope, view])
  useEffect(() => {
    const requests = loadId
    void load()
    return () => { ++requests.current }
  }, [load])
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
    const media = window.matchMedia?.('(min-width: 1100px)')
    if (!media) return
    const update = () => setDesktop(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!sheetId) return
    const media = window.matchMedia?.('(min-width: 1100px)')
    if (!media) return
    function showInline() {
      if (media?.matches) { setSelectedId(sheetId); setSheetId(null) }
    }
    media.addEventListener('change', showInline)
    return () => media.removeEventListener('change', showInline)
  }, [sheetId])
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (editing !== undefined || sheetId !== null || document.querySelector('dialog[open]')) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        requestAnimationFrame(() => { searchRef.current?.focus(); searchRef.current?.select() })
      } else if (event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && view !== 'assigned') {
        const target = event.target instanceof Element ? event.target : document.activeElement
        if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
        event.preventDefault()
        setNewQuadrant('urgent-important'); setEditing(null)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [editing, sheetId, view])

  const activeTasks = useMemo(() => tasks.filter((task) => !task.completed), [tasks])
  const viewTasks = useMemo(() => tasks.filter((task) => matchesTaskView(task, view)), [tasks, view])
  const grouped = useMemo(() => quadrants.reduce<Record<Quadrant, Task[]>>((all, q) => {
    all[q.key] = viewTasks.filter((task) => task.quadrant === q.key).sort(compareTaskDates)
    return all
  }, { 'urgent-important': [], 'not-urgent-important': [], 'urgent-not-important': [], 'not-urgent-not-important': [] }), [viewTasks])
  const query = search.trim().toLocaleLowerCase()
  const matches = (task: Task) => matchesTaskSearch(task, search)
  const dueTasks = viewTasks.filter((task) => !task.completed && task.dueDate && dateValue(task.dueDate) <= localDay())
  const urgentCount = activeTasks.filter((task) => matchesTaskView(task, 'today')).length
  const scheduleDue = activeTasks.filter((task) => task.quadrant === 'not-urgent-important' && task.dueDate && dateValue(task.dueDate) <= localDay())
  const selected = viewTasks.find((task) => task.id === selectedId)
  const sheet = viewTasks.find((task) => task.id === sheetId)
  const canOwn = (task: Task) => task.ownerId === user?.id
  const canCreate = view !== 'assigned'

  function createTask(quadrant: Quadrant = 'urgent-important') {
    setNewQuadrant(quadrant)
    setEditing(null)
  }

  function applyTaskUpdate(updated: Task) {
    setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
    if (!matchesTaskView(updated, view)) {
      setSelectedId((current) => current === updated.id ? null : current)
      setSheetId((current) => current === updated.id ? null : current)
    }
  }

  async function saveTask(form: { title: string; description: string; quadrant: Quadrant; dueDate: string; assigneeEmail: string }) {
      const id = loadId.current
      if (editing && !canOwn(editing)) return
      let assignedToId: string | null = null
      if (form.assigneeEmail.trim()) {
        const found = await api<{ user: User | null }>(`/users/search?email=${encodeURIComponent(form.assigneeEmail.trim())}`)
        if (!found.user) throw new Error(t('userNotFound'))
        assignedToId = found.user.id
      }
      const body = toApi({ ...form, scope, assignedToId })
      if (id !== loadId.current) return
      if (editing) {
        const result = await api<{ task: any }>(`/tasks/${editing.id}`, { method: 'PATCH', body })
        if (id !== loadId.current) return
        applyTaskUpdate(fromApi(result.task))
        setNotice(t('taskUpdated'))
      } else {
        const result = await api<{ task: any }>('/tasks', { method: 'POST', body })
        if (id !== loadId.current) return
        setTasks((current) => [...current, fromApi(result.task)])
        setNotice(t('taskSaved'))
      }
      setEditing(undefined)
  }

  async function toggle(task: Task) {
    if (pendingTasks.current.has(task.id)) return
    pendingTasks.current.add(task.id)
    const id = loadId.current
    try {
      const result = await api<{ task: any }>(`/tasks/${task.id}`, { method: 'PATCH', body: { status: task.completed ? 'PENDING' : 'COMPLETED' } })
      if (id !== loadId.current) return
      applyTaskUpdate(fromApi(result.task))
    } catch (caught) { if (id === loadId.current) setError(caught) } finally { pendingTasks.current.delete(task.id) }
  }

  async function remove(task: Task) {
    if (!canOwn(task) || pendingTasks.current.has(task.id)) return
    if (!window.confirm(t('deleteConfirm'))) return
    const id = loadId.current
    pendingTasks.current.add(task.id)
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' })
      if (id !== loadId.current) return
      setTasks((current) => current.filter((item) => item.id !== task.id)); setNotice(t('taskDeleted'))
      setSelectedId(null); setSheetId(null)
    } catch (caught) { if (id === loadId.current) setError(caught) } finally { pendingTasks.current.delete(task.id) }
  }

  async function move(task: Task, direction: -1 | 1) {
    if (!canOwn(task) || mutationPending.current || pendingTasks.current.has(task.id)) return
    const list = grouped[task.quadrant], index = list.findIndex((item) => item.id === task.id), next = index + direction
    if (index < 0 || next < 0 || next >= list.length || dateValue(task.dueDate) !== dateValue(list[next].dueDate)) return
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

  async function patchDetails(task: Task, body: Record<string, unknown>, noticeKey: 'taskMoved' | 'taskUpdated') {
    if (!canOwn(task) || pendingTasks.current.has(task.id)) return
    const id = loadId.current
    pendingTasks.current.add(task.id)
    try {
      const result = await api<{ task: any }>(`/tasks/${task.id}`, { method: 'PATCH', body })
      if (id !== loadId.current) return
      applyTaskUpdate(fromApi(result.task))
      setNotice(t(noticeKey))
      if (typeof body.urgent === 'boolean' && typeof body.important === 'boolean') {
        setCollapsed((current) => ({ ...current, [quadrantFromFlags(body.urgent as boolean, body.important as boolean)]: false }))
      }
    } catch (caught) { if (id === loadId.current) setError(caught) } finally { pendingTasks.current.delete(task.id) }
  }

  async function moveTo(task: Task, quadrant: Quadrant, position?: number) {
    if (task.quadrant === quadrant) return
    const target = quadrants.find((item) => item.key === quadrant)!
    await patchDetails(task, { urgent: target.urgent, important: target.important, position: position ?? Math.max(-1, ...tasks.filter((item) => item.quadrant === quadrant).map((item) => item.position)) + 1 }, 'taskMoved')
  }

  async function moveScheduleDue() {
    if (bulkMoving) return
    setBulkMoving(true)
    const base = Math.max(-1, ...tasks.filter((task) => task.quadrant === 'urgent-important').map((task) => task.position)) + 1
    try {
      await Promise.all(scheduleDue.filter(canOwn).map((task, index) => moveTo(task, 'urgent-important', base + index)))
    } finally { setBulkMoving(false) }
  }

  function revealQuadrant(quadrant: Quadrant) {
    setCollapsed((current) => ({ ...current, [quadrant]: false }))
    const section = document.getElementById(`quadrant-${quadrant}`)
    section?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    section?.querySelector<HTMLButtonElement>('.quadrant-toggle')?.focus()
  }

  function openActions(task: Task) {
    if (window.matchMedia?.('(min-width: 1100px)').matches) setSelectedId(task.id)
    else setSheetId(task.id)
  }

  function detailContent(task: Task) {
    const list = grouped[task.quadrant]
    const index = list.indexOf(task)
    const canReorder = (neighbor: Task | undefined) => !!neighbor && dateValue(neighbor.dueDate) === dateValue(task.dueDate)
    return <TaskDetails task={task} canEdit={canOwn(task)} onToggle={() => void toggle(task)} onMoveTo={(quadrant) => void moveTo(task, quadrant)} onPostpone={(day) => void patchDetails(task, { dueDate: day ? `${day}T23:59:59.000Z` : null }, 'taskUpdated')} onEdit={() => { setSheetId(null); setEditing(task) }} onDelete={() => void remove(task)} onMove={(direction) => void move(task, direction)} canMoveUp={canReorder(list[index - 1])} canMoveDown={canReorder(list[index + 1])} />
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">{t('skipToContent')}</a>
    <header className="topbar">
      <button ref={menuRef} className="icon-button menu-toggle" aria-label={t('menu')} aria-expanded={mobileMenu} aria-controls="main-navigation" onClick={() => setMobileMenu(!mobileMenu)}><Icon name="menu" /></button>
      <div className="brand-compact"><span className="brand-dot" />{t('appName')}</div>
      <div className="top-actions">
        <button className="icon-button mobile-search-toggle" aria-label={t('searchTasks')} aria-expanded={searchOpen} aria-controls="workspace-search" onClick={() => { setSearchOpen(!searchOpen); if (!searchOpen) requestAnimationFrame(() => searchRef.current?.focus()) }}><Icon name="search" /></button>
        <div id="workspace-search" className={`quick-search${searchOpen ? ' search-open' : ''}`}><Icon name="search" /><input ref={searchRef} type="search" aria-label={t('searchTasks')} placeholder={t('searchTasks')} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setSearch(''); setSearchOpen(false); document.querySelector<HTMLButtonElement>('.mobile-search-toggle')?.focus() } }} />{search ? <button className="icon-button" aria-label={t('clearSearch')} onClick={() => setSearch('')}><Icon name="close" /></button> : <kbd>⌘ K / Ctrl K</kbd>}</div>
        <Popover label={t('notifications')} trigger={<><Icon name="bell" />{dueTasks.length > 0 && <span className="notification-dot" />}</>} className="notifications">
          <h2>{t('dueNotifications')}</h2>
          {dueTasks.length ? <ul>{dueTasks.map((task) => <li key={task.id}><button onClick={() => { setSearch(task.title); setSearchOpen(true); revealQuadrant(task.quadrant) }}><strong>{task.title}</strong><span>{t(dateValue(task.dueDate) < localDay() ? 'overdue' : 'today')}</span></button></li>)}</ul> : <p>{t('noNotifications')}</p>}
        </Popover>
        <Popover label={t('userMenu')} trigger={<span className="avatar">{(user?.name || user?.email || '').slice(0, 2).toUpperCase()}</span>} className="user-menu mobile-user-menu">
          <h2>{t('settings')}</h2><strong>{user?.name}</strong><p>{user?.email}</p><LanguageSwitch /><button onClick={() => void logout()}><Icon name="logout" />{t('logout')}</button>
        </Popover>
      </div>
    </header>
    <aside ref={navRef} id="main-navigation" className={`sidebar${mobileMenu ? ' open' : ''}`}>
      <div className="sidebar-brand"><span className="brand-dot" />{t('appName')}</div>
      <button className="button button-primary sidebar-new-task" onClick={() => { setMobileMenu(false); createTask() }} disabled={!canCreate}><Icon name="plus" />{t('newTask')}<kbd>N</kbd></button>
      <nav className="sidebar-views" aria-label={t('views')}>
        {([
          ['owned', 'overview', 'grid'], ['today', 'today', 'bolt'], ['week', 'nextSevenDays', 'calendar'],
          ['completed', 'completed', 'check'], ['assigned', 'assigned', 'user'], ['report', 'taskReport', 'inbox'],
        ] as const).map(([key, label, icon]) => <button key={key} className={`nav-button${view === key ? ' active' : ''}`} aria-current={view === key ? 'page' : undefined} onClick={() => changeContext(scope, key)}><Icon name={icon} />{t(label)}{key === 'today' && <span className="nav-count" aria-label={t('taskCount', { count: urgentCount })}>{urgentCount}</span>}</button>)}
      </nav>
      <div className="sidebar-spaces"><p className="eyebrow">{t('spaces')}</p>{(['personal', 'professional'] as Scope[]).map((item) => <button key={item} className={`nav-button${scope === item ? ' active' : ''}`} aria-pressed={scope === item} onClick={() => changeContext(item, view === 'report' ? 'owned' : view)}><Icon name={item === 'personal' ? 'user' : 'inbox'} />{t(item)}</button>)}</div>
      <div className="sidebar-account"><span className="avatar">{(user?.name || user?.email || '').slice(0, 2).toUpperCase()}</span><span>{user?.name}</span><Popover label={t('settings')} trigger={<Icon name="settings" />} className="user-menu"><strong>{user?.name}</strong><p>{user?.email}</p><LanguageSwitch /><button onClick={() => void logout()}><Icon name="logout" />{t('logout')}</button></Popover></div>
    </aside>
    <div className={`workspace-layout${view === 'report' ? ' report-layout' : ''}`}>
    <main id="main" className="workspace">
      <div className="workspace-heading"><div><p className="eyebrow">{t(view === 'report' ? 'taskReport' : view === 'assigned' ? 'assigned' : view === 'today' ? 'today' : view === 'week' ? 'nextSevenDays' : view === 'completed' ? 'completed' : 'overview')}</p><h1>{t('welcome', { name: user?.name.trim().split(/\s+/)[0] || user?.email.split('@')[0] || '' })}</h1><p className="greeting-date">{new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>{view !== 'report' && <button className="button button-primary mobile-new-task" onClick={() => createTask()} disabled={!canCreate}><Icon name="plus" />{t('newTask')}</button>}</div>
      {view !== 'report' && <div className="scope-tabs" role="tablist" aria-label={t('spaces')}>{(['personal', 'professional'] as Scope[]).map((item) => <button key={item} role="tab" aria-selected={scope === item} className={scope === item ? 'scope-tab active' : 'scope-tab'} onClick={() => changeContext(item, view)}>{t(item)}</button>)}</div>}
      {error && !sheet ? <ErrorBanner error={error} onRetry={() => void load()} /> : null}
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label={t('close')}>×</button></div>}
      {!loading && view !== 'report' && query && !viewTasks.some(matches) && <p className="search-empty" role="status">{t('noResults')}</p>}
      {!loading && view !== 'report' && <div className="quadrant-summary">{quadrants.map((quadrant) => {
        const list = grouped[quadrant.key].filter(matches)
        const overdue = list.filter((task) => !task.completed && task.dueDate && dateValue(task.dueDate) < localDay()).length
        return <button key={quadrant.key} className={`summary-card quadrant-${quadrant.key}`} aria-label={t('showQuadrant', { quadrant: t(quadrant.title) })} onClick={() => revealQuadrant(quadrant.key)}><span>{t(quadrant.title)}</span><strong>{list.length}</strong>{overdue > 0 && <small>{t(overdue === 1 ? 'overdueCountOne' : 'overdueCount', { count: overdue })}</small>}</button>
      })}</div>}
      {loading ? <Spinner label={t('loading')} /> : view === 'report' ? <TaskReport tasks={tasks} userId={user!.id} search={search} onClearSearch={() => setSearch('')} onToggle={toggle} quadrants={quadrants} /> : view === 'assigned' && activeTasks.length === 0 ? <div className="empty-state"><Icon name="inbox" /><p>{t('emptyAssigned')}</p></div> : <div className="matrix-grid">{quadrants.map((quadrant, quadrantIndex) => {
        const visible = grouped[quadrant.key].filter(matches)
        const isCollapsed = !query && (collapsed[quadrant.key] ?? (!desktop && visible.length === 0)) && dropTarget !== quadrant.key
        const overdue = visible.filter((task) => !task.completed && task.dueDate && dateValue(task.dueDate) < localDay()).length
        return <section id={`quadrant-${quadrant.key}`} className={`quadrant quadrant-${quadrant.key}${dropTarget === quadrant.key ? ' drop-target' : ''}${isCollapsed ? ' is-collapsed' : ''}`} key={quadrant.key} aria-labelledby={`heading-${quadrant.key}`}
          onDragOver={(event) => {
            if (dragged && canCreate) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(quadrant.key) }
          }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null) }}
          onDrop={(event) => {
            event.preventDefault()
            const task = tasks.find((item) => item.id === dragged)
            setDragged(null); setDropTarget(null)
            if (task) void moveTo(task, quadrant.key)
          }}>
          <div className="quadrant-heading"><button className="quadrant-toggle" aria-expanded={!isCollapsed} aria-controls={`body-${quadrant.key}`} onClick={() => setCollapsed((current) => ({ ...current, [quadrant.key]: !isCollapsed }))}><Icon name={['bolt', 'calendar', 'user', 'trash'][quadrantIndex]} /><span><h2 id={`heading-${quadrant.key}`}>{t(quadrant.title)}</h2><span className="quadrant-hint">{t(quadrant.hint)}</span></span><Icon name={isCollapsed ? 'down' : 'up'} /></button><span className="task-count" aria-label={t('taskCount', { count: visible.length })}>{visible.length}</span>{overdue > 0 && <span className="quadrant-overdue">{t(overdue === 1 ? 'overdueCountOne' : 'overdueCount', { count: overdue })}</span>}{canCreate && <button className="icon-button quadrant-add" aria-label={`${t('addTask')}: ${t(quadrant.title)}`} onClick={() => createTask(quadrant.key)}><Icon name="plus" /></button>}</div>
          <div id={`body-${quadrant.key}`} className={`quadrant-body${isCollapsed ? ' collapsed' : ''}`}>
          {shouldWarnTaskCount(grouped[quadrant.key].length) && <div className="limit-warning" role="status">⚠ {t('tooManyTasks')}</div>}
          {quadrant.key === 'not-urgent-important' && view !== 'completed' && scheduleDue.length > 0 && <div className="schedule-warning"><span>{t(scheduleDue.length === 1 ? 'scheduleWarningOne' : 'scheduleWarning', { count: scheduleDue.length })}</span>{scheduleDue.some(canOwn) && <button disabled={bulkMoving} onClick={() => void moveScheduleDue()}>{t('moveToNow')}</button>}</div>}
          <div className="task-list">{visible.map((task) => <TaskCard key={task.id} task={task} selected={task.id === selectedId} canEdit={canOwn(task)} onSelect={() => setSelectedId(task.id)} onActions={() => openActions(task)} onEdit={() => setEditing(task)} onToggle={() => void toggle(task)} onDragStart={() => setDragged(task.id)} onDragEnd={() => { setDragged(null); setDropTarget(null) }} />)}
            {visible.length === 0 && <div className="empty-quadrant"><Icon name={['bolt', 'calendar', 'user', 'trash'][quadrantIndex]} /><p>{t(dropTarget === quadrant.key ? 'dropHere' : query ? 'noResults' : 'emptyQuadrant')}</p>{canCreate && !query && <small>{t('dragHint')}</small>}</div>}
          </div>
          {canCreate && <button className="quadrant-footer" onClick={() => createTask(quadrant.key)}><Icon name="plus" />{t('addTask')}</button>}
          </div>
        </section>
      })}</div>}
    </main>
    {view !== 'report' && <aside className="task-details" aria-label={t('taskDetails')}>{selected ? <><div className="detail-heading"><h2>{t('taskDetails')}</h2><button className="icon-button" aria-label={t('close')} onClick={() => setSelectedId(null)}><Icon name="close" /></button></div>{detailContent(selected)}</> : <div className="details-placeholder"><Icon name="inbox" /><p>{t('selectTask')}</p></div>}</aside>}
    </div>
    {sheet && <ActionSheet title={sheet.title} onClose={() => setSheetId(null)}>{error ? <ErrorBanner error={error} /> : null}{detailContent(sheet)}</ActionSheet>}
    {editing !== undefined && <TaskDialog task={editing} initialQuadrant={newQuadrant} onClose={() => setEditing(undefined)} onSave={saveTask} />}
  </div>
}

function TaskCard({ task, selected, canEdit, onSelect, onActions, onEdit, onToggle, onDragStart, onDragEnd }: { task: Task; selected: boolean; canEdit: boolean; onSelect: () => void; onActions: () => void; onEdit: () => void; onToggle: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  const { t, locale } = useI18n()
  const [swiped, setSwiped] = useState(false)
  const touch = useRef<{ x: number; y: number; vertical: boolean } | null>(null)
  const suppressClick = useRef(false)
  const relative = task.dueDate ? relativeDueDate(task.dueDate) : null
  const overdue = !task.completed && relative === 'overdue'
  return <article className={`task-card${task.completed ? ' completed' : ''}${selected ? ' selected' : ''}${swiped ? ' swiped' : ''}`} aria-label={task.title} tabIndex={0} draggable={canEdit}
    onClick={(event) => {
      if (suppressClick.current) { suppressClick.current = false; return }
      if (!(event.target as Element).closest('button, input, select')) onSelect()
    }}
    onKeyDown={(event) => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect() }
    }}
    onTouchStart={(event) => {
      suppressClick.current = false
      if (event.touches.length !== 1 || (event.target as Element).closest('button, input, select')) { touch.current = null; return }
      touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, vertical: false }
    }}
    onTouchMove={(event) => {
      if (!touch.current || event.touches.length !== 1) { touch.current = null; return }
      const dx = event.touches[0].clientX - touch.current.x
      const dy = event.touches[0].clientY - touch.current.y
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) touch.current.vertical = true
    }}
    onTouchCancel={() => { touch.current = null }}
    onTouchEnd={(event) => {
      const start = touch.current
      touch.current = null
      if (!start || start.vertical || !event.changedTouches.length) return
      const dx = event.changedTouches[0].clientX - start.x
      const dy = event.changedTouches[0].clientY - start.y
      if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      suppressClick.current = true
      if (dx > 0) { setSwiped(false); if (!task.completed) onToggle() }
      else if (canEdit) setSwiped(true)
    }}
    onDragStart={(event) => {
    if (!canEdit || (event.target as Element).closest('button, summary, select, input')) { event.preventDefault(); return }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', task.id)
    onDragStart()
  }} onDragEnd={onDragEnd}>
    <div className="task-card-main"><button className="check-button" aria-label={task.completed ? t('reopen') : t('complete')} aria-pressed={task.completed} onClick={onToggle}>{task.completed && <Icon name="check" />}</button>
      <div className="task-copy"><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}
        <div className="task-meta">
          {task.dueDate && <span className={overdue ? 'due overdue' : 'due'} title={dateValue(task.dueDate)}><Icon name="calendar" /><time dateTime={dateValue(task.dueDate)}>{relative && !task.completed ? t(relative) : new Date(`${dateValue(task.dueDate)}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</time></span>}
          {task.assignee?.email && <span title={`${t('assignedTo')}: ${task.assignee.email}`}><Icon name="user" />{task.assignee.name || task.assignee.email.split('@')[0]}</span>}
        </div>
      </div>
      <div className="task-actions">
        {canEdit && <button className="quick-edit" onClick={onEdit} aria-label={t('edit')}><Icon name="edit" /></button>}
        <button className="icon-button task-more" aria-label={t('taskActions', { title: task.title })} onClick={onActions}><Icon name="more" /></button>
      </div>
    </div>
    {swiped && canEdit && <div className="swipe-actions"><button onClick={() => { setSwiped(false); onActions() }}><Icon name="calendar" />{t('postpone')}</button><button onClick={() => { setSwiped(false); onActions() }}><Icon name="grid" />{t('move')}</button></div>}
  </article>
}

function TaskDetails({ task, canEdit, onToggle, onMoveTo, onPostpone, onEdit, onDelete, onMove, canMoveUp, canMoveDown }: { task: Task; canEdit: boolean; onToggle: () => void; onMoveTo: (quadrant: Quadrant) => void; onPostpone: (day: string) => void; onEdit: () => void; onDelete: () => void; onMove: (direction: -1 | 1) => void; canMoveUp: boolean; canMoveDown: boolean }) {
  const { t, locale } = useI18n()
  return <div className="task-detail-content">
    <h3>{task.title}</h3>
    <p className="detail-notes">{task.description || t('noDescription')}</p>
    <p className={`detail-quadrant quadrant-${task.quadrant}`}>{t(quadrants.find((quadrant) => quadrant.key === task.quadrant)!.title)}</p>
    <p className="detail-date"><Icon name="calendar" />{task.dueDate ? <time dateTime={dateValue(task.dueDate)}>{new Date(`${dateValue(task.dueDate)}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}</time> : t('noDueDate')}</p>
    {task.owner?.email && <p className="owner-detail">{t('assignedBy')}: {task.owner.email}</p>}
    {task.assignee?.email && <p className="owner-detail">{t('assignedTo')}: {task.assignee.email}</p>}
    <button className="button button-secondary" onClick={onToggle}><Icon name="check" />{task.completed ? t('reopen') : t('complete')}</button>
    {canEdit ? <div className="detail-actions">
      <h4>{t('moveTo')}</h4>
      <div className="quadrant-actions">{quadrants.map((quadrant) => <button className={`quadrant-${quadrant.key}`} key={quadrant.key} aria-pressed={task.quadrant === quadrant.key} onClick={() => onMoveTo(quadrant.key)}>{task.quadrant === quadrant.key && <Icon name="check" />}{t(quadrant.title)}</button>)}</div>
      <h4>{t('postpone')}</h4>
      <div className="postpone-actions"><button onClick={() => onPostpone(addDays(localDay(), 1))}>{t('tomorrow')}</button><button onClick={() => onPostpone(nextMonday())}>{t('nextMonday')}</button></div>
      <label className="postpone-date">{t('chooseDate')}<input type="date" value={dateValue(task.dueDate)} onChange={(event) => onPostpone(event.target.value)} /></label>
      <div className="detail-order"><button disabled={!canMoveUp} onClick={() => onMove(-1)}><Icon name="up" />{t('moveUp')}</button><button disabled={!canMoveDown} onClick={() => onMove(1)}><Icon name="down" />{t('moveDown')}</button></div>
      <div className="detail-edit"><button onClick={onEdit}><Icon name="edit" />{t('edit')}</button><button className="danger-action" onClick={onDelete}><Icon name="trash" />{t('delete')}</button></div>
    </div> : <p className="readonly-note">{t('assignedReadOnly')}</p>}
  </div>
}

function ActionSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const opener = document.activeElement as HTMLElement | null
    dialog.showModal()
    dialog.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { dialog.close(); if (opener?.isConnected) opener.focus() }
  }, [])
  return <dialog ref={ref} className="action-sheet" aria-label={t('taskActions', { title })} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="sheet-heading"><h2>{t('taskDetails')}</h2><button className="icon-button" onClick={onClose} aria-label={t('close')}><Icon name="close" /></button></div>
    {children}
  </dialog>
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
