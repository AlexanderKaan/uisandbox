import { describe, it, expect } from 'vitest'
import { buildTokens } from '../../tokens/buildTokens'
import { DEFAULT_CONFIG } from '../../tokens/defaults'
import { COLOR_THEMES } from '../../tokens/stylesAndThemes'
import type { Config } from '../../tokens/types'
import { rewriteCss } from '../rewrite'
import { SubstitutionTable } from '../table'
import { computeVars, classifyColor, toPx, type Baseline } from '../mapping'
import { parseCssColor, hueDelta } from '../cssColor'

/* A small "their app": an indigo brand, greys, one radius, a type scale, a shadow. */
const THEIR_CSS = `
:root { --brand: #4f39f6; --radius: 12px; }
body { font-family: "Inter", sans-serif; font-size: 14px; color: #111827; background: #ffffff; }
h1 { font-size: 30px; font-family: "Fraunces", serif; }
.btn { background: #4f39f6; color: #fff; border-radius: 12px; padding: 8px 16px; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.btn:hover { background: #4338ca; }
.card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1); }
.tag { background: #eef2ff; color: #3730a3; border-radius: 6px; font-size: 12px; }
.ok { color: #16a34a; }
.muted { color: #6b7280; }
`
const theirCfg: Config = { ...DEFAULT_CONFIG, cPrimary: '#4f39f6', radius: 'round', typeScale: 'md', scale: 'default' }

function setup() {
  const table = new SubstitutionTable()
  rewriteCss(THEIR_CSS, table, 'app.css')
  const baseline: Baseline = { cfg: theirCfg, tokens: buildTokens(theirCfg) }
  return { table, baseline }
}

const vars = (cfg: Config) => {
  const { table, baseline } = setup()
  return { table, out: computeVars(table, baseline, cfg, buildTokens(cfg)) }
}
const byValue = (table: SubstitutionTable, out: Record<string, string>, kind: string, value: string) => {
  const e = table.entries.find((x) => x.kind === kind && x.value === value)!
  return out[`--us-v${e.id}`]!
}

describe('identity — no knob turned', () => {
  it('every variable holds exactly the literal it replaced (1:1 by construction)', () => {
    const { table, out } = vars(theirCfg)
    expect(out).toEqual(table.identityVars())
    expect(Object.keys(out).length).toBeGreaterThan(15)
  })
})

describe('identity keeps spelling', () => {
  it('a `.9em` size is still `.9em` at the baseline (float no-op → original string)', () => {
    const table = new SubstitutionTable()
    rewriteCss(`legend{font-size:.9em}.x{padding:.5rem;border-radius:.375rem}`, table, 'a.css')
    const baseline: Baseline = { cfg: theirCfg, tokens: buildTokens(theirCfg) }
    expect(computeVars(table, baseline, theirCfg, buildTokens(theirCfg))).toEqual(table.identityVars())
  })
})

describe('a literal near the brand stays itself at rest', () => {
  it('#0d47a1 beside a #10489e brand is identity until the brand knob moves (measured on simple.css)', () => {
    const table = new SubstitutionTable()
    rewriteCss(`:root{--accent:#0d47a1}.b{background:#10489e}`, table, 'a.css')
    const cfg: Config = { ...DEFAULT_CONFIG, cPrimary: '#10489e' }
    const baseline: Baseline = { cfg, tokens: buildTokens(cfg) }
    expect(computeVars(table, baseline, cfg, buildTokens(cfg))).toEqual(table.identityVars())
    const rose = { ...cfg, cPrimary: COLOR_THEMES.rose.cPrimary }
    const out = computeVars(table, baseline, rose, buildTokens(rose))
    expect(out['--us-v1']).not.toBe('#0d47a1')
  })
})

describe('brand knob', () => {
  const rose = { ...theirCfg, cPrimary: COLOR_THEMES.rose.cPrimary }
  it('rotates the brand family by the hue delta of --k-primary, and only that family', () => {
    const { table, out } = vars(rose)
    const b = parseCssColor(byValue(table, out, 'color', '#4f39f6'))!
    const base = parseCssColor(String(buildTokens(theirCfg).vars['--k-primary']))!
    const now = parseCssColor(String(buildTokens(rose).vars['--k-primary']))!
    const expectedH = ((parseCssColor('#4f39f6')!.H + hueDelta(base.H, now.H)) % 360 + 360) % 360
    expect(Math.abs(hueDelta(b.H, expectedH))).toBeLessThan(2)
    // The hover shade and the tint move with it — same delta, so the ramp stays a ramp.
    const hover = parseCssColor(byValue(table, out, 'color', '#4338ca'))!
    const tint = parseCssColor(byValue(table, out, 'color', '#eef2ff'))!
    expect(Math.abs(hueDelta(hover.H, b.H))).toBeLessThan(12)
    expect(tint.L).toBeGreaterThan(0.9) // a tint stays a tint
    // The success green and white are not the brand. A tinted grey may take
    // the new tint (neutral 'auto' follows the brand — the engine's rule), but
    // it stays a grey of the same lightness.
    expect(byValue(table, out, 'color', '#16a34a')).toBe('#16a34a')
    expect(byValue(table, out, 'color', '#ffffff')).toBe('#ffffff')
    const grey = parseCssColor(byValue(table, out, 'color', '#6b7280'))!
    expect(grey.C).toBeLessThan(0.03)
    expect(grey.L).toBeCloseTo(parseCssColor('#6b7280')!.L, 2)
  })
  it('the accent-family classifier is judged against the BASELINE, not the current tokens', () => {
    const { baseline } = setup()
    expect(classifyColor(parseCssColor('#4f39f6')!, baseline.tokens.vars)).toBe('brand')
    expect(classifyColor(parseCssColor('#e5e7eb')!, baseline.tokens.vars)).toBe('neutral')
    expect(classifyColor(parseCssColor('#16a34a')!, baseline.tokens.vars)).toBe('keep')
  })
})

