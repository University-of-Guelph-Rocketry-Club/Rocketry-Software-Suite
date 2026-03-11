import { useState, useCallback } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useTelemetryStore } from '../../store/telemetryStore'
import { NoFlyZones } from '../LiveMap/NoFlyZones'
import { fetchWindLayers, habFloatDrift } from '../../utils/forecasting'
import type { WindLayer, TrajectoryPoint } from '../../types/telemetry'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

// International Standard Atmosphere helper for burst altitude estimation
function burstAltitude(
  balloonVolumeLiters: number,
  balloonMassG: number,
  payloadMassG: number,
): number {
  // Empirical HAB burst model (simplified)
  const fillVolume = balloonVolumeLiters
  const totalMassKg = (balloonMassG + payloadMassG) / 1000
  // Neck lift in grams ≈ Lorentz model; burst alt ~ 33000 - 1000*(total fill adj.)
  const burstVol = Math.pow((balloonVolumeLiters * 1.15) / fillVolume, 1.3) * 30000
  return Math.min(Math.max(burstVol - totalMassKg * 300, 15000), 42000)
}

function ascendRate(
  neckLiftG: number,
  payloadMassG: number,
  balloonMassG: number,
): number {
  // Simplified ascent rate estimation
  const netLiftN = ((neckLiftG - payloadMassG - balloonMassG) / 1000) * 9.81
  return Math.max(1, netLiftN * 0.5)  // ~0-10 m/s typical
}

