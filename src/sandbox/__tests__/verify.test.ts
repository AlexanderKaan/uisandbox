// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { compareDocuments, inFlatTree } from '../verify'

/* A document with a window: jsdom's createHTMLDocument has no defaultView,
 * an iframe's contentDocument does. */
const doc = (body: string, guard = true) => {
  const f = document.createElement('iframe')
  document.body.appendChild(f)
  const d = f.contentDocument!
  d.head.innerHTML = guard ? '<script id="us-guard"></script>' : ''
  d.body.innerHTML = body
  return d
}

describe('compareDocuments — the control', () => {
  it('refuses a document the sandbox did not serve (no guard): the host index is not their page', () => {
    const r = compareDocuments(doc('<p>x</p>', false), doc('<p>x</p>'))
    expect(r.ok).toBe(false)
    expect(r.refusal).toMatch(/did not serve/)
    expect(r.elements).toBe(0)
  })
  it('pairs by path and passes identical documents', () => {
    const r = compareDocuments(doc('<div><p>a</p><p>b</p></div>'), doc('<div><p>a</p><p>b</p></div>'))
    expect(r.ok).toBe(true)
    expect(r.elements).toBe(3)
  })
})

describe('inFlatTree', () => {
  it('an unslotted light-DOM child of a shadow host is not in the flat tree', () => {
    const d = doc('<x-host><span id="loose">l</span><span id="named" slot="s">n</span></x-host><p id="plain">p</p>')
    const host = d.querySelector('x-host')!
    host.attachShadow({ mode: 'open' }).innerHTML = '<slot name="s"></slot>'
    expect(inFlatTree(d.getElementById('plain')!)).toBe(true)
    expect(inFlatTree(d.getElementById('named')!)).toBe(true)
    expect(inFlatTree(d.getElementById('loose')!)).toBe(false)
  })
})
