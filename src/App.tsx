import { useState, useEffect } from 'react'
import { useTelemetryStore } from './store/telemetryStore'
import { useMissionStore } from './store/missionStore'
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
import { GForceGauge } from './components/GForceGauge'
import { TMinus } from './components/TMinus'
import { HealthMatrix } from './components/HealthMatrix'
import { CommandTerminal } from './components/CommandTerminal'
import { SerialConnect } from './components/SerialConnect'

/* ══════════════════════════════════════════════════════════════
   Panel — shared frame used everywhere in the dashboard
   ══════════════════════════════════════════════════════════════ */
interface PanelProps {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
  accent?: string
  badge?: React.ReactNode
  noPad?: boolean
}

function Panel({ title, icon, children, style, accent, badge, noPad }: PanelProps) {
  const borderColor = accent
    ? `rgba(${accent}, 0.28)`
    : 'var(--border)'
  return (
    <div
      className="panel-glow"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...style,
      }}
    >
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '7px 12px',
        borderBottom: `1px solid ${borderColor}`,
        flexShrink: 0,
        background: accent
          ? `rgba(${accent}, 0.04)`
          : 'transparent',
      }}>
        {icon && (
          <span style={{ color: accent ? `rgb(${accent})` : 'var(--accent)', opacity: 0.85, lineHeight: 0 }}>
            {icon}
          </span>
        )}
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: accent ? `rgba(${accent},0.7)` : 'var(--text-muted)',
          flex: 1,
        }}>
          {title}
        </span>
        {badge}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', ...(noPad ? {} : {}) }}>
        {children}
      </div>
    </div>
  )
}

/* ── Live Stat pill used in the instrument bar ────────────────── */
function StatPill({
  label, value, unit, color, size = 'normal',
}: {
  label: string
  value: string | number
  unit?: string
  color?: string
  size?: 'normal' | 'large'
}) {
  const valColor = color ?? 'var(--text)'
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '8px 16px 7px',
      borderRight: '1px solid var(--border)',
      background: 'linear-gradient(180deg, rgba(56,189,248,0.05), rgba(2,8,16,0))',
      minWidth: size === 'large' ? 116 : 96,
      flexShrink: 0,
    }}>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: size === 'large' ? 26 : 22,
        fontWeight: 700,
        color: valColor,
        textShadow: color ? `0 0 10px ${color}` : 'none',
        lineHeight: 1,
        letterSpacing: '0.02em',
      }}>
        {value}{unit && (
          <span style={{
            fontSize: size === 'large' ? 12 : 11,
            fontWeight: 500,
            color: 'rgba(204,216,232,0.72)',
            marginLeft: 4,
          }}>
            {unit}
          </span>
        )}
      </div>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'rgba(204,216,232,0.62)',
        marginTop: 5,
      }}>
        {label}
      </div>
    </div>
  )
}

/* ── Tiny Scan-line overlay effect ────────────────────────────── */
function ScanOverlay() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none', overflow: 'hidden',
      borderRadius: 8,
      zIndex: 10,
    }}>
      {/* very subtle horizontal scan lines */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
      }} />
    </div>
  )
}

