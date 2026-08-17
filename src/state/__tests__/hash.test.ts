// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { decode, encode, writeHash } from '../hash'
import { DEFAULT_CONFIG } from '../../tokens/defaults'
import { COLOR_THEMES, applyColorTheme } from '../../tokens/stylesAndThemes'
import type { Config, Scale } from '../../tokens/types'

describe('hash encode/decode', () => {
  it('round-trips default config', () => {
    const encoded = encode(DEFAULT_CONFIG)
    const decoded = decode(encoded)
    expect(decoded).toEqual(DEFAULT_CONFIG)
  })

  it('round-trips every Scale', () => {
    const scales: Scale[] = ['compact', 'default', 'comfortable']
    for (const scale of scales) {
      const cfg: Config = { ...DEFAULT_CONFIG, scale }
      const decoded = decode(encode(cfg))
      expect(decoded).toEqual(cfg)
    }
  })

  it('round-trips every Color theme', () => {
    for (const themeId of Object.keys(COLOR_THEMES) as Array<keyof typeof COLOR_THEMES>) {
      const cfg: Config = applyColorTheme(DEFAULT_CONFIG, themeId)
      const decoded = decode(encode(cfg))
      expect(decoded).toEqual(cfg)
    }
  })

  it('encoded output is meaningfully shorter than base64 JSON', () => {
    const lzEncoded = encode(DEFAULT_CONFIG)
    const base64 = btoa(JSON.stringify(DEFAULT_CONFIG))
    expect(lzEncoded.length).toBeLessThan(base64.length)
  })

  it('decodes legacy base64-JSON (reference URL backwards-compat)', () => {
    const legacy = btoa(JSON.stringify(DEFAULT_CONFIG))
    const decoded = decode(legacy)
    expect(decoded).toEqual(DEFAULT_CONFIG)
  })

  it('returns null for malformed input', () => {
    expect(decode('')).toBeNull()
    expect(decode('#')).toBeNull()
    expect(decode('v2:!!!not-valid')).toBeNull()
  })

  it('strips leading hash mark', () => {
    const encoded = encode(DEFAULT_CONFIG)
    expect(decode('#' + encoded)).toEqual(DEFAULT_CONFIG)
  })
})

/**
 * What lands in the URL is product surface, not plumbing — it is the only place
 * a kit is stored, since there is no account and no database.
 *
 * The bug these guard: /app wrote a full ~500-character hash on arrival, before
 * the visitor had chosen anything. The first URL anyone saw was unshareable, and
 * it rode along to every other route, so clicking the logo carried that state
 * onto the home page.
 */
describe('the URL only carries a kit once there is one', () => {
  beforeEach(() => { history.replaceState(null, '', '/app') })

  it('writes nothing for an untouched kit', () => {
    writeHash(DEFAULT_CONFIG)
    expect(new URL(document.location.href).hash).toBe('')
  })

  it('clears a hash that decodes back to the default', () => {
    history.replaceState(null, '', '/app#' + encode(DEFAULT_CONFIG))
    writeHash(DEFAULT_CONFIG)
    expect(new URL(document.location.href).hash).toBe('')
  })

  it('writes as soon as one decision differs', () => {
    writeHash({ ...DEFAULT_CONFIG, radius: 'round' })
    expect(new URL(document.location.href).hash).not.toBe('')
  })

  it('keeps the tuned kit fully recoverable', () => {
    const tuned: Config = { ...DEFAULT_CONFIG, radius: 'round' }
    expect(decode(encode(tuned))).toEqual(tuned)
    expect(encode(tuned)).not.toBe(encode(DEFAULT_CONFIG))
  })
})
