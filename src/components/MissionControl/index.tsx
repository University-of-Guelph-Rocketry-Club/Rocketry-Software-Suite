import { useMissionStore } from '../../store/missionStore'
import { PreFlightChecklist } from './PreFlightChecklist'
import { InFlightDashboard } from './InFlightDashboard'

export function MissionControl() {
  const phase = useMissionStore(s => s.phase)

  switch (phase) {
    case 'pre-flight':
      return <PreFlightChecklist />
    case 'in-flight':
      return <InFlightDashboard />
    case 'recovery':
      return <RecoveryScreen />
    default:
      return null
  }
}

function RecoveryScreen() {
  const { setPhase } = useMissionStore.getState()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 20,
    }}>
      <div style={{ fontSize: 64 }}>🪂</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#ffaa00' }}>RECOVERY MODE</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 400, textAlign: 'center' }}>
        Mission is complete. Use the Live Map to track the rocket's GPS
        position for recovery operations.
      </div>
      <button
        onClick={() => setPhase('pre-flight')}
        style={{
          padding: '8px 24px', borderRadius: 6, fontSize: 13,
          background: 'var(--surface-raised)', border: '1px solid var(--border)',
          color: 'var(--text)', cursor: 'pointer',
        }}
      >
        Start New Mission
      </button>
    </div>
  )
}
