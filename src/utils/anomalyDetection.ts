/**
 * anomalyDetection.ts
 *
 * Lightweight statistical ML engine running in the frontend.
 * Architecture mirrors a production deployment where:
 *   – An ONNX Autoencoder / Isolation-Forest model runs in Rust (via candle/burn)
 *   – An LSTM network produces trajectory predictions
 *   – A Kalman-filter Digital Twin tracks state divergence
 *   – Linear regression on RSSI history predicts signal fade
 *
 * This implementation uses equivalent statistical primitives so the TS
 * interface is identical to what the Rust inference backend would emit,
 * making the swap-out a pure backend concern with zero frontend changes.
 */

import type { TelemetryPacket } from '../types/telemetry'
import type {
  AnomalyEvent,
  AnomalyScore,
  TrajectoryPrediction,
  DigitalTwinState,
  SignalQualityPrediction,
} from '../types/ml'

/* ── Sensor config ─────────────────────────────────────────────── */

const ANOMALY_FIELDS = [
  'pitch', 'yaw', 'roll',
  'accelX', 'accelY', 'accelZ',
  'gyroX', 'gyroY', 'gyroZ',
  'temperature', 'pressure',
  'batteryVoltage', 'rssi',
] as const

type MonitoredField = typeof ANOMALY_FIELDS[number]

/**
 * Per-field z-score thresholds (warn, critical).
 * In a production ONNX autoencoder these are the reconstruction-error
 * thresholds learned during training.
 */
const THRESHOLDS: Record<MonitoredField, { warn: number; crit: number }> = {
  pitch:          { warn: 2.5, crit: 3.8 },
  yaw:            { warn: 2.5, crit: 3.8 },
  roll:           { warn: 2.5, crit: 3.8 },
  accelX:         { warn: 2.5, crit: 4.0 },
  accelY:         { warn: 2.5, crit: 4.0 },
  accelZ:         { warn: 2.5, crit: 4.5 },
  gyroX:          { warn: 2.5, crit: 3.8 },
  gyroY:          { warn: 2.5, crit: 3.8 },
  gyroZ:          { warn: 2.5, crit: 3.8 },
  temperature:    { warn: 2.0, crit: 3.2 },
  pressure:       { warn: 2.0, crit: 3.5 },
  batteryVoltage: { warn: 2.2, crit: 3.2 },
  rssi:           { warn: 1.8, crit: 2.8 },
}

/* ── Rolling statistics (O(1) update) ────────────────────────── */

class RollingStats {
  private buf: number[] = []
  private head = 0
  private filled = false
  private _sum = 0
  private _sumSq = 0
  private readonly cap: number

  constructor(cap = 120) { this.cap = cap }

  push(v: number) {
    if (this.filled) {
      const old = this.buf[this.head]
      this._sum   -= old
      this._sumSq -= old * old
    }
    this.buf[this.head] = v
    this._sum   += v
    this._sumSq += v * v
    this.head = (this.head + 1) % this.cap
    if (this.head === 0) this.filled = true
  }

  get count() { return this.filled ? this.cap : this.head }

  get mean() {
    const n = this.count
    return n > 0 ? this._sum / n : 0
  }

  get variance() {
    const n = this.count
    if (n < 2) return 0
    return Math.max(0, (this._sumSq - this._sum * this._sum / n) / (n - 1))
  }

  get std() { return Math.sqrt(this.variance) }

  zScore(v: number) {
    const s = this.std
    return s < 1e-6 ? 0 : Math.abs((v - this.mean) / s)
  }

  isReady() { return this.count >= 25 }
}

/* ── Main detector class ────────────────────────────────────────── */

export class AnomalyDetector {
  private stats: Record<MonitoredField, RollingStats>
  private rssi: number[] = []
  private packetCount = 0
  private readonly MAX_PACKETS = 600

  // Ring buffer of the last N packets (for trajectory prediction)
  private packets: TelemetryPacket[] = []

  constructor() {
    this.stats = Object.fromEntries(
      ANOMALY_FIELDS.map(f => [f, new RollingStats(120)])
    ) as Record<MonitoredField, RollingStats>
  }

