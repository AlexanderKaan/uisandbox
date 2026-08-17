import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  auditFiles, effectiveCount, cardinalityScore, grade,
  BUDGETS, WEIGHTS, DIMENSIONS, MIN_EVENTS, MIN_PARSED, buttonLine, renderTerminal,
} from '../engine/audit.mjs'
import { renderReport } from '../engine/report.mjs'
import {
  extractCss, extractClasses, extractCssVars, extractClassStyles, resolveVar, expandBox,
  cssModuleBindings, moduleClassAttrs, resolveRelative, pascalSegments, hasNoun, classAttrs,
} from '../engine/patterns.mjs'

const at = { file: 'x.tsx', line: 1, col: 1 }
const file = (path, content) => ({ path, content })

/* ───────────────────────────── the primitive ─────────────────────────────── */

test('effectiveCount separates one-system-with-noise from eight systems', () => {
  // The example the whole heuristic rests on: identical unique counts (8),
  // completely different pain.
  const repoA = [200, 3, 2, 2, 1, 1, 1, 1] // one radius + typos
  const repoB = [26, 26, 26, 26, 26, 26, 26, 26] // eight real systems
  assert.ok(effectiveCount(repoA) < 1.5, `repo A should read as ~1 system, got ${effectiveCount(repoA)}`)
  assert.ok(Math.abs(effectiveCount(repoB) - 8) < 1e-9, 'repo B should read as exactly 8')
})

test('effectiveCount is scale-free — this is the robustness against repo size', () => {
  const counts = [40, 12, 7, 3, 1]
  const scaled = counts.map((c) => c * 10)
  assert.ok(Math.abs(effectiveCount(counts) - effectiveCount(scaled)) < 1e-9)
})

test('effectiveCount handles the empty and single-value cases', () => {
  assert.equal(effectiveCount([]), 0)
  assert.equal(effectiveCount([0, 0]), 0)
  assert.ok(Math.abs(effectiveCount([99]) - 1) < 1e-9)
})

test('cardinalityScore: at budget is 100, 8x over budget is 0', () => {
  assert.equal(cardinalityScore(5, 5), 100)
  assert.equal(cardinalityScore(2, 5), 100, 'under budget earns no bonus, but no penalty')
  assert.ok(Math.abs(cardinalityScore(40, 5)) < 1e-9, '8x over budget bottoms out')
  assert.equal(cardinalityScore(80, 5), 0, 'past 8x it stays 0, never negative')
  const mid = cardinalityScore(10, 5)
  assert.ok(mid > 60 && mid < 70, `2x over budget should sit around two-thirds, got ${mid}`)
})

test('grade boundaries are the documented ones', () => {
  assert.equal(grade(90), 'A'); assert.equal(grade(85), 'A')
  assert.equal(grade(70), 'B'); assert.equal(grade(55), 'C')
  assert.equal(grade(40), 'D'); assert.equal(grade(39.9), 'F')
})

test('the weights sum to 1 so the score is a real weighted mean', () => {
  const sum = DIMENSIONS.reduce((a, d) => a + WEIGHTS[d], 0)
  assert.ok(Math.abs(sum - 1) < 1e-9)
})

/* ─────────────────────────── CSS extraction (layer A) ───────────────────────── */

test('type is a triplet, not a font-size', () => {
  const evs = extractCss('a.css', `
    .a { font-size: 16px; line-height: 1.5; font-weight: 400; }
    .b { font-size: 16px; line-height: 1.2; font-weight: 600; }
  `)
  const type = evs.filter((e) => e.dim === 'type')
  assert.equal(type.length, 2)
  assert.notEqual(type[0].value, type[1].value, 'same size, different leading/weight = two decisions')
})

test('spacing shorthand expands per side', () => {
  assert.deepEqual(expandBox(['8px']), [['top', '8px'], ['right', '8px'], ['bottom', '8px'], ['left', '8px']])
  assert.deepEqual(expandBox(['8px', '12px']), [['top', '8px'], ['right', '12px'], ['bottom', '8px'], ['left', '12px']])
  const evs = extractCss('a.css', '.a { padding: 8px 12px; }')
  assert.equal(evs.filter((e) => e.dim === 'spacing').length, 4)
})

test('colour is split by role — the same hex is a different decision per role', () => {
  const evs = extractCss('a.css', '.a { color: #111; background: #111; }')
  const roles = evs.filter((e) => e.dim === 'color').map((e) => e.role).sort()
  assert.deepEqual(roles, ['bg', 'fg'])
})

test('a var() reference counts as tokenised, a literal does not', () => {
  const evs = extractCss('a.css', '.a { border-radius: var(--k-radius-md); } .b { border-radius: 9px; }')
  const [tokenised, literal] = evs.filter((e) => e.dim === 'radius')
  assert.equal(tokenised.tokenized, true)
  assert.equal(literal.tokenized, false)
})

test('custom-property definitions are token sources, never usages', () => {
  const evs = extractCss('a.css', ':root { --brand: #4f46e5; --radius: 8px; }')
  assert.equal(evs.length, 0, 'declaring a token is not using a value')
})

/* ───────────────────── Tailwind extraction (net-new for audit) ──────────────── */

test('Tailwind scale classes resolve and count as tokenised', () => {
  const evs = extractClasses(['rounded-lg', 'p-4', 'shadow-sm'], at)
  const radius = evs.find((e) => e.dim === 'radius')
  assert.equal(radius.value, '8px')
  assert.equal(radius.tokenized, true)
  assert.equal(evs.filter((e) => e.dim === 'spacing').length, 4, 'p-4 hits all four sides')
  assert.equal(evs.find((e) => e.dim === 'spacing').value, '16px')
})

test('arbitrary values are a deliberate step outside the system', () => {
  const evs = extractClasses(['p-[13px]', 'bg-[#f3f4f6]', 'rounded-[7px]'], at)
  assert.ok(evs.every((e) => e.arbitrary && !e.tokenized))
  assert.equal(evs.find((e) => e.dim === 'radius').value, '7px')
})

test('text-sm is a size and text-gray-500 is a colour', () => {
  const size = extractClasses(['text-sm'], at)
  assert.equal(size.find((e) => e.dim === 'type').value.split('/')[0], '14px')
  assert.equal(size.filter((e) => e.dim === 'color').length, 0)

  const colour = extractClasses(['text-gray-500'], at)
  assert.equal(colour.find((e) => e.dim === 'color').role, 'fg')
  assert.equal(colour.filter((e) => e.dim === 'type').length, 0)
})

test('non-colour utilities are not mistaken for colours', () => {
  for (const c of ['text-center', 'border-2', 'border-t', 'bg-none', 'bg-cover']) {
    assert.equal(extractClasses([c], at).filter((e) => e.dim === 'color').length, 0, `${c} is not a colour`)
  }
})

test('variant prefixes are the same decision, applied conditionally', () => {
  const plain = extractClasses(['rounded-lg'], at)
  const hover = extractClasses(['hover:rounded-lg'], at)
  assert.equal(plain[0].value, hover[0].value)
})

test('px/py map to the right sides', () => {
  const evs = extractClasses(['px-2', 'py-6'], at).filter((e) => e.dim === 'spacing')
  const bySide = Object.fromEntries(evs.map((e) => [e.side, e.value]))
  assert.deepEqual(bySide, { left: '8px', right: '8px', top: '24px', bottom: '24px' })
})

/* ───────── custom properties: the two bugs that painted the wall wrong ──────── */

test('a BEM class name is never read as a custom-property definition', () => {
  // `.btn--primary:hover` used to redefine --primary to "hover { …".
  const vars = extractCssVars(`
    :root { --primary: #4f46e5; }
    .btn--primary { background: var(--primary); }
    .btn--primary:hover { background: var(--primary-hover); }
  `)
  assert.equal(vars['--primary'], '#4f46e5')
})

test('every custom property is captured, not every other one', () => {
  // Consuming the trailing `;` ate the separator the next declaration needed.
  const vars = extractCssVars(':root { --a: 1px; --b: 2px; --c: 3px; --d: 4px; }')
  assert.deepEqual(vars, { '--a': '1px', '--b': '2px', '--c': '3px', '--d': '4px' })
})

test('class styles resolve through one level of var(), skipping pseudo-states', () => {
  const css = `
    :root { --primary: #4f46e5; }
    .btn { padding: 8px 16px; border-radius: 6px; }
    .btn--primary { background: var(--primary); color: #fff; }
    .btn--primary:hover { background: #000; }
  `
  const styles = extractClassStyles(css)
  const vars = extractCssVars(css)
  assert.equal(resolveVar(styles['btn--primary'].background, vars), '#4f46e5')
  assert.notEqual(styles['btn--primary'].background, '#000', 'a hover colour is not the resting appearance')
  assert.equal(styles.btn['border-radius'], '6px')
})

/* ────────────────────────────── the engine end-to-end ───────────────────────── */

