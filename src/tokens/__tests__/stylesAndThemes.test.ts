import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../defaults'
import { COLOR_THEMES, applyColorTheme } from '../stylesAndThemes'
import { buildTokens } from '../buildTokens'
import type { Scale } from '../types'

/* The "Style" preset bundle was removed — every form facet (radius, button
 * shape, surface depth, border, motion) is now its own control, and Scale is
 * the single size/spacing/weight macro. These tests guard what remains:
 *  - Every Color theme carries a single brand hex (secondary + accent derive
 *    in buildTokens, never stored on the theme).
 *  - Color themes set NO form/typography/scale fields (orthogonality).
 *  - applyColorTheme preserves unrelated fields incl. the user's Scale.
 *  - The Scale macro produces distinct token output across its 4 steps. */

describe('COLOR_THEMES table — color contract', () => {
  it('contains exactly 10 entries with Mono first and Cobalt second', () => {
    const keys = Object.keys(COLOR_THEMES)
    expect(keys).toHaveLength(10)
    expect(keys[0]).toBe('mono')
    expect(keys[1]).toBe('cobalt')
    expect(new Set(keys)).toEqual(
      new Set(['mono', 'cobalt', 'sky', 'teal', 'jade', 'indigo', 'violet', 'coral', 'rose', 'ember']),
    )
  })

  it.each(Object.entries(COLOR_THEMES))('%s has a single brand hex (cPrimary)', (_id, attrs) => {
    expect(attrs.cPrimary).toMatch(/^#[0-9A-Fa-f]{6}$/)
    // Secondary + accent are derived in buildTokens — not stored on the theme.
    expect(attrs).not.toHaveProperty('cSecondary')
    expect(attrs).not.toHaveProperty('cAccent')
  })

  it('chromatic themes differ from Mono', () => {
    for (const id of ['cobalt', 'jade', 'ember', 'coral', 'indigo'] as const) {
      expect(COLOR_THEMES[id].cPrimary).not.toBe(COLOR_THEMES.mono.cPrimary)
    }
  })

  it('no Color theme sets form, scale or typography fields (orthogonality)', () => {
    for (const attrs of Object.values(COLOR_THEMES)) {
      expect(attrs).not.toHaveProperty('radius')
      expect(attrs).not.toHaveProperty('scale')
      expect(attrs).not.toHaveProperty('motion')
      expect(attrs).not.toHaveProperty('fontDisplay')
    }
  })
})

describe('applyColorTheme — reducer helper', () => {
  it('sets the colorTheme metadata field', () => {
    const next = applyColorTheme(DEFAULT_CONFIG, 'cobalt')
    expect(next.colorTheme).toBe('cobalt')
  })

  it('applies the brand hue from COLOR_THEMES[id]', () => {
    const next = applyColorTheme(DEFAULT_CONFIG, 'jade')
    expect(next.cPrimary).toBe(COLOR_THEMES.jade.cPrimary)
  })

  it('Mono color theme flips color mode to mono', () => {
    const tonedCfg = { ...DEFAULT_CONFIG, color: 'tone' as const }
    const next = applyColorTheme(tonedCfg, 'mono')
    expect(next.color).toBe('mono')
  })

  it('chromatic theme flips color mode to tone', () => {
    const monoCfg = { ...DEFAULT_CONFIG, color: 'mono' as const }
    const next = applyColorTheme(monoCfg, 'ember')
    expect(next.color).toBe('tone')
  })

  it('preserves form + scale fields (orthogonality)', () => {
    const customCfg = { ...DEFAULT_CONFIG, radius: 'round' as const, scale: 'compact' as const }
    const next = applyColorTheme(customCfg, 'indigo')
    expect(next.radius).toBe('round')
    expect(next.scale).toBe('compact')
  })
})

describe('Scale macro — buildTokens integration', () => {
  it('every Scale builds without errors and emits the type scale', () => {
    const scales: Scale[] = ['compact', 'default', 'comfortable']
    for (const scale of scales) {
      const tokens = buildTokens({ ...DEFAULT_CONFIG, scale })
      expect(tokens.vars['--k-type-h3']).toBeDefined()
      expect(tokens.vars['--k-type-eyebrow']).toBeDefined()
      expect(tokens.vars['--k-primary']).toBeDefined()
    }
  })

  it('larger Scale → larger control height, but UI weight stays constant', () => {
    const compact = buildTokens({ ...DEFAULT_CONFIG, scale: 'compact' })
    const comfortable = buildTokens({ ...DEFAULT_CONFIG, scale: 'comfortable' })
    const h = (s: unknown) => parseFloat(String(s))
    // size grows with Scale
    expect(h(comfortable.vars['--k-btn-h-default'])).toBeGreaterThan(h(compact.vars['--k-btn-h-default']))
    // ...but font-weight is decoupled — Scale must NOT touch --k-ui-weight
    expect(comfortable.vars['--k-ui-weight']).toBe(compact.vars['--k-ui-weight'])
  })

  it('same color theme + different Scale → same primary, different spacing', () => {
    const cfgCompact = applyColorTheme({ ...DEFAULT_CONFIG, scale: 'compact' }, 'jade')
    const cfgComfortable = applyColorTheme({ ...DEFAULT_CONFIG, scale: 'comfortable' }, 'jade')
    const tCompact = buildTokens(cfgCompact)
    const tComfortable = buildTokens(cfgComfortable)
    expect(tCompact.vars['--k-primary']).toBe(tComfortable.vars['--k-primary'])
    expect(tCompact.vars['--k-space']).not.toBe(tComfortable.vars['--k-space'])
  })
})
