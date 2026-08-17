import { describe, it, expect, beforeEach } from 'vitest'
import {
  configFromAudit, derivedFromAudit, provenanceFromAudit, provenanceState,
  saveHandoff, readHandoff, clearHandoff, saveReport, readReport,
  type AuditHandoff,
} from '../intake/handoff'
import { DEFAULT_CONFIG } from '../../tokens/defaults'

/**
 * The handoff carries a scan of someone's private codebase across a navigation,
 * decides what the configurator opens with, and decides what each control
 * claims about where its value came from. It had no tests at all, and the gap
 * was not theoretical: adding two fields to the stored shape crashed the app
 * for exactly the people who had already used the feature.
 *
 * These pin the decisions rather than the plumbing — what gets applied, what
 * deliberately does not, and what happens when the input is wrong.
 */

const EMPTY_SPREAD = {
  radius: [], shadow: [], spacing: [], color: [], neutral: [], type: [],
  bg: null, fg: null, border: null, polarity: null,
}
const handoff = (over: Partial<AuditHandoff> = {}): AuditHandoff => ({
  hash: 'v2:abc', rootName: 'acme', filesRead: 10, parsed: 1,
  kinds: {}, shell: {}, variants: {}, spread: EMPTY_SPREAD,
  distinct: { radius: 0, shadow: 0, color: 0, spacing: 0 },
  treatments: 0, singletons: 0, score: 70,
  provenance: {}, derived: {}, ...over,
})

beforeEach(() => sessionStorage.clear())

describe('what the configurator opens with', () => {
  it('applies only what the engine committed to', () => {
    const cfg = configFromAudit({ values: { radius: 'round', scale: 'compact' } })
    expect(cfg.radius).toBe('round')
    expect(cfg.scale).toBe('compact')
    // Untouched fields must arrive as OUR default, not as a guess wearing
    // their name — the engine declining to infer is information, not a gap.
    expect(cfg.typeScale).toBe(DEFAULT_CONFIG.typeScale)
  })

  it('refuses a value this build does not offer', () => {
    // A stored handoff or a newer engine can name something we never shipped;
    // passing it through would put an invalid value into the shareable URL.
    const cfg = configFromAudit({ values: { radius: 'sharp', scale: 'roomy', colorTheme: 'chartreuse' } })
    expect(cfg.radius).toBe(DEFAULT_CONFIG.radius)
    expect(cfg.scale).toBe(DEFAULT_CONFIG.scale)
    expect(cfg.colorTheme).toBe(DEFAULT_CONFIG.colorTheme)
  })

  it('takes their EXACT brand, not just the nearest anchor', () => {
    // Snapping documenso's lime to our jade hands them a kit that is merely
    // near their brand — the drift this tool exists to end.
    const cfg = configFromAudit({ values: { colorTheme: 'jade', brandHex: '#a2e771' } })
    expect(cfg.cPrimary).toBe('#a2e771')
    // The named theme stays as the row label; there is no 'custom' theme to set.
    expect(cfg.colorTheme).toBe('jade')
  })

  it('ignores a brand hex that is not one', () => {
    const cfg = configFromAudit({ values: { colorTheme: 'jade', brandHex: 'rebeccapurple' } })
    expect(cfg.cPrimary).not.toBe('rebeccapurple')
  })

  it('survives an empty or malformed inference', () => {
    expect(() => configFromAudit({})).not.toThrow()
    expect(configFromAudit({}).radius).toBe(DEFAULT_CONFIG.radius)
    expect(() => configFromAudit({ values: { radius: 42 as unknown as string } })).not.toThrow()
  })
})

describe('what each control claims about itself', () => {
  it('marks a control as derived only while it still matches', () => {
    const h = handoff({ derived: { radius: 'round' } })
    expect(provenanceState({ radius: 'round' }, h)['Box radius']).toBe('derived')
    // The moment they drag it, the badge stops claiming their code said so —
    // a marker that outlives its evidence is worse than none.
    expect(provenanceState({ radius: 'subtle' }, h)['Box radius']).toBe('changed')
  })

  it('says "not decided" for a field the engine declined', () => {
    const h = handoff({ derived: {} })
    expect(provenanceState({ radius: 'soft' }, h)['Box radius']).toBe('default')
  })

  it('says nothing at all without an audit', () => {
    expect(provenanceState({ radius: 'soft' }, null)).toEqual({})
  })

  it('records only the fields the engine set', () => {
    const d = derivedFromAudit({ values: { radius: 'round' } })
    expect(d.radius).toBe('round')
    expect('scale' in d).toBe(false)
  })

  it('carries the reason a colour was believed', () => {
    const p = provenanceFromAudit({
      values: { colorTheme: 'teal' },
      confidence: { colorTheme: 1, colorThemeSource: 'declared as --color-brand' },
    })
    expect(p.Brand?.confidence).toBe(1)
    expect(p.Brand?.source).toMatch(/--color-brand/)
    // A field with no value is not "confident zero", it is undecided.
    expect(p['Box radius']?.confidence).toBeNull()
  })
})

describe('storage, and the shapes it has to survive', () => {
  it('round-trips a handoff', () => {
    saveHandoff(handoff({ rootName: 'northwind' }))
    expect(readHandoff()?.rootName).toBe('northwind')
  })

  it('discards anything an older build wrote', () => {
    // The real crash: `spread` grew `neutral` and `type`, and a handoff stored
    // before that deploy took the whole app down on `spread.color`.
    const stale = { ...handoff(), spread: { color: [] } }
    sessionStorage.setItem('uicockpit.audit.handoff.v1', JSON.stringify(stale))
    expect(readHandoff()).toBeNull()
  })

  it('discards a handoff missing a field the view reads', () => {
    const { shell: _shell, ...withoutShell } = handoff()
    sessionStorage.setItem('uicockpit.audit.handoff.v1', JSON.stringify(withoutShell))
    expect(readHandoff()).toBeNull()
  })

  it('survives outright garbage', () => {
    sessionStorage.setItem('uicockpit.audit.handoff.v1', 'not json{{')
    expect(readHandoff()).toBeNull()
  })

  it('clears the report alongside the handoff', () => {
    saveHandoff(handoff())
    saveReport('<html>report</html>')
    expect(readReport()).toContain('report')
    clearHandoff()
    expect(readHandoff()).toBeNull()
    expect(readReport()).toBeNull()
  })
})
