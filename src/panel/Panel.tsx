import { Fragment, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight, Lock, LockOpen, PanelLeftClose, RotateCcw, Shuffle } from 'lucide-react'
import { DEFAULT_CONFIG } from '../tokens/defaults'
import { BODY_FONTS, DISPLAY_GROUPS, customFontFamily, isCustomFont, type FontGroup } from '../tokens/fonts'
import { nameColor } from '../tokens/color'
import { COLOR_THEMES } from '../tokens/stylesAndThemes'
import { applyHarmonyPreset } from '../tokens/harmony'
import type { ColorTheme, Config, Harmony, Tokens } from '../tokens/types'
import type { ProvenanceState } from '../audit/intake/handoff'
import type { ConfigAction } from '../state/configReducer'
import { FontPicker } from './FontPicker'
import {
  VIZ_COLOR_THEME,
  VIZ_RADIUS,
} from './vizFactories'

interface PanelProps {
  cfg: Config
  /** Row label → where its value came from, when the visitor arrived from an
   *  audit. Absent labels say nothing, which is right for the controls the scan
   *  never looks at — silence beats a badge that means "we didn't check". */
  provenance?: Record<string, ProvenanceState>
  tokens: Tokens
  dispatch: Dispatch<ConfigAction>
  /** Collapse the floating menu — drops back to the full-width preview. */
  onCollapse: () => void
  /** Roll a fresh guardrail-aware kit (the "Shuffle" footer button). */
  onRandomize: () => void
  /** Restore every knob to the resting kit (the "Reset" footer button). */
  onReset: () => void
  /** What "Reset" returns to. In the sandbox this is THEIR stand (the baseline
   *  derived from their code), not our house default. */
  resetTo?: Config
  /** Per-knob locks (by row key) — a pinned knob is skipped by Shuffle. */
  lockedKeys: Set<string>
  onToggleLock: (key: string) => void
  /** Mobile bottom-sheet wiring (desktop leaves both undefined): a ref to the panel
   *  root and to the drag grabber, so CockpitApp can run the detent drag. */
  rootRef?: Ref<HTMLElement>
  gripRef?: Ref<HTMLDivElement>
}

/* Option arrays — the single source for each control's choices + captions. */
/* Ordered as an Apple-style colour FAN: Mono (neutral, set apart by a divider in
 * the UI), then the 9 chromatic themes in spectrum order — red → orange → green →
 * teal → sky → blue → indigo → violet → pink. Yellow is intentionally absent (it
 * can't be a legible primary; it lives in the decorative palette instead). Each
 * is the most-loved, always-works version of its segment. */
