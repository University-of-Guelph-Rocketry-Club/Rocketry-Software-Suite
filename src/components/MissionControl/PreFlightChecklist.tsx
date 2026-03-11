import { useMissionStore } from '../../store/missionStore'
import { useTelemetryStore } from '../../store/telemetryStore'
import type { ChecklistItem } from '../../types/telemetry'

const CATEGORY_ORDER = ['Navigation', 'Power', 'Sensors', 'Comms', 'Recovery', 'Range', 'Weather', 'Safety', 'Data']

function CategorySection({ category, items }: { category: string; items: ChecklistItem[] }) {
  const { setItemChecked } = useMissionStore.getState()
  const allRequired = items.filter(i => i.required)
  const allChecked = allRequired.every(i => i.checked)

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${allChecked ? 'rgba(68,255,136,0.3)' : 'var(--border)'}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: allChecked ? 'rgba(68,255,136,0.06)' : 'transparent',
      }}>
        <span style={{ fontSize: 16 }}>{allChecked ? '✅' : '📋'}</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{category}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          {items.filter(i => i.checked).length}/{items.length}
        </span>
      </div>

      {items.map(item => (
        <div
          key={item.id}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            opacity: item.checked ? 0.7 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={item.checked}
            onChange={e => setItemChecked(item.id, e.target.checked)}
            style={{ marginTop: 2, accentColor: '#44ff88', cursor: 'pointer', flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 13,
              color: item.checked ? '#44ff88' : 'var(--text)',
              textDecoration: item.checked ? 'line-through' : 'none',
            }}>
              {item.label}
              {item.required && !item.checked && (
                <span style={{ color: '#ff4444', marginLeft: 6, fontSize: 10 }}>REQUIRED</span>
              )}
            </div>
            {item.autoValue && (
              <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2 }}>
                Auto: {item.autoValue}
              </div>
            )}
            {item.passCriteria && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                Criteria: <code style={{ color: 'var(--text-muted)' }}>{item.passCriteria}</code>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function PreFlightChecklist() {
  const checklist = useMissionStore(s => s.checklist)
  const isReady = useMissionStore(s => s.isReadyToLaunch())
  const startMission = useMissionStore(s => s.startMission)
  const schema = useTelemetryStore(s => s.schema)
  const sources = useTelemetryStore(s => s.sources)
  const initChecklist = useMissionStore(s => s.initChecklist)
  const autoUpdate = useMissionStore(s => s.autoUpdateChecklist)

  // Group checklist by category
  const grouped = CATEGORY_ORDER.reduce<Record<string, ChecklistItem[]>>((acc, cat) => {
    const items = checklist.filter(i => i.category === cat)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})

  // Auto-update from latest telemetry
  const mainLatest = sources[schema.sources[0]?.id ?? '']?.latest
  if (mainLatest) {
    const latestRecord: Record<string, number | string | boolean | undefined> = {}
    for (const key of Object.keys(mainLatest)) {
      latestRecord[key] = (mainLatest as Record<string, unknown>)[key] as number | string | boolean | undefined
    }
    autoUpdate(latestRecord)
  }

  const requiredItems = checklist.filter(i => i.required)
  const checkedRequired = requiredItems.filter(i => i.checked)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          🚀 Pre-Flight Checklist
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>Required items: {checkedRequired.length}/{requiredItems.length}</span>
            <span>{isReady ? '✅ Ready to launch' : '⏳ Pending items'}</span>
          </div>
          <div style={{ height: 6, background: 'var(--surface-raised)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${requiredItems.length > 0 ? (checkedRequired.length / requiredItems.length) * 100 : 0}%`,
              background: isReady ? '#44ff88' : 'var(--accent)',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => initChecklist(schema)}
            style={{
              padding: '5px 14px', borderRadius: 4, fontSize: 12,
              background: 'var(--surface-raised)', border: '1px solid var(--border)',
              color: 'var(--text)', cursor: 'pointer',
            }}
          >
            🔄 Reset
          </button>
          <button
            onClick={startMission}
            disabled={!isReady}
            style={{
              padding: '5px 22px', borderRadius: 4, fontSize: 13, fontWeight: 700,
              background: isReady ? '#44ff88' : 'var(--surface-raised)',
              border: `1px solid ${isReady ? '#44ff88' : 'var(--border)'}`,
              color: isReady ? '#000' : 'var(--text-muted)',
              cursor: isReady ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              boxShadow: isReady ? '0 0 12px rgba(68,255,136,0.4)' : 'none',
            }}
          >
            🚀 GO FOR LAUNCH
          </button>
        </div>
      </div>

      {/* Checklist */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(grouped).map(([cat, items]) => (
          <CategorySection key={cat} category={cat} items={items} />
        ))}
      </div>
    </div>
  )
}