  /* Ingest a new telemetry packet */
  ingest(pkt: TelemetryPacket) {
    this.packetCount++

    // Rolling packet ring
    this.packets.push(pkt)
    if (this.packets.length > this.MAX_PACKETS) this.packets.shift()

    // Update per-field rolling stats
    for (const f of ANOMALY_FIELDS) {
      const v = pkt[f]
      if (typeof v === 'number' && isFinite(v)) this.stats[f].push(v)
    }

    if (pkt.rssi !== undefined) {
      this.rssi.push(pkt.rssi as number)
      if (this.rssi.length > 80) this.rssi.shift()
    }
  }

  /* ── Calibration ── */

  get calibrationProgress() {
    const ready = ANOMALY_FIELDS.filter(f => this.stats[f].isReady()).length
    return ready / ANOMALY_FIELDS.length
  }

  get isCalibrated() { return this.calibrationProgress >= 0.6 }

  /* ── Anomaly Score (equivalent to autoencoder reconstruction error) ── */

  computeAnomalyScore(pkt: TelemetryPacket): AnomalyScore {
    const byField: Record<string, number> = {}
    let maxZ = 0

    for (const f of ANOMALY_FIELDS) {
      const v = pkt[f]
      if (typeof v === 'number' && isFinite(v) && this.stats[f].isReady()) {
        const z = this.stats[f].zScore(v)
        byField[f] = z
        if (z > maxZ) maxZ = z
      }
    }

    // Sigmoid-scaled composite: 0 at z=0, ~0.5 at z=3, ~0.95 at z=6
    const composite = 1 - 1 / (1 + Math.exp((maxZ - 3) * 0.7))

    return { ts: pkt.ts, composite: Math.min(1, composite), byField }
  }

  /* ── Anomaly Events (equivalent to Isolation Forest output) ── */

  detectAnomalies(pkt: TelemetryPacket): AnomalyEvent[] {
    if (!this.isCalibrated) return []
    const events: AnomalyEvent[] = []

    for (const f of ANOMALY_FIELDS) {
      const v = pkt[f]
      if (typeof v !== 'number' || !isFinite(v)) continue
      if (!this.stats[f].isReady()) continue

      const z = this.stats[f].zScore(v)
      const { warn, crit } = THRESHOLDS[f]
      if (z < warn) continue

      const severity =
        z >= crit * 1.6 ? 'critical' :
        z >= crit       ? 'high'     :
        z >= warn * 1.3 ? 'medium'   : 'low'

      events.push({
        ts:          pkt.ts,
        severity,
        score:       Math.min(1, z / 6),
        sensor:      f,
        description: `${f}: ${z.toFixed(1)}σ deviation from learned baseline`,
        value:       v,
        baseline:    this.stats[f].mean,
        zScore:      z,
      })
    }

    return events.sort((a, b) => b.zScore - a.zScore)
  }

  /* ── Trajectory Prediction (equivalent to LSTM / PINN output) ── */

  predictTrajectory(pkt: TelemetryPacket): TrajectoryPrediction | null {
    if (this.packets.length < 15) return null

    const alt  = (pkt.altitude ?? pkt.baroAltitude ?? 0) as number
    const vz   = (pkt.velocityZ ?? 0) as number
    const lat  = (pkt.latitude  ?? 0) as number
    const lng  = (pkt.longitude ?? 0) as number

    const g    = 9.81
    const timeToApogee   = Math.max(0, vz / g)
    const apogeeAlt      = alt + (vz * vz) / (2 * g)
    const timeToLanding  = timeToApogee + Math.sqrt(2 * Math.max(1, apogeeAlt) / g)

    // Estimate horizontal drift from recent velocity trend
    const recentVx = (pkt.velocityX ?? 0) as number
    const recentVy = (pkt.velocityY ?? 0) as number
    const dLat = recentVx * timeToLanding * 9e-6
    const dLng = recentVy * timeToLanding * 9e-6

    // Confidence grows with packet count; in production this is model certainty
    const confidence = Math.min(0.96, 0.4 + this.packets.length / 200)
    const radius     = Math.max(20, (1 - confidence) * 600)

    const points: TrajectoryPrediction['trajectoryPoints'] = []
    const step = Math.max(1, Math.round(timeToLanding / 40))
    for (let t = 0; t <= timeToLanding + step; t += step) {
      const altAtT =
        t <= timeToApogee
          ? alt + vz * t - 0.5 * g * t * t
          : Math.max(0, apogeeAlt - 0.5 * g * (t - timeToApogee) ** 2)
      const velAtT =
        t <= timeToApogee ? vz - g * t : -g * (t - timeToApogee)

      const frac = timeToLanding > 0 ? t / timeToLanding : 1
      points.push({
        timeOffset: t,
        altitude:   Math.max(0, altAtT),
        latitude:   lat + dLat * frac,
        longitude:  lng + dLng * frac,
        velocity:   Math.abs(velAtT),
        confidence: confidence * (1 - frac * 0.25),
      })
    }

    return {
      ts: pkt.ts,
      confidence,
      predictedApogee:        Math.max(alt, apogeeAlt),
      predictedApogeeTime:    timeToApogee,
      predictedLandingLat:    lat + dLat,
      predictedLandingLng:    lng + dLng,
      predictedLandingRadius: radius,
      trajectoryPoints:       points,
    }
  }

