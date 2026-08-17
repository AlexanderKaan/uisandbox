import { describe, it, expect } from 'vitest'
import { buildTokens } from '../buildTokens'
import { DEFAULT_CONFIG } from '../defaults'
import { HARMONY_PRESETS } from '../harmony'
import { harmonizeHue, hexToHsl } from '../color'
import type { Config } from '../types'

/* H1 — the harmony engine. The contract under test:
 *  1. THE PRIMARY NEVER ROTATES — Spread/Expression only govern the derived
 *     family (secondary / accent / decoratives / neutral tint).
 *  2. Spread rotates the accent by the full angle, the secondary by a quarter.
 *  3. Expression multiplies the derived chroma (0 = grey family, 2 = vivid).
 *  4. Status hues harmonize ≤15° toward the brand (always-on machinery).
 *  5. The dislike guardrail lifts a derived color out of the bile zone.
 *  6. The surface-container ladder + inverse roles are emitted and coherent. */

const base: Config = { ...DEFAULT_CONFIG } // cobalt #0A84FF (hue ≈ 211), light
const at = (patch: Partial<Config>): Config => ({ ...base, ...patch })

const hueOf = (hex: string): number => hexToHsl(hex)[0]
const satOf = (hex: string): number => hexToHsl(hex)[1]
/** Shortest angular distance between two hues. */
const hueDist = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180)

describe('H1 harmony — spread', () => {
  it('primary NEVER rotates with spread', () => {
    const spreads = [0, 60, 120, 180]
    const primaries = spreads.map((spread) => buildTokens(at({ harmony: 'custom', spread })).vars['--k-primary'])
    expect(new Set(primaries).size).toBe(1)
  })

  it('accent takes the full spread rotation off the brand hue', () => {
    const brandHue = hueOf(base.cPrimary)
    for (const spread of [0, 60, 180]) {
      const tk = buildTokens(at({ harmony: 'custom', spread }))
      expect(hueDist(hueOf(tk.accentHex), (brandHue + spread) % 360), `spread ${spread}`).toBeLessThan(3)
    }
  })

  it('secondary drifts a quarter of the spread', () => {
    const brandHue = hueOf(base.cPrimary)
    const tk = buildTokens(at({ harmony: 'custom', spread: 120 }))
    expect(hueDist(hueOf(tk.secHex), (brandHue + 30) % 360)).toBeLessThan(3)
  })
})

describe('H1 harmony — expression', () => {
  it('expression 0 drains the derived family to grey; 200 saturates beyond 100', () => {
    const sec0 = satOf(buildTokens(at({ harmony: 'custom', expression: 0 })).secHex)
    const sec100 = satOf(buildTokens(at({ harmony: 'custom', expression: 100 })).secHex)
    const sec200 = satOf(buildTokens(at({ harmony: 'custom', expression: 200 })).secHex)
    expect(sec0).toBeLessThan(2)
    expect(sec200).toBeGreaterThan(sec100)
  })

  it('expression scales the neutral surface tint (chromatic surfaces)', () => {
    const chromaOf = (s: string): number => parseFloat(s.match(/oklch\([\d.]+% ([\d.]+)/)![1]!)
    const quiet = chromaOf(String(buildTokens(at({ harmony: 'custom', expression: 0 })).vars['--k-bg']))
    const vivid = chromaOf(String(buildTokens(at({ harmony: 'custom', expression: 200 })).vars['--k-bg']))
    expect(quiet).toBe(0)
    expect(vivid).toBeGreaterThan(0)
  })
})

describe('H1 harmony — always-on machinery', () => {
  it('harmonizeHue rotates toward the target, capped at 15°', () => {
    expect(harmonizeHue(145, 211)).toBe(160) // far hue → full 15° lean
    expect(harmonizeHue(205, 211)).toBe(208) // near hue → half the distance
    expect(harmonizeHue(211, 211)).toBe(211) // same hue → unchanged
  })

  it('status hues lean toward the brand (success ~160 for cobalt) but mono keeps canonical hues', () => {
    const tonal = buildTokens(base)
    expect(hueDist(hueOf(tonal.sysList[0]!.hex), 160)).toBeLessThan(2)
    const mono = buildTokens(at({ color: 'mono', colorTheme: 'mono', cPrimary: '#3b3b42' }))
    expect(hueDist(hueOf(mono.sysList[0]!.hex), 145)).toBeLessThan(2)
  })

  it('dislike guardrail: a spread that parks the accent on dark yellow-green lifts it to L70', () => {
    // Brand orange #B45309 (hue ~26) + spread 70 → accent hue ~96: the bile zone.
    const tk = buildTokens(at({ cPrimary: '#B45309', harmony: 'custom', spread: 70, expression: 100 }))
    const [h, s, l] = hexToHsl(tk.accentHex)
    expect(h).toBeGreaterThanOrEqual(90)
    expect(h).toBeLessThanOrEqual(111)
    expect(s).toBeGreaterThan(16)
    expect(l).toBeGreaterThanOrEqual(68) // lifted out of the disliked zone
  })
})

describe('H1 — surface-container ladder + inverse roles', () => {
  const okL = (s: string): number => parseFloat(s.match(/oklch\(([\d.]+)%/)![1]!)

  it('emits a monotone container ladder in light mode (lowest lightest → highest deepest)', () => {
    const v = buildTokens(base).vars
    const ladder = ['lowest', 'low', '', 'high', 'highest']
      .map((s) => okL(String(v[`--k-surface-container${s ? '-' + s : ''}`])))
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]!).toBeLessThan(ladder[i - 1]!)
  })

  it('inverse roles flip the mode: dark inverse surface + light inverse ink on a light kit', () => {
    const v = buildTokens(base).vars
    expect(okL(String(v['--k-inverse-surface']))).toBeLessThan(40)
    expect(okL(String(v['--k-inverse-fg']))).toBeGreaterThan(85)
    const vd = buildTokens(at({ mode: 'dark' })).vars
    expect(okL(String(vd['--k-inverse-surface']))).toBeGreaterThan(85)
  })
})

describe('H1 — presets', () => {
  it('every preset keeps primary text AA-safe across the chromatic themes', () => {
    for (const [id, p] of Object.entries(HARMONY_PRESETS)) {
      const tk = buildTokens(at({ harmony: id as Config['harmony'], ...p }))
      expect(tk.cc.inkOnPrimary, id).toBeGreaterThanOrEqual(4.5)
    }
  })
})
