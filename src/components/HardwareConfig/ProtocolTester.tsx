import React, { useEffect, useState } from 'react'
import type { ProtocolSchema } from '../../types/protocol'
import { hexToBytes, decodeFrame } from '../../utils/packetDecoder'

interface Props {
  protocol: ProtocolSchema | null
}

const EXAMPLE_HEX_V1 =
  'AA 55 01 00 ' +   // sync1, sync2, seq=1
  'E8 03 00 00 ' +   // timestamp = 1000 ms
  '00 00 20 42 ' +   // pitch = 40.0°
  '00 00 00 00 ' +   // yaw = 0°
  '00 00 00 00 ' +   // roll = 0°
  '00 00 00 00 ' +   // accelX
  '00 00 00 00 ' +   // accelY
  '71 3D 1C 41 ' +   // accelZ = 9.81 m/s²
  '00 00 00 00 ' +   // gyroX
  '00 00 00 00 ' +   // gyroY
  '00 00 00 00 ' +   // gyroZ
  '52 B8 35 43 ' +   // latitude  = 181.72°
  '00 00 00 00 ' +   // longitude
  '00 40 9C 44 ' +   // altitude  = 1250 m
  '00 00 00 00 ' +   // pressure
  'CD CC CC 41 ' +   // temperature = 25.6°C
  '52 B8 8E 40 ' +   // batteryVoltage = 4.46 V
  'B8 FF ' +         // rssi = -72 dBm
  '01 08 ' +         // gpsFix=1, gpsSats=8
  '02 00 ' +         // state=BOOST, _reserved
  '00 00'            // crc16 placeholder (will fail checksum — that's shown in warnings)

const EXAMPLE_HEX_V2 =
  'AA 55 01 00 ' +   // sync1, sync2, seq=1
  'E8 03 00 00 ' +   // timestamp = 1000 ms
  '00 00 20 42 ' +   // pitch = 40.0°
  '00 00 00 00 ' +   // yaw = 0°
  '00 00 00 00 ' +   // roll = 0°
  '00 00 00 00 ' +   // accelX
  '00 00 00 00 ' +   // accelY
  '71 3D 1C 41 ' +   // accelZ = 9.81 m/s²
  '00 00 00 00 ' +   // gyroX
  '00 00 00 00 ' +   // gyroY
  '00 00 00 00 ' +   // gyroZ
  '52 B8 35 43 ' +   // latitude
  '00 00 00 00 ' +   // longitude
  '00 40 9C 44 ' +   // altitude = 1250 m
  '00 00 7A 44 ' +   // pressure = 1000 hPa
  'CD CC CC 41 ' +   // temperature = 25.6°C
  '52 B8 8E 40 ' +   // batteryVoltage = 4.46 V
  'B8 FF ' +         // rssi = -72 dBm
  '01 08 ' +         // gpsFix=1, gpsSats=8
  '00 00 C8 42 ' +   // spectrometer450 = 100.0
  '00 00 48 43 ' +   // spectrometer550 = 200.0
  '00 00 96 43 ' +   // spectrometer680 = 300.0
  '02 00 ' +         // state=BOOST, _reserved
  '00 00'            // crc16 placeholder (will fail checksum — that's shown in warnings)

function getExampleHex(protocol: ProtocolSchema | null): string {
  if (!protocol) return EXAMPLE_HEX_V2
  if (protocol.name === 'UoG Sensor Stack v2' || protocol.frameSize === 88) return EXAMPLE_HEX_V2
  return EXAMPLE_HEX_V1
}

export default function ProtocolTester({ protocol }: Props) {
  const [hexInput, setHexInput] = useState(getExampleHex(protocol))
  const [result, setResult] = useState<ReturnType<typeof decodeFrame> | null>(null)
  const [parseErr, setParseErr] = useState<string | null>(null)

  useEffect(() => {
    setHexInput(getExampleHex(protocol))
    setResult(null)
    setParseErr(null)
  }, [protocol?.name, protocol?.frameSize])

  function runDecode() {
    setParseErr(null)
    setResult(null)
    if (!protocol) {
      setParseErr('No protocol selected.')
      return
    }
    const bytes = hexToBytes(hexInput)
    if (!bytes) {
      setParseErr('Invalid hex input — use "AA BB CC" or "AABBCC" format.')
      return
    }
    const decoded = decodeFrame(bytes, protocol)
    if (!decoded) {
      setParseErr('Frame could not be decoded with the selected protocol.')
      return
    }
    setResult(decoded)
  }

  const hasData = result && Object.keys(result.fields).length > 0

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Protocol Tester</h3>
        <p className="text-xs text-gray-500">
          Paste raw bytes (hex) to test the active protocol schema without hardware.
        </p>
      </div>

      {/* Protocol info */}
      {protocol ? (
        <div className="bg-gray-800 rounded px-3 py-2 text-xs text-gray-400">
          Testing: <span className="text-gray-200 font-medium">{protocol.name}</span>
          &nbsp;·&nbsp;type: {protocol.type}
          {protocol.frameSize && ` · ${protocol.frameSize} bytes`}
        </div>
      ) : (
        <div className="bg-yellow-900/30 text-yellow-400 text-xs rounded px-3 py-2">
          Select a protocol on the Connection tab first.
        </div>
      )}

      {/* Hex input */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">
          Hex bytes
        </label>
        <textarea
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          rows={6}
          className="w-full bg-gray-950 border border-gray-700 text-green-400 font-mono text-xs rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="AA 55 01 00 …"
          spellCheck={false}
        />
        <p className="text-xs text-gray-600 mt-1">
          {hexInput.replace(/\s+/g, '').replace(/0x/gi, '').length / 2 | 0} bytes
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={runDecode}
          className="px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white rounded text-sm font-medium"
        >
          Decode
        </button>
        <button
          onClick={() => setHexInput(getExampleHex(protocol))}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium"
        >
          Load Sample
        </button>
      </div>

      {/* Parse error */}
      {parseErr && (
        <div className="bg-red-900/40 border border-red-700 rounded px-3 py-2 text-red-300 text-sm">
          {parseErr}
        </div>
      )}

      {/* Warnings */}
      {result && result.warnings.length > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded px-3 py-2 space-y-1">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-yellow-300 text-xs">⚠ {w}</p>
          ))}
        </div>
      )}

      {/* Decoded fields */}
      {hasData && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">
            Decoded Fields ({Object.keys(result!.fields).length})
          </h4>
          <div className="bg-gray-950 border border-gray-700 rounded overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left px-3 py-1.5 w-1/3">Field</th>
                  <th className="text-right px-3 py-1.5">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result!.fields).map(([key, val]) => (
                  <tr key={key} className="border-b border-gray-800 hover:bg-gray-900">
                    <td className="px-3 py-1.5 text-sky-400">{key}</td>
                    <td className="px-3 py-1.5 text-right text-green-300">
                      {typeof val === 'number'
                        ? Number.isInteger(val)
                          ? val.toString()
                          : val.toFixed(4)
                        : String(val)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
