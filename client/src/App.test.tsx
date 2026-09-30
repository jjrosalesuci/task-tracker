import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { I18nProvider } from './contexts/I18nContext'
import { api } from './lib/api'

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }))
vi.mock('./contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner', name: 'Juan', email: 'juan@example.com' }, loading: false, logout }),
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
const request = vi.mocked(api)

beforeAll(() => {
  // jsdom does not implement the native dialog lifecycle.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.setItem('locale', 'en')
  request.mockResolvedValue({ tasks: [firstTask, secondTask] })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

async function renderApp() {
  render(<I18nProvider><App /></I18nProvider>)
  await screen.findByRole('article', { name: firstTask.title })
  return userEvent.setup()
}

describe('compact task workspace', () => {
  it('shows compact metadata, explicit priority and an unchecked pending task', async () => {
    await renderApp()
    const card = within(screen.getByRole('article', { name: firstTask.title }))
    expect(card.getByText('High')).toBeInTheDocument()
    expect(card.getByText('ana')).toHaveAttribute('title', 'Assigned to: ana@example.com')
    expect(card.getByRole('button', { name: 'Complete' })).toHaveAttribute('aria-pressed', 'false')
    expect(card.getByRole('button', { name: 'Complete' }).querySelector('svg')).toBeNull()
    expect(card.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Do now' })).toHaveTextContent('1')
  })

  it('focuses search with either shortcut, filters and clears without changing tasks', async () => {
    const user = await renderApp()
    const search = screen.getByRole('searchbox')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(search).toHaveFocus()
    await user.type(search, 'release')
    expect(screen.queryByRole('article', { name: firstTask.title })).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: secondTask.title })).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'nothing matches')
    expect(screen.getByRole('status')).toHaveTextContent('No tasks match your search.')
    await user.keyboard('{Escape}')
    expect(screen.getAllByRole('article')).toHaveLength(2)
    fireEvent.keyDown(window, { key: 'K', metaKey: true })
    expect(search).toHaveFocus()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('opens card actions and dismisses them with Escape and outside clicks', async () => {
    const user = await renderApp()
    const trigger = screen.getByLabelText('Actions for Fix service')
    await user.click(trigger)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    await user.click(trigger)
    await user.click(screen.getByRole('heading', { name: 'Hello, Juan' }))
    expect(trigger.closest('details')).not.toHaveAttribute('open')
  })

  it('moves through the keyboard/touch menu and appends after all destination tasks', async () => {
    const user = await renderApp()
    request.mockResolvedValueOnce({ task: { ...firstTask, urgent: false, position: 5 } })
    await user.click(screen.getByLabelText('Actions for Fix service'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move to' }), 'not-urgent-important')
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move to' }), 'urgent-not-important')
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
    expect(screen.queryByRole('button', { name: /Plan release/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Fix service Overdue/ }))
    expect(screen.getByRole('searchbox')).toHaveValue('Fix service')
    await user.click(screen.getByLabelText('User menu'))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('creates in the chosen empty quadrant and automatically dismisses the toast', async () => {
    const user = await renderApp()
    await user.click(within(screen.getByRole('region', { name: 'Delegate' })).getByRole('button', { name: 'New task' }))
    const dialog = screen.getByRole('dialog', { name: 'New task' })
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
    expect(screen.getByText('Alta')).toBeInTheDocument()
    expect(screen.getByText('2 ene 2020')).toBeInTheDocument()
  })
})
