import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Terminal } from 'lucide-react'

const CMD = 'npx -y uisandbox-mcp'
const CONFIG = JSON.stringify({ mcpServers: { uisandbox: { command: 'npx', args: ['-y', 'uisandbox-mcp'] } } }, null, 2)
const CLAUDE_CODE = 'claude mcp add uisandbox -- npx -y uisandbox-mcp'

/** "MCP" in the top bar: the install line an agent user is looking for, one
 *  click to copy, with the two config shapes underneath. */
export function McpButton() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1400) } catch { /* clipboard denied: the text is selectable */ }
  }
  return (
    <div className="mcp" ref={ref}>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog" title="Use UISandbox from Claude, Cursor or any MCP client">
        <Terminal size={14} /> MCP
      </button>
      {open && (
        <div className="card mcp__pop" role="dialog" aria-label="MCP server">
          <h3>UISandbox as an MCP server</h3>
          <p>The same engine, as tools for an agent: load a build, turn the knobs, verify 1:1, export the patch.</p>
          <div className="mcp__row">
            <code className="mcp__code">{CMD}</code>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => copy(CMD, 'cmd')}>{copied === 'cmd' ? <Check size={13} /> : <Copy size={13} />} {copied === 'cmd' ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="mcp__row">
            <code className="mcp__code">{CLAUDE_CODE}</code>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => copy(CLAUDE_CODE, 'cc')}>{copied === 'cc' ? <Check size={13} /> : <Copy size={13} />} {copied === 'cc' ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="mcp__row mcp__row--block">
            <pre className="mcp__code">{CONFIG}</pre>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => copy(CONFIG, 'json')}>{copied === 'json' ? <Check size={13} /> : <Copy size={13} />} {copied === 'json' ? 'Copied' : 'Copy config'}</button>
          </div>
          <p className="mcp__fine"><a href="https://www.npmjs.com/package/uisandbox-mcp" target="_blank" rel="noopener">npm</a> · <a href="https://github.com/AlexanderKaan/uisandbox/blob/main/mcp/README.md" target="_blank" rel="noopener">tools & prompt to paste</a> · <code>verify</code>/<code>screenshot</code> need <code>npx playwright install chromium</code> once</p>
        </div>
      )}
    </div>
  )
}
