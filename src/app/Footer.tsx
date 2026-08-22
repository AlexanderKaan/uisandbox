/** The one footer: who made it, the licence, where the source and the
 *  server are, and what the tool does with your files (nothing). Semantic
 *  <footer>, so it reads as the site's footer to crawlers too. */
export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="foot" aria-label="About UISandbox">
      <span className="foot__credit">Made with ♥ by <a href="https://github.com/AlexanderKaan" target="_blank" rel="noopener author">Alexander Kaan</a> at <a href="https://pageminds.com/" target="_blank" rel="noopener">Pageminds</a></span>
      <span className="foot__sep" aria-hidden>·</span>
      <span>© {year} Pageminds · <a href="https://github.com/AlexanderKaan/uisandbox/blob/main/LICENSE" target="_blank" rel="noopener license">MIT</a>, free forever</span>
      <span className="foot__sep" aria-hidden>·</span>
      <nav className="foot__links" aria-label="UISandbox links">
        <a href="https://github.com/AlexanderKaan/uisandbox" target="_blank" rel="noopener">Source</a>
        <a href="https://github.com/AlexanderKaan/uisandbox/discussions" target="_blank" rel="noopener">Discussions</a>
        <a href="https://www.npmjs.com/package/uisandbox-mcp" target="_blank" rel="noopener">MCP server</a>
        <a href="https://github.com/AlexanderKaan/uisandbox/blob/main/notes/security.md" target="_blank" rel="noopener">Privacy &amp; security</a>
        <a href="/llms.txt">llms.txt</a>
      </nav>
      <span className="foot__sep" aria-hidden>·</span>
      <span className="foot__note">Your files never leave your browser.</span>
    </footer>
  )
}
