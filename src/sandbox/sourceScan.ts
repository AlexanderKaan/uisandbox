/**
 * Tokenise the literals a NON-web codebase carries — Swift, Kotlin, Android
 * XML, Dart, QML, Kivy kv, xcassets JSON, WordPress theme.json — into the same
 * substitution sheet the CSS rewriter fills, and patch them back in place.
 *
 * There is no render for these (no browser draws SwiftUI or QML); what the
 * sandbox CAN promise is: every colour/font/radius/size literal found, the
 * knobs on their stand, and the values written back into their files in the
 * notation each file uses (`0xFF6650A4` stays ARGB, `#6650a4` stays hex, an
 * xcassets component stays `0x66` or `0.400`).
 *
 * Same table, same mapping, same export path — one engine, one more reader.
 */
import { SubstitutionTable, type Kind } from './table'
import { formatCssColor, parseCssColor } from './cssColor'

export const SOURCE_EXT = /\.(swift|kt|kts|java|xml|dart|qml|kv|py|json|m|mm|cs|vue|jsx|tsx|js|ts|mjs)$/i
const SKIP = /(^|\/)(node_modules|\.git|build|\.build|DerivedData|Pods|\.gradle|dist|out|__pycache__|test|tests|__tests__|spec|androidTest|Preview Content|mocks?|fixtures?)(\/|$)/i
/** Art, not palette: vector drawables, launcher icons, illustrations. Their
 *  hexes are the picture, and a picture has no brand knob. */
const ART = /(^|\/)(drawable[^/]*|mipmap[^/]*|Assets\.xcassets\/[^/]*\.(imageset|appiconset|symbolset))\/|(^|\/)ic_[\w-]*\.xml$|\.(svg|imageset)$/i

interface Span { start: number; end: number; kind: Kind; value: string; prop: string; print: (v: string) => string }

