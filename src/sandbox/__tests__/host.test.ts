import { describe, it, expect } from 'vitest'
import { resolveFile } from '../host'

describe('resolveFile', () => {
  const files = new Map([['index.html', 1], ['static/js/main.js', 2], ['assets/a.css', 3]])
  it('exact first, then the deploy sub-path stripped (CRA homepage / Vite base / gh-pages)', () => {
    expect(resolveFile(files, 'static/js/main.js')).toBe(2)
    expect(resolveFile(files, 'react-gh-pages/static/js/main.js')).toBe(2)
    expect(resolveFile(files, 'org/site/assets/a.css')).toBe(3)
    expect(resolveFile(files, 'nope/x.js')).toBeUndefined()
  })
})
