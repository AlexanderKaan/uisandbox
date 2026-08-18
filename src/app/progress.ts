/** What the door says while it works — stages with the numbers, so a 45 MB
 *  drop reads as work, not a hang. */
export type Stage = 'fetch' | 'read' | 'derive' | 'open'
export interface Progress {
  stage: Stage
  /** Files read so far / total (read stage). */
  done?: number
  total?: number
  /** Bytes fetched (fetch stage) or CSS bytes tokenised so far (read stage). */
  bytes?: number
  /** Total bytes when known (fetch). */
  size?: number
  /** A name to show: the URL host, the archive. */
  what?: string
  /** The load began with a fetch (URL, repo) — the Fetching stage stays listed as done. */
  fromUrl?: boolean
}
export const STAGES: Array<{ id: Stage; label: string }> = [
  { id: 'fetch', label: 'Fetching' },
  { id: 'read', label: 'Reading & tokenising' },
  { id: 'derive', label: 'Deriving the knobs' },
  { id: 'open', label: 'Opening' },
]
export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`)
