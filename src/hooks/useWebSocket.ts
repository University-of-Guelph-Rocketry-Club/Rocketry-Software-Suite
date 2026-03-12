import { useEffect, useRef, useCallback } from 'react'
import { useTelemetryStore } from '../store/telemetryStore'
import type { TelemetryPacket } from '../types/telemetry'
import type { StreamSource } from '../types/schema'

const RECONNECT_BASE_MS = 2000
const RECONNECT_MAX_MS = 30_000

/** Parse raw WebSocket message into a TelemetryPacket.
 *  Supports both flat JSON and nested { seq, ts, src, data: {...} } envelopes. */
function parseMessage(raw: string, sourceId: string): TelemetryPacket | null {
  try {
    const obj = JSON.parse(raw)
    const now = Date.now()

    // Nested envelope format
    if (obj.data && typeof obj.data === 'object') {
      return {
        rcvTs: now,
        seq: typeof obj.seq === 'number' ? obj.seq : 0,
        ts: typeof obj.ts === 'number' ? obj.ts : now,
        src: obj.src ?? sourceId,
        ...obj.data,
      }
    }

    // Flat format — must have at least a ts field or we inject one
    return {
      rcvTs: now,
      seq: typeof obj.seq === 'number' ? obj.seq : 0,
      ts: typeof obj.ts === 'number' ? obj.ts : now,
      src: obj.src ?? sourceId,
      ...obj,
    }
  } catch {
    return null
  }
}

