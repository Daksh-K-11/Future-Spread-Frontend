import { useState, useEffect, useCallback} from 'react'
import './index.css'

/* ── TYPES ── */
interface SpreadEntry {
  company: string
  current_contract: string
  next_contract: string
  current_expiry: string
  next_expiry: string
  current_ltp: number
  next_ltp: number
  spread: number
  yield: number
}

interface ApiResponse {
  success: boolean
  count: number
  total_count: number
  page: number | null
  page_size: number | null
  sort_order: string
  data: SpreadEntry[]
}

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL
const API_BASE = '/api/v1'

/* ── HELPERS ── */
const fmt = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })

function calcStats(data: SpreadEntry[]) {
  if (!data.length) return { max: 0, min: 0, avg: 0, pos: 0 }
  const yields = data.map(r => r.yield)
  return {
    max: Math.max(...yields),
    min: Math.min(...yields),
    avg: yields.reduce((a, b) => a + b, 0) / yields.length,
    pos: data.filter(r => r.yield > 0).length,
  }
}

function pageRange(cur: number, total: number): (number | '...')[] {
  const d = 2, left = Math.max(1, cur - d), right = Math.min(total, cur + d)
  const pages: (number | '...')[] = []
  if (left > 1) { pages.push(1); if (left > 2) pages.push('...') }
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total) { if (right < total - 1) pages.push('...'); pages.push(total) }
  return pages
}

/* ── SVG ICONS ── */
const IconChart = () => (
  <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="9" width="3" height="6" rx="1"/>
    <rect x="6" y="5" width="3" height="10" rx="1"/>
    <rect x="11" y="1" width="3" height="14" rx="1"/>
  </svg>
)

const IconRefresh = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2"/>
    <polyline points="13,2 13,5 10,5"/>
  </svg>
)

const IconSun = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="3"/>
    <line x1="8" y1="1" x2="8" y2="3"/>
    <line x1="8" y1="13" x2="8" y2="15"/>
    <line x1="1" y1="8" x2="3" y2="8"/>
    <line x1="13" y1="8" x2="15" y2="8"/>
    <line x1="3.05" y1="3.05" x2="4.46" y2="4.46"/>
    <line x1="11.54" y1="11.54" x2="12.95" y2="12.95"/>
    <line x1="3.05" y1="12.95" x2="4.46" y2="11.54"/>
    <line x1="11.54" y1="4.46" x2="12.95" y2="3.05"/>
  </svg>
)

const IconMoon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 1.5a6.5 6.5 0 1 0 8.5 8.5A5 5 0 0 1 6 1.5z"/>
  </svg>
)

/* ── THEME HOOK ── */
type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme') as Theme | null
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
}

