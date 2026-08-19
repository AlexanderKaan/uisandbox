import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

const LINES: Array<{ id: string; label: string; cmd: string; hint: string }> = [
  { id: 'cli', label: 'Terminal', cmd: 'npx uisandbox-mcp open ./dist', hint: 'Opens the sandbox in your browser with your build folder (or a zip).' },
  { id: 'claude', label: 'Claude Code', cmd: 'claude mcp add uisandbox -- npx -y uisandbox-mcp', hint: 'Then: "open this app in UISandbox" — it builds, loads, opens.' },
  { id: 'plugin', label: 'Plugin', cmd: '/plugin marketplace add AlexanderKaan/uisandbox', hint: 'Then /plugin install uisandbox@uisandbox — the /uisandbox skill + server.' },
  { id: 'mcp', label: 'Any MCP client', cmd: 'npx -y uisandbox-mcp', hint: 'Cursor, Claude Desktop, Codex: add as a stdio server.' },
]

/** The one-line install, the way tools show it: `$ npx …`, copy, a small
 *  switch for the shapes it comes in. */
export function InstallLine() {
  const [which, setWhich] = useState('cli')
  const [copied, setCopied] = useState(false)
  const line = LINES.find((l) => l.id === which)!
  const copy = async () => { try { await navigator.clipboard.writeText(line.cmd); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch { /* selectable anyway */ } }
  return (
    <div className="install">
      <div className="install__tabs" role="tablist" aria-label="How to install">
        {LINES.map((l) => <button key={l.id} type="button" role="tab" aria-selected={which === l.id} className={`install__tab ${which === l.id ? 'install__tab--on' : ''}`} onClick={() => setWhich(l.id)}>{l.label}</button>)}
      </div>
      <div className="install__pill">
        <span className="install__prompt" aria-hidden>$</span>
        <code className="install__cmd">{line.cmd}</code>
        <button type="button" className="install__copy" onClick={copy} aria-label="Copy" title="Copy">{copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} />}</button>
      </div>
      <div className="install__hint">{line.hint} · <a href="https://www.npmjs.com/package/uisandbox-mcp" target="_blank" rel="noopener">npm</a> · <a href="https://github.com/AlexanderKaan/uisandbox/blob/main/mcp/README.md" target="_blank" rel="noopener">docs</a></div>
    </div>
  )
}
