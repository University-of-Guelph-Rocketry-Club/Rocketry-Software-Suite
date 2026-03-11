/**
 * Atmospheric / trajectory forecasting utilities.
 *
 * Uses the Open-Meteo free API (no key required) for real-time wind aloft data.
 * Implements a simple Euler integration trajectory predictor based on wind layers.
 */
import type { WindLayer, TrajectoryPoint } from '../types/telemetry'

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast'

export interface OpenMeteoWindResponse {
  hourly: {
    time: string[]
    windspeed_10m: number[]
    winddirection_10m: number[]
    windspeed_80m: number[]
    winddirection_80m: number[]
    windspeed_120m: number[]
    winddirection_120m: number[]
    windspeed_180m: number[]
    winddirection_180m: number[]
  }
  hourly_units: Record<string, string>
}

/** Fetch current wind aloft layers from Open-Meteo */
export async function fetchWindLayers(lat: number, lon: number): Promise<WindLayer[]> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(6),
    longitude: lon.toFixed(6),
    hourly: [
      'windspeed_10m', 'winddirection_10m',
      'windspeed_80m', 'winddirection_80m',
      'windspeed_120m', 'winddirection_120m',
      'windspeed_180m', 'winddirection_180m',
    ].join(','),
    forecast_days: '1',
    timezone: 'auto',
    wind_speed_unit: 'ms',
  })

  const res = await fetch(`${OPEN_METEO_BASE}?${params}`)
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`)
  const data: OpenMeteoWindResponse = await res.json()

  // Find the current hour index
  const now = new Date()
  const hourIdx = Math.max(0, data.hourly.time.findIndex(t => new Date(t) > now) - 1)

  const i = Math.max(0, hourIdx)

  return [
    { altitudeM: 10,  speedMs: data.hourly.windspeed_10m[i],  directionDeg: data.hourly.winddirection_10m[i] },
    { altitudeM: 80,  speedMs: data.hourly.windspeed_80m[i],  directionDeg: data.hourly.winddirection_80m[i] },
    { altitudeM: 120, speedMs: data.hourly.windspeed_120m[i], directionDeg: data.hourly.winddirection_120m[i] },
    { altitudeM: 180, speedMs: data.hourly.windspeed_180m[i], directionDeg: data.hourly.winddirection_180m[i] },
  ]
}

/** Standard atmosphere density (kg/m³) at a given altitude (m) */
export function airDensity(altM: number): number {
  const T0 = 288.15   // K sea level
  const L = 0.0065    // K/m lapse rate
  const T = Math.max(216.65, T0 - L * altM)
  const P0 = 101325   // Pa
  const g = 9.80665
  const M = 0.0289644 // kg/mol molar mass of air
  const R = 8.31447
  const P = P0 * Math.pow(T / T0, g * M / (R * L))
  return (P * M) / (R * T)
}

/** Interpolate wind vector at a given altitude from layer data */
function interpolateWind(altM: number, layers: WindLayer[]): { vx: number; vy: number } {
  if (layers.length === 0) return { vx: 0, vy: 0 }

  const sorted = [...layers].sort((a, b) => a.altitudeM - b.altitudeM)

  if (altM <= sorted[0].altitudeM) {
    return windToVelocity(sorted[0])
  }
  if (altM >= sorted[sorted.length - 1].altitudeM) {
    return windToVelocity(sorted[sorted.length - 1])
  }

  // Linear interpolation between bracketing layers
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i]
    const hi = sorted[i + 1]
    if (altM >= lo.altitudeM && altM <= hi.altitudeM) {
      const t = (altM - lo.altitudeM) / (hi.altitudeM - lo.altitudeM)
      const vLo = windToVelocity(lo)
      const vHi = windToVelocity(hi)
      return {
        vx: vLo.vx + t * (vHi.vx - vLo.vx),
        vy: vLo.vy + t * (vHi.vy - vLo.vy),
      }
    }
  }
  return { vx: 0, vy: 0 }
}

/** Convert meteorological wind (bearing FROM, m/s) to Cartesian (East/North) velocity */
function windToVelocity(layer: WindLayer): { vx: number; vy: number } {
  // Met convention: direction = bearing the wind is blowing FROM
  const rad = (layer.directionDeg * Math.PI) / 180
  return {
    vx: -layer.speedMs * Math.sin(rad),   // East (+) component
    vy: -layer.speedMs * Math.cos(rad),   // North (+) component
  }
}

/** Degrees-per-metre for lat/lon conversion */
const DEG_PER_M_LAT = 1 / 111111
function degPerMLon(lat: number): number {
  return 1 / (111111 * Math.cos((lat * Math.PI) / 180))
}

/**
 * Predict rocket/balloon trajectory using Euler integration.
 *
 * @param startLat     Launch latitude (deg)
 * @param startLon     Launch longitude (deg)
 * @param startAlt     Launch altitude (m)
 * @param startVz      Initial vertical velocity (m/s), positive = upward
 * @param durationSec  Simulation duration (seconds)
 * @param dtSec        Timestep for integration (seconds)
 * @param layers       Wind aloft data
 */
export function predictTrajectory(
  startLat: number,
  startLon: number,
  startAlt: number,
  startVz: number,
  durationSec: number,
  dtSec: number,
  layers: WindLayer[],
): TrajectoryPoint[] {
  const g = 9.80665
  const points: TrajectoryPoint[] = []

  let lat = startLat
  let lon = startLon
  let alt = startAlt
  let vz = startVz

  for (let t = 0; t <= durationSec; t += dtSec) {
    points.push({ latitude: lat, longitude: lon, altitudeM: alt, timeOffsetSec: t })

    if (alt < 0) break

    const wind = interpolateWind(alt, layers)
    const rho = airDensity(alt)

    // Simple drag model: assume fixed Cd * A / m coefficient
    const dragCoeff = 0.01  // tune per vehicle
    const dragZ = -Math.sign(vz) * dragCoeff * rho * vz * vz

    const az = -g + dragZ
    vz = vz + az * dtSec
    alt = alt + vz * dtSec

    // Horizontal drift from wind
    lat = lat + wind.vy * dtSec * DEG_PER_M_LAT
    lon = lon + wind.vx * dtSec * degPerMLon(lat)
  }

  return points
}

/**
 * HAB float tracker: estimate float altitude & drift duration.
 * A HAB reaches neutral buoyancy at float altitude, then drifts
 * horizontally until burst or valve operation.
 *
 * Returns drift endpoint and time for given float parameters.
 */
export function habFloatDrift(
  startLat: number,
  startLon: number,
  floatAltM: number,
  floatDurationSec: number,
  ascendRateMs: number,
  layers: WindLayer[],
): { ascentTrajectory: TrajectoryPoint[]; floatTrajectory: TrajectoryPoint[] } {
  const ascentTimeSec = floatAltM / ascendRateMs

  // Ascent phase
  const ascentTrajectory = predictTrajectory(
    startLat, startLon, 0, ascendRateMs,
    ascentTimeSec, 5, layers
  )

  const floatStart = ascentTrajectory[ascentTrajectory.length - 1] ?? {
    latitude: startLat, longitude: startLon, altitudeM: floatAltM, timeOffsetSec: 0,
  }

  // Float phase — maintain altitude, drift with wind
  const floatTrajectory: TrajectoryPoint[] = []
  let lat = floatStart.latitude
  let lon = floatStart.longitude

  for (let t = 0; t <= floatDurationSec; t += 10) {
    floatTrajectory.push({ latitude: lat, longitude: lon, altitudeM: floatAltM, timeOffsetSec: t })
    const wind = interpolateWind(floatAltM, layers)
    lat = lat + wind.vy * 10 * DEG_PER_M_LAT
    lon = lon + wind.vx * 10 * degPerMLon(lat)
  }

  return { ascentTrajectory, floatTrajectory }
}
