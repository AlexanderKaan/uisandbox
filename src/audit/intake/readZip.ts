import { selectFiles, type ScanResult, type ScanFile } from './readFiles'

/**
 * A .zip as an intake, read entirely in the tab.
 *
 * This exists because the folder picker is a DESKTOP affordance. `webkitdirectory`
 * does nothing on iOS and nothing on Android Chrome, and there is no feature test
 * that tells you so — the property is present and settable on every browser that
 * ignores it. A phone visitor was therefore handed a button that opens a picker
 * with no way to choose a directory, which reads as a broken product rather than
 * an unsupported one. A zip is the one shape a phone can hand us: iOS Files and
 * Android's picker both offer it, and on desktop it is what GitHub's own
 * "Download ZIP" produces.
 *
 * No dependency. `DecompressionStream('deflate-raw')` has been in every engine
 * since Safari 16.4, and pulling in a zip library for one format we can read in
 * 150 lines would put someone else's code in the path of a promise we make about
 * the visitor's source never leaving the machine.
 *
 * The central directory is parsed FIRST and nothing is inflated until the cap has
 * chosen. A repo zip is mostly files we would throw away; inflating 40,000 of
 * them to discard 32,000 is how a tab dies on a monorepo.
 */

const EOCD = 0x06054b50
const EOCD64 = 0x06064b50
const EOCD64_LOCATOR = 0x07064b50
const CENTRAL = 0x02014b50

export interface ZipEntry {
  path: string
  size: number
  compSize: number
  method: number
  offset: number
}

const u16 = (v: DataView, o: number) => v.getUint16(o, true)
const u32 = (v: DataView, o: number) => v.getUint32(o, true)
/** ZIP64 sizes are 64-bit. Number is exact to 2^53, far past any source file. */
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true))

const slice = async (file: Blob, start: number, end: number) =>
  new DataView(await file.slice(start, end).arrayBuffer())

/** Locate the end-of-central-directory record by scanning backwards. */
async function findEocd(file: Blob) {
  // The record is 22 bytes plus a comment of at most 65,535.
  const tailLen = Math.min(file.size, 22 + 0xffff)
  const tail = await slice(file, file.size - tailLen, file.size)
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) !== EOCD) continue
    const base = file.size - tailLen + i
    let entries = u16(tail, i + 10)
    let cdSize = u32(tail, i + 12)
    let cdOffset = u32(tail, i + 16)

    /* A zip with more than 65,535 entries — which a monorepo reaches — records
     * the real counts in a ZIP64 record and leaves 0xFFFF here as a marker.
     * Trusting the marker would silently read a fraction of a large repo, and
     * a confident answer about a fraction is the failure mode this whole sprint
     * is about. */
    if (entries === 0xffff || cdOffset === 0xffffffff) {
      const locAt = base - 20
      if (locAt >= 0) {
        const loc = await slice(file, locAt, locAt + 20)
        if (u32(loc, 0) === EOCD64_LOCATOR) {
          const z64At = u64(loc, 8)
          const z64 = await slice(file, z64At, z64At + 56)
          if (u32(z64, 0) === EOCD64) {
            entries = u64(z64, 32)
            cdSize = u64(z64, 40)
            cdOffset = u64(z64, 48)
          }
        }
      }
    }
    return { entries, cdSize, cdOffset }
  }
  return null
}

