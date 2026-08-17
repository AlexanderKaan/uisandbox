import { AUDIT_SCAN_EXT, AUDIT_SKIP_FILE, auditFilePriority } from './engine'

/**
 * Turn a chosen directory into the `{path, content}[]` the engine reads.
 *
 * Everything here happens in the tab. There is no upload, no worker on a server,
 * no request — that is not a nice-to-have, it is invariant 3: the buyer is
 * letting us look at their internal codebase, and one story about uploaded
 * source costs the whole channel. It is also PROVABLE, which a promise is not:
 * open the network tab and watch it stay quiet.
 *
 * `webkitdirectory` is used rather than the File System Access API because it
 * works in every browser, including Safari and Firefox. The nicer API is a
 * Chromium-only upgrade, not the floor.
 */

/** Directories that are never anyone's design decisions. */
export const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|\.next|out|coverage|\.uicockpit|vendor|__snapshots__)(\/|$)/

/** A single file big enough to be generated rather than written. */
const MAX_FILE_BYTES = 512 * 1024
/** A ceiling on the whole read, so a monorepo cannot hang the tab. */
const MAX_TOTAL_BYTES = 40 * 1024 * 1024
const MAX_FILES = 8000

export interface ScanFile { path: string; content: string }
export interface ScanResult {
  files: ScanFile[]
  pkg: unknown | null
  /** What we chose not to read, so the page can say so instead of going quiet. */
  skipped: { tooBig: number; overCap: number }
  rootName: string
}

/** The relative path a picked file reports, minus the chosen folder's own name. */
function relPath(file: File): string {
  const raw = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
  const cut = raw.indexOf('/')
  return cut === -1 ? raw : raw.slice(cut + 1)
}

/** Is this path worth opening at all? */
export const isScannable = (path: string) =>
  !SKIP_DIR.test(path) && AUDIT_SCAN_EXT.test(path) && !AUDIT_SKIP_FILE.test(path)

/**
 * Which files to read, and in which order — the one place the caps live.
 *
 * Both intakes route through this. A folder and a zip of that same folder must
 * produce the same audit, and they will not if each enforces its own ceiling in
 * its own order: the cap decides WHICH half of a monorepo gets described, which
 * makes it a correctness rule rather than a memory setting.
 */
export function selectFiles<T extends { path: string; size: number }>(
  candidates: T[],
): { take: T[]; skipped: { tooBig: number; overCap: number } } {
  const skipped = { tooBig: 0, overCap: 0 }
  /* Ties break on the PATH, never on arrival order.
   *
   * The engine has order-sensitive tiebreaks — a custom property declared in two
   * files resolves last-wins, so whichever file is read second decides. Reading
   * documenso as a folder and as a zip of that same folder therefore returned
   * two different brands from byte-identical inputs, because a directory walk
   * and a zip's central directory enumerate in different orders. Sorting on the
   * path makes the answer a property of the codebase rather than of how it
   * happened to be handed over — across intakes, and across filesystems. */
  const ranked = candidates
    .filter((c) => isScannable(c.path))
    .map((c) => ({ c, rank: auditFilePriority(c.path) }))
    .sort((a, b) => a.rank - b.rank || (a.c.path < b.c.path ? -1 : a.c.path > b.c.path ? 1 : 0))

  const take: T[] = []
  let total = 0
  for (const { c } of ranked) {
    if (c.size > MAX_FILE_BYTES) { skipped.tooBig++; continue }
    if (take.length >= MAX_FILES || total + c.size > MAX_TOTAL_BYTES) { skipped.overCap++; continue }
    total += c.size
    take.push(c)
  }
  return { take, skipped }
}

