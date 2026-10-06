import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { I18nProvider } from './contexts/I18nContext'
import { api } from './lib/api'
import { addDays, localDay, nextMonday } from './lib/task-utils'

const { logout, currentUser } = vi.hoisted(() => ({ logout: vi.fn(), currentUser: { id: 'owner', name: 'Juan', email: 'juan@example.com' } }))
vi.mock('./contexts/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, loading: false, logout }),
}))
vi.mock('./lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/api')>(),
  api: vi.fn(),
}))

const firstTask = {
  id: 'first', title: 'Fix service', description: 'Review the error rate',
  matrix: 'PERSONAL', urgent: true, important: true, status: 'PENDING',
  position: 0, ownerId: 'owner', owner: { id: 'owner', email: 'juan@example.com' },
  assignedTo: { id: 'other', email: 'ana@example.com' }, dueDate: '2020-01-02T23:59:59.000Z',
}
const secondTask = { ...firstTask, id: 'second', title: 'Plan release', description: null, urgent: false, position: 4, dueDate: null }
const completedTask = { ...firstTask, id: 'completed', title: 'Finished cleanup', status: 'COMPLETED', urgent: false, important: false, completedAt: '2026-06-15T12:00:00.000Z' }
const assignedCompletedTask = { ...completedTask, id: 'assigned-completed', title: 'Finished work', matrix: 'WORK', important: true, ownerId: 'other', owner: { id: 'other', email: 'ana@example.com' }, assignedTo: { id: 'owner', email: 'juan@example.com' }, completedAt: '2026-06-16T12:00:00.000Z' }
const request = vi.mocked(api)

