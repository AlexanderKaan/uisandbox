import { describe, it, expect } from 'vitest'
import { rewriteCss, rewriteHtml, scanDeclarations, splicesFor } from '../rewrite'
import { SubstitutionTable, varName } from '../table'

const sheet = () => new SubstitutionTable()

describe('scanDeclarations', () => {
  it('finds declarations with their selector and at-rule context', () => {
    const css = `a:hover{color:red}@media (min-width:640px){.x .y{padding:4px 8px}}@font-face{font-family:X;src:url(a.woff2)}`
    const d = scanDeclarations(css)
    expect(d.map((x) => [x.prop, css.slice(x.valueStart, x.valueEnd), x.selector, x.atRules.join('/')])).toEqual([
      ['color', 'red', 'a:hover', ''],
      ['padding', '4px 8px', '.x .y', 'media'],
      ['font-family', 'X', '', 'font-face'],
      ['src', 'url(a.woff2)', '', 'font-face'],
    ])
  })
  it('survives strings, url() with colons and semicolons, and nesting', () => {
    const css = `.a{background:url("http://x/y;z.png");content:";";&:hover{color:#fff}}`
    const d = scanDeclarations(css)
    expect(d.map((x) => x.prop)).toEqual(['background', 'content', 'color'])
    expect(d[2]!.selector).toBe('&:hover')
  })
})

describe('splicesFor', () => {
  const kinds = (prop: string, value: string) => splicesFor(prop, value).map((s) => `${s.kind}:${s.raw}`)
  it('colours in colour-carrying props, incl. named and function colours', () => {
    expect(kinds('color', '#fff')).toEqual(['color:#fff'])
    expect(kinds('border', '1px solid rgba(0,0,0,.08)')).toEqual(['color:rgba(0,0,0,.08)'])
    expect(kinds('background', 'linear-gradient(90deg, red 0%, #00f 100%)')).toEqual(['color:red', 'color:#00f'])
    expect(kinds('background', 'url(#fff) no-repeat')).toEqual([])
    expect(kinds('color', 'transparent')).toEqual([])
    expect(kinds('color', 'currentColor')).toEqual([])
    expect(kinds('color', 'hsl(var(--primary))')).toEqual([])
    expect(kinds('color', 'var(--x, red)')).toEqual(['color:red'])
  })
  it('never reads a colour name out of a font or a keyword', () => {
    expect(kinds('font-family', 'Tan Pearl, serif')).toEqual(['font-family:Tan Pearl, serif'])
    expect(kinds('background', 'none')).toEqual([])
    expect(kinds('display', 'red')).toEqual([])
  })
  it('lengths per role; pills and zero are left alone', () => {
    expect(kinds('border-radius', '12px')).toEqual(['radius:12px'])
    expect(kinds('border-radius', '9999px')).toEqual([])
    expect(kinds('border-radius', '50%')).toEqual([])
    expect(kinds('padding', '0 1.5rem')).toEqual(['space:1.5rem'])
    expect(kinds('gap', 'calc(100% - 20px)')).toEqual(['space:20px'])
    expect(kinds('font-size', '0.875rem')).toEqual(['font-size:0.875rem'])
    expect(kinds('font', 'italic 600 14px/1.4 "Inter", sans-serif')).toEqual(['font-size:14px', 'font-family:"Inter", sans-serif'])
  })
  it('custom properties: colours always, lengths only when the name says the role', () => {
    expect(kinds('--primary', '#4f39f6')).toEqual(['color:#4f39f6'])
    expect(kinds('--radius', '0.5rem')).toEqual(['radius:0.5rem'])
    expect(kinds('--font-sans', 'Inter, ui-sans-serif')).toEqual(['font-family:Inter, ui-sans-serif'])
    expect(kinds('--tw-ring-offset-width', '2px')).toEqual([])
    expect(kinds('--spacing', '0.25rem')).toEqual(['space:0.25rem'])
  })
  it('box-shadow: inner colours plus the whole value', () => {
    expect(kinds('box-shadow', '0 1px 2px rgba(0,0,0,.05), 0 0 0 3px #4f39f6')).toEqual([
      'color:rgba(0,0,0,.05)', 'color:#4f39f6', 'shadow:0 1px 2px rgba(0,0,0,.05), 0 0 0 3px #4f39f6',
    ])
  })
})

