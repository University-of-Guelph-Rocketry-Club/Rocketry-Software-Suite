import { useState, useEffect, useRef, useCallback } from 'react'
import { useMissionStore } from '../../store/missionStore'

interface TMinusProps {
  /** Override scheduled T0 in epoch ms (defaults to mission launchTime) */
  scheduledT0?: number
}

function pad2(n: number) { return String(Math.floor(n)).padStart(2, '0') }
function pad3(n: number) { return String(Math.floor(n)).padStart(3, '0') }

export function TMinus({ scheduledT0 }: TMinusProps) {
  const launchTime  = useMissionStore(s => s.launchTime)
  const phase       = useMissionStore(s => s.phase)
  const startMission = useMissionStore(s => s.startMission)
  const canLaunch = useMissionStore(s => s.isReadyToLaunch())

  // Editable T0
  const [customT0, setCustomT0]   = useState<number | null>(null)
  const [inputVal, setInputVal]   = useState('')
  const [editing, setEditing]     = useState(false)

  const t0 = scheduledT0 ?? customT0

  // HH:MM:SS.sss live counter via rAF
  const [display, setDisplay] = useState({ negative: true, h: 0, m: 0, s: 0, ms: 0, launched: false })
  const rafRef = useRef<number>(0)

  const tick = useCallback(() => {
    const now   = Date.now()
    let delta: number
    let negative: boolean

    if (phase === 'in-flight' && launchTime) {
      // T+ since liftoff
      delta    = now - launchTime
      negative = false
    } else if (t0) {
      // T- countdown to scheduled T0
      delta    = t0 - now
      negative = delta >= 0
    } else {
      setDisplay({ negative: true, h: 0, m: 0, s: 0, ms: 0, launched: false })
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const abs = Math.abs(delta)
    const h   = Math.floor(abs / 3_600_000)
    const m   = Math.floor((abs % 3_600_000) / 60_000)
    const s   = Math.floor((abs % 60_000) / 1_000)
    const ms  = abs % 1_000

    setDisplay({ negative, h, m, s, ms, launched: delta < 0 && !launchTime })
    rafRef.current = requestAnimationFrame(tick)
  }, [phase, launchTime, t0])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [tick])

  const isInFlight = phase === 'in-flight'
  const prefix     = isInFlight || (!display.negative && display.launched) ? 'T+' : 'T−'

  // Color: lime while holding, amber < 60 s, accent after liftoff
  const clockColor = isInFlight
    ? 'var(--accent)'
    : (display.h === 0 && display.m === 0 && display.s < 60 && !display.negative)
      ? 'var(--amber)'
      : 'var(--lime)'

  const handleSetT0 = () => {
    // parse HH:MM:SS into epoch ms from now
    const parts = inputVal.trim().split(':').map(Number)
    if (parts.length === 3 && parts.every(p => isFinite(p))) {
      const secs = parts[0] * 3600 + parts[1] * 60 + parts[2]
      setCustomT0(Date.now() + secs * 1000)
    } else if (/^\d+$/.test(inputVal.trim())) {
      setCustomT0(Date.now() + parseInt(inputVal.trim()) * 1000)
    }
    setEditing(false)
    setInputVal('')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 6, padding: '12px 8px',
      height: '100%',
    }}>
      {/* Main clock */}
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: '0.04em',
        lineHeight: 1,
        color: clockColor,
        textShadow: `0 0 18px ${clockColor}`,
      }}>
        <span style={{ fontSize: 14, opacity: 0.7, marginRight: 4 }}>{prefix}</span>
        {pad2(display.h)}:{pad2(display.m)}:{pad2(display.s)}
        <span style={{ fontSize: 18, opacity: 0.65 }}>.{pad3(display.ms)}</span>
      </div>

      {/* Sub-label */}
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        {isInFlight ? 'MISSION ELAPSED' : t0 ? 'COUNTDOWN TO T0' : 'AWAITING T0'}
      </div>

      {/* Controls */}
      {!isInFlight && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {editing ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                autoFocus
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSetT0()}
                placeholder="HH:MM:SS or secs"
                style={{
                  background: 'var(--surface-3)', border: '1px solid var(--border-bright)',
                  color: 'var(--text)', borderRadius: 3, padding: '2px 7px',
                  fontSize: 10, fontFamily: 'var(--mono)', width: 110, outline: 'none',
                }}
              />
              <button onClick={handleSetT0}  style={btnStyle('#a8ff3e')}>SET</button>
              <button onClick={() => setEditing(false)} style={btnStyle('#3e546a')}>✕</button>
            </div>
          ) : (
            <>
              <button onClick={() => setEditing(true)}   style={btnStyle('#3e546a')}>SET T0</button>
              {t0 && (
                <button onClick={() => setCustomT0(null)} style={btnStyle('#3e546a')}>CLR</button>
              )}
              <button
                onClick={startMission}
                disabled={!canLaunch}
                title={canLaunch ? 'Launch mission' : 'Resolve or bypass required checklist items first'}
                style={btnStyle('#a8ff3e', !canLaunch)}
              >
                ▶ LAUNCH
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function btnStyle(color: string, disabled = false): React.CSSProperties {
  return {
    padding: '2px 9px', borderRadius: 3, fontSize: 9,
    border: `1px solid ${color}44`,
    background: disabled ? 'var(--surface-raised)' : `${color}10`,
    color: disabled ? 'var(--text-dim)' : color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '0.08em',
  }
}
