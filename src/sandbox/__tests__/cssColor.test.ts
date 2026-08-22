import { describe, it, expect } from 'vitest'
import { parseCssColor, formatCssColor } from '../cssColor'
import { rewriteCss } from '../rewrite'
import { SubstitutionTable } from '../table'
import { familiesOf } from '../mapping'

describe('the CSS named colours', () => {
  it('reads the names a hand-written stylesheet is made of', () => {
    const want: Array<[string, string]> = [
      ['red', '#ff0000'], ['navy', '#000080'], ['grey', '#808080'], ['gray', '#808080'],
      ['silver', '#c0c0c0'], ['lightgray', '#d3d3d3'], ['rebeccapurple', '#663399'],
      ['teal', '#008080'], ['orange', '#ffa500'], ['white', '#ffffff'], ['black', '#000000'],
    ]
    for (const [name, hex] of want) {
      const c = parseCssColor(name)
      expect(c, name).not.toBeNull()
      expect(formatCssColor(c!), name).toBe(hex)
    }
  })

  it('leaves currentColor unread — it has no value of its own', () => {
    expect(parseCssColor('currentColor')).toBeNull()
  })

  it('puts a named colour in a real family instead of freezing it', () => {
    // An unreadable colour lands in `keep`, and a page written in names would
    // then hold still while the hex colours beside it moved.
    const t = new SubstitutionTable()
    rewriteCss('body{color:black;background:white}h1{color:navy}.b{background:#0000ff}', t, 'a.css')
    const fams = familiesOf(t, '#0000ff')
    const navy = t.find('color', 'navy')!
    const hexBlue = t.find('color', '#0000ff')!
    expect(fams.of.get(navy.id)).not.toBe('keep')
    expect(fams.of.get(navy.id)).toBe(fams.of.get(hexBlue.id))
  })
})

describe('a bare channel triplet', () => {
  it('reads the same colour whichever separator it uses', () => {
    // Tailwind and shadcn write spaces, Bootstrap writes commas. Only the
    // space form parsed, so every `--bs-*-rgb` came back null and `mapEntry`
    // handed the literal straight back: frozen for brand, background, hue,
    // contrast and dark mode alike. Measured on AdminLTE, `.btn-primary`
    // (a hex) followed the brand while `.card.bg-primary`
    // (`rgba(var(--bs-primary-rgb), …)`) stayed Bootstrap's own blue.
    const hex = parseCssColor('#0d6efd')!
    for (const spelling of ['13 110 253', '13, 110, 253', '13,110,253']) {
      const c = parseCssColor(spelling)
      expect(c, spelling).not.toBeNull()
      expect(formatCssColor(c!), spelling).toBe(formatCssColor(hex))
    }
  })

  it('is not confused with anything else that holds three numbers', () => {
    expect(parseCssColor('0 1px 2px')).toBeNull()
    expect(parseCssColor('1, 2, 3, 4')).toBeNull()
    expect(parseCssColor('300, 110, 253')).toBeNull()   // out of channel range
  })
})
