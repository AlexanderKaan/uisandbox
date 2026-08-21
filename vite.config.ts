import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { handleRepo } from './worker/repo.mjs'

/* Dev-only scratch store for the hold-out comparison (scripts/census.js): the
 * census of a LIVE site is POSTed here from its own tab, the sandbox tab GETs
 * it and diffs. CORS open on purpose — dev server, in-memory, gone on restart. */
function censusStore(): Plugin {
  const store = new Map<string, string>()
  return {
    name: 'census-store',
    configureServer(server) {
      server.middlewares.use('/__census', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', '*')
        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
        const key = (req.url || '/').replace(/^\//, '')
        if (req.method === 'POST') {
          let body = ''
          req.on('data', (c) => { body += c })
          req.on('end', () => { store.set(key, body); res.end('ok') })
          return
        }
        res.setHeader('content-type', 'application/json')
        res.end(store.get(key) ?? 'null')
      })
    },
  }
}

/* The repo route in dev — the same handler the Worker runs (worker/repo.mjs). */
function repoRoute(): Plugin {
  return {
    name: 'repo-route',
    configureServer(server) {
      server.middlewares.use('/__repo', async (req, res) => {
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
        const r = await handleRepo(new Request(`http://${req.headers.host}${req.originalUrl ?? req.url}`, { headers }))
        res.statusCode = r.status
        r.headers.forEach((v, k) => res.setHeader(k, v))
        if (!r.body) { res.end(); return }
        const reader = r.body.getReader()
        for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)) }
        res.end()
      })
    },
  }
}

/* 5190 by default: the hold-out and export sweeps point `--base` at it, and
 * the app registers a service worker, which is scoped to an origin — so the
 * port is part of the address, not an implementation detail.
 *
 * When the harness assigns one through PORT we take it instead, and drop
 * strictPort with it: refusing an assigned port is how a leftover dev server
 * from an earlier run blocks the next one. */
const PORT = Number(process.env.PORT) || 5190
const STRICT = !process.env.PORT

export default defineConfig({
  server: { port: PORT, strictPort: STRICT },
  preview: { port: PORT, strictPort: STRICT },
  plugins: [react(), censusStore(), repoRoute()],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['src/**/*.test.ts'], exclude: ['src/audit/**'] },
      },
      {
        extends: true,
        test: { name: 'dom', environment: 'jsdom', include: ['src/audit/**/*.test.ts', 'src/**/*.test.tsx'] },
      },
    ],
  },
})
