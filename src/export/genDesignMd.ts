/**
 * DESIGN.md — the design system as a file an agent reads.
 *
 * Format: the Google Labs DESIGN.md spec (version `alpha`) — YAML front matter
 * with typed token groups, then prose sections in a fixed order. See
 * https://github.com/google-labs-code/design.md.
 *
 * The point of this export is the last mile: somebody turned four knobs here
 * and now has to get that into a repo they may not know how to edit. Handing
 * their agent a DESIGN.md is the shortest honest route — it is a format the
 * agent already knows, and it carries the WHY next to the values.
 *
 * Everything in it is measured (see measured.ts). What we did not measure is
 * declared in `omitted:` with a reason rather than invented — the spec has a
 * field for exactly that, and a design doc that guesses at a component library
 * it never saw would send an agent off writing fiction.
 */
import type { SubstitutionTable } from '../sandbox/table'
import type { Config } from '../tokens/types'
import { measure, pxOf, type Measured, type NamedRow, type Row } from './measured'
import { nameColor } from '../tokens/color'
import type { PaintRoles } from '../sandbox/coverage'

/** A YAML scalar: plain when it cannot be mistaken for anything else, quoted
 *  otherwise. `#e11d48` unquoted is a comment; `Inter, sans-serif` unquoted is
 *  not the string they think it is. */
function yv(v: string | number): string {
  if (typeof v === 'number') return String(v)
  const s = v.trim()
  if (/^[A-Za-z][A-Za-z0-9 ._-]*$/.test(s) && !/^(y|n|yes|no|true|false|on|off|null)$/i.test(s)) return s
  return JSON.stringify(s)
}

const px = (v: string): string => (/^-?\d*\.?\d+$/.test(v.trim()) ? `${v.trim()}px` : v.trim())

interface Level { name: string; fontFamily: string; fontSize: string; fontWeight?: number; lineHeight?: string | number; letterSpacing?: string }

/** Up to four type levels, taken from the sizes the build actually paints:
 *  the biggest, the one under it, the most-used (that is the body), the
 *  smallest. Sizes nobody uses twice are not a level. */
function levelsOf(m: Measured): Level[] {
  const sizes = m.sizes
  if (!sizes.length) return []
  const byCount = [...sizes].sort((a, b) => b.count - a.count)
  const body = byCount[0]!
  const weights = m.weights.map((w) => parseInt(w.value, 10)).filter((n) => Number.isFinite(n))
  const heavy = weights.length ? Math.max(...weights) : undefined
  const bodyWeight = m.weights[0] ? parseInt(m.weights[0].value, 10) : undefined
  const lh = m.lineHeights[0]?.value
  const picks: Array<[string, Row | undefined, number | undefined]> = [
    ['display', sizes[0], heavy],
    ['heading', sizes[1], heavy],
    ['body', body, Number.isFinite(bodyWeight as number) ? bodyWeight : undefined],
    ['small', sizes[sizes.length - 1], undefined],
  ]
  const out: Level[] = []
  const seen = new Set<string>()
  for (const [name, row, weight] of picks) {
    if (!row || seen.has(row.value)) continue
    seen.add(row.value)
    const display = name === 'display' || name === 'heading'
    out.push({
      name,
      fontFamily: display ? m.fonts.display : m.fonts.body,
      fontSize: px(row.value),
      ...(weight && Number.isFinite(weight) ? { fontWeight: weight } : {}),
      ...(lh && name === 'body' ? { lineHeight: /^-?\d*\.?\d+$/.test(lh) ? parseFloat(lh) : px(lh) } : {}),
    })
  }
  return out
}

const list = (rows: NamedRow[]): string =>
  rows.map((r) => `  ${r.name}: ${yv(px(r.value))}`).join('\n')

export interface DesignMdOptions {
  /** ISO date; the file says when it was measured, because values age. */
  date?: string
  /** The baseline's own provenance lines ("Brand from the code: #…"). */
  notes?: string[]
  /** Where the screen painted each sheet entry — roles and ranking read it. */
  painted?: Map<number, PaintRoles>
  /** The page's own ink and ground, off `body`. */
  anchors?: { text?: string; background?: string }
}

