import { describe, it, expect } from 'vitest'
import { detectScheme, type Scheme } from '../scheme'

describe('detectScheme', () => {
  it('finds media queries, attribute hooks (with a light twin) and class hooks', () => {
    const s: Scheme = { media: false, hooks: [] }
    detectScheme(`@media (prefers-color-scheme: dark){:root{--bg:#000}} [data-bs-theme=dark]{--x:1} [data-bs-theme="light"]{--x:0} html.dark .card{color:#fff} .theme-dark{}`, s)
    expect(s.media).toBe(true)
    expect(s.hooks).toEqual([['data-bs-theme', 'dark', 'light'], ['class', 'dark', null], ['class', 'theme-dark', null]])
  })
  it('a sheet without a scheme yields nothing (the knob stays hidden)', () => {
    const s: Scheme = { media: false, hooks: [] }
    detectScheme(`.a{color:#111;background:#fff}`, s)
    expect(s).toEqual({ media: false, hooks: [] })
  })
})
