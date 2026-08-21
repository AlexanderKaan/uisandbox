import { rewriteCss } from '../src/sandbox/rewrite'
import { SubstitutionTable } from '../src/sandbox/table'
const css = `.a{font-family:"Lucida Grande","Lucida Sans Unicode",Helvetica,Arial,sans-serif!important}
.b{background-image: linear-gradient(top, #333333, #222222);}
.c{background-image: -webkit-linear-gradient(top, #333, #222);background-image: linear-gradient(top, #333, #222);}`
const t = new SubstitutionTable(); console.log(rewriteCss(css, t, 'x.css'))
for (const e of t.entries) console.log(e.id, e.kind, JSON.stringify(e.value))
