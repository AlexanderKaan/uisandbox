import { defineConfig } from 'vite'
import { resolve } from 'node:path'

/* Bundles mcp/server.ts + the engine from src/ into one Node ESM file for the
 * npm package `uisandbox-mcp`. The MCP SDK, zod and playwright stay external
 * (dependencies / optional); everything of ours is inlined — one file, no
 * second engine (it IS the engine). */
export default defineConfig({
  publicDir: false,
  build: {
    ssr: true,
    target: 'node20',
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    lib: { entry: resolve(__dirname, 'server.ts'), formats: ['es'], fileName: () => 'server.mjs' },
    rollupOptions: { external: [/^@modelcontextprotocol\//, 'zod', 'playwright', /^node:/], output: { inlineDynamicImports: true, entryFileNames: 'server.mjs' } },
    minify: false,
    sourcemap: false,
  },
  ssr: { noExternal: ['lz-string'] },
})
