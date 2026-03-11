import React, { useState, useEffect } from 'react'
import { useHardwareStore } from '../../store/hardwareStore'
import type { ProtocolSchema } from '../../types/protocol'
import RawInspector from './RawInspector'
import ProtocolTester from './ProtocolTester'

// ── Built-in protocol presets ─────────────────────────────────────────────────

const BUILT_IN_PROTOCOLS: Record<string, ProtocolSchema> = {
  'UoG Binary v1': {
    name: 'UoG Binary v1',
    description: 'Packed C struct — matches avionics_template.h',
    type: 'binary',
    endian: 'little',
    frameSize: 76,
    syncBytes: [0xAA, 0x55],
    checksumType: 'crc16',
    checksumOffset: 74,
    sourceId: 'rocket',
    fields: [
      { name: '_sync1',       type: 'uint8',   offset: 0 },
      { name: '_sync2',       type: 'uint8',   offset: 1 },
      { name: 'seq',          type: 'uint16',  offset: 2 },
      { name: 'ts',           type: 'uint32',  offset: 4 },
      { name: 'pitch',        type: 'float32', offset: 8 },
      { name: 'yaw',          type: 'float32', offset: 12 },
      { name: 'roll',         type: 'float32', offset: 16 },
      { name: 'accelX',       type: 'float32', offset: 20 },
      { name: 'accelY',       type: 'float32', offset: 24 },
      { name: 'accelZ',       type: 'float32', offset: 28 },
      { name: 'gyroX',        type: 'float32', offset: 32 },
      { name: 'gyroY',        type: 'float32', offset: 36 },
      { name: 'gyroZ',        type: 'float32', offset: 40 },
      { name: 'latitude',     type: 'float32', offset: 44 },
      { name: 'longitude',    type: 'float32', offset: 48 },
      { name: 'altitude',     type: 'float32', offset: 52 },
      { name: 'pressure',     type: 'float32', offset: 56 },
      { name: 'temperature',  type: 'float32', offset: 60 },
      { name: 'batteryVoltage', type: 'float32', offset: 64 },
      { name: 'rssi',         type: 'int16',   offset: 68 },
      { name: 'gpsFix',       type: 'uint8',   offset: 70 },
      { name: 'gpsSatellites', type: 'uint8',  offset: 71 },
      { name: 'state',        type: 'uint8',   offset: 72 },
    ],
  },
  'CSV (Arduino)': {
    name: 'CSV (Arduino)',
    description: 'Newline-terminated comma-separated values',
    type: 'csv',
    delimiter: ',',
    sourceId: 'rocket',
    csvFields: ['ts', 'pitch', 'yaw', 'roll', 'accelX', 'accelY', 'accelZ',
                 'latitude', 'longitude', 'altitude', 'pressure',
                 'batteryVoltage', 'temperature'],
    fields: [],
  },
  'JSON (newline)': {
    name: 'JSON (newline)',
    description: 'Newline-delimited JSON objects',
    type: 'json',
    sourceId: 'rocket',
    fields: [],
  },
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)

// ── Component ─────────────────────────────────────────────────────────────────

type Tab = 'connect' | 'raw' | 'tester'

