/**
 * The sandbox's own knobs — continuous, centred on THEIR code.
 *
 * UIcockpit's presets (radius none/subtle/soft/round, scale compact/default/
 * comfortable…) configure OUR kit; over someone else's app they are anchors at
 * best and dead at worst (notes/knobs-research.md). Here every size knob is a
 * multiplier where **1 = exactly as in your code**, with the old names kept as
 * snap points on the dial; colour roles beyond the brand are pickers over the
 * families their own sheet contains.
 *
 * `Dials` lives INSIDE `Config` (as `sb`) so it rides the same reducer, undo
 * stack and share-hash as the rest.
 */
export interface Dials {
  radius: number      // × their radii            (0 … 2)
  space: number       // × their spacing          (0.6 … 1.5)
  type: number        // × their font sizes       (0.8 … 1.4)
  lineHeight: number  // × their line-heights     (0.85 … 1.35)
  tracking: number    // + em on letter-spacing   (−0.05 … 0.15)
  weight: number      // ± steps of 100           (−2 … 2)
  borderWidth: number // × their border widths    (0 … 3)
  borderTone: number  // Δ lightness of border greys (−0.15 … 0.15)
  bgTone: number      // Δ lightness of light backgrounds (−0.1 … 0.06)
  shadow: number      // × blur/alpha of shadows  (0 … 2.5)
  motion: number      // × durations              (0 … 2.5)
  /** Global colour dials — every colour, family or not (chart palettes,
   *  gradients, illustration tints, inline SVG fills). */
  hue: number         // ° rotation of every chromatic colour (−180 … 180)
  sat: number         // × chroma of every colour  (0 … 2)
  contrast: number    // ± lightness stretch around the middle (−0.3 … 0.3)
  /** ° added to every gradient direction (−180 … 180); the row shows only
   *  when the sheet holds a linear/conic gradient. Older configs lack it. */
  gradAngle?: number
  /** Their dark mode, switched: undefined = as is. */
  dark?: 'dark' | 'light'
  /** Overrides for the colour families the sheet contains, as #rrggbb. */
  cSecondary?: string
  cAccent?: string
  cSuccess?: string
  cWarning?: string
  cDanger?: string
  cInfo?: string
}

export const DEFAULT_DIALS: Dials = {
  radius: 1, space: 1, type: 1, lineHeight: 1, tracking: 0, weight: 0,
  borderWidth: 1, borderTone: 0, bgTone: 0, shadow: 1, motion: 1,
  hue: 0, sat: 1, contrast: 0, gradAngle: 0,
}

export interface Snap { at: number; label: string }
export interface DialSpec { key: keyof Dials; label: string; min: number; max: number; step: number; unit: '×' | 'em' | 'steps' | 'ΔL' | '°'; snaps: Snap[]; section: 'Type' | 'Shape' | 'Colour' }