export function FloatTracker() {
  const schema = useTelemetryStore(s => s.schema)
  const sources = useTelemetryStore(s => s.sources)
  const mainSrc = schema.sources.find(s => s.enabled)
  const latest = mainSrc ? sources[mainSrc.id]?.latest : null

  const lat = latest?.latitude ?? 43.5448
  const lon = latest?.longitude ?? -80.2482

  const [balloonVolL, setBalloonVolL]   = useState(1000)   // litres
  const [balloonMassG, setBalloonMassG] = useState(600)    // grams
  const [payloadMassG, setPayloadMassG] = useState(800)    // grams
  const [neckLiftG, setNeckLiftG]       = useState(1200)   // grams
  const [floatDurMin, setFloatDurMin]   = useState(60)     // minutes
  const [layers, setLayers]             = useState<WindLayer[]>([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [result, setResult]             = useState<{
    ascentTrajectory: TrajectoryPoint[]
    floatTrajectory: TrajectoryPoint[]
    floatAltM: number
    ascRateMs: number
    burstAlt: number
  } | null>(null)

  const handleRun = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const windLayers = await fetchWindLayers(lat, lon)
      setLayers(windLayers)

      const floatAltM = burstAltitude(balloonVolL, balloonMassG, payloadMassG) * 0.7 // float at 70% of burst
      const ascRateMs = ascendRate(neckLiftG, payloadMassG, balloonMassG)
      const burstAlt  = burstAltitude(balloonVolL, balloonMassG, payloadMassG)

      const { ascentTrajectory, floatTrajectory } = habFloatDrift(
        lat, lon, floatAltM, floatDurMin * 60, ascRateMs, windLayers,
      )

      setResult({ ascentTrajectory, floatTrajectory, floatAltM, ascRateMs, burstAlt })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [lat, lon, balloonVolL, balloonMassG, payloadMassG, neckLiftG, floatDurMin])

  // combined trajectory for chart (not currently used in template)
  const ascentMap: [number, number][] = result?.ascentTrajectory.map(p => [p.latitude, p.longitude]) ?? []
  const floatMap: [number, number][] = result?.floatTrajectory.map(p => [p.latitude, p.longitude]) ?? []
  const floatEnd = result?.floatTrajectory[result.floatTrajectory.length - 1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>🎈 HAB Float Tracker</span>

        {([
          ['Balloon Vol (L)',  balloonVolL,  setBalloonVolL],
          ['Balloon Mass (g)', balloonMassG, setBalloonMassG],
          ['Payload (g)',      payloadMassG, setPayloadMassG],
          ['Neck Lift (g)',    neckLiftG,    setNeckLiftG],
          ['Float Duration (min)', floatDurMin, setFloatDurMin],
        ] as const).map(([label, val, setter]) => (
          <label key={label} style={{ display: 'flex', flexDirection: 'column', fontSize: 10, color: 'var(--text-muted)' }}>
            {label}
            <input
              type="number"
              value={val}
              onChange={e => (setter as (v: number) => void)(Number(e.target.value))}
              style={{
                width: 80, background: 'var(--surface-raised)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '3px 7px', color: 'var(--text)', fontSize: 12, marginTop: 2,
              }}
            />
          </label>
        ))}

        <button
          onClick={handleRun}
          disabled={loading}
          style={{
            padding: '6px 16px', borderRadius: 4, fontSize: 12, fontWeight: 600,
            background: loading ? 'var(--surface-raised)' : 'var(--accent)',
            border: '1px solid var(--border)',
            color: loading ? 'var(--text-muted)' : '#000',
            cursor: loading ? 'wait' : 'pointer',
            alignSelf: 'flex-end',
          }}
        >
          {loading ? '⏳ Calculating…' : '🌐 Calculate Float'}
        </button>

        {error && <span style={{ color: '#ff4444', fontSize: 11 }}>⚠ {error}</span>}
      </div>

      {/* Results summary */}
      {result && (
        <div style={{
          display: 'flex', gap: 16, padding: '10px 16px',
          borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap',
        }}>
          {[
            { label: 'Float Altitude', val: `${(result.floatAltM / 1000).toFixed(1)} km` },
            { label: 'Burst Altitude', val: `${(result.burstAlt / 1000).toFixed(1)} km` },
            { label: 'Ascent Rate',    val: `${result.ascRateMs.toFixed(1)} m/s` },
            { label: 'Time to Float',  val: `${(result.floatAltM / result.ascRateMs / 60).toFixed(0)} min` },
          ].map(({ label, val }) => (
            <div key={label} style={{ fontSize: 11 }}>
              <div style={{ color: 'var(--text-muted)' }}>{label}</div>
              <div style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: 'monospace', fontSize: 14 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '1fr 320px',
        overflow: 'hidden',
      }}>
        {/* Map */}
        <div style={{ borderRight: '1px solid var(--border)' }}>
          <MapContainer center={[lat, lon]} zoom={9} style={{ width: '100%', height: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <NoFlyZones />

            <CircleMarker center={[lat, lon]} radius={8} pathOptions={{ color: '#44ff88', fillColor: '#44ff88', fillOpacity: 0.8 }}>
              <Popup>Launch site</Popup>
            </CircleMarker>

            {ascentMap.length > 1 && (
              <Polyline positions={ascentMap} pathOptions={{ color: '#44ff88', weight: 2 }} />
            )}
            {floatMap.length > 1 && (
              <Polyline positions={floatMap} pathOptions={{ color: '#00d4ff', weight: 2, dashArray: '8 4' }} />
            )}
            {floatEnd && (
              <CircleMarker center={[floatEnd.latitude, floatEnd.longitude]} radius={8}
                pathOptions={{ color: '#ff4444', fillColor: '#ff4444', fillOpacity: 0.8 }}>
                <Popup>Predicted float end ({floatDurMin} min)</Popup>
              </CircleMarker>
            )}
          </MapContainer>
        </div>

        {/* Altitude chart + wind info */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 12, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Altitude Profile</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={result?.ascentTrajectory.concat(
                  result.floatTrajectory.map(p => ({ ...p, timeOffsetSec: p.timeOffsetSec + (result.floatAltM / result.ascRateMs) }))
                ) ?? []}
                margin={{ top: 2, right: 8, bottom: 0, left: -10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="timeOffsetSec" tick={{ fill: '#7a8a9a', fontSize: 10 }} tickFormatter={v => `${Math.round(v / 60)}m`} />
                <YAxis tick={{ fill: '#7a8a9a', fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(1)}k`} />
                <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid var(--border)', fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="altitudeM" name="Altitude (m)" stroke="#00d4ff" dot={false} isAnimationActive={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Wind layers */}
          <div style={{ borderTop: '1px solid var(--border)', padding: 12, overflowY: 'auto' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Wind Layers</div>
            {layers.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Run calculation to fetch wind data.</div>
            ) : layers.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: 'monospace', padding: '4px 0' }}>
                <span style={{ color: 'var(--text-muted)', width: 50 }}>{l.altitudeM}m</span>
                <span style={{ color: 'var(--accent)' }}>{l.speedMs.toFixed(1)} m/s</span>
                <span>{l.directionDeg.toFixed(0)}°</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
