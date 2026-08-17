import { describe, it, expect } from 'vitest'
import { buildTokens } from '../../tokens/buildTokens'
import { DEFAULT_CONFIG } from '../../tokens/defaults'
import { COLOR_THEMES } from '../../tokens/stylesAndThemes'
import type { Config } from '../../tokens/types'
import { rewriteCss } from '../rewrite'
import { SubstitutionTable } from '../table'
import { computeVars, familiesOf, toPx, type Baseline } from '../mapping'
import { parseCssColor, hueDelta } from '../cssColor'
import { DEFAULT_DIALS, type Dials } from '../dials'

/* A small "their app": an indigo brand, greys, a teal secondary, status greens/reds,
   one radius, a type scale, line-heights, weights, borders, a transition, a shadow. */
const THEIR_CSS = `
:root { --brand: #4f39f6; --radius: 12px; }
body { font-family: "Inter", sans-serif; font-size: 14px; line-height: 1.5; color: #111827; background: #ffffff; }
h1 { font-size: 30px; font-family: "Fraunces", serif; letter-spacing: -0.02em; font-weight: 700; }
.btn { background: #4f39f6; color: #fff; border-radius: 12px; padding: 8px 16px; box-shadow: 0 1px 2px rgba(0,0,0,.08); transition: background .15s ease; }
.btn:hover { background: #4338ca; }
.btn--teal { background: #0d9488; } .btn--teal:hover { background: #0f766e; }
.card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1); }
.tag { background: #eef2ff; color: #3730a3; border-radius: 6px; font-size: 12px; font-weight: 600; }
.ok { color: #16a34a; } .bad { color: #dc2626; }
.muted { color: #6b7280; }
`
const theirCfg: Config = { ...DEFAULT_CONFIG, cPrimary: '#4f39f6', radius: 'round', typeScale: 'md', scale: 'default' }

function setup() {
  const table = new SubstitutionTable()
  rewriteCss(THEIR_CSS, table, 'app.css')
  const baseline: Baseline = { cfg: theirCfg, tokens: buildTokens(theirCfg), families: familiesOf(table, theirCfg.cPrimary) }
  return { table, baseline }
}
const vars = (cfg: Config) => {
  const { table, baseline } = setup()
  return { table, out: computeVars(table, baseline, cfg, buildTokens(cfg)) }
}
const dial = (patch: Partial<Dials>): Config => ({ ...theirCfg, sb: { ...DEFAULT_DIALS, ...patch } })
const byValue = (table: SubstitutionTable, out: Record<string, string>, kind: string, value: string) => {
  const e = table.entries.find((x) => x.kind === kind && x.value === value)!
  return out[`--us-v${e.id}`]!
}

describe('identity — no knob turned', () => {
  it('every variable holds exactly the literal it replaced (1:1 by construction)', () => {
    const { table, out } = vars(theirCfg)
    expect(out).toEqual(table.identityVars())
    expect(Object.keys(out).length).toBeGreaterThan(20)
  })
  it('the sheet now carries line-height, letter-spacing, weight, border-width and duration too', () => {
    const { table } = setup()
    expect(table.ofKind('line-height').map((e) => e.value)).toEqual(['1.5'])
    expect(table.ofKind('letter-spacing').map((e) => e.value)).toEqual(['-0.02em'])
    expect(table.ofKind('font-weight').map((e) => e.value)).toEqual(['700', '600'])
    expect(table.ofKind('border-width').map((e) => e.value)).toEqual(['1px'])
    expect(table.ofKind('duration').map((e) => e.value)).toEqual(['.15s'])
  })
})

describe('families come from THEIR sheet', () => {
  it('brand by hue window; teal is secondary; greens/reds are status; greys neutral', () => {
    const { table, baseline } = setup()
    const f = baseline.families!
    const famOf = (v: string) => f.of.get(table.entries.find((e) => e.kind === 'color' && e.value === v)!.id)
    expect(famOf('#4f39f6')).toBe('brand')
    expect(famOf('#4338ca')).toBe('brand')
    expect(famOf('#0d9488')).toBe('secondary')
    expect(famOf('#16a34a')).toBe('success')
    expect(famOf('#dc2626')).toBe('danger')
    expect(famOf('#e5e7eb')).toBe('neutral')
    expect(f.centre.secondary).toBeTruthy()
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
    expect(byValue(table, out, 'color', '#0d9488')).toBe('#0d9488') // secondary untouched
    expect(byValue(table, out, 'color', '#16a34a')).toBe('#16a34a')
    expect(byValue(table, out, 'color', '#ffffff')).toBe('#ffffff')
  })
})

