/**
 * Rewrite THEIR CSS so every design literal reads through a variable.
 *
 *   .btn { background: #4f39f6; border-radius: 12px }
 *     → .btn { background: var(--us-v1); border-radius: var(--us-v2) }
 *
 * Nothing else changes: not selectors, not order, not specificity, not the
 * cascade. `var()` in a shorthand computes to the identical value once the
 * variable holds the identical literal, so the identity sheet is 1:1 by
 * construction (and `sandbox/verify.ts` measures that claim on the DOM).
 *
 * What is deliberately NOT touched:
 *   - `@font-face` blocks (the family there is a DEFINITION and `src` is a URL)
 *   - `@keyframes` (interpolation between var()-valued stops is fine in modern
 *     engines, but a keyframe is not where a design decision lives)
 *   - at-rule preludes (`@media (min-width: 640px)` — a length, not spacing)
 *   - anything inside `url(...)` or a string
 *   - `transparent`, `currentColor`, `inherit`, `initial`, `unset`, `none`
 *   - `0`, `auto`, percentages and `9999px`-style pill radii (nothing to scale)
 *
 * The scanner is a hand-rolled single pass over the text — a real CSS parser
 * would rebuild the stylesheet from a tree and lose formatting, comments and
 * every hack the browser silently tolerates. We only ever splice inside a
 * declaration's value, so what the browser cannot parse stays exactly as broken
 * as it was, and what it can parse keeps its bytes.
 */
import { SubstitutionTable, cssValue, varName, type Kind, type Site } from './table'

// ─────────────────────────── the scanner ───────────────────────────

interface Decl {
  prop: string
  valueStart: number
  valueEnd: number
  /** Names of the enclosing at-rules, outermost first (`font-face`, `media`…). */
  atRules: string[]
  /** The innermost enclosing selector, trimmed; '' inside a bare at-rule. */
  selector: string
}

/** Find every declaration in a stylesheet, as byte ranges — no tree is built. */
export function scanDeclarations(css: string): Decl[] {
  const out: Decl[] = []
  const n = css.length
  // Stack of blocks; each is either an at-rule (by name) or a style rule ('').
  const stack: string[] = []
  const selectors: string[] = []
  let i = 0

  const skipComment = () => {
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
      return true
    }
    return false
  }
  const skipString = () => {
    const q = css[i]
    if (q !== '"' && q !== "'") return false
    i++
    while (i < n && css[i] !== q) {
      if (css[i] === '\\') i++
      i++
    }
    i++
    return true
  }
  const skipUrl = () => {
    // url( unquoted-token ) — a `)` inside is impossible unless escaped
    if (!/^url\(/i.test(css.slice(i, i + 4))) return false
    i += 4
    while (i < n && css[i] !== ')') {
      if (css[i] === '\\') i++
      else if (css[i] === '"' || css[i] === "'") { skipString(); continue }
      i++
    }
    i++
    return true
  }

  // A backslash escapes the next character ANYWHERE outside a string — in a
  // selector too: Tailwind's `.bg-\[url\(\'\/img\/x\.png\'\)\]` carries `\'`,
  // and reading that as a string start swallowed the next 107 rules whole.
  const skipEscape = () => { if (css[i] === '\\') { i += 2; return true } return false }

  while (i < n) {
    if (skipComment() || skipString() || skipEscape()) continue
    const c = css[i]!
    if (c === '}') { stack.pop(); selectors.pop(); i++; continue }
    if (/\s/.test(c) || c === ';') { i++; continue }

    // Read a "prelude or declaration" up to `{`, `;` or `}` at depth 0 of parens.
    const start = i
    let depth = 0
    let colonAt = -1
    let terminator = ''
    while (i < n) {
      if (skipComment() || skipString() || skipUrl() || skipEscape()) continue
      const ch = css[i]!
      if (ch === '(') depth++
      else if (ch === ')') depth = Math.max(0, depth - 1)
      else if (depth === 0) {
        if (ch === ':' && colonAt < 0) colonAt = i
        else if (ch === '{' || ch === ';' || ch === '}') { terminator = ch; break }
      }
      i++
    }
    const text = css.slice(start, i)

    if (terminator === '{') {
      // A block opens: an at-rule, a selector, or (CSS nesting) a nested rule.
      const at = text.match(/^@([\w-]+)/)
      stack.push(at ? at[1]!.toLowerCase() : '')
      selectors.push(at ? '' : text.trim().replace(/\s+/g, ' '))
      i++
      continue
    }

    // A declaration — but only INSIDE a block, and only with a colon that is
    // not part of a pseudo-selector (a selector never reaches here: it would
    // have ended in `{`).
    if (stack.length > 0 && colonAt > 0) {
      const prop = css.slice(start, colonAt).trim().toLowerCase()
      let vs = colonAt + 1
      while (vs < i && /\s/.test(css[vs]!)) vs++
      let ve = i
      while (ve > vs && /\s/.test(css[ve - 1]!)) ve--
      if (/^[-\w]+$/.test(prop) && ve > vs) {
        const selector = [...selectors].reverse().find(Boolean) ?? ''
        out.push({ prop, valueStart: vs, valueEnd: ve, atRules: stack.filter(Boolean), selector })
      }
    }
    if (terminator === '}') { stack.pop(); selectors.pop() }
    if (terminator) i++
  }
  return out
}

