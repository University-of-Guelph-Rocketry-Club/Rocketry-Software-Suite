import { create } from 'zustand'
import type { MLInsights, AnomalyScore } from '../types/ml'
import { AnomalyDetector } from '../utils/anomalyDetection'
import type { TelemetryPacket } from '../types/telemetry'

const MAX_ANOMALY_HISTORY = 60
const MAX_SCORE_HISTORY   = 400

interface MLStore {
  insights: MLInsights
  scoreHistory: AnomalyScore[]
  detector: AnomalyDetector
  processPacket: (pkt: TelemetryPacket) => void
  clearHistory: () => void
}

function initialInsights(): MLInsights {
  return {
    anomalyScore:     null,
    recentAnomalies:  [],
    trajectory:       null,
    digitalTwin:      null,
    signalQuality:    null,
    modelStatus:      'initializing',
    calibrationProgress: 0,
  }
}

export const useMLStore = create<MLStore>((set, get) => {
  const detector = new AnomalyDetector()

  return {
    insights:     initialInsights(),
    scoreHistory: [],
    detector,

    processPacket(pkt) {
      detector.ingest(pkt)

      const cal = detector.calibrationProgress
      const modelStatus: MLInsights['modelStatus'] =
        cal < 0.2  ? 'initializing' :
        cal < 0.95 ? 'calibrating'  : 'active'

      const anomalyScore   = detector.computeAnomalyScore(pkt)
      const newAnomalies   = detector.detectAnomalies(pkt)
      const trajectory     = detector.predictTrajectory(pkt)
      const digitalTwin    = detector.computeDigitalTwin(pkt)
      const signalQuality  = detector.predictSignalQuality(pkt)

      set(state => {
        // Deduplicate anomaly events by sensor+severity within 2 s
        const prev = state.insights.recentAnomalies
        const deduped = newAnomalies.filter(ev =>
          !prev.some(p => p.sensor === ev.sensor && ev.ts - p.ts < 2000)
        )
        const combined = [...deduped, ...prev].slice(0, MAX_ANOMALY_HISTORY)
        const scoreHistory = [...state.scoreHistory, anomalyScore].slice(-MAX_SCORE_HISTORY)

        return {
          scoreHistory,
          insights: {
            anomalyScore,
            recentAnomalies: combined,
            trajectory,
            digitalTwin,
            signalQuality,
            modelStatus,
            calibrationProgress: cal,
          },
        }
      })
    },

    clearHistory() {
      set({ insights: initialInsights(), scoreHistory: [] })
    },
  }
})
