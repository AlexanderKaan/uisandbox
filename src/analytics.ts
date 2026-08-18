/**
 * Visitor counts and a handful of events — never the archive, never a name.
 *
 * Configured at build time with VITE_ANALYTICS:
 *   cf:<token>      Cloudflare Web Analytics beacon — cookieless, no consent
 *                   needed, page views + Core Web Vitals; custom events are
 *                   not supported there (track() is then a no-op).
 *   ga:G-XXXXXXX    Google Analytics 4 — needs consent in the EU: nothing loads
 *                   until the visitor says yes to the small bar the app shows;
 *                   the choice is kept in localStorage ('us-consent').
 *   (unset)         nothing loads, track() is a no-op.
 *
 * The script is added to the HOST document only. Sandboxed frames run their
 * own code same-origin (notes/security.md); the tag must not run there, so it
 * is injected from here, never from index.html.
 */
type Props = Record<string, string | number | boolean>
const cfg = (import.meta.env.VITE_ANALYTICS as string | undefined) ?? ''
const kind = cfg.startsWith('cf:') ? 'cf' : cfg.startsWith('ga:') ? 'ga' : 'none'
const id = cfg.slice(3)
declare global { interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } }

export const analyticsKind = kind
export const consentKey = 'us-consent'
export const needsConsent = () => kind === 'ga' && localStorage.getItem(consentKey) === null
export const consented = () => kind === 'ga' && localStorage.getItem(consentKey) === 'yes'

let loaded = false
function load(): void {
  if (loaded || typeof document === 'undefined' || window.top !== window) return
  loaded = true
  if (kind === 'cf') {
    const s = document.createElement('script')
    s.defer = true
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js'
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: id }))
    document.head.appendChild(s)
  } else if (kind === 'ga') {
    window.dataLayer = window.dataLayer ?? []
    window.gtag = function gtag() { window.dataLayer!.push(arguments) }
    window.gtag('js', new Date())
    window.gtag('config', id, { anonymize_ip: true, send_page_view: true })
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    document.head.appendChild(s)
  }
}

/** Call once at app start; loads what may load without asking. */
export function initAnalytics(): void {
  if (kind === 'cf') load()
  else if (kind === 'ga' && consented()) load()
}
/** The visitor answered the bar. */
export function setConsent(yes: boolean): void {
  localStorage.setItem(consentKey, yes ? 'yes' : 'no')
  if (yes) load()
}
/** An event: `drop`, `loaded` {kind}, `refused` {kind}, `verified` {ok}, `export` {format}. Never the archive. */
export function track(event: string, props: Props = {}): void {
  if (kind === 'ga' && consented() && window.gtag) window.gtag('event', event, props)
}
