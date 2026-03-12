import { useTelemetryStore } from '../../store/telemetryStore'

const G_MAX = 15  // gauge full-scale in g
const R = 52      // arc radius px
const CX = 70     // centre x
const CY = 74     // centre y

/** Polar arc path helper — returns SVG arc for a given angle span */
function polarArc(
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number,
): string {
  const s = (startDeg - 90) * (Math.PI / 180)
  const e = (endDeg   - 90) * (Math.PI / 180)
  const x1 = cx + r * Math.cos(s)
  const y1 = cy + r * Math.sin(s)
  const x2 = cx + r * Math.cos(e)
  const y2 = cy + r * Math.sin(e)
  const large = (endDeg - startDeg) > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

/** Colour for a given g-force value */
function gColor(g: number): string {
  if (g >= 8)  return '#ff0055'   // Magenta - critical
  if (g >= 3)  return '#ffb800'   // Amber   - warning
  return '#a8ff3e'                 // Lime    - nominal
}

interface GForceGaugeProps {
  sourceId?: string
  size?: number
}

export function GForceGauge({ sourceId, size = 140 }: GForceGaugeProps) {
  const schema  = useTelemetryStore(s => s.schema)
  const sid     = sourceId ?? schema.sources[0]?.id ?? 'rocket'
  const latest  = useTelemetryStore(s => s.sources[sid]?.latest)

  const ax = (latest?.accelX as number) ?? 0
  const ay = (latest?.accelY as number) ?? 0
  const az = (latest?.accelZ as number) ?? 9.81

  const gRaw  = Math.sqrt(ax ** 2 + ay ** 2 + az ** 2) / 9.80665
  const g     = Math.min(gRaw, G_MAX)
  const color = gColor(gRaw)

  // Gauge spans 220° (−110° to +110° from top)
  const SPAN_DEG   = 220
  const START_DEG  = 270 - SPAN_DEG / 2   // 160°
  const END_DEG    = 270 + SPAN_DEG / 2   // 380° = 20°
  const needleDeg  = START_DEG + (g / G_MAX) * SPAN_DEG

  // Tick marks
  const ticks = [0, 3, 6, 9, 12, 15]

  const scale = size / 140

  return (
    <div
      className="gforce-gauge"
      style={{ width: size, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      <svg
        width={140 * scale}
        height={105 * scale}
        viewBox="0 0 140 105"
        style={{ overflow: 'visible' }}
      >
        {/* Background track */}
        <path
          d={polarArc(CX, CY, R, START_DEG, END_DEG)}
          stroke="rgba(56,189,248,0.10)"
          strokeWidth={9}
          fill="none"
          strokeLinecap="round"
        />

        {/* Amber zone: 3g → 8g */}
        <path
          d={polarArc(CX, CY, R,
            START_DEG + (3 / G_MAX) * SPAN_DEG,
            START_DEG + (8 / G_MAX) * SPAN_DEG,
          )}
          stroke="rgba(255,184,0,0.22)"
          strokeWidth={9}
          fill="none"
          strokeLinecap="butt"
        />

        {/* Magenta zone: 8g → max */}
        <path
          d={polarArc(CX, CY, R,
            START_DEG + (8 / G_MAX) * SPAN_DEG,
            END_DEG,
          )}
          stroke="rgba(255,0,85,0.18)"
          strokeWidth={9}
          fill="none"
          strokeLinecap="butt"
        />

        {/* Value arc */}
        <path
          d={polarArc(CX, CY, R, START_DEG, needleDeg)}
          stroke={color}
          strokeWidth={9}
          fill="none"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />

        {/* Tick marks */}
        {ticks.map(v => {
          const angleDeg = START_DEG + (v / G_MAX) * SPAN_DEG
          const angleRad = (angleDeg - 90) * (Math.PI / 180)
          const innerR   = R - 7
          const outerR   = R + 3
          const x1 = CX + innerR * Math.cos(angleRad)
          const y1 = CY + innerR * Math.sin(angleRad)
          const x2 = CX + outerR * Math.cos(angleRad)
          const y2 = CY + outerR * Math.sin(angleRad)
          const tx = CX + (R + 13) * Math.cos(angleRad)
          const ty = CY + (R + 13) * Math.sin(angleRad)
          return (
            <g key={v}>
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={v === 0 || v === G_MAX ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)'}
                strokeWidth={1}
              />
              <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
                fill="rgba(255,255,255,0.22)" fontSize={7} fontFamily="var(--mono)"
              >
                {v}
              </text>
            </g>
          )
        })}

        {/* Needle dot */}
        <circle cx={CX} cy={CY} r={4} fill={color}
          style={{ filter: `drop-shadow(0 0 5px ${color})` }}
        />
        <circle cx={CX} cy={CY} r={2} fill="#020408" />
      </svg>

      {/* Digital readout */}
      <div style={{
        fontFamily: 'var(--mono)', fontWeight: 700, lineHeight: 1,
        fontSize: 26 * scale, color, marginTop: -8 * scale,
        textShadow: `0 0 14px ${color}`,
      }}>
        {gRaw.toFixed(2)}
      </div>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 9 * scale, fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--text-muted)', marginTop: 3,
      }}>
        G-FORCE
      </div>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 8 * scale,
        color: color === '#a8ff3e' ? 'var(--lime)' : color === '#ffb800' ? 'var(--amber)' : 'var(--magenta)',
        marginTop: 2, letterSpacing: '0.08em',
      }}>
        {gRaw < 3 ? 'NOMINAL' : gRaw < 8 ? 'HI-G WARN' : 'ABORT ZONE'}
      </div>
    </div>
  )
}
