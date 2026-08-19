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

/** The drop zone's glyph: a tray with depth and a file (or a folder) that
 *  settles into it every few seconds. Drawn with weight — filled shapes, a
 *  soft shadow, 2px strokes — so it reads as an object, not a wire. */
export function DropGlyph({ kind }: { kind: 'zip' | 'folder' }) {
  return (
    <svg className="dropglyph" width="88" height="64" viewBox="0 0 88 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="dg-tray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".10" /><stop offset="1" stopColor="currentColor" stopOpacity=".22" /></linearGradient>
        <linearGradient id="dg-item" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--app-surface, #fff)" /><stop offset="1" stopColor="var(--app-hover, #f4f4f6)" /></linearGradient>
        <filter id="dg-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#000" floodOpacity=".18" /></filter>
      </defs>
      {/* tray: back wall, then the front lip over the item */}
      <path className="dropglyph__back" d="M16 40h56v12a5 5 0 0 1-5 5H21a5 5 0 0 1-5-5V40z" />
      <g className="dropglyph__item" filter="url(#dg-shadow)">
        {kind === 'zip' ? (
          <>
            <path className="dropglyph__paper" d="M30 8h19l11 11v25a3 3 0 0 1-3 3H30a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3z" />
            <path className="dropglyph__fold" d="M49 8v11h11" />
            <path className="dropglyph__lines" d="M36 22h14M36 28h14M36 34h9" />
          </>
        ) : (
          <>
            <path className="dropglyph__paper" d="M26 14h14l5 5h18a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H26a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3z" />
            <path className="dropglyph__fold" d="M23 24h43" />
          </>
        )}
      </g>
      <path className="dropglyph__front" d="M12 38h64a3 3 0 0 1 3 3v2H9v-2a3 3 0 0 1 3-3z" />
      <path className="dropglyph__front dropglyph__front--body" d="M16 43h56v9a5 5 0 0 1-5 5H21a5 5 0 0 1-5-5v-9z" />
    </svg>
  )
}
