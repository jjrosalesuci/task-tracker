import { useState } from 'react'
import { useI18n } from '../contexts/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { matchesTaskSearch } from '../lib/task-utils'
import type { Quadrant, Scope, Task } from '../types'

interface Filters {
  status: 'all' | 'completed' | 'pending'
  scope: 'all' | Scope
  relationship: 'all' | 'owned' | 'assigned'
  quadrant: 'all' | Quadrant
  from: string
  until: string
}

const initialFilters: Filters = { status: 'completed', scope: 'all', relationship: 'all', quadrant: 'all', from: '', until: '' }

function completionDay(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function TaskReport({ tasks, userId, search, onClearSearch, onToggle, quadrants }: {
  tasks: Task[]
  userId: string
  search: string
  onClearSearch: () => void
  onToggle: (task: Task) => Promise<void>
  quadrants: { key: Quadrant; title: TranslationKey }[]
}) {
  const { t, locale } = useI18n()
  const [filters, setFilters] = useState(initialFilters)
  const [busyId, setBusyId] = useState<string | null>(null)
  const invalidRange = !!(filters.from && filters.until && filters.from > filters.until)
  const visible = tasks.filter((task) => {
    const day = completionDay(task.completedAt)
    return !invalidRange && matchesTaskSearch(task, search)
      && (filters.status === 'all' || task.completed === (filters.status === 'completed'))
      && (filters.scope === 'all' || task.scope === filters.scope)
      && (filters.relationship === 'all' || (filters.relationship === 'owned' ? task.ownerId === userId : task.assignee?.id === userId))
      && (filters.quadrant === 'all' || task.quadrant === filters.quadrant)
      && (!filters.from || (task.completed && day >= filters.from))
      && (!filters.until || (task.completed && !!day && day <= filters.until))
  }).sort((a, b) => (b.completedAt || b.createdAt || '').localeCompare(a.completedAt || a.createdAt || '') || a.title.localeCompare(b.title))

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  async function toggle(task: Task) {
    if (busyId) return
    setBusyId(task.id)
    try { await onToggle(task) } finally { setBusyId(null) }
  }

  return <section className="task-report" aria-labelledby="report-title">
    <div className="report-heading"><h2 id="report-title">{t('taskReport')}</h2><p>{t('reportHint')}</p></div>
    <form className="report-filters" onSubmit={(event) => event.preventDefault()}>
      <label>{t('status')}<select value={filters.status} onChange={(event) => update('status', event.target.value as Filters['status'])}>
        <option value="completed">{t('completed')}</option><option value="pending">{t('pending')}</option><option value="all">{t('all')}</option>
      </select></label>
      <label>{t('matrix')}<select value={filters.scope} onChange={(event) => update('scope', event.target.value as Filters['scope'])}>
        <option value="all">{t('all')}</option><option value="personal">{t('personal')}</option><option value="professional">{t('professional')}</option>
      </select></label>
      <label>{t('relationship')}<select value={filters.relationship} onChange={(event) => update('relationship', event.target.value as Filters['relationship'])}>
        <option value="all">{t('all')}</option><option value="owned">{t('ownedTasks')}</option><option value="assigned">{t('assigned')}</option>
      </select></label>
      <label>{t('quadrant')}<select value={filters.quadrant} onChange={(event) => update('quadrant', event.target.value as Filters['quadrant'])}>
        <option value="all">{t('all')}</option>{quadrants.map((quadrant) => <option key={quadrant.key} value={quadrant.key}>{t(quadrant.title)}</option>)}
      </select></label>
      <label>{t('completedFrom')}<input type="date" value={filters.from} max={filters.until || undefined} aria-invalid={invalidRange} aria-describedby={invalidRange ? 'report-date-error' : undefined} onChange={(event) => update('from', event.target.value)} /></label>
      <label>{t('completedUntil')}<input type="date" value={filters.until} min={filters.from || undefined} aria-invalid={invalidRange} aria-describedby={invalidRange ? 'report-date-error' : undefined} onChange={(event) => update('until', event.target.value)} /></label>
      <button type="button" className="button button-ghost" onClick={() => { setFilters(initialFilters); onClearSearch() }}>{t('resetFilters')}</button>
    </form>
    {invalidRange && <p id="report-date-error" className="field-error" role="alert">{t('invalidDateRange')}</p>}
    <p role="status">{t('reportResults', { count: visible.length })}</p>
    {visible.length === 0 ? <p className="empty-state">{t('noReportResults')}</p> : <ul className="report-list">
      {visible.map((task) => <li className="report-row" key={task.id}>
        <div className="report-copy">
          <h3>{task.title}</h3>
          {task.description && <p>{task.description}</p>}
          <dl className="report-meta">
            <div><dt>{t('status')}</dt><dd>{t(task.completed ? 'completed' : 'pending')}</dd></div>
            <div><dt>{t('matrix')}</dt><dd>{t(task.scope)}</dd></div>
            <div><dt>{t('quadrant')}</dt><dd>{t(quadrants.find((quadrant) => quadrant.key === task.quadrant)!.title)}</dd></div>
            <div><dt>{t('assignedBy')}</dt><dd>{task.owner?.email || '—'}</dd></div>
            <div><dt>{t('assignedTo')}</dt><dd>{task.assignee?.email || '—'}</dd></div>
            <div><dt>{t('dueDate')}</dt><dd>{task.dueDate ? <time dateTime={task.dueDate.slice(0, 10)}>{new Date(`${task.dueDate.slice(0, 10)}T12:00:00`).toLocaleDateString(locale)}</time> : '—'}</dd></div>
            <div><dt>{t('completedAt')}</dt><dd>{task.completedAt ? <time dateTime={task.completedAt}>{new Date(task.completedAt).toLocaleString(locale)}</time> : '—'}</dd></div>
          </dl>
        </div>
        <button className="button button-ghost" disabled={busyId !== null} onClick={() => void toggle(task)}>{busyId === task.id ? t('loading') : t(task.completed ? 'reopen' : 'complete')}</button>
      </li>)}
    </ul>}
  </section>
}