/** Every entry the archive declares, without inflating any of them. */
async function readCentralDirectory(file: Blob): Promise<ZipEntry[] | null> {
  const eocd = await findEocd(file)
  if (!eocd || !eocd.cdSize) return null
  const cd = await slice(file, eocd.cdOffset, eocd.cdOffset + eocd.cdSize)
  const names = new TextDecoder()
  const out: ZipEntry[] = []

  let p = 0
  while (p + 46 <= cd.byteLength && u32(cd, p) === CENTRAL) {
    const method = u16(cd, p + 10)
    let compSize = u32(cd, p + 20)
    let size = u32(cd, p + 24)
    const nameLen = u16(cd, p + 28)
    const extraLen = u16(cd, p + 30)
    const commentLen = u16(cd, p + 32)
    let offset = u32(cd, p + 42)
    const path = names.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen))

    // ZIP64 puts whichever fields overflowed into an extra field, in a fixed
    // order, and includes ONLY the ones that were maxed out.
    if (size === 0xffffffff || compSize === 0xffffffff || offset === 0xffffffff) {
      let e = p + 46 + nameLen
      const end = e + extraLen
      while (e + 4 <= end) {
        const id = u16(cd, e)
        const len = u16(cd, e + 2)
        if (id === 0x0001) {
          let q = e + 4
          if (size === 0xffffffff) { size = u64(cd, q); q += 8 }
          if (compSize === 0xffffffff) { compSize = u64(cd, q); q += 8 }
          if (offset === 0xffffffff) { offset = u64(cd, q) }
          break
        }
        e += 4 + len
      }
    }

    if (!path.endsWith('/')) out.push({ path, size, compSize, method, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** Inflate one entry to bytes. Stored and deflate are the only two methods in the wild. */
/** A zip entry name as a project-relative path — see the intake note on names. */
export function safePath(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter((seg) => seg && seg !== '.' && seg !== '..').join('/')
}

async function readEntryBlob(file: Blob, entry: ZipEntry): Promise<Blob | null> {
  // The local header repeats the name and extra fields, and its lengths can
  // differ from the central directory's — the data starts after ITS pair.
  const head = await slice(file, entry.offset, entry.offset + 30)
  const start = entry.offset + 30 + u16(head, 26) + u16(head, 28)
  const body = file.slice(start, start + entry.compSize)
  if (entry.method === 0) return body
  if (entry.method !== 8) return null
  try {
    const stream = body.stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return await new Response(stream).blob()
  } catch {
    return null
  }
}

async function readEntry(file: Blob, entry: ZipEntry): Promise<string | null> {
  const blob = await readEntryBlob(file, entry)
  return blob ? blob.text() : null
}

/**
 * The archive as a lazy, wrapper-stripped directory: every real entry by its
 * project-relative path, and a reader per entry. The audit reads TEXT from a
 * capped selection; the sandbox serves EVERY file (images, fonts, JS) as bytes.
 * Both go through this one central-directory parse — one zip reader.
 */
export interface Archive {
  rootName: string
  entries: ZipEntry[]
  readBlob(entry: ZipEntry): Promise<Blob | null>
  readText(entry: ZipEntry): Promise<string | null>
}

export async function openZip(file: File): Promise<Archive> {
  const entries = await readCentralDirectory(file)
  if (!entries) throw new Error('That file is not a readable .zip archive.')

  /* Drop the noise BEFORE looking for a wrapper, not after.
   *
   * A macOS zip carries a parallel `__MACOSX` tree of resource forks mirroring
   * every real path, and it sits at the TOP level — a sibling of the project
   * folder, not inside it. Filtering afterwards leaves it in the running while
   * the wrapper is detected, so `every path starts with acme/` comes back false
   * and the wrapper survives: every path then reads `acme/src/…`, which matches
   * none of the skip or priority rules, all of which are project-relative. */
  const real = entries.filter((e) => !e.path.startsWith('__MACOSX/') && !/(^|\/)\._/.test(e.path))

  /* A zip made from a folder — GitHub's, macOS's, every one of them — wraps
   * everything in a single top-level directory. */
  const first = real[0]?.path.split('/')[0]
  const wrapped = Boolean(first) && real.every((e) => e.path.startsWith(`${first}/`))
  const rootName = wrapped ? first! : file.name.replace(/\.zip$/i, '') || 'your project'
  const strip = (p: string) => (wrapped ? p.slice(first!.length + 1) : p)

  // Paths are NAMES, never locations: an entry called `../../x.html` or
  // `/abs/x.html` (a hostile or merely odd zip) is normalised — backslashes to
  // slashes, leading slashes and `..` segments dropped — so it can neither
  // read as a screen above the root nor come back out of an export as a
  // zip-slip into whoever unpacks it.
  const named = real.map((e) => ({ ...e, path: safePath(strip(e.path)) })).filter((e) => e.path)
  // The size guard: a build is tens of megabytes; an archive claiming more than
  // 2 GB unpacked, or 60,000 files, is not one we can hold in a tab.
  const total = named.reduce((n, e) => n + e.size, 0)
  if (total > 2 * 1024 ** 3) throw new Error(`This archive unpacks to ${Math.round(total / 1024 ** 3)} GB — more than a browser tab can hold. Drop the built site only (its dist/ or build/ folder).`)
  if (named.length > 60000) throw new Error(`This archive holds ${named.length.toLocaleString()} files — more than a browser tab can hold. Drop the built site only (its dist/ or build/ folder).`)
  return {
    rootName,
    entries: named,
    readBlob: (e) => readEntryBlob(file, e),
    readText: (e) => readEntry(file, e),
  }
}

/** True for anything that looks like a zip archive the picker handed us. */
export const isZip = (file: File) =>
  /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'

/**
 * Read a zipped project into the same shape the folder picker produces.
 *
 * Throws a message meant for a human when the archive is not one — the door
 * shows it verbatim, because "that did not work" teaches a visitor nothing.
 */
export async function readZipFile(file: File): Promise<ScanResult> {
  const archive = await openZip(file)
  return scanArchive(archive)
}

/** The audit's view of an archive: the capped, prioritised text selection. */
export async function scanArchive(archive: Archive): Promise<ScanResult> {
  const { entries: named, rootName } = archive
  let pkg: unknown | null = null
  const pkgEntry = named.find((e) => e.path === 'package.json')
  if (pkgEntry) {
    try { pkg = JSON.parse((await archive.readText(pkgEntry)) || '') } catch { /* malformed → skip */ }
  }

  const { take, skipped } = selectFiles(named)
  const files: ScanFile[] = []
  for (const entry of take) {
    const content = await archive.readText(entry)
    if (content !== null) files.push({ path: entry.path, content })
  }
  return { files, pkg, skipped, rootName }
}

/**
 * A picked or dropped FOLDER, in the same Archive shape as a zip — so the
 * project builder and the audit have one input type. Paths lose the picked
 * folder's own name, exactly as the zip reader strips its wrapper.
 */
export function archiveFromFiles(files: File[], name = 'your project'): Archive {
  const rel = (f: File) => {
    const p = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    const i = p.indexOf('/')
    return i >= 0 ? p.slice(i + 1) : p
  }
  const first = (files[0] as (File & { webkitRelativePath?: string }) | undefined)?.webkitRelativePath?.split('/')[0]
  const byPath = new Map<string, File>()
  for (const f of files) byPath.set(rel(f), f)
  const entries: ZipEntry[] = [...byPath.entries()]
    .filter(([p]) => p && !p.startsWith('__MACOSX/') && !/(^|\/)\._/.test(p))
    .map(([p, f]) => ({ path: p, size: f.size, compSize: f.size, method: 0, offset: 0 }))
  return {
    rootName: first || name,
    entries,
    readBlob: async (e) => byPath.get(e.path) ?? null,
    readText: async (e) => (await byPath.get(e.path)?.text()) ?? null,
  }
}
