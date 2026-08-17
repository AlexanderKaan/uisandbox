import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  server: { port: 5190, strictPort: true },
  preview: { port: 5190, strictPort: true },
  plugins: [react()],
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
