import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Pin, Search } from 'lucide-react'
import type { Screen } from '../sandbox/project'

interface ScreenPickerProps {
  screens: Screen[]
  current: Screen
  onPick: (s: Screen) => void
  onPin: () => void
}

/**
 * The screen picker — one shape for 3 screens and for 300.
 *
 * A tab strip stops working around a dozen; a searchable, folder-grouped list
 * never does. Type to filter, arrows + Enter to choose, `[` / `]` anywhere on
 * the page for previous / next. Each entry says where it came from (a file in
 * the build, a link found on a page, pinned by hand) so a route that only an
 * SPA knows about is not mistaken for a page in the archive.
 */
export function ScreenPicker({ screens, current, onPick, onPin }: ScreenPickerProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? screens.filter((s) => s.label.toLowerCase().includes(needle) || s.path.toLowerCase().includes(needle)) : screens
  }, [screens, q])

  // Group by the folder above the leaf: `/docs/5.3/about/brand` → `docs/5.3/about`.
  const groups = useMemo(() => {
    const m = new Map<string, Screen[]>()
    for (const s of filtered) {
      const parts = s.label.split('/').filter(Boolean)
      const g = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
      if (!m.has(g)) m.set(g, [])
      m.get(g)!.push(s)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])
  const flat = useMemo(() => groups.flatMap(([, list]) => list), [groups])

  useEffect(() => { if (open) { setQ(''); setHi(Math.max(0, flat.findIndex((s) => s.path === current.path))); setTimeout(() => inputRef.current?.focus(), 0) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setHi(0) }, [q])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  // `[` / `]` step through screens from anywhere (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.key !== '[' && e.key !== ']') return
      const i = screens.findIndex((s) => s.path === current.path)
      const n = screens[(i + (e.key === ']' ? 1 : screens.length - 1)) % screens.length]
      if (n) onPick(n)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screens, current, onPick])

  const choose = (s: Screen) => { onPick(s); setOpen(false) }
  const tag = (s: Screen) => (s.source === 'link' ? 'route' : s.source === 'pinned' ? 'pinned' : null)
  const idx = screens.findIndex((s) => s.path === current.path)

  return (
    <div className="spick" ref={rootRef}>
      <button type="button" className="spick__btn" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} title={`${current.path} · ${idx + 1} of ${screens.length} screens · [ ] to step`}>
        <span className="spick__cur">{current.label}</span>
        <span className="spick__n">{idx + 1}/{screens.length}</span>
        <ChevronDown size={13} strokeWidth={2} />
      </button>
      {open && (
        <div className="menu spick__menu" role="listbox">
          <div className="spick__search">
            <Search size={13} strokeWidth={2} />
            <input
              ref={inputRef}
              className="spick__input"
              value={q}
              placeholder={`Search ${screens.length} screens…`}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(flat.length - 1, h + 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
                else if (e.key === 'Enter') { const s = flat[hi]; if (s) choose(s) }
                else if (e.key === 'Escape') setOpen(false)
              }}
            />
          </div>
          <div className="spick__list">
            {groups.map(([g, list]) => (
              <div key={g}>
                {g && <div className="menu__label">/{g}</div>}
                {list.map((s) => {
                  const i = flat.indexOf(s)
                  return (
                    <button key={s.path} type="button" role="option" aria-selected={s.path === current.path}
                      className={`menu__item spick__item ${s.path === current.path ? 'menu__item--on' : ''} ${i === hi ? 'spick__item--hi' : ''}`}
                      onMouseEnter={() => setHi(i)} onClick={() => choose(s)} title={s.path}>
                      <span className="spick__leaf">{s.label.split('/').filter(Boolean).pop() ?? '/'}</span>
                      {tag(s) && <span className="spick__tag">{tag(s)}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
            {!flat.length && <div className="spick__empty">No screen matches “{q}”.</div>}
          </div>
          <div className="spick__foot">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { onPin(); setOpen(false) }} title="Add the route the frame is on now"><Pin size={12} strokeWidth={2} /> Pin current route</button>
            <span className="spick__hint"><kbd>[</kbd> <kbd>]</kbd> step · <kbd>↵</kbd> open</span>
          </div>
        </div>
      )}
    </div>
  )
}
