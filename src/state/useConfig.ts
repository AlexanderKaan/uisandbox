import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { DEFAULT_CONFIG } from '../tokens/defaults'
import { buildTokens } from '../tokens/buildTokens'
import type { Config } from '../tokens/types'
import type { Tokens } from '../tokens/types'
import { readHash, writeHash } from './hash'
import type { ConfigAction } from './configReducer'
import { historyReducer, initHistory } from './historyReducer'

const HASH_DEBOUNCE_MS = 150

interface UseConfigResult {
  cfg: Config
  tokens: Tokens
  dispatch: (action: ConfigAction) => void
  undo: () => void
  redo: () => void
  /** Start over at `cfg`: history cleared, URL hash dropped at once (not on
   *  the debounce — a project switch must never carry the last one's knobs). */
  reset: (cfg: Config) => void
  canUndo: boolean
  canRedo: boolean
}

function initFromHash(): Config {
  return readHash() ?? DEFAULT_CONFIG
}

export function useConfig(): UseConfigResult {
  const [hist, dispatch] = useReducer(historyReducer, undefined, () => initHistory(initFromHash()))
  const cfg = hist.present
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // sync to URL hash with debounce
  useEffect(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current)
    writeTimer.current = setTimeout(() => {
      writeHash(cfg)
    }, HASH_DEBOUNCE_MS)
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current)
    }
  }, [cfg])

  // listen for hash changes from back/forward navigation
  useEffect(() => {
    const onHashChange = () => {
      const next = readHash()
      if (next) dispatch({ type: 'REPLACE', cfg: next })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const tokens = useMemo(() => buildTokens(cfg), [cfg])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const reset = useCallback((next: Config) => {
    if (writeTimer.current) clearTimeout(writeTimer.current)
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search)
    dispatch({ type: 'RESET', cfg: next })
  }, [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])

  return {
    cfg,
    tokens,
    // The history dispatch accepts every ConfigAction (HistoryAction is a
    // superset), so callers (the panel) keep dispatching SET/APPLY_COLOR_THEME/
    // REPLACE unchanged — undo/redo are layered on transparently.
    dispatch: dispatch as (action: ConfigAction) => void,
    undo,
    redo,
    reset,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
  }
}
