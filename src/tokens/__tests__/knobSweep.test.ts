import { describe, it, expect } from 'vitest'
import { buildTokens } from '../buildTokens'
import { auditContrast } from '../extras'
import { contrast, oklchStrToHex } from '../color'
import { DEFAULT_CONFIG } from '../defaults'
import { COLOR_THEMES, applyColorTheme } from '../stylesAndThemes'

/**
 * No reachable configuration can break the floor.
 *
 * This is the gate behind the promise the panel makes. A configurator whose
 * knobs can produce a non-conforming kit is not a design system with settings,
 * it is a way to generate violations at scale — and until this file existed we
 * had no idea which of the nineteen controls could do that, only opinions.
 *
 * The sweep answered it: sixteen of nineteen do not touch contrast at ALL. They
 * are identity, and they are free. Everything that could break the floor was
 * concentrated in three places, and two of those turned out to be guards that
 * had never run:
 *
 *   · `--k-input-border` was documented in CLAUDE.md as "floored to 3:1 WCAG"
 *     and was a bare ramp step. Measured on the rendered field: 1.23 · 1.37
 *     (the default) · 1.66 · 2.98. Not one setting reached the bar, including
 *     the two the code comment named as clearing it.
 *   · `ringFloored` compared two OKLCH strings with a hex-only `contrast()`,
 *     got NaN, failed every `>= 3` test and fell through to `return primary`.
 *     It had never floored a focus ring for any kit since it was written.
 *
 * Both now hold, and the Border knob keeps an ordered range ABOVE the floor
 * instead of collapsing onto it: preference decides how far above to sit, not
 * whether there is a floor.
 */

const THEMES = Object.keys(COLOR_THEMES) as Array<keyof typeof COLOR_THEMES>
const MODES = ['light', 'dark'] as const

/* Every control a visitor can reach, with every position it can take. Add a
 * knob to the panel and add it here — an unlisted control is an unmeasured one,
 * which is the state this whole file exists to end. */
const KNOBS: Record<string, unknown[]> = {
  conformance: ['aa', 'aaa'],
  radius: ['none', 'subtle', 'soft', 'round'],
  scale: ['compact', 'default', 'comfortable'],
  typeScale: ['sm', 'md', 'lg', 'xl'],
  labelCase: ['sentence', 'caps'],
  displayWeight: ['light', 'regular', 'medium', 'semibold', 'bold'],
  iconSet: ['hairline', 'line', 'rounded', 'bold', 'solid'],
  surfaceDepth: ['flat', 'soft', 'deep'],
  surface: ['outlined', 'filled'],
  borders: ['faint', 'subtle', 'medium', 'strong'],
  canvas: ['white', 'brand', 'neutral'],
  neutral: ['auto', 'neutral'],
  harmony: ['mono', 'tonal', 'complement', 'expressive'],
  color: ['mono', 'tone'],
  fill: ['brand', 'white'], // the real union — the old list named a value that does not exist
  spread: [0, 30, 60, 90, 120],
  expression: [50, 100, 150],
}

/* Empty, and it took a measurement to get here.
 *
 * This held indigo/dark and violet/dark: the brand SOLID at 1.78:1 and 2.03:1
 * against the page. The tempting reading was "two unlucky presets, drop them".
 * Sweeping the whole reachable brand space instead — 24 hues x 4 lightnesses x 2
 * saturations x both modes — found 87 of 384 failing, in BOTH modes. Dropping
 * two of sixteen presets would have removed the only two cases this file could
 * SEE while leaving the failure one hex field away, and turned the gate green on
 * a system that had not improved. Fixed properly instead: see `--k-primary-edge`
 * in buildTokens for why the boundary moves and the brand colour does not. */
const KNOWN_OPEN = new Set<string>([])

const hx = (v: unknown) => (String(v).startsWith('#') ? String(v) : oklchStrToHex(String(v)))

function violations(cfg: Parameters<typeof buildTokens>[0]): string[] {
  const found: string[] = []
  const tk = buildTokens(cfg)
  const v = tk.vars as Record<string, string | number>
  const dark = cfg.mode === 'dark'

  for (const row of auditContrast(tk)) {
    if (row.ratio < row.required) found.push(row.label)
  }

  // The token-pair table cannot see everything: it reads named pairs, and some
  // of what the engine emits is only meaningful as a relationship. Restated
  // here so the sweep covers the same ground the matrix scan does.
  const worst = hx(v[dark ? '--k-surface-overlay' : '--k-surface-sunken'])
  for (const tier of ['--k-fg', '--k-fg-muted', '--k-fg-faint']) {
    if (contrast(hx(v[tier]), worst) < 4.5) found.push(`ink:${tier}`)
  }
  for (const role of ['primary', 'accent', 'success', 'warning', 'danger', 'info']) {
    if (contrast(hx(v[`--k-${role}-text`]), worst) < 4.5) found.push(`ink:${role}-text`)
  }
  if (contrast(hx(v['--k-primary-hover']), hx(v['--k-primary-fg'])) < 4.5) found.push('hover:button-ink')
  if (contrast(hx(v['--k-ring']), hx(v['--k-surface'])) < 3) found.push('focus:ring')

  return found
}

