import { GeoJSON, CircleMarker, Popup } from 'react-leaflet'
import type { FeatureCollection } from 'geojson'

const CIVIL_AREAS: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: 'Guelph General Hospital Buffer',
        type: 'HOSPITAL',
        notes: 'Keep extra standoff distance for emergency helicopter approaches.',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-80.2485, 43.5535],
          [-80.2390, 43.5535],
          [-80.2390, 43.5608],
          [-80.2485, 43.5608],
          [-80.2485, 43.5535],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: 'Downtown Dense Urban Zone',
        type: 'URBAN',
        notes: 'High pedestrian density and mixed low-rise structures.',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-80.2625, 43.5390],
          [-80.2380, 43.5390],
          [-80.2380, 43.5515],
          [-80.2625, 43.5515],
          [-80.2625, 43.5390],
        ]],
      },
    },
  ],
}

const CIVIL_STYLE: Record<string, { color: string; fillOpacity: number; dashArray?: string }> = {
  HOSPITAL: { color: '#ff6a6a', fillOpacity: 0.14, dashArray: '4 4' },
  URBAN: { color: '#6ad3ff', fillOpacity: 0.1 },
}

const CIVIL_POI = [
  {
    name: 'Regional Airport (Sample)',
    category: 'AIRPORT',
    position: [43.5488, -80.2269] as [number, number],
  },
  {
    name: 'School Zone (Sample)',
    category: 'SCHOOL',
    position: [43.5459, -80.2418] as [number, number],
  },
]

export function CivilOverlays() {
  return (
    <>
      <GeoJSON
        data={CIVIL_AREAS}
        style={feature => {
          const type = String(feature?.properties?.type ?? 'URBAN')
          const style = CIVIL_STYLE[type] ?? CIVIL_STYLE.URBAN
          return {
            color: style.color,
            weight: 2,
            fillColor: style.color,
            fillOpacity: style.fillOpacity,
            dashArray: style.dashArray,
          }
        }}
        onEachFeature={(feature, layer) => {
          if (!feature.properties) return
          const name = String(feature.properties.name ?? 'Civil zone')
          const type = String(feature.properties.type ?? 'UNKNOWN')
          const notes = String(feature.properties.notes ?? '')
          layer.bindPopup(`<strong>${name}</strong><br/>Type: ${type}<br/>${notes}`)
        }}
      />

      {CIVIL_POI.map(poi => (
        <CircleMarker
          key={poi.name}
          center={poi.position}
          radius={6}
          pathOptions={{ color: '#ffffff', fillColor: '#1f6feb', fillOpacity: 0.8, weight: 1 }}
        >
          <Popup>
            <strong>{poi.name}</strong>
            <br />
            {poi.category}
          </Popup>
        </CircleMarker>
      ))}
    </>
  )
}
