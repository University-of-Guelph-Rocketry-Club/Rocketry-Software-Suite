import { useState, useCallback } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTelemetryStore } from '../../store/telemetryStore'
import { NoFlyZones } from '../LiveMap/NoFlyZones'
import {
  fetchWindLayers, predictTrajectory, type OpenMeteoWindResponse,
} from '../../utils/forecasting'
import type { WindLayer, TrajectoryPoint } from '../../types/telemetry'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap()
  if (points.length > 1) {
    map.fitBounds(points)
  }
  return null
}

export function ForecastingModule() {
  const schema = useTelemetryStore(s => s.schema)
  const sources = useTelemetryStore(s => s.sources)
  const mainSrc = schema.sources.find(s => s.enabled)
  const latest = mainSrc ? sources[mainSrc.id]?.latest : null

  const [windLayers, setWindLayers] = useState<WindLayer[]>([])
  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initVz, setInitVz] = useState(150)   // m/s initial vertical velocity
  const [simDurationSec, setSimDurationSec] = useState(120)

  const lat = latest?.latitude ?? 43.5448
  const lon = latest?.longitude ?? -80.2482
  const alt = latest?.altitude ?? 0

  const handleFetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const layers = await fetchWindLayers(lat, lon)
      setWindLayers(layers)

      const traj = predictTrajectory(lat, lon, alt, initVz, simDurationSec, 1, layers)
      setTrajectory(traj)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [lat, lon, alt, initVz, simDurationSec])

  const landingPoint = trajectory[trajectory.length - 1]
  const maxAlt = Math.max(...trajectory.map(p => p.altitudeM))

  const mapPoints: Array<[number, number]> = trajectory.map(p => [p.latitude, p.longitude])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>🌤️ Atmospheric Path Forecasting</span>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Init Vz (m/s)</label>
          <input
            type="number"
            value={initVz}
            onChange={e => setInitVz(Number(e.target.value))}
            style={inputStyle}
          />
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Duration (s)</label>
          <input
            type="number"
            value={simDurationSec}
            onChange={e => setSimDurationSec(Number(e.target.value))}
            style={inputStyle}
          />
        </div>

        <button
          onClick={handleFetch}
          disabled={loading}
          style={{
            padding: '5px 16px', borderRadius: 4, fontSize: 12, fontWeight: 600,
            background: loading ? 'var(--surface-raised)' : 'var(--accent)',
            border: '1px solid var(--border)',
            color: loading ? 'var(--text-muted)' : '#000',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? '⏳ Fetching…' : '🌐 Fetch Wind & Predict'}
        </button>

        {error && <span style={{ color: '#ff4444', fontSize: 12 }}>⚠ {error}</span>}

        {landingPoint && (
          <span style={{ fontSize: 12, color: '#44ff88', fontFamily: 'monospace', marginLeft: 'auto' }}>
            Landing: {landingPoint.latitude.toFixed(5)}, {landingPoint.longitude.toFixed(5)} | Max Alt: {maxAlt.toFixed(0)}m
          </span>
        )}
      </div>

      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '1fr 320px',
        gridTemplateRows: '1fr 220px',
        gap: 0, overflow: 'hidden',
      }}>
        {/* Map */}
        <div style={{ gridRow: '1 / 3', borderRight: '1px solid var(--border)' }}>
          <MapContainer
            center={[lat, lon]}
            zoom={13}
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap'
            />
            <NoFlyZones />

            {/* Launch point */}
            <CircleMarker
              center={[lat, lon]}
              radius={8}
              pathOptions={{ color: '#44ff88', fillColor: '#44ff88', fillOpacity: 0.8 }}
            >
              <Popup>Launch site</Popup>
            </CircleMarker>

            {/* Predicted trajectory */}
            {mapPoints.length > 1 && (
              <Polyline positions={mapPoints} pathOptions={{ color: '#00d4ff', weight: 2, dashArray: '6 4' }} />
            )}

            {/* Landing prediction */}
            {landingPoint && (
              <Marker
                position={[landingPoint.latitude, landingPoint.longitude]}
                icon={L.divIcon({
                  className: '',
                  html: `<div style="width:16px;height:16px;border-radius:50%;
                    background:#ff4444;border:2px solid #fff;
                    box-shadow:0 0 8px #ff4444;"></div>`,
                  iconSize: [16, 16], iconAnchor: [8, 8],
                })}
              >
                <Popup>
                  <strong>Predicted Landing Zone</strong><br/>
                  {landingPoint.latitude.toFixed(6)}, {landingPoint.longitude.toFixed(6)}<br/>
                  T+{landingPoint.timeOffsetSec.toFixed(0)}s
                </Popup>
              </Marker>
            )}

            {mapPoints.length > 1 && <FitBounds points={mapPoints} />}
          </MapContainer>
        </div>

        {/* Wind layers panel */}
        <div style={{
          padding: 14, borderBottom: '1px solid var(--border)', overflowY: 'auto',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Wind Aloft Layers</div>
          {windLayers.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              No wind data. Click Fetch Wind &amp; Predict.
            </div>
          ) : (
            windLayers.map((layer, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontSize: 12, fontFamily: 'monospace',
              }}>
                <span style={{ color: 'var(--text-muted)', width: 50 }}>{layer.altitudeM}m</span>
                <span style={{ color: 'var(--accent)' }}>{layer.speedMs.toFixed(1)} m/s</span>
                <span>
                  {layer.directionDeg.toFixed(0)}° {compassBearing(layer.directionDeg)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Altitude chart */}
        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Altitude Profile</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={trajectory} margin={{ top: 2, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="timeOffsetSec"
                tick={{ fill: '#7a8a9a', fontSize: 10 }}
                tickFormatter={v => `${v}s`}
              />
              <YAxis tick={{ fill: '#7a8a9a', fontSize: 10 }} tickFormatter={v => `${v}m`} />
              <Tooltip
                contentStyle={{ background: '#0d1929', border: '1px solid var(--border)', fontSize: 11 }}
                labelFormatter={v => `T+${v}s`}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="altitudeM"
                name="Altitude (m)"
                stroke="#00d4ff"
                dot={false}
                isAnimationActive={false}
                strokeWidth={1.5}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function compassBearing(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N']
  return dirs[Math.round(deg / 45)]
}

const inputStyle: React.CSSProperties = {
  width: 70, background: 'var(--surface-raised)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '3px 7px', color: 'var(--text)', fontSize: 12,
}