/* ── APP ── */
export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  // Apply theme to DOM
  useEffect(() => { applyTheme(theme) }, [theme])

  // Listen to system preference changes (only if no stored override)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('theme')) setTheme(e.matches ? 'light' : 'dark')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  /* ── Data state ── */
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [pagEnabled, setPagEnabled] = useState(true)
  const [pageSize, setPageSize]     = useState(50)
  const [curPage, setCurPage]       = useState(1)
  const [response, setResponse]     = useState<ApiResponse | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [status, setStatus]         = useState<'unknown'|'online'|'offline'>('unknown')

  const buildUrl = useCallback((page: number) => {
    const p = new URLSearchParams({ sort_order: sortOrder })
    if (pagEnabled) { p.set('page', String(page)); p.set('page_size', String(pageSize)) }
    return `${API_BASE_URL}${API_BASE}/market/futures-spread?${p}`
  }, [sortOrder, pagEnabled, pageSize])

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch(buildUrl(page))
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const json: ApiResponse = await res.json()
      if (!json.success) throw new Error('API returned success=false')
      setResponse(json); setLastUpdated(new Date()); setStatus('online')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [buildUrl])

  useEffect(() => { setCurPage(1); fetchData(1) }, [fetchData])

  function goTo(page: number) { setCurPage(page); fetchData(page) }

  const data       = response?.data ?? []
  const total      = response?.total_count ?? 0
  const stats      = calcStats(data)
  const totalPages = pagEnabled && pageSize > 0 ? Math.ceil(total / pageSize) : 1

  const dotClass = status === 'online' ? 'status-dot'
    : status === 'offline' ? 'status-dot offline'
    : 'status-dot loading'

  const statusLabel = status === 'online' ? 'Live' : status === 'offline' ? 'Offline' : 'Connecting'

  return (
    <div className="app-wrapper">

      {/* NAVBAR */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="brand-icon"><IconChart /></div>
          <span className="brand-title">Spread Strategy</span>
          <span className="brand-sep">/</span>
          <span className="brand-subtitle">Zerodha NFO Futures Calendar</span>
        </div>

        <div className="navbar-right">
          <div className="status-indicator">
            <span className={dotClass} />
            {statusLabel}
          </div>
          <button
            id="theme-toggle-btn"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </nav>

      {/* MAIN */}
      <main className="main">

        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Futures Spread Dashboard</h1>
            <p className="page-tagline">Calendar spread analysis — ranked by annualised yield</p>
          </div>
          <button
            id="refresh-btn"
            className="refresh-btn"
            onClick={() => fetchData(curPage)}
            disabled={loading}
          >
            <span className={loading ? 'spin' : ''} style={{ display:'inline-flex' }}>
              <IconRefresh />
            </span>
            {loading ? 'Fetching…' : 'Refresh'}
          </button>
        </div>

        {/* STATS */}
        <div className="stats-grid">
          <div className="stat-card c-blue">
            <div className="stat-label">Total Spreads</div>
            <div className="stat-value">{total.toLocaleString()}</div>
            <div className="stat-sub">All NFO futures pairs</div>
          </div>
          <div className="stat-card c-green">
            <div className="stat-label">Positive Yield</div>
            <div className="stat-value">{data.length ? stats.pos : '—'}</div>
            <div className="stat-sub">This page</div>
          </div>
          <div className="stat-card c-amber">
            <div className="stat-label">Max Yield</div>
            <div className="stat-value">{data.length ? `${stats.max.toFixed(2)}%` : '—'}</div>
            <div className="stat-sub">Best spread this page</div>
          </div>
          <div className="stat-card c-purple">
            <div className="stat-label">Avg Yield</div>
            <div className="stat-value">{data.length ? `${stats.avg.toFixed(2)}%` : '—'}</div>
            <div className="stat-sub">Page average</div>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="controls-panel" role="toolbar">

          <div className="control-group">
            <span className="control-label">Sort</span>
            <div className="sort-btn-group" role="radiogroup">
              <button id="sort-asc" className={`sort-btn${sortOrder==='asc'?' active':''}`}
                onClick={() => setSortOrder('asc')}>
                ↑ Ascending
              </button>
              <button id="sort-desc" className={`sort-btn${sortOrder==='desc'?' active':''}`}
                onClick={() => setSortOrder('desc')}>
                ↓ Descending
              </button>
            </div>
          </div>

          <div className="control-group">
            <span className="control-label">Pagination</span>
            <label className="toggle-switch">
              <input id="pagination-toggle" type="checkbox" checked={pagEnabled}
                onChange={e => { setPagEnabled(e.target.checked); setCurPage(1) }} />
              <span className="toggle-track" />
            </label>
            <span className="toggle-label">{pagEnabled ? 'Enabled' : 'Off — all rows'}</span>
          </div>

          {pagEnabled && (
            <div className="control-group">
              <label htmlFor="page-size-input" className="control-label">Rows / page</label>
              <input
                id="page-size-input"
                type="number" className="page-size-input"
                value={pageSize} min={1} max={500}
                onChange={e => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 1) { setPageSize(v); setCurPage(1) }
                }}
              />
            </div>
          )}
        </div>

        {/* META */}
        {lastUpdated && !loading && (
          <div className="meta-bar">
            <span>Showing <strong>{data.length}</strong> of <strong>{total}</strong> spread pairs
              {pagEnabled && ` — Page ${curPage} of ${totalPages}`}
            </span>
            <span>Updated {lastUpdated.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</span>
          </div>
        )}

        {/* TABLE */}
        <div className="table-wrapper">

          {loading && (
            <div className="loading-overlay" role="status">
              <div className="loader-ring" />
              <div className="loading-text">Fetching live market data</div>
              <div className="loading-sub">Retrieving LTP for all NFO futures from Zerodha Kite</div>
            </div>
          )}

          {!loading && error && (
            <div className="error-state" role="alert">
              <div className="error-title">Failed to load data</div>
              <div className="error-message">{error}</div>
              <button className="error-retry" onClick={() => fetchData(curPage)}>Retry</button>
            </div>
          )}

          {!loading && !error && data.length === 0 && (
            <div className="empty-state">No spread data available.</div>
          )}

          {!loading && !error && data.length > 0 && (
            <>
              <div className="table-scroll">
                <table aria-label="Futures spread data">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Company</th>
                      <th>Near Contract</th>
                      <th>Far Contract</th>
                      <th>Near Expiry</th>
                      <th>Far Expiry</th>
                      <th className="r">Near LTP</th>
                      <th className="r">Far LTP</th>
                      <th className="r">Spread</th>
                      <th className="c">Yield</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, idx) => {
                      const rank   = pagEnabled ? (curPage - 1) * pageSize + idx + 1 : idx + 1
                      const isPos  = row.yield >= 0
                      return (
                        <tr key={`${row.company}-${row.current_contract}`}>
                          <td>
                            <span className={`rank${rank <= 3 ? ' top' : ''}`}>{rank}</span>
                          </td>
                          <td><span className="company-name">{row.company}</span></td>
                          <td><span className="badge badge-current">{row.current_contract}</span></td>
                          <td><span className="badge badge-next">{row.next_contract}</span></td>
                          <td><span className="expiry">{fmtDate(row.current_expiry)}</span></td>
                          <td><span className="expiry">{fmtDate(row.next_expiry)}</span></td>
                          <td className="r"><span className="price">₹{fmt(row.current_ltp)}</span></td>
                          <td className="r"><span className="price">₹{fmt(row.next_ltp)}</span></td>
                          <td className="r">
                            <span className={isPos ? 'pos' : 'neg'}>
                              {isPos ? '+' : ''}₹{fmt(row.spread)}
                            </span>
                          </td>
                          <td className="c">
                            <span className={`yield-pill ${isPos ? 'yield-pos' : 'yield-neg'}`}>
                              {isPos ? '▲' : '▼'} {Math.abs(row.yield).toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {pagEnabled && totalPages > 1 && (
                <div className="pagination">
                  <div className="pagination-info">
                    Page <strong>{curPage}</strong> of <strong>{totalPages}</strong>
                    {' · '}<strong>{total}</strong> records total
                  </div>
                  <div className="pagination-controls">
                    <button id="page-prev" className="page-btn"
                      onClick={() => goTo(curPage - 1)} disabled={curPage <= 1 || loading}>
                      ‹ Prev
                    </button>
                    {pageRange(curPage, totalPages).map((p, i) =>
                      p === '...'
                        ? <span key={`e${i}`} className="page-btn" style={{cursor:'default'}}>…</span>
                        : <button key={p} id={`page-${p}`}
                            className={`page-btn${p === curPage ? ' active' : ''}`}
                            onClick={() => goTo(p as number)} disabled={loading}>
                            {p}
                          </button>
                    )}
                    <button id="page-next" className="page-btn"
                      onClick={() => goTo(curPage + 1)} disabled={curPage >= totalPages || loading}>
                      Next ›
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="footer">
        Spread Strategy Dashboard &mdash; Zerodha Kite API &mdash; Data refreshed on server startup
      </footer>
    </div>
  )
}
