import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plug } from 'lucide-react'
import { InstallLine } from './InstallLine'

/** "MCP" in the top bar, in the same jacket as Star: one click opens the
 *  install line — the same widget the hero shows, so there is one source. */
export function McpButton() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="mcp" ref={ref}>
      <button type="button" className={`mcp__btn ${open ? 'mcp__btn--on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog" title="Use UISandbox from Claude Code, Cursor or any MCP client">
        <Plug size={14} strokeWidth={2} /> MCP <ChevronDown size={12} className="mcp__chev" />
      </button>
      {open && (
        <div className="card mcp__pop" role="dialog" aria-label="MCP server">
          <div className="mcp__head">
            <b>Use it from your agent</b>
            <span>Load a build, turn the knobs, verify 1:1, export the patch — as MCP tools.</span>
          </div>
          <InstallLine />
        </div>
      )}
    </div>
  )
}
