import { useState, useEffect } from 'react'
import { useTelemetryStore } from '../../store/telemetryStore'
import { useMissionStore } from '../../store/missionStore'
import { format } from 'date-fns'

const CRITICAL_FIELDS = [
  { key: 'batteryVoltage', label: 'Battery', unit: 'V',   warn: 3.5, crit: 3.2, decimals: 2 },
  { key: 'rssi',           label: 'RSSI',    unit: 'dBm', warn: -80, crit: -100, decimals: 0 },
  { key: 'temperature',    label: 'Temp',    unit: '°C',  warn: -30, crit: -50,  decimals: 1 },
]

function ValueCard({
  label, value, unit, warn, crit, decimals = 1, bold = false,
}: {
  label: string; value: number | undefined; unit: string;
  warn?: number; crit?: number; decimals?: number; bold?: boolean;
}) {
  const isWarn = warn !== undefined && value !== undefined && value < warn
  const isCrit = crit !== undefined && value !== undefined && value < crit
  const color = isCrit ? '#ff4444' : isWarn ? '#ffaa00' : '#44ff88'

  return (
    <div style={{
      background: 'var(--surface-raised)',
      border: `1px solid ${isCrit ? '#ff444466' : 'var(--border)'}`,
      borderRadius: 8,
      padding: '10px 14px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ fontSize: bold ? 28 : 20, fontWeight: 700, color, fontFamily: 'monospace', marginTop: 2 }}>
        {value !== undefined ? value.toFixed(decimals) : '—'}
        <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 3 }}>{unit}</span>
      </div>
    </div>
  )
}

export function InFlightDashboard() {
  const schema = useTelemetryStore(s => s.schema)
  const sources = useTelemetryStore(s => s.sources)
  const launchTime = useMissionStore(s => s.launchTime)
  const endMission = useMissionStore(s => s.endMission)

  const mainSource = schema.sources.find(s => s.enabled)
  const latest = mainSource ? sources[mainSource.id]?.latest : undefined
  const diag = mainSource ? sources[mainSource.id]?.diagnostics : undefined

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!launchTime) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [launchTime])

  const elapsedMs = launchTime ? now - launchTime : 0
  const elapsedStr = [
    Math.floor(elapsedMs / 3600000),
    Math.floor((elapsedMs % 3600000) / 60000),
    Math.floor((elapsedMs % 60000) / 1000),
  ].map(n => n.toString().padStart(2, '0')).join(':')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(0,212,255,0.03))',
        borderBottom: '1px solid var(--accent)',
        padding: '12px 20px',
        display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <span style={{
          fontSize: 26, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)',
          letterSpacing: '0.05em',
        }}>
          T+ {elapsedStr}
        </span>
        <div style={{ marginLeft: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Launch: {launchTime ? format(new Date(launchTime), 'HH:mm:ss dd/MM/yyyy') : '—'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: latest?.state ? 'var(--accent)' : 'var(--text)' }}>
            State: {latest?.state ?? '—'}
          </div>
        </div>
        <button
          onClick={endMission}
          style={{
            marginLeft: 'auto',
            padding: '6px 16px', borderRadius: 4, fontSize: 12,
            background: 'rgba(255,170,0,0.2)', border: '1px solid #ffaa00',
            color: '#ffaa00', cursor: 'pointer', fontWeight: 600,
          }}
        >
          End Mission → Recovery
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Primary telemetry grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 10,
          marginBottom: 20,
        }}>
          <ValueCard
            label="Altitude" unit="m"
            value={latest?.altitude ?? latest?.baroAltitude}
            decimals={1} bold
          />
          <ValueCard
            label="Baro Alt" unit="m"
            value={latest?.baroAltitude}
            decimals={1}
          />
          <ValueCard label="Pitch" unit="°"  value={latest?.pitch}  decimals={1} />
          <ValueCard label="Yaw"   unit="°"  value={latest?.yaw}    decimals={1} />
          <ValueCard label="Roll"  unit="°"  value={latest?.roll}   decimals={1} />
          <ValueCard label="Accel Z" unit="m/s²" value={latest?.accelZ} decimals={2} />
          <ValueCard label="Temp"  unit="°C" value={latest?.temperature} decimals={1} warn={-30} crit={-50} />
          <ValueCard label="Pressure" unit="hPa" value={latest?.pressure} decimals={1} />
          {CRITICAL_FIELDS.map(f => (
            <ValueCard
              key={f.key}
              label={f.label} unit={f.unit}
              value={latest?.[f.key] as number | undefined}
              warn={f.warn} crit={f.crit}
              decimals={f.decimals}
            />
          ))}
        </div>

        {/* GPS */}
        {latest?.latitude && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>📍 GPS</div>
            <div style={{ display: 'flex', gap: 24, fontSize: 13, fontFamily: 'monospace', flexWrap: 'wrap' }}>
              <span>Lat: <strong>{latest.latitude.toFixed(6)}°</strong></span>
              <span>Lon: <strong>{latest.longitude?.toFixed(6)}°</strong></span>
              <span>Fix: <strong style={{ color: latest.gpsFix ? '#44ff88' : '#ff4444' }}>
                {latest.gpsFix ? `YES (${latest.gpsSatellites ?? '?'} sats)` : 'NO'}
              </strong></span>
            </div>
          </div>
        )}

        {/* Stream stats */}
        {diag && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8, padding: '12px 16px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>📡 Link Quality</div>
            <div style={{ display: 'flex', gap: 24, fontSize: 12, flexWrap: 'wrap' }}>
              <span>Pkt/s: <strong style={{ color: 'var(--accent)' }}>{diag.packetsPerSecond.toFixed(1)}</strong></span>
              <span>Loss: <strong style={{ color: diag.packetLossEst > 0.05 ? '#ff4444' : '#44ff88' }}>
                {(diag.packetLossEst * 100).toFixed(1)}%
              </strong></span>
              <span>Latency: <strong>{diag.avgLatencyMs.toFixed(0)} ms</strong></span>
              <span>Total: <strong>{diag.totalPackets.toLocaleString()} pkts</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
