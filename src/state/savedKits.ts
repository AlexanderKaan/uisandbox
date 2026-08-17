import { useEffect, useState } from 'react'
import { buildTokens } from '../tokens/buildTokens'
import { DEFAULT_CONFIG } from '../tokens/defaults'
import type { Config } from '../tokens/types'

/**
 * Three fixed save-slots in localStorage. Scoped exception to the
 * "no localStorage" rule in DECISIONS.md — applies ONLY to user-saved
 * kits, never to app state. URL-hash remains the source of truth for
 * the currently active config.
 *
 * Format per slot: full Config JSON. No naming, no ordering, no sync.
 * Empty slot = key absent.
 */

const KEY = (slot: number) => `uicockpit:kit:${slot}`
export const SLOT_IDS = [1, 2, 3] as const
export type SlotId = (typeof SLOT_IDS)[number]

export interface SavedSlot {
  id: SlotId
  cfg: Config | null
  /** Resolved primary/secondary/accent hex — pre-computed for the slot
   *  preview so we don't re-run buildTokens on every render. */
  swatches: [string, string, string] | null
}

function read(slot: SlotId): Config | null {
  try {
    const raw = localStorage.getItem(KEY(slot))
    if (!raw) return null
    // Merge over DEFAULT_CONFIG: kits saved before newer Config fields existed
    // (e.g. the H1 harmony dials) must not surface `undefined` into controls.
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<Config>) }
  } catch {
    return null
  }
}

function write(slot: SlotId, cfg: Config): void {
  try {
    localStorage.setItem(KEY(slot), JSON.stringify(cfg))
  } catch {
    /* quota or disabled — fail silently */
  }
}

function remove(slot: SlotId): void {
  try {
    localStorage.removeItem(KEY(slot))
  } catch {
    /* ignore */
  }
}

function loadAll(): SavedSlot[] {
  return SLOT_IDS.map((id) => {
    const cfg = read(id)
    if (!cfg) return { id, cfg: null, swatches: null }
    try {
      const tk = buildTokens(cfg)
      return { id, cfg, swatches: [tk.primaryHex, tk.secHex, tk.accentHex] }
    } catch {
      return { id, cfg: null, swatches: null }
    }
  })
}

export interface SavedKitsApi {
  slots: SavedSlot[]
  save: (id: SlotId, cfg: Config) => void
  load: (id: SlotId) => Config | null
  clear: (id: SlotId) => void
}

export function useSavedKits(): SavedKitsApi {
  const [slots, setSlots] = useState<SavedSlot[]>(loadAll)

  // Cross-tab sync — if user saves in tab A, tab B sees it on next render
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('uicockpit:kit:')) setSlots(loadAll())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return {
    slots,
    save: (id, cfg) => {
      write(id, cfg)
      setSlots(loadAll())
    },
    load: (id) => read(id),
    clear: (id) => {
      remove(id)
      setSlots(loadAll())
    },
  }
}
