import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mcp = join(import.meta.dirname, '..', '..', 'mcp')
const server = JSON.parse(readFileSync(join(mcp, 'server.json'), 'utf8'))
const pkg = JSON.parse(readFileSync(join(mcp, 'package.json'), 'utf8'))

/**
 * The registry rejects a manifest at PUBLISH time, which is the worst moment
 * to find out, because npm has already gone out by then and cannot be recalled.
 *
 * The 100-character limit was fixed once, in a commit whose subject line says
 * exactly that, and then broken again by a copy pass that rewrote the
 * description to match a new headline and had no reason to know a limit
 * existed. Nobody is going to remember; it is held here instead.
 */
describe('the MCP registry manifest', () => {
  it("keeps the description within the registry's 100 characters", () => {
    expect(server.description.length).toBeLessThanOrEqual(100)
  })

  it('agrees with the npm package it points at', () => {
    // The registry checks that the npm version named here actually exists, so
    // these drifting apart is a failed publish rather than a bad render.
    expect(server.packages[0].identifier).toBe(pkg.name)
    expect(server.packages[0].version).toBe(pkg.version)
    expect(server.version).toBe(pkg.version)
  })

  it('carries one namespace, spelled the same in both files', () => {
    expect(server.name).toBe(pkg.mcpName)
    expect(server.name).toMatch(/^io\.github\.[A-Za-z0-9-]+\/uisandbox$/)
  })

  it('points at the repository it actually lives in', () => {
    expect(server.repository.url).toBe('https://github.com/Ideelab/uisandbox')
    expect(pkg.repository.url).toContain('github.com/Ideelab/uisandbox')
  })
})