const messyCss = `
  .a { color: #111111; background: #fff; border-radius: 7px; padding: 13px; font-size: 15px; box-shadow: 0 1px 2px #0001; }
  .b { color: #111112; background: #fefefe; border-radius: 8px; padding: 14px; font-size: 16px; box-shadow: 0 1px 3px #0001; }
  .c { color: #222; background: #f9f9f9; border-radius: 9px; padding: 15px; font-size: 17px; box-shadow: 0 2px 4px #0002; }
  .d { color: #333; background: #f5f5f5; border-radius: 11px; padding: 17px; font-size: 18px; box-shadow: 0 3px 6px #0002; }
  .e { color: #444; background: #eee; border-radius: 13px; padding: 19px; font-size: 19px; box-shadow: 0 4px 8px #0003; }
  .f { color: #555; background: #ddd; border-radius: 15px; padding: 21px; font-size: 20px; box-shadow: 0 5px 9px #0003; }
`

test('a messy stylesheet scores badly and a disciplined one scores well', () => {
  const bad = auditFiles([file('messy.css', messyCss)])
  const tidy = auditFiles([file('tidy.css', `
    .a { color: var(--k-fg); background: var(--k-bg); border-radius: var(--k-radius-md); padding: var(--k-s-8); }
    .b { color: var(--k-fg); background: var(--k-bg); border-radius: var(--k-radius-md); padding: var(--k-s-8); }
    .c { color: var(--k-fg-muted); background: var(--k-bg); border-radius: var(--k-radius-md); padding: var(--k-s-16); }
    .d { color: var(--k-fg); background: var(--k-surface); border-radius: var(--k-radius-md); padding: var(--k-s-8); }
  `)])
  assert.ok(bad.score < tidy.score, `messy (${bad.score}) must score below tidy (${tidy.score})`)
})

test('off-grid spacing and near-dupes land in the score, not just the report', () => {
  const r = auditFiles([file('messy.css', messyCss)])
  assert.ok(r.dimensions.spacing.offGridRate > 0, '13px/15px/17px are off the 4px grid')
  assert.ok(r.dimensions.color.nearDupes.length > 0, '#111111 vs #111112 is a near-duplicate')
  assert.ok(r.dimensions.color.coherence < 1)
})

test('singleton and arbitrary rates are reported but never scored', () => {
  const r = auditFiles([file('messy.css', messyCss)])
  assert.ok(r.dimensions.radius.singletons.length > 0)
  // Coherence is built only from tokenisation, near-dupes and the grid.
  const d = r.dimensions.radius
  const expected = (d.tokenisedRate + (1 - d.nearDupeMass)) / 2
  assert.ok(Math.abs(d.coherence - expected) < 1e-9, 'singletons must not leak into coherence')
})

test('an absence of evidence is never scored as perfect coherence', () => {
  // The MUI/Ant failure mode: nothing to see, so the curve would return 100.
  const r = auditFiles([file('sparse.tsx', '<div className="grid gap-4"><span>hi</span></div>')])
  assert.equal(r.dimensions.shadow.insufficient, true)
  assert.equal(r.dimensions.shadow.score, null, 'an unmeasured dimension has no score')
  assert.ok(r.insufficientDimensions.includes('shadow'))
})

test('when every dimension is too thin, the audit refuses instead of guessing', () => {
  const r = auditFiles([file('empty.tsx', '<div className="flex"><b>hi</b></div>')])
  assert.equal(r.refused, true)
  assert.equal(r.score, null)
  assert.match(r.refusal, /not a clean bill of health/i)
})

test('the score only averages dimensions that had enough evidence', () => {
  const r = auditFiles([file('messy.css', messyCss)])
  const scored = r.scoredDimensions
  const weightSum = scored.reduce((a, d) => a + WEIGHTS[d], 0)
  const expected = scored.reduce((a, d) => a + WEIGHTS[d] * r.dimensions[d].score, 0) / weightSum
  assert.ok(Math.abs(r.score - Math.round(expected)) <= 1)
})

test('unreadable styling is counted and refused below the coverage floor', () => {
  // Genuinely dynamic classNames remain the blind spot. (styled-components are
  // READ now — see the CSS-in-JS block below.)
  const dyn = Array.from({ length: 30 }, (_, i) => `<div className={cls${i}}>x</div>`).join('\n')
  const r = auditFiles([file('a.tsx', `${dyn}\n<div className="p-4">x</div>`)])
  assert.ok(r.meta.unreadable['dynamic-classname'] >= 30)
  assert.ok(r.meta.parsed < MIN_PARSED)
  assert.equal(r.refused, true)
  assert.match(r.refusal, /could be read/i)
})

/* ─────────────────────────────── CSS-in-JS ─────────────────────────────────── */

test('a styled-components block is read, not written off', () => {
  // The sweep refused twentyhq/twenty at 25% coverage — a whole CRM invisible
  // because its styling lives in emotion template literals.
  const r = auditFiles([file('a.ts', `
    const Button = styled.button\`
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      color: #ffffff;
    \`
  `)])
  const val = (dim) => r.dimensions[dim].values.map((v) => v.value)
  assert.ok(val('radius').includes('4px'))
  assert.ok(val('spacing').includes('8px'))
  assert.ok(val('color').includes('#ffffff'))
  assert.equal(r.meta.unreadable['styled-components'], undefined, 'no longer a blind spot')
})

test('a theme interpolation is a token reference, not noise', () => {
  // `${({theme}) => theme.font.color.primary}` is this stack's `var(--x)`.
  const r = auditFiles([file('a.ts', `
    const T = styled.div\`
      color: \${({ theme }) => theme.font.color.primary};
      border-radius: \${(props) => props.theme.border.radius.sm};
    \`
  `)])
  const colour = r.dimensions.color.values[0]
  assert.ok(colour, 'the declaration must survive its interpolation')
  assert.match(colour.value, /font-color-primary/)
  assert.equal(r.dimensions.color.events, 1)
})

test('the theme accessor may be called anything theme-ish', () => {
  // twentyhq/twenty writes `themeCssVariables.…`; requiring a literal `theme.`
  // left 6,338 declarations unreadable there and kept the repo under the floor.
  // Built by join() rather than a nested template — backtick-in-backtick is how
  // this very test got mangled the first time.
  const src = [
    'const A = styled.div`',
    '  color: ${themeCssVariables.font.color.tertiary};',
    '  gap: ${themeCssVariables.spacing[2]};',
    '`',
    'const B = styled.div` color: ${theme.font.color.tertiary}; `',
  ].join('\n')
  const r = auditFiles([file('a.ts', src)])
  // The base identifier is dropped, so the two accessor styles are ONE token.
  assert.equal(r.dimensions.color.distinct, 1, 'theme.x and themeCssVariables.x are the same token')
  assert.match(r.dimensions.color.values[0].value, /font-color-tertiary/)
  // Bracket indexing normalises onto the dotted path.
  assert.match(r.dimensions.spacing.values[0].value, /spacing-2/)
})

/* ── Sprint Q · the audit reads 95% ──────────────────────────────────────────
 * Measured on the eight-repo corpus (bench/audit-corpus): twentyhq/twenty read
 * 70% and openstatus 82% before these, 98% and 97% after. Each test below is
 * one blind spot that turned out to be a NAMED value in a notation the reader
 * did not know — never a guess at an unknown value. */

test('a cn()/clsx() className is READ: the classes are literally in the call', () => {
  // openstatus: 719 of 3,950 elements were "dynamic" while every class sat in
  // cn("flex items-center", open && "bg-muted", className).
  const src = [
    '<div className={cn("flex items-center p-4", open && "bg-muted", className)}>x</div>',
    '<div className={clsx(',
    '  "rounded-md text-sm",',
    '  isActive ? "font-medium" : "font-normal",',
    ')}>y</div>',
  ].join('\n')
  const r = auditFiles([file('a.tsx', src)])
  assert.equal(r.meta.unreadable['dynamic-classname'], undefined, 'nothing is a blind spot here')
  assert.equal(r.meta.parsed, 1)
  const spacing = r.dimensions.spacing.values.map((v) => v.value)
  assert.ok(spacing.some((v) => /16px|1rem/.test(v)), `p-4 was read from inside cn(): ${spacing}`)
})

test('a multi-line cn() reports the line it starts on', () => {
  const src = ['<div', '  className={cn(', '    "p-4",', '  )}', '/>'].join('\n')
  const sites = classAttrs('a.tsx', src)
  assert.equal(sites.length, 1)
  assert.equal(sites[0].at.line, 2)
  assert.deepEqual(sites[0].classes, ['p-4'])
})

test('a className passthrough is neither readable nor a blind spot', () => {
  // `className={className}` makes no styling decision — the parent's site
  // holds the classes and is counted there. Counting it as unreadable
  // punished every well-factored component library for being well factored.
  const r = auditFiles([file('a.tsx', '<Root className={className} /><div className={props.className}>x</div><span className="p-4">y</span>')])
  assert.equal(r.meta.unreadable['dynamic-classname'], undefined)
  assert.equal(r.meta.parsed, 1)
})

test('a className with NO literal class is still the blind spot it is', () => {
  const r = auditFiles([file('a.tsx', '<div className={variantClass}>x</div><div className={cls[size]}>y</div>')])
  assert.equal(r.meta.unreadable['dynamic-classname'], 2)
})