beforeAll(() => {
  // jsdom does not implement the native dialog lifecycle.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  vi.clearAllMocks()
  currentUser.name = 'Juan'
  localStorage.setItem('locale', 'en')
  request.mockResolvedValue({ tasks: [firstTask, secondTask] })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

async function renderApp() {
  render(<I18nProvider><App /></I18nProvider>)
  await screen.findByRole('article', { name: firstTask.title })
  return userEvent.setup()
}

describe('compact task workspace', () => {
  it('excludes completed tasks from every quadrant, counts, search and notifications', async () => {
    const completed = [
      { ...completedTask, id: 'done-now', urgent: true, important: true },
      { ...completedTask, id: 'done-schedule', important: true },
      { ...completedTask, id: 'done-delegate', urgent: true },
      completedTask,
    ]
    request.mockResolvedValueOnce({ tasks: [firstTask, ...completed] })
    const user = await renderApp()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: 'Eliminate' })).getByLabelText('0 tasks')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Notifications'))
    expect(screen.queryByRole('button', { name: /Finished cleanup/ })).not.toBeInTheDocument()
    await user.type(screen.getByRole('searchbox'), completedTask.title)
    expect(screen.getByRole('status')).toHaveTextContent('No tasks match your search.')
  })

  it('moves a completed task out of Eliminate into the report and reopens in its original quadrant', async () => {
    let saved = { ...firstTask, urgent: false, important: false, completedAt: null as string | null }
    request.mockImplementation(async (_path, options) => {
      if (options?.method === 'PATCH') {
        const status = (options.body as { status: string }).status
        saved = { ...saved, status, completedAt: status === 'COMPLETED' ? '2026-06-15T12:00:00.000Z' : null }
        return { task: saved }
      }
      return { tasks: [saved] }
    })
    const user = await renderApp()
    await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Complete' }))
    await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())
    expect(within(screen.getByRole('region', { name: 'Eliminate' })).getByLabelText('0 tasks')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Task report' }))
    expect(await screen.findByRole('heading', { name: firstTask.title })).toBeInTheDocument()
    expect(request).toHaveBeenLastCalledWith('/tasks?scope=all')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('completed')
    await user.click(screen.getByRole('button', { name: 'Reopen' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('0 matching tasks'))
    expect(request).toHaveBeenLastCalledWith('/tasks/first', { method: 'PATCH', body: { status: 'PENDING' } })
    await user.click(screen.getByRole('button', { name: 'Matrix' }))
    expect(await within(screen.getByRole('region', { name: 'Eliminate' })).findByRole('article', { name: firstTask.title })).toBeInTheDocument()
  })

  it('keeps a task visible when completion fails', async () => {
    const user = await renderApp()
    request.mockRejectedValueOnce(new Error('Offline'))
    await user.click(within(screen.getByRole('article', { name: firstTask.title })).getByRole('button', { name: 'Complete' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: firstTask.title })).toBeInTheDocument()
  })

  it('closes the mobile navigation with Escape, outside interaction or a selection', async () => {
    const user = await renderApp()
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    await user.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(menu).toHaveFocus()
    await user.click(menu)
    await user.click(screen.getByRole('heading', { name: 'Hello, Juan' }))
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    await user.click(menu)
    await user.click(screen.getByRole('button', { name: 'Task report' }))
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Task report' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows compact metadata without priority and an unchecked pending task', async () => {
    await renderApp()
    const card = within(screen.getByRole('article', { name: firstTask.title }))
    expect(card.queryByText('High')).not.toBeInTheDocument()
    expect(card.getByText('Overdue')).toBeInTheDocument()
    expect(card.getByText('ana')).toHaveAttribute('title', 'Assigned to: ana@example.com')
    expect(card.getByRole('button', { name: 'Complete' })).toHaveAttribute('aria-pressed', 'false')
    expect(card.getByRole('button', { name: 'Complete' }).querySelector('svg')).toBeNull()
    expect(card.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Do now' })).toHaveTextContent('1')
  })

  describe('task report', () => {
    async function openReport(tasks = [firstTask, completedTask, assignedCompletedTask]) {
      const user = await renderApp()
      request.mockResolvedValueOnce({ tasks })
      await user.click(screen.getByRole('button', { name: 'Task report' }))
      await screen.findByRole('heading', { name: completedTask.title })
      return user
    }

    it('defaults to completed tasks across both matrices, sorts newest first and shows completion dates', async () => {
      await openReport()
      const rows = screen.getAllByRole('listitem')
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveTextContent(assignedCompletedTask.title)
      expect(rows[1]).toHaveTextContent(completedTask.title)
      expect(rows[1].querySelector(`time[datetime="${completedTask.completedAt}"]`)).not.toBeNull()
      expect(screen.queryByRole('heading', { name: firstTask.title })).not.toBeInTheDocument()
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'New task N' })).toBeInTheDocument()
    })

    it('combines matrix, relationship, quadrant and search filters and resets them', async () => {
      const user = await openReport()
      await user.selectOptions(screen.getByRole('combobox', { name: 'Matrix' }), 'professional')
      await user.selectOptions(screen.getByRole('combobox', { name: 'Relationship' }), 'assigned')
      await user.selectOptions(screen.getByRole('combobox', { name: 'Quadrant' }), 'not-urgent-important')
      await user.type(screen.getByRole('searchbox'), 'finished WORK')
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
      expect(screen.getByRole('listitem')).toHaveTextContent(assignedCompletedTask.title)
      await user.selectOptions(screen.getByRole('combobox', { name: 'Relationship' }), 'owned')
      expect(screen.getByText('No tasks match the filters.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Reset filters' }))
      expect(screen.getByRole('searchbox')).toHaveValue('')
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
      expect(request).toHaveBeenCalledTimes(2)
    })

    it('filters pending and all statuses, and searches owner email', async () => {
      const user = await openReport()
      await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'pending')
      expect(screen.getByRole('listitem')).toHaveTextContent(firstTask.title)
      await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'all')
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      await user.type(screen.getByRole('searchbox'), 'juan@example.com')
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
    })

    it('uses inclusive completion dates, excludes missing dates and validates inverted ranges', async () => {
      const withoutDate = { ...completedTask, id: 'legacy', title: 'Legacy completion', completedAt: null }
      await openReport([completedTask, assignedCompletedTask, withoutDate])
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      fireEvent.change(screen.getByLabelText('Completed from'), { target: { value: '2026-06-15' } })
      fireEvent.change(screen.getByLabelText('Completed through'), { target: { value: '2026-06-15' } })
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
      expect(screen.getByRole('listitem')).toHaveTextContent(completedTask.title)
      fireEvent.change(screen.getByLabelText('Completed from'), { target: { value: '2026-06-16' } })
      expect(screen.getByRole('alert')).toHaveTextContent('The start date cannot be after the end date.')
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Completed from')).toHaveAttribute('aria-invalid', 'true')
    })

    it('allows assignees to reopen without exposing owner-only actions and retains failed updates', async () => {
      const user = await openReport()
      await user.selectOptions(screen.getByRole('combobox', { name: 'Relationship' }), 'assigned')
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
      request.mockRejectedValueOnce(new Error('Offline'))
      await user.click(screen.getByRole('button', { name: 'Reopen' }))
      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('listitem')).toHaveTextContent(assignedCompletedTask.title)
      expect(screen.getByRole('button', { name: 'Reopen' })).toBeEnabled()
      expect(request).toHaveBeenLastCalledWith('/tasks/assigned-completed', { method: 'PATCH', body: { status: 'PENDING' } })
    })

    it('localizes report labels and filters in Spanish', async () => {
      localStorage.setItem('locale', 'es')
      const user = await renderApp()
      request.mockResolvedValueOnce({ tasks: [completedTask] })
      await user.click(screen.getByRole('button', { name: 'Reporte de tareas' }))
      expect(await screen.findByRole('combobox', { name: 'Estado' })).toHaveValue('completed')
      expect(screen.getByRole('button', { name: 'Reabrir' })).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('1 tareas encontradas')
    })
  })

  it('focuses search with either shortcut, filters and clears without changing tasks', async () => {
    const user = await renderApp()
    const search = screen.getByRole('searchbox')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await waitFor(() => expect(search).toHaveFocus())
    await user.type(search, 'release')
    expect(screen.queryByRole('article', { name: firstTask.title })).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: secondTask.title })).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'nothing matches')
    expect(screen.getByRole('status')).toHaveTextContent('No tasks match your search.')
    await user.keyboard('{Escape}')
    expect(screen.getAllByRole('article')).toHaveLength(2)
    fireEvent.keyDown(window, { key: 'K', metaKey: true })
    await waitFor(() => expect(search).toHaveFocus())
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('opens a native action sheet and restores focus on dismissal', async () => {
    const user = await renderApp()
    const trigger = screen.getByLabelText('Actions for Fix service')
    await user.click(trigger)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeVisible()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    await user.click(trigger)
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clears a completed action sheet so N can immediately open a new task', async () => {
    const user = await renderApp()
    await user.click(screen.getByLabelText('Actions for Fix service'))
    request.mockResolvedValueOnce({ task: { ...firstTask, status: 'COMPLETED' } })
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Complete' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.keyDown(window, { key: 'n' })
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeInTheDocument()
  })

  it('clears the sheet when postponing out of Today and restores search shortcuts', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: /^Today/ }))
    await screen.findByRole('article', { name: firstTask.title })
    await user.click(screen.getByLabelText('Actions for Fix service'))
    request.mockResolvedValueOnce({ task: { ...firstTask, dueDate: `${addDays(localDay(), 1)}T23:59:59.000Z` } })
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tomorrow' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus())
  })

  it('moves through the keyboard/touch menu and appends after all destination tasks', async () => {
    const user = await renderApp()
    request.mockResolvedValueOnce({ task: { ...firstTask, urgent: false, position: 5 } })
    await user.click(screen.getByLabelText('Actions for Fix service'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Schedule' }))
    await waitFor(() => expect(request).toHaveBeenLastCalledWith('/tasks/first', {
      method: 'PATCH', body: { urgent: false, important: true, position: 5 },
    }))
    expect(within(screen.getByRole('region', { name: 'Schedule' })).getAllByRole('article')).toHaveLength(2)
  })

  it('persists a drag between quadrants and does not move twice to the same quadrant', async () => {
    await renderApp()
    request.mockResolvedValueOnce({ task: { ...firstTask, urgent: false, important: false, position: 0 } })
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    const target = screen.getByRole('region', { name: 'Eliminate' })
    fireEvent.dragStart(screen.getByRole('article', { name: firstTask.title }), { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    expect(target).toHaveClass('drop-target')
    fireEvent.drop(target, { dataTransfer })
    await waitFor(() => expect(within(target).getByRole('article', { name: firstTask.title })).toBeInTheDocument())
    expect(request).toHaveBeenLastCalledWith('/tasks/first', { method: 'PATCH', body: { urgent: false, important: false, position: 0 } })
    expect(target).not.toHaveClass('drop-target')
    fireEvent.dragStart(within(target).getByRole('article'), { dataTransfer })
    fireEvent.drop(target, { dataTransfer })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('keeps the original quadrant and displays an error when a move fails', async () => {
    const user = await renderApp()
    request.mockRejectedValueOnce(new Error('Move failed'))
    await user.click(screen.getByLabelText('Actions for Fix service'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delegate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(within(screen.getByRole('region', { name: 'Do now' })).getByRole('article')).toBeInTheDocument()
  })

  it('reorders the full quadrant even when search hides other tasks', async () => {
    const thirdTask = { ...firstTask, id: 'third', title: 'Other work', position: 1 }
    request.mockResolvedValueOnce({ tasks: [firstTask, thirdTask] })
    const user = await renderApp()
    await user.type(screen.getByRole('searchbox'), 'Fix')
    await user.click(screen.getByLabelText('Actions for Fix service'))
    request.mockResolvedValueOnce(undefined)
    await user.click(screen.getByRole('button', { name: 'Move down' }))
    expect(request).toHaveBeenLastCalledWith('/tasks/reorder/batch', { method: 'POST', body: { items: [{ id: 'third', position: 0 }, { id: 'first', position: 1 }] } })
  })

  it('disables positional reordering across different due dates', async () => {
    const later = { ...firstTask, id: 'later', title: 'Later work', dueDate: '2020-01-03T23:59:59.000Z', position: 1 }
    request.mockResolvedValueOnce({ tasks: [firstTask, later] })
    const user = await renderApp()
    await user.click(screen.getByLabelText('Actions for Fix service'))
    expect(screen.getByRole('button', { name: 'Move down' })).toBeDisabled()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    await user.click(screen.getByLabelText('Actions for Later work'))
    expect(screen.getByRole('button', { name: 'Move up' })).toBeDisabled()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('preserves positional reordering between undated tasks', async () => {
    const undated = { ...firstTask, dueDate: null }
    const next = { ...undated, id: 'next', title: 'Next work', position: 1 }
    request.mockResolvedValueOnce({ tasks: [undated, next] })
    const user = await renderApp()
    await user.click(screen.getByLabelText('Actions for Fix service'))
    request.mockResolvedValueOnce(undefined)
    await user.click(screen.getByRole('button', { name: 'Move down' }))
    expect(request).toHaveBeenLastCalledWith('/tasks/reorder/batch', { method: 'POST', body: { items: [{ id: 'next', position: 0 }, { id: 'first', position: 1 }] } })
  })

  it('limits assignees to completion, without drag, edit, delete or category changes', async () => {
    const user = await renderApp()
    const assignedTask = { ...firstTask, ownerId: 'someone-else' }
    request.mockResolvedValueOnce({ tasks: [assignedTask] })
    await user.click(screen.getByRole('button', { name: 'Assigned to me' }))
    const card = await screen.findByRole('article', { name: firstTask.title })
    expect(card).toHaveAttribute('draggable', 'false')
    expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
    await user.click(screen.getByLabelText('Actions for Fix service'))
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Move to' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText(firstTask.description)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tomorrow' })).not.toBeInTheDocument()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    fireEvent.drop(screen.getByRole('region', { name: 'Schedule' }), { dataTransfer: { getData: () => 'first' } })
    expect(request).toHaveBeenCalledTimes(2)
    request.mockResolvedValueOnce({ task: { ...assignedTask, status: 'COMPLETED' } })
    await user.click(within(card).getByRole('button', { name: 'Complete', pressed: false }))
    await waitFor(() => expect(request).toHaveBeenLastCalledWith('/tasks/first', { method: 'PATCH', body: { status: 'COMPLETED' } }))
  })

  it('shows only pending due notifications from the current view and supports logout', async () => {
    const user = await renderApp()
    await user.click(screen.getByLabelText('Notifications'))
    expect(screen.getByRole('heading', { name: 'Due dates in this view' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Fix service Overdue/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Plan release/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Fix service Overdue/ }))
    expect(screen.getByRole('searchbox')).toHaveValue('Fix service')
    await user.click(screen.getByLabelText('Settings'))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('creates in the chosen empty quadrant and automatically dismisses the toast', async () => {
    const user = await renderApp()
    await user.click(within(screen.getByRole('region', { name: 'Delegate' })).getByRole('button', { name: 'Add task: Delegate' }))
    const dialog = screen.getByRole('dialog', { name: 'New task' })
    expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveFocus()
    expect(within(dialog).getByRole('combobox', { name: 'Move to' })).toHaveValue('urgent-not-important')
    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Delegate review')
    request.mockResolvedValueOnce({ task: { ...firstTask, id: 'created', title: 'Delegate review', important: false } })
    vi.useFakeTimers()
    fireEvent.submit(dialog.querySelector('form')!)
    await act(async () => {})
    expect(request).toHaveBeenLastCalledWith('/tasks', { method: 'POST', body: {
      title: 'Delegate review', description: null, matrix: 'PERSONAL', urgent: true, important: false, dueDate: null, assignedToId: null,
    } })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Task saved.')
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the modal and form values available after a failed save', async () => {
    const user = await renderApp()
    await user.click(within(screen.getByRole('article', { name: firstTask.title })).getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit task' })
    request.mockRejectedValueOnce(new Error('Save failed'))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveValue(firstTask.title)
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('localizes the new controls and dates in Spanish', async () => {
    localStorage.setItem('locale', 'es')
    await renderApp()
    expect(screen.getByRole('searchbox', { name: 'Buscar en esta vista…' })).toBeInTheDocument()
    expect(screen.queryByText('Alta')).not.toBeInTheDocument()
    const card = within(screen.getByRole('article', { name: firstTask.title }))
    expect(card.getByText('Vencida')).toBeInTheDocument()
    expect(card.getByText('Vencida').closest('time')).toHaveAttribute('datetime', '2020-01-02')
    expect(screen.getAllByText('1 vencida')).toHaveLength(2)
    expect(screen.queryByText('1 vencidas')).not.toBeInTheDocument()
  })

  it('greets the real first name, displays the local weekday and keeps language in settings', async () => {
    currentUser.name = 'María Elena'
    const user = await renderApp()
    expect(screen.getByRole('heading', { name: 'Hello, María' })).toBeInTheDocument()
    expect(screen.getByText(new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' }))).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Settings'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'es')
    expect(screen.getByRole('heading', { name: 'Hola, María' })).toBeInTheDocument()
  })

  it('provides language and sign out inside the mobile avatar menu', async () => {
    const user = await renderApp()
    const header = within(screen.getByRole('banner'))
    expect(header.queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument()
    await user.click(header.getByLabelText('User menu'))
    expect(header.getByRole('combobox', { name: 'Language' })).toBeInTheDocument()
    await user.click(header.getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('expands and focuses quadrants from summary cards and collapses headers', async () => {
    const user = await renderApp()
    const delegate = within(screen.getByRole('region', { name: 'Delegate' }))
    const toggle = delegate.getByRole('button', { name: /Delegate Urgent/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByRole('button', { name: 'Show Delegate' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveFocus()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('selects task details with the keyboard and postpones/moves inline without a dialog', async () => {
    const user = await renderApp()
    const row = screen.getByRole('article', { name: firstTask.title })
    row.focus()
    await user.keyboard('{Enter}')
    const panel = within(screen.getByRole('complementary', { name: 'Task details' }))
    expect(panel.getByText(firstTask.description)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const tomorrow = addDays(localDay(), 1)
    request.mockResolvedValueOnce({ task: { ...firstTask, dueDate: `${tomorrow}T23:59:59.000Z` } })
    await user.click(panel.getByRole('button', { name: 'Tomorrow' }))
    expect(request).toHaveBeenLastCalledWith('/tasks/first', { method: 'PATCH', body: { dueDate: `${tomorrow}T23:59:59.000Z` } })
    request.mockResolvedValueOnce({ task: { ...firstTask, urgent: false, position: 5 } })
    await user.click(panel.getByRole('button', { name: 'Schedule' }))
    await waitFor(() => expect(panel.getByRole('button', { name: 'Schedule' })).toHaveAttribute('aria-pressed', 'true'))
    await user.click(screen.getByRole('tab', { name: 'Professional' }))
    expect(panel.queryByText(firstTask.description)).not.toBeInTheDocument()
    expect(request).toHaveBeenLastCalledWith('/tasks?matrix=WORK&scope=owned')
  })

  it('disables conflicting controls per task while postponing and reenables them after success', async () => {
    const user = await renderApp()
    const row = screen.getByRole('article', { name: firstTask.title })
    await user.click(row)
    const panel = within(screen.getByRole('complementary', { name: 'Task details' }))
    let resolvePatch!: (value: unknown) => void
    request.mockImplementationOnce(() => new Promise((resolve) => { resolvePatch = resolve }))
    await user.click(panel.getByRole('button', { name: 'Tomorrow' }))
    expect(panel.getByRole('group', { name: 'Actions for Fix service' })).toHaveAttribute('aria-busy', 'true')
    expect(panel.getByRole('button', { name: 'Schedule' })).toBeDisabled()
    expect(panel.getByLabelText('Choose date')).toBeDisabled()
    expect(panel.getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(panel.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(within(row).getByRole('button', { name: 'Complete' })).toBeDisabled()
    expect(within(row).getByRole('button', { name: 'Actions for Fix service' })).toBeDisabled()
    expect(row).toHaveAttribute('draggable', 'false')
    expect(within(screen.getByRole('article', { name: secondTask.title })).getByRole('button', { name: 'Complete' })).toBeEnabled()
    await user.click(panel.getByRole('button', { name: 'Schedule' }))
    expect(request).toHaveBeenCalledTimes(2)

    const dueDate = `${addDays(localDay(), 1)}T23:59:59.000Z`
    await act(async () => { resolvePatch({ task: { ...firstTask, dueDate } }) })
    expect(panel.getByRole('group', { name: 'Actions for Fix service' })).toHaveAttribute('aria-busy', 'false')
    expect(panel.getByRole('button', { name: 'Schedule' })).toBeEnabled()
    expect(panel.getByLabelText('Choose date')).toBeEnabled()
    expect(row).toHaveAttribute('draggable', 'true')
    request.mockResolvedValueOnce({ task: { ...firstTask, dueDate, urgent: false, position: 5 } })
    await user.click(panel.getByRole('button', { name: 'Schedule' }))
    expect(request).toHaveBeenLastCalledWith('/tasks/first', { method: 'PATCH', body: { urgent: false, important: true, position: 5 } })
    expect(panel.getByLabelText('Choose date')).toHaveValue(dueDate.slice(0, 10))
  })

  it('disables custom-date edits in the sheet until a failed request settles and allows retry', async () => {
    const user = await renderApp()
    await user.click(screen.getByLabelText('Actions for Fix service'))
    const sheet = within(screen.getByRole('dialog'))
    let rejectPatch!: (reason: unknown) => void
    request.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPatch = reject }))
    fireEvent.change(sheet.getByLabelText('Choose date'), { target: { value: '2027-01-01' } })
    expect(sheet.getByLabelText('Choose date')).toBeDisabled()
    expect(sheet.getByRole('button', { name: 'Tomorrow' })).toBeDisabled()
    expect(sheet.getByRole('button', { name: 'Schedule' })).toBeDisabled()
    expect(sheet.getByRole('group', { name: 'Actions for Fix service' })).toHaveAttribute('aria-busy', 'true')
    await user.click(sheet.getByRole('button', { name: 'Tomorrow' }))
    expect(request).toHaveBeenCalledTimes(2)
    await act(async () => { rejectPatch(new Error('Offline')) })
    expect(sheet.getByRole('alert')).toBeInTheDocument()
    expect(sheet.getByLabelText('Choose date')).toBeEnabled()
    expect(sheet.getByRole('button', { name: 'Schedule' })).toBeEnabled()
    expect(sheet.getByRole('group', { name: 'Actions for Fix service' })).toHaveAttribute('aria-busy', 'false')
    request.mockResolvedValueOnce({ task: { ...firstTask, dueDate: '2027-02-02T23:59:59.000Z' } })
    fireEvent.change(sheet.getByLabelText('Choose date'), { target: { value: '2027-02-02' } })
    await waitFor(() => expect(sheet.getByLabelText('Choose date')).toBeEnabled())
    expect(request).toHaveBeenLastCalledWith('/tasks/first', { method: 'PATCH', body: { dueDate: '2027-02-02T23:59:59.000Z' } })
    expect(sheet.getByLabelText('Choose date')).toHaveValue('2027-02-02')
  })

  it('opens inline details rather than a sheet from desktop actions at 1100px', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('matchMedia', matchMedia)
    const user = await renderApp()
    await user.click(screen.getByLabelText('Actions for Fix service'))
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 1100px)')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(screen.getByRole('complementary', { name: 'Task details' })).getByText(firstTask.description)).toBeInTheDocument()
    const empty = within(screen.getByRole('region', { name: 'Delegate' }))
    const toggle = empty.getByRole('button', { name: /Delegate Urgent/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(empty.getByText('Drag tasks here or create a new one.')).toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('offers next Monday and a calendar date from the action sheet, preserving unrelated fields', async () => {
    const user = await renderApp()
    await user.click(screen.getByLabelText('Actions for Fix service'))
    const sheet = within(screen.getByRole('dialog'))
    const monday = nextMonday()
    request.mockResolvedValueOnce({ task: { ...firstTask, dueDate: `${monday}T23:59:59.000Z` } })
    await user.click(sheet.getByRole('button', { name: 'Next Monday' }))
    expect(request).toHaveBeenLastCalledWith('/tasks/first', { method: 'PATCH', body: { dueDate: `${monday}T23:59:59.000Z` } })
    request.mockResolvedValueOnce({ task: { ...firstTask, dueDate: '2027-01-01T23:59:59.000Z' } })
    fireEvent.change(sheet.getByLabelText('Choose date'), { target: { value: '2027-01-01' } })
    await waitFor(() => expect(request).toHaveBeenLastCalledWith('/tasks/first', { method: 'PATCH', body: { dueDate: '2027-01-01T23:59:59.000Z' } }))
  })

  it('filters Today, Next 7 days and Completed while clearing the selection', async () => {
    const tomorrowTask = { ...secondTask, dueDate: `${addDays(localDay(), 1)}T23:59:59.000Z` }
    request.mockResolvedValue({ tasks: [firstTask, tomorrowTask, completedTask] })
    const user = await renderApp()
    await user.click(screen.getByRole('article', { name: firstTask.title }))
    await user.click(screen.getByRole('button', { name: /^Today/ }))
    expect(await screen.findByRole('article', { name: firstTask.title })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: secondTask.title })).not.toBeInTheDocument()
    expect(screen.getByText('Select a task to see its details.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next 7 days' }))
    expect(await screen.findByRole('article', { name: secondTask.title })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: firstTask.title })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Completed' }))
    expect(await screen.findByRole('article', { name: completedTask.title })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: secondTask.title })).not.toBeInTheDocument()
  })

  it('moves all owner Schedule tasks due today or earlier without locking out other tasks', async () => {
    const today = { ...secondTask, id: 'today', dueDate: `${localDay()}T23:59:59.000Z` }
    const overdue = { ...secondTask, id: 'overdue', dueDate: '2020-01-02T23:59:59.000Z' }
    const tomorrow = { ...secondTask, id: 'tomorrow', dueDate: `${addDays(localDay(), 1)}T23:59:59.000Z` }
    const other = { ...overdue, id: 'other-owner', ownerId: 'someone-else' }
    request.mockResolvedValueOnce({ tasks: [firstTask, today, overdue, tomorrow, other, { ...today, id: 'done', status: 'COMPLETED' }] })
    const user = await renderApp()
    const resolvers: Array<() => void> = []
    request.mockImplementation((path, options) => new Promise((resolve) => {
      const task = path.endsWith('today') ? today : path.endsWith('overdue') ? overdue : firstTask
      resolvers.push(() => resolve({ task: { ...task, ...(options?.body as object) } }))
    }))
    expect(screen.getByText('3 Schedule tasks are due today or overdue.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Move to Do now' }))
    expect(request).toHaveBeenCalledWith('/tasks/today', { method: 'PATCH', body: { urgent: true, important: true, position: 1 } })
    expect(request).toHaveBeenCalledWith('/tasks/overdue', { method: 'PATCH', body: { urgent: true, important: true, position: 2 } })
    expect(request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(2)
    await user.click(within(screen.getByRole('article', { name: firstTask.title })).getByRole('button', { name: 'Complete' }))
    expect(request).toHaveBeenLastCalledWith('/tasks/first', { method: 'PATCH', body: { status: 'COMPLETED' } })
    await act(async () => { resolvers.forEach((resolve) => resolve()) })
    expect(screen.queryByRole('button', { name: 'Move to Do now' })).not.toBeInTheDocument()
    expect(screen.getByText('1 Schedule task is due today or overdue.')).toBeInTheDocument()
  })

  it('ignores stale detail mutation responses after switching spaces', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('article', { name: firstTask.title }))
    let resolvePatch!: (value: unknown) => void
    request.mockImplementationOnce(() => new Promise((resolve) => { resolvePatch = resolve }))
    await user.click(screen.getByRole('button', { name: 'Tomorrow' }))
    request.mockResolvedValueOnce({ tasks: [] })
    await user.click(screen.getByRole('tab', { name: 'Professional' }))
    await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())
    await act(async () => { resolvePatch({ task: { ...firstTask, title: 'Stale response' } }) })
    expect(screen.queryByText('Stale response')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('ignores a stale failed bulk move after switching views', async () => {
    const scheduled = { ...secondTask, dueDate: '2020-01-02T23:59:59.000Z' }
    request.mockResolvedValueOnce({ tasks: [firstTask, scheduled] })
    const user = await renderApp()
    let rejectPatch!: (reason: unknown) => void
    request.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPatch = reject }))
    await user.click(screen.getByRole('button', { name: 'Move to Do now' }))
    request.mockResolvedValueOnce({ tasks: [] })
    await user.click(screen.getByRole('button', { name: 'Completed' }))
    await act(async () => { rejectPatch(new Error('Stale failure')) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('opens new tasks with N only outside editing controls, modifiers and dialogs', async () => {
    const user = await renderApp()
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
      fireEvent.keyDown(window, { key: 'n', [modifier]: true })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
    await user.click(screen.getByRole('searchbox'))
    await user.keyboard('n')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox'))
    screen.getByRole('searchbox').blur()
    fireEvent.keyDown(window, { key: 'n' })
    const dialog = screen.getByRole('dialog', { name: 'New task' })
    expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveFocus()
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'n')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('reveals mobile search with its icon and Cmd/Ctrl K', async () => {
    const user = await renderApp()
    const toggle = screen.getByRole('button', { name: 'Search this view…' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus())
    await user.keyboard('{Escape}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus())
  })

  it('distinguishes vertical scrolling from swipes, reveals actions left and completes right', async () => {
    const user = await renderApp()
    const row = screen.getByRole('article', { name: firstTask.title })
    const start = () => fireEvent.touchStart(row, { touches: [{ clientX: 180, clientY: 100 }] })
    start()
    fireEvent.touchMove(row, { touches: [{ clientX: 185, clientY: 180 }] })
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 280, clientY: 220 }] })
    expect(request).toHaveBeenCalledTimes(1)
    start()
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 80, clientY: 105 }] })
    expect(within(row).getByRole('button', { name: 'Postpone' })).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Move' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    request.mockResolvedValueOnce({ task: { ...firstTask, status: 'COMPLETED' } })
    start()
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 280, clientY: 105 }] })
    await waitFor(() => expect(request).toHaveBeenLastCalledWith('/tasks/first', { method: 'PATCH', body: { status: 'COMPLETED' } }))
  })

  it('allows an assignee right-swipe completion but never left-swipe owner actions', async () => {
    const user = await renderApp()
    const assigned = { ...firstTask, ownerId: 'someone-else' }
    request.mockResolvedValueOnce({ tasks: [assigned] })
    await user.click(screen.getByRole('button', { name: 'Assigned to me' }))
    const row = await screen.findByRole('article', { name: firstTask.title })
    fireEvent.touchStart(row, { touches: [{ clientX: 180, clientY: 100 }] })
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 80, clientY: 100 }] })
    expect(within(row).queryByRole('button', { name: 'Postpone' })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
    request.mockResolvedValueOnce({ task: { ...assigned, status: 'COMPLETED' } })
    fireEvent.touchStart(row, { touches: [{ clientX: 80, clientY: 100 }] })
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 180, clientY: 100 }] })
    await waitFor(() => expect(request).toHaveBeenLastCalledWith('/tasks/first', { method: 'PATCH', body: { status: 'COMPLETED' } }))
  })
})
