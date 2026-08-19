/** The UISandbox mark — brand/logo.svg's glyph, drawn in currentColor so it
 *  sits in the chrome's own ink in either scheme. */
export function Mark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M64 64H0V0H64V64ZM12 32H32V40H12V52H52V32H32V24H52V12H12V32Z" fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}

/** GitHub's mark (the octocat silhouette path from their brand assets), currentColor. */
export function GithubMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

/** The drop zone's glyph, the way macOS shows a drag: the file (or folder) on
 *  the left, a dotted arrow with a gentle arc, a dotted landing field on the
 *  right. The dots flow along the arc; nothing disappears into anything. */
export function DropGlyph({ kind }: { kind: 'zip' | 'folder' }) {
  return (
    <svg className="dropglyph" width="132" height="56" viewBox="0 0 132 56" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="dg-item" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--app-surface, #fff)" /><stop offset="1" stopColor="var(--app-hover, #f4f4f6)" /></linearGradient>
        <filter id="dg-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.8" floodColor="#000" floodOpacity=".16" /></filter>
      </defs>
      <g className="dropglyph__item" filter="url(#dg-shadow)">
        {kind === 'zip' ? (
          <>
            <path className="dropglyph__paper" d="M9 8h15l8 8v24a2.5 2.5 0 0 1-2.5 2.5H9A2.5 2.5 0 0 1 6.5 40V10.5A2.5 2.5 0 0 1 9 8z" />
            <path className="dropglyph__fold" d="M24 8v8h8" />
            {/* the zipper: teeth down the left, the pull at the bottom */}
            <path className="dropglyph__zipper" d="M14.5 11v17" />
            <rect className="dropglyph__pull" x="11.5" y="28" width="6" height="8" rx="1.6" />
            <path className="dropglyph__pullhole" d="M14.5 31.5v2" />
          </>
        ) : (
          <>
            <path className="dropglyph__paper" d="M6.5 14h12l4 4h13a2.5 2.5 0 0 1 2.5 2.5V38a2.5 2.5 0 0 1-2.5 2.5H9A2.5 2.5 0 0 1 6.5 38V14z" />
            <path className="dropglyph__fold" d="M6.5 22h31.5" />
          </>
        )}
      </g>
      {/* the arc: dots that travel from the file to the field — no arrowhead, the motion says it */}
      <path className="dropglyph__arc dropglyph__arc--track" d="M42 32 C 58 12, 76 12, 92 28" />
      <path className="dropglyph__arc dropglyph__arc--dots" d="M42 32 C 58 12, 76 12, 92 28" />
      {/* the landing field */}
      <rect className="dropglyph__field" x="98" y="13" width="28" height="28" rx="8" />
    </svg>
  )
}
