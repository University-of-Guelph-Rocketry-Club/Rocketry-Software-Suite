import { useMemo } from 'react'
import { useTelemetryStore } from '../../store/telemetryStore'
import { useMissionStore } from '../../store/missionStore'
import { useMLStore } from '../../store/mlStore'

function Sep() {
  return <span style={{ width: 1, height: 14, background: 'var(--border-bright)', flexShrink: 0 }} />
}

function Stat({
  label, value, color, mono = true,
}: { label: string; value: string | number; color?: string; mono?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{
        fontFamily: mono ? 'var(--mono)' : 'inherit',
        fontSize: 12, fontWeight: 600,
        color: color ?? 'var(--text)',
      }}>
        {value}
      </span>
    </span>
  )
}

export function StatusBar() {
  const sources    = useTelemetryStore(s => s.sources)
  const schema     = useTelemetryStore(s => s.schema)
  const phase      = useMissionStore(s => s.phase)
  const launchTime = useMissionStore(s => s.launchTime)
  const mlInsights = useMLStore(s => s.insights)

  const elapsed = useMemo(() => {
    if (!launchTime) return '--:--:--'
    const ms = Date.now() - launchTime
    const h  = Math.floor(ms / 3600000).toString().padStart(2, '0')
    const m  = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0')
    const s  = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0')
    return `T+ ${h}:${m}:${s}`
  }, [launchTime])

  const mainSource = sources[schema.sources[0]?.id ?? '']
  const latest     = mainSource?.latest

  const battV      = latest?.batteryVoltage ?? 4
  const rssi       = latest?.rssi ?? -50
  const alt        = (latest?.altitude ?? latest?.baroAltitude ?? 0) as number
  const vel        = Math.abs((latest?.velocityZ ?? 0) as number)

  const battColor  = (battV as number) < 3.3 ? 'var(--red)' : (battV as number) < 3.6 ? 'var(--yellow)' : 'var(--green)'
  const rssiColor  = (rssi as number) < -90 ? 'var(--red)' : (rssi as number) < -75 ? 'var(--yellow)' : 'var(--green)'

  // ML anomaly score for status bar indicator
  const anomScore  = mlInsights.anomalyScore?.composite ?? 0
  const anomColor  = anomScore > 0.7 ? 'var(--red)' : anomScore > 0.4 ? 'var(--yellow)' : 'var(--ml)'

  return (
    <footer style={{
      height: 30,
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      gap: 12,
      fontSize: 11,
      color: 'var(--text-muted)',
      flexShrink: 0,
    }}>
      {/* Mission clock */}
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
        color: 'var(--accent)', letterSpacing: '0.06em',
      }}>
        {elapsed}
      </span>

      <Sep />

      <Stat label="Phase" value={phase.replace('-', ' ').toUpperCase()} color="var(--text)" mono={false} />

      {latest && (
        <>
          <Sep />
          <Stat label="ALT" value={`${(alt as number).toFixed(1)} m`} color="var(--ml)" />
          <Sep />
          <Stat label="VEL" value={`${vel.toFixed(1)} m/s`} color="var(--accent)" />
          <Sep />
          <Stat label="BATT" value={`${(battV as number).toFixed(2)} V`} color={battColor} />
          <Sep />
          <Stat label="RSSI" value={`${(rssi as number).toFixed(0)} dBm`} color={rssiColor} />
          {latest.state && (
            <>
              <Sep />
              <Stat label="STATE" value={latest.state as string} color="var(--accent)" />
            </>
          )}
        </>
      )}

      {/* ML anomaly indicator */}
      <Sep />
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ML</span>
        <div style={{ position: 'relative', width: 6, height: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: anomColor,
            boxShadow: anomScore > 0.4 ? `0 0 8px ${anomColor}` : 'none',
          }} />
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: anomColor }}>
          {Math.round(anomScore * 100)}
        </span>
      </span>

      {/* Stream rates — right-aligned */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {schema.sources.filter(s => s.enabled).map(src => (
          <span key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: sources[src.id]?.connected ? 'var(--green)' : 'var(--red)',
              boxShadow: sources[src.id]?.connected ? 'var(--green-glow)' : 'none',
            }} />
            <span style={{ color: src.color, fontSize: 10 }}>{src.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              {(sources[src.id]?.diagnostics.packetsPerSecond ?? 0).toFixed(1)}/s
            </span>
          </span>
        ))}
      </div>
    </footer>
  )
}
