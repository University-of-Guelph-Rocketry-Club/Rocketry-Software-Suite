import { useTelemetryStore } from '../../store/telemetryStore'
import type { TelemetryPacket } from '../../types/telemetry'

type HealthStatus = 'ok' | 'warn' | 'crit' | 'offline'

interface SubSystem {
  id: string
  label: string
  sublabel?: string
  evaluate: (latest: TelemetryPacket | null) => HealthStatus
}

const SUBSYSTEMS: SubSystem[] = [
  {
    id: 'gps-fix',
    label: 'GPS',
    sublabel: 'FIX',
    evaluate: (l) => {
      if (!l) return 'offline'
      return l.gpsFix ? 'ok' : 'crit'
    },
  },
  {
    id: 'gps-hdop',
    label: 'GPS',
    sublabel: 'HDOP',
    evaluate: (l) => {
      if (!l || l.gpsHdop === undefined) return 'offline'
      const h = l.gpsHdop as number
      return h < 2 ? 'ok' : h < 5 ? 'warn' : 'crit'
    },
  },
  {
    id: 'gps-sat',
    label: 'GPS',
    sublabel: 'SATS',
    evaluate: (l) => {
      if (!l || l.gpsSatellites === undefined) return 'offline'
      const s = l.gpsSatellites as number
      return s >= 6 ? 'ok' : s >= 3 ? 'warn' : 'crit'
    },
  },
  {
    id: 'imu',
    label: 'IMU',
    sublabel: 'QUAT',
    evaluate: (l) => {
      if (!l) return 'offline'
      const hasQuat = l.quatW !== undefined
      const hasEuler = l.pitch !== undefined
      return hasQuat ? 'ok' : hasEuler ? 'warn' : 'crit'
    },
  },
  {
    id: 'accel',
    label: 'ACCEL',
    sublabel: 'IMU',
    evaluate: (l) => {
      if (!l || l.accelX === undefined) return 'offline'
      const g = Math.sqrt(
        (l.accelX as number) ** 2 +
        (l.accelY as number ?? 0) ** 2 +
        (l.accelZ as number ?? 9.81) ** 2,
      ) / 9.80665
      return g > 12 ? 'crit' : g > 7 ? 'warn' : 'ok'
    },
  },
  {
    id: 'gyro',
    label: 'GYRO',
    sublabel: 'IMU',
    evaluate: (l) => {
      if (!l || l.gyroX === undefined) return 'offline'
      const mag = Math.sqrt(
        (l.gyroX as number) ** 2 +
        (l.gyroY as number ?? 0) ** 2 +
        (l.gyroZ as number ?? 0) ** 2,
      )
      return mag > 300 ? 'crit' : mag > 150 ? 'warn' : 'ok'
    },
  },
  {
    id: 'baro',
    label: 'BARO',
    sublabel: 'ALT',
    evaluate: (l) => {
      if (!l || l.baroAltitude === undefined) return 'offline'
      return 'ok'
    },
  },
  {
    id: 'pressure',
    label: 'PRES',
    sublabel: 'hPa',
    evaluate: (l) => {
      if (!l || l.pressure === undefined) return 'offline'
      const p = l.pressure as number
      return p < 200 ? 'warn' : 'ok'
    },
  },
  {
    id: 'temp',
    label: 'TEMP',
    sublabel: '°C',
    evaluate: (l) => {
      if (!l || l.temperature === undefined) return 'offline'
      const t = l.temperature as number
      return t > 60 ? 'crit' : t > 45 ? 'warn' : 'ok'
    },
  },
  {
    id: 'battery',
    label: 'BAT',
    sublabel: 'V',
    evaluate: (l) => {
      if (!l || l.batteryVoltage === undefined) return 'offline'
      const v = l.batteryVoltage as number
      return v < 3.2 ? 'crit' : v < 3.5 ? 'warn' : 'ok'
    },
  },
  {
    id: 'radio',
    label: 'RADIO',
    sublabel: 'RSSI',
    evaluate: (l) => {
      if (!l || l.rssi === undefined) return 'offline'
      const r = l.rssi as number
      return r < -95 ? 'crit' : r < -80 ? 'warn' : 'ok'
    },
  },
  {
    id: 'fsm',
    label: 'FSM',
    sublabel: 'STATE',
    evaluate: (l) => {
      if (!l || !l.state) return 'offline'
      return l.state === 'IDLE' ? 'warn' : 'ok'
    },
  },
]

const STATUS_LABEL: Record<HealthStatus, string> = {
  ok: 'GO',
  warn: 'CAUTION',
  crit: 'FAULT',
  offline: 'OFFLINE',
}

/** 4×3 sub-system health indicator matrix */
export function HealthMatrix({ sourceId }: { sourceId?: string }) {
  const schema  = useTelemetryStore(s => s.schema)
  const sid     = sourceId ?? schema.sources[0]?.id ?? 'rocket'
  const latest  = useTelemetryStore(s => s.sources[sid]?.latest ?? null)
  const connected = useTelemetryStore(s => s.sources[sid]?.connected ?? false)

  return (
    <div style={{ padding: '10px 12px', height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.10em',
        color: 'var(--text-muted)', textTransform: 'uppercase',
      }}>
        <span>Sub-system Health</span>
        <span style={{ marginLeft: 'auto', color: connected ? 'var(--lime)' : 'var(--magenta)' }}>
          ● {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      {/* Grid */}
      <div
        className="health-matrix"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)', flex: 1 }}
      >
        {SUBSYSTEMS.map(sys => {
          const status = connected ? sys.evaluate(latest) : 'offline'
          return (
            <div
              key={sys.id}
              className={`health-cell ${status}`}
              title={`${sys.label} ${sys.sublabel ?? ''}: ${STATUS_LABEL[status]}`}
            >
              <div className="health-cell-dot" />
              <div className="health-cell-label">
                {sys.label}
                {sys.sublabel && (
                  <div style={{ fontSize: 7, opacity: 0.7, marginTop: 1 }}>{sys.sublabel}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary counts */}
      {connected && (
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'center',
          fontSize: 9, fontFamily: 'var(--mono)',
          borderTop: '1px solid var(--border)', paddingTop: 6,
        }}>
          {(['ok', 'warn', 'crit'] as HealthStatus[]).map(s => {
            const count = SUBSYSTEMS.filter(sys => sys.evaluate(latest) === s).length
            const colors: Record<HealthStatus, string> = {
              ok: 'var(--lime)', warn: 'var(--amber)', crit: 'var(--magenta)', offline: 'var(--text-dim)'
            }
            return (
              <span key={s} style={{ color: colors[s] }}>
                {count} {s.toUpperCase()}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
