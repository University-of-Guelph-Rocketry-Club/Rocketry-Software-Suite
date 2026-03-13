import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  CircleMarker,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTelemetryStore } from '../../store/telemetryStore'
import { useMissionStore } from '../../store/missionStore'
import { fetchCurrentConditions, type CurrentConditions } from '../../utils/forecasting'
import { NoFlyZones } from '../LiveMap/NoFlyZones'
import { CivilOverlays } from '../LiveMap/CivilOverlays'

type LaunchPlan = {
  missionName: string
  launchLat: number
  launchLon: number
  launchAltM: number
  headingDeg: number
  targetApogeeM: number
  plannedRangeKm: number
  notes: string
}

const DEFAULT_PLAN: LaunchPlan = {
  missionName: 'New Mission',
  launchLat: 43.5448,
  launchLon: -80.2482,
  launchAltM: 350,
  headingDeg: 95,
  targetApogeeM: 900,
  plannedRangeKm: 2.5,
  notes: '',
}

const AIRPORTS = [
  { name: 'Waterloo Regional Airport', code: 'CYKF', lat: 43.4608, lon: -80.3786 },
  { name: 'Hamilton International Airport', code: 'CYHM', lat: 43.1736, lon: -79.9350 },
  { name: 'Toronto Pearson', code: 'CYYZ', lat: 43.6777, lon: -79.6248 },
]

function degToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N']
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45)]
}

function destinationPoint(lat: number, lon: number, bearingDeg: number, distKm: number): [number, number] {
  const R = 6371
  const br = (bearingDeg * Math.PI) / 180
  const dR = distKm / R
  const lat1 = (lat * Math.PI) / 180
  const lon1 = (lon * Math.PI) / 180

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(br)
  )
  const lon2 = lon1 + Math.atan2(
    Math.sin(br) * Math.sin(dR) * Math.cos(lat1),
    Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2)
  )

  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI]
}

function LaunchSitePicker({
  onPick,
}: {
  onPick: (lat: number, lon: number) => void
}) {
  useMapEvents({
    click: (e) => {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function WeatherPanel({
  cond,
  loading,
  staleSec,
}: {
  cond: CurrentConditions | null
  loading: boolean
  staleSec: number
}) {
  if (loading && !cond) {
    return <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 10 }}>Loading weather...</span>
  }
  if (!cond) {
    return <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 10 }}>No weather data yet.</span>
  }

  const cells = [
    { label: 'Cond', value: cond.weatherDescription, color: 'var(--accent)' },
    { label: 'Temp', value: `${cond.temperatureC.toFixed(1)} C`, color: 'var(--text)' },
    { label: 'Wind', value: `${cond.windSpeedMs.toFixed(1)} m/s`, color: cond.windSpeedMs > 12 ? 'var(--amber)' : 'var(--lime)' },
    { label: 'Dir', value: `${cond.windDirectionDeg.toFixed(0)} ${degToCardinal(cond.windDirectionDeg)}`, color: 'var(--text)' },
    { label: 'Precip', value: `${cond.precipitationMm.toFixed(1)} mm`, color: cond.precipitationMm > 0 ? 'var(--amber)' : 'var(--lime)' },
    { label: 'Vis', value: cond.visibilityM ? `${(cond.visibilityM / 1000).toFixed(1)} km` : 'N/A', color: 'var(--text)' },
  ]

  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{
        padding: '8px 10px', minWidth: 104, borderRight: '1px solid var(--border)',
        background: 'rgba(56,189,248,0.08)',
      }}>
        <div style={{ fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--accent)', letterSpacing: '0.1em' }}>LIVE WEATHER</div>
        <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: staleSec < 45 ? 'var(--lime)' : 'var(--amber)' }}>
          {staleSec < 60 ? `${staleSec}s ago` : `${Math.round(staleSec / 60)}m ago`}
        </div>
      </div>
      {cells.map(cell => (
        <div key={cell.label} style={{ padding: '8px 10px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>{cell.label}</div>
          <div style={{ fontSize: 11, color: cell.color, fontFamily: 'var(--mono)', fontWeight: 700 }}>{cell.value}</div>
        </div>
      ))}
    </div>
  )
}

