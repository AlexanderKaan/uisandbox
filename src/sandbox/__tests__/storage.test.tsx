// `.tsx` on purpose: the node test project has no `localStorage`, and the
// jsdom project is the one that picks up the .test.tsx files.
import { describe, it, expect, beforeEach } from 'vitest'
import { purgeGuestStorage } from '../host'

describe('purgeGuestStorage', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

  it('clears what a dropped app wrote and keeps what this app wrote', () => {
    // Both leftovers below were measured on real fixtures after the project
    // was closed — the sandbox is same-origin, so the guest writes to us.
    localStorage.setItem('mantine-navbar-opened', 'true')
    sessionStorage.setItem('vitepress-theme-appearance', 'auto')
    sessionStorage.setItem('us-stars', '{"n":12}')
    sessionStorage.setItem('uicockpit.audit.handoff.v1', '{}')

    const gone = purgeGuestStorage().sort()

    expect(gone).toEqual(['mantine-navbar-opened', 'vitepress-theme-appearance'])
    expect(localStorage.getItem('mantine-navbar-opened')).toBeNull()
    expect(sessionStorage.getItem('us-stars')).toBe('{"n":12}')
    expect(sessionStorage.getItem('uicockpit.audit.handoff.v1')).toBe('{}')
  })

  it('is safe to call with nothing to clean', () => {
    expect(purgeGuestStorage()).toEqual([])
  })
})
