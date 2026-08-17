/* Minimal dependency-free ZIP writer — STORE method (no compression). Enough to
 * bundle the text artifacts of the "Use this kit" pack into one download without
 * pulling in jszip/fflate. Standard layout: per-file local header + data, then the
 * central directory, then the end-of-central-directory record. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  text: string
}

/** Build a STORE-method .zip Blob from text entries. Filenames may contain `/`
 *  for folders (e.g. `.cursor/rules/uicockpit.mdc`). */
export function zipSync(files: ZipEntry[]): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const name = enc.encode(f.name)
    const data = enc.encode(f.text)
    const crc = crc32(data)
    const size = data.length

    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true) // local file header signature
    lh.setUint16(4, 20, true) // version needed
    lh.setUint16(8, 0, true) // method: store
    lh.setUint32(14, crc, true)
    lh.setUint32(18, size, true) // compressed size
    lh.setUint32(22, size, true) // uncompressed size
    lh.setUint16(26, name.length, true)
    parts.push(new Uint8Array(lh.buffer), name, data)

    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true) // central dir header signature
    cd.setUint16(4, 20, true) // version made by
    cd.setUint16(6, 20, true) // version needed
    cd.setUint16(10, 0, true) // method: store
    cd.setUint32(16, crc, true)
    cd.setUint32(20, size, true)
    cd.setUint32(24, size, true)
    cd.setUint16(28, name.length, true)
    cd.setUint32(42, offset, true) // relative offset of local header
    central.push(new Uint8Array(cd.buffer), name)

    offset += 30 + name.length + size
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true) // end of central dir signature
  eocd.setUint16(8, files.length, true) // entries on this disk
  eocd.setUint16(10, files.length, true) // total entries
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, offset, true) // central dir offset

  // Merge into one contiguous ArrayBuffer-backed array (a clean BlobPart).
  const all = [...parts, ...central, new Uint8Array(eocd.buffer)]
  const total = all.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of all) {
    out.set(c, pos)
    pos += c.length
  }
  return new Blob([out], { type: 'application/zip' })
}
