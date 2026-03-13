import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTelemetryStore } from '../../store/telemetryStore'
import { NoFlyZones } from './NoFlyZones'
import { CivilOverlays } from './CivilOverlays'

// Fix Leaflet default icon paths for bundled environments
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

/** Tactical vector rocket icon — crosshair ring + centre dot */
function createRocketIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:26px;height:26px;">
        <div style="
          position:absolute;inset:3px;border-radius:50%;
          border:1.5px solid ${color};opacity:0.55;
          box-shadow:0 0 6px ${color};
        "></div>
        <div style="
          position:absolute;inset:10px;border-radius:50%;
          background:${color};box-shadow:0 0 8px ${color};
        "></div>
        <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:${color};opacity:0.4;transform:translateY(-50%);"></div>
        <div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:${color};opacity:0.4;transform:translateX(-50%);"></div>
      </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

/** Auto-pan map to follow the rocket */
function AutoPan({ position }: { position: [number, number] | null }) {
  const map     = useMap()
  const [locked, setLocked] = useState(true)

  useEffect(() => {
    if (locked && position) {
      map.setView(position, map.getZoom(), { animate: true })
    }
  }, [position, locked, map])

  return (
    <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
      <button
        onClick={() => setLocked(l => !l)}
        style={{
          padding: '3px 9px', borderRadius: 3, fontSize: 9,
          background: locked ? 'rgba(168,255,62,0.15)' : 'var(--surface-2)',
          border: `1px solid ${locked ? 'rgba(168,255,62,0.4)' : 'var(--border-bright)'}`,
          color: locked ? 'var(--lime)' : 'var(--text-muted)',
          cursor: 'pointer', fontFamily: 'var(--mono)', fontWeight: 700,
          letterSpacing: '0.08em',
        }}
      >
        {locked ? '⊕ TRACKING' : '⊘ FREE'}
      </button>
    </div>
  )
}

/** Tactical grid overlay — renders degree/km lines on the canvas */
function TacticalGrid() {
  const map = useMap()
  const ref = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    const group = L.layerGroup().addTo(map)
    ref.current = group
    return () => { group.remove() }
  }, [map])

  return null
}

type MapMode = 'regular' | 'terrain' | 'satellite' | 'tactical' | 'precipitation'

