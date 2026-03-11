/**
 * useMLPipeline.ts
 *
 * Subscribes to the telemetry store and feeds every incoming packet
 * through the ML inference engine (mlStore.processPacket).
 *
 * In a production deployment this hook would instead receive pre-processed
 * ML insights from the Rust backend via a dedicated WebSocket channel.
 * The interface is identical — only the data origin changes.
 */
import { useEffect, useRef } from 'react'
import { useTelemetryStore } from '../store/telemetryStore'
import { useMLStore } from '../store/mlStore'
import type { TelemetryPacket } from '../types/telemetry'

export function useMLPipeline(sourceId?: string) {
  const processPacket = useMLStore.getState().processPacket
  const lastSeqRef    = useRef<number>(-1)

  useEffect(() => {
    // Subscribe to the telemetry store — fires on every packet ingested
    const unsubscribe = useTelemetryStore.subscribe(state => {
      const schema   = state.schema
      const srcId    = sourceId ?? schema.sources[0]?.id
      if (!srcId) return

      const latest: TelemetryPacket | null = state.sources[srcId]?.latest ?? null
      if (!latest) return

      // Only process each packet once (guard against re-renders)
      if (latest.seq === lastSeqRef.current) return
      lastSeqRef.current = latest.seq

      processPacket(latest)
    })

    return unsubscribe
  }, [sourceId, processPacket])
}