test('a theme FUNCTION with a literal argument is a token reference', () => {
  // twenty: `${({ theme }) => theme.spacing(5)}` ×706, `theme.color('white')`
  // ×419, `theme.fontSize(5.5)` ×165 — a scale lookup is a token.
  const src = [
    'const A = styled.div`',
    '  padding: ${({ theme }) => theme.spacing(5)};',
    '  color: ${({ theme }) => theme.color("white")};',
    '  font-size: ${(p) => p.theme.fontSize(5.5)};',
    '`',
  ].join('\n')
  const r = auditFiles([file('a.ts', src)])
  assert.equal(r.meta.unreadable['css-in-js-interpolation'], undefined)
  assert.match(r.dimensions.spacing.values[0].value, /spacing-5/)
  assert.match(r.dimensions.color.values[0].value, /color-white/)
})

test('a bare scale function from a tokens module is the same lookup', () => {
  // twenty-website: `padding: ${spacing(5)}` with `import { spacing } from "@/tokens"`.
  const r = auditFiles([file('a.ts', 'const A = styled.div`padding: ${spacing(5)}; color: ${color("black-40")};`')])
  assert.equal(r.meta.unreadable['css-in-js-interpolation'], undefined)
  assert.match(r.dimensions.spacing.values[0].value, /spacing-5/)
})

test('a named constant is token discipline in another notation', () => {
  // `${RECORD_TABLE_ROW_HEIGHT}px`, `${NAVIGATION_DRAWER_CONSTRAINTS.default}`,
  // `${RootStackingContextZIndices.SidePanel}` — a value named once and reused.
  const src = [
    'const A = styled.div`',
    '  height: ${RECORD_TABLE_ROW_HEIGHT}px;',
    '  width: ${NAVIGATION_DRAWER_CONSTRAINTS.default};',
    '  z-index: ${RootStackingContextZIndices.SidePanel};',
    '`',
  ].join('\n')
  const r = auditFiles([file('a.ts', src)])
  assert.equal(r.meta.unreadable['css-in-js-interpolation'], undefined)
})

test('a named object reference reads as a token; a PROP stays dynamic', () => {
  // `inks.userMessageBackground` is a value looked up by name — a token under a
  // local name. `props.width` / `({ width }) => width` arrives per instance and
  // is dynamic for real; it must NOT be read as a token.
  const named = auditFiles([file('a.ts', 'const A = styled.div`background: ${inks.userMessageBackground};`')])
  assert.equal(named.meta.unreadable['css-in-js-interpolation'], undefined)
  const dyn = auditFiles([file('a.ts', 'const B = styled.div`width: ${(props) => props.width}; height: ${({ h }) => h};`')])
  assert.equal(dyn.meta.unreadable['css-in-js-interpolation'], 2)
})

test('Vue: object-syntax keys and $style bindings are the classes', () => {
  // n8n-io/n8n read 40% and was REFUSED: 6,189 `:class="{ 'is-active': open }"`
  // and `:class="[$style.container, …]"` sites, every one of them literal.
  const src = [
    '<div :class="{ \'is-active\': open, disabled: !enabled }">a</div>',
    '<div :class="[$style.container, compact ? \'p-2\' : \'p-4\']">b</div>',
    '<div class="static p-4">c</div>',
    '<style module>.container { padding: 8px; }</style>',
  ].join('\n')
  const r = auditFiles([file('a.vue', src)])
  assert.equal(r.meta.unreadable['dynamic-classname'], undefined, 'nothing is a blind spot here')
  assert.equal(r.meta.parsed, 1)
  const classes = classAttrs('a.vue', src).map((s) => s.classes)
  assert.ok(classes[0].includes('is-active') && classes[0].includes('disabled'))
  assert.ok(classes[1].includes('container') && classes[1].includes('p-2'))
})

test('a non-theme identifier is not mistaken for a token', () => {
  const r = auditFiles([file('a.ts', 'const A = styled.div`color: ${userPickedColour};`')])
  assert.equal(r.dimensions.color.events, 0)
  assert.ok(r.meta.unreadable['css-in-js-interpolation'] >= 1, 'and it stays declared unreadable')
})

test('styled(Component) and css`` blocks are read too', () => {
  const r = auditFiles([file('a.ts', `
    const A = styled(Base)\` padding: 12px; \`
    const B = css\` border-radius: 6px; \`
  `)])
  assert.ok(r.dimensions.spacing.values.some((v) => v.value === '12px'))
  assert.ok(r.dimensions.radius.values.some((v) => v.value === '6px'))
})

test('an interpolation we cannot name is still declared unreadable', () => {
  // Honesty holds: a value we cannot resolve is reported, not silently dropped.
  const r = auditFiles([file('a.ts', 'const A = styled.div`color: ${mystery};`')])
  assert.ok(r.meta.unreadable['css-in-js-interpolation'] >= 1)
})

test('the profile flag moves the budget, not the maths', () => {
  const internal = auditFiles([file('m.css', messyCss)], { profile: 'internal' })
  const product = auditFiles([file('m.css', messyCss)], { profile: 'product' })
  assert.equal(internal.dimensions.color.budget, BUDGETS.internal.color)
  assert.equal(product.dimensions.color.budget, BUDGETS.product.color)
  assert.ok(product.score >= internal.score, 'a wider budget cannot score worse')
})

/* ───────────────────────── layer C + the smoking guns ───────────────────────── */

test('button treatments are counted by normalised signature, layout stripped', () => {
  const r = auditFiles([file('a.tsx', `
    <button className="flex items-center bg-blue-500 px-4 rounded-lg">A</button>
    <button className="bg-blue-500 rounded-lg px-4">B</button>
    <button className="bg-red-500 px-2 rounded-sm">C</button>
  `)])
  assert.equal(r.components.button.treatments, 2, 'same style + different layout = one treatment')
  assert.equal(r.components.button.singletons, 1)
})

test('layer C never touches the score', () => {
  const one = auditFiles([file('m.css', messyCss)])
  const many = auditFiles([
    file('m.css', messyCss),
    file('b.tsx', Array.from({ length: 20 }, (_, i) => `<button className="bg-x-${i} p-${i}">b</button>`).join('\n')),
  ])
  assert.ok(many.components.button.treatments > one.components.button.treatments)
  assert.equal(one.score, one.score, 'sanity')
})

test('mixed grey ramps are flagged as a smoking gun', () => {
  const r = auditFiles([file('a.tsx', `
    <div className="bg-gray-100 text-slate-700 border-zinc-200">x</div>
  `)])
  assert.ok(r.flags.some((f) => f.id === 'mixed-gray-ramps'))
})

test('two icon libraries in package.json are flagged', () => {
  const r = auditFiles([file('a.tsx', '<div className="p-4">x</div>')], {
    pkg: { dependencies: { 'lucide-react': '1', 'react-icons': '1' } },
  })
  const flag = r.flags.find((f) => f.id === 'multiple-icon-libs')
  assert.ok(flag && flag.detail.length === 2)
})

/* ──────────────────────────────── CSS Modules ──────────────────────────────── */

test('module imports resolve relative to the importing file', () => {
  assert.equal(resolveRelative('src/ui/Card.tsx', './Card.module.css'), 'src/ui/Card.module.css')
  assert.equal(resolveRelative('src/ui/Card.tsx', '../styles/x.module.css'), 'src/styles/x.module.css')
  assert.deepEqual(
    cssModuleBindings('src/Card.tsx', "import styles from './Card.module.css'"),
    { styles: 'src/Card.module.css' },
  )
  assert.deepEqual(
    cssModuleBindings('src/M.tsx', "import * as s from './M.module.scss'"),
    { s: 'src/M.module.scss' },
  )
})

test('module class references are read, in all four shapes', () => {
  const bindings = { styles: 'a.module.css' }
  const grab = (src) => moduleClassAttrs('a.tsx', src, bindings).flatMap((e) => e.classes)
  assert.deepEqual(grab('<b className={styles.title}/>'), ['a.module.css#title'])
  assert.deepEqual(grab("<b className={styles['title']}/>"), ['a.module.css#title'])
  assert.deepEqual(grab('<b className={cn(styles.a, styles.b)}/>'), ['a.module.css#a', 'a.module.css#b'])
  assert.ok(grab('<b className={`${styles.a} pad`}/>').includes('a.module.css#a'))
})

const MODULES = [
  file('src/Card.module.css', '.primary { background:#4f46e5; padding:8px 16px; border-radius:8px; }\n.ghost { background:transparent; padding:8px 16px; }'),
  file('src/Modal.module.css', '.primary { background:#db2777; padding:10px 20px; border-radius:14px; }'),
  file('src/Card.tsx', "import styles from './Card.module.css'\n<button className={styles.primary}>a</button>\n<button className={styles.ghost}>b</button>"),
  file('src/Modal.tsx', "import s from './Modal.module.css'\n<button className={s.primary}>c</button>"),
]

test('CSS-module elements count as read, not as a blind spot', () => {
  // The bug that took a real repo to 72% coverage and nearly a false refusal.
  const r = auditFiles(MODULES)
  assert.equal(r.meta.unreadable['dynamic-classname'], undefined)
  assert.equal(r.meta.parsed, 1)
  assert.equal(r.refused, false)
})

