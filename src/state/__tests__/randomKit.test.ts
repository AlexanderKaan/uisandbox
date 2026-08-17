import { describe, it, expect } from 'vitest'
import { randomKit } from '../randomKit'
import { DEFAULT_CONFIG } from '../../tokens/defaults'
import { buildTokens } from '../../tokens/buildTokens'

// Deterministic PRNG so the assertions are stable (Math.random is banned anyway).
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SCALES = ['compact', 'default', 'comfortable']
const RADII = ['none', 'subtle', 'soft', 'round']

describe('randomKit', () => {
  it('produces a chromatic, valid kit and preserves mode', () => {
    const dark = { ...DEFAULT_CONFIG, mode: 'dark' as const }
    const out = randomKit(dark, mulberry32(1))
    expect(out.color).toBe('tone')            // never greyscale
    expect(out.colorTheme).not.toBe('mono')
    expect(out.mode).toBe('dark')             // mode preserved
    expect(SCALES).toContain(out.scale)
    expect(RADII).toContain(out.radius)
    expect(out.fontDisplay).toBeTruthy()
    expect(out.fontBody).toBeTruthy()
  })

  it('varies across seeds (not a constant)', () => {
    const a = randomKit(DEFAULT_CONFIG, mulberry32(2))
    const b = randomKit(DEFAULT_CONFIG, mulberry32(99))
    // Some facet must differ — astronomically unlikely to be identical.
    const differs = (['colorTheme', 'scale', 'radius', 'fontDisplay', 'surface', 'typeScale'] as const)
      .some((k) => a[k] !== b[k])
    expect(differs).toBe(true)
  })

  it('every roll passes the WCAG-AA guardrail (button text on primary ≥ 4.5)', () => {
    for (let seed = 0; seed < 40; seed++) {
      const out = randomKit(DEFAULT_CONFIG, mulberry32(seed))
      expect(buildTokens(out).cc.inkOnPrimary).toBeGreaterThanOrEqual(4.5)
    }
  })
})
