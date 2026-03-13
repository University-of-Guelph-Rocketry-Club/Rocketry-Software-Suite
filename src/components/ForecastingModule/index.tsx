import { useState, useCallback, useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTelemetryStore } from '../../store/telemetryStore'
import { NoFlyZones } from '../LiveMap/NoFlyZones'
import {
  fetchWindLayers, predictTrajectory, fetchCurrentConditions,
  type OpenMeteoWindResponse, type CurrentConditions,
} from '../../utils/forecasting'
import type { WindLayer, TrajectoryPoint } from '../../types/telemetry'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

function EnsureMapReady() {
  const map = useMap()

  useEffect(() => {
    const kick = () => map.invalidateSize({ pan: false })
    kick()
    const timeoutId = window.setTimeout(kick, 120)
    window.addEventListener('resize', kick)
    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('resize', kick)
    }
  }, [map])

  return null
}

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap()
  if (points.length > 1) {
    map.fitBounds(points)
  }
  return null
}

const PRECIP_MIN_ZOOM = 8

function ForecastRadarLayer({
  enabled,
  onStatus,
}: {
  enabled: boolean
  onStatus: (msg: string | null) => void
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  const [tileUrl, setTileUrl] = useState<string | null>(null)

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  })

  useEffect(() => {
    if (!enabled) {
      onStatus(null)
      return
    }

    if (zoom < PRECIP_MIN_ZOOM) {
      onStatus(`Radar visible at zoom ${PRECIP_MIN_ZOOM}+`)
      return
    }

    onStatus(null)
  }, [enabled, zoom, onStatus])

  useEffect(() => {
    if (!enabled) {
      onStatus(null)
      return
    }

    let cancelled = false
    let timerId: number | null = null

    const loadLatestFrame = async () => {
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
        if (!res.ok) throw new Error('weather map metadata unavailable')

        const data = await res.json() as {
          host?: string
          radar?: {
            past?: Array<{ path?: string }>
            nowcast?: Array<{ path?: string }>
          }
        }

        const host = data.host ?? 'https://tilecache.rainviewer.com'
        const nowcast = data.radar?.nowcast ?? []
        const past = data.radar?.past ?? []
        const latestPath = (nowcast.length > 0 ? nowcast[nowcast.length - 1]?.path : undefined)
          ?? (past.length > 0 ? past[past.length - 1]?.path : undefined)

        if (!latestPath) throw new Error('no radar frame path')
        if (cancelled) return

        setTileUrl(`${host}${latestPath}/256/{z}/{x}/{y}/2/1_1.png`)
      } catch {
        if (!cancelled) {
          setTileUrl('https://tilecache.rainviewer.com/v2/radar/nowcast_0/256/{z}/{x}/{y}/2/1_1.png')
          onStatus('Radar provider limited right now')
        }
      }
    }

    loadLatestFrame()
    // Refresh radar frame periodically so the forecast map stays live.
    timerId = window.setInterval(loadLatestFrame, 120000)

    return () => {
      cancelled = true
      if (timerId) window.clearInterval(timerId)
    }
  }, [enabled, onStatus])

  if (!enabled) return null
  if (zoom < PRECIP_MIN_ZOOM || !tileUrl) return null

  return (
    <TileLayer
      key={tileUrl}
      url={tileUrl}
      attribution="&copy; RainViewer"
      opacity={0.45}
      maxNativeZoom={10}
      eventHandlers={{
        tileerror: () => onStatus('Radar tiles unavailable for this zoom/area'),
      }}
    />
  )
}

