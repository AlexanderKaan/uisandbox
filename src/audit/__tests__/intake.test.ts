import { describe, it, expect } from 'vitest'
import { selectFiles, isScannable } from '../intake/readFiles'
import { readZipFile, isZip } from '../intake/readZip'

/**
 * The two intakes, and the property that binds them: a folder and a zip OF that
 * folder must reach the engine as the same thing. They did not — the engine has
 * order-sensitive tiebreaks, a directory walk and a zip's central directory
 * enumerate differently, and documenso came back with two different brands from
 * byte-identical inputs.
 *
 * The zip reader is hand-written against the format rather than pulled from a
 * package, so the format itself is worth pinning too — including the ZIP64 path,
 * which only appears on archives too large to make by accident.
 */

/* ── a real zip, built here, so the parser is tested against bytes ─────────── */

const enc = new TextEncoder()
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff
  for (const byte of b) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A minimal STORED-method archive — the shape every zip tool can also read. */
function makeZip(entries: Array<[string, string]>): Blob {
  const locals: Uint8Array<ArrayBuffer>[] = []
  const centrals: Uint8Array<ArrayBuffer>[] = []
  let offset = 0

  for (const [path, text] of entries) {
    const name = enc.encode(path)
    const data = enc.encode(text)
    const crc = crc32(data)

    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true)
    lh.setUint16(4, 20, true)
    lh.setUint16(8, 0, true) // stored
    lh.setUint32(14, crc, true)
    lh.setUint32(18, data.length, true)
    lh.setUint32(22, data.length, true)
    lh.setUint16(26, name.length, true)
    const local = new Uint8Array(30 + name.length + data.length)
    local.set(new Uint8Array(lh.buffer), 0)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    locals.push(local)

    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true)
    ch.setUint16(4, 20, true)
    ch.setUint16(6, 20, true)
    ch.setUint16(10, 0, true)
    ch.setUint32(16, crc, true)
    ch.setUint32(20, data.length, true)
    ch.setUint32(24, data.length, true)
    ch.setUint16(28, name.length, true)
    ch.setUint32(42, offset, true)
    const central = new Uint8Array(46 + name.length)
    central.set(new Uint8Array(ch.buffer), 0)
    central.set(name, 46)
    centrals.push(central)

    offset += local.length
  }

  const cdSize = centrals.reduce((a, c) => a + c.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, entries.length, true)
  eocd.setUint16(10, entries.length, true)
  eocd.setUint32(12, cdSize, true)
  eocd.setUint32(16, offset, true)
  return new Blob([...locals, ...centrals, new Uint8Array(eocd.buffer)])
}

const asFile = (blob: Blob, name = 'acme-main.zip') =>
  Object.assign(blob, { name, lastModified: 0 }) as unknown as File

/* ── what gets read, and in what order ─────────────────────────────────────── */

describe('which files are worth opening', () => {
  it('skips the directories that hold nobody’s decisions', () => {
    expect(isScannable('src/app.css')).toBe(true)
    expect(isScannable('node_modules/react/index.js')).toBe(false)
    expect(isScannable('dist/bundle.js')).toBe(false)
    expect(isScannable('README.md')).toBe(false)
  })

  it('reads the design system BEFORE the cap can bite', () => {
    // n8n's 8,000-file budget ran out inside packages/cli and never reached the
    // frontend; the audit still answered, describing a backend as a dark app.
    const files = [
      { path: 'packages/cli/src/service.ts', size: 10 },
      { path: 'packages/ui/theme.css', size: 10 },
      { path: 'packages/ui/Button.tsx', size: 10 },
    ]
    expect(selectFiles(files).take.map((f) => f.path)).toEqual([
      'packages/ui/theme.css',
      'packages/ui/Button.tsx',
      'packages/cli/src/service.ts',
    ])
  })

  it('orders by PATH, so the answer cannot depend on how it was handed over', () => {
    // The engine resolves a twice-declared custom property last-wins, so the
    // order files arrive in decides the answer. A directory walk and a zip
    // enumerate differently — same repo, two different brands.
    const paths = ['b/x.css', 'a/y.css', 'c/z.css']
    const forwards = selectFiles(paths.map((path) => ({ path, size: 1 })))
    const backwards = selectFiles([...paths].reverse().map((path) => ({ path, size: 1 })))
    expect(forwards.take.map((f) => f.path)).toEqual(backwards.take.map((f) => f.path))
    expect(forwards.take.map((f) => f.path)).toEqual(['a/y.css', 'b/x.css', 'c/z.css'])
  })

  it('reports what it refused rather than going quiet', () => {
    const { take, skipped } = selectFiles([
      { path: 'a.css', size: 10 },
      { path: 'generated.css', size: 2_000_000 },
    ])
    expect(take).toHaveLength(1)
    expect(skipped.tooBig).toBe(1)
  })
})

