import { useEffect, useRef, useState } from 'react'
import { useTelemetryStore } from '../../store/telemetryStore'
import type { TelemetryPacket } from '../../types/telemetry'

const MAX_LINES = 200

/** Fields to show in the terminal — order matters for readability */
const DISPLAY_FIELDS: Array<keyof TelemetryPacket> = [
  'state', 'altitude', 'baroAltitude', 'pitch', 'yaw', 'roll',
  'accelX', 'accelY', 'accelZ', 'velocityZ',
  'batteryVoltage', 'rssi', 'gpsFix', 'gpsSatellites',
  'quatW', 'quatX', 'quatY', 'quatZ',
]

function formatField(key: string, val: TelemetryPacket[keyof TelemetryPacket]): string {
  if (val === undefined || val === null) return ''
  if (typeof val === 'boolean')        return `${key}=${val ? '1' : '0'}`
  if (typeof val === 'string')         return `${key}=${val}`
  if (typeof val === 'number')         return `${key}=${val.toFixed(3)}`
  return ''
}

/** Determine severity level from a packet — used to colour the data line */
function severity(p: TelemetryPacket): 'ok' | 'warn' | 'crit' {
  const ax = (p.accelX as number) ?? 0
  const ay = (p.accelY as number) ?? 0
  const az = (p.accelZ as number) ?? 9.81
  const g = Math.sqrt(ax ** 2 + ay ** 2 + az ** 2) / 9.80665
  if (g > 12) return 'crit'
  const pitch = Math.abs((p.pitch as number) ?? 0)
  if (pitch > 60 || g > 7) return 'warn'
  return 'ok'
}

interface LogLine {
  id: number
  ts: string
  src: string
  seq: number
  data: string
  sev: 'ok' | 'warn' | 'crit'
}

export function CommandTerminal({ sourceId }: { sourceId?: string }) {
  const schema    = useTelemetryStore(s => s.schema)
  const sid       = sourceId ?? schema.sources[0]?.id ?? 'rocket'
  const packets   = useTelemetryStore(s => s.sources[sid]?.packets ?? [])
  const totalPkts = useTelemetryStore(s => s.sources[sid]?.diagnostics.totalPackets ?? 0)

  const [lines, setLines] = useState<LogLine[]>([])
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const idxRef    = useRef(0)

  // Append new packets to the log (non-paused mode)
  useEffect(() => {
    if (paused) return
    const newPkts = packets.slice(idxRef.current)
    if (newPkts.length === 0) return
    idxRef.current = packets.length

    const newLines: LogLine[] = newPkts.map((p, i) => {
      const fields = DISPLAY_FIELDS
        .map(f => formatField(f as string, p[f]))
        .filter(Boolean)
        .join('  ')

      return {
        id: idxRef.current - newPkts.length + i,
        ts: new Date(p.ts).toISOString().slice(11, 23),
        src: p.src,
        seq: p.seq,
        data: fields || '(empty)',
        sev: severity(p),
      }
    })

    setLines(prev => {
      const updated = [...prev, ...newLines]
      return updated.length > MAX_LINES ? updated.slice(-MAX_LINES) : updated
    })
  }, [packets, paused])

  // Auto-scroll to bottom
  useEffect(() => {
    if (paused || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [lines, paused])

  const visible = filter
    ? lines.filter(l => l.data.toLowerCase().includes(filter.toLowerCase()) || l.src.includes(filter))
    : lines

  return (
    <div
      className="cmd-terminal"
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100%', overflow: 'hidden',
      }}
    >
      {/* ─ Toolbar ─ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '5px 12px', borderBottom: '1px solid rgba(168,255,62,0.12)',
        flexShrink: 0, background: 'rgba(0,0,0,0.3)',
      }}>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--lime)',
          letterSpacing: '0.10em', flexShrink: 0,
        }}>
          $ CONSOLE
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>
          raw telemetry · {sid}
        </span>

        {/* Filter */}
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="filter…"
          style={{
            background: 'rgba(168,255,62,0.05)', border: '1px solid rgba(168,255,62,0.18)',
            color: 'var(--lime)', borderRadius: 2, padding: '2px 7px',
            fontSize: 9, fontFamily: 'var(--mono)', width: 110, outline: 'none',
          }}
        />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>
            {totalPkts} packets
          </span>
          <button
            onClick={() => setPaused(p => !p)}
            style={{
              padding: '2px 7px', borderRadius: 2,
              border: `1px solid ${paused ? 'rgba(255,184,0,0.4)' : 'rgba(168,255,62,0.25)'}`,
              background: paused ? 'rgba(255,184,0,0.08)' : 'rgba(168,255,62,0.06)',
              color: paused ? 'var(--amber)' : 'var(--lime)',
              fontSize: 9, fontFamily: 'var(--mono)', cursor: 'pointer',
              fontWeight: 700, letterSpacing: '0.08em',
            }}
          >
            {paused ? '▶ RESUME' : '⏸ PAUSE'}
          </button>
          <button
            onClick={() => { setLines([]); idxRef.current = 0 }}
            style={{
              padding: '2px 7px', borderRadius: 2,
              border: '1px solid rgba(62,84,106,0.4)',
              background: 'transparent',
              color: 'var(--text-dim)',
              fontSize: 9, fontFamily: 'var(--mono)', cursor: 'pointer',
            }}
          >
            CLR
          </button>
        </div>
      </div>

      {/* ─ Log output ─ */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '6px 12px',
          display: 'flex', flexDirection: 'column', gap: 1,
        }}
      >
        {visible.length === 0 && (
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)',
            paddingTop: 8,
          }}>
            Awaiting telemetry…
          </div>
        )}
        {visible.map(line => (
          <div key={line.id} className="cmd-line" style={{ alignItems: 'baseline' }}>
            <span className="cmd-ts">{line.ts}</span>
            <span className="cmd-src">[{line.src}]</span>
            <span className="cmd-seq">#{line.seq}</span>
            <span className={`cmd-data ${line.sev === 'ok' ? '' : line.sev}`}>
              {line.data}
            </span>
          </div>
        ))}

        {/* Blinking cursor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>$</span>
          <span className="cmd-cursor" />
        </div>
      </div>
    </div>
  )
}