/** The dials the panel shows, in order, with the old preset names as snap points. */
export const DIALS: DialSpec[] = [
  { key: 'type', label: 'Text size', min: 0.8, max: 1.4, step: 0.02, unit: '×', section: 'Type', snaps: [{ at: 0.88, label: 'S' }, { at: 1, label: 'as is' }, { at: 1.12, label: 'L' }, { at: 1.25, label: 'XL' }] },
  { key: 'lineHeight', label: 'Line height', min: 0.85, max: 1.35, step: 0.01, unit: '×', section: 'Type', snaps: [{ at: 0.9, label: 'Tight' }, { at: 1, label: 'as is' }, { at: 1.15, label: 'Airy' }] },
  { key: 'tracking', label: 'Letter spacing', min: -0.05, max: 0.15, step: 0.005, unit: 'em', section: 'Type', snaps: [{ at: -0.02, label: 'Tight' }, { at: 0, label: 'as is' }, { at: 0.05, label: 'Wide' }] },
  { key: 'weight', label: 'Weight', min: -2, max: 2, step: 1, unit: 'steps', section: 'Type', snaps: [{ at: -1, label: 'Lighter' }, { at: 0, label: 'as is' }, { at: 1, label: 'Bolder' }] },
  { key: 'space', label: 'Spacing', min: 0.6, max: 1.5, step: 0.02, unit: '×', section: 'Shape', snaps: [{ at: 0.75, label: 'Compact' }, { at: 1, label: 'as is' }, { at: 1.25, label: 'Comfortable' }] },
  { key: 'radius', label: 'Radius', min: 0, max: 2, step: 0.05, unit: '×', section: 'Shape', snaps: [{ at: 0, label: 'None' }, { at: 0.5, label: 'Subtle' }, { at: 1, label: 'as is' }, { at: 1.5, label: 'Round' }, { at: 2, label: 'Rounder' }] },
  { key: 'borderWidth', label: 'Border width', min: 0, max: 3, step: 0.25, unit: '×', section: 'Shape', snaps: [{ at: 0, label: 'None' }, { at: 1, label: 'as is' }, { at: 2, label: 'Heavy' }] },
  { key: 'shadow', label: 'Elevation', min: 0, max: 2.5, step: 0.05, unit: '×', section: 'Shape', snaps: [{ at: 0, label: 'Flat' }, { at: 0.5, label: 'Soft' }, { at: 1, label: 'as is' }, { at: 1.8, label: 'Deep' }] },
  { key: 'motion', label: 'Motion', min: 0, max: 2.5, step: 0.05, unit: '×', section: 'Shape', snaps: [{ at: 0, label: 'Off' }, { at: 0.6, label: 'Snappy' }, { at: 1, label: 'as is' }, { at: 1.6, label: 'Slow' }] },
  { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, unit: '°', section: 'Colour', snaps: [{ at: -90, label: '−90°' }, { at: -30, label: '−30°' }, { at: 0, label: 'as is' }, { at: 30, label: '+30°' }, { at: 90, label: '+90°' }, { at: 180, label: 'Opposite' }] },
  { key: 'sat', label: 'Saturation', min: 0, max: 2, step: 0.02, unit: '×', section: 'Colour', snaps: [{ at: 0, label: 'Grey' }, { at: 0.6, label: 'Muted' }, { at: 1, label: 'as is' }, { at: 1.4, label: 'Vivid' }] },
  { key: 'contrast', label: 'Contrast', min: -0.3, max: 0.3, step: 0.01, unit: 'ΔL', section: 'Colour', snaps: [{ at: -0.15, label: 'Softer' }, { at: 0, label: 'as is' }, { at: 0.15, label: 'Harder' }] },
  { key: 'bgTone', label: 'Background', min: -0.1, max: 0.06, step: 0.005, unit: 'ΔL', section: 'Colour', snaps: [{ at: -0.05, label: 'Dimmer' }, { at: 0, label: 'as is' }, { at: 0.03, label: 'Brighter' }] },
  { key: 'gradAngle', label: 'Gradient angle', min: -180, max: 180, step: 5, unit: '°', section: 'Colour', snaps: [{ at: -90, label: '−90°' }, { at: -45, label: '−45°' }, { at: 0, label: 'as is' }, { at: 45, label: '+45°' }, { at: 90, label: '+90°' }, { at: 180, label: 'Reversed' }] },
  { key: 'borderTone', label: 'Border tone', min: -0.15, max: 0.15, step: 0.005, unit: 'ΔL', section: 'Colour', snaps: [{ at: -0.08, label: 'Stronger' }, { at: 0, label: 'as is' }, { at: 0.06, label: 'Fainter' }] },
]

export const nearestSnap = (spec: DialSpec, v: number): Snap | null => {
  let best: Snap | null = null
  for (const s of spec.snaps) if (Math.abs(s.at - v) <= spec.step * 1.01 && (!best || Math.abs(s.at - v) < Math.abs(best.at - v))) best = s
  return best
}
export const fmtDial = (spec: DialSpec, v: number): string => {
  const snap = nearestSnap(spec, v)
  const num = spec.unit === '°' ? `${v > 0 ? '+' : ''}${Math.round(v)}°` : spec.unit === '×' ? `×${String(+v.toFixed(2))}` : spec.unit === 'em' ? `${v >= 0 ? '+' : ''}${v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}em` : spec.unit === 'steps' ? `${v > 0 ? '+' : ''}${v}` : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1).replace(/\.0$/, '')}%`
  return snap ? (snap.label === 'as is' ? 'as is' : snap.label === num ? num : `${snap.label} · ${num}`) : num
}
