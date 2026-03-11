import { useTelemetryStore } from '../../store/telemetryStore'
import type { StreamDiagnostics } from '../../types/telemetry'

function healthColor(value: number, warn: number, crit: number, inverted = false) {
  if (inverted) {
    if (value >= crit) return '#ff4444'
    if (value >= warn) return '#ffaa00'
    return '#44ff88'
  }
  if (value <= crit) return '#ff4444'
  if (value <= warn) return '#ffaa00'
  return '#44ff88'
}

function Stat({
  label, value, unit, color,
}: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface-raised)',
      borderRadius: 8,
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--text)', fontFamily: 'monospace' }}>
        {value}<span style={{ fontSize: 12, fontWeight: 400, marginLeft: 3 }}>{unit}</span>
      </div>
    </div>
  )
}

function SourceDiagnostics({ diag, color }: { diag: StreamDiagnostics; color: string }) {
  const lossPercent = (diag.packetLossEst * 100).toFixed(1)
  const lossNum = diag.packetLossEst * 100

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${color}44`,
      borderRadius: 8,
      padding: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 12 }}>
        {diag.sourceId}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 8,
        marginBottom: 16,
      }}>
        <Stat label="Total Packets"  value={diag.totalPackets.toLocaleString()} />
        <Stat
          label="Packet Loss"
          value={lossPercent}
          unit="%"
          color={healthColor(lossNum, 5, 15, true)}
        />
        <Stat
          label="Avg Latency"
          value={diag.avgLatencyMs.toFixed(0)}
          unit="ms"
          color={healthColor(diag.avgLatencyMs, 100, 250, true)}
        />
        <Stat
          label="Pkt/s"
          value={diag.packetsPerSecond.toFixed(1)}
          color={healthColor(diag.packetsPerSecond, 1, 0.1)}
        />
        <Stat
          label="Out-of-Order"
          value={diag.outOfOrderCount.toLocaleString()}
          color={diag.outOfOrderCount > 0 ? '#ffaa00' : '#44ff88'}
        />
        <Stat
          label="Late Packets"
          value={diag.latePackets.toLocaleString()}
          color={diag.latePackets > 10 ? '#ffaa00' : '#44ff88'}
        />
      </div>

      {/* Loss bar */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          Packet health: {(100 - lossNum).toFixed(1)}%
        </div>
        <div style={{
          height: 6, background: 'var(--surface-raised)', borderRadius: 3, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.max(0, 100 - lossNum)}%`,
            background: healthColor(lossNum, 5, 15, true),
            borderRadius: 3,
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Sequence info */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
        Last seq: #{diag.lastSeq} · Last rcv: {
          diag.lastRcvTs > 0
            ? `${((Date.now() - diag.lastRcvTs) / 1000).toFixed(1)}s ago`
            : '—'
        }
      </div>
    </div>
  )
}

export function PacketDiagnostics() {
  const schema = useTelemetryStore(s => s.schema)
  const sources = useTelemetryStore(s => s.sources)

  const enabledSources = schema.sources.filter(s => s.enabled)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        fontSize: 13, fontWeight: 600, flexShrink: 0,
      }}>
        Packet Diagnostics
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: 16,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {enabledSources.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 40 }}>
            No sources enabled. Configure sources in the schema.
          </div>
        ) : (
          enabledSources.map(src => {
            const diag = sources[src.id]?.diagnostics
            if (!diag) return null
            return (
              <SourceDiagnostics key={src.id} diag={diag} color={src.color} />
            )
          })
        )}
      </div>
    </div>
  )
}
