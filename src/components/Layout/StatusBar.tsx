import { useMemo } from 'react'
import { useTelemetryStore } from '../../store/telemetryStore'
import { useMissionStore } from '../../store/missionStore'

export function StatusBar() {
  const sources = useTelemetryStore(s => s.sources)
  const schema = useTelemetryStore(s => s.schema)
  const phase = useMissionStore(s => s.phase)
  const launchTime = useMissionStore(s => s.launchTime)

  const elapsed = useMemo(() => {
    if (!launchTime) return '--:--:--'
    const ms = Date.now() - launchTime
    const h  = Math.floor(ms / 3600000).toString().padStart(2, '0')
    const m  = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0')
    const s  = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0')
    return `T+${h}:${m}:${s}`
  }, [launchTime])

  const mainSource = sources[schema.sources[0]?.id ?? '']
  const latest = mainSource?.latest

  return (
    <footer style={{
      height: 32,
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 24,
      fontSize: 11,
      color: 'var(--text-muted)',
      flexShrink: 0,
    }}>
      {/* Mission clock */}
      <span style={{ color: 'var(--accent)', fontWeight: 600, fontFamily: 'monospace' }}>
        {elapsed}
      </span>

      <span>Phase: <strong style={{ color: 'var(--text)' }}>{phase.toUpperCase()}</strong></span>

      {latest && (
        <>
          <span>ALT: <strong style={{ color: '#cc44ff' }}>
            {(latest.altitude ?? latest.baroAltitude ?? 0).toFixed(1)} m
          </strong></span>
          <span>BATT: <strong style={{
            color: (latest.batteryVoltage ?? 4) < 3.3 ? '#ff4444' : '#44ff88',
          }}>
            {(latest.batteryVoltage ?? 0).toFixed(2)} V
          </strong></span>
          <span>RSSI: <strong style={{
            color: (latest.rssi ?? -50) < -90 ? '#ff4444' : (latest.rssi ?? -50) < -75 ? '#ffaa00' : '#44ff88',
          }}>
            {(latest.rssi ?? 0).toFixed(0)} dBm
          </strong></span>
          {latest.state && (
            <span>STATE: <strong style={{ color: 'var(--accent)' }}>{latest.state}</strong></span>
          )}
        </>
      )}

      <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
        {schema.sources.filter(s => s.enabled).map(s => (
          <span key={s.id} style={{ marginLeft: 12 }}>
            <span style={{
              display: 'inline-block',
              width: 6, height: 6, borderRadius: '50%', marginRight: 4,
              background: sources[s.id]?.connected ? '#44ff88' : '#ff4444',
            }} />
            {s.name}: {sources[s.id]?.diagnostics.packetsPerSecond.toFixed(1)} pkt/s
          </span>
        ))}
      </span>
    </footer>
  )
}
