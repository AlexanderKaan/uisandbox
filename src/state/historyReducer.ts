import { configReducer, type ConfigAction } from './configReducer'
import type { Config } from '../tokens/types'

/* Undo/redo history wrapper around configReducer (C2). Keeps the classic
 * past/present/future stacks so ⌘Z / ⇧⌘Z step through config edits.
 *
 * COALESCING: consecutive SETs to the SAME single field merge into ONE undo
 * step (via `mergeKey`) — so dragging a slider or typing a hex is one undo, not
 * fifty. Any other action (theme, multi-key SET, replace) starts a fresh step.
 * A no-op (state unchanged) is dropped, so re-picking the current value or a
 * hashchange REPLACE to an identical config never pollutes the stack. */

export interface HistoryState {
  past: Config[]
  present: Config
  future: Config[]
  mergeKey: string | null
}

export type HistoryAction = ConfigAction | { type: 'UNDO' } | { type: 'REDO' }

const LIMIT = 50 // bound memory; older steps fall off the bottom

export function initHistory(present: Config): HistoryState {
  return { past: [], present, future: [], mergeKey: null }
}

/* The coalesce identity of an action: a single-field SET coalesces with the
 * previous change to the SAME field; everything else is its own step. */
function coalesceKey(action: ConfigAction): string | null {
  if (action.type === 'SET') {
    const keys = Object.keys(action.patch)
    return keys.length === 1 ? `set:${keys[0]}` : null
  }
  return null
}

/* Config is a flat record of primitives — a shallow compare is exact. */
function sameConfig(a: Config, b: Config): boolean {
  if (a === b) return true
  const ak = Object.keys(a) as (keyof Config)[]
  const bk = Object.keys(b) as (keyof Config)[]
  if (ak.length !== bk.length) return false
  return ak.every((k) => a[k] === b[k])
}

export function historyReducer(h: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'UNDO': {
      if (!h.past.length) return h
      const present = h.past[h.past.length - 1]!
      return { past: h.past.slice(0, -1), present, future: [h.present, ...h.future], mergeKey: null }
    }
    case 'REDO': {
      if (!h.future.length) return h
      const present = h.future[0]!
      return { past: [...h.past, h.present], present, future: h.future.slice(1), mergeKey: null }
    }
    default: {
      const present = configReducer(h.present, action)
      if (sameConfig(present, h.present)) return h // no-op → don't record
      const key = coalesceKey(action)
      // Same single-field edit as the last step → fold into it (don't grow past).
      if (key !== null && key === h.mergeKey) {
        return { ...h, present, future: [] }
      }
      const past = [...h.past, h.present]
      if (past.length > LIMIT) past.shift()
      return { past, present, future: [], mergeKey: key }
    }
  }
}
