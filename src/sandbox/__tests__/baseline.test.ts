import { describe, it, expect } from 'vitest'
import { rewriteCss } from '../rewrite'
import { SubstitutionTable } from '../table'
import { fontsFromTable, knobFont, radiusFromTable, bodySizeFromTable, brandFromTable, brandDeclared } from '../baseline'

const sheet = (css: string) => { const t = new SubstitutionTable(); rewriteCss(css, t, 'a.css'); return t }

describe('fontsFromTable', () => {
  it('the family on body wins over an icon font with many rules (measured on SB Admin 2)', () => {
    const t = sheet(`.fa,.fas{font-family:"Font Awesome 5 Free"}.fab{font-family:"Font Awesome 5 Brands"}.fa-x{font-family:"Font Awesome 5 Free"}.fa-y{font-family:"Font Awesome 5 Free"}body{font-family:Nunito,-apple-system,sans-serif}h1,h2{font-family:"Fraunces",serif}`)
    expect(fontsFromTable(t)).toEqual({ body: 'Custom: Nunito', display: 'Fraunces' })
  })
  it('a system stack becomes System; a known Google font is named plainly', () => {
    expect(knobFont('system-ui, sans-serif')).toBe('System')
    expect(knobFont('"Inter", sans-serif')).toBe('Inter')
    expect(knobFont("'Acme Grotesk', sans-serif")).toBe('Custom: Acme Grotesk')
  })
})

describe('the sheet as a fallback reader', () => {
  const t = sheet(`body{font-size:14px;color:#111}.a{border-radius:6px}.b{border-radius:6px}.c{border-radius:12px}.btn{background:#4f39f6}.btn2{background:#4f39f6}.ok{color:#16a34a}`)
  it('radius by the most-used corner', () => { expect(radiusFromTable(t)).toBe('soft') })
  it('body size from the body selector', () => { expect(bodySizeFromTable(t)).toBe('md') })
  it('brand = the most-painted chromatic colour', () => { expect(brandFromTable(t)).toBe('#4f39f6') })
})

describe('brandDeclared', () => {
  it('--bs-primary outranks --bd-accent (measured on getbootstrap.com)', () => {
    const t = sheet(`:root{--bs-blue:#0d6efd;--bs-primary:#0d6efd;--bd-accent:#ffe484;--bd-violet:#712cf9}.x{color:#ffe484}.y{color:#ffe484}`)
    expect(brandDeclared(t)).toBe('#0d6efd')
  })
  it('nothing declared → null (the audit or the count decides)', () => {
    expect(brandDeclared(sheet(`.a{color:#4f39f6}`))).toBeNull()
  })
})