  /* ── Digital Twin (Kalman state-estimator residual) ── */

  computeDigitalTwin(pkt: TelemetryPacket): DigitalTwinState | null {
    if (!this.isCalibrated) return null

    const TWIN_FIELDS: MonitoredField[] = [
      'pitch', 'yaw', 'roll',
      'accelX', 'accelY', 'accelZ',
      'temperature', 'pressure',
    ]

    const fieldErrors: DigitalTwinState['fieldErrors'] = {}
    let totalErr = 0, n = 0, maxErr = 0
    let divergenceSource: string | undefined

    for (const f of TWIN_FIELDS) {
      const v = pkt[f]
      if (typeof v !== 'number' || !isFinite(v)) continue
      const stat = this.stats[f]
      if (!stat.isReady()) continue

      const expected  = stat.mean
      const error     = Math.abs(v - expected)
      const errorPct  = stat.std > 1e-6 ? Math.min(1, error / (stat.std * 3)) : 0

      fieldErrors[f] = { expected, actual: v, error, errorPct }
      totalErr += errorPct
      n++
      if (errorPct > maxErr) { maxErr = errorPct; divergenceSource = f }
    }

    const stateError = n > 0 ? Math.min(1, totalErr / n) : 0

    return {
      ts: pkt.ts,
      stateError,
      fieldErrors,
      divergenceFlag:   stateError > 0.45,
      divergenceSource: stateError > 0.25 ? divergenceSource : undefined,
    }
  }

  /* ── Signal Quality (DL-based channel estimation equivalent) ── */

  predictSignalQuality(pkt: TelemetryPacket): SignalQualityPrediction | null {
    if (this.rssi.length < 5) return null

    const current = (pkt.rssi as number | undefined) ?? this.rssi[this.rssi.length - 1]

    // Ordinary least-squares slope over recent RSSI window
    const n     = Math.min(30, this.rssi.length)
    const slice = this.rssi.slice(-n)
    const xMean = (n - 1) / 2
    const yMean = slice.reduce((a, b) => a + b, 0) / n
    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (slice[i] - yMean)
      den += (i - xMean) ** 2
    }
    const slope = den > 0 ? num / den : 0

    // Predict 30 samples ahead
    const predicted = current + slope * 30

    // Dead-zone risk: sigmoid centred at -90 dBm
    const deadZoneRisk = 1 / (1 + Math.exp((predicted + 88) * 0.35))

    const quality =
      current >= -60 ? 'excellent' :
      current >= -75 ? 'good'      :
      current >= -85 ? 'fair'      :
      current >= -95 ? 'poor'      : 'critical'

    const trendDirection =
      slope >  0.3 ? 'improving' :
      slope < -0.3 ? 'degrading' : 'stable'

    return {
      ts: Date.now(),
      currentRssi:   current,
      predictedRssi: predicted,
      deadZoneRisk:  Math.max(0, Math.min(1, deadZoneRisk)),
      quality,
      trendDirection,
    }
  }
}