// ── Current conditions strip ───────────────────────────────────
function WeatherStrip({ cond, loading }: { cond: CurrentConditions | null; loading: boolean }) {
  if (loading) {
    return (
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        background: 'rgba(56,189,248,0.03)',
      }}>
        <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
          FETCHING WEATHER…
        </span>
      </div>
    )
  }

  if (!cond) {
    return (
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        background: 'rgba(56,189,248,0.03)',
      }}>
        <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
          LIVE WEATHER — click &#34;FETCH WIND &amp; PREDICT&#34; to load
        </span>
      </div>
    )
  }

  const tempColor = cond.temperatureC < -10 ? 'var(--accent)'
    : cond.temperatureC > 35 ? 'var(--magenta)'
    : 'var(--text)'

  const windColor = cond.windSpeedMs > 15 ? 'var(--magenta)'
    : cond.windSpeedMs > 8 ? 'var(--amber)'
    : 'var(--lime)'

  const visColor = cond.visibilityM !== null && cond.visibilityM < 5000 ? 'var(--amber)'
    : cond.visibilityM !== null && cond.visibilityM < 1000 ? 'var(--magenta)'
    : 'var(--lime)'

  const precipColor = cond.precipitationMm > 0 ? 'var(--amber)' : 'var(--lime)'
  const age = Math.round((Date.now() - cond.fetchedAt) / 60000)

  const cells = [
    { label: 'CONDITIONS', value: cond.weatherDescription, unit: '', color: 'var(--accent)' },
    { label: 'TEMP', value: cond.temperatureC.toFixed(1), unit: '°C', color: tempColor },
    { label: 'HUMIDITY', value: cond.relativeHumidityPct.toFixed(0), unit: '%', color: 'var(--text-muted)' },
    { label: 'WIND', value: cond.windSpeedMs.toFixed(1), unit: 'm/s', color: windColor },
    { label: 'DIR', value: `${cond.windDirectionDeg.toFixed(0)}° ${compassBearing(cond.windDirectionDeg)}`, unit: '', color: 'var(--text)' },
    { label: 'PRESSURE', value: cond.surfacePressureHPa.toFixed(1), unit: 'hPa', color: 'var(--text)' },
    { label: 'VISIBILITY', value: cond.visibilityM !== null ? (cond.visibilityM / 1000).toFixed(1) : '—', unit: 'km', color: visColor },
    { label: 'PRECIP', value: cond.precipitationMm.toFixed(1), unit: 'mm', color: precipColor },
  ]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      borderBottom: '1px solid var(--border)',
      background: 'rgba(56,189,248,0.03)',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Label */}
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '6px 14px', borderRight: '1px solid var(--border)',
        flexShrink: 0, gap: 2,
      }}>
        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
          LIVE WX
        </div>
        <div style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
          {age === 0 ? 'just now' : `${age}m ago`}
        </div>
      </div>

      {/* Data cells */}
      {cells.map(c => (
        <div key={c.label} style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '5px 12px', borderRight: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase', fontFamily: 'var(--mono)', marginBottom: 1 }}>
            {c.label}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: c.color, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
            {c.value}
            {c.unit && <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>{c.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  )
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
  const [initVz, setInitVz] = useState(150)
  const [simDurationSec, setSimDurationSec] = useState(120)
  const [currentConditions, setCurrentConditions] = useState<CurrentConditions | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [tileError, setTileError] = useState(false)
  const [showPrecip, setShowPrecip] = useState(true)
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [radarStatus, setRadarStatus] = useState<string | null>(null)

  const lat = latest?.latitude ?? 43.5448
  const lon = latest?.longitude ?? -80.2482
  const alt = latest?.altitude ?? 0

  const refreshConditions = useCallback(async (silent = false) => {
    if (!silent) setWeatherLoading(true)
    try {
      const cond = await fetchCurrentConditions(lat, lon)
      setCurrentConditions(cond)
    } catch {
      // Keep last known conditions as fallback.
    } finally {
      if (!silent) setWeatherLoading(false)
    }
  }, [lat, lon])

  useEffect(() => {
    let cancelled = false
    let intervalId: number | null = null

    const run = async (silent: boolean) => {
      if (cancelled) return
      await refreshConditions(silent)
    }

    run(false)
    if (autoUpdate) {
      intervalId = window.setInterval(() => { void run(true) }, 45000)
    }

    return () => {
      cancelled = true
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [autoUpdate, refreshConditions])

  const refreshForecast = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const layers = await fetchWindLayers(lat, lon)
      setWindLayers(layers)
      const traj = predictTrajectory(lat, lon, alt, initVz, simDurationSec, 1, layers)
      setTrajectory(traj)
    } catch (e) {
      if (!silent) {
        setError((e as Error).message)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [lat, lon, alt, initVz, simDurationSec])

  const handleFetch = useCallback(async () => {
    await Promise.all([refreshForecast(false), refreshConditions(false)])
  }, [refreshConditions, refreshForecast])

  useEffect(() => {
    if (!autoUpdate) return
    const intervalId = window.setInterval(() => {
      void refreshForecast(true)
    }, 120000)
    return () => window.clearInterval(intervalId)
  }, [autoUpdate, refreshForecast])

  const landingPoint = trajectory[trajectory.length - 1]
  const maxAlt = trajectory.length > 0 ? Math.max(...trajectory.map(p => p.altitudeM)) : alt

  const mapPoints: Array<[number, number]> = trajectory.map(p => [p.latitude, p.longitude])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Live weather strip ──────────────────────────────── */}
      <WeatherStrip cond={currentConditions} loading={weatherLoading} />

      {/* ── Header / controls ───────────────────────────────── */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--text-muted)', fontFamily: 'var(--mono)',
        }}>
          TRAJ PREDICT
        </span>

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
            padding: '5px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: loading ? 'var(--surface-3)' : 'rgba(56,189,248,0.12)',
            border: `1px solid ${loading ? 'var(--border)' : 'rgba(56,189,248,0.3)'}`,
            color: loading ? 'var(--text-muted)' : 'var(--accent)',
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'var(--mono)', letterSpacing: '0.08em',
          }}
        >
          {loading ? 'FETCHING…' : '⟳ FETCH WIND & PREDICT'}
        </button>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)',
        }}>
          <input type="checkbox" checked={showPrecip} onChange={e => setShowPrecip(e.target.checked)} />
          RADAR
        </label>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)',
        }}>
          <input type="checkbox" checked={autoUpdate} onChange={e => setAutoUpdate(e.target.checked)} />
          AUTO WX
        </label>

        {error && <span style={{ color: 'var(--magenta)', fontSize: 11, fontFamily: 'var(--mono)' }}>⚠ {error}</span>}
        {!error && radarStatus && (
          <span style={{ color: 'var(--amber)', fontSize: 10, fontFamily: 'var(--mono)' }}>{radarStatus}</span>
        )}

        {landingPoint && (
          <span style={{ fontSize: 11, color: 'var(--lime)', fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
            LZ: {landingPoint.latitude.toFixed(5)}, {landingPoint.longitude.toFixed(5)} · APEX {maxAlt.toFixed(0)}m
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
            className="forecast-map"
            center={[lat, lon]}
            zoom={13}
            style={{ width: '100%', height: '100%' }}
          >
            <EnsureMapReady />
            <TileLayer
              key={tileError ? 'osm' : 'voyager'}
              url={tileError
                ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'}
              attribution={tileError ? '&copy; OpenStreetMap' : '&copy; OpenStreetMap &copy; CARTO'}
              eventHandlers={{
                tileerror: () => setTileError(true),
              }}
            />
            <ForecastRadarLayer enabled={showPrecip} onStatus={setRadarStatus} />
            <NoFlyZones />

            {/* Launch point */}
            <CircleMarker
              center={[lat, lon]}
              radius={8}
              pathOptions={{ color: '#a8ff3e', fillColor: '#a8ff3e', fillOpacity: 0.9 }}
            >
              <Popup>Launch site</Popup>
            </CircleMarker>

            {/* Predicted trajectory */}
            {mapPoints.length > 1 && (
              <Polyline positions={mapPoints} pathOptions={{ color: '#38bdf8', weight: 2, dashArray: '6 4' }} />
            )}

            {/* Landing prediction */}
            {landingPoint && (
              <Marker
                position={[landingPoint.latitude, landingPoint.longitude]}
                icon={L.divIcon({
                  className: '',
                  html: `<div style="width:14px;height:14px;border-radius:50%;background:#ff0055;border:2px solid #fff;box-shadow:0 0 10px #ff0055;"></div>`,
                  iconSize: [14, 14], iconAnchor: [7, 7],
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
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginBottom: 10 }}>
            WIND ALOFT
          </div>
          {windLayers.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>
              — no data — fetch to populate
            </div>
          ) : (
            windLayers.map((layer, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                fontSize: 11, fontFamily: 'var(--mono)',
              }}>
                <span style={{ color: 'var(--text-dim)', width: 46 }}>{layer.altitudeM}m</span>
                <span style={{
                  color: layer.speedMs > 10 ? 'var(--amber)' : layer.speedMs > 5 ? 'var(--text)' : 'var(--lime)',
                  fontWeight: 600,
                }}>{layer.speedMs.toFixed(1)} m/s</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {layer.directionDeg.toFixed(0)}° {compassBearing(layer.directionDeg)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Altitude chart */}
        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginBottom: 6 }}>
            ALTITUDE PROFILE
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={trajectory} margin={{ top: 2, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="timeOffsetSec"
                tick={{ fill: '#4a5a7a', fontSize: 9, fontFamily: 'var(--mono)' }}
                tickFormatter={v => `${v}s`}
              />
              <YAxis tick={{ fill: '#4a5a7a', fontSize: 9, fontFamily: 'var(--mono)' }} tickFormatter={v => `${v}m`} />
              <Tooltip
                contentStyle={{ background: '#0d1929', border: '1px solid var(--border)', fontSize: 10, fontFamily: 'var(--mono)' }}
                labelFormatter={v => `T+${v}s`}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="altitudeM"
                name="Alt (m)"
                stroke="var(--accent)"
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
  width: 70, background: 'var(--surface-3)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '3px 7px', color: 'var(--text)', fontSize: 11,
  fontFamily: 'var(--mono)', outline: 'none',
}
