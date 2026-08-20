import { Fragment, useEffect, useLayoutEffect, useRef, useState, type Dispatch } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight, PanelLeftClose, Redo2, RotateCcw, Shuffle, Undo2 } from 'lucide-react'
import { BODY_FONTS, DISPLAY_GROUPS } from '../tokens/fonts'
import { nameColor } from '../tokens/color'
import { COLOR_THEMES } from '../tokens/stylesAndThemes'
import type { ColorTheme, Config, Tokens } from '../tokens/types'
import type { ConfigAction } from '../state/configReducer'
import { FontPicker } from './FontPicker'
import { DEFAULT_DIALS, DIALS, fmtDial, nearestSnap, type DialSpec, type Dials } from '../sandbox/dials'
import type { Families, Family } from '../sandbox/mapping'
import { formatCssColor } from '../sandbox/cssColor'
import type { Scheme } from '../sandbox/scheme'

interface Props {
  cfg: Config
  tokens: Tokens
  /** The stand their code implied — every knob's "as is". */
  base: Config
  families?: Families
  scheme?: Scheme
  /** Families their sheet carries (knob names) — the picker's "In your code". */
  codeFonts?: string[]
  /** The sheet holds a linear/conic gradient — the angle dial has something to turn. */
  hasGradients?: boolean
  /** The CURRENT value of a sheet entry (its var, after mapping) — the dots
   *  move with the knobs, as the page does. */
  varNow?: (id: number) => string | undefined
  dispatch: Dispatch<ConfigAction>
  onCollapse: () => void
  onRandomize: () => void
  onReset: () => void
  /** Knob history — undo/redo live with the knobs, not in the top bar. */
  history?: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }
}

const THEMES: Array<{ id: ColorTheme; label: string; hex: string }> = (Object.keys(COLOR_THEMES) as ColorTheme[]).map((id) => ({ id, label: id[0]!.toUpperCase() + id.slice(1), hex: COLOR_THEMES[id].cPrimary }))
const FAMILY_ROWS: Array<{ fam: Family; key: keyof Dials; label: string }> = [
  { fam: 'secondary', key: 'cSecondary', label: 'Secondary' }, { fam: 'accent', key: 'cAccent', label: 'Accent' },
  { fam: 'success', key: 'cSuccess', label: 'Success' }, { fam: 'warning', key: 'cWarning', label: 'Warning' },
  { fam: 'danger', key: 'cDanger', label: 'Danger' }, { fam: 'info', key: 'cInfo', label: 'Info' },
]

/**
 * The knobs, rebuilt for someone else's app (notes/knobs-research.md).
 *
 * Every size knob is a DIAL where ×1 is exactly their code, with the old preset
 * names as snap points; colour roles beyond the brand are pickers over the
 * families their own sheet contains (a row appears only when the family
 * exists); fonts pick a family. Nothing here is a kit concept: each row is
 * measured to move something in a real build (mapping.test knobEffect).
 *
 * At rest a row shows a quiet dot — "as in your code"; once turned, "changed".
 */
