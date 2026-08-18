/** The UISandbox mark — brand/logo.svg's glyph, drawn in currentColor so it
 *  sits in the chrome's own ink in either scheme. */
export function Mark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M64 64H0V0H64V64ZM12 32H32V40H12V52H52V32H32V24H52V12H12V32Z" fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}
