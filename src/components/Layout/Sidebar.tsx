import { useTelemetryStore } from '../../store/telemetryStore'
import { useMissionStore } from '../../store/missionStore'
import { useMLStore } from '../../store/mlStore'

interface SidebarProps {
  activeView: string
  onViewChange: (view: string) => void
}

/* ── SVG icon set ─────────────────────────────────────────────── */
const ICONS: Record<string, JSX.Element> = {
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  '3d': (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  charts: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  map: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
      <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
    </svg>
  ),
  ml: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
    </svg>
  ),
  diagnostics: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  forecasting: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
    </svg>
  ),
  float: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="10" r="6"/><path d="M12 10v12"/>
    </svg>
  ),
  replay: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.78"/>
    </svg>
  ),
  mission: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  hardware: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
      <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
      <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
      <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
    </svg>
  ),
  serial: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="20" rx="2"/>
      <line x1="12" y1="6" x2="12" y2="6.01"/>
      <line x1="12" y1="10" x2="12" y2="10.01"/>
      <line x1="12" y1="14" x2="12" y2="14.01"/>
      <line x1="12" y1="18" x2="12" y2="18.01"/>
    </svg>
  ),
}

const NAV_GROUPS = [
  {
    label: 'Operations',
    views: [
      { id: 'dashboard',   label: 'Dashboard'   },
      { id: 'mission',     label: 'Mission Ctrl' },
      { id: '3d',          label: '3D Attitude'  },
    ],
  },
  {
    label: 'Telemetry',
    views: [
      { id: 'charts',      label: 'Live Charts'  },
      { id: 'map',         label: 'Live Map'     },
      { id: 'diagnostics', label: 'Diagnostics'  },
    ],
  },
  {
    label: 'Intelligence',
    views: [
      { id: 'ml',          label: 'ML Insights'  },
      { id: 'forecasting', label: 'Forecast'     },
      { id: 'float',       label: 'HAB Tracker'  },
    ],
  },
  {
    label: 'Tools',
    views: [
      { id: 'replay',      label: 'Replay'       },
      { id: 'hardware',    label: 'Hardware'     },
      { id: 'serial',      label: 'Serial Link'  },
    ],
  },
]

const PHASE_STYLE: Record<string, { bg: string; color: string }> = {
  'pre-flight': { bg: 'rgba(52, 211, 153, 0.12)', color: 'var(--green)' },
  'in-flight':  { bg: 'rgba(56, 189, 248, 0.12)', color: 'var(--accent)' },
  'recovery':   { bg: 'rgba(251, 191, 36, 0.12)',  color: 'var(--yellow)' },
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const sources  = useTelemetryStore(s => s.sources)
  const schema   = useTelemetryStore(s => s.schema)
  const phase    = useMissionStore(s => s.phase)
  const mlStatus = useMLStore(s => s.insights.modelStatus)
  const mlCal    = useMLStore(s => s.insights.calibrationProgress)

  const ps = PHASE_STYLE[phase] ?? PHASE_STYLE['pre-flight']

  return (
    <aside style={{
      width: 188,
      minWidth: 188,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* ── Wordmark ────────────────────────────────────── */}
      <div style={{
        padding: '14px 14px 12px',
        borderBottom: '1px solid var(--border)',
        userSelect: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"/>
            <polyline points="5 12 12 5 19 12"/>
          </svg>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.04em' }}>
            ROCKETRY
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {schema.missionName}
        </div>
        <span className="badge" style={{ background: ps.bg, color: ps.color, borderColor: 'transparent' }}>
          {phase}
        </span>
      </div>

      {/* ── Navigation ──────────────────────────────────── */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 0 8px' }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <div style={{
              padding: '10px 14px 4px',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}>
              {group.label}
            </div>
            {group.views.map(view => {
              const active = activeView === view.id
              return (
                <button
                  key={view.id}
                  onClick={() => onViewChange(view.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '7px 14px',
                    background: active ? 'rgba(56,189,248,0.08)' : 'transparent',
                    border: 'none',
                    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                    color: active ? 'var(--text)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 12,
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    outline: 'none',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
                >
                  <span style={{ opacity: active ? 1 : 0.6 }}>
                    {ICONS[view.id] ?? ICONS['diagnostics']}
                  </span>
                  <span>{view.label}</span>
                  {view.id === 'ml' && mlStatus !== 'active' && (
                    <span style={{ marginLeft: 'auto' }}>
                      <span className="badge badge-yellow" style={{ padding: '1px 5px', fontSize: 8 }}>
                        {Math.round(mlCal * 100)}%
                      </span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── Stream status ────────────────────────────────── */}
      <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 7 }}>
          Data Streams
        </div>
        {schema.sources.filter(s => s.enabled).map(src => {
          const connected = sources[src.id]?.connected
          const pps = sources[src.id]?.diagnostics.packetsPerSecond ?? 0
          return (
            <div key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <div style={{ position: 'relative', width: 7, height: 7, flexShrink: 0 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: connected ? 'var(--green)' : 'var(--red)',
                  boxShadow: connected ? 'var(--green-glow)' : 'none',
                }} />
                {connected && (
                  <div style={{
                    position: 'absolute', inset: -3, borderRadius: '50%',
                    border: '1px solid var(--green)',
                    animation: 'pulse-ring 1.8s ease-out infinite',
                    opacity: 0.5,
                  }} />
                )}
              </div>
              <span style={{ fontSize: 11, color: src.color, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {src.name}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>
                {pps.toFixed(1)}/s
              </span>
            </div>
          )
        })}

        {/* ML status indicator */}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: mlStatus === 'active' ? 'var(--ml)' : mlStatus === 'calibrating' ? 'var(--yellow)' : 'var(--text-dim)',
            boxShadow: mlStatus === 'active' ? 'var(--ml-glow)' : 'none',
          }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>ML Engine</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>
            {mlStatus}
          </span>
        </div>
      </div>
    </aside>
  )
}
