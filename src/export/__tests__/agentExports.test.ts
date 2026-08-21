import { describe, it, expect } from 'vitest'
import { rewriteCss } from '../../sandbox/rewrite'
import { SubstitutionTable, varName } from '../../sandbox/table'
import { DEFAULT_CONFIG } from '../../tokens/defaults'
import { measure } from '../measured'
import { genDesignMd } from '../genDesignMd'
import { genAgentsBlock } from '../genAgents'
import { genDtcg } from '../genDtcg'
import { genReadme } from '../genReadme'

const sheet = (css: string) => { const t = new SubstitutionTable(); rewriteCss(css, t, 'app.css'); return t }

/** A small build that looks like a real one: a brand on buttons, text and
 *  muted text, two surfaces, a border, a radius ladder, sizes, a shadow. */
const CSS = `
  body{color:#212529;background:#ffffff;font-size:16px;line-height:1.5}
  .muted{color:#6c757d}
  .card{background:#f8f9fa;border:1px solid #dee2e6;border-radius:8px;padding:16px;box-shadow:0 1px 2px rgba(0,0,0,0.08)}
  .card--sm{border-radius:4px;padding:8px}
  .hero{font-size:40px;font-weight:700}
  h2{font-size:24px;font-weight:700}
  .btn{background:#4f39f6;color:#ffffff;border-radius:8px;padding:16px}
  .btn:hover{background:#4f39f6}
  small{font-size:12px}
`
const cfg = { ...DEFAULT_CONFIG, cPrimary: '#4f39f6' as const, fontDisplay: 'Inter', fontBody: 'Inter' }

