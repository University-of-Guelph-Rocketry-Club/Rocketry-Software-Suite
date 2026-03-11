import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { useTelemetryStore } from '../../store/telemetryStore'
import type { SensorField } from '../../types/schema'
import { format } from 'date-fns'

const CHART_GROUPS = [
  { id: 'orientation', label: 'Orientation (°)',  fields: ['pitch', 'yaw', 'roll'] },
  { id: 'accel',       label: 'Acceleration (m/s²)', fields: ['accelX', 'accelY', 'accelZ'] },
  { id: 'altitude',    label: 'Altitude (m)',      fields: ['altitude', 'baroAltitude'] },
  { id: 'environment', label: 'Environment',       fields: ['temperature', 'pressure'] },
  { id: 'system',      label: 'System',            fields: ['batteryVoltage', 'rssi'] },
]

function ChartPanel({
  title,
  data,
  sensors,
}: {
  title: string
  data: Array<{ ts: number; [key: string]: number }>
  sensors: SensorField[]
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 12,
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
        {title}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 2, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={['auto', 'auto']}
            tickFormatter={v => format(new Date(v), 'HH:mm:ss')}
            tick={{ fill: '#7a8a9a', fontSize: 10 }}
            tickCount={5}
          />
          <YAxis
            tick={{ fill: '#7a8a9a', fontSize: 10 }}
            tickCount={5}
          />
          <Tooltip
            contentStyle={{
              background: '#0d1929',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 11,
            }}
            labelFormatter={v => format(new Date(Number(v)), 'HH:mm:ss.SSS')}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, color: 'var(--text-muted)' }}
          />
          {sensors.map(sensor => (
            <Line
              key={sensor.key}
              type="monotone"
              dataKey={sensor.key}
              name={`${sensor.label}${sensor.unit ? ` (${sensor.unit})` : ''}`}
              stroke={sensor.chartColor ?? '#00d4ff'}
              dot={false}
              isAnimationActive={false}
              strokeWidth={1.5}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
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

  // Build per-group chart data
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Telemetry Charts</span>

        {/* Source picker */}
        <select
          value={activeSource}
          onChange={e => setActiveSource(e.target.value)}
          style={{
            background: 'var(--surface-raised)', border: '1px solid var(--border)',
            color: 'var(--text)', borderRadius: 4, padding: '3px 8px', fontSize: 12,
          }}
        >
          {schema.sources.filter(s => s.enabled).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Window selector */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[15, 30, 60, 120, 300].map(sec => (
            <button
              key={sec}
              onClick={() => setWindowSec(sec)}
              style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 11,
                border: '1px solid var(--border)',
                background: windowSec === sec ? 'var(--accent)' : 'var(--surface-raised)',
                color: windowSec === sec ? '#000' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
            </button>
          ))}
        </div>
      </div>

      {/* Chart grid */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: 16,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))',
        gap: 12,
        alignContent: 'start',
      }}>
        {CHART_GROUPS.map(group => {
          const groupSensors = chartSensors.filter(s => group.fields.includes(s.key))
          const data = groupData[group.id] ?? []
          if (groupSensors.length === 0) return null
          return (
            <ChartPanel
              key={group.id}
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
