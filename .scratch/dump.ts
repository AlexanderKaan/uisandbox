import { buildTokens } from '../src/tokens/buildTokens'
import { DEFAULT_CONFIG } from '../src/tokens/defaults'
const t = buildTokens(DEFAULT_CONFIG).vars
const keys = Object.keys(t)
console.log(keys.length)
console.log(JSON.stringify(DEFAULT_CONFIG))
for (const k of keys) console.log(k, '=', t[k])