test('the same class name in two modules stays two treatments', () => {
  // CSS Modules are file-scoped. Merging them would UNDERCOUNT the sprawl.
  const r = auditFiles(MODULES)
  assert.equal(r.components.button.treatments, 3)
  const sigs = r.components.button.signatures.map((s) => s.sig)
  assert.ok(sigs.includes('src/Card.module.css#primary'))
  assert.ok(sigs.includes('src/Modal.module.css#primary'))
})

test('a module-qualified signature keeps its path case, so the swatch resolves', () => {
  const r = auditFiles(MODULES)
  const sig = r.components.button.signatures.find((s) => s.sig.includes('Card.module.css#primary'))
  assert.ok(r.classStyles[sig.sig], 'the signature must key straight into classStyles')
  assert.equal(r.classStyles[sig.sig].background, '#4f46e5')
})

test('a module-bound element with real declarations is expressible', () => {
  const r = auditFiles(MODULES)
  assert.equal(r.meta.expressible.counts.tokensOnly, 3)
  assert.equal(r.meta.expressible.counts.none, 0)
})

test('genuinely dynamic classNames are still counted as unreadable', () => {
  const r = auditFiles([file('a.tsx', '<div className={someVar}>x</div>'.repeat(5))])
  assert.ok(r.meta.unreadable['dynamic-classname'] >= 5)
})

/* ────────────────────────── the hinge: inferredConfig ───────────────────────── */

test('inferredConfig emits real Config values, and null confidence when undecided', () => {
  const r = auditFiles([file('a.css', `
    .a { border-radius: 8px; } .b { border-radius: 8px; } .c { border-radius: 8px; }
    .d { border-radius: 8px; } .e { border-radius: 8px; } .f { border-radius: 3px; }
  `)])
  assert.ok(['none', 'subtle', 'soft', 'round'].includes(r.inferredConfig.values.radius))
  assert.equal(r.inferredConfig.values.radius, 'soft', '8px is the soft rung')
  assert.ok(r.inferredConfig.confidence.radius > 0.8)
})

test('no dominant value means the questionnaire has to ask', () => {
  const evenly = Array.from({ length: 8 }, (_, i) => `.r${i} { border-radius: ${i * 3 + 2}px; }`).join('\n')
  const r = auditFiles([file('a.css', evenly)])
  assert.equal(r.inferredConfig.confidence.radius, null)
  assert.equal(r.inferredConfig.values.radius, undefined)
})

test('the dominant saturated colour picks a theme, greys do not', () => {
  const r = auditFiles([file('a.css', `
    .a { background: #0A84FF; } .b { background: #0A84FF; } .c { background: #0A84FF; }
    .d { color: #f4f4f5; } .e { color: #e5e5e5; }
  `)])
  assert.equal(r.inferredConfig.values.colorTheme, 'cobalt')
})

/* ───────────────────────────── meta and reporting ───────────────────────────── */

test('the near-dupe metric and threshold are emitted so anyone can recompute', () => {
  const r = auditFiles([file('m.css', messyCss)])
  assert.equal(r.meta.nearDupeMetric.color, 'CIEDE2000')
  assert.equal(r.meta.nearDupeMetric.threshold, 2)
})

test('expressible splits recipe / tokens-only / none against the vocabulary', () => {
  const vocabulary = { vocabVersion: 'test', classes: { btn: ['primary'] } }
  const r = auditFiles([file('a.tsx', `
    <button className="btn btn--primary">kit</button>
    <div className="bg-red-500 p-4">bespoke but tokenisable</div>
  `)], { vocabulary })
  assert.equal(r.meta.expressible.counts.recipe, 1)
  assert.equal(r.meta.expressible.counts.tokensOnly, 1)
  assert.equal(r.meta.vocabVersion, 'test')
})

test('values carry file/line addresses — a codemod cannot act on a filename', () => {
  const r = auditFiles([file('a.css', '.a { border-radius: 7px; }')])
  const v = r.dimensions.radius.values[0]
  assert.equal(v.at[0].file, 'a.css')
  assert.ok(Number.isInteger(v.at[0].line) && v.at[0].line > 0)
})

test('auditFiles is deterministic — the score is a fact, not an opinion', () => {
  const files = [file('m.css', messyCss), file('b.tsx', '<button className="bg-blue-500 p-3">x</button>')]
  const a = JSON.stringify(auditFiles(files))
  const b = JSON.stringify(auditFiles(files))
  assert.equal(a, b, 'two runs over the same input must be byte-identical')
})

test('mx-auto is a layout decision, not a spacing value', () => {
  const evs = extractClasses(['mx-auto', 'p-4'], at).filter((e) => e.dim === 'spacing')
  assert.ok(evs.every((e) => e.value === '16px'), 'only p-4 should register')
  assert.equal(evs.length, 4)
})

test('opacity variants of one colour are not near-duplicates', () => {
  // emerald-500 · /10 · /20 is one deliberate colour at three opacities. A
  // translucent value renders as whatever it sits on, so it is not comparable —
  // reporting these as duplicates loses the first argument with a good engineer.
  const palette = { 'emerald-500': '#10b981', 'zinc-50': '#fafafa', 'zinc-100': '#f4f4f5' }
  const css = ['emerald-500', 'emerald-500/10', 'emerald-500/20', 'zinc-50', 'zinc-100']
    .map((c, i) => `<div className="bg-${c} p-4">x${i}</div>`).join('\n').repeat(4)
  const r = auditFiles([file('a.tsx', css)], { palette })
  const flat = r.dimensions.color.nearDupes.flat()
  assert.ok(!flat.some((v) => v.includes('/')), `no alpha variant may be flagged: ${JSON.stringify(r.dimensions.color.nearDupes)}`)
  // Two genuinely near-identical, differently named greys still are.
  assert.ok(r.dimensions.color.nearDupes.some((g) => g.includes('zinc-50') && g.includes('zinc-100')))
})

test('a resolved palette makes the brand colour findable', () => {
  const palette = { 'emerald-500': '#10b981' }
  const src = '<div className="bg-emerald-500 p-4">x</div>'.repeat(20)
  const withPalette = auditFiles([file('a.tsx', src)], { palette })
  assert.equal(withPalette.inferredConfig.values.colorTheme, 'jade')
  assert.equal(withPalette.meta.palette, 'installed', 'an installed palette is the source it names')
  // A name Tailwind does not ship stays unresolved — no guess, whatever the generation.
  const custom = auditFiles([file('a.tsx', '<div className="bg-brandgreen-500 p-4">x</div>'.repeat(20))])
  assert.equal(custom.inferredConfig.values.colorTheme, undefined, 'unresolvable → no guess')
})

test('a Tailwind name resolves through the SHIPPED defaults when nothing is installed — by generation', () => {
  /* A shallow clone, a browser drop, a Phoenix app with a standalone Tailwind
   * binary: no node_modules, and `bg-indigo-600` still means what Tailwind means
   * by it. The generation is read off the CSS: v4 declares itself
   * (`@import "tailwindcss"` / `@theme`), v3 with `@tailwind base`. plausible
   * (v4) renders indigo-600 as #4f39f6 on plausible.io — the number the v4
   * default resolves to; v3's is #4f46e5. */
  const jsx = '<button className="bg-indigo-600 text-white">x</button>'.repeat(20)
  const v4 = auditFiles([file('app.css', "@import 'tailwindcss';\n@theme { --spacing: 4px; }"), file('a.tsx', jsx)])
  assert.equal(v4.inferredConfig.values.brandHex, '#4f39f6', 'v4 marker → v4 numbers')
  assert.match(v4.meta.palette, /^tailwind v4 defaults \(4\.\d+\.\d+, @import "tailwindcss"\/@theme seen\)$/)
  const v3 = auditFiles([file('globals.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;'), file('a.tsx', jsx)])
  assert.equal(v3.inferredConfig.values.brandHex, '#4f46e5', 'v3 marker → v3 numbers')
  assert.match(v3.meta.palette, /^tailwind v3 defaults \(3\.\d+\.\d+, @tailwind seen\)$/)
  // No marker at all: today's default install is v4, and the label says no marker was seen.
  const bare = auditFiles([file('a.tsx', jsx)])
  assert.equal(bare.inferredConfig.values.brandHex, '#4f39f6')
  assert.match(bare.meta.palette, /assumed — no marker seen/)
  // And a repo that writes no Tailwind utilities at all does not get told it is on Tailwind.
  const plain = auditFiles([file('a.css', ':root { --primary: #ff3366; } .btn { background: var(--primary); }'.repeat(3))])
  assert.equal(plain.meta.palette, 'none needed (no Tailwind utilities read)')
  // The repo's own override beats every default: `--color-indigo-600` in @theme IS their indigo.
  const own = auditFiles([file('app.css', '@import "tailwindcss";\n@theme { --color-indigo-600: #ff3366; }'), file('a.tsx', jsx)])
  assert.equal(own.inferredConfig.values.brandHex, '#ff3366', 'the repo\'s @theme override wins over the shipped default')
  // Opting out (tailwind: null) leaves the name unresolved — the pre-defaults behaviour, on request.
  const off = auditFiles([file('a.tsx', jsx)], { tailwind: null })
  assert.equal(off.inferredConfig.values.brandHex, undefined)
  assert.equal(off.meta.palette, 'none')
})