/* ── Instrument row — top of dashboard ───────────────────────── */
function InstrumentBar() {
  const schema  = useTelemetryStore(s => s.schema)
  const sid     = schema.sources[0]?.id ?? 'rocket'
  const latest  = useTelemetryStore(s => s.sources[sid]?.latest)
  const diag    = useTelemetryStore(s => s.sources[sid]?.diagnostics)
  const hasLink = useTelemetryStore(s => Object.values(s.sources).some(src => src.connected && src.diagnostics.totalPackets > 0))
  const phase   = useMissionStore(s => s.phase)

  const alt   = latest?.altitude ?? latest?.baroAltitude
  const vel   = latest?.velocityZ !== undefined ? Math.abs(Number(latest.velocityZ)) : undefined
  const pitch = latest?.pitch !== undefined ? Math.abs(Number(latest.pitch)) : undefined
  const batt  = latest?.batteryVoltage
  const rssi  = latest?.rssi
  const temp  = latest?.temperature
  const pps   = diag?.packetsPerSecond ?? 0

  const battColor = batt === undefined ? 'var(--text-dim)' : batt < 3.3 ? 'var(--magenta)' : batt < 3.6 ? 'var(--amber)' : 'var(--lime)'
  const rssiColor = rssi === undefined ? 'var(--text-dim)' : rssi < -90 ? 'var(--magenta)' : rssi < -75 ? 'var(--amber)' : 'var(--lime)'
  const velColor  = vel === undefined ? 'var(--text-dim)' : vel > 200 ? 'var(--magenta)' : vel > 100 ? 'var(--amber)' : 'var(--accent)'
  const pitchColor = pitch === undefined ? 'var(--text-dim)' : pitch > 60 ? 'var(--magenta)' : pitch > 30 ? 'var(--amber)' : 'var(--lime)'

  // FSM state badge
  const stateStr = hasLink
    ? ((latest?.state as string | undefined)?.toUpperCase() ?? phase.toUpperCase().replace('-', ' '))
    : 'LINK DOWN'
  const stateColor = !hasLink
    ? 'var(--text-dim)'
    : stateStr.includes('BOOST') || stateStr.includes('FLIGHT')
    ? 'var(--accent)'
    : stateStr.includes('APOG') || stateStr.includes('COAST')
    ? 'var(--lime)'
    : stateStr.includes('LAND') || stateStr.includes('RECOV')
    ? 'var(--amber)'
    : 'var(--text-muted)'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      height: 72,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflowX: 'auto',
      overflowY: 'hidden',
      flexShrink: 0,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      {/* FSM State — leftmost branded cell */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 18px',
        borderRight: '1px solid var(--border)',
        background: 'linear-gradient(180deg, rgba(56,189,248,0.10), rgba(56,189,248,0.03))',
        gap: 3,
        minWidth: 124,
        flexShrink: 0,
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: stateColor,
          boxShadow: `0 0 8px ${stateColor}`,
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            border: `1px solid ${stateColor}`,
            animation: 'pulse-ring 2s ease-out infinite',
          }} />
        </div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
          color: stateColor, letterSpacing: '0.08em',
          textAlign: 'center',
        }}>
          {stateStr}
        </div>
      </div>

      {/* Altitude */}
      <StatPill
        label="ALTITUDE"
        value={alt !== undefined ? alt.toFixed(1) : '--'}
        unit="m"
        color="var(--ml)"
      />

      {/* Velocity */}
      <StatPill
        label="VELOCITY"
        value={vel !== undefined ? vel.toFixed(1) : '--'}
        unit="m/s"
        color={velColor}
      />

      {/* Pitch */}
      <StatPill
        label="PITCH"
        value={pitch !== undefined ? pitch.toFixed(1) : '--'}
        unit="°"
        color={pitchColor}
      />

      {/* Battery */}
      <StatPill
        label="BATT"
        value={batt !== undefined ? batt.toFixed(2) : '--'}
        unit="V"
        color={battColor}
      />

      {/* RSSI */}
      <StatPill
        label="RSSI"
        value={rssi !== undefined ? rssi.toFixed(0) : '--'}
        unit="dBm"
        color={rssiColor}
      />

      {/* PPS */}
      <StatPill
        label="PKT/S"
        value={pps.toFixed(1)}
        color="var(--accent)"
      />

      {/* Temperature */}
      <StatPill
        label="TEMP"
        value={temp !== undefined ? temp.toFixed(1) : '--'}
        unit="°C"
        color="var(--text)"
      />

      {/* flex spacer — pushes gear to the right */}
      <div style={{ flex: 1 }} />

      {/* G-Force gauge embedded right in the bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 12px',
        borderLeft: '1px solid var(--border)',
        gap: 2,
        overflow: 'hidden',
        maxHeight: 72,
        minWidth: 86,
        background: 'linear-gradient(180deg, rgba(167,139,250,0.08), rgba(2,8,16,0))',
      }}>
        {/* Inline mini gauge — just the SVG arc portion at tiny scale */}
        <MiniGForge />
      </div>
    </div>
  )
}

