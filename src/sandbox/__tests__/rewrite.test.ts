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
  it('an escaped quote in a selector (Tailwind arbitrary values) does not open a string', () => {
    const t = new SubstitutionTable()
    const out = rewriteCss(String.raw`.bg-\[url\(\'\/img\/x\.png\'\)\]{background-image:url(/img/x.png)}.text-amber-500{--tw-text-opacity: 1;color:rgb(255 193 7 / var(--tw-text-opacity))}.b{color:#000}`, t, 'a.css')
    expect(out).toContain('color:rgb(var(--us-v1) / var(--tw-text-opacity))')
    expect(out).toContain('.b{color:var(--us-v2)}')
  })
  it('font-family custom props: system stacks in, smoothing keywords and functions out', () => {
    expect(kinds('--mantine-font-family', '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif')).toEqual(['font-family:-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'])
    expect(kinds('--mantine-webkit-font-smoothing', 'antialiased')).toEqual([])
    expect(kinds('--x-font-family', 'clamp(6px, 2vw, 12px)')).toEqual([])
    expect(kinds('--font-sans', '"Inter", sans-serif')).toEqual(['font-family:"Inter", sans-serif'])
  })
  it('gradient directions: numeric angles and single sides, not corners, not radial', () => {
    expect(kinds('background-image', 'linear-gradient(135deg,#6f42c1,#7952b3)')).toEqual(['angle:135deg', 'color:#6f42c1', 'color:#7952b3'])
    expect(kinds('background', 'repeating-linear-gradient(.25turn, #000 0 2px, #fff 2px 4px)')).toEqual(['angle:.25turn', 'color:#000', 'color:#fff'])
    expect(kinds('background', 'conic-gradient(from 90deg, #f00, #00f)')).toEqual(['angle:90deg', 'color:#f00', 'color:#00f'])
    expect(kinds('background', 'linear-gradient(to right, #f00, #00f)')).toEqual(['angle:to right', 'color:#f00', 'color:#00f'])
    // A corner depends on the box's aspect ratio: no fixed angle, stays as written.
    expect(kinds('background', 'linear-gradient(to top right, #f00, #00f)')).toEqual(['color:#f00', 'color:#00f'])
    expect(kinds('background', 'radial-gradient(circle at 20% 20%, #f00, transparent)')).toEqual(['color:#f00'])
    expect(kinds('--bs-gradient', 'linear-gradient(180deg, rgba(255,255,255,.15), rgba(255,255,255,0))')).toEqual(['angle:180deg', 'color:rgba(255,255,255,.15)', 'color:rgba(255,255,255,0)'])
  })
  it('colours in colour-carrying props, incl. named and function colours', () => {
    expect(kinds('color', '#fff')).toEqual(['color:#fff'])
    expect(kinds('border', '1px solid rgba(0,0,0,.08)')).toEqual(['border-width:1px', 'color:rgba(0,0,0,.08)'])
    expect(kinds('background', 'linear-gradient(90deg, red 0%, #00f 100%)')).toEqual(['angle:90deg', 'color:red', 'color:#00f'])
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
    expect(kinds('font', 'italic 600 14px/1.4 "Inter", sans-serif')).toEqual(['font-weight:600', 'font-size:14px', 'line-height:1.4', 'font-family:"Inter", sans-serif'])
    expect(kinds('line-height', '1.5')).toEqual(['line-height:1.5'])
    expect(kinds('line-height', 'normal')).toEqual([])
    expect(kinds('letter-spacing', '.02em')).toEqual(['letter-spacing:.02em'])
    expect(kinds('font-weight', 'bold')).toEqual(['font-weight:bold'])
    expect(kinds('transition', 'opacity .2s ease, transform 300ms')).toEqual(['duration:.2s', 'duration:300ms'])
    expect(kinds('outline-width', '2px')).toEqual(['border-width:2px'])
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
    expect(t.entries[0]!.sites[0]).toEqual({ file: 'x.css', prop: 'color', selector: '.a', seq: 1 })
  })
  it('leaves literals inside -moz-/-o-/-ms- functions alone: Chromium drops those declarations at parse time; a var() inside would make them win and fail later (measured on video.js, Ace)', () => {
    const t = new SubstitutionTable()
    const css = '.a{background:#1F3744 -webkit-gradient(linear,left top,left bottom,from(#0B151A),to(#1F3744));background:#1F3744 -moz-linear-gradient(top,#0B151A,#1F3744);background:-o-linear-gradient(top,#0B151A,#1F3744)}'
    const out = rewriteCss(css, t, 'x.css')
    expect(out).toContain('-webkit-gradient(linear,left top,left bottom,from(var(--us-v2)),to(var(--us-v1)))')
    expect(out).toContain('background:#1F3744 -moz-linear-gradient(top,#0B151A,#1F3744)')
    expect(out).toContain('-o-linear-gradient(top,#0B151A,#1F3744)')
  })
  it('keeps !important on the declaration, out of the var value (minified: sans-serif!important — measured on VisualSearch)', () => {
    const t = new SubstitutionTable()
    const out = rewriteCss('.a{font-family:"Lucida Grande",Helvetica,sans-serif!important;color:#4f39f6 !important}', t, 'x.css')
    expect(out).toBe('.a{font-family:var(--us-v1)!important;color:var(--us-v2) !important}')
    expect(t.entries[0]!.value).toBe('"Lucida Grande", Helvetica, sans-serif')
    expect(t.entries[1]!.value).toBe('#4f39f6')
  })
  it('leaves the 2012 unprefixed gradient (linear-gradient(top,…)) as dead as the browser drops it (angularjs.org, typeahead)', () => {
    const t = new SubstitutionTable()
    const css = '.b{background-image:-webkit-linear-gradient(top,#333,#222);background-image:linear-gradient(top,#333,#222)}'
    const out = rewriteCss(css, t, 'x.css')
    expect(out).toContain('-webkit-linear-gradient(top,var(--us-v1),var(--us-v2))')
    expect(out).toContain('background-image:linear-gradient(top,#333,#222)')
  })
  it('leaves IE value hacks (14px \\9) as dead as the browser drops them (ScrollMagic, Bootstrap 2)', () => {
    const t = new SubstitutionTable()
    const css = '.a{padding-left:14px \\9;color:#4f39f6}'
    const out = rewriteCss(css, t, 'x.css')
    expect(out).toBe('.a{padding-left:14px \\9;color:var(--us-v1)}')
  })
  it('CONTROL: a sheet with nothing to tokenise comes back byte-identical', () => {
    const t = sheet()
    const css = `@import url(x.css);\n/* c */\n.a{display:flex;width:50%;transform:translateX(10px)}\n@media (min-width:640px){.b{grid-template-columns:repeat(2,1fr)}}\n@keyframes k{from{opacity:0}to{opacity:1}}\n@font-face{font-family:"X";src:url(x.woff2)}`
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

describe('an invalid declaration stays invalid', () => {
  it('a CSS-wide keyword inside a shorthand is left alone (var() would turn "dropped" into "unset")', () => {
    const t = sheet()
    const css = `.b{font:600 14px inherit;color:#fff;padding:4px initial}`
    expect(rewriteCss(css, t, 'x.css')).toBe(`.b{font:600 14px inherit;color:var(--us-v1);padding:4px initial}`)
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

describe('bare channel triplets (Tailwind v3 / Play CDN, Bootstrap, shadcn)', () => {
  it('rgb(r g b / var(--alpha)) tokenises the channels and keeps their alpha variable', () => {
    const t = sheet()
    const out = rewriteCss(`.a{background-color:rgb(124 58 237 / var(--tw-bg-opacity))}.b{color:rgba(13,110,253,var(--bs-text-opacity))}`, t, 'x.css')
    expect(out).toBe(`.a{background-color:rgb(var(--us-v1) / var(--tw-bg-opacity))}.b{color:rgba(var(--us-v2),var(--bs-text-opacity))}`)
    expect(t.identityVars()).toEqual({ '--us-v1': '124 58 237', '--us-v2': '13, 110, 253' })
  })
  it('custom properties holding a triplet are colours; bare hsl keeps its notation', () => {
    const t = sheet()
    rewriteCss(`:root{--bs-primary-rgb:13,110,253;--primary:222.2 47.4% 11.2%;--tw-x:66 80 175}`, t, 'x.css')
    expect(t.identityVars()).toEqual({ '--us-v1': '13, 110, 253', '--us-v2': '222.2 47.4% 11.2%', '--us-v3': '66 80 175' })
    expect(t.entries.map((e) => e.kind)).toEqual(['color', 'color', 'color'])
  })
})

describe('values mode — their file, patched in place', () => {
  it('writes the current value at the exact span; a 12px radius and a 12px padding go their own ways', () => {
    const t = sheet()
    const css = `.a{color:#4F39F6;border-radius:12px;padding:12px;margin:0 12px}`
    rewriteCss(css, t, 'x.css')
    const out = rewriteCss(css, t, 'x.css', { mode: 'values', vars: { '--us-v1': '#e11d48', '--us-v2': '0px', '--us-v3': '9px' } })
    expect(out).toBe(`.a{color:#e11d48;border-radius:0px;padding:9px;margin:0 9px}`)
    // Nothing changed → their bytes exactly
    expect(rewriteCss(css, t, 'x.css', { mode: 'values', vars: t.identityVars() })).toBe(css)
  })
})

describe('keyframes and data-URI SVGs are in', () => {
  it('a hard-coded pulse follows the brand; a CSS-drawn chevron becomes one svg entry', () => {
    const t = sheet()
    const css = `@keyframes pulse{from{background:#4f39f6}to{background:#4338ca}}.chev{--bs-x:url("data:image/svg+xml,%3csvg%3e%3cpath stroke='%23343a40'/%3e%3c/svg%3e");background-image:url("data:image/svg+xml,%3cpath fill='%23fff'/%3e")}`
    const out = rewriteCss(css, t, 'x.css')
    expect(t.ofKind('color').map((e) => e.value)).toEqual(['#4f39f6', '#4338ca'])
    expect(t.ofKind('svg').length).toBe(2)
    expect(out).toContain('@keyframes pulse{from{background:var(--us-v1)}to{background:var(--us-v2)}}')
    expect(out).toContain('--bs-x:var(--us-v3)')
    // case and path commands survive: `M` and `m` mean different things
    const t2 = sheet()
    rewriteCss(`.h{background-image:url("data:image/svg+xml,%3csvg viewBox='0 0 30 30'%3e%3cpath stroke='%23fff' d='M4 7h22'/%3e%3c/svg%3e")}`, t2, 'x.css')
    expect(t2.identityVars()['--us-v1']).toContain("viewBox='0 0 30 30'")
    expect(t2.identityVars()['--us-v1']).toContain("d='M4 7h22'")
  })
})

describe('the values-mode cache', () => {
  const tokenised = () => { const t = new SubstitutionTable(); rewriteCss('.a{color:#4f39f6;border-radius:8px}', t, 'a.css'); return t }

  it('gives the same answer cached as uncached', () => {
    const t = tokenised()
    const brand = t.find('color', '#4f39f6')!
    const vars = { ...t.identityVars(), [varName(brand.id)]: '#e11d48' }
    const css = '.a{color:#4f39f6;border-radius:8px}'
    const bare = rewriteCss(css, t, 'a.css', { mode: 'values', vars })
    const cache = new Map<string, string>()
    expect(rewriteCss(css, t, 'a.css', { mode: 'values', vars, cache })).toBe(bare)
    expect(rewriteCss(css, t, 'b.css', { mode: 'values', vars, cache })).toBe(bare)
    expect(cache.size).toBe(1)
  })

  it('never caches while TOKENISING — that pass records sites per file', () => {
    const t = new SubstitutionTable()
    const cache = new Map<string, string>()
    rewriteCss('.a{color:#4f39f6}', t, 'a.css', { cache })
    rewriteCss('.a{color:#4f39f6}', t, 'b.css', { cache })
    expect(cache.size).toBe(0)
    expect(t.find('color', '#4f39f6')!.sites.map((s) => s.file)).toEqual(['a.css', 'b.css'])
  })
})
