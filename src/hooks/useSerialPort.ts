import { useRef, useState, useCallback, useEffect } from 'react'
import { useTelemetryStore } from '../store/telemetryStore'
import type { TelemetryPacket } from '../types/telemetry'
import {
  identifyByUsb,
  refineWithTelemetry,
  type HardwareFingerprint,
} from '../utils/hardwareFingerprint'

// ── Web Serial API types ───────────────────────────────────────
interface SerialPort {
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string; bufferSize?: number }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  getInfo(): { usbVendorId?: number; usbProductId?: number }
}

interface SerialAPI {
  requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
}

declare global {
  interface Navigator { serial?: SerialAPI }
}

export const WEB_SERIAL_SUPPORTED = typeof navigator !== 'undefined' && 'serial' in navigator

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

export type SerialStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface RawLogLine {
  id: number
  ts: number
  hex: string
  text: string
  parsed: boolean
}

// ── Packet parser ──────────────────────────────────────────────
// Handles:  alt:215.6,vel:177.1,state:BOOST
//           {"alt":215.6,"state":"BOOST"}
//           CSV rows (after a header line is parsed)

let csvHeaders: string[] | null = null

function parseSerialLine(
  line: string,
  sourceId: string,
  seq: number,
): TelemetryPacket | null {
  const s = line.trim()
  if (!s || s.startsWith('#') || s.startsWith('//')) return null

  const now = Date.now()

  // JSON object
  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s)
      return buildPacket(o, sourceId, seq, now)
    } catch { return null }
  }

  // CSV: if it looks like a header (no numeric values) store it
  const cols = s.split(',').map(c => c.trim())
  const allAlpha = cols.every(c => isNaN(Number(c)))
  if (allAlpha && cols.length >= 3) {
    csvHeaders = cols.map(c => c.toLowerCase())
    return null
  }
  if (csvHeaders && cols.length === csvHeaders.length) {
    const o: Record<string, unknown> = {}
    csvHeaders.forEach((h, i) => { o[h] = isNaN(Number(cols[i])) ? cols[i] : Number(cols[i]) })
    return buildPacket(o, sourceId, seq, now)
  }

  // key:value pairs  alt:215.6,vel:177.1
  if (s.includes(':')) {
    const o: Record<string, unknown> = {}
    for (const part of s.split(',')) {
      const idx = part.indexOf(':')
      if (idx === -1) continue
      const k = part.slice(0, idx).trim().toLowerCase()
      const v = part.slice(idx + 1).trim()
      o[k] = isNaN(Number(v)) ? v : Number(v)
    }
    if (Object.keys(o).length > 0) return buildPacket(o, sourceId, seq, now)
  }

  return null
}

function g(o: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'number') return v
  }
  return undefined
}
function gs(o: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string') return v
  }
  return undefined
}
function gb(o: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'boolean') return v
    if (v === 1 || v === '1' || v === 'true') return true
    if (v === 0 || v === '0' || v === 'false') return false
  }
  return undefined
}

function buildPacket(
  o: Record<string, unknown>,
  sourceId: string,
  seq: number,
  now: number,
): TelemetryPacket {
  return {
    seq,
    ts:    typeof o['ts'] === 'number' ? o['ts'] as number : now,
    rcvTs: now,
    src:   sourceId,
    altitude:        g(o, 'alt', 'altitude'),
    baroAltitude:    g(o, 'baro', 'baroalt', 'baroaltitude'),
    velocityZ:       g(o, 'vel', 'vz', 'velocityz', 'velocity'),
    velocityX:       g(o, 'vx', 'velocityx'),
    velocityY:       g(o, 'vy', 'velocityy'),
    pitch:           g(o, 'pitch'),
    yaw:             g(o, 'yaw'),
    roll:            g(o, 'roll'),
    accelX:          g(o, 'ax', 'accelx'),
    accelY:          g(o, 'ay', 'accely'),
    accelZ:          g(o, 'az', 'accelz'),
    gyroX:           g(o, 'gx', 'gyrox'),
    gyroY:           g(o, 'gy', 'gyroy'),
    gyroZ:           g(o, 'gz', 'gyroz'),
    pressure:        g(o, 'pres', 'pressure'),
    temperature:     g(o, 'temp', 'temperature'),
    batteryVoltage:  g(o, 'batt', 'battery', 'batteryvoltage'),
    rssi:            g(o, 'rssi'),
    latitude:        g(o, 'lat', 'latitude'),
    longitude:       g(o, 'lon', 'lng', 'longitude'),
    gpsFix:          gb(o, 'fix', 'gpsfix'),
    gpsSatellites:   g(o, 'sats', 'satellites', 'gpssatellites'),
    gpsHdop:         g(o, 'hdop', 'gpshdop'),
    state:           gs(o, 'state'),
    quatW:           g(o, 'qw', 'quatw'),
    quatX:           g(o, 'qx', 'quatx'),
    quatY:           g(o, 'qy', 'quaty'),
    quatZ:           g(o, 'qz', 'quatz'),
  }
}

