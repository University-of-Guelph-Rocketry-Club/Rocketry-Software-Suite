import React, { useRef, useEffect } from 'react'
import { useHardwareStore } from '../../store/hardwareStore'

const BYTES_PER_ROW = 16

function formatHexRow(bytes: number[]): { hex: string; ascii: string } {
  const hex = bytes
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ')
    .padEnd(BYTES_PER_ROW * 3 - 1, ' ')
  const ascii = bytes
    .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'))
    .join('')
  return { hex, ascii }
}

export default function RawInspector() {
  const { rawLog, packetsDecoded } = useHardwareStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new packets
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [rawLog.length])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">Raw Frame Log</h3>
        <span className="text-xs text-gray-500">
          {packetsDecoded} frames received · showing last {rawLog.length}
        </span>
      </div>

      {rawLog.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          No frames received yet. Connect to a serial port.
        </div>
      ) : (
        <div className="flex-1 overflow-auto font-mono text-xs bg-gray-950 rounded border border-gray-700 p-3 space-y-4">
          {[...rawLog].reverse().map((entry, idx) => {
            const bytes = entry.hex
              .split(' ')
              .filter(Boolean)
              .map((h) => parseInt(h, 16))

            const rows: number[][] = []
            for (let i = 0; i < bytes.length; i += BYTES_PER_ROW) {
              rows.push(bytes.slice(i, i + BYTES_PER_ROW))
            }

            const time = new Date(entry.ts).toISOString().slice(11, 23)

            return (
              <div key={idx} className="border-b border-gray-800 pb-3">
                {/* Timestamp + byte count */}
                <div className="flex items-center gap-3 mb-1 text-gray-500">
                  <span>{time}</span>
                  <span>{bytes.length} bytes</span>
                </div>

                {/* Hex dump */}
                {rows.map((row, ri) => {
                  const offset = ri * BYTES_PER_ROW
                  const { hex, ascii } = formatHexRow(row)
                  return (
                    <div key={ri} className="flex gap-4">
                      <span className="text-gray-600 w-10 shrink-0 select-none">
                        {offset.toString(16).toUpperCase().padStart(4, '0')}
                      </span>
                      <span className="text-green-400 flex-1">{hex}</span>
                      <span className="text-gray-500 shrink-0">{ascii}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