const COLOR_THEME_OPTS = [
  { id: 'mono'   as ColorTheme, cap: 'Mono',   viz: VIZ_COLOR_THEME.mono },
  { id: 'rose'   as ColorTheme, cap: 'Rose',   viz: VIZ_COLOR_THEME.rose },
  { id: 'ember'  as ColorTheme, cap: 'Ember',  viz: VIZ_COLOR_THEME.ember },
  { id: 'jade'   as ColorTheme, cap: 'Jade',   viz: VIZ_COLOR_THEME.jade },
  { id: 'teal'   as ColorTheme, cap: 'Teal',   viz: VIZ_COLOR_THEME.teal },
  { id: 'sky'    as ColorTheme, cap: 'Sky',    viz: VIZ_COLOR_THEME.sky },
  { id: 'cobalt' as ColorTheme, cap: 'Cobalt', viz: VIZ_COLOR_THEME.cobalt },
  { id: 'indigo' as ColorTheme, cap: 'Indigo', viz: VIZ_COLOR_THEME.indigo },
  { id: 'violet' as ColorTheme, cap: 'Violet', viz: VIZ_COLOR_THEME.violet },
  { id: 'coral'  as ColorTheme, cap: 'Coral',  viz: VIZ_COLOR_THEME.coral },
]
const RADIUS_OPTS = [
  { id: 'none' as const, cap: 'None' },
  { id: 'subtle' as const, cap: 'Subtle' },
  { id: 'soft' as const, cap: 'Soft' },
  { id: 'round' as const, cap: 'Round' },
]
const NEUTRAL_OPTS = [
  // 'Auto' tints the grey ramp toward the brand hue; it sits first as the default,
  // so the bare word reads clearly beside Cool/Neutral/Warm in the segmented strip.
  { id: 'auto' as const, cap: 'Auto' },
  { id: 'neutral' as const, cap: 'Neutral' },
]
// Scale — interface size + density (one tighter, default, one roomier).
const CANVAS_OPTS = [
  { id: 'white' as const, cap: 'White' },
  { id: 'neutral' as const, cap: 'Neutral' },
  { id: 'brand' as const, cap: 'Brand' },
]
const SCALE_OPTS = [
  { id: 'compact' as const, cap: 'Compact' },
  { id: 'default' as const, cap: 'Default' },
  { id: 'comfortable' as const, cap: 'Comfortable' },
]
// Elevation (internal key: surfaceDepth) — the SHADOW ladder: how far cards/
// surfaces lift off the canvas. Decoupled from ramp contrast (June 2026), so
// it's purely shadow now. Flat = Linear/Vercel (no shadow); Soft = shadcn/Stripe
// (default); Deep = Notion. Outcome-named caps so the look is predictable.
const SURFACE_DEPTH_OPTS = [
  { id: 'flat' as const, cap: 'Flat' },
  { id: 'soft' as const, cap: 'Soft' },
  { id: 'deep' as const, cap: 'Deep' },
]
// Surface — the structural separation axis (replaces the over-specific Sidebar).
// One choice that drives every contained surface (fields, menus, sidebar seam):
// Outlined = box-with-border · Filled = tonal fill, no border · Plain = underline.
const SURFACE_OPTS = [
  { id: 'outlined' as const, cap: 'Outlined' },
  { id: 'filled' as const, cap: 'Filled' },
]
// Border prominence — its own control (tint of the box edge), 4 steps.
const BORDER_OPTS = [
  { id: 'faint' as const, cap: 'Faint' },
  { id: 'subtle' as const, cap: 'Subtle' },
  { id: 'medium' as const, cap: 'Medium' },
  { id: 'strong' as const, cap: 'Strong' },
]
// Canvas — the page background (--k-bg), exported + usable behind key blocks.
// White (flat) · Neutral (the muted near-white default) · Brand (a whisper tint)
const TYPESCALE_OPTS = [
  { id: 'sm' as const, cap: 'S' },
  { id: 'md' as const, cap: 'M' },
  { id: 'lg' as const, cap: 'L' },
  { id: 'xl' as const, cap: 'XL' },
]
// Label case — the UI-chrome label tier (buttons, labels, badges, tabs, nav).
// Default keeps them as authored; Caps = uppercase + tracking (the industrial look).
/* Which bar the kit must clear — the one control here that is not about looks.
 * AA is the legal floor (EN 301 549 harmonises WCAG 2.1 AA, and that is what the
 * European Accessibility Act enforces). AAA is not "more compliant", it is a
 * different bar that individual criteria can be raised to; NL Design System
 * raises target size and focus appearance, which is why public-sector teams
 * could not reach their own baseline at any setting until this existed. */
const CONFORMANCE_OPTS = [
  { id: 'aa' as const, cap: 'WCAG AA' },
  { id: 'aaa' as const, cap: 'AAA targets' },
]
const LABEL_CASE_OPTS = [
  { id: 'sentence' as const, cap: 'Default' },
  { id: 'caps' as const, cap: 'Caps' },
]
/* Harmony (H1) — presets of the two dials underneath (Spread °, Expression %).
 * Picking a preset snaps both sliders; moving a slider flips the row to Custom.
 * The primary never rotates — harmony governs the derived family only. */
const HARMONY_OPTS = [
  { id: 'mono' as const, cap: 'Mono' },
  { id: 'tonal' as const, cap: 'Tonal' },
  { id: 'complement' as const, cap: 'Complement' },
  { id: 'expressive' as const, cap: 'Expressive' },
]
function cap<T extends string>(opts: ReadonlyArray<{ id: T; cap: string }>, id: T): string {
  return opts.find((o) => o.id === id)?.cap ?? String(id)
}
function fontLabel(f: string): string {
  return isCustomFont(f) ? customFontFamily(f) : f
}

