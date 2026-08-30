import { useEffect, useState } from 'react'
import { GithubMark } from './Mark'

const REPO = 'Ideelab/uisandbox'
const KEY = 'us-stars'

/** "Star" — the GitHub button with a live count (one request an hour per browser). */
export function StarButton() {
  const [stars, setStars] = useState<number | null>(() => { try { const c = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return c && Date.now() - c.at < 3600e3 ? c.n : null } catch { return null } })
  useEffect(() => {
    if (stars !== null) return
    fetch(`https://api.github.com/repos/${REPO}`, { headers: { accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && typeof j.stargazers_count === 'number') { setStars(j.stargazers_count); try { sessionStorage.setItem(KEY, JSON.stringify({ n: j.stargazers_count, at: Date.now() })) } catch { /* fine */ } } }).catch(() => {})
  }, [stars])
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))
  return (
    <a className="star" href={`https://github.com/${REPO}`} target="_blank" rel="noopener" title="Star UISandbox on GitHub" aria-label="Star UISandbox on GitHub">
      <span className="star__main"><GithubMark size={14} /> Star</span>
      {stars !== null && <span className="star__count">{fmt(stars)}</span>}
    </a>
  )
}
