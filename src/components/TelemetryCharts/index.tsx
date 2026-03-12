import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, Legend,
} from 'recharts'
import { useTelemetryStore } from '../../store/telemetryStore'
import type { SensorField } from '../../types/schema'
import { format } from 'date-fns'

/* ── Safe-zone overlays (aerospace nominal bands) ─────────────── */
interface SafeZone { y1: number; y2: number; color: string; label: string }
const SAFE_ZONES: Record<string, SafeZone[]> = {
  orientation: [
    { y1: -30,  y2:  30, color: 'rgba(168,255,62,0.06)',  label: 'Safe pitch ±30°' },
  ],
  accel: [
    { y1: -5,   y2:  55, color: 'rgba(168,255,62,0.05)',  label: 'Nominal 0–55 m/s²' },
    { y1:  55,  y2: 200, color: 'rgba(255,184,0,0.04)',   label: 'Hi-G zone' },
  ],
  altitude: [
    { y1:  0,   y2: 2000, color: 'rgba(56,189,248,0.04)', label: 'Operating ceiling' },
  ],
  environment: [],
  system: [],
}

const CHART_GROUPS = [
  { id: 'orientation', label: 'Orientation (°)',     fields: ['pitch', 'yaw', 'roll'] },
  { id: 'accel',       label: 'Acceleration (m/s²)', fields: ['accelX', 'accelY', 'accelZ'] },
  { id: 'altitude',    label: 'Altitude (m)',         fields: ['altitude', 'baroAltitude'] },
  { id: 'environment', label: 'Environment',          fields: ['temperature', 'pressure'] },
  { id: 'system',      label: 'System',               fields: ['batteryVoltage', 'rssi'] },
]

/** Compute stats for a numeric field over all data points */
function computeStats(data: Array<{ [k: string]: number }>, key: string) {
  const values = data.map(d => d[key]).filter(v => typeof v === 'number' && isFinite(v)) as number[]
  if (values.length === 0) return null
  const n    = values.length
  const min  = Math.min(...values)
  const max  = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  const std  = Math.sqrt(variance)
  const sorted = [...values].sort((a, b) => a - b)
  const median = n % 2 === 0 ? (sorted[n/2-1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)]
  return { min, max, mean, std, median }
}

