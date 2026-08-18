/** Smoke test for the MCP server: load → set → export → verify → screenshot.
 *  `UISANDBOX_URL=http://localhost:5190 npx tsx mcp/smoke.ts fixtures/s10-Skeleton.zip` */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
const zip = process.argv[2] ?? 'fixtures/s10-Skeleton.zip'
const client = new Client({ name: 'smoke', version: '0' })
await client.connect(new StdioClientTransport({ command: 'npx', args: ['tsx', 'mcp/server.ts'], env: { ...process.env } as Record<string, string> }))
const text = (r: unknown) => ((r as { content: Array<{ type: string; text?: string }> }).content.find((c) => c.type === 'text')?.text ?? '')
const t0 = Date.now()
const loaded = JSON.parse(text(await client.callTool({ name: 'load', arguments: { zipPath: zip } })))
console.log('load', loaded.id, loaded.screens, 'screens', loaded.values, 'values', 'brand', loaded.baseline.brand, `${Date.now() - t0}ms`)
const set = JSON.parse(text(await client.callTool({ name: 'set', arguments: { id: loaded.id, knobs: { cPrimary: '#e11d48', radius: 1.5 } } })))
console.log('set  moved', set.moved, 'of', set.of, set.sample.slice(0, 3))
const patch = text(await client.callTool({ name: 'export', arguments: { id: loaded.id, format: 'patch' } }))
console.log('export patch', patch.split('\n').length, 'lines; first:', patch.split('\n').slice(0, 2).join(' | '))
const v = JSON.parse(text(await client.callTool({ name: 'verify', arguments: { id: loaded.id } })))
console.log('verify', v.ok, v.result.slice(0, 90), '|', v.reach)
const shot = (await client.callTool({ name: 'screenshot', arguments: { id: loaded.id, width: 1000 } })) as { content: Array<{ type: string; data?: string }> }
console.log('screenshot', shot.content[0]?.type, Math.round((shot.content[0]?.data?.length ?? 0) * 3 / 4 / 1024), 'KB', `${Date.now() - t0}ms total`)
await client.close()
