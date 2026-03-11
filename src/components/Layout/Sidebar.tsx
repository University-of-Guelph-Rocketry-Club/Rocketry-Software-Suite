import { useTelemetryStore } from '../../store/telemetryStore'
import { useMissionStore } from '../../store/missionStore'

interface SidebarProps {
  activeView: string
  onViewChange: (view: string) => void
}

const VIEWS = [
  { id: 'dashboard',    icon: '⚡', label: 'Dashboard'    },
  { id: '3d',           icon: '🚀', label: '3D View'       },
  { id: 'charts',       icon: '📈', label: 'Telemetry'     },
  { id: 'map',          icon: '🗺️', label: 'Live Map'      },
  { id: 'diagnostics',  icon: '🔬', label: 'Diagnostics'   },
  { id: 'forecasting',  icon: '🌤️', label: 'Forecast'      },
  { id: 'float',        icon: '🎈', label: 'HAB Tracker'   },
  { id: 'replay',       icon: '▶️', label: 'Replay'        },
  { id: 'mission',      icon: '✅', label: 'Mission Ctrl'  },
]

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const sources = useTelemetryStore(s => s.sources)
  const schema = useTelemetryStore(s => s.schema)
  const phase = useMissionStore(s => s.phase)

  return (
    <aside style={{
      width: 180,
      minWidth: 180,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        padding: '16px 14px 12px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.02em' }}>
          🚀 ROCKETRY
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
          {schema.missionName}
        </div>
        <div style={{
          marginTop: 6,
          padding: '3px 8px',
          borderRadius: 4,
          background: phase === 'in-flight' ? 'rgba(0,212,255,0.15)' : phase === 'recovery' ? 'rgba(255,170,0,0.15)' : 'rgba(68,255,136,0.15)',
          display: 'inline-block',
          fontSize: 10,
          fontWeight: 600,
          color: phase === 'in-flight' ? 'var(--accent)' : phase === 'recovery' ? '#ffaa00' : '#44ff88',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {phase}
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {VIEWS.map(view => (
          <button
            key={view.id}
            onClick={() => onViewChange(view.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 14px',
              background: activeView === view.id ? 'var(--surface-raised)' : 'transparent',
              border: 'none',
              borderLeft: activeView === view.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeView === view.id ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 13,
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 15 }}>{view.icon}</span>
            <span>{view.label}</span>
          </button>
        ))}
      </nav>

      {/* Stream status indicators */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
        fontSize: 11,
      }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: 6, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Streams
        </div>
        {schema.sources.filter(s => s.enabled).map(src => {
          const connected = sources[src.id]?.connected
          return (
            <div key={src.id} style={{
              display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: connected ? '#44ff88' : '#ff4444',
                boxShadow: connected ? '0 0 6px #44ff88' : 'none',
              }} />
              <span style={{ color: src.color, fontWeight: 500 }}>{src.name}</span>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
