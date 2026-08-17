import type { SandboxProject } from '../sandbox/project'
import { cssValue, varName } from '../sandbox/table'

/**
 * The stage for what no browser can draw: their values, live. Not their app,
 * not a redesign — a legend of every literal the sheet holds, painted with the
 * CURRENT value, so the knobs still show what they do to *their* palette,
 * type, radii and spacing. The export writes exactly these back.
 */
export function ValuesBoard({ project, vars }: { project: SandboxProject; vars: Record<string, string> }) {
  const t = project.table
  const cur = (id: number) => vars[varName(id)] ?? ''
  const colors = t.ofKind('color').sort((a, b) => b.count - a.count)
  const fonts = t.ofKind('font-family').sort((a, b) => b.count - a.count)
  const sizes = t.ofKind('font-size').sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
  const radii = t.ofKind('radius').sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
  const spaces = t.ofKind('space').sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
  const shadows = t.ofKind('shadow')
  const p = project.platform
  const paint = (v: string) => (/^[\d.]+(\s*,\s*|\s+)[\d.]+(\s*,\s*|\s+)[\d.]+%?$/.test(v) ? (v.includes('%') ? `hsl(${v})` : `rgb(${v})`) : v)

  return (
    <div className="board">
      <div className="board__head">
        <h2>{p.label} — no 1:1 render, but every value read</h2>
        <p>
          {p.renders ? 'This build has no page to open.' : `No browser draws a ${p.label} interface, so what you see here is not your app: it is a legend of every literal found in ${project.sourceFiles || 'its'} source files, painted with the value the knobs give it right now.`}
          {' '}Turn the knobs; export writes these values back into your files in their own notation{p.kind === 'ios' ? ', and as Swift constants + an asset catalog' : p.kind === 'android' ? ', and as colors.xml + a Compose object' : ''}.
          {p.evidence.length ? ` (${p.evidence.join(' · ')})` : ''}
        </p>
      </div>
      {colors.length > 0 && (
        <section className="board__sec"><h3>Colours <small>{colors.length}</small></h3>
          <div className="board__swatches">
            {colors.slice(0, 96).map((e) => (
              <div key={e.id} className="board__sw" title={`${cssValue(e.value)} ×${e.count} — ${e.sites[0]?.file ?? ''}`}>
                <span className="board__chip" style={{ background: paint(cur(e.id)) }} />
                <span className="board__val">{cur(e.id)}</span>
                <span className="board__cnt">×{e.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {fonts.length > 0 && (
        <section className="board__sec"><h3>Type <small>{fonts.length} famil{fonts.length === 1 ? 'y' : 'ies'} · {sizes.length} sizes</small></h3>
          {fonts.slice(0, 8).map((e) => (
            <div key={e.id} className="board__font" style={{ fontFamily: cur(e.id) }}>
              <span className="board__fontname">{cur(e.id)}</span>
              <span className="board__sample">The quick brown fox jumps over the lazy dog — 0123456789</span>
              <span className="board__cnt">×{e.count}</span>
            </div>
          ))}
          <div className="board__sizes">
            {sizes.slice(0, 16).map((e) => (
              <span key={e.id} style={{ fontSize: cur(e.id), fontFamily: fonts[0] ? cur(fonts[0].id) : undefined }} title={`${cssValue(e.value)} ×${e.count}`}>Aa <small>{cur(e.id)}</small></span>
            ))}
          </div>
        </section>
      )}
      {(radii.length > 0 || spaces.length > 0 || shadows.length > 0) && (
        <section className="board__sec"><h3>Shape <small>{radii.length} radii · {spaces.length} spacings · {shadows.length} shadows</small></h3>
          <div className="board__shapes">
            {radii.slice(0, 12).map((e) => (
              <div key={e.id} className="board__box" style={{ borderRadius: cur(e.id), boxShadow: shadows[0] ? cur(shadows[0].id) : undefined }} title={`radius ${cssValue(e.value)} ×${e.count}`}><small>{cur(e.id)}</small></div>
            ))}
          </div>
          <div className="board__spaces">
            {spaces.slice(0, 16).map((e) => (
              <div key={e.id} title={`space ${cssValue(e.value)} ×${e.count}`}><i style={{ width: cur(e.id) }} /><small>{cur(e.id)}</small></div>
            ))}
          </div>
        </section>
      )}
      {t.entries.length === 0 && <p className="board__empty">Nothing tokenisable was found: no colours, fonts, radii or sizes in a notation this reader knows (hex, 0xAARRGGBB, Color(red:green:blue:), xcassets, cornerRadius, fontSize…).</p>}
    </div>
  )
}