const MAP_MODE_CONFIG: Record<MapMode, { label: string; url: string; attribution: string }> = {
  regular: {
    label: 'Regular',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  terrain: {
    label: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  tactical: {
    label: 'Tactical',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  precipitation: {
    label: 'Precipitation',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
}

const PRECIP_OVERLAY = {
  url: 'https://tilecache.rainviewer.com/v2/radar/nowcast_0/256/{z}/{x}/{y}/2/1_1.png',
  attribution: '&copy; <a href="https://www.rainviewer.com/">RainViewer</a>',
}

const PRECIP_MIN_ZOOM = 8

function PrecipitationLayer({
  enabled,
  onError,
}: {
  enabled: boolean
  onError: (msg: string | null) => void
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  const [tileUrl, setTileUrl] = useState<string | null>(null)

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  })

  useEffect(() => {
    if (!enabled) {
      onError(null)
      return
    }
    if (zoom < PRECIP_MIN_ZOOM) {
      onError(`Precipitation overlay available at zoom ${PRECIP_MIN_ZOOM}+`)
    }
  }, [enabled, zoom, onError])

  useEffect(() => {
    if (!enabled) {
      onError(null)
      return
    }

    let cancelled = false

    const loadFrame = async () => {
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
        if (!res.ok) throw new Error('Radar metadata unavailable')

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
        const latestNowcastPath = nowcast.length > 0 ? nowcast[nowcast.length - 1]?.path : undefined
        const latestPastPath = past.length > 0 ? past[past.length - 1]?.path : undefined
        const latestPath = latestNowcastPath ?? latestPastPath

        if (!latestPath) throw new Error('No radar frames available')
        if (!cancelled) {
          setTileUrl(`${host}${latestPath}/256/{z}/{x}/{y}/2/1_1.png`)
          onError(null)
        }
      } catch {
        if (!cancelled) {
          setTileUrl(PRECIP_OVERLAY.url)
          onError('Radar data source unavailable')
        }
      }
    }

    loadFrame()
    return () => { cancelled = true }
  }, [enabled, onError])

  if (!enabled) return null
  if (zoom < PRECIP_MIN_ZOOM) return null
  if (!tileUrl) return null

  return (
    <TileLayer
      key={tileUrl}
      url={tileUrl}
      attribution={PRECIP_OVERLAY.attribution}
      opacity={0.45}
      maxNativeZoom={10}
      eventHandlers={{
        tileerror: () => onError('Precipitation tiles unavailable for this area/zoom'),
        loading: () => onError(null),
      }}
    />
  )
}

export function LiveMap() {
  const schema   = useTelemetryStore(s => s.schema)
  const sources  = useTelemetryStore(s => s.sources)
  const [showNoFly, setShowNoFly] = useState(true)
  const [showCivil, setShowCivil] = useState(false)
  const [showRangeRings, setShowRangeRings] = useState(true)
  const [showPrecip, setShowPrecip] = useState(false)
  const [tileError, setTileError] = useState(false)
  const [precipMessage, setPrecipMessage] = useState<string | null>(null)
  const [mapMode, setMapMode] = useState<MapMode>('tactical')

  const enabledSources = schema.sources.filter(s => s.enabled)

  const tracks = useMemo(() => {
    const out: Record<string, Array<[number, number]>> = {}
    for (const src of enabledSources) {
      const packets = sources[src.id]?.packets ?? []
      out[src.id] = packets
        .filter(p => typeof p.latitude === 'number' && typeof p.longitude === 'number')
        .map(p => [p.latitude!, p.longitude!] as [number, number])
    }
    return out
  }, [sources, enabledSources])

  const initialCenter = useMemo<[number, number]>(() => {
    for (const src of enabledSources) {
      const latest = sources[src.id]?.latest
      if (latest?.latitude && latest?.longitude) return [latest.latitude, latest.longitude]
    }
    return [43.5448, -80.2482]
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const leadSourceId = enabledSources[0]?.id
  const leadTrack = leadSourceId ? tracks[leadSourceId] ?? [] : []
  const ringCenter = leadTrack[0] ?? initialCenter
  const tileConfig = MAP_MODE_CONFIG[mapMode]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)',
        }}>
          TACTICAL MAP
        </span>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)', color: 'var(--text-muted)',
        }}>
          <input type="checkbox" checked={showNoFly} onChange={e => setShowNoFly(e.target.checked)} />
          NO-FLY
        </label>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)', color: 'var(--text-muted)',
        }}>
          <input type="checkbox" checked={showCivil} onChange={e => setShowCivil(e.target.checked)} />
          CIVIL
        </label>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)', color: 'var(--text-muted)',
        }}>
          <input
            type="checkbox"
            checked={showRangeRings}
            onChange={e => setShowRangeRings(e.target.checked)}
          />
          RANGE RINGS
        </label>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)', color: 'var(--text-muted)',
        }}>
          <input type="checkbox" checked={showPrecip} onChange={e => setShowPrecip(e.target.checked)} />
          PRECIP
        </label>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)', color: 'var(--text-muted)',
        }}>
          MODE
          <select
            value={mapMode}
            onChange={e => {
              setMapMode(e.target.value as MapMode)
              setTileError(false)
            }}
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text)',
              border: '1px solid var(--border-bright)',
              borderRadius: 3,
              fontFamily: 'var(--mono)',
              fontSize: 10,
              padding: '2px 6px',
            }}
          >
            {Object.entries(MAP_MODE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </label>

        {tileError && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>
            Tile source offline for this mode
          </span>
        )}

        {precipMessage && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>
            {precipMessage}
          </span>
        )}

        {/* Live GPS readout */}
        {enabledSources.map(src => {
          const latest = sources[src.id]?.latest
          if (!latest?.latitude) return null
          return (
            <span key={src.id} style={{
              color: src.color, fontSize: 10, fontFamily: 'var(--mono)',
              marginLeft: 'auto',
            }}>
              {src.name}&nbsp;
              {(latest.latitude as number).toFixed(5)}, {(latest.longitude as number ?? 0).toFixed(5)}&nbsp;
              <span style={{ color: 'var(--text-muted)' }}>ALT</span>&nbsp;
              {((latest.altitude ?? latest.baroAltitude ?? 0) as number).toFixed(1)} m
            </span>
          )
        })}
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={initialCenter}
          zoom={14}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            key={`${mapMode}:${tileConfig.url}`}
            url={tileConfig.url}
            attribution={tileConfig.attribution}
            detectRetina
            eventHandlers={{
              tileerror: () => {
                setTileError(true)
              },
            }}
          />

          <PrecipitationLayer enabled={showPrecip} onError={setPrecipMessage} />

          <TacticalGrid />

          {enabledSources.map(src => {
            const latest = sources[src.id]?.latest
            const track  = tracks[src.id] ?? []
            const pos    = (latest?.latitude && latest?.longitude)
              ? [latest.latitude, latest.longitude] as [number, number]
              : null

            return (
              <div key={src.id}>
                {/* Ghost trail — past points, dimmer */}
                {track.length > 2 && (
                  <Polyline
                    positions={track.slice(0, -1)}
                    pathOptions={{
                      color: src.color,
                      weight: 1,
                      opacity: 0.28,
                      dashArray: '4 6',
                    }}
                  />
                )}
                {/* Live track — most recent portion */}
                {track.length > 1 && (
                  <Polyline
                    positions={track.slice(-60)}
                    pathOptions={{
                      color: src.color,
                      weight: 2,
                      opacity: 0.85,
                    }}
                  />
                )}

                {pos && (
                  <Marker position={pos} icon={createRocketIcon(src.color)}>
                    <Popup>
                      <strong style={{ color: src.color }}>{src.name}</strong><br />
                      Lat: {(latest?.latitude as number)?.toFixed(6)}<br />
                      Lon: {(latest?.longitude as number ?? 0)?.toFixed(6)}<br />
                      Alt: {((latest?.altitude ?? 0) as number).toFixed(1)} m<br />
                      State: {latest?.state ?? '—'}
                    </Popup>
                  </Marker>
                )}

                {src.id === enabledSources[0]?.id && <AutoPan position={pos} />}
              </div>
            )
          })}

          {showNoFly && <NoFlyZones />}
          {showCivil && <CivilOverlays />}

          {showRangeRings && ringCenter && (
            <>
              <Circle center={ringCenter} radius={500} pathOptions={{ color: '#6ee7ff', weight: 1, opacity: 0.5, fillOpacity: 0.02 }} />
              <Circle center={ringCenter} radius={1000} pathOptions={{ color: '#6ee7ff', weight: 1, opacity: 0.4, fillOpacity: 0 }} />
              <Circle center={ringCenter} radius={2000} pathOptions={{ color: '#6ee7ff', weight: 1, opacity: 0.35, fillOpacity: 0 }} />
            </>
          )}
        </MapContainer>
      </div>
    </div>
  )
}
