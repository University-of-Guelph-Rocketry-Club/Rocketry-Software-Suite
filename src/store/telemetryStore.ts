import { create } from 'zustand'
import type { TelemetryPacket, StreamDiagnostics } from '../types/telemetry'
import type { GroundStationSchema, StreamSource } from '../types/schema'
import defaultSchema from '../schemas/defaultSchema.json'

const MAX_HISTORY = 10_000   // ring buffer max packets per source
const CHART_WINDOW = 300     // max data points in chart view

export interface SourceState {
  id: string
  connected: boolean
  packets: TelemetryPacket[]    // ring buffer
  latest: TelemetryPacket | null
  diagnostics: StreamDiagnostics
}

interface TelemetryStore {
  schema: GroundStationSchema
  sources: Record<string, SourceState>

  // Actions
  loadSchema: (schema: GroundStationSchema) => void
  setConnected: (sourceId: string, connected: boolean) => void
  ingestPacket: (packet: TelemetryPacket) => void
  getChartData: (sourceId: string, fieldKey: string) => Array<{ ts: number; value: number }>
  getLatestField: (sourceId: string, key: string) => number | string | boolean | undefined
  clearHistory: () => void
}

function initSourceState(source: StreamSource): SourceState {
  return {
    id: source.id,
    connected: false,
    packets: [],
    latest: null,
    diagnostics: {
      sourceId: source.id,
      totalPackets: 0,
      outOfOrderCount: 0,
      latePackets: 0,
      avgLatencyMs: 0,
      packetLossEst: 0,
      lastSeq: -1,
      lastRcvTs: 0,
      packetsPerSecond: 0,
    },
  }
}

function updateDiagnostics(
  diag: StreamDiagnostics,
  packet: TelemetryPacket,
): StreamDiagnostics {
  const now = packet.rcvTs
  const latency = now - packet.ts
  const isLate = latency > 200
  const isOutOfOrder = packet.seq < diag.lastSeq

  // Exponential moving avg latency
  const alpha = 0.1
  const newAvgLatency = diag.avgLatencyMs === 0
    ? latency
    : diag.avgLatencyMs * (1 - alpha) + latency * alpha

  // Packet loss: gaps in sequence numbers
  const expectedSeq = diag.lastSeq + 1
  const gap = Math.max(0, packet.seq - expectedSeq)
  const newTotal = diag.totalPackets + 1 + gap
  const lostEst = (diag.totalPackets > 0 && gap > 0)
    ? (diag.packetLossEst * diag.totalPackets + gap) / newTotal
    : diag.packetLossEst

  // PPS (packets per second) using 1-second EMA
  const dtMs = now - diag.lastRcvTs
  const instantPps = dtMs > 0 ? 1000 / dtMs : 0
  const newPps = diag.packetsPerSecond === 0
    ? instantPps
    : diag.packetsPerSecond * 0.9 + instantPps * 0.1

  return {
    ...diag,
    totalPackets: diag.totalPackets + 1,
    outOfOrderCount: diag.outOfOrderCount + (isOutOfOrder ? 1 : 0),
    latePackets: diag.latePackets + (isLate ? 1 : 0),
    avgLatencyMs: Math.max(0, newAvgLatency),
    packetLossEst: lostEst,
    lastSeq: Math.max(diag.lastSeq, packet.seq),
    lastRcvTs: now,
    packetsPerSecond: newPps,
  }
}

export const useTelemetryStore = create<TelemetryStore>((set, get) => ({
  schema: defaultSchema as GroundStationSchema,
  sources: Object.fromEntries(
    (defaultSchema as GroundStationSchema).sources.map(s => [s.id, initSourceState(s)])
  ),

  loadSchema: (schema) => {
    const sources: Record<string, SourceState> = {}
    for (const s of schema.sources) {
      sources[s.id] = get().sources[s.id] ?? initSourceState(s)
    }
    set({ schema, sources })
  },

  setConnected: (sourceId, connected) => {
    set(state => ({
      sources: {
        ...state.sources,
        [sourceId]: {
          ...(state.sources[sourceId] ?? initSourceState({ id: sourceId, name: sourceId, wsUrl: '', color: '#fff', enabled: true })),
          connected,
        },
      },
    }))
  },

  ingestPacket: (packet) => {
    set(state => {
      const srcState = state.sources[packet.src] ?? initSourceState({
        id: packet.src, name: packet.src, wsUrl: '', color: '#aaa', enabled: true,
      })
      const packets = [...srcState.packets, packet]
      if (packets.length > MAX_HISTORY) packets.splice(0, packets.length - MAX_HISTORY)

      return {
        sources: {
          ...state.sources,
          [packet.src]: {
            ...srcState,
            packets,
            latest: packet,
            diagnostics: updateDiagnostics(srcState.diagnostics, packet),
          },
        },
      }
    })
  },

  getChartData: (sourceId, fieldKey) => {
    const src = get().sources[sourceId]
    if (!src) return []
    const packets = src.packets.slice(-CHART_WINDOW)
    return packets
      .filter(p => p[fieldKey] !== undefined && typeof p[fieldKey] === 'number')
      .map(p => ({ ts: p.ts, value: p[fieldKey] as number }))
  },

  getLatestField: (sourceId, key) => {
    return get().sources[sourceId]?.latest?.[key]
  },

  clearHistory: () => {
    set(state => {
      const sources: Record<string, SourceState> = {}
      for (const [id, src] of Object.entries(state.sources)) {
        sources[id] = { ...src, packets: [], latest: null }
      }
      return { sources }
    })
  },
}))
