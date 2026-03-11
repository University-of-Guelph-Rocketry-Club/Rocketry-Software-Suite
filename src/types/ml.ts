/** Severity level for anomaly events */
export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical'

/** A single detected anomaly event */
export interface AnomalyEvent {
  ts: number
  severity: AnomalySeverity
  score: number          // 0–1 normalized z-score magnitude
  sensor: string         // field name that triggered
  description: string
  value: number
  baseline: number
  zScore: number
}

/** Combined anomaly score across all sensors at a moment in time */
export interface AnomalyScore {
  ts: number
  composite: number                     // 0–1 combined score
  byField: Record<string, number>       // per-field z-scores
}

/** Predicted future trajectory from ML model */
export interface TrajectoryPoint {
  timeOffset: number   // seconds from now
  altitude: number
  latitude: number
  longitude: number
  velocity: number
  confidence: number   // 0–1 per-point confidence
}

export interface TrajectoryPrediction {
  ts: number
  confidence: number
  predictedApogee: number          // meters
  predictedApogeeTime: number      // seconds from now
  predictedLandingLat: number
  predictedLandingLng: number
  predictedLandingRadius: number   // 1-sigma radius in meters
  trajectoryPoints: TrajectoryPoint[]
}

/** Digital twin state comparison */
export interface TwinFieldError {
  expected: number
  actual: number
  error: number      // absolute difference
  errorPct: number   // normalized to 0–1 (fraction of 3σ)
}

export interface DigitalTwinState {
  ts: number
  stateError: number                       // 0–1 overall divergence
  fieldErrors: Record<string, TwinFieldError>
  divergenceFlag: boolean
  divergenceSource?: string                // highest-error variable
}

/** RF / link quality prediction */
export type SignalQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
export type SignalTrend  = 'improving' | 'stable' | 'degrading'

export interface SignalQualityPrediction {
  ts: number
  currentRssi: number
  predictedRssi: number    // ~30 s ahead
  deadZoneRisk: number     // 0–1 probability of link loss
  quality: SignalQuality
  trendDirection: SignalTrend
}

/** Top-level ML insights bundle */
export type MLModelStatus = 'initializing' | 'calibrating' | 'active' | 'error'

export interface MLInsights {
  anomalyScore: AnomalyScore | null
  recentAnomalies: AnomalyEvent[]
  trajectory: TrajectoryPrediction | null
  digitalTwin: DigitalTwinState | null
  signalQuality: SignalQualityPrediction | null
  modelStatus: MLModelStatus
  calibrationProgress: number  // 0–1
}
