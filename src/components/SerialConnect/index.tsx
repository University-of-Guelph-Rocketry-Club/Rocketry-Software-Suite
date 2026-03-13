import { useRef, useEffect, useState } from 'react'
import { useSerialPort, WEB_SERIAL_SUPPORTED, BAUD_RATES } from '../../hooks/useSerialPort'
import { useTelemetryStore } from '../../store/telemetryStore'
import type { RawLogLine } from '../../hooks/useSerialPort'
import type { HardwareFingerprint } from '../../utils/hardwareFingerprint'

const PRIMARY_SOURCE_ID = 'rocket'

// ── Heartbeat LED ──────────────────────────────────────────────
function HeartbeatLed({ lastPktTs }: { lastPktTs: number | null }) {
  const [flash, setFlash] = useState(false)
  const prevTs = useRef<number | null>(null)

  useEffect(() => {
    if (lastPktTs && lastPktTs !== prevTs.current) {
      prevTs.current = lastPktTs
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 120)
      return () => clearTimeout(t)
    }
  }, [lastPktTs])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: flash ? '#a8ff3e' : 'rgba(168,255,62,0.18)',
        boxShadow: flash ? '0 0 12px #a8ff3e, 0 0 24px rgba(168,255,62,0.4)' : 'none',
        transition: 'background 0.05s, box-shadow 0.05s',
        flexShrink: 0,
      }} />
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600,
        letterSpacing: '0.1em', color: 'var(--text-muted)',
      }}>HB</span>
    </div>
  )
}

// ── RSSI bar meter ─────────────────────────────────────────────
function RssiMeter({ sourceId }: { sourceId: string }) {
  const schema = useTelemetryStore(s => s.schema)
  const sid    = sourceId ?? schema.sources[0]?.id ?? 'rocket'
  const rssi   = useTelemetryStore(s => s.sources[sid]?.latest?.rssi) as number | undefined

  const MIN = -120, MAX = -30
  const pct = rssi !== undefined
    ? Math.max(0, Math.min(100, ((rssi - MIN) / (MAX - MIN)) * 100))
    : 0
  const color = !rssi ? 'var(--text-dim)'
    : rssi > -70 ? '#a8ff3e'
    : rssi > -90 ? '#ffb800'
    : '#ff0055'

  const bars = 12
  const filledBars = Math.round((pct / 100) * bars)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18 }}>
        {Array.from({ length: bars }, (_, i) => {
          const barH = 4 + (i / (bars - 1)) * 14
          const filled = i < filledBars
          return (
            <div key={i} style={{
              width: 4, height: barH,
              background: filled ? color : 'rgba(255,255,255,0.08)',
              borderRadius: 1,
              boxShadow: filled ? `0 0 4px ${color}` : 'none',
              transition: 'background 0.3s',
              alignSelf: 'flex-end',
            }} />
          )
        })}
      </div>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600,
        color, letterSpacing: '0.06em', textAlign: 'center',
      }}>
        {rssi !== undefined ? `${rssi.toFixed(0)} dBm` : 'NO SIG'}
      </div>
    </div>
  )
}

// ── Raw terminal log ───────────────────────────────────────────
function RawTerminal({ lines, onClear }: { lines: RawLogLine[]; onClear: () => void }) {
  const [showHex, setShowHex]   = useState(false)
  const [filter, setFilter]     = useState('')
  const scrollRef               = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const displayed = filter
    ? lines.filter(l => l.text.toLowerCase().includes(filter.toLowerCase()) || l.hex.includes(filter.toUpperCase()))
    : lines

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Terminal toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--lime)', textTransform: 'uppercase' }}>
          RAW STREAM
        </span>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="filter…"
          style={{
            background: 'var(--surface-3)', border: '1px solid var(--border)',
            color: 'var(--text)', borderRadius: 3, padding: '2px 8px',
            fontFamily: 'var(--mono)', fontSize: 10, width: 120, outline: 'none',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showHex} onChange={e => setShowHex(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }} />
          HEX
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }} />
          AUTO
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
          {lines.length} lines
        </span>
        <button onClick={onClear} style={{
          padding: '2px 8px', borderRadius: 3, fontSize: 9, fontFamily: 'var(--mono)',
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer', letterSpacing: '0.06em',
        }}>CLR</button>
      </div>

      {/* Terminal body */}
      <div
        ref={scrollRef}
        className="cmd-terminal"
        style={{ flex: 1, overflowY: 'auto', padding: '6px 12px', fontSize: 10 }}
      >
        {displayed.map(line => {
          const ts = new Date(line.ts)
          const tsStr = `${ts.getHours().toString().padStart(2,'0')}:${ts.getMinutes().toString().padStart(2,'0')}:${ts.getSeconds().toString().padStart(2,'0')}.${ts.getMilliseconds().toString().padStart(3,'0')}`
          return (
            <div key={line.id} className="cmd-line" style={{ marginBottom: 2 }}>
              <span className="cmd-ts" style={{ userSelect: 'none', flexShrink: 0 }}>{tsStr}</span>
              <span style={{
                color: line.parsed ? 'var(--lime)' : 'var(--text-muted)',
                flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 9,
              }}>
                {line.parsed ? '●' : '○'}
              </span>
              <span className="cmd-data" style={{
                color: line.parsed ? 'var(--lime)' : 'var(--text-muted)',
                wordBreak: 'break-all',
              }}>
                {showHex ? line.hex : line.text}
              </span>
            </div>
          )
        })}
        {lines.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 10, padding: '8px 0' }}>
            — awaiting data —<span className="cmd-cursor" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stat row for connection panel ──────────────────────────────
