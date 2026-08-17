import { Plus, X } from 'lucide-react'
import type { Config } from '../tokens/types'
import { SLOT_IDS } from '../state/savedKits'
import type { SavedKitsApi } from '../state/savedKits'

interface SavedKitsProps {
  cfg: Config
  /** Shared instance from the Topbar, so the heart's saved-count and this
   *  grid stay in sync on same-tab saves (separate hook instances wouldn't). */
  api: SavedKitsApi
  onLoad: (cfg: Config) => void
}

/**
 * Three localStorage slots showing brand-color swatches. Empty = save
 * current cfg. Filled = click to load. Hover ✕ = clear.
 *
 * Intentionally minimal: no rename, no ordering, no count limit raising.
 * If you want a CMS, fork the Pro version.
 */
export function SavedKits({ cfg, api, onLoad }: SavedKitsProps) {
  const { slots, save, load, clear } = api

  const onSlotClick = (id: 1 | 2 | 3) => {
    const slot = slots.find((s) => s.id === id)
    if (!slot?.cfg) {
      save(id, cfg)
    } else {
      const loaded = load(id)
      if (loaded) onLoad(loaded)
    }
  }

  const onClearClick = (e: React.MouseEvent | React.KeyboardEvent, id: 1 | 2 | 3) => {
    e.stopPropagation()
    clear(id)
  }

  return (
    <div className="kits">
      {SLOT_IDS.map((id) => {
        const slot = slots.find((s) => s.id === id)
        const filled = !!slot?.cfg && !!slot?.swatches
        return (
          <button
            key={id}
            type="button"
            className={`kit ${filled ? 'kit--filled' : 'kit--empty'}`}
            onClick={() => onSlotClick(id)}
            title={filled ? `Load kit ${id}` : `Save current as kit ${id}`}
            aria-label={filled ? `Load kit ${id}` : `Save current to kit ${id}`}
          >
            {filled ? (
              <>
                <span className="kit__swatches">
                  {slot!.swatches!.map((c, i) => (
                    <span key={i} className="kit__sw" style={{ background: c }} />
                  ))}
                </span>
                <span className="kit__label">Kit {id}</span>
                <span
                  className="kit__clear"
                  onClick={(e) => onClearClick(e, id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onClearClick(e, id)
                    }
                  }}
                  role="button"
                  aria-label={`Clear kit ${id}`}
                  tabIndex={0}
                >
                  <X size={11} strokeWidth={2} />
                </span>
              </>
            ) : (
              <>
                <span className="kit__plus">
                  <Plus size={14} strokeWidth={2} />
                </span>
                <span className="kit__label">Kit {id}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