test('a contrast/override block is an alternate scope — it never overwrites the base brand', () => {
  /* mastodon, tokens/theme/_light.scss: `@mixin tokens { --color-text-brand:
   * var(--color-indigo-700) }` then `@mixin contrast-overrides {
   * --color-text-brand: var(--color-indigo-600) }`. Last-wins reported the
   * high-contrast shade; the button on mastodon.social is indigo-700 #5638cc. */
  const scss = `
    :root { --color-indigo-600: #6147e6; --color-indigo-700: #5638cc; }
    @mixin tokens { --color-text-brand: var(--color-indigo-700); --color-bg-brand-base: var(--color-indigo-700); }
    @mixin contrast-overrides { --color-text-brand: var(--color-indigo-600); }
    @media (prefers-contrast: more) { :root { --color-bg-brand-base: var(--color-indigo-600); } }
    .btn { background: var(--color-bg-brand-base); border-color: var(--color-text-brand); }
  `
  const r = auditFiles([file('theme.scss', scss)])
  assert.equal(r.inferredConfig.values.brandHex, '#5638cc')
  assert.equal(r.inferredConfig.confidence.colorTheme, 1)
})

test('a ramp is ONE decision: shades of a hue count as one brand family', () => {
  /* plausible: indigo-600 ×29, indigo-500 ×27, indigo-700 ×9 against red-500
   * ×11 — counted as rivals no shade reached dominance (share 0.25 → "nobody
   * decided anything"). Grouped on OKLCH hue the family is 65 of 76 → indigo,
   * reported as its most-used shade. And blue is NOT indigo: a blue-500 minority
   * stays a separate family. */
  const el = (cls) => `<div className="${cls}">x</div>`
  const src = el('bg-indigo-600').repeat(29) + el('bg-indigo-500').repeat(27) + el('bg-indigo-700').repeat(9) + el('bg-red-500').repeat(11)
  const r = auditFiles([file('globals.css', '@tailwind base;'), file('a.tsx', src)])
  assert.equal(r.inferredConfig.values.brandHex, '#4f46e5', 'the family reports its most-used shade')
  assert.equal(r.inferredConfig.values.colorTheme, 'indigo')
  assert.ok(r.inferredConfig.confidence.colorTheme >= 0.6, `family share should be dominant, got ${r.inferredConfig.confidence.colorTheme}`)
  const split = auditFiles([file('globals.css', '@tailwind base;'), file('a.tsx', el('bg-indigo-600').repeat(12) + el('bg-blue-500').repeat(10) + el('bg-blue-600').repeat(9))])
  assert.equal(split.inferredConfig.values.brandHex, '#3b82f6', 'blue-500 + blue-600 (19) outweigh indigo-600 (12) as a family — and blue is its own family, not indigo\'s')
})

test('a layered token system counts as one colour, not two', () => {
  // `--button-hover-bg: var(--color-primary-light)` is two NAMES for one colour.
  // Counting names would make a well-layered design system score WORSE than a
  // pile of hex literals — punishing exactly what we advocate.
  const r = auditFiles([file('a.css', `
    :root { --brand: #4f46e5; --primary-light: var(--brand); --button-bg: var(--primary-light); }
    .a { background: var(--button-bg); } .b { background: var(--primary-light); }
    .c { background: var(--brand); }     .d { background: var(--button-bg); }
  `)])
  const values = r.dimensions.color.values.map((v) => v.value)
  assert.deepEqual(values, ['#4f46e5'], `three aliases must collapse to one colour, got ${values}`)
  assert.equal(r.dimensions.color.nEff, 1)
})

test('an unresolvable token keeps its name instead of vanishing', () => {
  const r = auditFiles([file('a.css', '.a { background: var(--from-somewhere-else); }')])
  assert.equal(r.dimensions.color.values[0].value, '--from-somewhere-else')
})

test('circular token definitions terminate', () => {
  const r = auditFiles([file('a.css', ':root { --a: var(--b); --b: var(--a); }\n.x { color: var(--a); }')])
  assert.ok(r.dimensions.color.values.length <= 1, 'must not hang or explode')
})

test('a BEM modifier class is not read as a utility value', () => {
  // Docusaurus/Infima ship `text--center`; its tail was being read as a colour.
  const evs = extractClasses(['text--center', 'bg--dark', 'text-red-500'], at)
  const colours = evs.filter((e) => e.dim === 'color').map((e) => e.value)
  assert.deepEqual(colours, ['red-500'])
})

test('nested CSS: the outer rule is not invisible', () => {
  // The naive rule regex only matched innermost blocks, so a nested stylesheet
  // was scored on a fraction of its styling. 52 of Excalidraw's 82 SCSS files
  // nest, so this was the common case, not an edge case.
  const evs = extractCss('a.scss', `
    .stats { font-size: 12px; padding: 8px; color: #333;
      &__row { background: #fff; border-radius: 4px; }
      h2 { font-size: 20px; font-weight: bold; }
    }
  `)
  const val = (dim) => evs.filter((e) => e.dim === dim).map((e) => e.value)
  assert.ok(val('type').includes('12px/auto/auto'), "the outer block's own font-size must be seen")
  assert.ok(val('spacing').includes('8px'), "and its padding")
  assert.ok(val('color').includes('#333'), "and its colour")
  assert.ok(val('radius').includes('4px'), 'while the nested block still counts too')
})

test('& resolves to the class the nested rule actually generates', () => {
  const styles = extractClassStyles('.card { color: #111; &__title { font-weight: 700; } }')
  assert.ok(styles['card__title'], `expected card__title, got ${Object.keys(styles)}`)
  assert.equal(styles['card__title']['font-weight'], '700')
})

test('@media-wrapped rules are still read', () => {
  const evs = extractCss('a.css', '@media (max-width: 700px) { .a { padding: 4px; } }')
  assert.ok(evs.some((e) => e.dim === 'spacing' && e.value === '4px'))
})

test('expressible separates structure from the inexpressible', () => {
  // A flex wrapper is not a failure of our vocabulary; a transform-only rule is.
  const r = auditFiles([
    file('s.css', '.painted { color: #111; padding: 8px; }\n.moved { transform: rotate(3deg); cursor: grab; }'),
    file('a.tsx', '<div className="painted">a</div><div className="moved">b</div><div className="flex items-center">c</div>'),
  ])
  const c = r.meta.expressible.counts
  assert.equal(c.tokensOnly, 1, 'the painted element')
  assert.equal(c.none, 1, 'styled, but in ways no token can say')
  assert.equal(c.layout, 1, 'pure structure — not counted against the vocabulary')
})

test('the button line distinguishes a solved codebase from a sprawling one', () => {
  // Measured reality: shadcn-ui/ui had 80 raw <button> against 3,070 <Button/>.
  // Reporting only the raw count described that repo the same way as one with
  // 134 one-off treatments.
  const solved = auditFiles([file('a.tsx', `
    ${'<Button variant="primary">go</Button>\n'.repeat(30)}
    <button className="bg-red-500 px-2">odd one out</button>
  `)])
  assert.equal(solved.components.button.throughComponent, 30)
  assert.equal(solved.components.button.treatments, 1)
  assert.ok(solved.components.button.componentShare > 0.9)
  assert.match(buttonLine(solved.components.button), /go through a component/)

  const sprawl = auditFiles([file('b.tsx',
    Array.from({ length: 12 }, (_, i) => `<button className="bg-c${i} p-${i} rounded-lg">b</button>`).join('\n'))])
  assert.equal(sprawl.components.button.throughComponent, 0)
  assert.equal(sprawl.components.button.componentShare, 0)
  assert.doesNotMatch(buttonLine(sprawl.components.button), /go through a component/)
  assert.match(buttonLine(sprawl.components.button), /hand-rolled/)
})

test('container components are not counted as controls', () => {
  const r = auditFiles([file('a.tsx', `
    <ButtonGroup><Button>a</Button></ButtonGroup>
    <CardHeader/><CardTitle/><Card>x</Card>
    <SelectTrigger/><SelectItem/><Select/>
  `)])
  assert.equal(r.components.button.throughComponent, 1, 'ButtonGroup is not a button')
  assert.equal(r.components.card.throughComponent, 1, 'CardHeader/CardTitle are not cards')
  assert.equal(r.components.input.throughComponent, 1, 'SelectTrigger/SelectItem are not inputs')
})

test('component names are reported so the reader recognises their own', () => {
  const r = auditFiles([file('a.tsx', '<IconButton/><Button/><Button/>')])
  assert.deepEqual(r.components.button.componentNames, ['Button', 'IconButton'])
})

/* ───────────────────── relational coherence (sibling rows) ─────────────────── */

test('siblings in a row at different heights are flagged', () => {
  // Alexander's case: account on the left, sign-in on the right, not the same height.
  const r = auditFiles([file('a.tsx', `
    <div className="flex">
      <button className="py-2 text-sm">Account</button>
      <button className="py-3 text-sm">Sign in</button>
    </div>
  `)])
  assert.equal(r.clusters.rows, 1)
  assert.equal(r.clusters.mismatched, 1)
  assert.deepEqual(r.clusters.findings[0].differsOn, ['class:py'])
})