export async function readPickedFiles(list: FileList | File[]): Promise<ScanResult> {
  const all = Array.from(list)
  const rootName =
    (all[0] as (File & { webkitRelativePath?: string }) | undefined)?.webkitRelativePath?.split('/')[0] ||
    'your project'

  const files: ScanFile[] = []
  let pkg: unknown | null = null

  // package.json is read even though it is not a scannable file: it is what
  // tells the report which framework and styling libraries are installed.
  const pkgFile = all.find((f) => relPath(f) === 'package.json')
  if (pkgFile) {
    try { pkg = JSON.parse(await pkgFile.text()) } catch { /* malformed → skip */ }
  }

  /* Read the design system BEFORE the cap can bite. In walk order, n8n's 8,000
   * files ran out inside their backend package and never reached the frontend
   * at all — a cap spent on files that carry no styling is a cap that answers
   * about the wrong half of a monorepo. */
  const { take, skipped } = selectFiles(all.map((file) => ({ file, path: relPath(file), size: file.size })))

  for (const { file, path } of take) {
    try {
      files.push({ path, content: await file.text() })
    } catch { /* unreadable → it carries no style either */ }
  }

  return { files, pkg, skipped, rootName }
}

/** The kit vocabulary that powers `expressible`, fetched from our own origin.
 *  Absent → the audit still runs, it just cannot say "this maps to a recipe". */
export async function loadVocabulary(): Promise<unknown | null> {
  try {
    const res = await fetch('/uicockpit.vocabulary.json')
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

/* ── dropping a folder ──────────────────────────────────────────────────────
 * Dragging a directory onto the page is the intake people reach for first, and
 * until now the only way in was a file dialog. `webkitGetAsEntry` is the one API
 * that reads a dropped DIRECTORY, and it is supported everywhere that matters —
 * the same reasoning as choosing `webkitdirectory` over the File System Access
 * API: the floor beats the frill.
 *
 * The walk is breadth-first with the same skip list as the picker, so a dropped
 * node_modules costs nothing. Paths are rebuilt as we descend and stamped onto
 * each File as `webkitRelativePath`, which is exactly what the picker produces —
 * so everything downstream stays one code path. */

interface FsEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
  file(cb: (f: File) => void, err?: (e: unknown) => void): void
  createReader(): { readEntries(cb: (e: FsEntry[]) => void, err?: (e: unknown) => void): void }
}

const fileOf = (entry: FsEntry) =>
  new Promise<File | null>((resolve) => entry.file((f) => resolve(f), () => resolve(null)))

/** One readEntries call returns at most ~100 entries, so it must be drained. */
async function readAll(dir: FsEntry): Promise<FsEntry[]> {
  const reader = dir.createReader()
  const out: FsEntry[] = []
  for (;;) {
    const batch = await new Promise<FsEntry[]>((resolve) =>
      reader.readEntries((e) => resolve(e), () => resolve([])),
    )
    if (!batch.length) return out
    out.push(...batch)
  }
}

/** Turn a drop into the same File[] the folder picker would have produced. */
export async function filesFromDrop(items: DataTransferItemList): Promise<File[]> {
  const roots: FsEntry[] = []
  for (const item of Array.from(items)) {
    // The DOM lib types this as FileSystemEntry, which omits the file()/
    // createReader() halves we actually need — the narrower FsEntry above is
    // what the API really hands back.
    const entry = item.webkitGetAsEntry?.() as unknown as FsEntry | null
    if (entry) roots.push(entry)
  }
  if (!roots.length) return []

  const out: File[] = []
  const queue: Array<{ entry: FsEntry; path: string }> = roots.map((entry) => ({ entry, path: entry.name }))
  // A hard ceiling on the WALK, separate from the read caps downstream: a
  // dropped home directory should stop early rather than pin the tab.
  let seen = 0
  while (queue.length && seen < 60000) {
    const { entry, path } = queue.shift()!
    seen++
    if (SKIP_DIR.test(path)) continue
    if (entry.isDirectory) {
      for (const child of await readAll(entry)) queue.push({ entry: child, path: `${path}/${child.name}` })
      continue
    }
    if (!entry.isFile) continue
    const f = await fileOf(entry)
    if (!f) continue
    // `webkitRelativePath` is read-only on File, so define it — downstream code
    // then cannot tell a dropped folder from a picked one.
    Object.defineProperty(f, 'webkitRelativePath', { value: path, configurable: true })
    out.push(f)
  }
  return out
}