function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: color ?? 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}

function HardwareBadge({ fingerprint }: { fingerprint: HardwareFingerprint | null }) {
  if (!fingerprint) return null
  const color = fingerprint.confidence === 'high'
    ? 'var(--lime)'
    : fingerprint.confidence === 'medium'
      ? 'var(--amber)'
      : 'var(--magenta)'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: '4px 8px',
      borderRadius: 4,
      border: `1px solid ${color}66`,
      background: `${color}12`,
    }} title={fingerprint.reason}>
      <span style={{
        fontFamily: 'var(--mono)',
        fontSize: 9,
        fontWeight: 700,
        color,
        letterSpacing: '0.08em',
      }}>
        HW: {fingerprint.label}
      </span>
      <span style={{
        fontFamily: 'var(--mono)',
        fontSize: 8,
        color: 'var(--text-muted)',
      }}>
        confidence: {fingerprint.confidence.toUpperCase()}
      </span>
    </div>
  )
}

// ── Live telemetry summary cards ───────────────────────────────
function LiveSummary({ sourceId }: { sourceId: string }) {
  const latest = useTelemetryStore(s => s.sources[sourceId]?.latest)
  const diag   = useTelemetryStore(s => s.sources[sourceId]?.diagnostics)

  const fields = [
    { key: 'ALT',   value: latest?.altitude   != null ? `${(latest.altitude as number).toFixed(1)} m`   : '—', color: 'var(--ml)' },
    { key: 'VEL',   value: latest?.velocityZ  != null ? `${(latest.velocityZ as number).toFixed(1)} m/s` : '—', color: 'var(--accent)' },
    { key: 'PITCH', value: latest?.pitch      != null ? `${(latest.pitch as number).toFixed(1)}°`        : '—', color: 'var(--lime)' },
    { key: 'BATT',  value: latest?.batteryVoltage != null ? `${(latest.batteryVoltage as number).toFixed(2)} V` : '—',
      color: (latest?.batteryVoltage as number) < 3.3 ? 'var(--magenta)' : (latest?.batteryVoltage as number) < 3.6 ? 'var(--amber)' : 'var(--lime)' },
    { key: 'TEMP',  value: latest?.temperature != null ? `${(latest.temperature as number).toFixed(1)} °C` : '—', color: 'var(--text)' },
    { key: 'STATE', value: (latest?.state as string | undefined) ?? '—', color: 'var(--accent)' },
    { key: 'PKT/S', value: diag?.packetsPerSecond != null ? diag.packetsPerSecond.toFixed(1) : '—', color: 'var(--text-muted)' },
    { key: 'LOSS',  value: diag?.packetLossEst != null ? `${(diag.packetLossEst * 100).toFixed(1)}%` : '—',
      color: (diag?.packetLossEst ?? 0) > 0.05 ? 'var(--amber)' : 'var(--lime)' },
  ]

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
      padding: '10px 14px',
    }}>
      {fields.map(f => (
        <div key={f.key} style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 5, padding: '7px 10px',
        }}>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 3 }}>
            {f.key}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: f.color, lineHeight: 1 }}>
            {f.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────
export function SerialConnect() {
  const {
    status, baudRate, setBaudRate, portInfo,
    rawLog, packetCount, lastPktTs,
    hardwareFingerprint,
    errorMsg, connect, disconnect, clearLog,
  } = useSerialPort(PRIMARY_SOURCE_ID)

  const connected   = status === 'connected'
  const connecting  = status === 'connecting'

  const statusColor = connected ? 'var(--lime)'
    : status === 'error'    ? 'var(--magenta)'
    : connecting            ? 'var(--amber)'
    : 'var(--text-dim)'

  const statusLabel = connected ? 'CONNECTED'
    : status === 'error' ? 'ERROR'
    : connecting         ? 'CONNECTING…'
    : 'DISCONNECTED'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Top control strip ──────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>

        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: statusColor,
            boxShadow: connected ? `0 0 8px ${statusColor}` : 'none',
          }} />
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
            color: statusColor, letterSpacing: '0.1em',
          }}>
            {statusLabel}
          </span>
          {portInfo && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>
              [{portInfo}]
            </span>
          )}
        </div>

        {/* Baud rate */}
        {!connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>BAUD</span>
            <select
              value={baudRate}
              onChange={e => setBaudRate(Number(e.target.value))}
              style={{
                background: 'var(--surface-3)', border: '1px solid var(--border)',
                color: 'var(--text)', borderRadius: 4, padding: '3px 8px',
                fontFamily: 'var(--mono)', fontSize: 11, outline: 'none',
              }}
            >
              {BAUD_RATES.map(b => <option key={b} value={b}>{b.toLocaleString()}</option>)}
            </select>
          </div>
        )}

        {/* Heartbeat + RSSI */}
        {connected && (
          <>
            <HeartbeatLed lastPktTs={lastPktTs} />
            <RssiMeter sourceId={PRIMARY_SOURCE_ID} />
            <HardwareBadge fingerprint={hardwareFingerprint} />
          </>
        )}

        {/* Packet counter */}
        {connected && (
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
            display: 'flex', gap: 4,
          }}>
            <span style={{ color: 'var(--text-dim)' }}>PKTS</span>
            <span style={{ color: 'var(--lime)', fontWeight: 600 }}>{packetCount.toLocaleString()}</span>
          </div>
        )}

        {/* Browser support warning */}
        {!WEB_SERIAL_SUPPORTED && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)',
            background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)',
            borderRadius: 3, padding: '2px 8px',
          }}>
            ⚠ Web Serial requires Chrome / Edge 89+
          </span>
        )}

        {/* Error */}
        {errorMsg && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--magenta)',
            background: 'rgba(255,0,85,0.08)', border: '1px solid rgba(255,0,85,0.2)',
            borderRadius: 3, padding: '2px 8px', maxWidth: 300,
          }}>
            {errorMsg}
          </span>
        )}

        {/* Connect / Disconnect */}
        <div style={{ marginLeft: 'auto' }}>
          {connected ? (
            <button onClick={disconnect} style={{
              padding: '5px 18px', borderRadius: 4, fontSize: 10,
              fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '0.1em',
              background: 'rgba(255,0,85,0.12)', border: '1px solid rgba(255,0,85,0.3)',
              color: 'var(--magenta)', cursor: 'pointer',
            }}>
              DISCONNECT
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={connecting || !WEB_SERIAL_SUPPORTED}
              style={{
                padding: '5px 18px', borderRadius: 4, fontSize: 10,
                fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '0.1em',
                background: connecting ? 'var(--surface-3)' : 'rgba(168,255,62,0.12)',
                border: `1px solid ${connecting ? 'var(--border)' : 'rgba(168,255,62,0.3)'}`,
                color: connecting ? 'var(--amber)' : 'var(--lime)',
                cursor: connecting || !WEB_SERIAL_SUPPORTED ? 'not-allowed' : 'pointer',
                opacity: !WEB_SERIAL_SUPPORTED ? 0.4 : 1,
              }}
            >
              {connecting ? 'CONNECTING…' : '⚡ CONNECT TO ROCKET'}
            </button>
          )}
        </div>
      </div>

      {/* ── Live telemetry summary  ─────────────────────────── */}
      {connected && (
        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          <LiveSummary sourceId={PRIMARY_SOURCE_ID} />
        </div>
      )}

      {/* ── Connection guide (disconnected) ─────────────────── */}
      {!connected && (
        <div style={{
          padding: '16px 20px', flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
          }}>
            {[
              { step: '01', label: 'Plug In', desc: 'Connect your flight computer via USB-Serial or FTDI adapter' },
              { step: '02', label: 'Select Baud', desc: 'Match the baud rate to your firmware (default 115200)' },
              { step: '03', label: 'Connect', desc: 'Click CONNECT TO ROCKET and select the COM port in the browser dialog' },
            ].map(s => (
              <div key={s.step} style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '12px 14px',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--accent)', opacity: 0.3, lineHeight: 1 }}>
                  {s.step}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>{s.desc}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 6 }}>
              Accepted format examples
            </div>
            {[
              'alt:215.6,vel:177.1,state:BOOST,batt:3.85,rssi:-72',
              '{"alt":215.6,"vel":177.1,"pitch":12.3,"state":"COAST"}',
              'alt,vel,pitch,yaw,batt  ← header row, then:  215.6,177.1,12.3,-2.1,3.85',
            ].map((ex, i) => (
              <div key={i} style={{
                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--lime)',
                background: 'var(--surface-3)', borderRadius: 3, padding: '4px 10px',
                marginBottom: 4, opacity: 0.85,
              }}>
                {ex}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Raw terminal ────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <RawTerminal lines={rawLog} onClear={clearLog} />
      </div>
    </div>
  )
}