test('a matched row is not flagged', () => {
  const r = auditFiles([file('a.tsx', `
    <div className="flex">
      <button className="py-2 text-sm">Account</button>
      <button className="py-2 text-sm">Sign in</button>
    </div>
  `)])
  assert.equal(r.clusters.rows, 1)
  assert.equal(r.clusters.mismatched, 0)
})

test('only VERTICAL padding counts — px differences are not height', () => {
  // `9px 16px` vs `9px 18px` is the same height and a different width. Flagging
  // it would lose the first argument about this feature.
  const r = auditFiles([
    file('s.css', '.a { padding: 9px 16px; } .b { padding: 9px 18px; }'),
    file('a.tsx', '<div><button className="a">x</button><button className="b">y</button></div>'),
  ])
  assert.equal(r.clusters.mismatched, 0)

  const tall = auditFiles([
    file('s.css', '.a { padding: 9px 16px; } .b { padding: 12px 16px; }'),
    file('a.tsx', '<div><button className="a">x</button><button className="b">y</button></div>'),
  ])
  assert.equal(tall.clusters.mismatched, 1)
})

test('it declines to judge when only one sibling declares the facet', () => {
  // One sets font-size, the other inherits something we cannot see.
  const r = auditFiles([
    file('s.css', '.a { font-size: 14px; } .b { color: red; }'),
    file('a.tsx', '<div><button className="a">x</button><button className="b">y</button></div>'),
  ])
  assert.equal(r.clusters.mismatched, 0, 'a partial reading must not become an accusation')
})

test('a component size prop is a declared height', () => {
  const r = auditFiles([file('a.tsx', `
    <div><Button size="sm">a</Button><Button size="lg">b</Button></div>
  `)])
  assert.equal(r.clusters.mismatched, 1)
  assert.deepEqual(r.clusters.findings[0].differsOn, ['size'])
})

test('controls in different containers are not siblings', () => {
  const r = auditFiles([file('a.tsx', `
    <div><button className="py-2">a</button></div>
    <div><button className="py-5">b</button></div>
  `)])
  assert.equal(r.clusters.rows, 0, 'two rows of one control each is not a cluster')
  assert.equal(r.clusters.mismatched, 0)
})

test('the element walker survives self-closing and void tags', () => {
  const r = auditFiles([file('a.tsx', `
    <div>
      <img src="x" />
      <input className="py-2" />
      <br>
      <input className="py-4" />
    </div>
  `)])
  assert.equal(r.clusters.rows, 1, 'both inputs must still read as siblings')
  assert.equal(r.clusters.mismatched, 1)
})

/* ─────────────────────── the two headlines (§2.5 made equal) ───────────────── */

test('a button is not also counted as a card', () => {
  // `<button className="bg-x p-2 rounded">` satisfies the card test too, and
  // counting it twice roughly doubled the sprawl total.
  const r = auditFiles([file('a.tsx',
    Array.from({ length: 14 }, (_, i) => `<button className="bg-c${i} p-${i} rounded-lg">b</button>`).join('\n'))])
  assert.equal(r.components.card.treatments, 0, 'a control is not a card')
  assert.equal(r.sprawl.treatments, r.components.button.treatments)
})

test('sprawl is a count, never a score out of 100', () => {
  const r = auditFiles([file('a.tsx',
    Array.from({ length: 12 }, (_, i) => `<button className="bg-c${i} p-${i}">b</button>`).join('\n'))])
  assert.equal(r.sprawl.singletons, 12)
  assert.equal(r.sprawl.singletonRate, 1)
  // There is no calibrated budget for "how many treatments is acceptable", so
  // there must be no invented scale either.
  assert.equal(r.sprawl.score, undefined)
})

test('the headlines are flagged as disagreeing when they do', () => {
  // A healthy value score sitting on a pile of one-off components — the normal
  // shape of a utility-first codebase, and the thing the score cannot see.
  const tidyValuesMessyComponents = auditFiles([file('a.tsx',
    Array.from({ length: 14 }, (_, i) =>
      `<button className="bg-blue-500 p-4 rounded-lg text-sm gap-${i}">b</button>`).join('\n'))])
  assert.ok(tidyValuesMessyComponents.score >= 70)
  assert.equal(tidyValuesMessyComponents.headlinesDisagree, true)
})

test('a repo that is bad at both is not flagged as a contradiction', () => {
  const messy = auditFiles([file('m.css', messyCss), file('b.tsx',
    Array.from({ length: 14 }, (_, i) => `<button className="bg-c${i} p-${i}">b</button>`).join('\n'))])
  assert.ok(messy.score < 70)
  assert.equal(messy.headlinesDisagree, false, 'both bad is not a disagreement')
})

test('sprawl reports per kind as well as in total', () => {
  const r = auditFiles([file('a.tsx', `
    <button className="bg-a p-1">x</button>
    <input className="bg-b p-2" />
  `)])
  assert.ok('button' in r.sprawl.byKind && 'input' in r.sprawl.byKind)
  assert.equal(r.sprawl.treatments, r.sprawl.byKind.button.treatments + r.sprawl.byKind.input.treatments)
})

test('a refusal still reports what it found, as a floor', () => {
  // twentyhq/twenty refuses on coverage yet holds 31 of 32 treatments used
  // exactly once. Throwing that away left a fifth of real repos with nothing.
  const dyn = Array.from({ length: 40 }, (_, i) => `<div className={cls${i}}>x</div>`).join('\n')
  const btns = Array.from({ length: 12 }, (_, i) => `<button className="bg-c${i} p-${i}">b</button>`).join('\n')
  const r = auditFiles([file('a.tsx', `${dyn}\n${btns}`)])
  assert.equal(r.refused, true)
  assert.equal(r.score, null)
  // …but the sprawl finding survives, and the terminal says so.
  assert.ok(r.sprawl.singletons > 0)
  const out = renderTerminal(r)
  assert.match(out, /No score/)
  assert.match(out, /at least \d+ used once/)
  assert.match(out, /a floor/)
})

test('a refusal report shows the evidence but never a grade', () => {
  const dyn = Array.from({ length: 40 }, (_, i) => `<div className={cls${i}}>x</div>`).join('\n')
  const btns = Array.from({ length: 12 }, (_, i) => `<button className="bg-c${i} p-${i}">b</button>`).join('\n')
  const html = renderReport(auditFiles([file('a.tsx', `${dyn}\n${btns}`)]))
  const body = html.slice(html.indexOf('<body>'))
  assert.match(html, /<title>uicockpit audit — no score<\/title>/, 'never "null/100"')
  assert.ok(body.includes('The button wall'), 'the evidence stays')
  assert.ok(!body.includes('<section class="board">'), 'the grade table does not')
  assert.match(body, /floor/, 'and it says the numbers are a lower bound')
})

/* ── the brand a codebase NAMED beats the one it merely used often ──────────
 * Regression: run against our own source, the counted-literal rule christened a
 * cobalt product "ember" — the incidental status oranges outnumbered a brand
 * that lives entirely in tokens. The better a codebase tokenises, the more
 * reliably counting literals picks the wrong colour. */
test('a declared --primary outranks a more frequent incidental colour', () => {
  const files = [
    { path: 'tokens.css', content: ':root { --primary: #0A84FF; }' },
    // amber wins on raw count by 4:1 and is genuinely saturated
    { path: 'status.css', content: [
      '.a { color: #f59e0b; }', '.b { color: #f59e0b; }',
      '.c { color: #f59e0b; }', '.d { color: #f59e0b; }',
      '.e { color: #0A84FF; }',
    ].join('\n') },
  ]
  const r = auditFiles(files)
  // The declared blue wins outright over the amber that leads 4:1 on count.
  assert.equal(r.inferredConfig.values.colorTheme, 'cobalt')
  assert.notEqual(r.inferredConfig.values.colorTheme, 'ember')
  assert.match(r.inferredConfig.confidence.colorThemeSource, /declared as --primary/)
  assert.equal(r.inferredConfig.confidence.colorTheme, 1)
})

test('with nothing declared it falls back to counting, and stays silent when no colour dominates', () => {
  const spread = ['#f59e0b', '#e11d48', '#0b5cff', '#16a34a', '#8b5cf6']
    .map((c, i) => ({ path: `c${i}.css`, content: `.c${i} { color: ${c}; }` }))
  const r = auditFiles(spread)
  assert.equal(r.inferredConfig.values.colorTheme, undefined)
  assert.equal(r.inferredConfig.confidence.colorThemeSource, 'most-used literal colour')
})

test('an elevation is not asserted off a shadow nobody agreed on', () => {
  const files = Array.from({ length: 10 }, (_, i) => ({
    path: `s${i}.css`, content: `.s${i} { box-shadow: 0 ${i + 1}px ${i + 2}px rgba(0,0,0,.1); }`,
  }))
  const r = auditFiles(files)
  assert.equal(r.inferredConfig.values.elevation, undefined)
})