function StatsRow({ data, sensors }: {
  data: Array<{ ts: number; [k: string]: number }>
  sensors: SensorField[]
}) {
  if (data.length === 0) return null
  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', padding: '5px 0 2px',
      borderBottom: '1px solid var(--border)',
    }}>
      {sensors.map(s => {
        const st = computeStats(data, s.key)
        if (!st) return null
        return (
          <div key={s.key} style={{
            display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 10,
          }}>
            <span style={{ color: s.chartColor ?? 'var(--accent)', fontWeight: 700, fontSize: 9, letterSpacing: '0.06em' }}>
              {s.key.toUpperCase()}
            </span>
            {[
              { k: 'min', v: st.min },
              { k: 'max', v: st.max },
              { k: 'μ',   v: st.mean },
              { k: 'σ',   v: st.std },
              { k: 'med', v: st.median },
            ].map(({ k, v }) => (
              <span key={k} style={{ fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--text-dim)', fontSize: 8 }}>{k} </span>
                <span style={{ color: 'var(--text)', fontSize: 10 }}>{v.toFixed(1)}</span>
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function ChartPanel({
  groupId, title, data, sensors,
}: {
  groupId: string
  title: string
  data: Array<{ ts: number; [key: string]: number }>
  sensors: SensorField[]
}) {
  const zones = SAFE_ZONES[groupId] ?? []
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '10px 12px',
    }}>
      <div style={{
        fontSize: 9, color: 'var(--text-muted)', marginBottom: 6,
        fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
        fontFamily: 'var(--mono)',
      }}>
        {title}
      </div>

      <StatsRow data={data} sensors={sensors} />

      <div style={{ marginTop: 8 }}>
        <ResponsiveContainer width="100%" height={148}>
          <LineChart data={data} margin={{ top: 2, right: 6, bottom: 0, left: -14 }}>
            <CartesianGrid
              strokeDasharray="1 4"
              stroke="rgba(56,189,248,0.06)"
              horizontal vertical
            />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['auto', 'auto']}
              tickFormatter={v => format(new Date(v), 'HH:mm:ss')}
              tick={{ fill: '#253545', fontSize: 9, fontFamily: 'var(--mono)' }}
              tickCount={4}
              axisLine={{ stroke: 'rgba(56,189,248,0.1)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#253545', fontSize: 9, fontFamily: 'var(--mono)' }}
              tickCount={5}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: '#060d18',
                border: '1px solid rgba(56,189,248,0.2)',
                borderRadius: 4,
                fontSize: 10,
                fontFamily: 'var(--mono)',
                color: '#ccd8e8',
              }}
              labelStyle={{ color: '#38bdf8', fontSize: 9, marginBottom: 4 }}
              labelFormatter={v => format(new Date(Number(v)), 'HH:mm:ss.SSS')}
            />
            <Legend
              wrapperStyle={{ fontSize: 9, color: '#3e546a', fontFamily: 'var(--mono)', paddingTop: 4 }}
            />

            {/* Safe-zone shaded bands */}
            {zones.map((z, i) => (
              <ReferenceArea
                key={i}
                y1={z.y1} y2={z.y2}
                fill={z.color}
                fillOpacity={1}
                strokeOpacity={0}
                label={{ value: z.label, fill: 'rgba(168,255,62,0.20)', fontSize: 8, fontFamily: 'var(--mono)' }}
              />
            ))}

            {sensors.map(sensor => (
              <Line
                key={sensor.key}
                type="stepAfter"
                dataKey={sensor.key}
                name={`${sensor.label}${sensor.unit ? ` (${sensor.unit})` : ''}`}
                stroke={sensor.chartColor ?? '#38bdf8'}
                dot={false}
                isAnimationActive={false}
                strokeWidth={1.4}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function TelemetryCharts() {
  const schema = useTelemetryStore(s => s.schema)
  const sources = useTelemetryStore(s => s.sources)
  const [activeSource, setActiveSource] = useState(schema.sources[0]?.id ?? '')
  const [windowSec, setWindowSec] = useState(60)

  const chartSensors = schema.sensors.filter(s => s.chart)
  const cutoffTs = Date.now() - windowSec * 1000

  const groupData = useMemo(() => {
    const packets = (sources[activeSource]?.packets ?? []).filter(p => p.ts >= cutoffTs)
    const out: Record<string, Array<{ ts: number; [k: string]: number }>> = {}

    for (const group of CHART_GROUPS) {
      const groupSensors = chartSensors.filter(s => group.fields.includes(s.key))
      if (groupSensors.length === 0) continue

      out[group.id] = packets.map(p => {
        const pt: { ts: number; [k: string]: number } = { ts: p.ts }
        for (const s of groupSensors) {
          if (typeof p[s.key] === 'number') pt[s.key] = p[s.key] as number
        }
        return pt
      })
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, activeSource, cutoffTs])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--text-muted)',
          fontFamily: 'var(--mono)',
        }}>
          SOURCE
        </span>
        <select
          value={activeSource}
          onChange={e => setActiveSource(e.target.value)}
          style={{
            background: 'var(--surface-3)', border: '1px solid var(--border-bright)',
            color: 'var(--text)', borderRadius: 3, padding: '2px 7px',
            fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer',
          }}
        >
          {schema.sources.filter(s => s.enabled).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          {[15, 30, 60, 120, 300].map(sec => (
            <button
              key={sec}
              onClick={() => setWindowSec(sec)}
              style={{
                padding: '2px 7px', borderRadius: 3, fontSize: 10,
                border: '1px solid var(--border)',
                background: windowSec === sec ? 'rgba(168,255,62,0.15)' : 'var(--surface-3)',
                color: windowSec === sec ? 'var(--lime)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--mono)',
              }}
            >
              {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
            </button>
          ))}
        </div>
      </div>

      {/* Chart grid */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: 12,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
        gap: 10,
        alignContent: 'start',
      }}>
        {CHART_GROUPS.map(group => {
          const groupSensors = chartSensors.filter(s => group.fields.includes(s.key))
          const data = groupData[group.id] ?? []
          if (groupSensors.length === 0) return null
          return (
            <ChartPanel
              key={group.id}
              groupId={group.id}
              title={group.label}
              data={data}
              sensors={groupSensors}
            />
          )
        })}
      </div>
    </div>
  )
}
