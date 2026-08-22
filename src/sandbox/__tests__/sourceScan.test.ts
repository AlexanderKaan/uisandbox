import { describe, it, expect } from 'vitest'
import { findSourceSpans, patchSourceFile, scanSourceFile } from '../sourceScan'
import { rewriteCss } from '../rewrite'
import { isGenerated } from '../../export/genSheet'
import { SubstitutionTable } from '../table'
import { brandDeclared } from '../baseline'

describe('findSourceSpans', () => {
  it('Kotlin/Compose: 0xAARRGGBB colours keep alpha and case; R.font names a family; RoundedCornerShape is a radius', () => {
    const kt = `val md_theme_light_primary = Color(0xFF6650A4)\nval Karla = FontFamily(Font(R.font.karla_regular))\nShape = RoundedCornerShape(12.dp); fontSize = 14.sp`
    const s = findSourceSpans('Color.kt', kt)
    expect(s.map((x) => [x.kind, x.value, x.prop])).toEqual([
      ['color', '#6650a4', 'md_theme_light_primary'], ['font-family', '"Karla"', 'font-resource'], ['radius', '12px', 'radius'], ['font-size', '14px', 'size'],
    ])
    expect(s[0]!.print('#e11d48')).toBe('FFE11D48')
  })
  it('Android XML: #AARRGGBB is ARGB; Swift: Color(red:green:blue:) floats; xcassets components', () => {
    expect(findSourceSpans('colors.xml', `<color name="colorPrimary">#FF3F51B5</color>`).map((x) => [x.value, x.prop, x.print('#e11d48')])).toEqual([['#3f51b5', 'colorPrimary', 'FFE11D48']])
    const sw = findSourceSpans('Theme.swift', `static let brand = Color(red: 0.247, green: 0.318, blue: 0.710)`)
    expect(sw[0]!.value).toBe('#3f51b5')
    expect(sw[0]!.print('#000000')).toBe('0.000, green: 0.000, blue: 0.000')
    const xc = findSourceSpans('A.colorset/Contents.json', `{"colors":[{"color":{"components":{"alpha":"1.000","blue":"0xB5","green":"0x51","red":"0x3F"}}}]}`)
    expect(xc[0]!.value).toBe('#3f51b5')
    expect(xc[0]!.print('#000000')).toBe('0x00","green":"0x00","red":"0x00')
  })
  it('a declared primary in source counts as the brand', () => {
    const t = new SubstitutionTable()
    scanSourceFile('Color.kt', `val md_theme_light_primary = Color(0xFF6650A4)\nval Grey = Color(0xFF888888)\nval Grey2 = Color(0xFF888888)`, t, 'android')
    expect(brandDeclared(t)).toBe('#6650a4')
  })
  it('patchSourceFile writes the current value in the file own notation', () => {
    const t = new SubstitutionTable()
    const src = `val a = Color(0xFF6650A4)\nval r = RoundedCornerShape(12.dp)`
    scanSourceFile('x.kt', src, t, 'android')
    const out = patchSourceFile('x.kt', src, t, { '--us-v1': '#e11d48', '--us-v2': '0px' })
    expect(out).toBe(`val a = Color(0xFFE11D48)\nval r = RoundedCornerShape(0.dp)`)
  })
})

describe('isGenerated', () => {
  it('keeps a hand-written file and drops a bundle, by line geometry', () => {
    const source = Array.from({ length: 900 }, (_, i) => `const token${i} = '#4f39f6' // a line a person wrote`).join('\n')
    expect(source.length).toBeGreaterThan(20000)
    expect(isGenerated('src/theme.ts', source)).toBe(false)
    // One long line is the signature of output: same bytes, no newlines.
    expect(isGenerated('assets/app.js', source.replace(/\n/g, ';'))).toBe(true)
  })

  it('never patches inside a build directory, however it is spelled', () => {
    for (const p of ['_next/static/chunks/x.js', 'app/.next/server/y.js', 'node_modules/pkg/index.js', 'assets/app.min.js']) {
      expect(isGenerated(p, 'const a = 1\n')).toBe(true)
    }
  })

  it('leaves a small file alone rather than guessing from its path', () => {
    expect(isGenerated('src/tokens.json', '{"primary":"#4f39f6"}')).toBe(false)
  })
})

describe('CSS colour functions in source', () => {
  const sheet = () => { const t = new SubstitutionTable(); rewriteCss('.btn{background:#4e73df}.a{color:#2e59d9}', t, 'app.css'); return t }

  it('moves an rgba() that the stylesheet wrote as hex, keeping notation and alpha', () => {
    // SB Admin 2: the bar and pie demos write #4e73df and followed the brand;
    // the area demo writes the same colour as rgba() and did not.
    const t = sheet()
    const brand = t.find('color', '#4e73df')!
    const vars = { ...t.identityVars(), [`--us-v${brand.id}`]: '#e11d48' }
    const js = 'borderColor: "rgba(78, 115, 223, 1)", backgroundColor: "rgba(78, 115, 223, 0.05)", point: "#4e73df"'
    const out = patchSourceFile('js/demo/chart-area-demo.js', js, t, vars)
    expect(out).toContain('rgba(225, 29, 72, 1)')
    expect(out).toContain('rgba(225, 29, 72, 0.05)')   // the tint keeps its own alpha
    expect(out).toContain('"#e11d48"')                  // the hex sibling still works
  })

  it('keeps the file\'s own spacing, and rgb() stays rgb()', () => {
    const t = sheet()
    const brand = t.find('color', '#4e73df')!
    const vars = { ...t.identityVars(), [`--us-v${brand.id}`]: '#e11d48' }
    expect(patchSourceFile('a.js', 'c: rgb(78,115,223)', t, vars)).toBe('c: rgb(225,29,72)')
    expect(patchSourceFile('a.js', 'c: rgb(78, 115, 223)', t, vars)).toBe('c: rgb(225, 29, 72)')
  })

  it('leaves a colour the sheet never saw exactly as it is', () => {
    const t = sheet()
    const vars = t.identityVars()
    const js = 'grid: "rgba(234, 236, 244, 1)", brand: "rgba(78, 115, 223, 1)"'
    expect(patchSourceFile('a.js', js, t, vars)).toBe(js)
  })

  it('is not fooled by three numbers that are not a colour', () => {
    const t = sheet()
    const brand = t.find('color', '#4e73df')!
    const vars = { ...t.identityVars(), [`--us-v${brand.id}`]: '#e11d48' }
    const js = 'translate3d(78, 115, 223)'
    expect(patchSourceFile('a.js', js, t, vars)).toBe(js)
  })
})