describe('no knob position can break the floor', () => {
  for (const [knob, options] of Object.entries(KNOBS)) {
    for (const option of options) {
      it(`${knob} = ${String(option)}`, () => {
        const broken: string[] = []
        for (const mode of MODES) {
          for (const theme of THEMES) {
            const base = applyColorTheme({ ...DEFAULT_CONFIG, mode }, theme)
            for (const label of violations({ ...base, [knob]: option })) {
              const key = `${theme}/${mode}/${label}`
              if (!KNOWN_OPEN.has(key)) broken.push(key)
            }
          }
        }
        expect([...new Set(broken)]).toEqual([])
      })
    }
  }
})

describe('the Border knob is a range above the floor, not through it', () => {
  /* Both halves matter. A knob that can go below 3:1 is a violation generator;
   * a knob clamped flat ONTO 3:1 stopped being a control — the first version of
   * this floor landed all four rungs within 0.15 of each other. */
  const RUNGS = ['faint', 'subtle', 'medium', 'strong'] as const

  for (const mode of MODES) {
    it(`ordered and legal in ${mode}`, () => {
      const ratios = RUNGS.map((borders) => {
        const tk = buildTokens({ ...DEFAULT_CONFIG, mode, borders })
        return auditContrast(tk).find((r) => r.label.startsWith('Input border'))!.ratio
      })
      for (const [i, r] of ratios.entries()) {
        expect(r, `${RUNGS[i]} clears WCAG 1.4.11`).toBeGreaterThanOrEqual(3)
      }
      for (let i = 1; i < ratios.length; i++) {
        expect(ratios[i]! - ratios[i - 1]!, `${RUNGS[i]} is a visible step past ${RUNGS[i - 1]}`)
          .toBeGreaterThan(0.2)
      }
    })
  }
})

describe('Conformance raises the floor without locking the knob', () => {
  /* The design constraint that produced this control: a hit-expanding pseudo can
   * only grow into EMPTY space. An isolated icon button has room around it; two
   * stacked 32px list rows do not, and overlapping targets are worse than small
   * ones. So a 44px target for rows means 44px rows — which is why AAA has to
   * move the density ladder rather than decorate it, and why the answer was not
   * "add rungs above comfortable" (that would impose one audience's floor on
   * everyone) nor "lock compact" (already tried, read as an unclear arrow).
   *
   * AAA lifts every rung to the 44px floor; Scale keeps governing whitespace. */
  const rem = (v: string | number) => {
    const t = String(v)
    return t.endsWith('rem') ? parseFloat(t) * 16 : parseFloat(t)
  }
  const SCALES = ['compact', 'default', 'comfortable'] as const

  for (const scale of SCALES) {
    it(`aaa floors every target at 44 — ${scale}`, () => {
      const v = buildTokens({ ...DEFAULT_CONFIG, conformance: 'aaa', scale }).vars
      for (const t of ['--k-btn-h-default', '--k-in-h-default', '--k-cal-cell', '--k-hit-min']) {
        expect(rem(v[t]!), `${t} at ${scale}`).toBeGreaterThanOrEqual(44)
      }
    })
  }

  it('aa keeps the dense ladder, and still clears the AA floor', () => {
    for (const scale of SCALES) {
      const v = buildTokens({ ...DEFAULT_CONFIG, conformance: 'aa', scale }).vars
      expect(rem(v['--k-hit-min']!), `hit-min at ${scale}`).toBeGreaterThanOrEqual(24)
      expect(rem(v['--k-btn-h-default']!), `button at ${scale}`).toBeGreaterThanOrEqual(24)
    }
    // …and it is genuinely a different ladder, or the control would be theatre.
    const a = rem(buildTokens({ ...DEFAULT_CONFIG, conformance: 'aa', scale: 'compact' }).vars['--k-btn-h-default']!)
    const b = rem(buildTokens({ ...DEFAULT_CONFIG, conformance: 'aaa', scale: 'compact' }).vars['--k-btn-h-default']!)
    expect(b).toBeGreaterThan(a)
  })

  it('Scale still governs whitespace under aaa — otherwise the knob died', () => {
    const space = SCALES.map((scale) =>
      rem(buildTokens({ ...DEFAULT_CONFIG, conformance: 'aaa', scale }).vars['--k-space']!))
    expect(new Set(space).size, `distinct --k-space values: ${space.join('/')}`).toBe(3)
  })
})

/* The Style-presets block that stood here is gone with the presets themselves
 * (2026-08-15). It swept every kit x 16 themes x 2 modes and was clean — worth
 * recording, because the cut was not made for safety. Six of the seven kits were
 * named after other companies' aesthetics, and a shelf of vibes is the wrong
 * answer to "what should a public body start from". DEFAULT_CONFIG is the
 * starting point now, and the knobs that remain are the ones that make a system
 * YOURS rather than merely different. */
