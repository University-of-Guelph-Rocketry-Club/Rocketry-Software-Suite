import { useEffect, useRef } from 'react'
import { useReplayStore } from '../store/replayStore'
import { useTelemetryStore } from '../store/telemetryStore'

/**
 * Drives the replay playback loop.
 * During replay, packets are injected into the telemetry store at the
 * correct relative timing, scaled by the playback speed.
 */
export function useReplayEngine() {
  const store = useReplayStore()
  const ingestPacket = useTelemetryStore(s => s.ingestPacket)
  const clearHistory = useTelemetryStore(s => s.clearHistory)

  const frameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null)
  const lastWallTimeRef = useRef<number>(0)
  const lastPacketTimeRef = useRef<number>(0)

  useEffect(() => {
    if (!store.isReplaying || store.isPaused) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      return
    }

    const { session, speed } = store

    if (session.length === 0) return

    // When playback starts, seed the wall-clock and packet-time references
    if (lastWallTimeRef.current === 0) {
      lastWallTimeRef.current = performance.now()
      lastPacketTimeRef.current = session[store.currentIndex]?.ts ?? 0
    }

    clearHistory()

    function frame() {
      const now = performance.now()
      const wallDeltaMs = now - lastWallTimeRef.current
      lastWallTimeRef.current = now

      const packetDeltaMs = wallDeltaMs * store.speed
      lastPacketTimeRef.current += packetDeltaMs

      const targetTs = lastPacketTimeRef.current

      // Emit all packets whose ts <= targetTs
      let idx = store.currentIndex
      while (idx < session.length && session[idx].ts <= targetTs) {
        ingestPacket(session[idx])
        idx++
      }

      if (idx >= session.length) {
        // Playback complete
        store.seekTo(session.length - 1)
        store.pauseReplay()
        return
      }

      useReplayStore.setState({
        currentIndex: idx,
        currentPacket: session[idx - 1] ?? null,
        progressPercent: (idx / (session.length - 1)) * 100,
      })

      frameRef.current = requestAnimationFrame(frame)
    }

    frameRef.current = requestAnimationFrame(frame)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      lastWallTimeRef.current = 0
    }
  }, [store.isReplaying, store.isPaused, store.speed, store.currentIndex])
}
