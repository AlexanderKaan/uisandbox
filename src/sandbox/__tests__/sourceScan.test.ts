import { describe, it, expect } from 'vitest'
import { findSourceSpans, patchSourceFile, scanSourceFile } from '../sourceScan'
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