export function genDesignMd(
  table: SubstitutionTable,
  vars: Record<string, string>,
  cfg: Config,
  projectName: string,
  opts: DesignMdOptions = {},
): string {
  const m = measure(table, vars, cfg.cPrimary, { display: cfg.fontDisplay, body: cfg.fontBody }, { painted: opts.painted, anchors: opts.anchors })
  const date = opts.date ?? new Date().toISOString().slice(0, 10)
  const name = projectName.replace(/\.(zip|tar|gz)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Untitled'
  const levels = levelsOf(m)

  // What we did not see, said out loud. The spec takes a reason per section.
  const omitted: Array<{ section: string; reason: string }> = [
    { section: 'components', reason: 'UISandbox reads values out of a built app; component structure was not observed.' },
  ]
  if (!m.spacing.length) omitted.push({ section: 'spacing', reason: 'No spacing literals could be told apart from other lengths in this build.' })
  if (!m.radii.length) omitted.push({ section: 'rounded', reason: 'This build paints no corner radius.' })

  const fm: string[] = ['---', 'version: alpha', `name: ${yv(name)}`]
  fm.push(`description: ${yv(`Measured from the built app by UISandbox on ${date}. ${m.totals.moved} of ${m.totals.values} design values were changed in this pass; the tokens below are what the interface paints now.`)}`)
  fm.push('omitted:')
  for (const o of omitted) fm.push(`  - section: ${o.section}\n    reason: ${yv(o.reason)}`)
  if (m.palette.length) {
    fm.push('colors:')
    for (const p of m.palette) fm.push(`  ${p.name}: ${yv(p.value)}`)
  }
  if (levels.length) {
    fm.push('typography:')
    for (const l of levels) {
      fm.push(`  ${l.name}:`)
      fm.push(`    fontFamily: ${yv(l.fontFamily)}`)
      fm.push(`    fontSize: ${yv(l.fontSize)}`)
      if (l.fontWeight) fm.push(`    fontWeight: ${l.fontWeight}`)
      if (l.lineHeight !== undefined) fm.push(`    lineHeight: ${typeof l.lineHeight === 'number' ? l.lineHeight : yv(l.lineHeight)}`)
    }
  }
  if (m.radii.length) fm.push('rounded:\n' + list(m.radii))
  if (m.spacing.length) fm.push('spacing:\n' + list(m.spacing))
  fm.push('---')

  // ---- prose ---------------------------------------------------------------
  const body: string[] = [`# ${name}`, '']

  body.push('## Overview', '')
  body.push(
    `This file was measured, not written: UISandbox read ${m.totals.values} design values out of this app's own built stylesheets and ${m.totals.moved === 0 ? 'none were changed' : `${m.totals.moved} of them were changed`} in this pass. The tokens in the front matter are the values the interface paints right now, so they are the ones to build against.`,
    '',
    m.fromScreen
      ? 'Which value got which name was decided on the rendered screen, not on how often a stylesheet mentions it. A utility class nobody used does not become a token here.'
      : 'Names were assigned from how often the stylesheets use a value; the rendered screen was not available to check them against, so treat the roles as a strong guess and the values as exact.',
    '',
  )
  if (opts.notes?.length) {
    body.push('Where the readings came from:', '')
    for (const n of opts.notes.slice(0, 6)) body.push(`- ${n}`)
    body.push('')
  }

  body.push('## Colors', '')
  if (m.palette.length) {
    for (const p of m.palette) body.push(`- **${cap(p.name)} (${p.value})**${p.count ? ` — ${describeRole(p)}, used ${p.count} time${p.count === 1 ? '' : 's'} in the build` : ' — the brand colour'}.${p.changed ? ` Was ${p.was}.` : ''}`)
    const named = m.palette[0] && /^#[0-9a-f]{6}$/i.test(m.palette[0].value) ? nameColor(m.palette[0].value as `#${string}`) : ''
    body.push('', `The brand colour reads as ${named || 'the primary'}. Use it for the single most important action on a screen; everything else comes from the neutrals above.`)
  } else {
    body.push('No colour could be placed in a role from this build.')
  }
  body.push('')

  body.push('## Typography', '')
  if (levels.length) {
    body.push(`Headings are set in **${m.fonts.display}**, body copy in **${m.fonts.body}**.`, '')
    for (const l of levels) body.push(`- **${cap(l.name)}:** ${l.fontFamily} at ${l.fontSize}${l.fontWeight ? `, weight ${l.fontWeight}` : ''}.`)
    if (m.sizes.length > levels.length) body.push('', `The build paints ${m.sizes.length} distinct font sizes; the four above are the ones that carry the page. Snap a new size onto the nearest of them rather than adding another step.`)
  } else {
    body.push(`Headings in **${m.fonts.display}**, body in **${m.fonts.body}**. No size ladder could be read from this build.`)
  }
  body.push('')

  body.push('## Layout', '')
  body.push(m.spacing.length
    ? `Spacing runs on the measured steps in the front matter (${m.spacing.map((s) => px(s.value)).join(', ')}). Keep to them: they are the rhythm the existing screens already have.`
    : 'No spacing scale could be read from this build; follow the padding already on the surrounding elements.')
  body.push('')

  body.push('## Elevation & Depth', '')
  if (m.shadows.length) {
    body.push(`Depth comes from ${m.shadows.length} shadow${m.shadows.length === 1 ? '' : 's'}. The one the build leans on most is \`${m.shadows[0]!.value}\`${m.shadows[0]!.changed ? ` (was \`${m.shadows[0]!.was}\`)` : ''}. Reuse it rather than inventing a new blur.`)
  } else {
    body.push('This build paints no shadows. Hierarchy is carried by colour and borders, so keep new surfaces flat.')
  }
  body.push('')

  body.push('## Shapes', '')
  if (m.radii.length) {
    const zero = m.radii.every((r) => pxOf(r.value) === 0)
    body.push(zero
      ? 'Every corner in this build is square. Keep them square.'
      : `Corners run ${m.radii.map((r) => px(r.value)).join(' · ')}. The one used most is ${px([...m.radii].sort((a, b) => b.count - a.count)[0]!.value)}; treat that as the default and step up only for large surfaces.`)
  } else {
    // `border-radius: 0` never becomes an entry (there is nothing to move), so
    // an empty ladder IS the square build — this is the branch that fires.
    body.push('No corner radius is set anywhere in this build. The corners are square; keep them square.')
  }
  body.push('')

  body.push("## Do's and Don'ts", '')
  body.push('- Do take colours, sizes and radii from the front matter above instead of typing new literals.')
  if (m.palette[0]) body.push(`- Do use \`{colors.primary}\` for the one most important action per screen.`)
  const changedPalette = m.palette.filter((p) => p.changed)
  if (changedPalette.length) body.push(`- Don't reintroduce ${changedPalette.map((p) => `\`${p.was}\``).join(' or ')}: ${changedPalette.length === 1 ? 'it was' : 'they were'} replaced everywhere in this pass.`)
  if (m.radii.every((r) => pxOf(r.value) === 0)) body.push("- Don't add rounded corners: this build is square throughout.")
  if (!m.shadows.length) body.push("- Don't add shadows: this build has none, and one new card with a shadow reads as a mistake.")
  body.push("- Don't treat this file as a component spec. It records values, not structure — check the existing components before adding a new one.")
  body.push('')

  return fm.join('\n') + '\n\n' + body.join('\n')
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')

function describeRole(p: NamedRow): string {
  // What the SCREEN saw beats what the stylesheet called the property: a
  // colour reached through `--bs-gray-900` is still ink on the page, and
  // "used on --bs-gray-900" tells a reader nothing they can act on.
  if (p.paintRole && p.painted) {
    const where = p.paintRole === 'text' ? 'painted on text' : p.paintRole === 'surface' ? 'painted as a background' : 'painted on borders'
    return `${where} on ${p.painted} element${p.painted === 1 ? '' : 's'} of this screen`
  }
  const prop = p.props[0] ?? ''
  if (prop === 'color') return 'painted on text'
  if (prop.startsWith('background')) return 'painted as a background'
  if (prop.includes('border')) return 'painted on borders'
  if (prop === 'fill' || prop === 'stroke') return 'painted in icons'
  return prop ? `used on \`${prop}\`` : 'measured in the build'
}