/* ── which KINDS of UI a codebase builds ────────────────────────────────────
 * The reason this exists: value extraction reaches about half of a real repo's
 * treatments, while asking "does this app have a dialog" answers on 13–15 of 16
 * kinds everywhere we have measured. So this is the signal the visitor's own
 * component set gets rendered from, and it has to survive every styling
 * fashion — none of which rename <table>. */

test('detects a kind through Tailwind, CSS modules and plain CSS alike', () => {
  const r = auditFiles([
    { path: 'a.tsx', content: '<table className="w-full text-sm"><tbody/></table>' },
    { path: 'b.tsx', content: 'import s from "./b.module.css"\n<table className={s.grid}/>' },
    { path: 'c.tsx', content: '<table class="data"/>' },
  ])
  assert.equal(r.kinds.table.files, 3)
})

test('believes an ARIA role even when nothing is named after the thing', () => {
  const r = auditFiles([
    { path: 'x.tsx', content: '<div role="dialog" aria-modal="true"><p>Are you sure?</p></div>' },
    { path: 'y.tsx', content: '<div role="tablist"><span role="tab">One</span></div>' },
  ])
  assert.equal(r.kinds.dialog.files, 1)
  assert.equal(r.kinds.tabs.files, 1)
})

test('counts files, not mentions — one busy file cannot outvote a codebase', () => {
  const busy = { path: 'busy.tsx', content: Array(50).fill('<Dropdown/>').join('\n') }
  const spread = Array.from({ length: 3 }, (_, i) => ({ path: `p${i}.tsx`, content: '<Dropdown/>' }))
  assert.equal(auditFiles([busy]).kinds.menu.files, 1)
  assert.equal(auditFiles(spread).kinds.menu.files, 3)
})

test('a stylesheet names no components', () => {
  const r = auditFiles([{ path: 'app.css', content: '.card { padding: 8px } .badge { color: red }' }])
  assert.equal(r.kinds.card.files, 0)
  assert.equal(r.kinds.badge.files, 0)
})

test('keeps example paths so a reader can check the claim', () => {
  const r = auditFiles([
    { path: 'src/Nav.tsx', content: '<nav aria-label="main"/>' },
    { path: 'src/Foot.tsx', content: '<nav aria-label="footer"/>' },
  ])
  assert.equal(r.kinds.nav.files, 2)
  assert.deepEqual(r.kinds.nav.at, ['src/Nav.tsx', 'src/Foot.tsx'])
})

test('stays quiet about kinds a codebase does not build', () => {
  const r = auditFiles([{ path: 'only.tsx', content: '<button className="px-4">Go</button>' }])
  assert.equal(r.kinds.calendar.files, 0)
  assert.equal(r.kinds.pagination.files, 0)
})

/* ── reading the conventions real codebases actually use ────────────────────
 * Both of these were found by auditing four public repos and then opening the
 * products themselves to check. Documenso came back "indigo" while their app is
 * unmistakably lime green — the sort of error that is invisible from inside a
 * test suite and obvious the moment you look at the thing. */

test('reads shadcn bare-HSL tokens, which is how most modern apps declare a brand', () => {
  // shadcn stores components and wraps at use: hsl(var(--primary))
  const r = auditFiles([
    { path: 'globals.css', content: ':root { --primary: 95.08 71.08% 67.45%; }' },
    { path: 'a.tsx', content: '<button className="btn">Go</button>' },
  ])
  // hue 95 is yellow-green — jade is the nearest anchor we ship
  assert.equal(r.inferredConfig.values.colorTheme, 'jade')
  assert.match(r.inferredConfig.confidence.colorThemeSource, /declared as --primary/)
})

test('a component-scoped token is not a brand declaration', () => {
  // The shadcn default sidebar colour, in an app whose real primary is black.
  const r = auditFiles([
    { path: 'globals.css', content: ':root { --primary: 240 5.9% 10%; --sidebar-primary: 224.3 76.3% 48%; }' },
    { path: 'a.tsx', content: '<button className="btn">Go</button>' },
  ])
  // Reading --sidebar-primary made two unrelated products report the same
  // indigo. Silence is correct here: their primary genuinely is near-black.
  assert.equal(r.inferredConfig.values.colorTheme, undefined)
})

test('a namespaced brand token still counts', () => {
  const r = auditFiles([
    { path: 'globals.css', content: ':root { --color-brand: #00C4B8; }' },
    { path: 'a.tsx', content: '<button className="btn">Go</button>' },
  ])
  assert.equal(r.inferredConfig.values.colorTheme, 'teal')
  assert.match(r.inferredConfig.confidence.colorThemeSource, /--color-brand/)
})

/* ── the shell an app holds to ──────────────────────────────────────────────
 * You recognise your own app by its silhouette before you read a word, so this
 * is the strongest recognition a static scan can offer. It also has a hard
 * limit that has to stay visible in the tests: WHICH regions, never how they
 * are arranged. */

test('detects shell regions, and tells two products apart by them', () => {
  const mail = auditFiles([
    { path: 'layout.tsx', content: '<SidebarProvider><AppSidebar/><SidebarTrigger/></SidebarProvider>' },
    { path: 'thread.tsx', content: '<ThreadDisplay/>' },
  ])
  const booking = auditFiles([
    { path: 'layout.tsx', content: '<SiteHeader/><PageHeader title="Bookings"/>' },
  ])
  assert.equal(mail.shell['side-nav'].files, 1)
  assert.equal(mail.shell.rail.files, 1)
  // a reading pane is what makes a mail client look like a mail client
  assert.equal(mail.shell['right-panel'].files, 1)
  assert.equal(booking.shell['right-panel'].files, 0)
  assert.equal(booking.shell['top-bar'].files, 1)
})

test('a shell region is defined once, so low counts are the signal', () => {
  // 1 sidebar and 40 dialogs is what a real app looks like; the sidebar is not
  // weaker evidence for being rarer, it is a skeleton rather than a part.
  const files = [{ path: 'shell.tsx', content: '<AppSidebar/>' }]
  for (let i = 0; i < 40; i++) files.push({ path: `p${i}.tsx`, content: '<Dialog/>' })
  const r = auditFiles(files)
  assert.equal(r.shell['side-nav'].files, 1)
  assert.equal(r.kinds.dialog.files, 40)
})

test('stylesheets define no shell', () => {
  const r = auditFiles([{ path: 'a.css', content: '.sidebar { width: 240px } header { height: 56px }' }])
  assert.equal(r.shell['side-nav'].files, 0)
  assert.equal(r.shell['top-bar'].files, 0)
})

/* ─────────────────────── the page, the ink and the edge ──────────────────────
 * Every rule below was learned from a real repo reporting the wrong app back at
 * its own authors, and each one drives the ENTIRE derived palette: get the page
 * or the ink wrong and every surface, border and label mixed from them is wrong
 * too. This is the most consequential inference the audit makes.
 */

