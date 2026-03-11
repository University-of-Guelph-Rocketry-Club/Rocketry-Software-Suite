import { useState, useRef, useCallback } from 'react'
import { useReplayStore, type ReplaySpeed } from '../../store/replayStore'
import { useTelemetryStore } from '../../store/telemetryStore'
import { useReplayEngine } from '../../hooks/useReplay'
import { format } from 'date-fns'

const SPEEDS: ReplaySpeed[] = [0.25, 0.5, 1, 2, 5, 10]

function NotesList() {
  const notes = useReplayStore(s => s.notes)
  const removeNote = useReplayStore(s => s.removeNote)
  const seekToTime = useReplayStore(s => s.seekToTime)

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontSize: 12 }}>
      {notes.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
          No notes yet. Add annotations while replaying.
        </div>
      ) : (
        notes.map(note => (
          <div key={note.id} style={{
            display: 'flex', gap: 8, padding: '6px 0',
            borderBottom: '1px solid var(--border)',
            alignItems: 'flex-start',
          }}>
            <button
              onClick={() => seekToTime(note.timestamp)}
              style={{
                background: 'var(--accent)', color: '#000', border: 'none',
                borderRadius: 3, padding: '2px 6px', fontSize: 10, cursor: 'pointer',
                flexShrink: 0, fontFamily: 'monospace',
              }}
            >
              {format(new Date(note.timestamp), 'HH:mm:ss')}
            </button>
            <span style={{ flex: 1, color: 'var(--text)' }}>{note.text}</span>
            <button
              onClick={() => removeNote(note.id)}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 0,
              }}
            >×</button>
          </div>
        ))
      )}
    </div>
  )
}

export function ReplayMode() {
  const store = useReplayStore()
  const allSources = useTelemetryStore(s => s.sources)
  const [noteInput, setNoteInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Drive the playback engine
  useReplayEngine()

  const totalPackets = store.session.length
  const currentTs = store.currentPacket?.ts

  const handleFileLoad = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string)
        // Accept { packets: [...] } or plain array
        const packets = Array.isArray(raw) ? raw : (raw.packets ?? [])
        store.loadSession(packets, file.name.replace(/\.json$/, ''))
      } catch {
        alert('Invalid replay file. Expected JSON array or { packets: [...] }')
      }
    }
    reader.readAsText(file)
  }, [store])

  // Export current live session for replay
  const handleExportSession = useCallback(() => {
    const allPackets = Object.values(allSources).flatMap(s => s.packets)
    allPackets.sort((a, b) => a.ts - b.ts)
    const blob = new Blob([JSON.stringify({ packets: allPackets }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [allSources])

  const handleExportNotes = useCallback(() => {
    const text = store.exportNotes()
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `notes-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [store])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Replay Mode</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{store.sessionName}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleFileLoad(e.target.files[0])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '4px 12px', borderRadius: 4, fontSize: 11,
              background: 'var(--surface-raised)', border: '1px solid var(--border)',
              color: 'var(--text)', cursor: 'pointer',
            }}
          >
            📂 Load Session
          </button>
          <button
            onClick={handleExportSession}
            style={{
              padding: '4px 12px', borderRadius: 4, fontSize: 11,
              background: 'var(--surface-raised)', border: '1px solid var(--border)',
              color: 'var(--text)', cursor: 'pointer',
            }}
          >
            💾 Save Live Session
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 16 }}>
        {/* Playback controls */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
        }}>
          {/* Timeline scrubber */}
          <div style={{ marginBottom: 12 }}>
            <input
              type="range"
              min={0}
              max={Math.max(0, totalPackets - 1)}
              value={store.currentIndex}
              onChange={e => store.seekTo(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              <span>{store.session[0] ? format(new Date(store.session[0].ts), 'HH:mm:ss.SSS') : '--:--:--.---'}</span>
              <span style={{ color: 'var(--accent)' }}>
                {currentTs ? format(new Date(currentTs), 'HH:mm:ss.SSS') : '--:--:--.---'}
              </span>
              <span>{store.session[totalPackets - 1] ? format(new Date(store.session[totalPackets - 1].ts), 'HH:mm:ss.SSS') : '--:--:--.---'}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{
            height: 4, background: 'var(--surface-raised)',
            borderRadius: 2, overflow: 'hidden', marginBottom: 14,
          }}>
            <div style={{
              height: '100%', width: `${store.progressPercent}%`,
              background: 'var(--accent)', transition: 'width 0.1s',
            }} />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Step back */}
            <button onClick={store.stepBack} style={btnStyle}>⏮</button>

            {/* Play / Pause */}
            {!store.isReplaying ? (
              <button
                onClick={store.startReplay}
                disabled={totalPackets === 0}
                style={{ ...btnStyle, background: 'var(--accent)', color: '#000', minWidth: 60 }}
              >
                ▶ Play
              </button>
            ) : store.isPaused ? (
              <button
                onClick={store.startReplay}
                style={{ ...btnStyle, background: 'var(--accent)', color: '#000', minWidth: 60 }}
              >
                ▶ Resume
              </button>
            ) : (
              <button
                onClick={store.pauseReplay}
                style={{ ...btnStyle, background: '#ffaa00', color: '#000', minWidth: 60 }}
              >
                ⏸ Pause
              </button>
            )}

            {/* Stop */}
            <button onClick={store.stopReplay} style={btnStyle}>⏹</button>

            {/* Step forward */}
            <button onClick={store.stepForward} style={btnStyle}>⏭</button>

            {/* Speed */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {SPEEDS.map(spd => (
                <button
                  key={spd}
                  onClick={() => store.setSpeed(spd)}
                  style={{
                    ...btnStyle,
                    background: store.speed === spd ? 'var(--accent)' : 'var(--surface-raised)',
                    color: store.speed === spd ? '#000' : 'var(--text-muted)',
                    minWidth: 40,
                  }}
                >
                  {spd}×
                </button>
              ))}
            </div>
          </div>

          {/* Packet count */}
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            Packet {store.currentIndex + 1} / {totalPackets || 0} ·{' '}
            {store.progressPercent.toFixed(1)}% complete
          </div>
        </div>

        {/* Notes section */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minHeight: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              Timestamped Notes ({store.notes.length})
            </span>
            {store.notes.length > 0 && (
              <button onClick={handleExportNotes} style={{ ...btnStyle, fontSize: 10 }}>
                📋 Export
              </button>
            )}
          </div>

          {/* Add note */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && noteInput.trim()) {
                  store.addNote(noteInput.trim())
                  setNoteInput('')
                }
              }}
              placeholder="Add note at current timestamp (Enter to save)…"
              style={{
                flex: 1, background: 'var(--surface-raised)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '5px 10px', color: 'var(--text)', fontSize: 12,
              }}
            />
            <button
              onClick={() => { if (noteInput.trim()) { store.addNote(noteInput.trim()); setNoteInput('') } }}
              style={{ ...btnStyle, background: 'var(--accent)', color: '#000' }}
            >
              + Add
            </button>
          </div>

          <NotesList />
        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 4,
  border: '1px solid var(--border)',
  background: 'var(--surface-raised)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: 12,
}
