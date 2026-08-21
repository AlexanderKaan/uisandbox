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
import type { Anchors, PaintRoles, TypeLevel } from '../sandbox/coverage'
import { nameColor } from '../tokens/color'

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

/** The type levels.
 *
 *  Read off the PAGE where the page will say: `body`, its biggest visible h1,
 *  its biggest h2/h3. One element's own family, size, weight and leading
 *  belong together, and that is the whole point of a level.
 *
 *  The stylesheet census is the fallback, and it is a weaker one: it ranks
 *  sizes, weights and line-heights separately and then glues the winners
 *  together. Measured on the Mantine docs, that produced a body level of
 *  11px/700/1 — three real numbers describing an element that does not exist.
 *  So the fallback carries only what it can defend: the size.
 */
function levelsOf(m: Measured): Level[] {
  const out: Level[] = []
  const seen = new Set<string>()
  const add = (l: Level | undefined) => {
    if (!l || seen.has(l.fontSize)) return
    seen.add(l.fontSize)
    out.push(l)
  }
  const t = m.anchors.type
  const read = (name: string, at: TypeLevel | undefined): Level | undefined => {
    if (!at) return undefined
    const px = parseFloat(at.fontSize)
    if (!Number.isFinite(px) || px < 8 || px > 200) return undefined
    const weight = parseInt(at.fontWeight, 10)
    const lh = parseFloat(at.lineHeight)
    return {
      name,
      fontFamily: at.fontFamily,
      fontSize: at.fontSize,
      ...(Number.isFinite(weight) ? { fontWeight: weight } : {}),
      // Computed leading is px; a design system wants the ratio, and a ratio
      // survives a size change. `normal` computes to no number: leave it out.
      ...(Number.isFinite(lh) && px ? { lineHeight: Math.round((lh / px) * 100) / 100 } : {}),
    }
  }
  // A page whose h2 is bigger than its h1 is not unusual (AdminLTE: 26.6 vs
  // 32.6). Whichever is actually larger is the display level; the name has to
  // follow the measurement, not the tag.
  const first = read('display', t?.display)
  const second = read('heading', t?.heading)
  const big = first && second && parseFloat(second.fontSize) > parseFloat(first.fontSize) ? second : first
  const small = big === second ? first : second
  add(big && { ...big, name: 'display' })
  add(small && { ...small, name: 'heading' })
  add(read('body', t?.body))

  // Whatever the page did not answer for, from the sheet — size only.
  const sizes = m.sizes
  if (sizes.length) {
    const byCount = [...sizes].sort((a, b) => b.count - a.count)
    const want: Array<[string, Row | undefined]> = [
      ['display', sizes[0]],
      ['heading', sizes[1]],
      ['body', byCount[0]],
      ['small', sizes[sizes.length - 1]],
    ]
    for (const [name, row] of want) {
      if (!row || out.some((l) => l.name === name)) continue
      const display = name === 'display' || name === 'heading'
      add({ name, fontFamily: display ? m.fonts.display : m.fonts.body, fontSize: px(row.value) })
    }
  }
  const rank = ['display', 'heading', 'body', 'small']
  return out.sort((a, b) => rank.indexOf(a.name) - rank.indexOf(b.name))
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
  /** What the page computes for its own ink, ground and type levels. */
  anchors?: Anchors
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
    for (const p of m.palette) {
      const how = p.count ? `${describeRole(p)}, used ${p.count} time${p.count === 1 ? '' : 's'} in the build` : p.name === 'primary' ? 'the brand colour' : describeRole(p)
      body.push(`- **${cap(p.name)} (${p.value})** — ${how}.${p.changed ? ` Was ${p.was}.` : ''}`)
    }
    const named = m.palette[0] && /^#[0-9a-f]{6}$/i.test(m.palette[0].value) ? nameColor(m.palette[0].value as `#${string}`) : ''
    body.push('', `The brand colour reads as ${named || 'the primary'}. Use it for the single most important action on a screen; everything else comes from the neutrals above.`)
  } else {
    body.push('No colour could be placed in a role from this build.')
  }
  body.push('')

  body.push('## Typography', '')
  if (levels.length) {
    // From the levels, not from the knob's own label: the two disagreed on
    // every fixture where the page set a different face on its headings.
    const famOf = (n: string) => levels.find((l) => l.name === n)?.fontFamily
    const head = famOf('display') ?? famOf('heading') ?? m.fonts.display
    const copy = famOf('body') ?? m.fonts.body
    body.push(head === copy ? `Everything is set in **${copy}**.` : `Headings are set in **${head}**, body copy in **${copy}**.`, '')
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
  // A `shadow` entry that is a bare length is a fragment of a shorthand, not a
  // shadow (Spectrum's read as `2px`); recommending it would be nonsense.
  const shadow = m.shadows.find((r) => r.value.trim().split(/\s+/).length >= 3)
  if (shadow) {
    body.push(`Depth comes from ${m.shadows.length} shadow${m.shadows.length === 1 ? '' : 's'}. The one the build leans on most is \`${shadow.value}\`${shadow.changed ? ` (was \`${shadow.was}\`)` : ''}. Reuse it rather than inventing a new blur.`)
  } else if (m.shadows.length) {
    body.push(`The build holds ${m.shadows.length} shadow value${m.shadows.length === 1 ? '' : 's'}, none of them a complete shadow this reader could restate. Copy the elevation off the existing components rather than from here.`)
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
  // An anchor is described by the job it holds in this file, not by wherever
  // else the value happens to appear: AdminLTE's page ground `#f8f9fa` is also
  // painted on text somewhere, and "surface — painted on text" reads as a bug.
  if (p.anchor === 'text') return 'the body ink, read off the page'
  if (p.anchor === 'surface') return 'the page ground, read off the page'
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