// ── Main hook ──────────────────────────────────────────────────
export function useSerialPort(sourceId = 'rocket') {
  const [status, setStatus]         = useState<SerialStatus>('disconnected')
  const [baudRate, setBaudRate]      = useState(115200)
  const [portInfo, setPortInfo]      = useState<string | null>(null)
  const [rawLog, setRawLog]          = useState<RawLogLine[]>([])
  const [packetCount, setPacketCount] = useState(0)
  const [lastPktTs, setLastPktTs]    = useState<number | null>(null)
  const [errorMsg, setErrorMsg]      = useState<string | null>(null)
  const [hardwareFingerprint, setHardwareFingerprint] = useState<HardwareFingerprint | null>(null)

  const portRef    = useRef<SerialPort | null>(null)
  const readerRef  = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const seqRef     = useRef(0)
  const logIdRef   = useRef(0)
  const isMounted  = useRef(true)

  const { ingestPacket, setConnected } = useTelemetryStore.getState()

  const appendLog = useCallback((raw: Uint8Array, text: string, parsed: boolean) => {
    const hex = Array.from(raw).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    setRawLog(prev => {
      const next = [...prev, { id: logIdRef.current++, ts: Date.now(), hex, text, parsed }]
      return next.length > 500 ? next.slice(-500) : next
    })
  }, [])

  const readLoop = useCallback(async (port: SerialPort) => {
    const decoder = new TextDecoder()
    let buffer = ''

    while (isMounted.current) {
      try {
        if (!port.readable) break
        const reader = port.readable.getReader()
        readerRef.current = reader
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            if (!value) continue

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue

              const packet = parseSerialLine(trimmed, sourceId, ++seqRef.current)
              appendLog(value, trimmed, packet !== null)

              if (packet) {
                ingestPacket(packet)
                setPacketCount(c => c + 1)
                setLastPktTs(Date.now())
                setHardwareFingerprint(prev => refineWithTelemetry(packet, prev))
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      } catch (err) {
        if (isMounted.current) {
          setStatus('error')
          setErrorMsg((err as Error).message)
          setConnected(sourceId, false)
        }
        break
      }
    }
  }, [sourceId, ingestPacket, setConnected, appendLog])

  const connect = useCallback(async () => {
    if (!WEB_SERIAL_SUPPORTED || !navigator.serial) {
      setErrorMsg('Web Serial API not supported — use Chrome/Edge 89+')
      setStatus('error')
      return
    }
    try {
      setStatus('connecting')
      setErrorMsg(null)

      const port = await navigator.serial.requestPort()
      await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' })

      portRef.current = port
      const info = port.getInfo()
      const usbFingerprint = identifyByUsb(info.usbVendorId, info.usbProductId)
      setHardwareFingerprint(usbFingerprint)
      setPortInfo(info.usbVendorId
        ? `VID:${info.usbVendorId?.toString(16).toUpperCase()} PID:${info.usbProductId?.toString(16).toUpperCase()}`
        : 'Serial Device'
      )
      setStatus('connected')
      setConnected(sourceId, true)
      csvHeaders = null

      readLoop(port)
    } catch (err) {
      const msg = (err as Error).message
      if (!msg.includes('No port selected')) {
        setErrorMsg(msg)
        setStatus('error')
      } else {
        setStatus('disconnected')
      }
    }
  }, [baudRate, sourceId, setConnected, readLoop])

  const disconnect = useCallback(async () => {
    try {
      readerRef.current?.cancel()
      await portRef.current?.close()
    } catch { /* ignore */ }
    portRef.current = null
    setStatus('disconnected')
    setConnected(sourceId, false)
    setPortInfo(null)
    setHardwareFingerprint(null)
  }, [sourceId, setConnected])

  const clearLog = useCallback(() => setRawLog([]), [])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    status, baudRate, setBaudRate, portInfo,
    rawLog, packetCount, lastPktTs,
    hardwareFingerprint,
    errorMsg, connect, disconnect, clearLog,
  }
}