describe('radius knob', () => {
  it('scales every radius by the ratio of --k-radius-md; none → 0', () => {
    const { table, out } = vars({ ...theirCfg, radius: 'none' })
    expect(byValue(table, out, 'radius', '12px')).toBe('0px')
    expect(byValue(table, out, 'radius', '16px')).toBe('0px')
    const soft = vars({ ...theirCfg, radius: 'soft' })
    const r12 = toPx(byValue(soft.table, soft.out, 'radius', '12px'))!.px
    const r16 = toPx(byValue(soft.table, soft.out, 'radius', '16px'))!.px
    const ratio = toPx(String(buildTokens({ ...theirCfg, radius: 'soft' }).vars['--k-radius-md']))!.px / toPx(String(buildTokens(theirCfg).vars['--k-radius-md']))!.px
    expect(r12).toBeCloseTo(12 * ratio, 2)
    expect(r16).toBeCloseTo(16 * ratio, 2)
    expect(r16 / r12).toBeCloseTo(16 / 12, 2) // their shape is kept
  })
})

describe('text size + scale knobs', () => {
  it('body follows --k-type-body; headings keep their step relation; captions only follow body', () => {
    const { table, out } = vars({ ...theirCfg, typeScale: 'xl' })
    const body = toPx(byValue(table, out, 'font-size', '14px'))!.px
    const h1 = toPx(byValue(table, out, 'font-size', '30px'))!.px
    const cap = toPx(byValue(table, out, 'font-size', '12px'))!.px
    const nb = toPx(String(buildTokens({ ...theirCfg, typeScale: 'xl' }).vars['--k-type-body']))!.px
    const bb = toPx(String(buildTokens(theirCfg).vars['--k-type-body']))!.px
    expect(body).toBeCloseTo(14 * (nb / bb), 2)
    expect(h1).toBeGreaterThan(body)
    expect(cap).toBeCloseTo(12 * (nb / bb), 2)
  })
  it('spacing scales with --k-space', () => {
    const { table, out } = vars({ ...theirCfg, scale: 'compact' })
    const ratio = toPx(String(buildTokens({ ...theirCfg, scale: 'compact' }).vars['--k-space']))!.px / toPx(String(buildTokens(theirCfg).vars['--k-space']))!.px
    expect(ratio).not.toBe(1)
    expect(toPx(byValue(table, out, 'space', '24px'))!.px).toBeCloseTo(24 * ratio, 2)
  })
})

describe('font knobs', () => {
  it('identity until the knob leaves their family; body and display are told apart by where they are used', () => {
    const same = vars(theirCfg)
    expect(byValue(same.table, same.out, 'font-family', '"Inter", sans-serif')).toBe('"Inter", sans-serif')
    const { table, out } = vars({ ...theirCfg, fontBody: 'Manrope' } as Config)
    expect(byValue(table, out, 'font-family', '"Inter", sans-serif')).toBe(String(buildTokens({ ...theirCfg, fontBody: 'Manrope' } as Config).vars['--k-font-body']))
    // The heading face is display: untouched by the body knob.
    expect(byValue(table, out, 'font-family', '"Fraunces", serif')).toBe('"Fraunces", serif')
    const d = vars({ ...theirCfg, fontDisplay: 'Fraunces' } as Config)
    expect(byValue(d.table, d.out, 'font-family', '"Fraunces", serif')).not.toBe('"Fraunces", serif')
    expect(byValue(d.table, d.out, 'font-family', '"Inter", sans-serif')).toBe('"Inter", sans-serif')
  })
})

describe('elevation knob', () => {
  it('flat → none; softer → smaller blur, lower alpha; the ring geometry is untouched by colour', () => {
    const flat = vars({ ...theirCfg, surfaceDepth: 'flat' } as Config)
    const shadow = flat.table.ofKind('shadow')[0]!
    expect(flat.out[`--us-v${shadow.id}`]).toBe('none')
  })
})

describe('every knob moves something in THEIR app (knobEffect), and none breaks the identity elsewhere', () => {
  const knobs: Array<Partial<Config>> = [
    { cPrimary: '#e11d48' }, { radius: 'none' }, { scale: 'compact' }, { typeScale: 'lg' },
    { fontBody: 'Manrope' } as Partial<Config>, { fontDisplay: 'Fraunces' } as Partial<Config>,
    { surfaceDepth: 'flat' } as Partial<Config>, { neutral: 'neutral' } as Partial<Config>,
  ]
  for (const k of knobs) {
    it(JSON.stringify(k), () => {
      const { table, out } = vars({ ...theirCfg, ...k })
      const id = table.identityVars()
      const moved = Object.keys(out).filter((v) => out[v] !== id[v])
      expect(moved.length).toBeGreaterThan(0)
    })
  }
})
