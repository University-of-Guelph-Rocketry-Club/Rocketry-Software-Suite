import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Line } from '@react-three/drei'

interface RocketMeshProps {
  pitch: number    // degrees
  yaw: number      // degrees
  roll: number     // degrees
  accelX: number
  accelY: number
  accelZ: number
  vehicleColor?: string
}

function Arrow({
  direction,
  origin,
  length,
  color,
}: {
  direction: THREE.Vector3
  origin: THREE.Vector3
  length: number
  color: string
}) {
  const ndir = direction.clone().normalize()
  const end = origin.clone().addScaledVector(ndir, length)

  // Arrowhead is a small cone at the tip
  const perpAxis = new THREE.Vector3(1, 0, 0)
  if (Math.abs(ndir.dot(perpAxis)) > 0.9) perpAxis.set(0, 1, 0)
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), ndir)

  return (
    <group>
      <Line
        points={[origin.toArray() as [number, number, number], end.toArray() as [number, number, number]]}
        color={color}
        lineWidth={2}
      />
      <mesh position={end.toArray()} quaternion={quat}>
        <coneGeometry args={[0.025, 0.1, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

export function RocketMesh({
  pitch, yaw, roll,
  accelX, accelY, accelZ,
  vehicleColor = '#ccddee',
}: RocketMeshProps) {
  const groupRef = useRef<THREE.Group>(null!)

  useFrame(() => {
    if (!groupRef.current) return
    // r-f-b THREE fiber uses radians; YXZ matches standard aerospace conventions
    groupRef.current.rotation.set(
      THREE.MathUtils.degToRad(pitch),
      THREE.MathUtils.degToRad(yaw),
      THREE.MathUtils.degToRad(roll),
      'YXZ',
    )
  })

  const accelVec = useMemo(() =>
    new THREE.Vector3(accelX * 0.03, accelZ * 0.03, -accelY * 0.03),
    [accelX, accelY, accelZ]
  )

  const finAngles = [0, 90, 180, 270]

  return (
    <group ref={groupRef}>
      {/* Body cylinder */}
      <mesh castShadow>
        <cylinderGeometry args={[0.08, 0.1, 2.0, 32]} />
        <meshStandardMaterial color={vehicleColor} metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Nosecone */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <coneGeometry args={[0.08, 0.5, 32]} />
        <meshStandardMaterial color="#ff4444" metalness={0.4} roughness={0.4} />
      </mesh>

      {/* Motor nozzle */}
      <mesh position={[0, -1.1, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.2, 16]} />
        <meshStandardMaterial color="#333" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Engine glow */}
      <mesh position={[0, -1.25, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#ff6600" />
      </mesh>

      {/* Fins */}
      {finAngles.map((angle, i) => {
        const rad = THREE.MathUtils.degToRad(angle)
        return (
          <mesh
            key={i}
            position={[Math.sin(rad) * 0.14, -0.75, Math.cos(rad) * 0.14]}
            rotation={[0, rad, 0]}
            castShadow
          >
            <boxGeometry args={[0.018, 0.4, 0.25]} />
            <meshStandardMaterial color="#888" metalness={0.5} roughness={0.4} />
          </mesh>
        )
      })}

      {/* Acceleration vector (world-space offset from body center) */}
      {accelVec.length() > 0.05 && (
        <Arrow
          direction={accelVec}
          origin={new THREE.Vector3(0, 0, 0)}
          length={accelVec.length()}
          color="#00ff88"
        />
      )}
    </group>
  )
}
