import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from 'playwright'
const client = new Client({ name: 'v', version: '0' })
await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp/dist/server.mjs'], env: { ...process.env } as Record<string, string> }))
const text = (r: any) => r.content.find((c: any) => c.type === 'text')?.text ?? ''
const loaded = JSON.parse(text(await client.callTool({ name: 'load', arguments: { zipPath: 'fixtures/s10-Skeleton.zip' } })))
await client.callTool({ name: 'set', arguments: { id: loaded.id, knobs: { cPrimary: '#e11d48', radius: 1.5 } } })
const opened = JSON.parse(text(await client.callTool({ name: 'open', arguments: { id: loaded.id } })))
console.log('open url', opened.opened.slice(0, 120), 'len', opened.opened.length)
const b = await chromium.launch(); const p = await b.newPage()
p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 300)) })
p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)))
await p.goto(opened.opened, { waitUntil: 'domcontentloaded' })
try { await p.waitForSelector('.stage__foot', { timeout: 40000 }); console.log('loaded ok') } catch { console.log('NOT loaded; body:', (await p.evaluate(() => document.body.innerText)).slice(0, 500)) }
await b.close(); await client.close()
