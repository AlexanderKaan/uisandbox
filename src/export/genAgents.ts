/**
 * The AGENTS.md block that points an agent at DESIGN.md.
 *
 * A SNIPPET, never a whole file: AGENTS.md is a convention with tens of
 * thousands of repos behind it and the one in their project is usually full of
 * build and test instructions. Handing them a complete AGENTS.md to "save"
 * would quietly delete all of that. So this is a section to append, and the
 * dialog says so.
 *
 * The same block works verbatim as a section in CLAUDE.md (Claude Code),
 * .cursorrules or GEMINI.md — they are all "read this before you touch the
 * UI", and DESIGN.md is the thing being pointed at.
 */

export function genAgentsBlock(projectName: string, opts: { date?: string; moved?: number } = {}): string {
  const date = opts.date ?? new Date().toISOString().slice(0, 10)
  const name = projectName.replace(/\.(zip|tar|gz)$/i, '').replace(/[-_]+/g, ' ').trim() || 'this app'
  return `<!-- Append this to AGENTS.md in your repo root. The same block works in
     CLAUDE.md, GEMINI.md or .cursorrules — whichever your agent reads. -->

## Design

The visual system for ${name} is defined in [DESIGN.md](./DESIGN.md).

- Read DESIGN.md before writing or changing any UI.
- Take colours, type, corner radii and spacing from its front matter tokens.
  Reference them by name (\`{colors.primary}\`, \`{rounded.md}\`) rather than
  pasting hex values into components.
- If a value you need is not in DESIGN.md, use the nearest token that is, and
  say in your summary which one you picked and why. Do not add a new literal
  without flagging it.
- DESIGN.md records VALUES, not component structure. Check the existing
  components before inventing a new one.
- It was measured from the built app with UISandbox on ${date}${opts.moved ? ` (${opts.moved} value${opts.moved === 1 ? '' : 's'} changed in that pass)` : ''}. If the UI and DESIGN.md disagree, DESIGN.md is the intent and the UI is the thing to fix.
`
}