const hex6 = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** Find every design literal in one source file, with a printer for its notation. */
export function findSourceSpans(path: string, text: string): Span[] {
  const spans: Span[] = []
  const ext = (path.split('.').pop() ?? '').toLowerCase()
  const push = (s: Span) => { if (!spans.some((o) => s.start < o.end && o.start < s.end)) spans.push(s) }

  // xcassets colour set: components as "0xNN" or "0.400" — keep each channel's notation
  if (ext === 'json' && /\.colorset\/Contents\.json$/.test(path)) {
    for (const m of text.matchAll(/"components"\s*:\s*\{([^}]*)\}/g)) {
      const body = m[1]!, at = m.index + m[0].indexOf(body)
      const ch = (name: string) => { const x = body.match(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`)); return x ? { v: x[1]!, at: at + (x.index ?? 0) + x[0].indexOf(x[1]!) } : null }
      const r = ch('red'), g = ch('green'), b = ch('blue')
      if (!r || !g || !b) continue
      const num = (s: string) => (/^0x/i.test(s) ? parseInt(s, 16) : Math.round(parseFloat(s) * 255))
      const value = hex6(num(r.v), num(g.v), num(b.v))
      // One span covering red..blue; the printer rewrites the three channels.
      const start = Math.min(r.at, g.at, b.at), endCh = [r, g, b].sort((a, c) => c.at - a.at)[0]!
      const end = endCh.at + endCh.v.length
      const slice = text.slice(start, end)
      push({ start, end, kind: 'color', value, prop: 'xcassets', print: (v) => {
        const c = parseCssColor(v); if (!c) return slice
        const [rr, gg, bb] = formatCssColor({ ...c, a: 1 }).slice(1).match(/../g)!.map((h) => parseInt(h, 16))
        const fmt = (orig: string, n: number) => (/^0x/i.test(orig) ? '0x' + n.toString(16).toUpperCase().padStart(2, '0') : (n / 255).toFixed(3))
        return slice.replace(r.v, fmt(r.v, rr!)).replace(g.v, fmt(g.v, gg!)).replace(b.v, fmt(b.v, bb!))
      } })
    }
    return spans
  }

  // The identifier a colour is bound to (`val md_theme_light_primary = Color(0xFF…)`,
  // `static let brand = Color(…)`, `<color name="colorPrimary">`) — the reader's
  // only way to hear "this one is the brand" in a language without --custom-props.
  const nameBefore = (at: number): string => {
    const line = text.slice(text.lastIndexOf('\n', at) + 1, at)
    const xml = line.match(/name="([\w.]+)"[^"]*$/)
    if (xml) return xml[1]!
    // WordPress theme.json palette entries: { "color": "#…", "name": "Base", "slug": "base" }
    const around = text.slice(Math.max(0, at - 160), at + 160)
    const slug = around.match(/"slug"\s*:\s*"([\w-]+)"/)
    if (slug && /"color"\s*:/.test(around)) return slug[1]!
    const m = line.match(/(?:val|let|var|const|static\s+let|final)?\s*([A-Za-z_][\w.]*)\s*[:=]\s*[^=]*$/)
    return m ? m[1]! : ''
  }
  // Colours: #rrggbb / #rrggbbaa / #aarrggbb (Android XML uses ARGB!) in strings; 0xFFRRGGBB in Kotlin/Dart/Swift
  // …in strings, or between tags (`<color name="x">#FF3F51B5</color>`), or as a bare kv/qml value
  for (const m of text.matchAll(/(["'>:=,(\s])#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?=["'<\s;,)]|$)/gm)) {
    const h = m[2]!, at = m.index + 1 + m[1]!.length
    const androidArgb = ext === 'xml' && h.length === 8
    const rgb = androidArgb ? h.slice(2) : h.slice(0, 6)
    const alpha = androidArgb ? h.slice(0, 2) : h.length === 8 ? h.slice(6) : ''
    push({ start: at, end: at + h.length, kind: 'color', value: '#' + rgb.toLowerCase(), prop: nameBefore(m.index) || 'hex', print: (v) => {
      const c = parseCssColor(v); const out = c ? formatCssColor({ ...c, a: 1 }).slice(1) : rgb
      const cased = /[A-F]/.test(h) ? out.toUpperCase() : out
      return androidArgb ? alpha + cased : cased + alpha
    } })
  }
  for (const m of text.matchAll(/\b0x([0-9a-fA-F]{8})\b/g)) {
    const h = m[1]!, at = m.index + 2
    // ARGB: Color(0xFF6650a4) — keep the alpha byte
    push({ start: at, end: at + 8, kind: 'color', value: '#' + h.slice(2).toLowerCase(), prop: nameBefore(m.index) || '0xAARRGGBB', print: (v) => {
      const c = parseCssColor(v); const out = c ? formatCssColor({ ...c, a: 1 }).slice(1) : h.slice(2)
      return h.slice(0, 2) + (/[A-F]/.test(h) ? out.toUpperCase() : out)
    } })
  }
  // CSS colour functions inside source. Chart.js and friends write the brand as
  // `rgba(78, 115, 223, 1)` where the stylesheet wrote `#4e73df`: the same
  // colour in another notation, so the sheet never matched it and the chart
  // stayed behind. Measured on SB Admin 2, whose bar and pie demos use hex and
  // followed the brand while its area demo, in rgba, did not.
  //
  // Matched by the COLOUR, printed back in the file's own notation, with the
  // span's OWN alpha kept: `rgba(78, 115, 223, .05)` is the chart's fill tint
  // and must stay a tint of whatever the brand becomes.
  for (const m of text.matchAll(/\brgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)/g)) {
    const r = Number(m[1]), g = Number(m[2]), b = Number(m[3])
    if (r > 255 || g > 255 || b > 255) continue
    const alpha = m[4], whole = m[0], sep = /,\s/.test(whole) ? ', ' : ','
    push({ start: m.index, end: m.index + whole.length, kind: 'color', value: hex6(r, g, b), prop: nameBefore(m.index) || 'rgb()', print: (v) => {
      const c = parseCssColor(v)
      if (!c) return whole
      const h = formatCssColor({ ...c, a: 1 })
      const ch = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
      return alpha === undefined ? `rgb(${ch.join(sep)})` : `rgba(${[...ch, alpha].join(sep)})`
    } })
  }
  // Swift `Color(red: 0.4, green: 0.2, blue: 0.9)` / UIColor(red:…) with 0–1 floats
  for (const m of text.matchAll(/(?:UI|NS)?Color\(\s*red:\s*([\d.]+)\s*,\s*green:\s*([\d.]+)\s*,\s*blue:\s*([\d.]+)/g)) {
    const [r, g, b] = [m[1]!, m[2]!, m[3]!]
    if ([r, g, b].some((x) => parseFloat(x) > 1)) continue
    const at = m.index + m[0].indexOf(r), end = m.index + m[0].length
    const slice = text.slice(at, end)
    push({ start: at, end, kind: 'color', value: hex6(+r * 255, +g * 255, +b * 255), prop: 'Color(red:green:blue:)', print: (v) => {
      const c = parseCssColor(v); if (!c) return slice
      const [rr, gg, bb] = formatCssColor({ ...c, a: 1 }).slice(1).match(/../g)!.map((x) => parseInt(x, 16) / 255)
      return slice.replace(r, rr!.toFixed(3)).replace(g, gg!.toFixed(3)).replace(b, bb!.toFixed(3))
    } })
  }
  // Kivy kv / Python: `color: .2, .3, .4, 1` · `rgba: (0.2, 0.3, 0.4, 1)` · `background_color: 1, 0, 0, 1` — 0–1 floats
  if (ext === 'kv' || ext === 'py') {
    for (const m of text.matchAll(/\b(?:color|rgba|background_color|foreground_color|canvas_color|bar_color|text_color|line_color)\s*[:=]\s*\(?\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/g)) {
      const [r, g, b] = [m[1]!, m[2]!, m[3]!]
      if ([r, g, b].some((x) => parseFloat(x) > 1 || !Number.isFinite(parseFloat(x)))) continue
      const at = m.index + m[0].indexOf(r), end = m.index + m[0].length
      const slice = text.slice(at, end)
      push({ start: at, end, kind: 'color', value: hex6(+r * 255, +g * 255, +b * 255), prop: 'kivy rgba', print: (v) => {
        const c = parseCssColor(v); if (!c) return slice
        const [rr, gg, bb] = formatCssColor({ ...c, a: 1 }).slice(1).match(/../g)!.map((x) => parseInt(x, 16) / 255)
        const f = (n: number, orig: string) => (orig.includes('.') || n < 1 ? String(Math.round(n * 1000) / 1000).replace(/^0(?=\.)/, orig.startsWith('.') ? '' : '0') : String(n))
        return slice.replace(r, f(rr!, r)).replace(g, f(gg!, g)).replace(b, f(bb!, b))
      } })
    }
  }
  // W3C design tokens / Style Dictionary JSON: "radius": { "md": { "$value": "8px" } } —
  // the KEY names the role, the value carries the literal (a Figma/Tokens Studio export)
  if (ext === 'json' && /"\$?value"\s*:/.test(text)) {
    for (const m of text.matchAll(/"([\w.-]+)"\s*:\s*\{[^{}]*?"\$?value"\s*:\s*"([^"]+)"/g)) {
      const key = m[1]!, val = m[2]!, at = m.index + m[0].lastIndexOf(val)
      const ctx = text.slice(Math.max(0, m.index - 400), m.index).match(/"([\w.-]+)"\s*:\s*\{\s*$/m)?.[1] ?? ''
      const name = `${ctx}.${key}`
      if (/^#[0-9a-f]{3,8}$/i.test(val) || /^(rgb|hsl)a?\(/.test(val)) continue // colours: the hex reader has them, with the key as name
      const len = val.match(/^(\d*\.?\d+)(px|rem|dp|pt|sp)?$/)
      if (len && /radius|rounded|corner/i.test(name)) push({ start: at, end: at + val.length, kind: 'radius', value: `${len[1]}px`, prop: name, print: (v) => String(parseFloat(v)) + (len[2] ?? '') })
      else if (len && /size|type|font/i.test(name) && !/line|weight|letter/i.test(name)) push({ start: at, end: at + val.length, kind: 'font-size', value: `${len[1]}px`, prop: name, print: (v) => String(Math.round(parseFloat(v) * 10) / 10) + (len[2] ?? '') })
      else if (len && /spac|gap|pad|margin|inset/i.test(name)) push({ start: at, end: at + val.length, kind: 'space', value: `${len[1]}px`, prop: name, print: (v) => String(Math.round(parseFloat(v) * 10) / 10) + (len[2] ?? '') })
      else if (!len && /font|family|typeface/i.test(name) && /^[A-Za-z][\w ]{1,40}(,.*)?$/.test(val)) push({ start: at, end: at + val.length, kind: 'font-family', value: `"${val.split(',')[0]!.trim()}"`, prop: name, print: (v) => v.split(',')[0]!.trim().replace(/^["']|["']$/g, '') })
    }
  }
  // WordPress theme.json: "fontFamily": "\"Cardo\", serif" (escaped quotes inside JSON)
  if (ext === 'json') {
    for (const m of text.matchAll(/"fontFamily"\s*:\s*"((?:\\.|[^"\\])+)"/g)) {
      const raw = m[1]!, at = m.index + m[0].indexOf(raw)
      const first = raw.replace(/\\"/g, '').split(',')[0]!.trim()
      if (!first || /^(var\(|--|system-ui|sans-serif|serif|monospace)/i.test(first)) continue
      push({ start: at, end: at + raw.length, kind: 'font-family', value: `"${first}"`, prop: 'theme.json', print: (v) => {
        const fam = v.split(',')[0]!.trim().replace(/^["']|["']$/g, '')
        return raw.replace(first, fam)
      } })
    }
  }
  // Fonts (resource references name a family too: R.font.karla_regular, @font/karla)
  for (const m of text.matchAll(/\bR\.font\.([a-z][\w]*)|@font\/([a-z][\w]*)/g)) {
    const raw = m[1] ?? m[2]!, at = m.index + m[0].length - raw.length
    const family = raw.replace(/_(regular|medium|semibold|bold|light|italic|black|thin|variable|wght)+$/i, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    push({ start: at, end: at + raw.length, kind: 'font-family', value: `"${family}"`, prop: 'font-resource', print: () => raw })
  }
  for (const m of text.matchAll(/(?:Font\.custom|\.custom|fontFamily\s*[:=]|font-family\s*[:=]|FontFamily\.Custom|font_name\s*[:=]|"font"\s*:)\s*\(?\s*["']([^"']{2,60})["']/g)) {
    const name = m[1]!, at = m.index + m[0].lastIndexOf(name)
    if (/[\\*+?|{}\[\]$^]/.test(name) || /^\./.test(name)) continue // a regex or a private descriptor, not a family
    push({ start: at, end: at + name.length, kind: 'font-family', value: `"${name}"`, prop: 'font', print: (v) => v.split(',')[0]!.trim().replace(/^["']|["']$/g, '') })
  }
  // Radii: cornerRadius(12) · RoundedCornerShape(12.dp) · BorderRadius.circular(12) · radius: 12 (QML) · android:radius="12dp"
  for (const m of text.matchAll(/(?:cornerRadius\(|RoundedCornerShape\(|BorderRadius\.circular\(|\bradius\s*:\s*|android:radius="|corner_radius\s*[:=]\s*|borderRadius\s*[:=]\s*)(\d+(?:\.\d+)?)/g)) {
    const n = m[1]!, at = m.index + m[0].length - n.length
    if (parseFloat(n) === 0 || parseFloat(n) >= 100) continue
    push({ start: at, end: at + n.length, kind: 'radius', value: `${n}px`, prop: 'radius', print: (v) => String(parseFloat(v)) })
  }
  // Type sizes: .font(.system(size: 14 · fontSize = 14.sp · fontSize: 14 · font.pixelSize: 14 · android:textSize="14sp"
  for (const m of text.matchAll(/(?:size:\s*|fontSize\s*[:=]\s*|font\.pixelSize\s*:\s*|font\.pointSize\s*:\s*|android:textSize="|font_size\s*[:=]\s*)(\d+(?:\.\d+)?)/g)) {
    const n = m[1]!, at = m.index + m[0].length - n.length
    if (parseFloat(n) < 6 || parseFloat(n) > 120) continue
    push({ start: at, end: at + n.length, kind: 'font-size', value: `${n}px`, prop: 'size', print: (v) => String(Math.round(parseFloat(v) * 10) / 10) })
  }
  return spans.sort((a, b) => a.start - b.start)
}

/** Register a source file's literals on the sheet. Returns how many. */
export function scanSourceFile(path: string, text: string, table: SubstitutionTable, platform: string): number {
  if (SKIP.test(path) || ART.test(path)) return 0
  const spans = findSourceSpans(path, text)
  for (const s of spans) table.add(s.kind, s.value, { file: path, prop: s.prop, selector: platform })
  return spans.length
}

/** The file with the CURRENT values written at the exact spans, in its own notation. */
export function patchSourceFile(path: string, text: string, table: SubstitutionTable, vars: Record<string, string>): string {
  const spans = findSourceSpans(path, text)
  let out = text
  for (const s of [...spans].reverse()) {
    const e = table.find(s.kind, s.value)
    if (!e) continue
    const cur = vars[`--us-v${e.id}`]
    if (cur === undefined || cur === e.value) continue
    out = out.slice(0, s.start) + s.print(cur) + out.slice(s.end)
  }
  return out
}
