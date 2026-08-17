/**
 * What did they drop? Not every archive is a web build, and "No index.html"
 * is a wall, not an answer. This names the platform from the files present so
 * the intake can say what it can and cannot do:
 *
 *   web-build     an index.html with its assets → render 1:1 (the main path)
 *   web-source    stylesheets/templates without a built page (a WordPress
 *                 theme, a Sass source tree) → tokenise + patched export, no render
 *   ios / android / flutter / qt / kivy / python-gui / electron / unknown
 *                 → tokenise the literals the SOURCE carries (sourceScan.ts),
 *                 knobs on their stand, export in the platform's own shape;
 *                 the render is a values board, honestly labelled — no browser
 *                 draws a SwiftUI view or a QML scene.
 */
export type PlatformKind =
  | 'web-build' | 'web-source' | 'ios' | 'android' | 'flutter' | 'qt' | 'kivy' | 'python-gui' | 'electron' | 'unknown'

export interface Platform {
  kind: PlatformKind
  label: string
  evidence: string[]
  /** Can the sandbox render it 1:1 in a frame? */
  renders: boolean
}

const has = (paths: string[], rx: RegExp) => paths.some((p) => rx.test(p))
const count = (paths: string[], rx: RegExp) => paths.filter((p) => rx.test(p)).length

export function detectPlatform(paths: string[], hasIndexHtml: boolean, texts: { path: string; head: string }[] = []): Platform {
  const ev: string[] = []
  const pkg = texts.find((t) => /(^|\/)package\.json$/.test(t.path))?.head ?? ''
  const wpTheme = texts.some((t) => /(^|\/)style\.css$/.test(t.path) && /Theme Name:/i.test(t.head)) || has(paths, /(^|\/)(functions\.php|theme\.json)$/) && has(paths, /\.php$/)
  const electron = /"electron"/.test(pkg)

  if (has(paths, /\.xcodeproj\/|(^|\/)Package\.swift$|\.xcassets\//) || count(paths, /\.swift$/) > 3) {
    ev.push(`${count(paths, /\.swift$/)} Swift files`, `${count(paths, /\.colorset\/Contents\.json$/)} colour sets`)
    if (!has(paths, /pubspec\.yaml$/)) return { kind: 'ios', label: 'iOS / macOS (Swift)', evidence: ev, renders: false }
  }
  if (has(paths, /pubspec\.yaml$/) || count(paths, /\.dart$/) > 3) {
    return { kind: 'flutter', label: 'Flutter (Dart)', evidence: [`${count(paths, /\.dart$/)} Dart files`], renders: false }
  }
  if (has(paths, /AndroidManifest\.xml$|build\.gradle(\.kts)?$/) || count(paths, /\.kt$/) > 3) {
    return { kind: 'android', label: 'Android (Kotlin / XML)', evidence: [`${count(paths, /\.kt$/)} Kotlin files`, `${count(paths, /res\/values\/.*\.xml$/)} resource files`], renders: false }
  }
  if (count(paths, /\.qml$/) > 0 || has(paths, /\.pro$|CMakeLists\.txt$/) && count(paths, /\.(cpp|h)$/) > 3) {
    return { kind: 'qt', label: 'Qt / QML', evidence: [`${count(paths, /\.qml$/)} QML files`], renders: false }
  }
  if (count(paths, /\.kv$/) > 0) {
    return { kind: 'kivy', label: 'Kivy (Python)', evidence: [`${count(paths, /\.kv$/)} kv files`], renders: false }
  }
  if (wpTheme) {
    return { kind: 'web-source', label: 'WordPress theme', evidence: ['style.css with a Theme Name header', `${count(paths, /\.php$/)} PHP templates`], renders: false }
  }
  if (hasIndexHtml) {
    if (electron) return { kind: 'electron', label: 'Electron (web renderer)', evidence: ['electron in package.json'], renders: true }
    return { kind: 'web-build', label: 'Web', evidence: [], renders: true }
  }
  if (count(paths, /\.(css|scss|less)$/) > 0) {
    return { kind: 'web-source', label: 'Web source (no built page)', evidence: [`${count(paths, /\.(css|scss|less)$/)} stylesheets, no index.html`], renders: false }
  }
  if (count(paths, /\.py$/) > 3) {
    return { kind: 'python-gui', label: 'Python', evidence: [`${count(paths, /\.py$/)} Python files`], renders: false }
  }
  return { kind: 'unknown', label: 'Unknown', evidence: [], renders: false }
}

/**
 * The door only opens for what the sandbox can show 1:1. Everything else gets
 * one honest sentence: what we recognised, why it cannot be rendered here, and
 * what WOULD work. Reading a Swift file's colours onto a swatch board is not
 * "tinkering with your own app", and half a promise is worse than none.
 */
export function refusalFor(p: Platform, detail: { files: number }): string {
  const tail = ' Drop a BUILT web app instead — its dist/, build/ or out/ folder with an index.html — and it renders exactly as deployed.'
  switch (p.kind) {
    case 'ios': return `This is an iOS/macOS project (${p.evidence.join(', ')}). No browser can render SwiftUI or UIKit, so the sandbox cannot show it 1:1 — and it will not show you a look-alike.` + tail
    case 'android': return `This is an Android project (${p.evidence.join(', ')}). Compose and XML layouts have no browser render, so the sandbox cannot show it 1:1.` + tail
    case 'flutter': return `This is a Flutter project. A Flutter WEB build (\`flutter build web\` → build/web/) renders here; the Dart source alone cannot.`
    case 'qt': return `This is a Qt/QML project. There is no browser render for QML, so the sandbox cannot show it 1:1.` + tail
    case 'kivy': return `This is a Kivy (Python) project. There is no browser render for kv layouts, so the sandbox cannot show it 1:1.` + tail
    case 'python-gui': return `This looks like a Python project without a web build. The sandbox renders web builds only.` + tail
    case 'web-source': return `This is web SOURCE without a built page (${p.evidence.join(', ')}). Build it first — \`npm run build\`, or for a WordPress theme a static export of the site — then drop the output folder.`
    case 'unknown': return `No index.html and nothing the sandbox can render was found in these ${detail.files} files.` + tail
    default: return 'This archive has no page the sandbox can open.' + tail
  }
}
