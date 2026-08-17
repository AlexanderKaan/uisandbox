// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { discoverRoutes, findRoots, injectVars } from '../project'

describe('discoverRoutes', () => {
  it('lists same-origin, extension-less links as routes; skips files, hashes and externals', () => {
    document.body.innerHTML = `<a href="/">Home</a><a href="/projects">P</a><a href="/settings/">S</a><a href="/assets/x.css">css</a><a href="#top">t</a><a href="https://example.com/x">ext</a><a href="mailto:a@b.c">m</a>`
    const found = discoverRoutes(document, [{ path: 'index.html', label: '/' }])
    expect(found.map((s) => s.label)).toEqual(['/projects', '/settings'])
    expect(found[0]).toEqual({ path: 'projects', label: '/projects', source: 'link' })
  })
})

describe('findRoots', () => {
  it('a named build folder beats a bare root index; src/ and node_modules never qualify', () => {
    expect(findRoots(['index.html', 'dist/index.html', 'src/index.html', 'node_modules/x/index.html'])).toEqual(['dist', ''])
    expect(findRoots(['docs/index.html', 'docs/a/index.html'])).toEqual(['docs', 'docs/a'])
  })
})

describe('injectVars', () => {
  it('puts the vars block and the CSSOM hook (with the sid) at the top of <head>', () => {
    const out = injectVars('<html><head><title>x</title></head><body></body></html>', { '--us-v1': '#fff' }, 'p9')
    expect(out.indexOf('<style id="us-vars">')).toBeLessThan(out.indexOf('<title>'))
    expect(out).toContain('--us-v1:#fff')
    expect(out).toContain('var SID="p9"')
    expect(out).toContain('P.insertRule=')
  })
})
