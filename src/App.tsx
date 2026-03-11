import { useState, useEffect } from 'react'
import { useTelemetryStore } from './store/telemetryStore'
import { useMissionStore } from './store/missionStore'
import { useDemoSimulator } from './hooks/useWebSocket'
import { useHardwareEvents } from './hooks/useHardwareEvents'
import { useMLPipeline } from './hooks/useMLPipeline'
import { Sidebar } from './components/Layout/Sidebar'
import { StatusBar } from './components/Layout/StatusBar'
import { RocketView3D } from './components/RocketView3D'
import { TelemetryCharts } from './components/TelemetryCharts'
import { LiveMap } from './components/LiveMap'
import { PacketDiagnostics } from './components/PacketDiagnostics'
import { ReplayMode } from './components/ReplayMode'
import { MissionControl } from './components/MissionControl'
import { ForecastingModule } from './components/ForecastingModule'
import { FloatTracker } from './components/FloatTracker'
import HardwareConfig from './components/HardwareConfig'
import { MLInsights } from './components/MLInsights'

/* ── Panel wrapper with a consistent header ──────────────────── */
function Panel({
  title, icon, children, style,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      ...style,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {icon && <span style={{ color: 'var(--accent)', opacity: 0.8 }}>{icon}</span>}
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--text-muted)',
        }}>
          {title}
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

/* ── Dashboard quad-pane ─────────────────────────────────────── */
function Dashboard() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr 1fr',
      gap: 8,
      padding: 8,
      height: '100%',
    }}>
      <Panel title="3D Attitude" icon={<CubeIcon />}>
        <RocketView3D />
      </Panel>
      <Panel title="Telemetry Charts" icon={<ChartIcon />}>
        <TelemetryCharts />
      </Panel>
      <Panel title="Live Map" icon={<MapIcon />}>
        <LiveMap />
      </Panel>
      <Panel title="Packet Diagnostics" icon={<DiagIcon />}>
        <PacketDiagnostics />
      </Panel>
    </div>
  )
}

/* ── Tiny panel icons ────────────────────────────────────────── */
function CubeIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
}
function ChartIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
}
function MapIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
}
function DiagIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
}

/* ── App root ─────────────────────────────────────────────────── */
export default function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const schema       = useTelemetryStore(s => s.schema)
  const initChecklist = useMissionStore(s => s.initChecklist)

  useEffect(() => { initChecklist(schema) }, [schema, initChecklist])

  useDemoSimulator('rocket', 10)
  useHardwareEvents()
  useMLPipeline()

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':    return <Dashboard />
      case '3d':           return <RocketView3D />
      case 'charts':       return <TelemetryCharts />
      case 'map':          return <LiveMap />
      case 'diagnostics':  return <PacketDiagnostics />
      case 'forecasting':  return <ForecastingModule />
      case 'float':        return <FloatTracker />
      case 'replay':       return <ReplayMode />
      case 'mission':      return <MissionControl />
      case 'hardware':     return <HardwareConfig />
      case 'ml':           return <MLInsights />
      default:             return <Dashboard />
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <main style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
          {renderView()}
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