describe('rewriteCss', () => {
  it('replaces literals with var() and registers them once per (kind,value)', () => {
    const t = sheet()
    const css = `.a{color:#4F39F6;border-radius:12px}.b{background:#4f39f6;padding:12px}`
    const out = rewriteCss(css, t, 'x.css')
    expect(out).toBe(`.a{color:var(--us-v1);border-radius:var(--us-v2)}.b{background:var(--us-v1);padding:var(--us-v3)}`)
    expect(t.entries.map((e) => [e.kind, e.value, e.count])).toEqual([
      ['color', '#4f39f6', 2], ['radius', '12px', 1], ['space', '12px', 1],
    ])
    expect(t.entries[0]!.sites[0]).toEqual({ file: 'x.css', prop: 'color', selector: '.a' })
  })
  it('CONTROL: a sheet with nothing to tokenise comes back byte-identical', () => {
    const t = sheet()
    const css = `@import url(x.css);\n/* c */\n.a{display:flex;width:50%;transform:translateX(10px)}\n@media (min-width:640px){.b{grid-template-columns:repeat(2,1fr)}}\n@keyframes k{from{color:#000}to{color:#fff}}\n@font-face{font-family:"X";src:url(x.woff2)}`
    expect(rewriteCss(css, t, 'c.css')).toBe(css)
    expect(t.entries).toEqual([])
  })
  it('keeps !important, comments, and whitespace exactly', () => {
    const t = sheet()
    const css = `.a {\n  color : #fff !important; /* keep */\n  margin:  8px   16px ;\n}`
    expect(rewriteCss(css, t, 'x.css')).toBe(`.a {\n  color : var(--us-v1) !important; /* keep */\n  margin:  var(--us-v2)   var(--us-v3) ;\n}`)
  })
  it('a shadow becomes one variable whose value carries the inner colour variables', () => {
    const t = sheet()
    rewriteCss(`.a{box-shadow:0 1px 2px rgba(0,0,0,.05),0 0 0 3px #4f39f6}`, t, 'x.css')
    const shadow = t.ofKind('shadow')[0]!
    expect(shadow.value).toBe(`0 1px 2px var(${varName(1)}), 0 0 0 3px var(${varName(2)})`)
    expect(t.identityVars()['--us-v1']).toBe('rgba(0, 0, 0, .05)')
  })
  it('the identity sheet holds exactly the literals it replaced', () => {
    const t = sheet()
    rewriteCss(`:root{--brand:#4f39f6;--radius:8px}.a{font-family:"Inter",sans-serif;font-size:14px}`, t, 'x.css')
    expect(t.identityVars()).toEqual({
      '--us-v1': '#4f39f6',
      '--us-v2': '8px',
      '--us-v3': '"Inter", sans-serif',
      '--us-v4': '14px',
    })
  })
})

describe('font families keep their quotes', () => {
  it('"Font Awesome 5 Free" stays quoted in the identity sheet (unquoted it is invalid CSS)', () => {
    const t = sheet()
    rewriteCss(`.fa{font-family:"Font Awesome 5 Free";font-weight:900}`, t, 'fa.css')
    expect(t.identityVars()['--us-v1']).toBe('"Font Awesome 5 Free"')
  })
})

describe('their variables stay where they are scoped', () => {
  it('a shadow that references THEIR var() is not hoisted to :root (measured on a real build)', () => {
    const t = sheet()
    const out = rewriteCss(`.a{box-shadow:inset 0 0 0 1px var(--accD)}.b{box-shadow:0 1px 2px #000, 0 0 0 1px var(--edge)}`, t, 'x.css')
    expect(t.ofKind('shadow')).toEqual([])
    // The literal colour inside .b is still tokenised; the shadow as a whole is not.
    expect(out).toBe(`.a{box-shadow:inset 0 0 0 1px var(--accD)}.b{box-shadow:0 1px 2px var(--us-v1), 0 0 0 1px var(--edge)}`)
  })
})

describe('rewriteHtml', () => {
  it('drops integrity from <link> (the rewritten CSS cannot match the hash) and leaves scripts alone', () => {
    const t = sheet()
    const html = `<link href="/a.css" rel="stylesheet" integrity="sha384-abc" crossorigin="anonymous"><script src="/a.js" integrity="sha384-def"></script>`
    expect(rewriteHtml(html, t, 'i.html')).toBe(`<link href="/a.css" rel="stylesheet" crossorigin="anonymous"><script src="/a.js" integrity="sha384-def"></script>`)
  })
  it('rewrites <style> blocks and style="" attributes, and nothing else', () => {
    const t = sheet()
    const html = `<html><head><style>.a{color:#fff}</style></head><body><div style="background: #4f39f6; padding: 8px" data-x="#000">#000</div><p style=''></p></body></html>`
    const out = rewriteHtml(html, t, 'index.html')
    expect(out).toBe(`<html><head><style>.a{color:var(--us-v1)}</style></head><body><div style="background: var(--us-v2); padding: var(--us-v3)" data-x="#000">#000</div><p style=''></p></body></html>`)
  })
})
