/** A raw telemetry packet received over WebSocket */
export interface TelemetryPacket {
  seq: number            // monotonic sequence number
  ts: number             // Unix timestamp milliseconds (packet origin time)
  rcvTs: number          // Unix timestamp milliseconds (local receive time)
  src: string            // source ID matching schema sources[].id

  // --- IMU (Euler degrees - legacy fallback) ---
  pitch?: number         // degrees, nose-up positive
  yaw?: number           // degrees, clockwise positive
  roll?: number          // degrees, right-roll positive

  // --- Quaternion orientation (preferred over Euler - avoids gimbal lock) ---
  quatW?: number         // scalar component  (unit quaternion: w²+x²+y²+z²=1)
  quatX?: number         // i component
  quatY?: number         // j component
  quatZ?: number         // k component

  // --- Accelerometer (m/s²) ---
  accelX?: number
  accelY?: number
  accelZ?: number

  // --- Gyroscope (deg/s) ---
  gyroX?: number
  gyroY?: number
  gyroZ?: number

  // --- GPS ---
  latitude?: number
  longitude?: number
  altitude?: number      // meters above sea level
  gpsFix?: boolean
  gpsHdop?: number
  gpsSatellites?: number

  // --- Barometric ---
  pressure?: number      // hPa
  temperature?: number   // °C
  baroAltitude?: number  // meters

  // --- Spectrometer channels (normalized intensity or calibrated units) ---
  spectrometer450?: number
  spectrometer550?: number
  spectrometer680?: number

  // --- Velocities (m/s) ---
  velocityX?: number
  velocityY?: number
  velocityZ?: number

  // --- System---
  batteryVoltage?: number  // V
  rssi?: number            // dBm
  state?: string           // FSM state string e.g. "BOOST", "COAST", "APOGEE"

  // Dynamic fields from schema
  [key: string]: number | string | boolean | undefined
}

/** Running statistics for a numeric sensor field */
export interface FieldStats {
  field: string
  count: number
  min: number
  max: number
  mean: number
  /** Population std deviation */
  std: number
  /** Approximate median (P50) using reservoir */
  median: number
  /** Last recorded value */
  last: number
}

/** Aggregated diagnostics for one source stream */
export interface StreamDiagnostics {
  sourceId: string
  totalPackets: number
  outOfOrderCount: number
  latePackets: number          // arrived > 200ms after ts
  avgLatencyMs: number
  packetLossEst: number        // 0-1 estimate
  lastSeq: number
  lastRcvTs: number
  packetsPerSecond: number
}

/** A timestamped annotation in replay mode */
export interface ReplayNote {
  id: string
  packetIndex: number
  timestamp: number
  text: string
}

/** Mission phase */
export type MissionPhase = 'pre-flight' | 'in-flight' | 'recovery'

/** Pre-flight checklist item */
export interface ChecklistItem {
  id: string
  category: string
  label: string
  required: boolean
  checked: boolean
  bypassed?: boolean
  bypassReason?: string
  bypassedAt?: number
  autoValue?: string   // If set, auto-populated from telemetry field
  passCriteria?: string
}

/** Wind layer data point */
export interface WindLayer {
  altitudeM: number
  speedMs: number
  directionDeg: number   // meteorological: bearing wind is blowing FROM
}

/** Predicted trajectory coordinate */
export interface TrajectoryPoint {
  latitude: number
  longitude: number
  altitudeM: number
  timeOffsetSec: number
}
