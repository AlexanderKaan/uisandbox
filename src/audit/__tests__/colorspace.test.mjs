import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deltaE00, toLab, parseColor, colorDistance, clusterNear, pxDistance,
  oklchToRgb, stripAlpha, resolvePalette, rgbToOklch, TW_DEFAULTS,
} from '../engine/colorspace.mjs'

/**
 * The official CIEDE2000 reference data (Sharma, Wu & Dalal — "The CIEDE2000
 * Color-Difference Formula: Implementation Notes, Supplementary Test Data and
 * Mathematical Observations", Table 1).
 *
 * These exist because this repo now has TWO colour implementations (this one and
 * the cockpit's OKLCH maths) and the zero-dep CLI cannot import the other. Shared
 * vectors are what make that duplication acceptable. Pairs 7–13 are the hue-wrap
 * and zero-chroma cases that naive implementations silently get wrong.
 */
const SHARMA = [
  [[50.0000, 2.6772, -79.7751], [50.0000, 0.0000, -82.7485], 2.0425],
  [[50.0000, 3.1571, -77.2803], [50.0000, 0.0000, -82.7485], 2.8615],
  [[50.0000, 2.8361, -74.0200], [50.0000, 0.0000, -82.7485], 3.4412],
  [[50.0000, -1.3802, -84.2814], [50.0000, 0.0000, -82.7485], 1.0000],
  [[50.0000, -1.1848, -84.8006], [50.0000, 0.0000, -82.7485], 1.0000],
  [[50.0000, -0.9009, -85.5211], [50.0000, 0.0000, -82.7485], 1.0000],
  [[50.0000, 0.0000, 0.0000], [50.0000, -1.0000, 2.0000], 2.3669],
  [[50.0000, -1.0000, 2.0000], [50.0000, 0.0000, 0.0000], 2.3669],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0009], 7.1792],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0010], 7.1792],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0011], 7.2195],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0012], 7.2195],
  [[50.0000, -0.0010, 2.4900], [50.0000, 0.0009, -2.4900], 4.8045],
  [[50.0000, 2.5000, 0.0000], [50.0000, 0.0000, -2.5000], 4.3065],
  [[50.0000, 2.5000, 0.0000], [73.0000, 25.0000, -18.0000], 27.1492],
  [[50.0000, 2.5000, 0.0000], [50.0000, 3.1736, 0.5854], 1.0000],
  [[50.0000, 2.5000, 0.0000], [50.0000, 3.2972, 0.0000], 1.0000],
  [[50.0000, 2.5000, 0.0000], [50.0000, 1.8634, 0.5757], 1.0000],
  [[50.0000, 2.5000, 0.0000], [50.0000, 3.2592, 0.3350], 1.0000],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.2630],
  [[61.2901, 3.7196, -5.3901], [61.4292, 2.2480, -4.9620], 1.8731],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373],
  [[36.4612, 47.8580, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
  [[90.8027, -2.0831, 1.4410], [91.1528, -1.6435, 0.0447], 1.4441],
  [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
  [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082],
]

test('deltaE00 matches every Sharma reference vector', () => {
  for (const [lab1, lab2, expected] of SHARMA) {
    const got = deltaE00(lab1, lab2)
    assert.ok(
      Math.abs(got - expected) < 1e-4,
      `ΔE00(${lab1}, ${lab2}) = ${got.toFixed(4)}, expected ${expected}`,
    )
  }
})

test('deltaE00 is symmetric', () => {
  for (const [lab1, lab2] of SHARMA) {
    assert.ok(Math.abs(deltaE00(lab1, lab2) - deltaE00(lab2, lab1)) < 1e-9)
  }
})

test('parseColor handles hex (3/6/8), rgb(), hsl() and the grey ramps', () => {
  assert.deepEqual(parseColor('#fff'), [255, 255, 255])
  assert.deepEqual(parseColor('#FFFFFF'), [255, 255, 255])
  assert.deepEqual(parseColor('#000000ff'), [0, 0, 0])
  assert.deepEqual(parseColor('rgb(255, 0, 0)'), [255, 0, 0])
  assert.deepEqual(parseColor('rgba(0, 0, 0, 0.5)'), [0, 0, 0])
  assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), [255, 0, 0])
  assert.deepEqual(parseColor('gray-500'), [107, 114, 128])
})

test('parseColor returns null rather than guessing', () => {
  // oklch() is NOT in this list any more — Tailwind v4 writes its whole palette
  // that way, so reading it is the difference between painting the swatches and
  // hatching them.
  for (const v of ['var(--k-primary)', 'indigo-500', 'currentColor', '']) {
    assert.equal(parseColor(v), null, `${v} should be unparseable, not guessed`)
  }
})

test('oklch round-trips the sRGB anchors exactly', () => {
  // One transform with verifiable anchors, unlike a hardcoded palette table
  // where every entry is an independent chance to be silently wrong.
  const anchors = [
    ['white', [1, 0, 0], [255, 255, 255]],
    ['black', [0, 0, 0], [0, 0, 0]],
    ['red', [0.62796, 0.25768, 29.234], [255, 0, 0]],
    ['green', [0.86644, 0.29483, 142.495], [0, 255, 0]],
    ['blue', [0.45201, 0.31321, 264.052], [0, 0, 255]],
    ['mid grey', [0.59987, 0, 0], [128, 128, 128]],
  ]
  for (const [name, [L, C, H], expected] of anchors) {
    const got = oklchToRgb(L, C, H)
    const worst = Math.max(...got.map((v, i) => Math.abs(v - expected[i])))
    assert.ok(worst <= 2, `${name}: got rgb(${got}), expected rgb(${expected})`)
  }
  assert.deepEqual(parseColor('oklch(0.62796 0.25768 29.234)'), [255, 0, 0])
  assert.deepEqual(parseColor('oklch(62.796% 0.25768 29.234)'), [255, 0, 0])
})

