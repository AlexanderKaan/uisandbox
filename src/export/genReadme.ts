/**
 * README.md for the "Everything (.zip)" download.
 *
 * Thirteen files in a folder with no map is a puzzle, not a deliverable. This
 * says which file to open first, what each one is for, and what to ignore —
 * in the order somebody would actually use them.
 */

export interface ReadmeFile { name: string; what: string }

export function genReadme(projectName: string, files: ReadmeFile[], opts: { moved: number; total: number; changedFiles: number; date?: string }): string {
  const date = opts.date ?? new Date().toISOString().slice(0, 10)
  const groups = new Map<string, ReadmeFile[]>()
  for (const f of files) {
    const key = f.name.startsWith('patched/') ? 'patched/' : 'root'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }
  const root = (groups.get('root') ?? []).map((f) => `| \`${f.name}\` | ${f.what} |`).join('\n')
  const patchedCount = (groups.get('patched/') ?? []).length

  return `# ${projectName} — UISandbox export

${opts.moved} of ${opts.total} design values were changed, across ${opts.changedFiles} file${opts.changedFiles === 1 ? '' : 's'}. Exported ${date}.

## Start here

**If an agent writes your code** (Claude Code, Cursor, Codex):

1. Copy \`DESIGN.md\` into the root of your repo.
2. Paste the block from \`AGENTS.md.snippet\` into your \`AGENTS.md\` (or \`CLAUDE.md\`). Create the file if you do not have one.
3. Ask your agent: *apply DESIGN.md to the UI*.

**If you edit the code yourself:**

1. Open \`patched/\` — those are your own files with the new values already written in, in their original folders.
2. Diff them against your source, take what you want.
3. \`sandbox-patch.txt\` is the same change as a find-and-replace list if you would rather do it by hand.

## What is in here

| File | What it is |
|---|---|
${root}
${patchedCount ? `| \`patched/…\` | ${patchedCount} of your own file${patchedCount === 1 ? '' : 's'}, rewritten with the new values in place. The complete change. |\n` : ''}
## Notes

- Values here are the ones on screen in the sandbox, not a re-derivation. What you saw is what these files say.
- \`DESIGN.md\` and \`design.tokens.json\` describe **your app as measured**. \`tokens.css\`, \`tokens.json\`, the Tailwind and shadcn files and the native ones describe **a fresh token system seeded from these values** — a different thing, useful if you are starting a system rather than patching one.
- \`sandbox-values.css\` is a reference list of every value found, under names of our own. It is not a drop-in stylesheet; your CSS does not read those variable names.

Made with [UISandbox](https://uisandbox.org). Your files never left your browser.
`
}
