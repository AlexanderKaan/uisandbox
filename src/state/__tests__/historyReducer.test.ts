import { describe, it, expect } from 'vitest'
import { historyReducer, initHistory, type HistoryState } from '../historyReducer'
import { DEFAULT_CONFIG } from '../../tokens/defaults'

const start = (): HistoryState => initHistory(DEFAULT_CONFIG)

describe('historyReducer', () => {
  it('records a step and supports undo/redo', () => {
    let h = start()
    h = historyReducer(h, { type: 'SET', patch: { radius: 'round' } })
    expect(h.present.radius).toBe('round')
    expect(h.past).toHaveLength(1)

    h = historyReducer(h, { type: 'UNDO' })
    expect(h.present.radius).toBe(DEFAULT_CONFIG.radius)
    expect(h.future).toHaveLength(1)

    h = historyReducer(h, { type: 'REDO' })
    expect(h.present.radius).toBe('round')
    expect(h.future).toHaveLength(0)
  })

  it('coalesces consecutive single-field SETs to the SAME key into one step', () => {
    let h = start()
    h = historyReducer(h, { type: 'SET', patch: { cPrimary: '#111111' } })
    h = historyReducer(h, { type: 'SET', patch: { cPrimary: '#222222' } })
    h = historyReducer(h, { type: 'SET', patch: { cPrimary: '#333333' } })
    expect(h.present.cPrimary).toBe('#333333')
    expect(h.past).toHaveLength(1) // a slider drag = ONE undo step
    h = historyReducer(h, { type: 'UNDO' })
    expect(h.present.cPrimary).toBe(DEFAULT_CONFIG.cPrimary) // back to before the drag
  })

  it('does NOT coalesce edits to DIFFERENT keys', () => {
    let h = start()
    h = historyReducer(h, { type: 'SET', patch: { radius: 'round' } })
    h = historyReducer(h, { type: 'SET', patch: { scale: 'compact' } })
    expect(h.past).toHaveLength(2)
  })

  it('drops no-op changes (re-setting the current value)', () => {
    let h = start()
    h = historyReducer(h, { type: 'SET', patch: { radius: DEFAULT_CONFIG.radius } })
    expect(h.past).toHaveLength(0)
  })

  it('clears the redo stack when a new edit happens after an undo', () => {
    let h = start()
    h = historyReducer(h, { type: 'SET', patch: { radius: 'round' } })
    h = historyReducer(h, { type: 'UNDO' })
    expect(h.future).toHaveLength(1)
    h = historyReducer(h, { type: 'SET', patch: { scale: 'compact' } })
    expect(h.future).toHaveLength(0)
  })

  it('undo/redo are no-ops at the ends of history', () => {
    let h = start()
    expect(historyReducer(h, { type: 'UNDO' })).toBe(h)
    expect(historyReducer(h, { type: 'REDO' })).toBe(h)
  })

  it('treats APPLY_COLOR_THEME as its own (non-coalescing) step', () => {
    let h = start()
    h = historyReducer(h, { type: 'APPLY_COLOR_THEME', id: 'jade' })
    h = historyReducer(h, { type: 'APPLY_COLOR_THEME', id: 'rose' })
    expect(h.past).toHaveLength(2)
    expect(h.present.colorTheme).toBe('rose')
  })
})
