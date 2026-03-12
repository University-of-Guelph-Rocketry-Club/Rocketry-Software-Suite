import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment } from '@react-three/drei'
import { useTelemetryStore } from '../../store/telemetryStore'
import { RocketMesh } from './RocketMesh'

interface RocketView3DProps {
  sourceId?: string
}

function HudOverlay({
  pitch, yaw, roll, state,
  quatW, quatX, quatY, quatZ,
  accelX, accelY, accelZ,
}: {
  pitch: number; yaw: number; roll: number; state?: string
  quatW?: number; quatX?: number; quatY?: number; quatZ?: number
  accelX: number; accelY: number; accelZ: number
}) {
  const gforce = Math.sqrt(accelX ** 2 + accelY ** 2 + accelZ ** 2) / 9.80665
  const hasQuat = quatW !== undefined

  // Euler rows — show quaternion components if available, else degrees
  const rows = hasQuat
    ? [
        { label: 'QUAT W', value: (quatW ?? 0).toFixed(3), color: '#a8ff3e' },
        { label: 'QUAT X', value: (quatX ?? 0).toFixed(3), color: '#ff4466' },
        { label: 'QUAT Y', value: (quatY ?? 0).toFixed(3), color: '#ffb800' },
        { label: 'QUAT Z', value: (quatZ ?? 0).toFixed(3), color: '#38bdf8' },
      ]
    : [
        { label: 'PITCH', value: `${pitch.toFixed(1)}°`, color: '#ff4466' },
        { label: 'YAW',   value: `${yaw.toFixed(1)}°`,  color: '#ffb800' },
        { label: 'ROLL',  value: `${roll.toFixed(1)}°`, color: '#38bdf8' },
      ]

  return (
    <>
      {/* Top-left: orientation readout */}
      <div style={{
        position: 'absolute', top: 10, left: 10,
        display: 'flex', flexDirection: 'column', gap: 3,
        pointerEvents: 'none',
      }}>
        {rows.map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'rgba(2,4,8,0.72)',
            border: `1px solid ${color}33`,
            borderRadius: 3,
            padding: '2px 9px',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color,
            display: 'flex', gap: 10,
          }}>
            <span style={{ opacity: 0.55, width: 44, flexShrink: 0, fontSize: 10 }}>{label}</span>
            <span style={{ fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Top-right: G-Force indicator */}
      <div style={{
        position: 'absolute', top: 10, right: 10,
        background: 'rgba(2,4,8,0.72)',
        border: `1px solid ${gforce > 8 ? 'rgba(255,0,85,0.5)' : gforce > 3 ? 'rgba(255,184,0,0.4)' : 'rgba(168,255,62,0.3)'}`,
        borderRadius: 3,
        padding: '4px 10px',
        pointerEvents: 'none',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, lineHeight: 1,
          color: gforce > 8 ? '#ff0055' : gforce > 3 ? '#ffb800' : '#a8ff3e',
        }}>
          {gforce.toFixed(2)}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#3e546a', letterSpacing: '0.1em', marginTop: 2 }}>
          G-FORCE
        </div>
      </div>

      {/* State badge */}
      {state && (
        <div style={{
          position: 'absolute', bottom: 10, left: 10,
          background: 'rgba(56,189,248,0.12)',
          border: '1px solid rgba(56,189,248,0.35)',
          borderRadius: 3,
          padding: '2px 9px',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: '#38bdf8',
          fontWeight: 700,
          letterSpacing: '0.12em',
          pointerEvents: 'none',
        }}>
          ◆ {state}
        </div>
      )}

      {/* Mode badge */}
      <div style={{
        position: 'absolute', bottom: 10, right: 10,
        fontSize: 9, color: '#253545',
        fontFamily: 'var(--mono)', letterSpacing: '0.06em',
        pointerEvents: 'none',
      }}>
        {hasQuat ? 'QUAT MODE' : 'EULER MODE'} · DRAG ORBIT
      </div>
    </>
  )
}

export function RocketView3D({ sourceId }: RocketView3DProps) {
  const schema = useTelemetryStore(s => s.schema)
  const effectiveSource = sourceId ?? schema.sources[0]?.id ?? 'rocket'
  const latest = useTelemetryStore(s => s.sources[effectiveSource]?.latest)

  const pitch  = latest?.pitch as number ?? 0
  const yaw    = latest?.yaw   as number ?? 0
  const roll   = latest?.roll  as number ?? 0
  const quatW  = latest?.quatW as number | undefined
  const quatX  = latest?.quatX as number | undefined
  const quatY  = latest?.quatY as number | undefined
  const quatZ  = latest?.quatZ as number | undefined
  const accelX = latest?.accelX as number ?? 0
  const accelY = latest?.accelY as number ?? 0
  const accelZ = latest?.accelZ as number ?? 9.81

  const srcColor = schema.sources.find(s => s.id === effectiveSource)?.color ?? '#38bdf8'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          {/* Minimal atmospheric lighting — ghost render needs subtle fill */}
          <ambientLight intensity={0.25} />
          <pointLight position={[4, 6, 4]} intensity={0.6} color="#38bdf8" />
          <pointLight position={[-4, -4, -4]} intensity={0.2} color="#a8ff3e" />

          {/* Reference grid — tactical look */}
          <Grid
            position={[0, -2.0, 0]}
            args={[16, 16]}
            cellColor="rgba(56,189,248,0.12)"
            sectionColor="rgba(56,189,248,0.06)"
            cellSize={0.5}
            sectionSize={2}
            fadeDistance={14}
            infiniteGrid
          />

          <RocketMesh
            pitch={pitch} yaw={yaw} roll={roll}
            quatW={quatW} quatX={quatX} quatY={quatY} quatZ={quatZ}
            accelX={accelX} accelY={accelY} accelZ={accelZ}
            vehicleColor={srcColor}
          />

          <OrbitControls enablePan={false} minDistance={1.5} maxDistance={12} />
          <Environment preset="night" />
        </Suspense>
      </Canvas>

      <HudOverlay
        pitch={pitch} yaw={yaw} roll={roll} state={latest?.state as string | undefined}
        quatW={quatW} quatX={quatX} quatY={quatY} quatZ={quatZ}
        accelX={accelX} accelY={accelY} accelZ={accelZ}
      />
    </div>
  )
}