export default function HardwareConfig() {
  const {
    ports, connected, portName, baudRate, status, lastError,
    packetsDecoded, rawLog,
    fetchPorts, connect, disconnect, protocol: activeProtocol,
  } = useHardwareStore()

  const [activeTab, setActiveTab] = useState<Tab>('connect')
  const [selectedPort, setSelectedPort] = useState(portName || '')
  const [selectedBaud, setSelectedBaud] = useState(baudRate)
  const [presetKey, setPresetKey] = useState<string>(Object.keys(BUILT_IN_PROTOCOLS)[0])
  const [customJson, setCustomJson] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [jsonError, setJsonError] = useState<string | null>(null)

  useEffect(() => {
    fetchPorts()
  }, [])

  function getSelectedProtocol(): ProtocolSchema | null {
    if (useCustom) {
      try {
        const parsed = JSON.parse(customJson) as ProtocolSchema
        setJsonError(null)
        return parsed
      } catch (e) {
        setJsonError(String(e))
        return null
      }
    }
    return BUILT_IN_PROTOCOLS[presetKey] ?? null
  }

  async function handleConnect() {
    const proto = getSelectedProtocol()
    if (!proto) return
    if (!selectedPort) return
    await connect(selectedPort, selectedBaud, proto)
  }

  const TAB_STYLE = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      activeTab === t
        ? 'border-sky-500 text-sky-400'
        : 'border-transparent text-gray-400 hover:text-gray-200'
    }`

  const statusColor = connected
    ? 'text-green-400'
    : lastError
    ? 'text-red-400'
    : 'text-yellow-400'

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Hardware / Avionics Link</h2>
            <p className={`text-xs mt-0.5 ${statusColor}`}>{status}</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>Packets decoded: <span className="text-white font-mono">{packetsDecoded}</span></span>
            {!isTauri && (
              <span className="bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded">
                ⚠ Tauri not detected — serial unavailable
              </span>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-3 border-b border-gray-700">
          <button className={TAB_STYLE('connect')} onClick={() => setActiveTab('connect')}>Connection</button>
          <button className={TAB_STYLE('raw')} onClick={() => setActiveTab('raw')}>
            Raw Inspector
            {rawLog.length > 0 && (
              <span className="ml-2 bg-sky-800 text-sky-200 text-xs px-1.5 py-0.5 rounded-full">
                {rawLog.length}
              </span>
            )}
          </button>
          <button className={TAB_STYLE('tester')} onClick={() => setActiveTab('tester')}>Protocol Tester</button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'connect' && (
          <ConnectionTab
            ports={ports}
            selectedPort={selectedPort}
            selectedBaud={selectedBaud}
            presetKey={presetKey}
            useCustom={useCustom}
            customJson={customJson}
            jsonError={jsonError}
            connected={connected}
            lastError={lastError}
            onPortChange={setSelectedPort}
            onBaudChange={setSelectedBaud}
            onPresetChange={(k) => { setPresetKey(k); setUseCustom(false) }}
            onCustomEnable={() => {
              if (!useCustom) setCustomJson(JSON.stringify(BUILT_IN_PROTOCOLS[presetKey], null, 2))
              setUseCustom(true)
            }}
            onCustomJsonChange={setCustomJson}
            onRefreshPorts={fetchPorts}
            onConnect={handleConnect}
            onDisconnect={disconnect}
          />
        )}
        {activeTab === 'raw' && <RawInspector />}
        {activeTab === 'tester' && (
          <ProtocolTester protocol={getSelectedProtocol()} />
        )}
      </div>
    </div>
  )
}

// ── Connection tab ────────────────────────────────────────────────────────────

interface ConnTabProps {
  ports: import('../../types/protocol').SerialPortInfo[]
  selectedPort: string
  selectedBaud: number
  presetKey: string
  useCustom: boolean
  customJson: string
  jsonError: string | null
  connected: boolean
  lastError: string | null
  onPortChange: (p: string) => void
  onBaudChange: (b: number) => void
  onPresetChange: (k: string) => void
  onCustomEnable: () => void
  onCustomJsonChange: (j: string) => void
  onRefreshPorts: () => void
  onConnect: () => void
  onDisconnect: () => void
}

function ConnectionTab(props: ConnTabProps) {
  const {
    ports, selectedPort, selectedBaud, presetKey, useCustom, customJson,
    jsonError, connected, lastError,
    onPortChange, onBaudChange, onPresetChange, onCustomEnable,
    onCustomJsonChange, onRefreshPorts, onConnect, onDisconnect,
  } = props

  const LABEL = 'block text-xs font-medium text-gray-400 mb-1'
  const SELECT = 'w-full bg-gray-800 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500'

  return (
    <div className="max-w-lg space-y-5">
      {/* Port selector */}
      <div>
        <label className={LABEL}>Serial Port</label>
        <div className="flex gap-2">
          <select
            value={selectedPort}
            onChange={(e) => onPortChange(e.target.value)}
            className={SELECT}
          >
            <option value="">— select port —</option>
            {ports.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}  {p.type !== 'Unknown' ? `(${p.type})` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={onRefreshPorts}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            title="Refresh port list"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Baud rate */}
      <div>
        <label className={LABEL}>Baud Rate</label>
        <select
          value={selectedBaud}
          onChange={(e) => onBaudChange(Number(e.target.value))}
          className={SELECT}
        >
          {BAUD_RATES.map((b) => (
            <option key={b} value={b}>{b.toLocaleString()}</option>
          ))}
        </select>
      </div>

      {/* Protocol selector */}
      <div>
        <label className={LABEL}>Protocol</label>
        <div className="flex gap-2">
          <select
            value={useCustom ? '__custom__' : presetKey}
            onChange={(e) => {
              if (e.target.value === '__custom__') onCustomEnable()
              else onPresetChange(e.target.value)
            }}
            className={SELECT}
          >
            {Object.keys(BUILT_IN_PROTOCOLS).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
            <option value="__custom__">Custom (JSON editor)</option>
          </select>
        </div>
      </div>

      {/* Protocol description */}
      {!useCustom && BUILT_IN_PROTOCOLS[presetKey] && (
        <p className="text-xs text-gray-500 italic">
          {BUILT_IN_PROTOCOLS[presetKey].description}
        </p>
      )}

      {/* Custom JSON editor */}
      {useCustom && (
        <div>
          <label className={LABEL}>Custom Protocol JSON</label>
          <textarea
            value={customJson}
            onChange={(e) => onCustomJsonChange(e.target.value)}
            rows={12}
            className="w-full bg-gray-800 border border-gray-600 text-gray-100 font-mono text-xs rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500"
            spellCheck={false}
          />
          {jsonError && (
            <p className="text-red-400 text-xs mt-1">{jsonError}</p>
          )}
        </div>
      )}

      {/* Error display */}
      {lastError && (
        <div className="bg-red-900/40 border border-red-700 rounded p-3 text-red-300 text-sm">
          {lastError}
        </div>
      )}

      {/* Connect / Disconnect */}
      <div className="flex gap-3 pt-2">
        {connected ? (
          <button
            onClick={onDisconnect}
            className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white rounded font-medium text-sm"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={!selectedPort || (useCustom && !!jsonError)}
            className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded font-medium text-sm"
          >
            Connect
          </button>
        )}
      </div>

      {/* Quick-start guide */}
      <details className="mt-6">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
          Firmware integration guide ▸
        </summary>
        <div className="mt-3 text-xs text-gray-400 space-y-2 border-l-2 border-gray-700 pl-3">
          <p>
            Copy <code className="bg-gray-800 px-1 rounded">src/schemas/protocols/avionics_template.h</code> into
            your firmware project. It defines <code className="bg-gray-800 px-1 rounded">TelemetryPacket_t</code> (76 bytes)
            and the <code className="bg-gray-800 px-1 rounded">uog_send_packet()</code> helper for STM32 HAL and Arduino.
          </p>
          <p>
            Point your FTDI / CP2102 USB-serial adapter to the correct port above, set the baud
            rate to match your firmware, select <em>UoG Binary v1</em>, and connect.
          </p>
          <p>
            For a simpler start, use the <em>CSV (Arduino)</em> preset with{' '}
            <code className="bg-gray-800 px-1 rounded">Serial.println()</code> output.
          </p>
        </div>
      </details>
    </div>
  )
}