/** Manages a single WebSocket connection to one telemetry source */
function useSourceSocket(source: StreamSource) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempt = useRef(0)
  const isMounted = useRef(true)

  const { setConnected, ingestPacket } = useTelemetryStore.getState()

  const connect = useCallback(() => {
    if (!isMounted.current || !source.enabled) return

    try {
      const ws = new WebSocket(source.wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttempt.current = 0
        setConnected(source.id, true)
      }

      ws.onmessage = (evt) => {
        const packet = parseMessage(evt.data as string, source.id)
        if (packet) ingestPacket(packet)
      }

      ws.onerror = () => {
        // onerror is always followed by onclose
      }

      ws.onclose = () => {
        setConnected(source.id, false)
        if (!isMounted.current) return

        reconnectAttempt.current++
        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(1.5, reconnectAttempt.current - 1),
          RECONNECT_MAX_MS
        )
        reconnectTimer.current = setTimeout(connect, delay)
      }
    } catch {
      setConnected(source.id, false)
    }
  }, [source, setConnected, ingestPacket])

  useEffect(() => {
    isMounted.current = true
    connect()
    return () => {
      isMounted.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Expose a manual reconnect
  return {
    reconnect: () => {
      wsRef.current?.close()
      reconnectAttempt.current = 0
      connect()
    },
  }
}

/** Manages WebSocket connections for all enabled sources from the schema */
export function useWebSockets() {
  const schema = useTelemetryStore(s => s.schema)
  const enabledSources = schema.sources.filter(s => s.enabled)

  // One hook call per source — we track them in a stable ref map
  const connectorsRef = useRef<Map<string, ReturnType<typeof useSourceSocket>>>(new Map())

  // For each enabled source, set up connection
  for (const source of enabledSources) {
    if (!connectorsRef.current.has(source.id)) {
      // We can't call hooks conditionally so we manage lifecycle imperatively
    }
  }

  // This hook manages all sources imperatively since we can't call hooks in a loop
  useEffect(() => {
    const sockets: WebSocket[] = []
    const timers: ReturnType<typeof setTimeout>[] = []
    const { setConnected, ingestPacket } = useTelemetryStore.getState()

    function connectSource(source: StreamSource, attempt: number) {
      if (!source.enabled) return

      try {
        const ws = new WebSocket(source.wsUrl)
        sockets.push(ws)

        ws.onopen = () => {
          setConnected(source.id, true)
        }

        ws.onmessage = (evt) => {
          const packet = parseMessage(evt.data as string, source.id)
          if (packet) ingestPacket(packet)
        }

        ws.onclose = () => {
          setConnected(source.id, false)
          const delay = Math.min(RECONNECT_BASE_MS * Math.pow(1.5, attempt), RECONNECT_MAX_MS)
          const t = setTimeout(() => connectSource(source, attempt + 1), delay)
          timers.push(t)
        }
      } catch {
        setConnected(source.id, false)
        const delay = RECONNECT_BASE_MS
        const t = setTimeout(() => connectSource(source, attempt + 1), delay)
        timers.push(t)
      }
    }

    for (const source of enabledSources) {
      connectSource(source, 0)
    }

    return () => {
      for (const ws of sockets) ws.close()
      for (const t of timers) clearTimeout(t)
    }
  // Re-run when enabled sources change (by serialising to string key)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledSources.map(s => `${s.id}:${s.wsUrl}:${s.enabled}`).join('|')])
}

/** Inject a simulated demo packet for development/testing */
export function useDemoSimulator(sourceId = 'rocket', hz = 10) {
  const ingestPacket = useTelemetryStore(s => s.ingestPacket)
  const setConnected = useTelemetryStore(s => s.setConnected)

  useEffect(() => {
    setConnected(sourceId, true)
    let seq = 0
    let t = 0

    const interval = setInterval(() => {
      t += 1 / hz
      seq++

      // Occasional simulated anomaly spike every ~20 s
      const spikeActive = Math.floor(t / 20) % 2 === 1 && Math.sin(t * 3) > 0.97

      const altitude = Math.max(0, 1200 * Math.sin(t * 0.15) + Math.random() * 5)

      // Euler angles in degrees
      const pitchDeg = 90 * Math.sin(t * 0.2) + (Math.random() - 0.5) * 2 + (spikeActive ? 45 : 0)
      const yawDeg   = 45 * Math.sin(t * 0.1) + (Math.random() - 0.5) * 1
      const rollDeg  = 20 * Math.cos(t * 0.3) + (Math.random() - 0.5) * 1

      // Convert Euler (YXZ) → unit quaternion for real-sensor accuracy
      const p2 = (pitchDeg * Math.PI / 180) / 2
      const y2 = (yawDeg   * Math.PI / 180) / 2
      const r2 = (rollDeg  * Math.PI / 180) / 2
      const quatW = Math.cos(y2) * Math.cos(p2) * Math.cos(r2) + Math.sin(y2) * Math.sin(p2) * Math.sin(r2)
      const quatX = Math.cos(y2) * Math.sin(p2) * Math.cos(r2) + Math.sin(y2) * Math.cos(p2) * Math.sin(r2)
      const quatY = Math.sin(y2) * Math.cos(p2) * Math.cos(r2) - Math.cos(y2) * Math.sin(p2) * Math.sin(r2)
      const quatZ = Math.cos(y2) * Math.cos(p2) * Math.sin(r2) - Math.sin(y2) * Math.sin(p2) * Math.cos(r2)

      const packet: TelemetryPacket = {
        seq,
        ts: Date.now() - Math.floor(Math.random() * 30),
        rcvTs: Date.now(),
        src: sourceId,
        pitch: pitchDeg,
        yaw:   yawDeg,
        roll:  rollDeg,
        quatW, quatX, quatY, quatZ,
        accelX: (Math.random() - 0.5) * 4 + (spikeActive ? 18 : 0),
        accelY: (Math.random() - 0.5) * 4,
        accelZ: 9.81 + Math.random() * 30 * Math.max(0, Math.sin(t * 0.3)),
        gyroX: (Math.random() - 0.5) * 10,
        gyroY: (Math.random() - 0.5) * 10,
        gyroZ: (Math.random() - 0.5) * 10,
        velocityX: (Math.random() - 0.5) * 2,
        velocityY: (Math.random() - 0.5) * 2,
        velocityZ: 1200 * 0.15 * Math.cos(t * 0.15),
        altitude,
        baroAltitude: altitude + (Math.random() - 0.5) * 10,
        latitude: 43.5448 + (altitude / 111111),
        longitude: -80.2482 + (Math.random() - 0.5) * 0.001,
        pressure: 1013.25 * Math.pow(1 - (altitude * 2.25577e-5), 5.25588),
        temperature: 15 - altitude * 0.0065 + (spikeActive ? 12 : 0),
        batteryVoltage: 3.85 - (seq * 0.0001),
        rssi: -60 - altitude * 0.02 + (Math.random() - 0.5) * 5,
        gpsFix: true,
        gpsSatellites: 9,
        gpsHdop: 1.2 + Math.random() * 0.8,
        state: altitude > 10 ? (t < 5 ? 'BOOST' : t < 15 ? 'COAST' : 'DESCENT') : 'IDLE',
      }
      ingestPacket(packet)
    }, 1000 / hz)

    return () => {
      clearInterval(interval)
      setConnected(sourceId, false)
    }
  }, [sourceId, hz, ingestPacket, setConnected])
}
