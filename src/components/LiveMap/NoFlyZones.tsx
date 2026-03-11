import { GeoJSON } from 'react-leaflet'
import type { FeatureCollection } from 'geojson'
import L from 'leaflet'

/**
 * Example no-fly zone GeoJSON.
 *
 * In production, replace / augment this with:
 *  - FAA Digital-NOTAM API: https://external-api.faa.gov/notamapi/v1/notams
 *  - Nav Canada NOTAM feed
 *  - Custom airspace boundaries loaded from a local file via Tauri file dialog
 *
 * The polygon coordinates are [longitude, latitude] per GeoJSON spec.
 */
const EXAMPLE_NO_FLY_ZONES: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: 'Example TFR — Airport Exclusion Zone',
        type: 'TFR',
        altitudeFt: '0–400',
        reason: 'Airport proximity',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-80.3000, 43.5260],
          [-80.2600, 43.5260],
          [-80.2600, 43.5620],
          [-80.3000, 43.5620],
          [-80.3000, 43.5260],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: 'Class C Airspace',
        type: 'CLASS_C',
        altitudeFt: '0–1200',
        reason: 'Controlled airspace',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-80.3600, 43.4900],
          [-80.1500, 43.4900],
          [-80.1500, 43.6000],
          [-80.3600, 43.6000],
          [-80.3600, 43.4900],
        ]],
      },
    },
  ],
}

const ZONE_COLORS: Record<string, string> = {
  TFR:     '#ff2222',
  CLASS_B: '#ff6600',
  CLASS_C: '#ffaa00',
  CLASS_D: '#ffdd00',
  DEFAULT: '#ff4488',
}

export function NoFlyZones() {
  return (
    <GeoJSON
      data={EXAMPLE_NO_FLY_ZONES}
      style={feature => {
        const type = feature?.properties?.type ?? 'DEFAULT'
        const color = ZONE_COLORS[type as string] ?? ZONE_COLORS.DEFAULT
        return {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.12,
          dashArray: '6 4',
        }
      }}
      onEachFeature={(feature, layer) => {
        if (feature.properties) {
          layer.bindPopup(`
            <strong>${feature.properties.name}</strong><br/>
            Type: ${feature.properties.type}<br/>
            Altitude: ${feature.properties.altitudeFt} ft<br/>
            Reason: ${feature.properties.reason}
          `)
        }
      }}
    />
  )
}