test('a resolved palette turns a name into a real colour', () => {
  const palette = { 'emerald-500': 'oklch(0.696 0.17 162.48)', 'brand': '#ff0000' }
  assert.ok(parseColor('emerald-500', palette), 'a palette name must resolve')
  assert.deepEqual(parseColor('brand', palette), [255, 0, 0])
  assert.equal(parseColor('emerald-500'), null, 'and stay unresolved without one')
})

test('resolvePalette layers: repo override > installed > shipped defaults by generation > greys', () => {
  const v4 = resolvePalette({}, {}, 'v4'), v3 = resolvePalette({}, {}, 'v3'), none = resolvePalette({}, {}, null)
  assert.deepEqual(parseColor('indigo-600', v3), [79, 70, 229], 'v3 ships #4f46e5')
  assert.deepEqual(parseColor('indigo-600', v4), [79, 57, 246], 'v4 ships oklch(51.1% 0.262 276.966) = #4f39f6')
  assert.equal(parseColor('indigo-600', none), null, 'null opts out of the defaults')
  assert.deepEqual(parseColor('gray-500', none), parseColor('#6b7280'), 'the grey ramps stay as the last resort')
  const installed = resolvePalette({}, { 'indigo-600': '#111111' }, 'v4')
  assert.deepEqual(parseColor('indigo-600', installed), [17, 17, 17], 'an installed build beats the shipped default')
  const own = resolvePalette({ '--color-indigo-600': '#222222' }, { 'indigo-600': '#111111' }, 'v4')
  assert.deepEqual(parseColor('indigo-600', own), [34, 34, 34], 'the repo\'s own --color-* beats everything')
  // The defaults are the generated module, not a hand-typed table: both generations complete, and v4 kept as oklch.
  assert.ok(Object.keys(TW_DEFAULTS.v3).length >= 240 && Object.keys(TW_DEFAULTS.v4).length >= 240)
  assert.match(TW_DEFAULTS.v4['indigo-600'], /^oklch\(/)
})

test('rgbToOklch is the inverse of oklchToRgb', () => {
  for (const [L, C, H] of [[0.511, 0.262, 276.966], [0.623, 0.214, 259.815], [0.7, 0.1, 30], [0.9, 0.02, 120]]) {
    const [l2, c2, h2] = rgbToOklch(...oklchToRgb(L, C, H))
    assert.ok(Math.abs(l2 - L) < 0.01 && Math.abs(c2 - C) < 0.01 && Math.abs(h2 - H) < 1, `${[L, C, H]} → ${[l2, c2, h2]}`)
  }
  // a Tailwind ramp holds its hue: v3 indigo 400/600/700 all sit at ~277°, blue at ~260°, violet at ~293°
  const hue = (hex) => Math.round(rgbToOklch(...parseColor(hex))[2])
  assert.deepEqual(['#818cf8', '#4f46e5', '#4338ca'].map(hue), [277, 277, 277])
  assert.equal(hue('#3b82f6'), 260)
  assert.equal(hue('#7c3aed'), 293)
})

test('a Tailwind opacity modifier does not hide the base colour', () => {
  assert.equal(stripAlpha('zinc-200/80'), 'zinc-200')
  assert.deepEqual(parseColor('zinc-200/80'), parseColor('zinc-200'))
})

test('resolvePalette lets the project override the installed Tailwind', () => {
  const installed = { 'emerald-500': '#10b981' }
  const projectVars = { '--color-emerald-500': '#00ff00' }
  const p = resolvePalette(projectVars, installed)
  assert.equal(p['emerald-500'], '#00ff00', "the repo's own @theme wins")
  assert.equal(resolvePalette({}, installed)['emerald-500'], '#10b981')
  assert.equal(resolvePalette({}, {})['zinc-500'], '#71717a', 'grey ramps are the floor')
})

test('white is far from black, and a hex equals its own rgb()', () => {
  assert.ok(colorDistance('#ffffff', '#000000') > 95)
  assert.ok(colorDistance('#3b82f6', 'rgb(59, 130, 246)') < 1e-6)
})

test('the near-dupe threshold separates a typo from a decision', () => {
  // The briefing's own example: nobody MEANT both of these.
  assert.ok(colorDistance('#3B82F6', '#3B83F7') < 2, 'a 1-bit difference must read as a near-dupe')
  // Two deliberate greys one ramp step apart are a real decision.
  assert.ok(colorDistance('#6b7280', '#4b5563') > 2, 'adjacent ramp steps are deliberate')
})

test('cross-ramp greys at the same step are near-duplicates', () => {
  // gray-500 vs zinc-500 — the classic three-ramps-in-one-app tell.
  assert.ok(colorDistance('gray-500', 'zinc-500') < 4)
})

test('clusterNear groups only real clusters, never singletons', () => {
  const values = ['#3b82f6', '#3b83f7', '#ffffff', '#111111']
  const clusters = clusterNear(values, colorDistance, 2)
  assert.equal(clusters.length, 1)
  assert.deepEqual(clusters[0].sort(), ['#3b82f6', '#3b83f7'])
})

test('clusterNear skips unparseable values instead of merging them', () => {
  const clusters = clusterNear(['var(--a)', 'var(--b)', 'oklch(0.5 0 0)'], colorDistance, 2)
  assert.equal(clusters.length, 0, 'unknown colours must never cluster together')
})

test('pxDistance drives the length and blur families', () => {
  assert.equal(pxDistance('8px', '8.5px'), 0.5)
  assert.equal(pxDistance('8px', 'auto'), null)
  const clusters = clusterNear(['8px', '8.5px', '24px'], pxDistance, 1)
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].length, 2)
})
