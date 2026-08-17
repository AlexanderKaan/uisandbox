import { describe, it, expect } from 'vitest'
import { paletteStyle, driftStyle } from '../intake/drift'
import type { AuditHandoff } from '../intake/handoff'

/**
 * This is where a visitor's measured values become the pixels they judge us on,
 * and every rule in it was learned from a real repo rather than designed up
 * front: a pill radius that blew a button to 12,000px, white text on a lime
 * brand, our dark ink on a black page, secondary labels at 2.7:1.
 *
 * The conformance harness catches these in the browser, but it needs a browser.
 * These pin the same rules where the build gate can see them.
 */

const spread = (over: Partial<AuditHandoff['spread']> = {}): AuditHandoff['spread'] => ({
  radius: [], shadow: [], spacing: [], color: [], neutral: [], type: [],
  bg: null, fg: null, border: null, polarity: null, ...over,
})
const audit = (s: Partial<AuditHandoff['spread']>): AuditHandoff => ({
  hash: '', rootName: 'x', filesRead: 1, parsed: 1, kinds: {}, shell: {}, variants: {},
  spread: spread(s), distinct: { radius: 0, shadow: 0, color: 0, spacing: 0 },
  treatments: 0, singletons: 0, score: 0, provenance: {}, derived: {},
})

const chan = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = (h: string) => {
  const f = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const [r, g, b] = chan(h) as [number, number, number]
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const LIGHT = { bg: '#ffffff', fg: '#111111', border: '#e5e5e5' }
const DARK = { bg: '#000000', fg: '#ffffff', border: '#2a2a2a' }

describe('the palette works in both polarities without a special case', () => {
  it('steps AWAY from the page in a light app', () => {
    const p = paletteStyle(audit(LIGHT))
    // Surfaces get darker as they recede.
    expect(lum(p['--k-surface-sunken']!)).toBeLessThan(lum(p['--k-surface']!))
    expect(lum(p['--k-surface-container-highest']!)).toBeLessThan(lum(p['--k-surface-sunken']!))
  })

  it('steps away from the page in a DARK app, which is the same rule', () => {
    // Mixing from page toward ink is lighter here — Zero and plane need no
    // branch of their own, and a branch is what would eventually rot.
    const p = paletteStyle(audit(DARK))
    expect(lum(p['--k-surface-sunken']!)).toBeGreaterThan(lum(p['--k-surface']!))
    expect(p['--k-fg']).toBe('#ffffff')
    expect(p['--k-inverse-fg']).toBe('#000000')
  })

  it('keeps secondary ink readable on the DEEPEST surface, not just the page', () => {
    // `.nav-group` sits on a sunken surface; a floor computed on the page alone
    // left it at 2.7:1 — legible where measured, not where used.
    for (const base of [LIGHT, DARK]) {
      const p = paletteStyle(audit(base))
      const deepest = p['--k-surface-container-highest']!
      expect(ratio(p['--k-fg-muted']!, deepest)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(p['--k-fg-faint']!, deepest)).toBeGreaterThanOrEqual(3)
    }
  })

  it('says nothing when the engine measured nothing', () => {
    // Half a palette is worse than none: the halves fight.
    expect(paletteStyle(audit({}))['--k-surface']).toBeUndefined()
  })
})

describe('values that cannot go where they were measured', () => {
  it('keeps a pill radius off the box tokens', () => {
    // 9999px on --k-radius-md blew a button to 12,000px wide: the recipe clamps
    // its pill-aware padding, but `--k-radius-md * 0.75` sits unclamped in the
    // same max() — reasonably, since no card is a pill.
    const d = driftStyle(audit({ ...LIGHT, radius: ['9999px', '8px'] }), 0) as Record<string, string>
    expect(d['--k-radius-button']).toBe('9999px')
    expect(d['--k-radius-md']).toBe('8px')
  })

  it('falls back to a sane box radius when every measured one is a pill', () => {
    const d = driftStyle(audit({ ...LIGHT, radius: ['999px'] }), 0) as Record<string, string>
    expect(parseFloat(d['--k-radius-md']!)).toBeLessThan(100)
  })

  it('derives readable ink for whatever fill it was handed', () => {
    const onLime = driftStyle(audit({ ...LIGHT, color: ['#a2e771'] }), 0) as Record<string, string>
    const onNavy = driftStyle(audit({ ...LIGHT, color: ['#1e3a8a'] }), 0) as Record<string, string>
    expect(ratio(onLime['--k-primary-fg']!, '#a2e771')).toBeGreaterThan(4.5)
    expect(ratio(onNavy['--k-primary-fg']!, '#1e3a8a')).toBeGreaterThan(4.5)
  })

  it('darkens a brand that is also used as ink', () => {
    // `.toast__action` reads --k-primary for TEXT. documenso's lime landed at
    // 1.7:1 on their own white page.
    const d = driftStyle(audit({ ...LIGHT, color: ['#a2e771'] }), 0) as Record<string, string>
    expect(ratio(d['--k-primary']!, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('leaves a brand alone when it is already readable', () => {
    const d = driftStyle(audit({ ...LIGHT, color: ['#1e3a8a'] }), 0) as Record<string, string>
    expect(d['--k-primary']).toBe('#1e3a8a')
  })
})

describe('what varies per component, and what must not', () => {
  it('deals a different shape to each cell', () => {
    const s = { ...LIGHT, radius: ['2px', '14px', '24px'] }
    const seen = [0, 1, 2].map((i) => (driftStyle(audit(s), i) as Record<string, string>)['--k-radius-md'])
    expect(new Set(seen).size).toBe(3)
  })

  it('gives every cell the SAME surfaces', () => {
    // An app has one grey ramp. Varying it per cell would invent a chaos they
    // do not have — the claim is about the spread, not about that element.
    const s = { ...LIGHT, radius: ['2px', '14px'], color: ['#f00', '#00f'] }
    const a = driftStyle(audit(s), 0) as Record<string, string>
    const b = driftStyle(audit(s), 1) as Record<string, string>
    expect(a['--k-surface']).toBe(b['--k-surface'])
    expect(a['--k-fg']).toBe(b['--k-fg'])
    expect(a['--k-radius-md']).not.toBe(b['--k-radius-md'])
  })
})