// ─────────────────────────── the extractors ───────────────────────────

const NAMED_COLORS = new Set([
  'aliceblue','antiquewhite','aqua','aquamarine','azure','beige','bisque','black','blanchedalmond','blue','blueviolet','brown','burlywood','cadetblue','chartreuse','chocolate','coral','cornflowerblue','cornsilk','crimson','cyan','darkblue','darkcyan','darkgoldenrod','darkgray','darkgreen','darkgrey','darkkhaki','darkmagenta','darkolivegreen','darkorange','darkorchid','darkred','darksalmon','darkseagreen','darkslateblue','darkslategray','darkslategrey','darkturquoise','darkviolet','deeppink','deepskyblue','dimgray','dimgrey','dodgerblue','firebrick','floralwhite','forestgreen','fuchsia','gainsboro','ghostwhite','gold','goldenrod','gray','green','greenyellow','grey','honeydew','hotpink','indianred','indigo','ivory','khaki','lavender','lavenderblush','lawngreen','lemonchiffon','lightblue','lightcoral','lightcyan','lightgoldenrodyellow','lightgray','lightgreen','lightgrey','lightpink','lightsalmon','lightseagreen','lightskyblue','lightslategray','lightslategrey','lightsteelblue','lightyellow','lime','limegreen','linen','magenta','maroon','mediumaquamarine','mediumblue','mediumorchid','mediumpurple','mediumseagreen','mediumslateblue','mediumspringgreen','mediumturquoise','mediumvioletred','midnightblue','mintcream','mistyrose','moccasin','navajowhite','navy','oldlace','olive','olivedrab','orange','orangered','orchid','palegoldenrod','palegreen','paleturquoise','palevioletred','papayawhip','peachpuff','peru','pink','plum','powderblue','purple','rebeccapurple','red','rosybrown','royalblue','saddlebrown','salmon','sandybrown','seagreen','seashell','sienna','silver','skyblue','slateblue','slategray','slategrey','snow','springgreen','steelblue','tan','teal','thistle','tomato','turquoise','violet','wheat','white','whitesmoke','yellow','yellowgreen',
])

