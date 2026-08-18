import { describe, it, expect } from 'vitest'
import { contrast, hexToHsl, hexToOklch, hslToHex, nameColor, okAccentScale, okNeutralScale, oklchToHex, paletteSet, readableInk, relLum } from '../color'

const okL = (s: string): number => parseFloat(s.match(/oklch\(([\d.]+)%/)![1]!)
const okC = (s: string): number => parseFloat(s.match(/oklch\([\d.]+%\s+([\d.]+)/)![1]!)

// Parse paletteSet's output (now `oklch(L% C H)`) back to hex so we can run WCAG
// contrast on the soft / softFg container pairs. L is emitted as a percentage.
function okStrToHex(str: string): string {
  const m = str.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/)
  if (!m) throw new Error('unparseable oklch: ' + str)
  return oklchToHex(parseFloat(m[1]!) / 100, parseFloat(m[2]!), parseFloat(m[3]!))
}

describe('hexToHsl / hslToHex', () => {
  it('round-trips primary brand colors within 1% lightness', () => {
    const samples = ['#3b3b42', '#1c1c1e', '#5654c8', '#127a52', '#c4456a']
    for (const hex of samples) {
      const [h, s, l] = hexToHsl(hex)
      const back = hexToHsl(hslToHex(h, s, l))
      expect(Math.abs(back[0] - h)).toBeLessThan(1)
      expect(Math.abs(back[1] - s)).toBeLessThan(1)
      expect(Math.abs(back[2] - l)).toBeLessThan(1)
    }
  })

  it('handles pure black, white, gray', () => {
    expect(hexToHsl('#000000')[2]).toBe(0)
    expect(hexToHsl('#ffffff')[2]).toBe(100)
    expect(hexToHsl('#808080')[1]).toBe(0)
  })
})

describe('contrast', () => {
  it('returns 21 for black on white', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('is symmetric', () => {
    expect(contrast('#1c1c1e', '#ffffff')).toBeCloseTo(contrast('#ffffff', '#1c1c1e'), 5)
  })
})

describe('readableInk', () => {
  it('picks white on dark colors', () => {
    expect(readableInk('#1c1c1e')).toBe('#ffffff')
    expect(readableInk('#127a52')).toBe('#ffffff')
  })

  it('picks near-black on light colors', () => {
    expect(readableInk('#ffffff')).toBe('#16160c')
    expect(readableInk('#e8e8ea')).toBe('#16160c')
  })
})

describe('relLum', () => {
  it('white is 1, black is 0', () => {
    expect(relLum('#ffffff')).toBeCloseTo(1, 5)
    expect(relLum('#000000')).toBeCloseTo(0, 5)
  })
})

describe('paletteSet soft/softFg contrast (icon chips, WCAG non-text ≥ 3:1)', () => {
  // A spread of brand hues so we catch the worst hue (yellow/green are the
  // historical danger zone for light containers).
  const hues = [221, 0, 50, 96, 140, 200, 270, 320]
  it('every soft/softFg pair clears 3:1 across characters, hues and modes', () => {
    let worst = Infinity
    let worstWhere = ''
    for (const strat of [0.3, 0.7, 1.0, 1.4]) {   // expression, not three named palettes
      for (const dark of [false, true]) {
        for (const h of hues) {
          const p = paletteSet(h, 70, false, dark, { exprMul: strat })
          for (let i = 0; i < 6; i++) {
            const ratio = contrast(okStrToHex(p.soft[i]!), okStrToHex(p.softFg[i]!))
            if (ratio < worst) { worst = ratio; worstWhere = `${strat} ${dark ? 'dark' : 'light'} h${h} #${i}` }
          }
        }
      }
    }
    // Surfaced for headroom visibility; chips/glyphs are graphical (3:1 floor).
    console.log(`[soft/softFg] worst contrast ${worst.toFixed(2)}:1 @ ${worstWhere}`)
    // 4.0 floor: clears 3:1 graphical (icon chips) with margin, and stays
    // close to 4.5 text AA for badge/pill labels on the soft container.
    expect(worst).toBeGreaterThanOrEqual(4)
  })
})

describe('okNeutralScale / okAccentScale (12-step OKLCH ladder)', () => {
  it('neutral ladder: 12 steps, monotonic lightness, quiet chroma', () => {
    const light = okNeutralScale(230, 9, false, false)
    expect(light).toHaveLength(12)
    // light mode L decreases step 1 → 12 (near-white → near-black text)
    for (let i = 1; i < 12; i++) expect(okL(light[i]!)).toBeLessThan(okL(light[i - 1]!))
    // neutrals stay quiet — chroma capped well below an accent
    for (const s of light) expect(okC(s)).toBeLessThan(0.02)
    // the BORDER band (step 6, idx 5) must be quieter than the TEXT step (12,
    // idx 11): a light border tints visibly, so it must NOT be the loudest step.
    expect(okC(light[5]!)).toBeLessThan(okC(light[11]!))
  })

  it('mono / zero-sat neutral ladder is pure grey (chroma 0)', () => {
    for (const s of okNeutralScale(230, 0, false, true)) expect(okC(s)).toBe(0)
  })

  it('dark neutral ladder ascends in lightness (step-parity flip)', () => {
    const dark = okNeutralScale(230, 9, true, false)
    for (let i = 1; i < 12; i++) expect(okL(dark[i]!)).toBeGreaterThan(okL(dark[i - 1]!))
  })

  it('accent ladder pins step 9 to the exact provided solid colour', () => {
    const solid = '#3b5bdb' // a blue
    const Ls = hexToOklch(solid)[0]
    const scale = okAccentScale(solid, false)
    expect(okL(scale[8]!) / 100).toBeCloseTo(Ls, 2) // step 9 L == the solid's L
    // chroma peaks at the solid, not at the pale background steps
    expect(okC(scale[8]!)).toBeGreaterThan(okC(scale[1]!))
  })
})

describe('nameColor', () => {
  it('names achromatic by lightness', () => {
    expect(nameColor('#000000')).toBe('Black')
    expect(nameColor('#ffffff')).toBe('White')
    expect(nameColor('#fafafa')).toBe('Near White')
    expect(nameColor('#0a0a0a')).toBe('Near Black')
    expect(nameColor('#808080')).toBe('Gray')
    expect(nameColor('#f5f5f5')).toBe('White Smoke')
    expect(nameColor('#fdf5e6')).toBe('Old Lace')
    expect(nameColor('#dcdcdc')).toBe('Gainsboro')
  })

  it('names by hue family for saturated colors', () => {
    expect(nameColor('#007aff')).toContain('Blue')
    expect(nameColor('#127a52')).toContain('Emerald')
    expect(nameColor('#c4456a')).toContain('Magenta')
  })
})