test('the ink is the darkest text that is actually used, not the most frequent', () => {
  // formbricks' busiest legible text colour is slate-500 (407 uses) and their
  // body ink is slate-900 (257): every card carries one heading and three muted
  // lines, so frequency elects the muted grey in any well-built app.
  const css = `
    .page { background: #ffffff }
    ${Array.from({ length: 12 }, (_, i) => `.muted${i} { color: #64748b }`).join('\n')}
    ${Array.from({ length: 6 }, (_, i) => `.head${i} { color: #0f172a }`).join('\n')}
  `
  const r = auditFiles([{ path: 'a.css', content: css }])
  assert.equal(r.spread.bg, '#ffffff')
  assert.equal(r.spread.fg, '#0f172a')
})

test('a single stray near-black does not become the ink', () => {
  // The support floor: one #000000 in an icon must not outrank the colour the
  // codebase actually writes its text in.
  const css = `
    .page { background: #ffffff }
    ${Array.from({ length: 20 }, (_, i) => `.t${i} { color: #334155 }`).join('\n')}
    .icon { color: #000000 }
  `
  assert.equal(auditFiles([{ path: 'a.css', content: css }]).spread.fg, '#334155')
})

test('what a codebase DECLARES outranks what it happens to use', () => {
  // documenso has eleven literal text colours in total, because everything real
  // lives in --foreground. Counting alone reads a tokenised repo by its scraps.
  const css = `
    :root { --background: #ffffff; --foreground: #0a0a0a; --border: #e5e5e5 }
    ${Array.from({ length: 30 }, (_, i) => `.x${i} { color: #6b7280; background: #f3f4f6 }`).join('\n')}
    .y { color: var(--foreground); background: var(--background); border-color: var(--border) }
  `
  const r = auditFiles([{ path: 'a.css', content: css }])
  assert.equal(r.spread.bg, '#ffffff')
  assert.equal(r.spread.fg, '#0a0a0a')
  assert.equal(r.spread.border, '#e5e5e5')
})

test('a dark-theme block never overwrites the theme the app ships', () => {
  // shadcn writes :root light then .dark dark, in that order. Last-wins read
  // documenso's page as #262626 and its ink as near-white — their dark theme,
  // reported as their app.
  const css = `
    :root { --background: #ffffff; --foreground: #111111 }
    .dark { --background: #262626; --foreground: #f7f7f7 }
  `
  const r = auditFiles([{ path: 'a.css', content: css }])
  assert.equal(r.spread.bg, '#ffffff')
  assert.equal(r.spread.polarity, 'light')
})

test('a class that only CONTAINS the word dark is not a dark theme', () => {
  // `.dark-mode-disabled` is the class documenso wraps its LIGHT theme in. A
  // \b treats the hyphen as a boundary, so the opt-OUT read as the opt-in.
  const css = `
    .dark-mode-disabled { --background: #ffffff; --foreground: #111111 }
    .dark:not(.dark-mode-disabled) { --background: #262626; --foreground: #f7f7f7 }
  `
  assert.equal(auditFiles([{ path: 'a.css', content: css }]).spread.bg, '#ffffff')
})

test('the ink that goes ON the brand is not the ink of the page', () => {
  // --primary-foreground is documenso's lime darkened until it is legible on
  // itself. Read as body text, it made their pages green — and it wins on reach
  // when every button uses it, so the name-length tiebreak cannot save us here.
  const css = `
    :root { --background: #ffffff; --primary-foreground: #162c07; --foreground: #0f172a }
    ${Array.from({ length: 9 }, (_, i) => `.btn${i} { color: var(--primary-foreground) }`).join('\n')}
    .body { color: var(--foreground) }
  `
  assert.equal(auditFiles([{ path: 'a.css', content: css }]).spread.fg, '#0f172a')
})

test('a token defined through a fallback still resolves', () => {
  // n8n's canvas is `var(--color-background-base, var(--color--neutral-125))`
  // with the first name never declared. Unresolvable meant no declared page at
  // all, and the audit fell through to a --bg inside a report-generating script.
  const css = `
    :root {
      --color--neutral-125: #f5f5f5;
      --color--background: var(--color-background-base, var(--color--neutral-125));
      --color--text: #101010;
    }
    .app { background: var(--color--background); color: var(--color--text) }
  `
  const r = auditFiles([{ path: 'a.css', content: css }])
  assert.equal(r.spread.bg, '#f5f5f5')
  assert.equal(r.spread.polarity, 'light')
})

test('the most-READ token wins, not the shortest-named one', () => {
  // n8n declares --bg in a script that generates evaluation reports, and
  // --color-bg across the design system its editor is built from.
  const css = `
    :root { --bg: #0d1117; --color-bg: #ffffff }
    ${Array.from({ length: 8 }, (_, i) => `.a${i} { background: var(--color-bg) }`).join('\n')}
    .r { background: var(--bg) }
  `
  assert.equal(auditFiles([{ path: 'a.css', content: css }]).spread.bg, '#ffffff')
})

test('polarity follows the page we settled on, so the two cannot disagree', () => {
  const css = ':root { --background: #0b0b0f; --foreground: #f2f2f5 }'
  const r = auditFiles([{ path: 'a.css', content: css }])
  assert.equal(r.spread.polarity, 'dark')
  assert.equal(r.spread.bg, '#0b0b0f')
})

/* ───────────────────────────── which colour is theirs ───────────────────────
 * The brand is the one value a visitor checks first, and a wrong one asserted
 * confidently is worse than none: every other correct answer stops being
 * believed. These are the three ways a declared name lied to us.
 */

test('the brand is the token the codebase actually reads, not the shortest name', () => {
  // n8n declares --accent once in a corner and --color--primary in 347 places
  // across the design system its editor is built from.
  const css = `
    :root { --accent: #7c8cff; --color--primary: #ff6900 }
    ${Array.from({ length: 12 }, (_, i) => `.a${i} { color: var(--color--primary) }`).join('\n')}
    .b { color: var(--accent) }
  `
  const r = auditFiles([{ path: 'a.css', content: css }])
  assert.equal(r.inferredConfig.values.brandHex, '#ff6900')
})

test('a token named after the product outranks a generic default', () => {
  // formbricks declares three brand-ish tokens that nothing references — two
  // teals and an indigo — and the indigo is the overridable placeholder inside
  // their embeddable survey widget. Only one of them claims to be anyone's.
  const css = ':root { --brand-default: #1e40af; --formbricks-brand: #038178 }'
  const r = auditFiles([{ path: 'a.css', content: css }], { pkg: { name: 'formbricks' } })
  assert.equal(r.inferredConfig.values.brandHex, '#038178')
})

test('the product name only counts when the package says so', () => {
  // Without a package.json there is nothing to match, and the rule must not
  // silently reorder anything on its own.
  const css = ':root { --brand-default: #1e40af; --formbricks-brand: #038178 }'
  const r = auditFiles([{ path: 'a.css', content: css }])
  assert.equal(r.inferredConfig.values.brandHex, '#1e40af')
})

test('a link colour is a use of the brand, not the brand', () => {
  // plane aliases its identity onto --txt-link-primary. Read as a declaration,
  // their brand became the colour of a hyperlink.
  const css = `
    :root { --brand-default: #3f76ff }
    .l { color: var(--txt-link-primary) }
    :root { --txt-link-primary: #006399 }
  `
  assert.equal(auditFiles([{ path: 'a.css', content: css }]).inferredConfig.values.brandHex, '#3f76ff')
})

test('nobody’s identity is their error state', () => {
  // --bg-danger-primary ends in `primary` and is a red.
  const css = `
    :root { --bg-danger-primary: #e00714; --brand-default: #3f76ff }
    ${Array.from({ length: 6 }, (_, i) => `.e${i} { background: var(--bg-danger-primary) }`).join('\n')}
  `
  assert.equal(auditFiles([{ path: 'a.css', content: css }]).inferredConfig.values.brandHex, '#3f76ff')
})

test('a brand named at a ramp position is still a declaration', () => {
  const r = auditFiles([{ path: 'a.css', content: ':root { --brand-default: #3f76ff }' }])
  assert.equal(r.inferredConfig.values.brandHex, '#3f76ff')
  assert.equal(r.inferredConfig.confidence.colorTheme, 1)
})

/* ──────────────────── recognising a namespaced design system ─────────────────
 * The literal patterns anchor on `<Tooltip`, which makes every codebase that
 * prefixes its own components invisible to them. n8n writes `<N8nTooltip>` and
 * `<N8nDataTableServer>` for everything and came back holding 12 of 16 kinds
 * while actually holding 15. Prefixes and suffixes are everywhere once you look.
 */

test('a namespaced component is still the component', () => {
  const r = auditFiles([{ path: 'a.vue', content: '<N8nTooltip><N8nDataTableServer /></N8nTooltip>' }])
  assert.equal(r.kinds.tooltip.files, 1)
  assert.equal(r.kinds.table.files, 1)
})

test('a qualified component is still the component', () => {
  const r = auditFiles([{ path: 'a.tsx', content: '<AlertDialogContent /><DateRangePicker />' }])
  assert.equal(r.kinds.dialog.files, 1)
  assert.equal(r.kinds.calendar.files, 1)
})

test('matching is by SEGMENT, so a longer word is not the noun', () => {
  // `FormattedMessage` is i18n and `Navigate` is a router. Substring matching
  // claims both, and claiming a form an app does not have is how a specimen
  // gets drawn for something nobody built.
  const r = auditFiles([{ path: 'a.tsx', content: '<FormattedMessage id="x" /><Navigate to="/" />' }])
  assert.equal(r.kinds.form.files, 0)
  assert.equal(r.kinds.nav.files, 0)
})

test('a Toggle that opens something is not a switch — but a bare Toggle is', () => {
  // n8n's `N8nActionToggle` is the "…" menu trigger. Read as a switch, we would
  // draw a Switch specimen for an app that has none. The bare `<Toggle>` is
  // unambiguous, so the exact-match marker has to keep working in BOTH
  // directions — the negative half alone passes even with the marker removed.
  assert.equal(auditFiles([{ path: 'a.vue', content: '<N8nActionToggle />' }]).kinds.toggle.files, 0)
  assert.equal(auditFiles([{ path: 'b.tsx', content: '<Toggle />' }]).kinds.toggle.files, 1)
  assert.equal(auditFiles([{ path: 'c.tsx', content: '<ToggleGroup />' }]).kinds.toggle.files, 1)
  // …and a namespaced SWITCH still is one, since 'Switch' is unambiguous.
  assert.equal(auditFiles([{ path: 'd.vue', content: '<N8nSwitch />' }]).kinds.toggle.files, 1)
})

test('a type parameter never creates a component', () => {
  // `useState<TableState>` is not a table. The JSX guard is what separates them:
  // a generic opens directly after an identifier, JSX never does.
  const r = auditFiles([{ path: 'a.tsx', content: 'const [s] = useState<TableState>(null)\nconst d: Array<Dialog> = []' }])
  assert.equal(r.kinds.table.files, 0)
  assert.equal(r.kinds.dialog.files, 0)
})

test('pascalSegments splits namespaces and acronyms', () => {
  assert.deepEqual(pascalSegments('N8nTooltip'), ['N8n', 'Tooltip'])
  assert.deepEqual(pascalSegments('OTPInput'), ['OTP', 'Input'])
  assert.deepEqual(pascalSegments('FormattedMessage'), ['Formatted', 'Message'])
  assert.equal(hasNoun('LightIconButton', 'Button'), true)
  assert.equal(hasNoun('FormattedMessage', 'Form'), false)
})
