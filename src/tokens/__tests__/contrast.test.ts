import { describe, it, expect } from 'vitest'
import { buildTokens } from '../buildTokens'
import { auditContrast } from '../extras'
import { DEFAULT_CONFIG } from '../defaults'
import type { Config } from '../types'

/* Regression guard for the OKLCH contrast bug.
 *
 * The token engine emits colours as `oklch(...)` strings (the `hsl()` helper
 * authors in HSL but emits OKLCH). The WCAG audit's `toHex()` once only parsed
 * `#hex` and `hsl(...)`, so every oklch token silently resolved to #000000 —
 * the audit then compared black-on-black (1.00:1) and reported a perfectly
 * accessible theme as "3 of 16 pass". These tests fail loudly if oklch parsing
 * regresses again. */
describe('auditContrast — OKLCH tokens resolve to real ratios', () => {
  const themes: Array<[string, Partial<Config>]> = [
    ['mono', { color: 'mono' }],
    ['tone (blue brand)', { color: 'tone', cPrimary: '#2563eb' }],
  ]

  for (const [name, ov] of themes) {
    const pairs = auditContrast(buildTokens({ ...DEFAULT_CONFIG, ...ov } as Config))
    const byLabel = (l: string) => pairs.find((p) => p.label === l)!

    it(`${name}: body text on background is high-contrast, not the black-on-black 1.00:1 fallback`, () => {
      const body = byLabel('Body text on background')
      // Near-black ink on near-white bg must be well above the AA threshold.
      // 1.00:1 here = the oklch-parse regression.
      expect(body.ratio).toBeGreaterThan(10)
      expect(body.passes).toBe(true)
    })

    it(`${name}: every pair passes at default — except the input boundary, now a filled-field pattern (3:1 achievable at Borders:Strong)`, () => {
      // Inputs are FILLED (brand-tinted --k-input-bg, Material/shadcn-muted), so
      // the border can stay soft + responsive to the Border control. Strict WCAG
      // 1.4.11 (3:1) on the input boundary is achievable at Borders:Strong (the
      // badge surfaces a remedy at lighter steps). Every OTHER audited pair must
      // still pass at the default — this guards the oklch-parse regression.
      expect(byLabel('Input border against background')).toBeDefined()
      expect(pairs.filter((p) => p.label !== 'Input border against background').every((p) => p.passes)).toBe(true)
      const strong = auditContrast(buildTokens({ ...DEFAULT_CONFIG, ...ov, borders: 'strong' } as Config))
      expect(strong.find((p) => p.label === 'Input border against background')!.passes).toBe(true)
    })
  }
})
