import { useState, useEffect } from 'react'
import { useTelemetryStore } from './store/telemetryStore'
import { useMissionStore } from './store/missionStore'
import { useDemoSimulator } from './hooks/useWebSocket'
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

function Dashboard() {
  const schema = useTelemetryStore(s => s.schema)
  const sources = useTelemetryStore(s => s.sources)
  const mainSrc = schema.sources.find(s => s.enabled)
  const latest = mainSrc ? sources[mainSrc.id]?.latest : null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr 1fr',
      gap: 1,
      height: '100%',
      background: 'var(--border)',
    }}>
      <div style={{ background: 'var(--bg)', overflow: 'hidden' }}>
        <RocketView3D />
      </div>
      <div style={{ background: 'var(--bg)', overflow: 'hidden' }}>
        <TelemetryCharts />
      </div>
      <div style={{ background: 'var(--bg)', overflow: 'hidden' }}>
        <LiveMap />
      </div>
      <div style={{ background: 'var(--bg)', overflow: 'hidden' }}>
        <PacketDiagnostics />
      </div>
    </div>
  )
}

export default function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const schema = useTelemetryStore(s => s.schema)
  const initChecklist = useMissionStore(s => s.initChecklist)

  // Initialise mission checklist from schema
  useEffect(() => {
    initChecklist(schema)
  }, [schema, initChecklist])

  // Demo simulator — active by default; disable when real WebSocket connects
  useDemoSimulator('rocket', 10)

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
      default:             return <Dashboard />
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <main style={{
          flex: 1,
          overflow: 'hidden',
          background: 'var(--bg)',
        }}>
          {renderView()}
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
