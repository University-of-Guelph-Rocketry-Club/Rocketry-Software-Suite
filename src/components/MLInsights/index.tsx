import { useMemo } from 'react'
import {
  AreaChart, Area, LineChart, Line, RadialBarChart, RadialBar,
  XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts'
import { useMLStore } from '../../store/mlStore'
import type { AnomalyEvent, SignalQuality, SignalTrend } from '../../types/ml'

/* ── Shared helpers ────────────────────────────────────────────── */

function PanelHeader({
  icon, title, badge, badgeClass,
}: { icon: React.ReactNode; title: string; badge?: string; badgeClass?: string }) {
  return (
    <div className="panel-header">
      <span style={{ color: 'var(--ml)', opacity: 0.9 }}>{icon}</span>
      <span className="panel-title">{title}</span>
      {badge && <span className={`badge ${badgeClass ?? 'badge-ml'}`} style={{ marginLeft: 'auto' }}>{badge}</span>}
    </div>
  )
}

function Row({ label, value, color, mono = true }: { label: string; value: string | number; color?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      <span style={{ fontFamily: mono ? 'var(--mono)' : 'inherit', fontSize: 12, fontWeight: 600, color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  )
}

/* ── Anomaly Gauge ─────────────────────────────────────────────── */

function AnomalyGauge({ score }: { score: number }) {
  const pct   = Math.round(score * 100)
  const color = score > 0.7 ? 'var(--red)' : score > 0.4 ? 'var(--yellow)' : 'var(--green)'
  const label = score > 0.7 ? 'CRITICAL' : score > 0.4 ? 'ELEVATED' : score > 0.15 ? 'NORMAL' : 'NOMINAL'
  const data  = [{ name: 'anomaly', value: pct, fill: color }, { name: 'rest', value: 100 - pct, fill: 'var(--surface-3)' }]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ position: 'relative', width: 100, height: 100 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%" cy="50%"
            innerRadius="65%" outerRadius="90%"
            startAngle={220} endAngle={-40}
            data={data}
            barSize={8}
          >
            <RadialBar dataKey="value" cornerRadius={4} isAnimationActive={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{pct}</span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>/ 100</span>
        </div>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color }}>{label}</span>
    </div>
  )
}

/* ── Severity badge ────────────────────────────────────────────── */

const SEV_CLASS: Record<AnomalyEvent['severity'], string> = {
  low:      'badge-accent',
  medium:   'badge-yellow',
  high:     'badge-red',
  critical: 'badge-red',
}

/* ── Anomaly Panel ─────────────────────────────────────────────── */

function AnomalyPanel() {
  const { insights, scoreHistory } = useMLStore()
  const { anomalyScore, recentAnomalies, modelStatus, calibrationProgress } = insights

  const sparkData = useMemo(() =>
    scoreHistory.slice(-80).map((s, i) => ({ i, v: s.composite * 100 })),
    [scoreHistory]
  )

  const topFields = useMemo(() => {
    if (!anomalyScore) return []
    return Object.entries(anomalyScore.byField)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [anomalyScore])

  const statusColor =
    modelStatus === 'active'       ? 'var(--green)'  :
    modelStatus === 'calibrating'  ? 'var(--yellow)' :
    modelStatus === 'error'        ? 'var(--red)'    : 'var(--text-muted)'

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        icon={<AnomalyIcon />}
        title="Anomaly Detection"
        badge={modelStatus.toUpperCase()}
        badgeClass={modelStatus === 'active' ? 'badge-green' : modelStatus === 'error' ? 'badge-red' : 'badge-yellow'}
      />

      {/* Calibration progress */}
      {modelStatus !== 'active' && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Model calibrating...</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: statusColor }}>
              {Math.round(calibrationProgress * 100)}%
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-fill ml-shimmer" style={{ width: `${calibrationProgress * 100}%`, background: 'var(--ml)' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 0, flex: 1, minHeight: 0 }}>
        {/* Left: gauge + top sensors */}
        <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, width: 140 }}>
          <AnomalyGauge score={anomalyScore?.composite ?? 0} />
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Top Contributors
            </div>
            {topFields.map(([field, z]) => (
              <div key={field} style={{ marginBottom: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{field}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: z > 3.5 ? 'var(--red)' : z > 2.5 ? 'var(--yellow)' : 'var(--text-muted)' }}>
                    {z.toFixed(1)}σ
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{
                    width: `${Math.min(100, z / 6 * 100)}%`,
                    background: z > 3.5 ? 'var(--red)' : z > 2.5 ? 'var(--yellow)' : 'var(--accent)',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: sparkline + events */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', minWidth: 0 }}>
          {/* Sparkline */}
          <div style={{ height: 60, borderBottom: '1px solid var(--border)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <defs>
                  <linearGradient id="anomGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--ml)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--ml)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone" dataKey="v" stroke="var(--ml)"
                  fill="url(#anomGrad)" strokeWidth={1.5}
                  dot={false} isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Event list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {recentAnomalies.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
                No anomalies detected
              </div>
            ) : recentAnomalies.slice(0, 8).map((ev, i) => (
              <div
                key={`${ev.sensor}-${ev.ts}`}
                className={`alert-row ${ev.severity}`}
                style={{
                  padding: '5px 12px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span className={`badge ${SEV_CLASS[ev.severity]}`} style={{ flexShrink: 0 }}>
                  {ev.severity}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>
                  {ev.sensor}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.zScore.toFixed(1)}σ — val {ev.value.toFixed(2)} (base {ev.baseline.toFixed(2)})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Trajectory Prediction Panel ──────────────────────────────── */

function TrajectoryPanel() {
  const trajectory = useMLStore(s => s.insights.trajectory)

  const chartData = useMemo(() =>
    trajectory?.trajectoryPoints.map(p => ({
      t: Math.round(p.timeOffset),
      alt: Math.round(p.altitude),
      vel: Math.round(p.velocity),
      conf: Math.round(p.confidence * 100),
    })) ?? [],
    [trajectory]
  )

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        icon={<TrajectoryIcon />}
        title="Predictive Trajectory"
        badge={trajectory ? `${Math.round((trajectory.confidence) * 100)}% CONF` : 'WAITING'}
        badgeClass={trajectory && trajectory.confidence > 0.7 ? 'badge-accent' : 'badge-yellow'}
      />

      <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, borderBottom: '1px solid var(--border)' }}>
        <div className="stat-card">
          <div className="stat-label">Predicted Apogee</div>
          <div className="stat-value">
            {trajectory ? Math.round(trajectory.predictedApogee).toLocaleString() : '—'}
            <span className="stat-unit">m</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Time to Apogee</div>
          <div className="stat-value">
            {trajectory ? trajectory.predictedApogeeTime.toFixed(1) : '—'}
            <span className="stat-unit">s</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Landing Radius (1σ)</div>
          <div className="stat-value">
            {trajectory ? Math.round(trajectory.predictedLandingRadius) : '—'}
            <span className="stat-unit">m</span>
          </div>
        </div>
      </div>

      {/* Altitude profile */}
      <div style={{ flex: 1, minHeight: 120, padding: '8px 4px 4px' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 10px 4px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Altitude Profile — ML Prediction
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={chartData} margin={{ top: 2, right: 8, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="t" tick={{ fill: '#4e6278', fontSize: 9 }} tickFormatter={v => `T+${v}s`} tickCount={6} />
            <YAxis tick={{ fill: '#4e6278', fontSize: 9 }} tickCount={5} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border-bright)', borderRadius: 6, fontSize: 11 }}
              formatter={(v: number, name: string) => [
                name === 'alt'  ? `${v} m`  :
                name === 'vel'  ? `${v} m/s` :
                name === 'conf' ? `${v}%`   : v,
                name === 'alt' ? 'Altitude' : name === 'vel' ? 'Velocity' : 'Confidence',
              ]}
            />
            <Area type="monotone" dataKey="alt" stroke="var(--accent)" fill="url(#altGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="vel" stroke="var(--yellow)" strokeWidth={1.5} dot={false} isAnimationActive={false} strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {trajectory && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 16, fontSize: 11 }}>
          <span style={{ color: 'var(--text-muted)' }}>
            Landing: <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
              {trajectory.predictedLandingLat.toFixed(5)}, {trajectory.predictedLandingLng.toFixed(5)}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

/* ── Digital Twin Panel ────────────────────────────────────────── */

function DigitalTwinPanel() {
  const twin = useMLStore(s => s.insights.digitalTwin)

  const rows = useMemo(() => {
    if (!twin) return []
    return Object.entries(twin.fieldErrors)
      .sort((a, b) => b[1].errorPct - a[1].errorPct)
      .slice(0, 8)
  }, [twin])

  const errPct = twin ? Math.round(twin.stateError * 100) : 0
  const errColor = errPct > 50 ? 'var(--red)' : errPct > 25 ? 'var(--yellow)' : 'var(--green)'

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        icon={<TwinIcon />}
        title="Digital Twin"
        badge={twin?.divergenceFlag ? 'DIVERGED' : twin ? 'IN SYNC' : 'CALIBRATING'}
        badgeClass={twin?.divergenceFlag ? 'badge-red' : twin ? 'badge-green' : 'badge-yellow'}
      />

      {/* State error gauge */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>State Error</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: errColor }}>
              {errPct}%
            </span>
          </div>
          <div className="progress-track" style={{ height: 6 }}>
            <div className="progress-fill" style={{ width: `${errPct}%`, background: errColor }} />
          </div>
          {twin?.divergenceSource && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
              Primary divergence: <span style={{ color: 'var(--yellow)', fontFamily: 'var(--mono)' }}>{twin.divergenceSource}</span>
            </div>
          )}
        </div>
        {/* State error ring */}
        <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
          <svg width="52" height="52" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="22" fill="none" stroke="var(--surface-3)" strokeWidth="5" />
            <circle cx="26" cy="26" r="22" fill="none" stroke={errColor} strokeWidth="5"
              strokeDasharray={`${errPct / 100 * 138.2} 138.2`}
              strokeLinecap="round"
              transform="rotate(-90 26 26)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: errColor }}>
            {errPct}
          </div>
        </div>
      </div>

      {/* Field comparison */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 8px' }}>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '6px 0 4px' }}>
          Sensor vs Twin Model
        </div>
        {rows.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: 12 }}>
            Collecting baseline data…
          </div>
        )}
        {rows.map(([field, err]) => (
          <div key={field} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>{field}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{err.actual.toFixed(2)}</span>
                {' '}<span style={{ opacity: 0.5 }}>vs</span>{' '}
                <span style={{ fontFamily: 'var(--mono)' }}>{err.expected.toFixed(2)}</span>
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{
                width: `${err.errorPct * 100}%`,
                background: err.errorPct > 0.5 ? 'var(--red)' : err.errorPct > 0.25 ? 'var(--yellow)' : 'var(--green)',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Signal Quality Panel ──────────────────────────────────────── */

const SIGNAL_COLOR: Record<SignalQuality, string> = {
  excellent: 'var(--green)',
  good:      'var(--accent)',
  fair:      'var(--yellow)',
  poor:      'var(--red)',
  critical:  'var(--red)',
}
const TREND_SYMBOL: Record<SignalTrend, string> = {
  improving: '↑',
  stable:    '→',
  degrading: '↓',
}
const TREND_COLOR: Record<SignalTrend, string> = {
  improving: 'var(--green)',
  stable:    'var(--text-muted)',
  degrading: 'var(--red)',
}

function SignalPanel() {
  const sig = useMLStore(s => s.insights.signalQuality)

  const barCount = 5
  const bars = sig
    ? Math.round(Math.max(1, (sig.currentRssi + 110) / 50 * barCount))
    : 0

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        icon={<SignalIcon />}
        title="Signal Quality (DL Estimate)"
        badge={sig ? sig.quality.toUpperCase() : 'WAITING'}
        badgeClass={!sig ? 'badge-yellow' : sig.quality === 'excellent' || sig.quality === 'good' ? 'badge-green' : sig.quality === 'fair' ? 'badge-yellow' : 'badge-red'}
      />

      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Signal bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 32 }}>
          {Array.from({ length: barCount }, (_, i) => (
            <div key={i} style={{
              width: 8,
              height: `${(i + 1) / barCount * 100}%`,
              borderRadius: 2,
              background: i < bars ? (sig ? SIGNAL_COLOR[sig.quality] : 'var(--text-dim)') : 'var(--surface-3)',
              transition: 'background 0.4s ease',
            }} />
          ))}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700,
              color: sig ? SIGNAL_COLOR[sig.quality] : 'var(--text-dim)',
            }}>
              {sig ? sig.currentRssi.toFixed(0) : '—'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>dBm</span>
            {sig && (
              <span style={{ fontSize: 14, fontWeight: 700, color: TREND_COLOR[sig.trendDirection] }}>
                {TREND_SYMBOL[sig.trendDirection]}
              </span>
            )}
          </div>
          {sig && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              Predicted (30 s): <span style={{ fontFamily: 'var(--mono)', color: SIGNAL_COLOR[sig.quality] }}>
                {sig.predictedRssi.toFixed(0)} dBm
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Dead-zone risk */}
      {sig && (
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dead-Zone Risk</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: sig.deadZoneRisk > 0.6 ? 'var(--red)' : sig.deadZoneRisk > 0.3 ? 'var(--yellow)' : 'var(--green)' }}>
              {Math.round(sig.deadZoneRisk * 100)}%
            </span>
          </div>
          <div className="progress-track" style={{ height: 6 }}>
            <div className="progress-fill" style={{
              width: `${sig.deadZoneRisk * 100}%`,
              background: sig.deadZoneRisk > 0.6 ? 'var(--red)' : sig.deadZoneRisk > 0.3 ? 'var(--yellow)' : 'var(--green)',
            }} />
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {sig.trendDirection === 'degrading' && sig.deadZoneRisk > 0.4
              ? '⚠ Signal degrading — consider adjusting antenna orientation'
              : sig.trendDirection === 'improving'
              ? '✓ Link quality improving'
              : '✓ Link stable'}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── SVG Icons ─────────────────────────────────────────────────── */

function AnomalyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}
function TrajectoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
    </svg>
  )
}
function TwinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="12" r="6"/><circle cx="16" cy="12" r="6"/>
    </svg>
  )
}
function SignalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>
    </svg>
  )
}

/* ── Main ML Insights View ─────────────────────────────────────── */

export function MLInsights() {
  const { insights } = useMLStore()
  const statusColor =
    insights.modelStatus === 'active'      ? 'var(--green)'  :
    insights.modelStatus === 'calibrating' ? 'var(--yellow)' :
    insights.modelStatus === 'error'       ? 'var(--red)'    : 'var(--text-muted)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top banner */}
      <div style={{
        padding: '10px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 10, height: 10 }}>
            <div className="status-dot live" style={{ background: statusColor, color: statusColor, width: '100%', height: '100%' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', color: 'var(--ml)' }}>
            ML INFERENCE ENGINE
          </span>
        </div>
        <span style={{ fontSize: 11, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {insights.modelStatus}
        </span>
        <div style={{ flex: 1, maxWidth: 200 }}>
          <div className="progress-track">
            <div className="progress-fill" style={{
              width: `${insights.calibrationProgress * 100}%`,
              background: 'var(--ml)',
            }} />
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {Math.round(insights.calibrationProgress * 100)}% calibrated
        </span>
        <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          Statistical inference · ONNX-ready
        </div>
      </div>

      {/* 2×2 grid */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 8,
        padding: 8,
        overflow: 'hidden',
        minHeight: 0,
      }}>
        <AnomalyPanel />
        <TrajectoryPanel />
        <DigitalTwinPanel />
        <SignalPanel />
      </div>
    </div>
  )
}
