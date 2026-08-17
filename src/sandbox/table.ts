/**
 * The substitution sheet — the one structure the whole sandbox turns on.
 *
 * Every literal design value found in THEIR stylesheets becomes one entry here
 * and, in the served CSS, one `var(--us-vN)`. The root block that defines those
 * variables starts as the IDENTITY (`--us-v7: #4f39f6`) — which is how "1:1" is
 * a property of the construction rather than a feeling: with no knob turned,
 * every declaration computes to exactly the literal it replaced, and a DOM diff
 * against the untouched original must come back empty. Only when a knob moves
 * does `mapping.ts` write something else into a variable.
 *
 * Entries are deduplicated by (kind, normalised value): `#4f39f6` used forty
 * times is ONE variable, so the sheet is also the census the audit produced,
 * now on the built CSS the browser actually paints.
 */

export type Kind =
  | 'color' | 'radius' | 'font-size' | 'font-family' | 'space' | 'shadow'
  | 'line-height' | 'letter-spacing' | 'font-weight' | 'border-width' | 'duration'
  /** A `url("data:image/svg+xml,…")` whose SVG carries colours (Bootstrap's chevrons, checks, close buttons). */
  | 'svg'

export interface Site {
  file: string
  prop: string
  /** The enclosing rule's selector (innermost), when there is one. */
  selector?: string
}

export interface Entry {
  id: number
  kind: Kind
  /** Normalised literal — what the variable holds when nothing has been turned. */
  value: string
  count: number
  /** Capped — a sheet needs addresses, not every one of 4000. */
  sites: Site[]
}

export const SITE_CAP = 25

export const varName = (id: number): string => `--us-v${id}`

export class SubstitutionTable {
  private byKey = new Map<string, Entry>()
  readonly entries: Entry[] = []

  /** Register one occurrence; returns the variable reference to write in its place. */
  add(kind: Kind, value: string, site: Site): string {
    const norm = normalise(kind, value)
    const key = `${kind} ${norm}`
    let e = this.byKey.get(key)
    if (!e) {
      e = { id: this.entries.length + 1, kind, value: norm, count: 0, sites: [] }
      this.byKey.set(key, e)
      this.entries.push(e)
    }
    e.count++
    if (e.sites.length < SITE_CAP) e.sites.push(site)
    return `var(${varName(e.id)})`
  }

  /** The entry a literal WOULD map to, without registering it. */
  find(kind: Kind, value: string): Entry | undefined {
    return this.byKey.get(`${kind} ${normalise(kind, value)}`)
  }

  get(id: number): Entry | undefined {
    return this.entries[id - 1]
  }

  ofKind(kind: Kind): Entry[] {
    return this.entries.filter((e) => e.kind === kind)
  }

  /** The identity root block: every variable holds the literal it replaced. */
  identityVars(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const e of this.entries) out[varName(e.id)] = cssValue(e.value)
    return out
  }

  toJSON(): { entries: Entry[] } {
    return { entries: this.entries }
  }

  static fromJSON(json: { entries: Entry[] }): SubstitutionTable {
    const t = new SubstitutionTable()
    for (const e of json.entries) {
      const copy = { ...e, sites: [...e.sites] }
      t.entries.push(copy)
      t.byKey.set(`${e.kind} ${e.value}`, copy)
    }
    return t
  }
}

/** Case and whitespace never change a value's meaning; a sheet with `#FFF` and
 *  `#fff` as two entries would move them separately, which is nonsense. */
export function normalise(kind: Kind, value: string): string {
  let v = value.trim().replace(/\s+/g, ' ')
  if (kind === 'font-family') {
    // Whitespace only. The author's QUOTES stay: `"Font Awesome 5 Free"`
    // unquoted is invalid CSS (a bare `5`), and the browser then drops the
    // whole declaration — measured on a real build (SB Admin 2's icons fell
    // back to Nunito).
    v = v.split(',').map((f) => f.trim()).filter(Boolean).join(', ')
    return v
  }
  v = v.toLowerCase().replace(/\s*,\s*/g, ', ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
  if (kind === 'color') {
    // Bare channels keep their notation marker; the marker never reaches CSS
    // (identityVars strips it) — it tells the mapper how to print the result.
    if (v.startsWith('hsl:')) return 'hsl:' + v.slice(4).trim()
    // Expand #rgb / #rgba so the two spellings of one colour share an entry.
    const short = v.match(/^#([0-9a-f]{3,4})$/)
    if (short) v = '#' + short[1]!.split('').map((c) => c + c).join('')
  }
  return v
}

/** What a sheet value looks like IN CSS: the bare-hsl marker is ours, not CSS. */
export const cssValue = (v: string): string => (v.startsWith('hsl:') ? v.slice(4) : v)

/**
 * Define the entries added since `before` in a frame's `<style id="us-vars">`
 * at once, at identity — a rule that references a variable nobody has defined
 * yet is invalid, and for one render everything it styles falls back to UA
 * defaults (measured: a Tailwind CDN page read as "Times"). The mapped values
 * follow on the next render.
 */
export function defineNewVars(doc: Document, table: SubstitutionTable, before: number): void {
  if (table.entries.length <= before) return
  let el = doc.getElementById('us-vars')
  if (!el) { el = doc.createElement('style'); el.id = 'us-vars'; (doc.head ?? doc.documentElement).prepend(el) }
  const add = table.entries.slice(before).map((e) => `${varName(e.id)}:${cssValue(e.value)}`).join(';')
  const inner = (el.textContent ?? '').replace(/^\s*:root\s*\{/, '').replace(/\}\s*$/, '')
  el.textContent = `:root{${inner}${inner ? ';' : ''}${add}}`
}
