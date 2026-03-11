import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment, Text } from '@react-three/drei'
import { useTelemetryStore } from '../../store/telemetryStore'
import { RocketMesh } from './RocketMesh'

interface RocketView3DProps {
  sourceId?: string
}

function HudOverlay({
  pitch, yaw, roll, state,
}: { pitch: number; yaw: number; roll: number; state?: string }) {
  return (
    <div style={{
      position: 'absolute', top: 12, left: 12,
      display: 'flex', flexDirection: 'column', gap: 4,
      pointerEvents: 'none',
    }}>
      {[
        { label: 'PITCH', value: pitch.toFixed(1), unit: '°', color: '#ff4444' },
        { label: 'YAW',   value: yaw.toFixed(1),   unit: '°', color: '#ff9944' },
        { label: 'ROLL',  value: roll.toFixed(1),  unit: '°', color: '#ffdd44' },
      ].map(({ label, value, unit, color }) => (
        <div key={label} style={{
          background: 'rgba(0,0,0,0.65)',
          border: `1px solid ${color}44`,
          borderRadius: 4,
          padding: '3px 10px',
          fontFamily: 'monospace',
          fontSize: 12,
          color,
          display: 'flex',
          gap: 8,
        }}>
          <span style={{ opacity: 0.6, width: 38 }}>{label}</span>
          <span style={{ fontWeight: 600 }}>{value}{unit}</span>
        </div>
      ))}
      {state && (
        <div style={{
          background: 'rgba(0,212,255,0.15)',
          border: '1px solid var(--accent)',
          borderRadius: 4,
          padding: '3px 10px',
          fontFamily: 'monospace',
          fontSize: 11,
          color: 'var(--accent)',
          fontWeight: 700,
          letterSpacing: '0.1em',
          marginTop: 4,
        }}>
          STATE: {state}
        </div>
      )}
    </div>
  )
}

export function RocketView3D({ sourceId }: RocketView3DProps) {
  const schema = useTelemetryStore(s => s.schema)
  const effectiveSource = sourceId ?? schema.sources[0]?.id ?? 'rocket'
  const latest = useTelemetryStore(s => s.sources[effectiveSource]?.latest)

  const pitch = latest?.pitch ?? 0
  const yaw   = latest?.yaw   ?? 0
  const roll  = latest?.roll  ?? 0
  const accelX = latest?.accelX ?? 0
  const accelY = latest?.accelY ?? 0
  const accelZ = latest?.accelZ ?? 9.81

  const srcColor = schema.sources.find(s => s.id === effectiveSource)?.color ?? '#ccddee'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        shadows
        camera={{ position: [0, 0, 5], fov: 45 }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight
            castShadow
            position={[5, 8, 5]}
            intensity={1.2}
            shadow-mapSize={[1024, 1024]}
          />
          <pointLight position={[-3, -3, -3]} intensity={0.3} color="#4488ff" />

          {/* Reference grid */}
          <Grid
            position={[0, -1.8, 0]}
            args={[10, 10]}
            cellColor="#1a2a3a"
            sectionColor="#0a1a2a"
            fadeDistance={12}
          />

          {/* Rocket */}
          <RocketMesh
            pitch={pitch}
            yaw={yaw}
            roll={roll}
            accelX={accelX}
            accelY={accelY}
            accelZ={accelZ}
            vehicleColor={srcColor}
          />

          {/* Axis labels */}
          <Text position={[2.5, 0, 0]} fontSize={0.12} color="#ff4444">+X Pitch</Text>
          <Text position={[0, 2.5, 0]} fontSize={0.12} color="#44ff88">+Y Up</Text>

          <OrbitControls enablePan={false} minDistance={1.5} maxDistance={12} />
          <Environment preset="night" />
        </Suspense>
      </Canvas>

      <HudOverlay pitch={pitch} yaw={yaw} roll={roll} state={latest?.state as string | undefined} />

      <div style={{
        position: 'absolute', bottom: 10, right: 12,
        fontSize: 10, color: 'var(--text-muted)',
        pointerEvents: 'none',
      }}>
        Drag to orbit · Scroll to zoom
      </div>
    </div>
  )
}