type Opt = { id: string; label: string; viz?: ReactNode; sub?: ReactNode }
/** Build a popover option-list from an option array, optionally attaching a
 *  per-option viz (kept only for radius/border-radius/motion/icons/themes —
 *  everything else is text-only; the canvas shows the effect). */
function optsFrom<T extends string>(
  arr: ReadonlyArray<{ id: T; cap: string }>,
  vizMap?: Record<string, ReactNode>,
): Opt[] {
  return arr.map((o) => ({ id: o.id, label: o.cap, viz: vizMap ? vizMap[o.id] : undefined }))
}

interface RowDef {
  sec?: string
  key: string
  label: string
  value?: string
  dot?: ReactNode
  /** 'seg'/'slider' render INLINE (no flyout) — the configurator-pass default.
   *  'opts'/'font' keep the flyout (lists, dot-grids, dial-bearing knobs). */
  kind: 'opts' | 'font' | 'seg' | 'slider'
  opts?: Opt[]
  selected?: string
  grid?: boolean
  /** Inline seg rows whose options are too wide for one line — render the label
   *  above a full-width strip (Neutrals · Surface · Press). */
  stack?: boolean
  onPick?: (id: string) => void
  fontGroups?: FontGroup[]
  fontValue?: string
  onFont?: (f: string) => void
  /** Extra content appended to the flyout (e.g. the Brand-colour row at the
   *  foot of the Color-theme grid). */
  footer?: ReactNode
}


/**
 * Where a control's value came from, under its label.
 *
 * Three states, and the third is the one that matters: once the visitor drags a
 * control somewhere else it is no longer what their code said, so the badge
 * stops claiming it. A provenance marker that outlives its evidence is worse
 * than none — it turns an honest signal into decoration.
 */
function Provenance({ state }: { state?: ProvenanceState }) {
  if (!state) return null
  if (state === 'derived') return <span className="fmrow__prov">from your code</span>
  if (state === 'changed') return <span className="fmrow__prov fmrow__prov--changed">you changed this</span>
  return <span className="fmrow__prov fmrow__prov--default">your code didn&rsquo;t decide this</span>
}

