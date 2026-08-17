import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

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

export default defineConfig({
  server: { port: 5190, strictPort: true },
  preview: { port: 5190, strictPort: true },
  plugins: [react(), censusStore()],
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
