import type { CSSProperties } from 'react'
import type { AuditHandoff } from './handoff'

/**
 * How a fixture's measured values become CSS custom properties.
 *
 * Extracted from the view so the conformance harness exercises the SHIPPING
 * function rather than a copy of it. A harness that tests its own duplicate of
 * the logic reports green while the product renders a 12,000px button — which
 * is exactly the defect this whole exercise exists to catch.
 */
/** Blend two hexes — used only to derive the muted/faint steps a kit needs
 *  from the two ends we actually measured, rather than inventing a third. */
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('')
}

/**
 * Their palette, shared across every cell.
 *
 * An app has ONE grey ramp — its surfaces, borders and text are the same
 * everywhere — so painting these per cell would invent a chaos they do not
 * have. Sorted by luminance and mapped by role, because the engine reports the
 * greys by frequency and frequency says nothing about which one is a page and
 * which one is a word.
 *
 * Leaving them out entirely was the bug: the "before" kept OUR neutrals and our
 * type, so a foreign app rendered in our skin, and the switch looked like it
 * barely did anything.
 */
const chan = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]

const relLum = ([r, g, b]: [number, number, number]) => {
  const f = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const contrast = (a: string, b: string) => {
  const [x, y] = [relLum(chan(a)), relLum(chan(b))]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Blend `ink` toward `bg` as far as it can go while staying above `floor`. */
function fadeToFloor(ink: string, bg: string, floor: number) {
  let best = ink
  for (let t = 0.05; t <= 0.6; t += 0.05) {
    const candidate = mix(ink, bg, t)
    if (contrast(candidate, bg) < floor) break
    best = candidate
  }
  return best
}

export function paletteStyle(audit: AuditHandoff): Record<string, string> {
  const out: Record<string, string> = {}
  const { bg, fg, border } = audit.spread
  if (bg && fg && border) {
    /* The WHOLE neutral family, from the two colours we actually measured.
     *
     * Overriding a handful of tokens and leaving their siblings on the kit's
     * values is what left our dark ink on Zero's black page: their surface was
     * theirs, the badge's foreground was still ours. A palette is a system —
     * take half of it and the halves fight.
     *
     * Every step mixes FROM the page TOWARD the ink, which is polarity-agnostic
     * by construction: that direction is darker in a light app and lighter in a
     * dark one, so Zero and formbricks need no special case between them. */
    const step = (t: number) => mix(bg, fg, t)

    out['--k-bg'] = bg
    out['--k-surface'] = bg
    out['--k-surface-2'] = step(0.03)
    out['--k-chrome-bg'] = step(0.02)
    out['--k-surface-sunken'] = step(0.06)
    out['--k-surface-raised'] = bg
    out['--k-surface-overlay'] = bg
    out['--k-surface-container-lowest'] = bg
    out['--k-surface-container-low'] = step(0.03)
    out['--k-surface-container'] = step(0.05)
    out['--k-surface-container-high'] = step(0.08)
    out['--k-surface-container-highest'] = step(0.11)
    out['--k-track'] = step(0.08)
    out['--k-input-bg'] = step(0.04)
    out['--k-neutral'] = step(0.06)
    out['--k-disabled-bg'] = step(0.04)
    out['--k-state-hover'] = step(0.05)
    out['--k-state-press'] = step(0.12)

    out['--k-border'] = border
    out['--k-input-border'] = border

    out['--k-fg'] = fg
    out['--k-neutral-fg'] = fg
    /* Inks are DERIVED, so they are derived to a floor rather than to a fixed
     * blend. A flat 28%/50% mix put every secondary label at 2.7–2.9:1 across
     * all five fixtures — a failure we would have been introducing ourselves
     * while claiming to show them their own app. */
    /* Floored against the most extreme surface in this family, not against the
     * page. `.nav-group` and `.cmdp__shortcut` sit on sunken and container
     * surfaces, so a floor computed on the page alone let them land at 2.7:1 —
     * legible where it was measured and not where it is used. */
    const deepest = step(0.11)
    out['--k-fg-muted'] = fadeToFloor(fg, deepest, 4.5)
    out['--k-fg-faint'] = fadeToFloor(fg, deepest, 3)
    out['--k-disabled-fg'] = fadeToFloor(fg, deepest, 3)

    // The inverse pair simply swaps the two ends we measured.
    out['--k-inverse-surface'] = fg
    out['--k-inverse-fg'] = bg
    out['--k-inverse-fg-muted'] = fadeToFloor(bg, fg, 3)
  }
  const t = [...(audit.spread.type || [])]
  if (t.length) {
    const px = (v: string) => parseFloat(v)
    const sorted = [...new Set(t)].sort((a, b) => px(a) - px(b))
    out['--k-type-small'] = sorted[0]!
    out['--k-type-body'] = sorted[Math.min(1, sorted.length - 1)]!
    out['--k-type-h3'] = sorted[sorted.length - 1]!
  }
  return out
}

/** And the part that genuinely varies per component: shape, depth, accent. */
export function driftStyle(audit: AuditHandoff, i: number): CSSProperties {
  const s = audit.spread
  const pick = (list: string[], n: number) => (list.length ? list[n % list.length] : undefined)
  const out: Record<string, string> = { ...paletteStyle(audit) }
  const r = pick(s.radius, i)
  const sh = pick(s.shadow, i)
  const c = pick(s.color, i)
  const sp = pick(s.spacing, i)
  if (r) {
    /* A pill value is a BUTTON radius, never a box one. Dealing 9999px into
     * --k-radius-md blew a button to 12,000px wide: the recipe clamps its
     * pill-aware padding with a min(), but `--k-radius-md * 0.75` sits
     * unclamped inside the same max() — reasonably, since no card is a pill.
     * The value is genuinely theirs; putting it on a token it cannot belong to
     * was mine. Box radii take the largest measured value that is actually a
     * box radius; the pill still reaches the button. */
    const px = parseFloat(r)
    const isPill = /px$/.test(r) && px >= 100
    const box = isPill ? (s.radius.find((v) => parseFloat(v) < 100) ?? '8px') : r
    out['--k-radius-sm'] = box
    out['--k-radius-md'] = box
    out['--k-radius-lg'] = box
    out['--k-radius-button'] = r
  }
  if (sh) { out['--k-shadow-sm'] = sh; out['--k-shadow-md'] = sh }
  if (c) {
    out['--k-primary'] = c; out['--k-accent'] = c; out['--k-fill'] = c; out['--k-ring'] = c
    out['--k-primary-soft'] = c + '22'
    out['--k-state-selected-bg'] = c + '22'
    /* And the INK that goes on it. Setting a fill without its foreground left
     * white text on documenso's lime at 1.5:1 — we would have been introducing
     * an unreadable button while claiming to show them their own app. The kit
     * derives readable ink for a real config; the drift path has to as well. */
    out['--k-primary-fg'] = contrast('#ffffff', c) >= contrast('#111111', c) ? '#ffffff' : '#111111'
    out['--k-accent-fg'] = out['--k-primary-fg']!
    out['--k-fill-fg'] = out['--k-primary-fg']!
    /* The brand is used as INK too — `.toast__action` and the selected row read
     * `--k-primary` for text — and a light brand cannot be ink. documenso's
     * lime landed at 1.7:1 on their white page. Darkening it toward their own
     * text colour until it clears 4.5:1 is what any designer does with a pale
     * brand, and it keeps the hue theirs; leaving it would mean shipping an
     * unreadable label while claiming to show them their own app. */
    const page = audit.spread.bg
    const ink = audit.spread.fg
    if (page && ink && contrast(c, page) < 4.5) {
      let readable = c
      for (let t = 0.1; t <= 0.9; t += 0.1) {
        readable = mix(c, ink, t)
        if (contrast(readable, page) >= 4.5) break
      }
      out['--k-primary'] = readable
      out['--k-state-selected-fg'] = readable
    } else {
      out['--k-state-selected-fg'] = c
    }
  }
  if (sp) { out['--k-s-8'] = sp; out['--k-s-12'] = sp }
  return out as CSSProperties
}