export function SandboxPanel({ cfg, tokens, base, families, scheme, codeFonts = [], hasGradients = false, varNow, dispatch, onCollapse, onRandomize, onReset, history }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const set = (patch: Partial<Config>) => dispatch({ type: 'SET', patch })
  const setDial = (key: keyof Dials, v: number | string | undefined) => set({ sb: { ...cfg.sb, [key]: v } })
  const close = () => { setOpenKey(null); setAnchor(null) }
  const toggle = (key: string, rowEl: HTMLElement | null) => {
    if (openKey === key) { close(); return }
    const r = rowEl?.getBoundingClientRect()
    setAnchor(r ? { top: r.top - 6, left: r.right + 10 } : null)
    setOpenKey(key)
  }
  useLayoutEffect(() => {
    const el = popRef.current
    if (!el || !anchor) return
    const maxTop = window.innerHeight - el.offsetHeight - 12
    if (anchor.top > maxTop) el.style.top = `${Math.max(12, maxTop)}px`
  }, [anchor, openKey])
  useEffect(() => {
    if (!openKey) return
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.fmrow, .fmrow__pop')) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onMove = () => close()
    // The panel scrolling under an anchored flyout moves the anchor away, so
    // close; a scroll INSIDE the flyout (a long font list) is browsing, not leaving.
    const onScroll = (e: Event) => { if (!(e.target instanceof Element && e.target.closest('.fmrow__pop'))) close() }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onMove); document.addEventListener('scroll', onScroll, true)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onMove); document.removeEventListener('scroll', onScroll, true) }
  }, [openKey])

  const atRest = (Object.keys(base) as (keyof Config)[]).every((k) => k === 'sb' ? JSON.stringify(cfg.sb) === JSON.stringify(base.sb) : cfg[k] === base[k])
  const brandChanged = cfg.cPrimary.toLowerCase() !== base.cPrimary.toLowerCase()
  const themeOf = (hex: string) => THEMES.find((t) => t.hex.toLowerCase() === hex.toLowerCase())

  /* Rows: label · value · state · flyout content */
  interface Row { key: string; sec?: string; label: string; value: React.ReactNode; changed: boolean; dot?: React.ReactNode; body: () => React.ReactNode; wide?: boolean }
  const rows: Row[] = []

  // ── Colour ──
  rows.push({
    key: 'brand', sec: 'Colour', label: 'Brand', changed: brandChanged,
    value: themeOf(cfg.cPrimary)?.label ?? nameColor(tokens.primaryHex),
    // The Brand dot is the knob's own value: any family member's live var can
    // be a same-hue outlier (a syntax navy) and read darker than the pick.
    dot: <span className="fmrow__dot" style={{ background: cfg.cPrimary }} />,
    body: () => (
      <>
        <div className="fmpop__grid">
          {THEMES.map((t) => (
            <button key={t.id} type="button" className={`menu__item fmopt ${themeOf(cfg.cPrimary)?.id === t.id ? 'menu__item--on' : ''}`} onClick={() => { dispatch({ type: 'APPLY_COLOR_THEME', id: t.id }); close() }}>
              <span className="fmopt__viz"><span className="fmrow__dot" style={{ background: t.hex }} /></span>
              <span className="fmopt__label">{t.label}</span>
              {themeOf(cfg.cPrimary)?.id === t.id && <Check size={14} strokeWidth={2.5} className="fmopt__check" />}
            </button>
          ))}
        </div>
        <label className="fmbrand">
          <span className="fmbrand__label">Brand colour</span>
          <span className="fmbrand__val"><span className="fmrow__dot" style={{ background: cfg.cPrimary }} />{cfg.cPrimary}</span>
          <input type="color" className="fmrow__colorinput" value={cfg.cPrimary} onChange={(e) => set({ cPrimary: e.target.value as Config['cPrimary'] })} aria-label="Brand colour" />
        </label>
        {brandChanged && <button type="button" className="btn btn--ghost btn--sm sbp__reset" onClick={() => set({ cPrimary: base.cPrimary })}>Back to your code ({base.cPrimary})</button>}
      </>
    ),
  })
  // Secondary and accent are one row each; the STATUS colours are a set — one
  // row, one dot per family the sheet has, the pickers stacked in the flyout.
  // In any grown design system they are the standard four; a row each was
  // three rows saying "green, amber, red".
  const famState = (f: (typeof FAMILY_ROWS)[number]) => {
    const centre = families?.centre[f.fam]
    if (!centre) return null
    const centreHex = formatCssColor({ ...centre, a: 1 })
    const cur = (cfg.sb[f.key] as string | undefined) ?? centreHex
    const id = families?.centreId?.[f.fam]
    const live = (id !== undefined ? varNow?.(id) : undefined) ?? cur
    return { ...f, centreHex, cur, live, changed: cur.toLowerCase() !== centreHex.toLowerCase() }
  }
  const famPicker = (f: NonNullable<ReturnType<typeof famState>>, hint = true) => (
    <Fragment key={f.key}>
      <label className="fmbrand">
        <span className="fmbrand__label">{f.label} colour</span>
        <span className="fmbrand__val"><span className="fmrow__dot" style={{ background: f.cur }} />{f.cur}</span>
        <input type="color" className="fmrow__colorinput" value={f.cur} onChange={(e) => setDial(f.key, e.target.value)} aria-label={`${f.label} colour`} />
      </label>
      {hint && <p className="sbp__hint">Every {f.label.toLowerCase()}-family colour in your CSS moves with this one; its most-used member is {f.centreHex}.</p>}
      {cfg.sb[f.key] && <button type="button" className="btn btn--ghost btn--sm sbp__reset" onClick={() => setDial(f.key, undefined)}>Back to your code{hint ? '' : ` (${f.label.toLowerCase()})`}</button>}
    </Fragment>
  )
  for (const f of FAMILY_ROWS.filter((x) => x.fam === 'secondary' || x.fam === 'accent').map(famState)) {
    if (!f) continue
    rows.push({ key: f.key, label: f.label, changed: f.changed, value: nameColor(f.cur as `#${string}`), dot: <span className="fmrow__dot" style={{ background: f.live }} />, body: () => famPicker(f) })
  }
  const status = FAMILY_ROWS.filter((x) => x.fam !== 'secondary' && x.fam !== 'accent').map(famState).filter((x): x is NonNullable<typeof x> => !!x)
  if (status.length) {
    rows.push({
      key: 'status', label: 'Status', changed: status.some((f) => f.changed),
      value: <span className="fmrow__dots">{status.map((f) => <span key={f.key} className="fmrow__dot" style={{ background: f.live }} title={`${f.label}: ${f.live}`} />)}</span>,
      body: () => (
        <>
          {status.map((f) => famPicker(f, false))}
          <p className="sbp__hint">Every colour of a status family in your CSS moves with its picker; the dots show each family's most-used member.</p>
        </>
      ),
    })
  }
  // Background: a colour, not a ΔL. The canvas their page declares (html/body)
  // is the centre; a pick moves it and every background neutral in its
  // lightness zone — cards and surfaces keep their step above the page.
  if (families?.canvas) {
    const canvasHex = formatCssColor({ ...families.canvas, a: 1 })
    const cur = cfg.sb.cBackground ?? canvasHex
    const live = (families.canvasId !== undefined ? varNow?.(families.canvasId) : undefined) ?? cur
    rows.push({
      key: 'background', label: 'Background', changed: cur.toLowerCase() !== canvasHex.toLowerCase(),
      value: nameColor(cur as `#${string}`), dot: <span className="fmrow__dot fmrow__dot--ring" style={{ background: live }} />,
      body: () => (
        <>
          <label className="fmbrand">
            <span className="fmbrand__label">Page background</span>
            <span className="fmbrand__val"><span className="fmrow__dot fmrow__dot--ring" style={{ background: cur }} />{cur}</span>
            <input type="color" className="fmrow__colorinput" value={cur} onChange={(e) => setDial('cBackground', e.target.value)} aria-label="Page background" />
          </label>
          <p className="sbp__hint">Your page paints {canvasHex} behind everything; surfaces and cards near that lightness move with it, so their step above the page stays.</p>
          {cfg.sb.cBackground && <button type="button" className="btn btn--ghost btn--sm sbp__reset" onClick={() => setDial('cBackground', undefined)}>Back to your code ({canvasHex})</button>}
        </>
      ),
    })
  }
  // The palette: chromatic clusters that are neither brand nor a proven status
  // role (pastel card tints, categories, chart series). No picker of their own —
  // they follow Hue / Saturation / Contrast — but the dots show they were seen
  // and NOT taken for status.
  if (families?.palette?.length) {
    const pal = families.palette.slice(0, 8).map((c, i) => { const id = families.paletteId?.[i]; return (id !== undefined ? varNow?.(id) : undefined) ?? formatCssColor({ ...c, a: 1 }) })
    rows.push({
      key: 'palette', label: 'Palette', changed: false,
      value: <span className="fmrow__dots">{pal.map((hex, i) => <span key={i} className="fmrow__dot" style={{ background: hex }} title={hex} />)}</span>,
      body: () => (
        <>
          <p className="sbp__hint">{families.palette!.length} colour famil{families.palette!.length === 1 ? 'y' : 'ies'} in your CSS that are neither the brand nor a status role: pastel tints on cards, categories, chart series. They are not touched by the Status pickers; Hue, Saturation and Contrast move them.</p>
          <div className="fmrow__dots" style={{ gap: 6, padding: '4px 10px 8px' }}>{pal.map((hex, i) => <span key={i} className="fmrow__dot" style={{ background: hex, width: 14, height: 14 }} title={hex} />)}</div>
        </>
      ),
    })
  }
  const dialRow = (spec: DialSpec, sec?: string): Row => {
    const v = (cfg.sb[spec.key] ?? DEFAULT_DIALS[spec.key]) as number
    const bv = (base.sb[spec.key] ?? DEFAULT_DIALS[spec.key]) as number
    return {
      key: spec.key, sec, label: spec.label, changed: v !== bv, value: fmtDial(spec, v),
      body: () => (
        <div className="sbp__dial">
          <div className="sbp__dial-row">
            <input type="range" min={spec.min} max={spec.max} step={spec.step} value={v} onChange={(e) => setDial(spec.key, parseFloat(e.target.value))} aria-label={spec.label} list={`snaps-${spec.key}`} />
            <datalist id={`snaps-${spec.key}`}>{spec.snaps.map((s) => <option key={s.at} value={s.at} label={s.label} />)}</datalist>
          </div>
          <div className="sbp__snaps">
            {spec.snaps.map((s) => (
              <button key={s.at} type="button" className={`sbp__snap ${nearestSnap(spec, v)?.at === s.at ? 'sbp__snap--on' : ''}`} onClick={() => setDial(spec.key, s.at)}>{s.label === 'as is' ? 'as in your code' : s.label}</button>
            ))}
          </div>
          <div className="sbp__dial-foot"><span>{fmtDial(spec, v)}</span>{v !== bv && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDial(spec.key, bv)}>Reset</button>}</div>
        </div>
      ),
    }
  }
  for (const spec of DIALS.filter((d) => d.section === 'Colour' && (d.key !== 'gradAngle' || hasGradients))) rows.push(dialRow(spec))
  if (scheme && (scheme.media || scheme.hooks.length)) {
    const cur = cfg.sb.dark
    rows.push({
      key: 'dark', label: 'Dark mode', changed: cur !== base.sb.dark, value: cur === 'dark' ? 'Dark' : cur === 'light' ? 'Light' : 'as is',
      body: () => (
        <div className="fmpop__list">
          {([[undefined, 'as is', 'whatever your page does on its own'], ['dark', 'Dark', 'your own dark scheme, switched on'], ['light', 'Light', 'your own light scheme, forced']] as const).map(([id, label, sub]) => (
            <button key={String(id)} type="button" className={`menu__item fmopt ${cur === id ? 'menu__item--on' : ''}`} onClick={() => { setDial('dark', id); close() }} title={sub}>
              <span className="fmopt__label">{label}</span>{cur === id && <Check size={14} strokeWidth={2.5} className="fmopt__check" />}
            </button>
          ))}
          <p className="sbp__hint">Found in your CSS: {[scheme.media ? 'prefers-color-scheme' : null, ...scheme.hooks.map(([a, d]) => (a === 'class' ? `.${d}` : `[${a}="${d}"]`))].filter(Boolean).join(' · ')}.</p>
        </div>
      ),
    })
  }
  rows.push({
    key: 'neutral', label: 'Grey tint', changed: cfg.neutral !== base.neutral, value: cfg.neutral === 'auto' ? 'Follows brand' : 'Neutral',
    body: () => (
      <div className="fmpop__list">
        {([['neutral', 'Neutral', 'greys stay as they are'], ['auto', 'Follows brand', 'greys take a whisper of the brand hue']] as const).map(([id, label, sub]) => (
          <button key={id} type="button" className={`menu__item fmopt ${cfg.neutral === id ? 'menu__item--on' : ''}`} onClick={() => { set({ neutral: id }); close() }} title={sub}>
            <span className="fmopt__label">{label}</span>{cfg.neutral === id && <Check size={14} strokeWidth={2.5} className="fmopt__check" />}
          </button>
        ))}
      </div>
    ),
  })

  // ── Type ──
  const fontRow = (key: 'fontDisplay' | 'fontBody', label: string): Row => ({
    key, sec: key === 'fontDisplay' ? 'Type' : undefined, label, changed: cfg[key] !== base[key],
    value: cfg[key].replace(/^Custom: /, ''),
    body: () => <FontPicker inline value={cfg[key]} inCode={codeFonts} groups={key === 'fontDisplay' ? DISPLAY_GROUPS : BODY_FONTS} onChange={(f) => { set({ [key]: f }); close() }} />,
    wide: true,
  })
  rows.push(fontRow('fontDisplay', 'Display font'), fontRow('fontBody', 'Body font'))
  for (const spec of DIALS.filter((d) => d.section === 'Type')) rows.push(dialRow(spec))
  // ── Shape ──
  DIALS.filter((d) => d.section === 'Shape').forEach((spec, i) => rows.push(dialRow(spec, i === 0 ? 'Shape' : undefined)))

  return (
    <aside className="panel">
      <div className="card fmenu">
        <div className="fmenu__bar">
          <span className="fmenu__bar-title">Your app · knobs</span>
          <button type="button" className="btn btn--ghost btn--icon fmenu__collapse" onClick={onCollapse} aria-label="Collapse" title="Collapse for a full-width preview"><PanelLeftClose size={15} strokeWidth={1.75} /></button>
        </div>
        <div className="fmenu__rows">
          {rows.map((r) => (
            <Fragment key={r.key}>
              {r.sec && <div className="menu__label fmsec">{r.sec}</div>}
              <div className={`fmrow ${openKey === r.key ? 'fmrow--open' : ''}`}>
                <button type="button" className="menu__item fmrow__head sbp__head" onClick={(e) => toggle(r.key, (e.currentTarget as HTMLElement).closest('.fmrow'))} aria-expanded={openKey === r.key}>
                  <span className={`sbp__state ${r.changed ? 'sbp__state--changed' : ''}`} title={r.changed ? 'changed' : 'as in your code'} />
                  <span className="fmrow__label">{r.label}</span>
                  <span className="menu__value fmrow__val" title={String(r.value)}>
                    {r.dot && <span className="fmrow__dot fmrow__dot--viz">{r.dot}</span>}
                    <span className="fmrow__val-text">{r.value}</span>
                  </span>
                  <ChevronRight size={14} strokeWidth={2} className="fmrow__chev" />
                </button>
                {openKey === r.key && createPortal(
                  <div ref={popRef} className={`menu fmrow__pop ${r.wide ? 'fmrow__pop--font' : ''}`} role="menu" style={anchor ? { position: 'fixed', top: anchor.top, left: anchor.left } : undefined}>
                    {r.body()}
                  </div>,
                  document.body,
                )}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
      <div className="panel__foot">
        {history && (
          <span className="panel__history" role="group" aria-label="History">
            <button type="button" className="panel__hist" onClick={history.undo} disabled={!history.canUndo} title="Undo (⌘Z)" aria-label="Undo"><Undo2 size={15} strokeWidth={1.75} /></button>
            <button type="button" className="panel__hist" onClick={history.redo} disabled={!history.canRedo} title="Redo (⇧⌘Z)" aria-label="Redo"><Redo2 size={15} strokeWidth={1.75} /></button>
          </span>
        )}
        <button type="button" className="btn btn--secondary panel__shuffle" onClick={onRandomize} title="Shuffle: a random stand on every knob"><Shuffle size={15} strokeWidth={1.75} /><span>Shuffle</span></button>
        <button type="button" className="btn btn--ghost panel__reset" onClick={onReset} disabled={atRest} title={atRest ? 'Every knob is on your code' : 'Back to your code, every knob'}><RotateCcw size={15} strokeWidth={1.75} /><span>Reset</span></button>
      </div>
    </aside>
  )
}
