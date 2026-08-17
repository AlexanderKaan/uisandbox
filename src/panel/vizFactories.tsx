/**
 * Mini visualizations for the flat-menu option lists.
 *
 * Kept deliberately sparse: the canvas IS the live preview, so most controls
 * are text-only. We render a small hint ONLY where it genuinely disambiguates:
 *   - Motion easing curves
 *   - Box / Button radius corner (always bottom-left, line-only)
 *   - Colour-theme hue disc
*/

// === Motion — the easing curve as a tiny svg
export const VIZ_MOTION = {
  none: <CurveSvg d="M2 18 L22 18" />,
  snappy: <CurveSvg d="M2 18 C 6 18, 6 4, 22 4" />,
  smooth: <CurveSvg d="M2 18 C 10 18, 14 4, 22 4" />,
  playful: <CurveSvg d="M2 18 C 8 18, 12 -3, 16 4 S 22 4, 22 4" />,
}

function CurveSvg({ d }: { d: string }) {
  return (
    <svg width="22" height="18" viewBox="0 0 24 22" fill="none" aria-hidden="true">
      <path d={d} stroke="#6b6b73" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// === Radius — a single rounded corner (line only), same line-style
// vocabulary as the Motion easing curves. Always the BOTTOM-LEFT corner, drawn
// with a quadratic whose control point IS the corner point, so the curve is
// convex toward bottom-left at every radius (no arc/sweep ambiguity). Box +
// Button radius share the exact same glyph (Button adds Pill at the max).
function CornerSvg({ r }: { r: number }) {
  const x = 4         // left edge of the vertical leg
  const yTop = 2      // top of the vertical leg
  const yBot = 16     // the corner's baseline (bottom-left corner point)
  const xRight = 18   // right end of the horizontal leg
  const rr = Math.min(r, yBot - yTop, xRight - x)
  const d =
    rr <= 0
      ? `M ${x} ${yTop} L ${x} ${yBot} L ${xRight} ${yBot}`
      : `M ${x} ${yTop} L ${x} ${yBot - rr} Q ${x} ${yBot} ${x + rr} ${yBot} L ${xRight} ${yBot}`
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" fill="none" aria-hidden="true">
      <path
        d={d}
        stroke="#1a1a1d"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const VIZ_RADIUS = {
  none: <CornerSvg r={0} />,
  subtle: <CornerSvg r={3} />,
  soft: <CornerSvg r={7} />,
  round: <CornerSvg r={12} />,
}

// === Color theme — small solid hue circle (14px), sized to match the
// Brand-colour footer dot (.fmrow__dot) so the whole theme flyout reads
// subtler and takes less room. Mono gets a light rim for definition.
function ColorDisc({ hex, isGreyscale = false }: { hex: string; isGreyscale?: boolean }) {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: 999,
        background: hex,
        display: 'inline-block',
        boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.12)',
        border: isGreyscale ? '1px solid #d9d9dd' : 'none',
      }}
    />
  )
}
export const VIZ_COLOR_THEME = {
  mono:   <ColorDisc hex="#3b3b42" isGreyscale />,
  cobalt: <ColorDisc hex="#2563EB" />,
  sky:    <ColorDisc hex="#0284C7" />,
  teal:   <ColorDisc hex="#0D9488" />,
  jade:   <ColorDisc hex="#059669" />,
  indigo: <ColorDisc hex="#4F46E5" />,
  violet: <ColorDisc hex="#7C3AED" />,
  coral:  <ColorDisc hex="#DB2777" />,
  rose:   <ColorDisc hex="#E11D48" />,
  ember:  <ColorDisc hex="#EA580C" />,
}
