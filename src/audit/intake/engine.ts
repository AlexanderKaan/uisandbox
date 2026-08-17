/**
 * The audit engine, in the browser.
 *
 * `auditFiles` is deliberately PURE over `{path, content}[]` with no Node imports
 * at module level — that property exists for exactly this file. The CLI shell
 * (`runAudit`) is the only Node-specific part and is never imported here.
 *
 * Why a shim: the verifier core lives in the publishable `uicockpit` package at
 * `/cli`, which is the SINGLE source. The cockpit cannot import across that
 * boundary casually — `scripts/uicockpit-check.mjs` exists for the same reason.
 * Keeping the re-export in one file means the app has exactly one line to change
 * if the package ever moves, and the two surfaces can never run different maths.
 */
// @ts-expect-error — plain .mjs from the sibling package, no types published
export { auditFiles, DIMENSIONS, MIN_PARSED, MIN_EVENTS } from '../engine/audit.mjs'
// @ts-expect-error — same
export { renderReport } from '../engine/report.mjs'
// @ts-expect-error — same
export { AUDIT_SCAN_EXT, AUDIT_SKIP_FILE, auditFilePriority } from '../engine/patterns.mjs'