export function MissionPlanner() {
  const schema = useTelemetryStore(s => s.schema)
  const sources = useTelemetryStore(s => s.sources)

  const initChecklist = useMissionStore(s => s.initChecklist)
  const resetMission = useMissionStore(s => s.resetMission)

  const mainSrc = schema.sources.find(s => s.enabled)
  const latest = mainSrc ? sources[mainSrc.id]?.latest : null

  const [plan, setPlan] = useState<LaunchPlan>(() => ({
    ...DEFAULT_PLAN,
    launchLat: latest?.latitude ?? DEFAULT_PLAN.launchLat,
    launchLon: latest?.longitude ?? DEFAULT_PLAN.launchLon,
    launchAltM: Number(latest?.altitude ?? latest?.baroAltitude ?? DEFAULT_PLAN.launchAltM),
  }))

  const [showNoFly, setShowNoFly] = useState(true)
  const [showCivil, setShowCivil] = useState(true)
  const [showAirports, setShowAirports] = useState(true)
  const [tileError, setTileError] = useState(false)
  const [weather, setWeather] = useState<CurrentConditions | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherErr, setWeatherErr] = useState<string | null>(null)
  const [savedPlanAt, setSavedPlanAt] = useState<number | null>(null)
  const [staleSec, setStaleSec] = useState(0)

  const plannedLanding = useMemo(
    () => destinationPoint(plan.launchLat, plan.launchLon, plan.headingDeg, plan.plannedRangeKm),
    [plan.headingDeg, plan.launchLat, plan.launchLon, plan.plannedRangeKm]
  )

  const refreshWeather = useCallback(async (silent = false) => {
    if (!silent) {
      setWeatherLoading(true)
      setWeatherErr(null)
    }
    try {
      const cond = await fetchCurrentConditions(plan.launchLat, plan.launchLon)
      setWeather(cond)
      setStaleSec(0)
    } catch (e) {
      setWeatherErr((e as Error).message)
    } finally {
      if (!silent) setWeatherLoading(false)
    }
  }, [plan.launchLat, plan.launchLon])

  useEffect(() => {
    void refreshWeather(false)
  }, [refreshWeather])

  useEffect(() => {
    const weatherTick = window.setInterval(() => {
      void refreshWeather(true)
    }, 60000)

    const staleTick = window.setInterval(() => {
      if (!weather) return
      setStaleSec(Math.max(0, Math.floor((Date.now() - weather.fetchedAt) / 1000)))
    }, 1000)

    return () => {
      window.clearInterval(weatherTick)
      window.clearInterval(staleTick)
    }
  }, [refreshWeather, weather])

  const applyPlan = () => {
    resetMission()
    initChecklist(schema)
    setSavedPlanAt(Date.now())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--accent)', letterSpacing: '0.12em' }}>
          MISSION PLANNER
        </span>

        <button onClick={() => void refreshWeather(false)} style={btnStyle('var(--accent)')}>
          REFRESH WX
        </button>

        <label style={toggleLabelStyle}>
          <input type="checkbox" checked={showNoFly} onChange={e => setShowNoFly(e.target.checked)} />
          NO-FLY
        </label>
        <label style={toggleLabelStyle}>
          <input type="checkbox" checked={showCivil} onChange={e => setShowCivil(e.target.checked)} />
          CIVIL
        </label>
        <label style={toggleLabelStyle}>
          <input type="checkbox" checked={showAirports} onChange={e => setShowAirports(e.target.checked)} />
          AIRPORTS
        </label>

        {weatherErr && <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)', fontSize: 10 }}>{weatherErr}</span>}
        {savedPlanAt && (
          <span style={{ marginLeft: 'auto', color: 'var(--lime)', fontSize: 10, fontFamily: 'var(--mono)' }}>
            Plan initialized {Math.round((Date.now() - savedPlanAt) / 1000)}s ago
          </span>
        )}
      </div>

      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <WeatherPanel cond={weather} loading={weatherLoading} staleSec={staleSec} />
      </div>

      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '330px 1fr',
        gap: 0,
        minHeight: 0,
      }}>
        <div style={{
          borderRight: '1px solid var(--border)',
          padding: 14,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <SectionTitle title="Launch Plan" />

          <Field label="Mission Name">
            <input
              value={plan.missionName}
              onChange={e => setPlan(p => ({ ...p, missionName: e.target.value }))}
              style={inputStyle}
            />
          </Field>

          <DualField
            leftLabel="Launch Lat"
            leftValue={plan.launchLat}
            onLeftChange={v => setPlan(p => ({ ...p, launchLat: v }))}
            rightLabel="Launch Lon"
            rightValue={plan.launchLon}
            onRightChange={v => setPlan(p => ({ ...p, launchLon: v }))}
          />

          <DualField
            leftLabel="Launch Alt (m)"
            leftValue={plan.launchAltM}
            onLeftChange={v => setPlan(p => ({ ...p, launchAltM: v }))}
            rightLabel="Target Apogee (m)"
            rightValue={plan.targetApogeeM}
            onRightChange={v => setPlan(p => ({ ...p, targetApogeeM: v }))}
          />

          <DualField
            leftLabel="Flight Heading (deg)"
            leftValue={plan.headingDeg}
            onLeftChange={v => setPlan(p => ({ ...p, headingDeg: v }))}
            rightLabel="Planned Range (km)"
            rightValue={plan.plannedRangeKm}
            onRightChange={v => setPlan(p => ({ ...p, plannedRangeKm: v }))}
          />

          <Field label="Mission Notes">
            <textarea
              value={plan.notes}
              onChange={e => setPlan(p => ({ ...p, notes: e.target.value }))}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
            />
          </Field>

          <div style={{
            padding: 10, border: '1px solid var(--border)', borderRadius: 6,
            background: 'rgba(56,189,248,0.04)',
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>
              PLAN SUMMARY
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text)', fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
              Heading: {plan.headingDeg.toFixed(0)} deg ({degToCardinal(plan.headingDeg)})
              <br />
              Planned LZ: {plannedLanding[0].toFixed(5)}, {plannedLanding[1].toFixed(5)}
              <br />
              Target apogee: {plan.targetApogeeM.toFixed(0)} m ASL
            </div>
          </div>

          <button onClick={applyPlan} style={btnStyle('var(--lime)')}>
            START NEW MISSION FROM PLAN
          </button>
          <span style={{ color: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--mono)' }}>
            Tip: Click map to set launch site quickly.
          </span>
        </div>

        <div style={{ minHeight: 0 }}>
          <MapContainer
            center={[plan.launchLat, plan.launchLon]}
            zoom={11}
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              key={tileError ? 'osm' : 'voyager'}
              url={tileError
                ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'}
              attribution={tileError ? '&copy; OpenStreetMap' : '&copy; OpenStreetMap &copy; CARTO'}
              eventHandlers={{ tileerror: () => setTileError(true) }}
            />

            <LaunchSitePicker onPick={(lat, lon) => setPlan(p => ({ ...p, launchLat: lat, launchLon: lon }))} />

            {showNoFly && <NoFlyZones />}
            {showCivil && <CivilOverlays />}

            <Marker
              position={[plan.launchLat, plan.launchLon]}
              icon={L.divIcon({
                className: '',
                html: '<div style="width:12px;height:12px;border-radius:50%;background:#a8ff3e;border:2px solid #fff;box-shadow:0 0 10px #a8ff3e;"></div>',
                iconSize: [12, 12],
                iconAnchor: [6, 6],
              })}
            >
              <Popup>
                <strong>Launch Site</strong>
                <br />
                {plan.launchLat.toFixed(6)}, {plan.launchLon.toFixed(6)}
              </Popup>
            </Marker>

            <Marker
              position={plannedLanding}
              icon={L.divIcon({
                className: '',
                html: '<div style="width:12px;height:12px;border-radius:50%;background:#ff0055;border:2px solid #fff;box-shadow:0 0 10px #ff0055;"></div>',
                iconSize: [12, 12],
                iconAnchor: [6, 6],
              })}
            >
              <Popup>
                <strong>Planned Landing Area</strong>
                <br />
                {plannedLanding[0].toFixed(6)}, {plannedLanding[1].toFixed(6)}
              </Popup>
            </Marker>

            <Polyline
              positions={[[plan.launchLat, plan.launchLon], plannedLanding]}
              pathOptions={{ color: '#38bdf8', weight: 3, dashArray: '8 6' }}
            />

            <Circle
              center={[plan.launchLat, plan.launchLon]}
              radius={plan.plannedRangeKm * 1000}
              pathOptions={{ color: '#38bdf8', weight: 1, opacity: 0.4, fillOpacity: 0.04 }}
            />

            {showAirports && AIRPORTS.map(ap => (
              <CircleMarker
                key={ap.code}
                center={[ap.lat, ap.lon]}
                radius={6}
                pathOptions={{ color: '#ffffff', fillColor: '#1f6feb', fillOpacity: 0.9, weight: 1 }}
              >
                <Popup>
                  <strong>{ap.name}</strong>
                  <br />
                  {ap.code}
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--accent)',
      fontFamily: 'var(--mono)',
    }}>
      {title}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{label}</span>
      {children}
    </label>
  )
}

function DualField({
  leftLabel,
  leftValue,
  onLeftChange,
  rightLabel,
  rightValue,
  onRightChange,
}: {
  leftLabel: string
  leftValue: number
  onLeftChange: (v: number) => void
  rightLabel: string
  rightValue: number
  onRightChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <Field label={leftLabel}>
        <input
          type="number"
          value={leftValue}
          onChange={e => onLeftChange(Number(e.target.value))}
          style={inputStyle}
        />
      </Field>
      <Field label={rightLabel}>
        <input
          type="number"
          value={rightValue}
          onChange={e => onRightChange(Number(e.target.value))}
          style={inputStyle}
        />
      </Field>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-3)',
  border: '1px solid var(--border-bright)',
  borderRadius: 4,
  padding: '6px 8px',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 11,
}

const toggleLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 10,
  color: 'var(--text-muted)',
  fontFamily: 'var(--mono)',
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 4,
    border: `1px solid ${color}66`,
    background: `${color}18`,
    color,
    fontSize: 10,
    fontFamily: 'var(--mono)',
    fontWeight: 700,
    letterSpacing: '0.08em',
    cursor: 'pointer',
  }
}