export function Panel({ cfg, tokens, dispatch, onCollapse, onRandomize, onReset, resetTo, lockedKeys, onToggleLock, rootRef, gripRef, provenance }: PanelProps) {
  // Already on the curated default? → dim the Reset button (nothing to undo to).
  const restCfg = resetTo ?? DEFAULT_CONFIG
  const atDefault = (Object.keys(restCfg) as (keyof Config)[]).every((k) => cfg[k] === restCfg[k])
  const set = <K extends keyof Config>(field: K, value: Config[K]) =>
    dispatch({ type: 'SET', patch: { [field]: value } as Partial<Config> })

  // One open flyout at a time (keyed by control). Click a row → its options
  // float over the canvas; pick → applies + closes.
  const [openKey, setOpenKey] = useState<string | null>(null)
  /* Where the open row sits on screen. The flyout is PORTALLED to <body> and
     fixed-positioned beside its row, so the menu column may scroll (a short
     viewport) without clipping it — an absolutely positioned child of a
     scrolling column can never escape that column's overflow. */
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)
  // Keep the flyout on screen: a row near the bottom opens UPWARD as far as needed.
  useLayoutEffect(() => {
    const el = popRef.current
    if (!el || !anchor) return
    const h = el.offsetHeight
    const maxTop = window.innerHeight - h - 12
    if (anchor.top > maxTop) el.style.top = `${Math.max(12, maxTop)}px`
  }, [anchor, openKey])
  const close = () => { setOpenKey(null); setAnchor(null) }
  const toggle = (key: string, rowEl: HTMLElement | null) => {
    if (openKey === key) { close(); return }
    const r = rowEl?.getBoundingClientRect()
    setAnchor(r ? { top: r.top - 6, left: r.right + 10 } : null)
    setOpenKey(key)
  }
  // Scrolling or resizing moves the row out from under the flyout: close it.
  useEffect(() => {
    if (!openKey) return
    const onMove = () => close()
    window.addEventListener('resize', onMove)
    document.addEventListener('scroll', onMove, true)
    return () => { window.removeEventListener('resize', onMove); document.removeEventListener('scroll', onMove, true) }
  }, [openKey])

  // Dismiss the open flyout on outside-click / Escape.
  useEffect(() => {
    if (!openKey) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.fmrow, .fmrow__pop')) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openKey])

  const pick = (field: keyof Config) => (id: string) => {
    dispatch({ type: 'SET', patch: { [field]: id } as Partial<Config> })
    close()
  }

  // Has the brand colour diverged from the named theme's hex? Then the theme
  // is the user's OWN — show its colour name (e.g. "Burnt Orange") instead of
  // the stale preset name, and clear the grid checkmark. Pick a preset exactly
  // again and it snaps back.

  const themeHex = COLOR_THEMES[cfg.colorTheme]?.cPrimary
  const themeIsCustom = !!themeHex && cfg.cPrimary.toLowerCase() !== themeHex.toLowerCase()

  // Surface-separation coherence is GUARANTEED by the engine floor (coherence.ts
  // `guardedBorders` — a block can never go fully invisible in the OUTPUT). The old
  // per-option panel lock (slider-min raise / disabled segment) read as an unclear
  // "arrow" and was replaced by the per-row Shuffle lock above; the engine guarantee
  // stands on its own.

  // Which named kit (if any) the current config matches — the front-door anchor.

  const rows: RowDef[] = [
    {
      /* Conformance — deliberately the first row, above even Brand.
       *
       * Every control below it changes how the kit looks. This one changes what
       * it must be true of, and it is the only place the product's actual claim
       * is visible to the person using it. Choosing AAA raises the target-size
       * floor to 44px on ALL three density rungs (the engine does it in
       * buildTokens; nothing here dims or locks a rung — the per-option lock was
       * tried once and read as an unclear arrow, see the note below). Scale then
       * governs whitespace, which is what it should have governed all along. */
      key: 'conformance',
      label: 'Conformance',
      value: cap(CONFORMANCE_OPTS, cfg.conformance),
      kind: 'seg',
      opts: optsFrom(CONFORMANCE_OPTS),
      selected: cfg.conformance,
      onPick: pick('conformance'),
    },
    /* STYLE PRESETS REMOVED (2026-08-15). Seven named kits — Clean, Precision,
       Minimal, Refined, Calm, Soft, Editorial — six of them named after somebody
       else's aesthetic. Under the new proposition that row asked the wrong
       question: a public body does not need to look like Linear, and a shelf of
       vibes contradicts the idea of a base set you build on.
       DEFAULT_CONFIG is now simply where you start; the remaining knobs are the
       ones that make it YOURS (brand, fonts, radius) rather than merely
       different. See ROADMAP "the cull". */
    {
      // Brand — the HERO decision and the highest-leverage knob: one hex feeds
      // the whole OKLCH system (primary + derived secondary/accent + the auto
      // neutral tint + chart palette). Sits FIRST, under DESIGN SYSTEM. The 10
      // theme dots are quick-picks; the brand-hex field is in the flyout footer
      // (same decision — "what carries the UI").
      key: 'colorTheme',
      label: 'Brand',
      // Custom brand colour → name + live dot of YOUR colour; else the preset.
      value: themeIsCustom ? nameColor(tokens.primaryHex) : cap(COLOR_THEME_OPTS, cfg.colorTheme),
      dot: themeIsCustom ? (
        <span
          style={{
            display: 'inline-block',
            width: 14,
            height: 14,
            borderRadius: 999,
            background: tokens.primaryHex,
            boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.12)',
          }}
        />
      ) : (
        COLOR_THEME_OPTS.find((o) => o.id === cfg.colorTheme)?.viz
      ),
      kind: 'opts',
      grid: true,
      opts: COLOR_THEME_OPTS.map((o) => ({ id: o.id, label: o.cap, viz: o.viz })),
      // No grid checkmark when the colour is custom — you're off the presets.
      selected: themeIsCustom ? undefined : cfg.colorTheme,
      onPick: (id) => { dispatch({ type: 'APPLY_COLOR_THEME', id: id as ColorTheme }); close() },
      // Brand colour lives at the foot of the theme flyout (emphasised row) —
      // it's the same decision ("what carries the UI"), no separate menu row.
      footer: (
        <>
          <label className="fmbrand">
            <span className="fmbrand__label">Brand color</span>
            <span className="fmbrand__val">
              <span className="fmrow__dot" style={{ background: tokens.primaryHex }} />
              {nameColor(tokens.primaryHex)}
            </span>
            <input
              type="color"
              className="fmrow__colorinput"
              value={cfg.cPrimary}
              onChange={(e) => set('cPrimary', e.target.value)}
              aria-label="Brand color"
            />
          </label>
          {/* UIcockpit showed a note here when its kit gave primary buttons a 1px
            * boundary (--k-primary-edge) for a brand too close to the page. The
            * sandbox has no kit and touches nothing of theirs on load — identity,
            * no opinion — so there is nothing to say out loud. */}
        </>
      ),
    },
    {
      // Scale — the one size + density macro (control sizing, spacing, row/
      // toggle/cell dimensions). Does NOT touch font-weight (a fixed system
      // constant) so it never overlaps the typography controls. The curated
      // DEFAULT_CONFIG is the house style.
      key: 'scale',
      label: 'Scale',
      value: cap(SCALE_OPTS, cfg.scale),
      kind: 'slider',
      opts: optsFrom(SCALE_OPTS),
      selected: cfg.scale,
      onPick: pick('scale'),
    },
    {
      // Neutral tint — 'Auto' (default) tints the greys toward the brand hue;
      // cool/neutral/warm are explicit overrides. Sits right under Brand since
      // Auto literally derives from it.
      sec: 'Color',
      key: 'neutral',
      label: 'Neutrals',
      value: cap(NEUTRAL_OPTS, cfg.neutral),
      kind: 'seg',
      stack: true,
      opts: optsFrom(NEUTRAL_OPTS),
      selected: cfg.neutral,
      onPick: pick('neutral'),
    },
    {
      // Harmony (H1) — how the derived family (secondary/accent/decoratives/
      // neutral tint) relates to the brand. Four curated presets; the raw
      // Spread°/Expression% dials were culled (power-user noise — the presets
      // cover it, and a kit/preset is the right granularity, not a degree dial).
      key: 'harmony',
      label: 'Harmony',
      value: cap(HARMONY_OPTS, cfg.harmony),
      kind: 'opts',
      opts: optsFrom(HARMONY_OPTS),
      selected: cfg.harmony,
      onPick: (id) => {
        dispatch({ type: 'SET', patch: applyHarmonyPreset(id as Exclude<Harmony, 'custom'>) })
        close()
      },
    },
    {
      sec: 'Typography',
      key: 'fontDisplay',
      label: 'Display font',
      value: fontLabel(cfg.fontDisplay),
      kind: 'font',
      fontGroups: DISPLAY_GROUPS,
      fontValue: cfg.fontDisplay,
      onFont: (f) => set('fontDisplay', f),
    },
    {
      key: 'fontBody',
      label: 'Body font',
      value: fontLabel(cfg.fontBody),
      kind: 'font',
      fontGroups: BODY_FONTS,
      fontValue: cfg.fontBody,
      onFont: (f) => set('fontBody', f),
    },
    {
      key: 'typeScale',
      label: 'Text size',
      value: cap(TYPESCALE_OPTS, cfg.typeScale),
      kind: 'seg',
      opts: optsFrom(TYPESCALE_OPTS),
      selected: cfg.typeScale,
      onPick: pick('typeScale'),
    },
    {
      key: 'labelCase',
      label: 'Label case',
      value: cap(LABEL_CASE_OPTS, cfg.labelCase),
      kind: 'seg',
      opts: optsFrom(LABEL_CASE_OPTS),
      selected: cfg.labelCase,
      onPick: pick('labelCase'),
    },
    {
      sec: 'Shape',
      key: 'radius',
      label: 'Box radius',
      value: cap(RADIUS_OPTS, cfg.radius),
      kind: 'slider',
      opts: optsFrom(RADIUS_OPTS, VIZ_RADIUS),
      selected: cfg.radius,
      onPick: pick('radius'),
    },
    {
      sec: 'Surface',
      key: 'surfaceDepth',
      label: 'Elevation',
      value: cap(SURFACE_DEPTH_OPTS, cfg.surfaceDepth),
      kind: 'slider',
      opts: optsFrom(SURFACE_DEPTH_OPTS),
      selected: cfg.surfaceDepth,
      onPick: pick('surfaceDepth'),
    },
    {
      // Surface — how contained surfaces separate from their background. ONE axis
      // for fields + menus + the sidebar seam: Outlined (box border) · Filled
      // (tonal fill, no border) · Plain (underline / seamless). Border tunes the
      // line strength; Elevation the lift — both stay separate.
      key: 'surface',
      label: 'Surface',
      value: cap(SURFACE_OPTS, cfg.surface),
      kind: 'seg',
      stack: true,
      opts: optsFrom(SURFACE_OPTS),
      selected: cfg.surface,
      onPick: pick('surface'),
    },
    {
      // Canvas — the page background (--k-bg). White · Neutral (default muted
      // near-white) · Brand (whisper tint) · Gradient (brand mesh). Exported, and
      // applied tactically behind key blocks (e.g. the KPI strip).
      key: 'canvas',
      label: 'Background',
      value: cap(CANVAS_OPTS, cfg.canvas),
      kind: 'seg',
      stack: true,
      opts: optsFrom(CANVAS_OPTS),
      selected: cfg.canvas,
      onPick: pick('canvas'),
    },
    {
      key: 'borders',
      label: 'Border',
      value: cap(BORDER_OPTS, cfg.borders),
      kind: 'slider',
      opts: optsFrom(BORDER_OPTS),
      selected: cfg.borders,
      onPick: pick('borders'),
    },
  ]

  return (
    <aside className="panel" ref={rootRef}>
      {/* Drag grabber — only shown on phones (CSS), where the panel is a bottom
          sheet. Sticky-pinned to the sheet's top so it's always draggable. */}
      {/* NO role="button" HERE, and dropping it is the fix rather than a retreat.
          It carried role="button" with tabIndex={-1}: a control that announces
          itself as a button while no keyboard can ever reach it. That is a worse
          answer than silence — a screen-reader user is told there is a button
          and then cannot get to it.
          What this actually is: a pointer-only grab handle for the mobile sheet,
          a gesture affordance. Gestures are not announced, so it is aria-hidden.
          WCAG 2.5.7 (Dragging Movements) is satisfied because the drag is an
          ENHANCEMENT — the sheet opens and closes from the topbar toggle, which
          is a single-pointer control and keyboard-reachable. */}
      <div className="panel__grip" ref={gripRef} aria-hidden="true">
        <span className="panel__handle" />
      </div>
      <div className="card fmenu">
        <div className="fmenu__bar">
          <span className="fmenu__bar-title">Foundation</span>
          <button
            type="button"
            className="btn btn--ghost btn--icon fmenu__collapse"
            onClick={onCollapse}
            aria-label="Collapse menu"
            title="Collapse — full-width preview"
          >
            <PanelLeftClose size={15} strokeWidth={1.75} />
          </button>
        </div>
        <div className="fmenu__rows">
          {rows.map((r) => {
            // 'seg'/'slider' render the control INLINE in the row (no flyout) —
            // the configurator-pass "everything visible" surface. 'opts'/'font'
            // keep the click-to-open flyout (dot-grids, font lists, dial knobs).
            /* ONE ROW SHAPE (2026-08-15). The panel had three: inline segmented
               strips, inline sliders, and rows that open a flyout. Three patterns
               is three things to learn, and adding a knob used to add a fourth.
               It was also what kept the panel below its own target floor —
               a segment measured 64x21 where the floor is 24, while a full-width
               row cannot fail it. Borrowed from shadcn's /create, which does ten
               settings in one 52px shape and is shorter than our panel was.
               Every row is now: label · current value · chevron → opens a list. */
            return (
            <Fragment key={r.key}>
              {r.sec && <div className="menu__label fmsec">{r.sec}</div>}
              <div className={`fmrow ${openKey === r.key ? 'fmrow--open' : ''} ${lockedKeys.has(r.key) ? 'fmrow--locked' : ''}`}>
                {r.key !== 'style' && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon fmrow__lock"
                    onClick={() => onToggleLock(r.key)}
                    aria-pressed={lockedKeys.has(r.key)}
                    title={lockedKeys.has(r.key) ? 'Pinned — Shuffle keeps this. Click to unlock.' : 'Lock against Shuffle'}
                  >
                    {lockedKeys.has(r.key) ? <Lock size={11} strokeWidth={2.25} /> : <LockOpen size={11} strokeWidth={2} />}
                  </button>
                )}
                {/* The inline branch that stood here is gone with the components it
                    rendered. Putting every row on one shape made <Slider> and
                    <Segmented> unreachable, and unreachable code is not
                    simplification until it is actually removed — it just sits
                    there looking like a choice somebody still has. */}
                {(
                  <>
                    <button
                      type="button"
                      className="menu__item fmrow__head"
                      onClick={(e) => toggle(r.key, (e.currentTarget as HTMLElement).closest('.fmrow'))}
                      aria-expanded={openKey === r.key}
                    >
                      <span className="fmrow__label">{r.label}<Provenance state={provenance?.[r.label]} /></span>
                      <span className="menu__value fmrow__val" title={r.value}>
                        {r.dot && <span className="fmrow__dot fmrow__dot--viz">{r.dot}</span>}
                        <span className="fmrow__val-text">{r.value}</span>
                      </span>
                      <ChevronRight size={14} strokeWidth={2} className="fmrow__chev" />
                    </button>
                    {openKey === r.key && createPortal(
                      <div ref={popRef} className={`menu fmrow__pop ${r.kind === 'font' ? 'fmrow__pop--font' : ''}`} role="menu" style={anchor ? { position: 'fixed', top: anchor.top, left: anchor.left } : undefined}>
                        {r.kind !== 'font' ? (
                          <OptionList
                            opts={r.opts ?? []}
                            selected={r.selected}
                            grid={r.grid}
                            onPick={r.onPick ?? (() => {})}
                          />
                        ) : (
                          <FontPicker
                            inline
                            value={r.fontValue ?? ''}
                            groups={r.fontGroups ?? []}
                            onChange={(f) => { r.onFont?.(f); close() }}
                          />
                        )}
                        {r.footer}
                      </div>,
                      document.body,
                    )}
                  </>
                )}
              </div>
            </Fragment>
            )
          })}
        </div>
      </div>
      {/* Footer actions — Shuffle (roll a fresh guardrail-aware kit) + Reset (back
          to the curated default). Live here with the controls they act on, not in
          the top bar. ⌘K mirrors both; both flow through history so ⌘Z undoes them. */}
      <div className="panel__foot">
        <button type="button" className="btn btn--secondary panel__shuffle" onClick={onRandomize} title="Shuffle — roll a fresh random kit">
          <Shuffle size={15} strokeWidth={1.75} />
          <span>Shuffle</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost panel__reset"
          onClick={onReset}
          disabled={atDefault}
          title={atDefault ? 'Every knob is on the resting stand' : resetTo ? 'Reset every knob to the stand your code implied' : 'Reset every knob to the default kit'}
        >
          <RotateCcw size={15} strokeWidth={1.75} />
          <span>Reset</span>
        </button>
      </div>
    </aside>
  )
}



/** The flyout option list — vertical (or a grid for the 10 colour themes).
 *  Each option: optional viz (radius/motion hint or theme dot) + label +
 *  check on the selected one. */
function OptionList({
  opts,
  selected,
  grid,
  onPick,
}: {
  opts: Opt[]
  selected?: string
  grid?: boolean
  onPick: (id: string) => void
}) {
  return (
    <div className={grid ? 'fmpop__grid' : 'fmpop__list'}>
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`menu__item fmopt ${o.id === selected ? 'menu__item--on' : ''}`}
          aria-pressed={o.id === selected}
          onClick={() => onPick(o.id)}
          // Sub-blurb (Style kits) is a hover tooltip, not a visible line — keeps the
          // flyout a compact one-line-per-option list.
          title={typeof o.sub === 'string' ? o.sub : undefined}
        >
          {o.viz && <span className="fmopt__viz">{o.viz}</span>}
          <span className="fmopt__label">{o.label}</span>
          {o.id === selected && <Check size={14} strokeWidth={2.5} className="fmopt__check" />}
        </button>
      ))}
    </div>
  )
}
