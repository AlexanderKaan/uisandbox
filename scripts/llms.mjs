#!/usr/bin/env node
/**
 * `public/llms-full.txt` = the agent preamble + the README, assembled.
 *
 * It used to be a hand-kept copy of the README, and it drifted: three days
 * after the copy pass it still carried "Honest by construction", "measured,
 * not felt" and "free forever" — in the one file written specifically for a
 * machine to read and repeat. One source, no mirror.
 *
 *   node scripts/llms.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pre = readFileSync(join(root, 'scripts/llms-preamble.md'), 'utf8').trimEnd()
// The README's badges and centred HTML are markup for GitHub, not prose for a
// reader; everything from the first `##` is the part worth repeating.
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const body = readme.slice(readme.indexOf('\n## '))
const out = `${pre}\n${body.trimEnd()}\n`
writeFileSync(join(root, 'public/llms-full.txt'), out)
console.log(`public/llms-full.txt · ${out.split('\n').length} lines`)
