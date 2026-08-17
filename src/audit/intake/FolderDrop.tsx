import { useRef, useState, type ReactNode } from 'react'
import { FolderOpen, ShieldCheck, FileArchive } from 'lucide-react'
import { filesFromDrop } from './readFiles'

/**
 * The intake, once — used by both doors.
 *
 * There are two ways into the audit (the marketing page and the configurator's
 * own "Your app" mode) and they were drifting apart within a day: one had a
 * real drop target, the other a lone button. Two implementations of the same
 * promise is how the two entrances stop being one product.
 *
 * Drop target AND file dialog, always. Dragging is what people reach for, and
 * the dialog stays because a drop zone is invisible to anyone on a keyboard —
 * and, on a phone, is not a thing at all.
 *
 * ── and the phone ──────────────────────────────────────────────────────────
 * `webkitdirectory` is a desktop affordance. It does nothing on iOS and nothing
 * on Android Chrome, and there is no feature test that says so: the property is
 * present and settable on every browser that ignores it. So the choice is not
 * "detect and adapt", it is what to OFFER — and the honest answer is both routes
 * with the pointer-capable one shown first, since a zip is the only shape a
 * phone can hand us and it costs a desktop visitor nothing to see it.
 */

interface FolderDropProps {
  /** A folder, as a flat file list with paths. */
  onFiles: (files: FileList | File[]) => void
  /** A single .zip, read by readZipFile. */
  onZip: (file: File) => void
  busy?: boolean
  error?: string | null
  /** The marketing door leads with its own headline, so it suppresses this one. */
  heading?: ReactNode
  lede?: ReactNode
  /** Marketing sits on white and states its promises separately; the app stage
   *  is a card on a canvas and carries the promise inline. */
  tone?: 'page' | 'stage'
}

export function FolderDrop({
  onFiles, onZip, busy = false, error = null, heading, lede, tone = 'stage',
}: FolderDropProps) {
  /* One button recipe on every surface. This used to branch — .mkt-btn on the
   * marketing page, .btn in the app — because the kit's tokens were scoped to
   * the app root and .btn "resolved to nothing at all" out here. The tokens now
   * ship with the recipes (see injectKit), so the workaround is gone and the
   * audit's call to action is the same button as everywhere else. */
  const btn = 'btn'
  const [over, setOver] = useState(false)
  const folderRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={`audz audz--${tone}${over ? ' audz--over' : ''}${busy ? ' audz--busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault()
        setOver(false)
        // A dropped .zip arrives as a plain file, not a directory entry.
        const dropped = Array.from(e.dataTransfer.files || [])
        if (dropped.length === 1 && /\.zip$/i.test(dropped[0]!.name)) { onZip(dropped[0]!); return }
        const files = await filesFromDrop(e.dataTransfer.items)
        if (files.length) onFiles(files)
      }}
    >
      <FolderOpen size={26} strokeWidth={1.6} className="audz__icon" />
      <h2>{busy ? 'Reading your code…' : heading || 'Point this at your app'}</h2>
      <p>
        {busy
          ? 'Everything stays on this machine.'
          : lede || 'Drop a folder here, and the components you already build appear on this stage — themed by the kit your code implies.'}
      </p>
      {!busy && (
        <>
          <div className="audz__choices">
            <button type="button" className={`${btn} ${btn}--primary`} onClick={() => folderRef.current?.click()}>
              Choose a folder
            </button>
            <button type="button" className={`${btn} ${btn}--ghost audz__zip`} onClick={() => zipRef.current?.click()}>
              <FileArchive size={14} strokeWidth={1.9} />
              or a .zip
            </button>
          </div>
          <span className="audz__hint">one app, not a monorepo root · node_modules is skipped</span>
        </>
      )}
      {error && <p className="audz__error">{error}</p>}
      <p className="audz__promise">
        <ShieldCheck size={13} strokeWidth={2} />
        Runs in this tab. Nothing is uploaded — open your network panel and watch it stay quiet.
      </p>

      <input
        ref={folderRef}
        type="file"
        hidden
        // @ts-expect-error — non-standard, but the only directory picker that
        // works in Safari and Firefox too.
        webkitdirectory=""
        directory=""
        multiple
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      <input
        ref={zipRef}
        type="file"
        hidden
        accept=".zip,application/zip"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onZip(f) }}
      />
    </div>
  )
}
