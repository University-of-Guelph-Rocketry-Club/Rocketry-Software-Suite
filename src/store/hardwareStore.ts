import { create } from 'zustand'
import type { ProtocolSchema, SerialPortInfo } from '../types/protocol'
import {
  identifyByUsb,
  refineWithTelemetry,
  type HardwareFingerprint,
} from '../utils/hardwareFingerprint'
import type { TelemetryPacket } from '../types/telemetry'

const RAW_LOG_LIMIT = 100
const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)

export interface RawPacketEntry {
  ts: number
  hex: string
}

interface HardwareStore {
  // Port discovery
  ports: SerialPortInfo[]
  // Connection state
  connected: boolean
  portName: string
  baudRate: number
  protocol: ProtocolSchema | null
  // Live status
  status: string
  lastError: string | null
  // Diagnostics
  packetsDecoded: number
  hardwareFingerprint: HardwareFingerprint | null
  // Raw frame log (last RAW_LOG_LIMIT frames)
  rawLog: RawPacketEntry[]

  // Actions
  fetchPorts: () => Promise<void>
  connect: (port: string, baud: number, protocol: ProtocolSchema) => Promise<void>
  disconnect: () => Promise<void>
  setStatus: (msg: string) => void
  setLastError: (msg: string | null) => void
  addRawPacket: (hex: string) => void
  refineHardwareFingerprint: (packet: TelemetryPacket) => void
  incrementDecoded: () => void
}

export const useHardwareStore = create<HardwareStore>((set, get) => ({
  ports: [],
  connected: false,
  portName: '',
  baudRate: 115200,
  protocol: null,
  status: 'Not connected',
  lastError: null,
  packetsDecoded: 0,
  hardwareFingerprint: null,
  rawLog: [],

  fetchPorts: async () => {
    if (!isTauri) {
      set({ ports: [{ name: '(Tauri required)', type: 'N/A' }] })
      return
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const ports: SerialPortInfo[] = await invoke('list_serial_ports')
      set({ ports })
    } catch (e) {
      set({ lastError: String(e) })
    }
  },

  connect: async (port, baud, protocol) => {
    if (!isTauri) {
      set({ lastError: 'Serial requires the Tauri desktop app' })
      return
    }
    const selectedPortMeta = get().ports.find(p => p.name === port)
    const initialFingerprint = identifyByUsb(
      selectedPortMeta?.usbVendorId,
      selectedPortMeta?.usbProductId,
    )
    set({ portName: port, baudRate: baud, protocol })
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_serial_port', {
        port,
        baud,
        protocolJson: JSON.stringify(protocol),
      })
      set({ connected: true, lastError: null, hardwareFingerprint: initialFingerprint })
    } catch (e) {
      set({ connected: false, lastError: String(e), hardwareFingerprint: null })
    }
  },

  disconnect: async () => {
    if (!isTauri) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('close_serial_port')
    } catch (_) { /* ignore */ } finally {
      set({ connected: false, status: 'Disconnected', hardwareFingerprint: null })
    }
  },

  setStatus: (msg) => set({ status: msg }),
  setLastError: (msg) => set({ lastError: msg }),

  addRawPacket: (hex) =>
    set((s) => ({
      rawLog: [
        { ts: Date.now(), hex },
        ...s.rawLog,
      ].slice(0, RAW_LOG_LIMIT),
      packetsDecoded: s.packetsDecoded + 1,
    })),

  refineHardwareFingerprint: (packet) =>
    set((s) => ({
      hardwareFingerprint: refineWithTelemetry(packet, s.hardwareFingerprint),
    })),

  incrementDecoded: () =>
    set((s) => ({ packetsDecoded: s.packetsDecoded + 1 })),
}))