/** Colour-carrying properties. `border`/`outline` shorthands carry one too. */
const COLOR_PROP = /^(color|background|background-color|background-image|border|border-(top|right|bottom|left|block|inline)(-(start|end))?|border(-\w+)?-color|outline|outline-color|box-shadow|text-shadow|fill|stroke|text-decoration|text-decoration-color|text-emphasis-color|caret-color|accent-color|column-rule|column-rule-color|scrollbar-color|-webkit-text-fill-color|-webkit-text-stroke-color)$/
const RADIUS_PROP = /^(border-radius|border-(top|bottom)-(left|right)-radius|border-(start|end)-(start|end)-radius)$/
const BORDER_WIDTH_PROP = /^(border-width|border-(top|right|bottom|left|block|inline)(-(start|end))?-width|outline-width|column-rule-width)$/
/** Shorthands whose FIRST length is a border width. */
const BORDER_SHORTHAND = /^(border|border-(top|right|bottom|left|block|inline)(-(start|end))?|outline|column-rule)$/
const DURATION_PROP = /^(transition|transition-duration|animation|animation-duration)$/
const DURATION = /(?<![\w.#-])(\d*\.?\d+)(ms|s)(?![\w%])/g
const SPACE_PROP = /^(padding|margin|padding-(top|right|bottom|left|block|inline)(-(start|end))?|margin-(top|right|bottom|left|block|inline)(-(start|end))?|gap|row-gap|column-gap|grid-gap|grid-row-gap|grid-column-gap)$/

/** Values a font-* custom property can hold that are not a family. */
const FONT_KEYWORD = /^(antialiased|subpixel-antialiased|grayscale|auto|none|normal|italic|oblique|smaller|larger|inherit|initial|unset|small-caps|swap|block|fallback|optional)$/i
/** A custom property's ROLE is only knowable from its name. */
const CUSTOM_ROLE: Array<[RegExp, Kind]> = [
  [/radius|rounded/i, 'radius'],
  [/line-?height|leading/i, 'line-height'],
  [/letter-?spacing|tracking/i, 'letter-spacing'],
  [/font-?weight|(^|-)weight(-|$)/i, 'font-weight'],
  [/border-?width|stroke-?width|(^|-)bw(-|$)/i, 'border-width'],
  [/duration|(^|-)dur(-|$)|transition|(^|-)ease-?time/i, 'duration'],
  [/font-?family|typeface|(^|-)ff(-|$)|(^|-)font(-|$)|font-(sans|serif|mono|display|heading|body)/i, 'font-family'],
  [/font-?size|text-(xs|sm|base|md|lg|xl|\dxl)|(^|-)fs-|type-scale/i, 'font-size'],
  [/spac(e|ing)|gap|padding|margin|(^|-)pad|inset|size-\d/i, 'space'],
  [/shadow|elevation/i, 'shadow'],
]

const LENGTH = /(?<![\w.#-])(-?\d*\.?\d+)(px|rem|em)(?![\w%])/g
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi
const FUNC_COLOR = /\b(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab|color)\((?:[^()]|\([^()]*\))*\)/gi
const NAMED = /(?<![\w-])([a-z]{3,20})(?![\w-])/gi

interface Splice { start: number; end: number; kind: Kind; raw: string }

/** Mask strings and url() so nothing inside them is ever matched. */
function masked(value: string): string {
  let out = ''
  let i = 0
  const n = value.length
  while (i < n) {
    const c = value[i]!
    if (c === '"' || c === "'") {
      const q = c
      let j = i + 1
      while (j < n && value[j] !== q) { if (value[j] === '\\') j++; j++ }
      out += ' '.repeat(Math.min(j + 1, n) - i)
      i = Math.min(j + 1, n)
    } else if (/^url\(/i.test(value.slice(i, i + 4))) {
      let j = value.indexOf(')', i)
      if (j < 0) j = n - 1
      out += ' '.repeat(j + 1 - i)
      i = j + 1
    } else { out += c; i++ }
  }
  return out
}

/** `rgb(124 58 237 / var(--tw-bg-opacity))` → the channels `124 58 237` are the
 *  literal (Tailwind v3 and the Play CDN write every colour this way; shadcn's
 *  `hsl(var(--primary) / 0.5)` is the other way round and stays theirs). */
const CHANNELS_THEN_VAR = /^(rgba?|hsla?)\(\s*((?:\d*\.?\d+%?)(?:\s*,\s*|\s+)(?:\d*\.?\d+%?)(?:\s*,\s*|\s+)(?:\d*\.?\d+%?))\s*(?:\/|,)\s*var\(/i

function findColors(value: string, m: string, allowNamed: boolean): Splice[] {
  const s: Splice[] = []
  for (const x of m.matchAll(FUNC_COLOR)) {
    const raw = value.slice(x.index, x.index + x[0].length)
    const ch = raw.match(CHANNELS_THEN_VAR)
    if (ch) {
      const off = raw.indexOf(ch[2]!)
      s.push({ start: x.index + off, end: x.index + off + ch[2]!.length, kind: 'color', raw: (ch[1]!.toLowerCase().startsWith('hsl') ? 'hsl:' : '') + ch[2]! })
      continue
    }
    s.push({ start: x.index, end: x.index + x[0].length, kind: 'color', raw })
  }
  for (const x of m.matchAll(HEX)) s.push({ start: x.index, end: x.index + x[0].length, kind: 'color', raw: x[0] })
  if (allowNamed) {
    for (const x of m.matchAll(NAMED)) {
      const w = x[1]!.toLowerCase()
      if (!NAMED_COLORS.has(w)) continue
      s.push({ start: x.index, end: x.index + w.length, kind: 'color', raw: x[1]! })
    }
  }
  // A colour that wraps THEIR variable (`hsl(var(--primary))`) is already
  // tokenised on their side; there is no literal here to move.
  return dropOverlaps(s.filter((x) => !/var\(/i.test(x.raw)))
}

function findLengths(m: string, kind: Kind, opts: { skipPill?: boolean } = {}): Splice[] {
  const s: Splice[] = []
  for (const x of m.matchAll(LENGTH)) {
    const num = parseFloat(x[1]!)
    if (num === 0) continue
    if (opts.skipPill && ((x[2] === 'px' && num >= 100) || (x[2] !== 'px' && num >= 6))) continue
    s.push({ start: x.index, end: x.index + x[0].length, kind, raw: x[0] })
  }
  return s
}

/** Unitless numbers (`1.5`) and lengths, never `normal`. */
function findLineHeights(m: string): Splice[] {
  const s: Splice[] = []
  for (const x of m.matchAll(/(?<![\w.#-])(\d*\.?\d+)(px|rem|em|%)?(?![\w%])/g)) {
    if (x[2] === '%') continue
    const n = parseFloat(x[1]!)
    if (n <= 0) continue
    s.push({ start: x.index, end: x.index + x[0].length, kind: 'line-height', raw: x[0] })
  }
  return s
}
/** 100–900 or the two keywords that mean a number. */
function findWeights(m: string): Splice[] {
  const s: Splice[] = []
  for (const x of m.matchAll(/(?<![\w-])(?:([1-9]00)|(bold|normal))(?![\w-])/gi)) {
    s.push({ start: x.index, end: x.index + x[0].length, kind: 'font-weight', raw: x[0] })
  }
  return s
}
function findDurations(m: string): Splice[] {
  const s: Splice[] = []
  for (const x of m.matchAll(DURATION)) {
    if (parseFloat(x[1]!) === 0) continue
    s.push({ start: x.index, end: x.index + x[0].length, kind: 'duration', raw: x[0] })
  }
  return s
}

/** The direction of every linear/conic gradient in a value: a numeric angle
 *  or a single `to <side>` keyword (a corner — `to top right` — depends on the
 *  box's aspect ratio and has no fixed angle, so it stays as written). */
const GRADIENT_DIR = /((?:repeating-)?(?:linear|conic)-gradient\(\s*(?:from\s+)?)(-?\d*\.?\d+(?:deg|turn|rad|grad)|to\s+(?:top|right|bottom|left))(?=\s*,)/gi
function findAngles(m: string): Splice[] {
  const s: Splice[] = []
  for (const x of m.matchAll(GRADIENT_DIR)) {
    const start = x.index + x[1]!.length
    s.push({ start, end: start + x[2]!.length, kind: 'angle', raw: x[2]! })
  }
  return s
}
const HAS_GRADIENT = /(linear|conic)-gradient\(/i

/** Nested function-colours produce overlapping matches; keep the outermost. */
function dropOverlaps(s: Splice[]): Splice[] {
  s.sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Splice[] = []
  let lastEnd = -1
  for (const x of s) {
    if (x.start < lastEnd) continue
    out.push(x)
    lastEnd = x.end
  }
  return out
}

const KEYWORD_ONLY = /^(inherit|initial|unset|revert|revert-layer|none|auto|transparent|currentcolor|0)$/i

/** `font: italic 600 14px/1.4 "Inter", sans-serif` → weight, size, line-height and family. */
function fontShorthand(value: string, m: string): Splice[] {
  const x = m.match(/(?<![\w.-])(\d*\.?\d+)(px|rem|em|%)(\/([\w.%]+))?\s/)
  if (!x || x.index === undefined) return []
  const s: Splice[] = []
  const before = m.slice(0, x.index)
  const w = before.match(/(?<![\w-])(?:([1-9]00)|(bold))(?![\w-])/i)
  if (w && w.index !== undefined) s.push({ start: w.index, end: w.index + w[0].length, kind: 'font-weight', raw: w[0] })
  if (x[2] !== '%') s.push({ start: x.index, end: x.index + x[1]!.length + x[2]!.length, kind: 'font-size', raw: x[1]! + x[2]! })
  if (x[4] && /^\d*\.?\d+(px|rem|em)?$/.test(x[4]) && x[4] !== 'normal') {
    const lhStart = x.index + x[1]!.length + x[2]!.length + 1
    s.push({ start: lhStart, end: lhStart + x[4].length, kind: 'line-height', raw: x[4] })
  }
  // Skip whitespace in the ORIGINAL value — the mask blanks quoted families too.
  let famStart = x.index + x[0].length
  while (famStart < value.length && /\s/.test(value[famStart]!)) famStart++
  const fam = value.slice(famStart)
  if (famStart < value.length && !/var\(/i.test(fam)) s.push({ start: famStart, end: value.length, kind: 'font-family', raw: fam })
  return s
}

/** `url("data:image/svg+xml,…")` with a colour inside — an inline icon drawn in CSS. */
const SVG_URL = /url\((?:"(data:image\/svg\+xml[^"]*)"|'(data:image\/svg\+xml[^']*)'|(data:image\/svg\+xml[^)]*))\)/gi
const SVG_HAS_COLOR = /%23[0-9a-f]{3,8}|#[0-9a-f]{3,8}|(fill|stroke|stop-color)=['"]?(?!none|currentcolor)[a-z]{3,}/i
function findSvgUrls(value: string): Splice[] {
  const s: Splice[] = []
  for (const x of value.matchAll(SVG_URL)) {
    const uri = x[1] ?? x[2] ?? x[3] ?? ''
    if (!SVG_HAS_COLOR.test(uri)) continue
    s.push({ start: x.index, end: x.index + x[0].length, kind: 'svg', raw: x[0] })
  }
  return s
}

/** Which literals in one declaration's value are design values, and of what kind. */
export function splicesFor(prop: string, value: string): Splice[] {
  const m = masked(value)
  const bare = m.trim().toLowerCase()
  const svgs = /data:image\/svg\+xml/i.test(value) ? findSvgUrls(value) : []
  if (KEYWORD_ONLY.test(bare)) return []
  // A CSS-wide keyword INSIDE a value (`font: 600 14px inherit`) makes the
  // whole declaration invalid, and the browser drops it at parse time. With a
  // var() in it the same declaration would parse and only fail at computed-
  // value time — which is `unset`, a different result. Leave it as broken as
  // it was (notes/traps.md #7; measured on a styled-components build).
  if (/(^|[\s,/(])(inherit|initial|unset|revert|revert-layer)(?=$|[\s,/)])/i.test(bare)) return []
  if (bare.startsWith('var(') && !/,/.test(bare)) return [] // already tokenised, nothing literal

  if (prop.startsWith('--')) {
    // A custom property: colours always; lengths only when the name says the role.
    const s = [...svgs, ...(HAS_GRADIENT.test(m) ? findAngles(m) : []), ...findColors(value, m, false)]
    if (s.length) return s
    // Bare channel triplets — Bootstrap `--bs-primary-rgb: 13,110,253`,
    // Tailwind `--color-x: 66 80 175`, shadcn `--primary: 222.2 47.4% 11.2%` —
    // are colours by convention, wrapped at the point of use.
    if (/^\d{1,3}(\s*,\s*|\s+)\d{1,3}(\s*,\s*|\s+)\d{1,3}$/.test(bare)) return [{ start: 0, end: value.length, kind: 'color', raw: value }]
    if (/^-?\d*\.?\d+(deg)?\s+\d*\.?\d+%\s+\d*\.?\d+%$/.test(bare)) return [{ start: 0, end: value.length, kind: 'color', raw: 'hsl:' + value }]
    for (const [rx, kind] of CUSTOM_ROLE) {
      if (!rx.test(prop)) continue
      if (kind === 'font-family') {
        // Must look like a family list, not a size, a weight, a function or a
        // keyword: `-apple-system, …` IS one (a system stack starts with a dash;
        // Mantine's --mantine-font-family was skipped for it), `antialiased`
        // (…-font-smoothing) and `clamp(6px, …)` are not.
        if (/^-?[a-z"'][^;{}()]*$/i.test(value.trim()) && !/var\(/i.test(m) && !/^(normal|bold|\d{3})/.test(bare) && !FONT_KEYWORD.test(bare)) {
          return [{ start: 0, end: value.length, kind: 'font-family', raw: value }]
        }
        return []
      }
      if (kind === 'shadow') {
        if (/\d(px|rem|em)|\b0\b/.test(bare)) return [{ start: 0, end: value.length, kind: 'shadow', raw: value }]
        return []
      }
      if (kind === 'line-height') return findLineHeights(m)
      if (kind === 'font-weight') return findWeights(m)
      if (kind === 'duration') return findDurations(m)
      if (kind === 'letter-spacing') return findLengths(m, 'letter-spacing')
      return findLengths(m, kind, { skipPill: kind === 'radius' })
    }
    return []
  }

  if (prop === 'font') return fontShorthand(value, m)
  if (prop === 'line-height') return findLineHeights(m)
  if (prop === 'letter-spacing' || prop === 'word-spacing') return findLengths(m, 'letter-spacing')
  if (prop === 'font-weight') return findWeights(m)
  if (BORDER_WIDTH_PROP.test(prop)) return findLengths(m, 'border-width')
  if (DURATION_PROP.test(prop)) return findDurations(m)
  if (BORDER_SHORTHAND.test(prop)) {
    // `1px solid #e5e7eb`: the width AND the colour
    const w = findLengths(m, 'border-width').slice(0, 1)
    return [...w, ...findColors(value, m, true)]
  }
  if (prop === 'font-family') return /var\(/i.test(m) ? [] : [{ start: 0, end: value.length, kind: 'font-family', raw: value }]
  if (prop === 'font-size') return findLengths(m, 'font-size')
  if (RADIUS_PROP.test(prop)) return findLengths(m, 'radius', { skipPill: true })
  if (SPACE_PROP.test(prop)) return findLengths(m, 'space')
  if (prop === 'box-shadow') {
    // Inner colours become their own variables; the whole shadow becomes one
    // more, whose value then contains those var() references (legal in a
    // custom property) — so elevation can rescale the geometry while the brand
    // still turns the colour of a focus ring.
    const inner = findColors(value, m, true)
    return [...inner, { start: 0, end: value.length, kind: 'shadow', raw: value }]
  }
  if (COLOR_PROP.test(prop) || /^(mask|mask-image|-webkit-mask|-webkit-mask-image|list-style|list-style-image|content)$/.test(prop)) return [...svgs, ...(HAS_GRADIENT.test(m) ? findAngles(m) : []), ...findColors(value, m, true)]
  return []
}

// ─────────────────────────── the rewrite ───────────────────────────

// Keyframes are IN: var()-valued colours interpolate in every modern engine,
// and a hard-coded pulse or gradient sweep is exactly the kind of thing a
// brand change must not leave behind.
const SKIP_AT = new Set(['font-face', 'property', 'counter-style', 'page', 'import', 'charset', 'namespace'])

/**
 * Rewrite one stylesheet in place. Every literal is registered on `table` (so
 * the same literal across files shares one variable) and replaced by its
 * `var()`; the returned text is otherwise byte-identical to the input.
 */
export interface RewriteOptions {
  /** `vars` (default): literal → `var(--us-vN)`, registering on the table.
   *  `values`: literal → the CURRENT value from `vars` — their file, patched
   *  in place, byte-precise. Nothing is registered; unknown literals stay. */
  mode?: 'vars' | 'values'
  vars?: Record<string, string>
}

export function rewriteCss(css: string, table: SubstitutionTable, file: string, opts: RewriteOptions = {}): string {
  const values = opts.mode === 'values'
  const lookup = (kind: Kind, raw: string): string | null => {
    const e = table.find(kind, raw)
    if (!e) return null
    const cur = opts.vars?.[varName(e.id)]
    if (cur === undefined) return null
    // Same value → leave their bytes exactly as they are.
    return cur === cssValue(e.value) ? null : cur
  }
  const decls = scanDeclarations(css)
  // Splice from the end so earlier offsets stay valid.
  const edits: Array<{ start: number; end: number; text: string }> = []
  for (const d of decls) {
    if (d.atRules.some((a) => SKIP_AT.has(a))) continue
    const value = css.slice(d.valueStart, d.valueEnd)
    const splices = splicesFor(d.prop, value)
    if (!splices.length) continue
    const site: Site = d.selector ? { file, prop: d.prop, selector: d.selector } : { file, prop: d.prop }
    // Outer-first: a box-shadow's whole-value splice must be applied AFTER its
    // inner colours, so the registered shadow value already contains the var()s.
    const inner = splices.filter((s) => !(s.start === 0 && s.end === value.length))
    const outer = splices.filter((s) => s.start === 0 && s.end === value.length)
    if (values) {
      // Patch mode: only inner literals (an outer shadow entry's value is made
      // of the inner ones); the `hsl:` marker never reaches the file.
      const reps = dropOverlaps(inner).map((s) => ({ s, to: lookup(s.kind, s.raw) })).filter((x): x is { s: Splice; to: string } => x.to !== null)
      if (!reps.length && !outer.length) continue
      let text = value
      for (const { s, to } of reps.reverse()) text = text.slice(0, s.start) + to + text.slice(s.end)
      if (!reps.length && outer.length) {
        const to = lookup(outer[0]!.kind, outer[0]!.raw)
        if (to === null) continue
        text = to
      }
      edits.push({ start: d.valueStart, end: d.valueEnd, text })
      continue
    }
    // Register left-to-right so ids follow reading order; splice right-to-left
    // so offsets stay valid.
    const refs = dropOverlaps(inner).map((s) => ({ s, ref: table.add(s.kind, s.raw, site) }))
    let text = value
    for (const { s, ref } of refs.reverse()) {
      text = text.slice(0, s.start) + ref + text.slice(s.end)
    }
    // Only one outer splice is ever produced per declaration — and never when
    // the value still references THEIR variable. Our variables live on :root;
    // a `var(--accD)` inside would be resolved THERE, where `--accD` may not
    // be defined (it was scoped to a theme block), and the whole shadow would
    // compute to invalid → none. Measured on a real build; see verify.ts.
    const foreignVar = /var\(--(?!us-v)/i
    if (outer.length && !foreignVar.test(text)) {
      const o = outer[0]!
      // The outer splice registers the SUBSTITUTED text (a shadow keeps its
      // inner var()s); a notation marker on the raw (`hsl:`) travels with it.
      text = table.add(o.kind, (o.raw.startsWith('hsl:') ? 'hsl:' : '') + text, site)
    }
    edits.push({ start: d.valueStart, end: d.valueEnd, text })
  }
  if (!edits.length) return css
  let out = css
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }
  return out
}

/** A `style="…"` attribute is a declaration list without the braces. */
export function rewriteInlineStyle(style: string, table: SubstitutionTable, file: string, opts: RewriteOptions = {}): string {
  const wrapped = `x{${style}}`
  const out = rewriteCss(wrapped, table, file, opts)
  return out.slice(2, -1)
}

/**
 * Rewrite the `<style>` blocks and `style=""` attributes of an HTML document.
 * Text-level, like the CSS: the markup keeps its bytes.
 */
/**
 * Subresource Integrity on <link>: a rewritten stylesheet no longer matches its
 * hash and the browser drops it without a word (getbootstrap.com's own docs
 * lost bootstrap.min.css that way — measured). The bytes changed on purpose,
 * so the promise the hash made is ours to withdraw. The RAW control drops it
 * too: a hash is a transport guarantee, not a style, and an archive whose CSS
 * drifted from the hash in its HTML (the gh-pages branch did) would otherwise
 * make the control unstyled. Scripts are untouched and keep theirs.
 */
export function stripLinkIntegrity(html: string): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) => (/\bintegrity\s*=/i.test(tag) ? tag.replace(/\s+integrity\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '') : tag))
}

/** `<link rel=stylesheet href="https://cdn…/x.css">` → `/__ext/?u=…`: the worker
 *  fetches it, the host rewrites it like any local sheet (a CDN Bulma is still
 *  their CSS), and the new variables ride along inside the response. */
export function proxyExternalStylesheets(html: string): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag
    return tag.replace(/\shref\s*=\s*(["'])((?:https?:)?\/\/[^"']+)\1/i, (_m, q: string, href: string) => {
      const abs = href.startsWith('//') ? 'https:' + href : href
      return ` href=${q}/__ext/?u=${encodeURIComponent(abs)}${q} data-us-ext=${q}${abs}${q}`
    })
  })
}

export function rewriteHtml(html: string, table: SubstitutionTable, file: string, opts: RewriteOptions = {}): string {
  // In patch mode their HTML keeps its integrity attributes: the CSS on disk
  // will be theirs again, and the hash is theirs to update.
  let out = opts.mode === 'values' ? html : proxyExternalStylesheets(stripLinkIntegrity(html))
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) =>
    open + rewriteCss(css, table, file, opts) + close)
  out = out.replace(/(<[a-zA-Z][^>]*?\sstyle=)("([^"]*)"|'([^']*)')/g, (m, pre: string, _q: string, dq?: string, sq?: string) => {
    const raw = dq ?? sq ?? ''
    if (!raw.trim()) return m
    const quote = dq !== undefined ? '"' : "'"
    const rewritten = rewriteInlineStyle(raw, table, file, opts)
    return pre + quote + rewritten + quote
  })
  return out
}
