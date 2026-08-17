import { describe, it, expect } from 'vitest'
import { buildTokens } from '../buildTokens'
import { contrast, oklchStrToHex, hexToOklch } from '../color'
import { DEFAULT_CONFIG } from '../defaults'
import { COLOR_THEMES, applyColorTheme } from '../stylesAndThemes'
import type { Config, Mode, Scale } from '../types'

const MODES: Mode[] = ['light', 'dark']
const SCALES: Scale[] = ['compact', 'default', 'comfortable']

// Pinned to Mono explicitly (NOT the default) — DEFAULT_CONFIG is now chromatic
// (Cobalt, per C1), so this stays a true greyscale-baseline regression test.
describe('buildTokens — mono baseline', () => {
  for (const mode of MODES) {
    it(`matches snapshot in ${mode} mode`, () => {
      const cfg: Config = applyColorTheme({ ...DEFAULT_CONFIG, mode }, 'mono')
      expect(buildTokens(cfg)).toMatchSnapshot()
    })
  }
})

/* Snapshot every Scale × Mode combination (size/spacing/weight macro) + the
 * chromatic themes on the default Config (color coverage). Style presets were
 * removed — Scale is the remaining macro axis. 4 scales × 2 modes = 8, plus
 * the chromatic themes × 2 modes for color coverage. */
describe('buildTokens — Scale coverage (with Mono)', () => {
  for (const scale of SCALES) {
    for (const mode of MODES) {
      it(`scale ${scale} in ${mode} mode`, () => {
        const base: Config = { ...DEFAULT_CONFIG, mode, scale }
        const cfg = applyColorTheme(base, 'mono')
        expect(buildTokens(cfg)).toMatchSnapshot()
      })
    }
  }
})

describe('buildTokens — Color theme coverage (on default)', () => {
  for (const themeId of Object.keys(COLOR_THEMES) as Array<keyof typeof COLOR_THEMES>) {
    if (themeId === 'mono') continue // covered above
    for (const mode of MODES) {
      it(`theme ${themeId} in ${mode} mode`, () => {
        const base: Config = { ...DEFAULT_CONFIG, mode }
        const cfg = applyColorTheme(base, themeId)
        expect(buildTokens(cfg)).toMatchSnapshot()
      })
    }
  }
})

