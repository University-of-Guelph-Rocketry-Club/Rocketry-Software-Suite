import { create } from 'zustand'
import type { TelemetryPacket, ReplayNote } from '../types/telemetry'

export type ReplaySpeed = 0.25 | 0.5 | 1 | 2 | 5 | 10

interface ReplayStore {
  // Saved session
  session: TelemetryPacket[]
  sessionName: string

  // Playback state
  isReplaying: boolean
  isPaused: boolean
  currentIndex: number
  speed: ReplaySpeed
  notes: ReplayNote[]

  // Derived
  currentPacket: TelemetryPacket | null
  progressPercent: number

  // Actions
  loadSession: (packets: TelemetryPacket[], name?: string) => void
  startReplay: () => void
  pauseReplay: () => void
  stopReplay: () => void
  seekTo: (index: number) => void
  seekToTime: (timestamp: number) => void
  setSpeed: (speed: ReplaySpeed) => void
  stepForward: () => void
  stepBack: () => void
  addNote: (text: string) => void
  removeNote: (id: string) => void
  exportNotes: () => string
}

export const useReplayStore = create<ReplayStore>((set, get) => ({
  session: [],
  sessionName: 'Untitled Session',
  isReplaying: false,
  isPaused: false,
  currentIndex: 0,
  speed: 1,
  notes: [],
  currentPacket: null,
  progressPercent: 0,

  loadSession: (packets, name = 'Session') => {
    const sorted = [...packets].sort((a, b) => a.ts - b.ts)
    set({
      session: sorted,
      sessionName: name,
      currentIndex: 0,
      currentPacket: sorted[0] ?? null,
      progressPercent: 0,
      isReplaying: false,
      isPaused: false,
    })
  },

  startReplay: () => set({ isReplaying: true, isPaused: false }),
  pauseReplay: () => set({ isPaused: true }),

  stopReplay: () => set({
    isReplaying: false,
    isPaused: false,
    currentIndex: 0,
    currentPacket: get().session[0] ?? null,
    progressPercent: 0,
  }),

  seekTo: (index) => {
    const { session } = get()
    const clamped = Math.max(0, Math.min(index, session.length - 1))
    set({
      currentIndex: clamped,
      currentPacket: session[clamped] ?? null,
      progressPercent: session.length > 1 ? (clamped / (session.length - 1)) * 100 : 0,
    })
  },

  seekToTime: (timestamp) => {
    const { session } = get()
    const idx = session.findIndex(p => p.ts >= timestamp)
    get().seekTo(idx < 0 ? session.length - 1 : idx)
  },

  setSpeed: (speed) => set({ speed }),

  stepForward: () => {
    const { currentIndex, session } = get()
    get().seekTo(Math.min(currentIndex + 1, session.length - 1))
  },

  stepBack: () => {
    const { currentIndex } = get()
    get().seekTo(Math.max(currentIndex - 1, 0))
  },

  addNote: (text) => {
    const { currentIndex, currentPacket } = get()
    const note: ReplayNote = {
      id: `note-${Date.now()}`,
      packetIndex: currentIndex,
      timestamp: currentPacket?.ts ?? Date.now(),
      text,
    }
    set(s => ({ notes: [...s.notes, note] }))
  },

  removeNote: (id) => set(s => ({ notes: s.notes.filter(n => n.id !== id) })),

  exportNotes: () => {
    const { notes, session, sessionName } = get()
    const lines = [
      `# ${sessionName} — Replay Notes`,
      `# Exported: ${new Date().toISOString()}`,
      '',
      ...notes.map(n => {
        const pkt = session[n.packetIndex]
        const time = pkt ? new Date(pkt.ts).toISOString() : '?'
        return `[${time}] [#${n.packetIndex}] ${n.text}`
      }),
    ]
    return lines.join('\n')
  },
}))
