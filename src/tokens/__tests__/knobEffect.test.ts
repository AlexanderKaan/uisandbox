import { describe, it, expect } from 'vitest'
import { buildTokens } from '../buildTokens'
import { DEFAULT_CONFIG } from '../defaults'
import { applyHarmonyPreset } from '../harmony'

/**
 * Every option must actually do something.
 *
 * `knobSweep` asks whether a setting can break a floor — no. This asks the
 * question a cull needs: does each position change anything at all? A control
 * that produces an identical kit is a decision the user is asked to make for
 * nothing, and in a system whose promise is that the default is already right,
 * an inert knob is worse than no knob.
 *
 * ⚠️ Written at the TOKEN level after a screenshot version wasted a pass. That
 * one rendered the components wall per option and compared pixels, and it
 * reported palette, harmony and motion as changing nothing — because their
 * effect lands in chart and accent colours below the captured viewport. The
 * lesson is the recurring one: an instrument that measures the wrong surface
 * produces confident nonsense, and here it would have argued for cutting three
 * working controls.
 *
 * ⚠️ And harmony has to be applied the way the PANEL applies it. Setting
 * `harmony` alone changes nothing, because the hue maths reads `spread` and
 * `expression`; the panel dispatches `applyHarmonyPreset()`, which sets all
 * three. Testing the field in isolation says the knob is dead. It is not.
 */

const KNOBS: Record<string, string[]> = {
  scale: ['compact', 'default', 'comfortable'],
  typeScale: ['sm', 'md', 'lg', 'xl'],
  labelCase: ['sentence', 'caps'],
  radius: ['none', 'subtle', 'soft', 'round'],
  surfaceDepth: ['flat', 'soft', 'deep'],
  surface: ['outlined', 'filled'],
  canvas: ['white', 'neutral', 'brand'],
  borders: ['faint', 'subtle', 'medium', 'strong'],
  neutral: ['auto', 'neutral'],
  conformance: ['aa', 'aaa'],
}

/* NOT here, and the reason is the point of the file: `iconSet` changes no token
 * at all — it selects which icon COMPONENTS render, so its effect lives in the
 * SVG output rather than in `--k-*`. A token-level test would report it as inert
 * and argue for cutting a knob that plainly works. Different surface, different
 * instrument; the honest move is to exclude it and say so rather than let it
 * fail into a exemption nobody reads. */

const varsFor = (patch: Record<string, unknown>) =>
  buildTokens({ ...DEFAULT_CONFIG, ...patch } as Parameters<typeof buildTokens>[0]).vars as Record<string, unknown>

const changedCount = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.keys(b).filter((k) => String(a[k]) !== String(b[k])).length

describe('every knob option changes the kit', () => {
  const base = varsFor({})

  for (const [knob, values] of Object.entries(KNOBS)) {
    it(`${knob} — each position produces a different kit`, () => {
      const seen = new Map<string, string>()
      for (const value of values) {
        const vars = varsFor({ [knob]: value })
        const fingerprint = JSON.stringify(vars)
        const twin = seen.get(fingerprint)
        expect(twin, `${knob}: "${value}" produces a kit identical to "${twin}"`).toBeUndefined()
        seen.set(fingerprint, value)

        // The default position legitimately changes nothing versus itself.
        if (String((DEFAULT_CONFIG as unknown as Record<string, unknown>)[knob]) !== value) {
          expect(changedCount(base, vars), `${knob}="${value}" changed no token`).toBeGreaterThan(0)
        }
      }
    })
  }

  it('harmony — applied the way the panel applies it', () => {
    const seen = new Set<string>()
    for (const h of ['mono', 'tonal', 'complement', 'expressive'] as const) {
      const vars = varsFor(applyHarmonyPreset(h) as Record<string, unknown>)
      const fp = JSON.stringify(vars)
      expect(seen.has(fp), `harmony "${h}" duplicates another preset`).toBe(false)
      seen.add(fp)
    }
  })
})
