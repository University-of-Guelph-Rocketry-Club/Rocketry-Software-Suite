import { useEffect } from 'react'
import { useTelemetryStore } from '../store/telemetryStore'
import { useHardwareStore } from '../store/hardwareStore'
import type { TelemetryPacket } from '../types/telemetry'

const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)

/**
 * Subscribe to Tauri events emitted by the Rust serial bridge.
 * Call once at the top level of the app — safe to call in web-only mode.
 */
export function useHardwareEvents() {
  const ingestPacket = useTelemetryStore((s) => s.ingestPacket)
  const { setStatus, addRawPacket, setLastError } = useHardwareStore.getState()

  useEffect(() => {
    if (!isTauri) return

    let unlisten: Array<() => void> = []

    async function subscribe() {
      const { listen } = await import('@tauri-apps/api/event')

      unlisten.push(
        await listen<TelemetryPacket>('telemetry:packet', (ev) => {
          ingestPacket(ev.payload)
          useHardwareStore.getState().refineHardwareFingerprint(ev.payload)
        }),
      )

      unlisten.push(
        await listen<string>('serial:status', (ev) => {
          const msg = ev.payload
          setStatus(msg)
          // Reflect disconnection in store
          if (msg.startsWith('Disconnected') || msg.startsWith('Closed')) {
            useHardwareStore.setState({ connected: false, hardwareFingerprint: null })
          }
        }),
      )

      unlisten.push(
        await listen<string>('serial:raw', (ev) => {
          addRawPacket(ev.payload)
        }),
      )
    }

    subscribe().catch((e) => setLastError(String(e)))

    return () => {
      unlisten.forEach((fn) => fn())
    }
  }, [ingestPacket])
}