describe('secondary / status pickers move only their family', () => {
  it('cSecondary moves the teal pair; the brand and greens stay', () => {
    const { table, out } = vars(dial({ cSecondary: '#e11d48' }))
    expect(byValue(table, out, 'color', '#0d9488')).toBe('#e11d48') // the centre becomes the pick exactly
    expect(byValue(table, out, 'color', '#0f766e')).not.toBe('#0f766e')
    expect(byValue(table, out, 'color', '#4f39f6')).toBe('#4f39f6')
    expect(byValue(table, out, 'color', '#16a34a')).toBe('#16a34a')
    const s = vars(dial({ cSuccess: '#2563eb' }))
    expect(byValue(s.table, s.out, 'color', '#16a34a')).toBe('#2563eb')
  })
})

describe('size dials — ×1 is their code, everything scales relatively', () => {
  it('radius', () => {
    const { table, out } = vars(dial({ radius: 0 }))
    expect(byValue(table, out, 'radius', '12px')).toBe('0px')
    const half = vars(dial({ radius: 0.5 }))
    expect(byValue(half.table, half.out, 'radius', '16px')).toBe('8px')
  })
  it('spacing, text size, line-height (unitless too), border width, motion, tracking, weight', () => {
    const o = vars(dial({ space: 0.75, type: 1.25, lineHeight: 1.1, borderWidth: 2, motion: 0.5, tracking: 0.05, weight: -1 }))
    expect(byValue(o.table, o.out, 'space', '24px')).toBe('18px')
    expect(toPx(byValue(o.table, o.out, 'font-size', '30px'))!.px).toBeCloseTo(37.5, 2)
    expect(byValue(o.table, o.out, 'line-height', '1.5')).toBe('1.65')
    expect(byValue(o.table, o.out, 'border-width', '1px')).toBe('2px')
    expect(byValue(o.table, o.out, 'duration', '.15s')).toBe('0.075s')
    expect(byValue(o.table, o.out, 'letter-spacing', '-0.02em')).toBe('0.03em')
    expect(byValue(o.table, o.out, 'font-weight', '700')).toBe('600')
  })
  it('elevation: 0 → none; 2 → darker and a little wider', () => {
    const flat = vars(dial({ shadow: 0 }))
    const shadow = flat.table.ofKind('shadow')[0]!
    expect(flat.out[`--us-v${shadow.id}`]).toBe('none')
    const deep = vars(dial({ shadow: 2 }))
    expect(deep.out[`--us-v${shadow.id}`]).not.toBe(shadow.value)
  })
  it('background and border tone move neutrals by USE', () => {
    const o = vars(dial({ bgTone: -0.05, borderTone: 0.05 }))
    expect(byValue(o.table, o.out, 'color', '#f9fafb')).not.toBe('#f9fafb') // .card background
    expect(byValue(o.table, o.out, 'color', '#e5e7eb')).not.toBe('#e5e7eb') // .card border
    expect(byValue(o.table, o.out, 'color', '#6b7280')).toBe('#6b7280')     // ink stays
    expect(byValue(o.table, o.out, 'color', '#111827')).toBe('#111827')
  })
})

describe('font knobs', () => {
  it('identity until the knob leaves their family; body and display told apart by use', () => {
    const { table, out } = vars({ ...theirCfg, fontBody: 'Manrope' } as Config)
    expect(byValue(table, out, 'font-family', '"Inter", sans-serif')).toBe(String(buildTokens({ ...theirCfg, fontBody: 'Manrope' } as Config).vars['--k-font-body']))
    expect(byValue(table, out, 'font-family', '"Fraunces", serif')).toBe('"Fraunces", serif')
  })
})

describe('every panel knob moves something in THEIR app (knobEffect)', () => {
  const knobs: Array<[string, Config]> = [
    ['brand', { ...theirCfg, cPrimary: '#e11d48' }], ['body font', { ...theirCfg, fontBody: 'Manrope' } as Config], ['display font', { ...theirCfg, fontDisplay: 'Fraunces' } as Config],
    ...(['radius', 'space', 'type', 'lineHeight', 'borderWidth', 'shadow', 'motion'] as const).map((k): [string, Config] => [k, dial({ [k]: 0.5 })]),
    ['tracking', dial({ tracking: 0.05 })], ['weight', dial({ weight: 1 })], ['bgTone', dial({ bgTone: -0.05 })], ['borderTone', dial({ borderTone: 0.05 })],
    ['cSecondary', dial({ cSecondary: '#e11d48' })], ['cSuccess', dial({ cSuccess: '#0000ff' })], ['cDanger', dial({ cDanger: '#0000ff' })],
  ]
  for (const [name, cfg] of knobs) {
    it(name, () => {
      const { table, out } = vars(cfg)
      const id = table.identityVars()
      expect(Object.keys(out).filter((v) => out[v] !== id[v]).length).toBeGreaterThan(0)
    })
  }
})