describe('measure', () => {
  const t = sheet(CSS)
  const m = measure(t, t.identityVars(), '#4f39f6', { display: 'Inter', body: 'Inter' })

  it('places a colour by the property it is painted on, not by taste', () => {
    expect(m.colors.text.map((r) => r.value)).toContain('#212529')
    expect(m.colors.surface.map((r) => r.value)).toContain('#f8f9fa')
    expect(m.colors.border.map((r) => r.value)).toContain('#dee2e6')
  })

  it('names the palette by role, brand first, and repeats a colour only where the role is structural', () => {
    expect(m.palette[0]!.name).toBe('primary')
    expect(m.palette[0]!.value).toBe('#4f39f6')
    // primary/text/surface always appear, even when two of them are one colour
    // (a greyscale app whose brand IS its ink). The rest are discretionary and
    // must each bring something new.
    const extra = m.palette.filter((p) => !['primary', 'text', 'surface'].includes(p.name)).map((p) => p.value.toLowerCase())
    expect(new Set(extra).size).toBe(extra.length)
    for (const need of ['primary', 'text', 'surface']) expect(m.palette.some((p) => p.name === need)).toBe(true)
  })

  it('keeps a text role even when the brand IS the body ink', () => {
    const t2 = sheet('body{color:#111111;background:#ffffff}')
    const p2 = measure(t2, t2.identityVars(), '#111111', { display: 'I', body: 'I' }, { anchors: { text: '#111111', background: '#ffffff' } }).palette
    expect(p2.find((p) => p.name === 'primary')?.value).toBe('#111111')
    expect(p2.find((p) => p.name === 'text')?.value).toBe('#111111')
  })

  it('orders the radius ladder small to large and the sizes large to small', () => {
    expect(m.radii.map((r) => r.value)).toEqual(['4px', '8px'])
    expect(m.sizes[0]!.value).toBe('40px')
  })

  it('never repeats a name WITHIN a group (a duplicate key silently drops one)', () => {
    for (const group of [m.radii, m.spacing, m.palette]) {
      const names = group.map((r) => r.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('prints every colour it can read as plain CSS, whatever the sheet spells', () => {
    // Open Props writes bare HSL components; neither that nor Bootstrap's bare
    // RGB is a colour a design tool can read on its own.
    const t2 = sheet('body{color:#111}.a{color:hsl(220 40% 2%)}.b{color:hsl(220 40% 2%)}')
    const m2 = measure(t2, t2.identityVars(), '#111111', { display: 'I', body: 'I' })
    const all = Object.values(m2.colors).flat().map((r) => r.value)
    expect(all.some((v) => /%/.test(v))).toBe(false)
    expect(all).toContain('#030407')
  })

  it('prints a bare channel triplet as a colour (Bootstrap ships --bs-*-rgb)', () => {
    const t2 = sheet('body{color:#212529}:root{--bs-secondary-color-rgb:86, 94, 100}.x{color:rgb(var(--bs-secondary-color-rgb))}')
    const m2 = measure(t2, t2.identityVars(), '#212529', { display: 'Inter', body: 'Inter' })
    const all = Object.values(m2.colors).flat().map((r) => r.value)
    expect(all).toContain('#565e64')
    expect(all.join(' ')).not.toMatch(/^\d|\s\d{2,3},/)
  })

  const paint = (o: Partial<{ text: number; surface: number; border: number }>) =>
    ({ text: 0, surface: 0, border: 0, ...o, total: (o.text ?? 0) + (o.surface ?? 0) + (o.border ?? 0) })

  it('ranks what is on screen above what a stylesheet merely declares', () => {
    // Bootstrap declares #000 everywhere in utilities and paints it nowhere.
    const t2 = sheet('.bg-black{background:#000}.b2{background:#000}.b3{background:#000}.card{background:#f8f9fa}')
    const card = t2.find('color', '#f8f9fa')!
    const bare = measure(t2, t2.identityVars(), '#0d6efd', { display: 'Inter', body: 'Inter' })
    expect(bare.colors.surface[0]!.value).toBe('#000000')
    const seen = measure(t2, t2.identityVars(), '#0d6efd', { display: 'Inter', body: 'Inter' }, { painted: new Map([[card.id, paint({ surface: 4 })]]) })
    expect(seen.colors.surface[0]!.value).toBe('#f8f9fa')
    expect(seen.fromScreen).toBe(true)
    expect(bare.fromScreen).toBe(false)
  })

  it('takes the role from the screen, not from a sample of utility classes', () => {
    // Bootstrap's body ink: most of its recorded sites are `.bg-dark` and kin,
    // so the census files the ink as a background. The screen saw it as text.
    const t2 = sheet('.bg-dark{background:#212529}.b2{background:#212529}.b3{background:#212529}body{color:#212529}')
    const ink = t2.find('color', '#212529')!
    expect(measure(t2, t2.identityVars(), '#0d6efd', { display: 'I', body: 'I' }).colors.surface[0]!.value).toBe('#212529')
    const seen = measure(t2, t2.identityVars(), '#0d6efd', { display: 'I', body: 'I' }, { painted: new Map([[ink.id, paint({ text: 120, surface: 3 })]]) })
    expect(seen.colors.text[0]!.value).toBe('#212529')
    expect(seen.colors.surface).toHaveLength(0)
  })

  it('reads the ink and the ground off the page rather than ranking for them', () => {
    const t2 = sheet('.a{color:#565e64}.b{color:#565e64}.c{color:#565e64}body{color:#212529;background:#ffffff}')
    const m2 = measure(t2, t2.identityVars(), '#0d6efd', { display: 'I', body: 'I' }, { anchors: { text: 'rgb(33, 37, 41)', background: 'rgb(255, 255, 255)' } })
    const at = (n: string) => m2.palette.find((p) => p.name === n)?.value
    expect(at('text')).toBe('#212529')
    expect(at('surface')).toBe('#ffffff')
    // The runner-up keeps its own name and is not repeated as the anchor.
    expect(at('text-muted')).toBe('#565e64')
  })


  it('gives the second ink a name only when the measurement earns it', () => {
    // Tufte's runner-up ink is `red` (sidenote numbers); AdminLTE's is white
    // (its dark sidebar). Neither is muted, and calling them so would have an
    // agent writing red captions.
    const accent = sheet('body{color:#111111;background:#ffffff}.n{color:#c0392b}.n2{color:#c0392b}')
    const pa = measure(accent, accent.identityVars(), '#111111', { display: 'I', body: 'I' }, { anchors: { text: '#111111', background: '#ffffff' } }).palette
    expect(pa.find((p) => p.name === 'text-accent')?.value).toBe('#c0392b')
    expect(pa.some((p) => p.name === 'text-muted')).toBe(false)

    const muted = sheet('body{color:#111111;background:#ffffff}.m{color:#767676}.m2{color:#767676}')
    const pm = measure(muted, muted.identityVars(), '#111111', { display: 'I', body: 'I' }, { anchors: { text: '#111111', background: '#ffffff' } }).palette
    expect(pm.find((p) => p.name === 'text-muted')?.value).toBe('#767676')

    // Higher contrast than the body ink is not "muted" — it gets no name.
    const louder = sheet('body{color:#767676;background:#ffffff}.l{color:#000000}.l2{color:#000000}')
    const pl = measure(louder, louder.identityVars(), '#767676', { display: 'I', body: 'I' }, { anchors: { text: '#767676', background: '#ffffff' } }).palette
    expect(pl.some((p) => p.name === 'text-muted' || p.name === 'text-accent')).toBe(false)
  })

  it('calls a saturated second background a fill, not a surface', () => {
    const t2 = sheet('body{background:#ffffff;color:#111}.btn{background:#0d6efd}.b2{background:#0d6efd}')
    const p2 = measure(t2, t2.identityVars(), '#111111', { display: 'I', body: 'I' }, { anchors: { text: '#111111', background: '#ffffff' } }).palette
    expect(p2.find((p) => p.name === 'fill')?.value).toBe('#0d6efd')
    expect(p2.some((p) => p.name === 'surface-alt')).toBe(false)
  })

  it("refuses 'muted' to an ink that is invisible on the ground", () => {
    // AdminLTE's runner-up ink is #ffffff on a #f8f9fa surface: quieter than
    // the body ink, and unreadable where this file would put it.
    const t2 = sheet('body{color:#212529;background:#f8f9fa}.inv{color:#ffffff}.i2{color:#ffffff}')
    const p2 = measure(t2, t2.identityVars(), '#0d6efd', { display: 'I', body: 'I' }, { anchors: { text: '#212529', background: '#f8f9fa' } }).palette
    expect(p2.some((p) => p.name === 'text-muted')).toBe(false)
  })

  it('keeps a spacing scale positive — a negative margin is not a step', () => {
    const t2 = sheet('.a{margin:-0.5rem}.b{padding:1rem}.c{padding:1rem}')
    const m2 = measure(t2, t2.identityVars(), '#000000', { display: 'I', body: 'I' })
    expect(m2.spacing.every((r) => parseFloat(r.value) > 0)).toBe(true)
  })

  it('merges one scale step spelled two ways, and keeps em out of a ladder', () => {
    const t2 = sheet('.a{padding:.5rem}.b{padding:0.5rem}.c{padding:1rem}.d{border-radius:0.5em}.e{border-radius:4px}')
    const m2 = measure(t2, t2.identityVars(), '#000000', { display: 'Inter', body: 'Inter' })
    expect(m2.spacing.map((s) => s.value)).toEqual(['.5rem', '1rem'])
    expect(m2.spacing[0]!.count).toBe(2)
    expect(m2.radii.map((r) => r.value)).toEqual(['4px'])
  })

  it('puts a compound value back together instead of leaving var() in it', () => {
    expect(m.shadows[0]!.value).toBe('0 1px 2px rgba(0, 0, 0, 0.08)')
    expect(m.shadows[0]!.value).not.toContain('var(')
  })

  it('counts what moved against the identity, not against a re-derivation', () => {
    expect(m.totals.moved).toBe(0)
    const brand = t.find('color', '#4f39f6')!
    const moved = { ...t.identityVars(), [varName(brand.id)]: '#e11d48' }
    expect(measure(t, moved, '#e11d48', { display: 'Inter', body: 'Inter' }).totals.moved).toBe(1)
  })
})

describe('DESIGN.md', () => {
  const t = sheet(CSS)
  const md = genDesignMd(t, t.identityVars(), cfg, 'demo-app', { date: '2026-08-21' })

  it('opens with front matter delimited by exactly ---', () => {
    const lines = md.split('\n')
    expect(lines[0]).toBe('---')
    expect(lines.indexOf('---', 1)).toBeGreaterThan(3)
  })

  it('quotes every colour, or YAML reads it as a comment', () => {
    for (const line of md.split('\n')) {
      const m = line.match(/^ {2}[\w-]+: (.+)$/)
      if (m && m[1]!.includes('#')) expect(m[1]).toMatch(/^"/)
    }
  })

  it('declares what it did not measure instead of inventing it', () => {
    expect(md).toContain('omitted:')
    expect(md).toContain('- section: components')
    expect(md).not.toContain('\n## Components')
  })

  it('keeps the spec section order', () => {
    const want = ['## Overview', '## Colors', '## Typography', '## Layout', '## Elevation & Depth', '## Shapes', "## Do's and Don'ts"]
    const at = want.map((h) => md.indexOf(h))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('carries the measured values, and says what a value was when it moved', () => {
    expect(md).toContain('primary: "#4f39f6"')
    const brand = t.find('color', '#4f39f6')!
    const moved = { ...t.identityVars(), [varName(brand.id)]: '#e11d48' }
    const after = genDesignMd(t, moved, { ...cfg, cPrimary: '#e11d48' }, 'demo-app', { date: '2026-08-21' })
    expect(after).toContain('primary: "#e11d48"')
    expect(after).toContain('Was #4f39f6.')
    expect(after).toContain("Don't reintroduce `#4f39f6`")
  })

  it('names each level with the family that level actually uses', () => {
    const anchors = {
      text: '#111111', background: '#ffffff',
      type: {
        body: { fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '400', lineHeight: '24px' },
        display: { fontFamily: 'Fraunces, serif', fontSize: '48px', fontWeight: '700', lineHeight: '52px' },
      },
    }
    const out = genDesignMd(t, t.identityVars(), cfg, 'x', { date: '2026-08-21', anchors })
    expect(out).toContain('Headings are set in **Fraunces, serif**, body copy in **Inter, sans-serif**.')
    expect(out).toContain('fontFamily: "Fraunces, serif"')
    // A ratio, not the computed px: it survives a size change.
    expect(out).toContain('lineHeight: 1.5')
  })

  it('says a square build is square rather than offering a radius it never saw', () => {
    // `border-radius: 0` is never tokenised (there is nothing to move), so a
    // square build reaches DESIGN.md as an EMPTY ladder, not a ladder of zeros.
    const flat = sheet('body{color:#111}.a{border-radius:0}.b{border-radius:0}')
    expect(flat.ofKind('radius')).toHaveLength(0)
    const out = genDesignMd(flat, flat.identityVars(), cfg, 'flat', { date: '2026-08-21' })
    expect(out).toContain('The corners are square; keep them square.')
    expect(out).toContain("Don't add rounded corners")
    expect(out).toContain('- section: rounded')
  })
})

describe('the AGENTS.md block', () => {
  it('is a section to append, and says so before anything else', () => {
    const b = genAgentsBlock('demo-app', { date: '2026-08-21', moved: 3 })
    expect(b.trimStart().startsWith('<!--')).toBe(true)
    expect(b).toContain('Append this to AGENTS.md')
    expect(b).toContain('## Design')
    expect(b).toContain('[DESIGN.md](./DESIGN.md)')
    expect(b).toContain('CLAUDE.md')
  })
})

describe("the zip's README", () => {
  const md = genReadme('demo-app', [
    { name: 'DESIGN.md', what: 'your design system, as agents read it' },
    { name: 'sandbox-patch.txt', what: 'one line per value, per file' },
    { name: 'patched/css/app.css', what: 'patched' },
  ], { moved: 12, total: 400, changedFiles: 3, date: '2026-08-21' })

  it('opens with what to do, before what is in the folder', () => {
    expect(md.indexOf('## Start here')).toBeLessThan(md.indexOf('## What is in here'))
    expect(md).toContain('12 of 400 design values were changed')
  })

  it('separates the patched folder from the loose files', () => {
    expect(md).toContain('| `DESIGN.md` |')
    expect(md).not.toContain('| `patched/css/app.css` |')
    expect(md).toContain('`patched/…`')
  })

  it('repeats the one caveat that would otherwise bite: the sheet is not drop-in', () => {
    expect(md).toContain('not a drop-in stylesheet')
  })
})

describe('design.tokens.json (W3C Design Tokens Format Module)', () => {
  const t = sheet(CSS)
  const json = JSON.parse(genDtcg(t, t.identityVars(), cfg, 'demo-app', { date: '2026-08-21' }))

  it('uses $value and $type, and types the group rather than every token', () => {
    expect(json.color.$type).toBe('color')
    expect(json.color.primary.$value.colorSpace).toBe('srgb')
    expect(json.color.primary.$value.hex).toBe('#4f39f6')
    expect(json.color.primary.$value.components).toHaveLength(3)
    for (const c of json.color.primary.$value.components) expect(c).toBeGreaterThanOrEqual(0), expect(c).toBeLessThanOrEqual(1)
  })

  it('gives dimensions a value and a unit, never a CSS string', () => {
    expect(json.radius.$type).toBe('dimension')
    expect(json.radius.sm ?? json.radius.xs).toBeTruthy()
    for (const [k, v] of Object.entries<Record<string, unknown>>(json.radius)) {
      if (k.startsWith('$')) continue
      const val = (v as { $value: { value: number; unit: string } }).$value
      expect(typeof val.value).toBe('number')
      expect(['px', 'rem']).toContain(val.unit)
    }
  })

  it('splits a font stack into the array the format prefers', () => {
    const dtcg = JSON.parse(genDtcg(t, t.identityVars(), { ...cfg, fontBody: 'Inter, system-ui, sans-serif' }, 'x', { date: '2026-08-21' }))
    expect(dtcg.font.body.$value).toEqual(['Inter', 'system-ui', 'sans-serif'])
  })

  it('parses a plain shadow into its parts', () => {
    expect(json.shadow['level-1'].$value.blur).toEqual({ value: 2, unit: 'px' })
    expect(json.shadow['level-1'].$value.color.colorSpace).toBe('srgb')
    expect(json.shadow['level-1'].$value.color.alpha).toBeCloseTo(0.08, 2)
  })

  it('agrees with DESIGN.md about a colour the reader cannot express', () => {
    // `red` and most CSS colour names are outside what the colour reader knows
    // (it has hex, rgb, hsl, oklch and the Tailwind names). A value it cannot
    // read earns no role, so it is absent from BOTH files rather than named in
    // one and dropped from the other.
    const t2 = sheet('body{color:#111111;background:#ffffff}.n{color:red}.n2{color:red}')
    const anchors = { text: '#111111', background: '#ffffff' }
    const json = JSON.parse(genDtcg(t2, t2.identityVars(), cfg, 'x', { date: '2026-08-21', anchors }))
    const md = genDesignMd(t2, t2.identityVars(), cfg, 'x', { date: '2026-08-21', anchors })
    expect(Object.keys(json.color).filter((k) => !k.startsWith('$'))).toEqual(
      md.split('\n').slice(md.split('\n').indexOf('colors:') + 1).filter((l) => /^  [\w-]+:/.test(l)).map((l) => l.trim().split(':')[0]),
    )
    expect(md).not.toContain(': red')
  })

  it('leaves out a shadow it cannot express rather than bending it to fit', () => {
    const inset = sheet('.a{box-shadow:inset 0 2px 4px rgba(0,0,0,.2)}')
    const out = JSON.parse(genDtcg(inset, inset.identityVars(), cfg, 'x', { date: '2026-08-21' }))
    expect(out.shadow).toBeUndefined()
  })
})