/* ── the archive itself ────────────────────────────────────────────────────── */

describe('reading a zipped project', () => {
  it('reads entries and strips the wrapper folder every zip tool adds', async () => {
    const zip = makeZip([
      ['acme-main/package.json', '{"name":"acme"}'],
      ['acme-main/src/app.css', ':root { --brand: #ff6900 }'],
    ])
    const scan = await readZipFile(asFile(zip))
    expect(scan.rootName).toBe('acme-main')
    expect(scan.files.map((f) => f.path)).toEqual(['src/app.css'])
    expect(scan.files[0]!.content).toContain('#ff6900')
    // package.json is read even though it is never scanned — it names the stack.
    expect((scan.pkg as { name: string }).name).toBe('acme')
  })

  it('ignores the resource-fork tree macOS ships alongside the real one', async () => {
    // The real shape: __MACOSX is a SIBLING of the project folder, not a child.
    // Filtered too late it also defeats wrapper detection, and every path keeps
    // its `acme/` prefix — which matches none of the project-relative rules.
    const zip = makeZip([
      ['acme/src/app.css', '.a { color: red }'],
      // Both shapes the mirror tree takes: the `._` fork, and a plain mirrored
      // name. The whole subtree is out, not just the entries that look odd.
      ['__MACOSX/acme/src/._app.css', 'binary junk'],
      ['__MACOSX/acme/src/app.css', '.a { color: blue }'],
    ])
    const scan = await readZipFile(asFile(zip))
    expect(scan.rootName).toBe('acme')
    expect(scan.files.map((f) => f.path)).toEqual(['src/app.css'])
    expect(scan.files[0]!.content).toContain('red')
  })

  it('keeps full paths when the archive has no single wrapper', async () => {
    const zip = makeZip([['src/a.css', '.a{}'], ['lib/b.css', '.b{}']])
    const scan = await readZipFile(asFile(zip, 'bundle.zip'))
    expect(scan.rootName).toBe('bundle')
    expect(scan.files.map((f) => f.path).sort()).toEqual(['lib/b.css', 'src/a.css'])
  })

  it('applies the same cap and the same order as a folder', async () => {
    const zip = makeZip([
      ['acme/packages/cli/svc.ts', 'const a = 1'],
      ['acme/packages/ui/theme.css', ':root{}'],
      ['acme/node_modules/react/index.js', 'module.exports = 1'],
    ])
    const scan = await readZipFile(asFile(zip))
    expect(scan.files.map((f) => f.path)).toEqual(['packages/ui/theme.css', 'packages/cli/svc.ts'])
  })

  it('says what is wrong when the file is not an archive', async () => {
    const notZip = asFile(new Blob([enc.encode('I am a PDF, honestly')]), 'thing.zip')
    await expect(readZipFile(notZip)).rejects.toThrow(/\.zip/)
  })

  it('recognises a zip by name or by type', () => {
    expect(isZip({ name: 'repo.zip', type: '' } as File)).toBe(true)
    expect(isZip({ name: 'repo.ZIP', type: '' } as File)).toBe(true)
    expect(isZip({ name: 'repo', type: 'application/zip' } as File)).toBe(true)
    expect(isZip({ name: 'repo.tar.gz', type: '' } as File)).toBe(false)
  })
})