/* ── Compact G-Force readout for the instrument bar ─────────── */
function MiniGForge() {
  const schema = useTelemetryStore(s => s.schema)
  const sid    = schema.sources[0]?.id ?? 'rocket'
  const latest = useTelemetryStore(s => s.sources[sid]?.latest)

  if (!latest) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '0 8px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>--</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 7.5, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-dim)' }}>
          NO IMU
        </div>
      </div>
    )
  }

  const ax = Number(latest?.accelX ?? 0)
  const ay = Number(latest?.accelY ?? 0)
  const az = Number(latest?.accelZ ?? 9.81)
  const g  = Math.sqrt(ax ** 2 + ay ** 2 + az ** 2) / 9.80665
  const color = g >= 8 ? '#ff0055' : g >= 3 ? '#ffb800' : '#a8ff3e'
  const label = g < 3 ? 'NOMINAL' : g < 8 ? 'HI-G' : 'ABORT'

  // Arc: 220° span, R=22
  const G_MAX = 15, R = 22, CX = 28, CY = 30
  const START = 160, SPAN = 220
  function arc(s: number, e: number) {
    const sr = (s - 90) * Math.PI / 180
    const er = (e - 90) * Math.PI / 180
    const x1 = CX + R * Math.cos(sr), y1 = CY + R * Math.sin(sr)
    const x2 = CX + R * Math.cos(er), y2 = CY + R * Math.sin(er)
    const lg = (e - s) > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2}`
  }
  const needleDeg = START + (Math.min(g, G_MAX) / G_MAX) * SPAN

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <svg width={56} height={42} viewBox="0 0 56 42" style={{ overflow: 'visible' }}>
        <path d={arc(START, START + SPAN)} stroke="rgba(56,189,248,0.10)" strokeWidth={5} fill="none" strokeLinecap="round" />
        <path d={arc(START + (3/G_MAX)*SPAN, START + (8/G_MAX)*SPAN)} stroke="rgba(255,184,0,0.20)" strokeWidth={5} fill="none" />
        <path d={arc(START + (8/G_MAX)*SPAN, START + SPAN)} stroke="rgba(255,0,85,0.18)" strokeWidth={5} fill="none" />
        <path d={arc(START, needleDeg)} stroke={color} strokeWidth={5} fill="none" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
        <circle cx={CX} cy={CY} r={3} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        <circle cx={CX} cy={CY} r={1.5} fill="#020408" />
        <text x={CX} y={CY + R + 10} textAnchor="middle" fill={color}
          fontSize={10} fontFamily="var(--mono)" fontWeight={700}
          style={{ textShadow: `0 0 8px ${color}` }}
        >
          {g.toFixed(1)}g
        </text>
      </svg>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 7.5, fontWeight: 600,
        letterSpacing: '0.1em', color: color, marginTop: -4,
      }}>
        {label}
      </div>
    </div>
  )
}

/* ═══════════════════════ MAIN DASHBOARD ════════════════════════ */
function Dashboard() {
  const [terminalOpen, setTerminalOpen] = useState(true)
  const terminalHeight = terminalOpen ? 170 : 32

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap: 6,
      padding: 8,
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>

      {/* ── Row 1: Instrument bar ─────────────────────────── */}
      <InstrumentBar />

      {/* ── Row 2: T-Minus | Health Matrix | Main panes ──── */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '164px 174px 1fr 1fr 1fr',
        gap: 6,
        minHeight: 0,
      }}>

        {/* T-Minus clock */}
        <Panel
          title="T-MINUS"
          icon={<ClockIcon />}
          accent="168,255,62"
          style={{ overflow: 'visible' }}
        >
          <div style={{ padding: '8px 10px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TMinus />
          </div>
        </Panel>

        {/* Health Matrix */}
        <Panel
          title="SYS HEALTH"
          icon={<GridIcon />}
          accent="56,189,248"
        >
          <div style={{ padding: '8px 10px', height: '100%', overflow: 'auto' }}>
            <HealthMatrix />
          </div>
        </Panel>

        {/* 3D Attitude */}
        <Panel
          title="3D ATTITUDE"
          icon={<CubeIcon />}
          badge={<AttitudeBadge />}
          style={{ position: 'relative' }}
        >
          <ScanOverlay />
          <RocketView3D />
        </Panel>

        {/* Telemetry Charts */}
        <Panel
          title="TELEMETRY CHARTS"
          icon={<ChartIcon />}
          accent="167,139,250"
        >
          <TelemetryCharts />
        </Panel>

        {/* Live Map */}
        <Panel
          title="VECTOR MAP"
          icon={<MapIcon />}
          accent="56,189,248"
          badge={
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 600,
              color: 'var(--lime)', letterSpacing: '0.1em',
              background: 'rgba(168,255,62,0.08)',
              border: '1px solid rgba(168,255,62,0.2)',
              borderRadius: 3, padding: '1px 5px',
            }}>LIVE</span>
          }
        >
          <LiveMap />
        </Panel>
      </div>

      {/* ── Row 3: Command Terminal ───────────────────────── */}
      <div style={{
        height: terminalHeight,
        transition: 'height 0.2s ease',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {/* Terminal header with toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 12px',
          borderBottom: terminalOpen ? '1px solid var(--border)' : 'none',
          flexShrink: 0,
          background: 'rgba(168,255,62,0.03)',
          cursor: 'pointer',
          userSelect: 'none',
        }} onClick={() => setTerminalOpen(v => !v)}>
          <span style={{ color: 'var(--lime)', opacity: 0.85, lineHeight: 0 }}>
            <TerminalIcon />
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'rgba(168,255,62,0.6)',
            flex: 1,
          }}>
            RAW PACKET LOG
          </span>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9,
            color: 'var(--text-dim)',
          }}>
            {terminalOpen ? '▼ COLLAPSE' : '▶ EXPAND'}
          </span>
        </div>
        {terminalOpen && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CommandTerminal />
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Tiny badge shown inside 3D panel header ─────────────────── */
function AttitudeBadge() {
  const schema = useTelemetryStore(s => s.schema)
  const sid    = schema.sources[0]?.id ?? 'rocket'
  const latest = useTelemetryStore(s => s.sources[sid]?.latest)
  const hasQ   = latest?.quatW !== undefined
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 600,
      color: hasQ ? 'var(--lime)' : 'var(--amber)',
      letterSpacing: '0.1em',
      background: hasQ ? 'rgba(168,255,62,0.08)' : 'rgba(255,184,0,0.08)',
      border: `1px solid ${hasQ ? 'rgba(168,255,62,0.2)' : 'rgba(255,184,0,0.22)'}`,
      borderRadius: 3, padding: '1px 5px',
    }}>
      {hasQ ? 'QUAT' : 'EULER'}
    </span>
  )
}

/* ── Panel icons ─────────────────────────────────────────────── */
function CubeIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
}
function ChartIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
}
function MapIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
}
function ClockIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
}
function GridIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}
function TerminalIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
}
function SerialIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="12" y1="6" x2="12" y2="6.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>
}

/* ══════════════════════════════════════════════════════════════
   App root
   ══════════════════════════════════════════════════════════════ */
export default function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const schema        = useTelemetryStore(s => s.schema)
  const initChecklist = useMissionStore(s => s.initChecklist)

  useEffect(() => { initChecklist(schema) }, [schema, initChecklist])

  useHardwareEvents()
  useMLPipeline()

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':    return <Dashboard />
      case '3d':           return <FullPanel title="3D ATTITUDE" icon={<CubeIcon />}><RocketView3D /></FullPanel>
      case 'charts':       return <FullPanel title="TELEMETRY CHARTS" icon={<ChartIcon />}><TelemetryCharts /></FullPanel>
      case 'map':          return <FullPanel title="VECTOR MAP" icon={<MapIcon />}><LiveMap /></FullPanel>
      case 'diagnostics':  return <FullPanel title="PACKET DIAGNOSTICS" icon={<ClockIcon />}><PacketDiagnostics /></FullPanel>
      case 'forecasting':  return <FullPanel title="FORECASTING" icon={<ChartIcon />}><ForecastingModule /></FullPanel>
      case 'float':        return <FullPanel title="HAB TRACKER" icon={<MapIcon />}><FloatTracker /></FullPanel>
      case 'replay':       return <FullPanel title="REPLAY MODE" icon={<ClockIcon />}><ReplayMode /></FullPanel>
      case 'mission':      return <FullPanel title="MISSION CONTROL" icon={<GridIcon />}><MissionControl /></FullPanel>
      case 'hardware':     return <FullPanel title="HARDWARE CONFIG" icon={<GridIcon />}><HardwareConfig /></FullPanel>
      case 'ml':           return <FullPanel title="ML INSIGHTS" icon={<ChartIcon />}><MLInsights /></FullPanel>
      case 'serial':       return <FullPanel title="SERIAL LINK" icon={<SerialIcon />}><SerialConnect /></FullPanel>
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

/* ── Full-screen single-panel wrapper for non-dashboard views ── */
function FullPanel({ title, icon, children }: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ padding: 8, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <Panel title={title} icon={icon} style={{ flex: 1 }}>
        {children}
      </Panel>
    </div>
  )
}
