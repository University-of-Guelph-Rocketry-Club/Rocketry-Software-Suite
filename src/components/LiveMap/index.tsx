import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTelemetryStore } from '../../store/telemetryStore'
import { NoFlyZones } from './NoFlyZones'

// Fix Leaflet default icon paths for bundled environments
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function createRocketIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:18px;height:18px;border-radius:50%;
      background:${color};border:2px solid #fff;
      box-shadow:0 0 8px ${color};
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

/** Auto-pan map to follow the rocket */
function AutoPan({ position }: { position: [number, number] | null }) {
  const map = useMap()
  const [locked, setLocked] = useState(true)

  useEffect(() => {
    if (locked && position) {
      map.setView(position, map.getZoom(), { animate: true })
    }
  }, [position, locked, map])

  return (
    <div style={{
      position: 'absolute', top: 10, right: 10, zIndex: 1000,
    }}>
      <button
        onClick={() => setLocked(l => !l)}
        style={{
          padding: '4px 10px', borderRadius: 4, fontSize: 11,
          background: locked ? 'var(--accent)' : 'var(--surface)',
          border: '1px solid var(--border)',
          color: locked ? '#000' : 'var(--text)',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        {locked ? '🔒 Following' : '🔓 Free'}
      </button>
    </div>
  )
}

export function LiveMap() {
  const schema = useTelemetryStore(s => s.schema)
  const sources = useTelemetryStore(s => s.sources)
  const [showNoFly, setShowNoFly] = useState(true)

  const enabledSources = schema.sources.filter(s => s.enabled)

  // Collect GPS tracks per source
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

  // Default center from first valid GPS reading, else Guelph, ON
  const initialCenter = useMemo<[number, number]>(() => {
    for (const src of enabledSources) {
      const latest = sources[src.id]?.latest
      if (latest?.latitude && latest?.longitude) {
        return [latest.latitude, latest.longitude]
      }
    }
    return [43.5448, -80.2482]
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderBottom: '1px solid var(--border)', flexShrink: 0, fontSize: 13,
      }}>
        <span style={{ fontWeight: 600 }}>Live Map</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showNoFly}
            onChange={e => setShowNoFly(e.target.checked)}
          />
          Show No-Fly Zones
        </label>

        {/* Latest GPS readout */}
        {enabledSources.map(src => {
          const latest = sources[src.id]?.latest
          if (!latest?.latitude) return null
          return (
            <span key={src.id} style={{ color: src.color, fontSize: 11, fontFamily: 'monospace' }}>
              {src.name}: {latest.latitude.toFixed(6)}, {latest.longitude?.toFixed(6)} | {(latest.altitude ?? 0).toFixed(1)}m
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
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {enabledSources.map(src => {
            const latest = sources[src.id]?.latest
            const track = tracks[src.id] ?? []
            const pos = (latest?.latitude && latest?.longitude)
              ? [latest.latitude, latest.longitude] as [number, number]
              : null

            return (
              <div key={src.id}>
                {/* Flight path */}
                {track.length > 1 && (
                  <Polyline
                    positions={track}
                    pathOptions={{ color: src.color, weight: 2, opacity: 0.7 }}
                  />
                )}

                {/* Current position marker */}
                {pos && (
                  <Marker position={pos} icon={createRocketIcon(src.color)}>
                    <Popup>
                      <strong>{src.name}</strong><br />
                      Lat: {latest?.latitude?.toFixed(6)}<br />
                      Lon: {latest?.longitude?.toFixed(6)}<br />
                      Alt: {(latest?.altitude ?? 0).toFixed(1)} m<br />
                      State: {latest?.state ?? '—'}
                    </Popup>
                  </Marker>
                )}

                {/* Auto-pan to first enabled source */}
                {src.id === enabledSources[0]?.id && <AutoPan position={pos} />}
              </div>
            )
          })}

          {showNoFly && <NoFlyZones />}
        </MapContainer>
      </div>
    </div>
  )
}
