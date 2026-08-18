import { Mark } from './Mark'
import { useRef, useState } from 'react'
import { FileArchive, FolderOpen } from 'lucide-react'
import { archiveFromFiles, isZip, openZip, type Archive } from '../audit/intake/readZip'
import { filesFromDrop } from '../audit/intake/readFiles'

interface IntakeProps {
  onArchive: (archive: Archive) => void
  busy: string | null
  error: string | null
}

/**
 * The door. A zip or a folder of the BUILT site (dist/, build/, out/, or a
 * plain website); a source repo works too when its build output is inside it.
 * Everything stays in the tab — there is no upload.
 */
export function Intake({ onArchive, busy, error }: IntakeProps) {
  const [over, setOver] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)

  const takeFiles = async (files: File[]) => {
    setLocalError(null)
    try {
      if (files.length === 1 && isZip(files[0]!)) onArchive(await openZip(files[0]!))
      else if (files.length) onArchive(archiveFromFiles(files))
    } catch (err) { setLocalError((err as Error).message) }
  }

  return (
    <div className="intake">
      <div className="card intake__card">
        <div className="intake__mark"><Mark size={40} /></div>
        <h1>Your app, 1:1 — then turn the knobs.</h1>
        <p>Drop the <b>built</b> site (its <code>dist/</code>, <code>build/</code>, <code>out/</code> — or any folder with an <code>index.html</code>). We tokenise every colour, radius, font, size and shadow in its CSS and show it exactly as it was.</p>
        <div
          className={`intake__drop ${over ? 'intake__drop--over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={async (e) => {
            e.preventDefault(); setOver(false)
            const dropped = Array.from(e.dataTransfer.files || [])
            if (dropped.length === 1 && isZip(dropped[0]!)) { void takeFiles(dropped); return }
            const files = await filesFromDrop(e.dataTransfer.items)
            void takeFiles(files.length ? files : dropped)
          }}
        >
          {busy ? (
            <div className="intake__busy">{busy}</div>
          ) : (
            <>
              <div>Drop a <b>.zip</b> or a <b>folder</b> here</div>
              <div className="intake__choices">
                <button type="button" className="btn btn--primary" onClick={() => zipRef.current?.click()}>
                  <FileArchive size={15} strokeWidth={1.75} /> Choose a zip
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => dirRef.current?.click()}>
                  <FolderOpen size={15} strokeWidth={1.75} /> Choose a folder
                </button>
              </div>
            </>
          )}
          <input ref={zipRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeFiles([f]); e.target.value = '' }} />
          <input ref={dirRef} type="file" hidden {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void takeFiles(fs); e.target.value = '' }} />
        </div>
        {(error || localError) && <div className="intake__error">{error || localError}</div>}
        <ul className="intake__how">
          <li>Vite / React / Vue / Svelte: <code>npm run build</code> → drop <code>dist/</code>. Next.js: <code>output: 'export'</code> → <code>out/</code>. Astro / Eleventy / plain HTML: the output folder.</li>
          <li>iOS apps: no browser can render SwiftUI 1:1 — export Swift constants and an asset catalog from the knobs instead (Export → iOS).</li>
          <li>Nothing leaves this tab: files are read here and served to the frame by a service worker on this origin.</li>
        </ul>
        <div className="intake__fine">
          Made with ♥ by <a href="https://github.com/AlexanderKaan" target="_blank" rel="noopener">Alexander Kaan</a> at <a href="https://pageminds.com/" target="_blank" rel="noopener">Pageminds</a> · <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener">MIT</a>, free forever · <a href="https://github.com/AlexanderKaan/uisandbox" target="_blank" rel="noopener">Source</a>
        </div>
      </div>
    </div>
  )
}