describe('buildTokens — invariants', () => {
  it('produces 60+ CSS variables for every Scale', () => {
    for (const scale of SCALES) {
      const cfg: Config = { ...DEFAULT_CONFIG, scale }
      const tk = buildTokens(cfg)
      expect(Object.keys(tk.vars).length).toBeGreaterThanOrEqual(50)
    }
  })

  it('primary text passes WCAG AA (>=4.5) for every Color theme in both modes', () => {
    for (const themeId of Object.keys(COLOR_THEMES) as Array<keyof typeof COLOR_THEMES>) {
      for (const mode of MODES) {
        const base: Config = { ...DEFAULT_CONFIG, mode }
        const cfg = applyColorTheme(base, themeId)
        const tk = buildTokens(cfg)
        expect(tk.cc.inkOnPrimary, `${themeId} ${mode}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('flat surface depth is the Linear look: subtle 1px border, zero shadow', () => {
    const cfg: Config = { ...DEFAULT_CONFIG, surfaceDepth: 'flat' }
    const tk = buildTokens(cfg)
    expect(tk.vars['--k-shadow-sm']).toBe('none')
    expect(tk.vars['--k-bw']).toBe('1px')
  })

  it('Border control sets border prominence independently of depth', () => {
    const okL = (s: string): number => parseFloat(s.match(/oklch\(([\d.]+)%/)![1]!)
    const faint = String(buildTokens({ ...DEFAULT_CONFIG, borders: 'faint' }).vars['--k-border'])
    const strong = String(buildTokens({ ...DEFAULT_CONFIG, borders: 'strong' }).vars['--k-border'])
    // strong = darker (lower L) = more visible than faint
    expect(okL(strong)).toBeLessThan(okL(faint))
    // and it does NOT depend on surface depth (same border at flat vs deep)
    const flatBorder = buildTokens({ ...DEFAULT_CONFIG, borders: 'medium', surfaceDepth: 'flat' }).vars['--k-border']
    const deepBorder = buildTokens({ ...DEFAULT_CONFIG, borders: 'medium', surfaceDepth: 'deep' }).vars['--k-border']
    expect(flatBorder).toBe(deepBorder)
  })

  it('deep surface depth produces real drop shadows', () => {
    const cfg: Config = { ...DEFAULT_CONFIG, surfaceDepth: 'deep' }
    const tk = buildTokens(cfg)
    expect(tk.vars['--k-shadow-md']).not.toBe('none')
    expect(tk.vars['--k-bw']).toBe('1px')
  })

  it('Elevation is decoupled from the ramp — flat/soft/deep share the surface greys', () => {
    const base = buildTokens({ ...DEFAULT_CONFIG, surfaceDepth: 'soft' }).vars['--k-surface']
    const flat = buildTokens({ ...DEFAULT_CONFIG, surfaceDepth: 'flat' }).vars['--k-surface']
    const deep = buildTokens({ ...DEFAULT_CONFIG, surfaceDepth: 'deep' }).vars['--k-surface']
    expect(flat).toBe(base)
    expect(deep).toBe(base)
  })

  it('retired surfaceDepth keys fall back gracefully (raised→soft, layered→deep)', () => {
    const soft = JSON.stringify(buildTokens({ ...DEFAULT_CONFIG, surfaceDepth: 'soft' }).vars)
    const raised = JSON.stringify(buildTokens({ ...DEFAULT_CONFIG, surfaceDepth: 'raised' as never }).vars)
    expect(raised).toBe(soft)
    const deep = String(buildTokens({ ...DEFAULT_CONFIG, surfaceDepth: 'deep' }).vars['--k-shadow-md'])
    const layered = String(buildTokens({ ...DEFAULT_CONFIG, surfaceDepth: 'layered' as never }).vars['--k-shadow-md'])
    expect(layered).toBe(deep)
  })

  it('shadows are tinted toward the brand hue (not generic black) in light mode', () => {
    const cfg: Config = { ...DEFAULT_CONFIG, color: 'tone', cPrimary: '#2563EB', surfaceDepth: 'deep' }
    const tk = buildTokens(cfg)
    // shadowFor interpolates the brand-hued shTone via hsl(H S% L% / a)
    expect(tk.vars['--k-shadow-md']).toContain('hsl(')
  })

  it('mono mode flattens brand saturation to zero', () => {
    const cfg: Config = { ...DEFAULT_CONFIG, color: 'mono', cPrimary: '#5654c8' }
    const tk = buildTokens(cfg)
    // mono primary should be a neutral gray — in OKLCH that means zero chroma
    // (the middle component), regardless of cPrimary's input hue/saturation.
    expect(tk.vars['--k-primary']).toMatch(/^oklch\([\d.]+% 0\.0000 /)
  })
})

/**
 * The accessibility decisions from the design-system study, pinned.
 *
 * These are not implementation details — they are positions the study argued
 * for, and a position that lives only in a commit message is a position that
 * gets refactored away by someone acting in good faith.
 */
describe('the WCAG floors the study settled on', () => {
  const at = (scale: Scale) => buildTokens({ ...DEFAULT_CONFIG, scale }).vars
  const px = (v: string | number) => {
    const t = String(v)
    return t.endsWith('rem') ? parseFloat(t) * 16 : parseFloat(t)
  }

  it('names the touch-target floor once, off the spacing scale', () => {
    // A hit target is a guarantee about a finger, not a rhythm — re-scaling it
    // with density is the bug this token exists to prevent, so it must NOT move
    // between the rungs even though every spacing value does.
    const sizes = (['compact', 'default', 'comfortable'] as Scale[]).map((s) => px(at(s)['--k-hit-min']!))
    expect(new Set(sizes).size).toBe(1)
    expect(sizes[0]).toBe(24) // WCAG 2.5.8 AA
  })

  it('lets a team REACH the 44px AAA bar, without making it the default', () => {
    // Every accessibility-led system in the study holds itself to 2.5.5 AAA.
    // Our ladder used to stop at 40, so the stricter bar was unreachable at any
    // setting; 44 everywhere would bloat the dense data UI we also serve.
    expect(px(at('comfortable')['--k-btn-h-default']!)).toBeGreaterThanOrEqual(44)
    expect(px(at('default')['--k-btn-h-default']!)).toBeLessThan(44)
  })

  it('keeps every text tier legible AND tellable apart', () => {
    // Flooring faint to 4.5:1 once collapsed it to within 1.7% of muted: both
    // legal, visually one colour, and the three-tier ramp destroyed silently.
    const t = at('default')
    const L = (v: string | number) => parseFloat(/oklch\(([\d.]+)/.exec(String(v))?.[1] ?? '0')
    const [fg, muted, faint] = [L(t['--k-fg']!), L(t['--k-fg-muted']!), L(t['--k-fg-faint']!)]
    expect(muted - fg).toBeGreaterThan(0.1)
    expect(faint - muted).toBeGreaterThan(0.05)
  })
})

/* ── Ink is legible in BOTH polarities, on every theme ──────────────────────
 *
 * Written after the matrix scan (`npm run a11y:matrix`) found 526 contrast
 * violations in dark mode while light mode measured a clean zero — for months,
 * because nothing ever ran the other polarity. Two separate polarity bugs sat
 * under it, and the second one only became visible once the first was fixed:
 *
 *   1. the ink floor picked its worst-case surface as the DARKEST one, which is
 *      the right extreme for dark ink on light and exactly the wrong one for
 *      light ink on dark, so in dark mode the floor asked a question whose
 *      answer was always yes and never engaged;
 *   2. the tier-gap below it measured separation as `faint - muted` — positive
 *      only in light mode — so in dark it fired every time and pushed muted 0.1
 *      BELOW faint, throwing away the floor immediately above it.
 *
 * A snapshot cannot catch either: both produce perfectly stable output. Only a
 * contrast assertion can, so the rule lives here as arithmetic rather than as a
 * comment about intent. `-text` covers the third family — semantic colours used
 * as ink, which had no floor at all because the fill token was doing both jobs.
 */
describe('ink reaches 4.5:1 on the worst surface it can land on', () => {
  // `vars` mixes strings and numbers (z-index, weights), so normalise at the door.
  const ratio = (a: string | number, b: string | number) =>
    contrast(oklchStrToHex(String(a)), oklchStrToHex(String(b)))

  for (const mode of MODES) {
    for (const themeId of Object.keys(COLOR_THEMES) as Array<keyof typeof COLOR_THEMES>) {
      it(`${themeId} / ${mode}`, () => {
        const v = buildTokens(applyColorTheme({ ...DEFAULT_CONFIG, mode }, themeId)).vars
        // In light the deepest surface is the hardest for dark ink; in dark it
        // is the shallowest. Same reasoning as the engine, restated independently
        // so a change there has to survive being disagreed with here.
        const worst = mode === 'dark' ? v['--k-surface-overlay']! : v['--k-surface-sunken']!

        for (const tier of ['--k-fg', '--k-fg-muted', '--k-fg-faint']) {
          expect(ratio(v[tier]!, worst), `${tier} on ${worst}`).toBeGreaterThanOrEqual(4.5)
        }
        for (const role of ['primary', 'accent', 'success', 'warning', 'danger', 'info']) {
          const t = `--k-${role}-text`
          expect(v[t], `${t} must exist`).toBeTruthy()
          expect(ratio(v[t]!, worst), `${t} on ${worst}`).toBeGreaterThanOrEqual(4.5)
        }

        // …and the three neutral tiers stay tellable apart, in whichever
        // direction adds contrast for this polarity. A legal ramp that renders
        // as one colour has traded the design away without saying so.
        const L = (s: string | number): number => hexToOklch(oklchStrToHex(String(s)))[0]
        const main = L(v['--k-fg']!), muted = L(v['--k-fg-muted']!), faint = L(v['--k-fg-faint']!)
        if (mode === 'dark') {
          expect(main).toBeGreaterThan(muted)
          expect(muted).toBeGreaterThan(faint)
        } else {
          expect(main).toBeLessThan(muted)
          expect(muted).toBeLessThan(faint)
        }
      })
    }
  }
})

/* ── A hover state cannot be less readable than the thing it responds to ────
 *
 * `--k-primary-fg` was clamped against `--k-primary` and never re-checked
 * against the step the button actually swaps to: `.btn--primary:hover` moves the
 * background to `--k-primary-hover` and keeps the same ink. On the default kit in
 * dark mode the label read 4.63:1 at rest and 3.76:1 under the cursor. No scan we
 * run could catch it — axe measures rendered text and does not hover — and no
 * snapshot could, because the value was stable and simply wrong.
 *
 * Flooring that step then broke `.btn--link:hover`, which was borrowing the same
 * token for TEXT: one token cannot be a fill and a piece of ink at once. Hence
 * the third assertion — link hover has to stay legible AND stay visible, since a
 * legal hover nobody can see is not a hover.
 */
describe('hover states stay legible and stay visible', () => {
  const hx = (s: string | number) => (String(s).startsWith('#') ? String(s) : oklchStrToHex(String(s)))

  for (const mode of MODES) {
    for (const themeId of Object.keys(COLOR_THEMES) as Array<keyof typeof COLOR_THEMES>) {
      it(`${themeId} / ${mode}`, () => {
        const v = buildTokens(applyColorTheme({ ...DEFAULT_CONFIG, mode }, themeId)).vars
        const worst = hx(v[mode === 'dark' ? '--k-surface-overlay' : '--k-surface-sunken']!)

        // the primary button keeps its ink when the fill changes under the cursor
        expect(contrast(hx(v['--k-primary-hover']!), hx(v['--k-primary-fg']!)),
          'button ink on the hover fill').toBeGreaterThanOrEqual(4.5)

        // the link's hover ink is still ink
        expect(contrast(hx(v['--k-primary-text-hover']!), worst),
          'link hover on the worst surface').toBeGreaterThanOrEqual(4.5)

        // …and differs from rest by enough to be seen
        const dL = Math.abs(hexToOklch(hx(v['--k-primary-soft-fg']!))[0]
                          - hexToOklch(hx(v['--k-primary-text-hover']!))[0])
        expect(dL, 'lightness step from the resting link colour').toBeGreaterThanOrEqual(0.05)
      })
    }
  }
})
