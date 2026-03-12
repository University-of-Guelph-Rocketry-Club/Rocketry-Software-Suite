import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useRocketDesignStore } from '../../store/rocketDesignStore'

interface RocketMeshProps {
  pitch: number    // degrees (Euler fallback)
  yaw: number      // degrees (Euler fallback)
  roll: number     // degrees (Euler fallback)
  // Quaternion (preferred — from aeronautical gyro sensor)
  quatW?: number
  quatX?: number
  quatY?: number
  quatZ?: number
  accelX: number
  accelY: number
  accelZ: number
  vehicleColor?: string
}

/** Thin arrow built from drei <Line> + cone tip */
function VectorArrow({
  direction,
  origin,
  length,
  color,
  label,
}: {
  direction: THREE.Vector3
  origin: THREE.Vector3
  length: number
  color: string
  label?: string
}) {
  const ndir = direction.clone().normalize()
  const end  = origin.clone().addScaledVector(ndir, length)
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), ndir)

  return (
    <group>
      <Line
        points={[origin.toArray() as [number,number,number], end.toArray() as [number,number,number]]}
        color={color}
        lineWidth={1.6}
        dashed={false}
      />
      <mesh position={end.toArray()} quaternion={quat}>
        <coneGeometry args={[0.022, 0.09, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

/** Ghost body segment — wireframe + transparent fill overlay */
function GhostMesh({
  geometry,
  position = [0, 0, 0],
  rotation,
  wireColor,
}: {
  geometry: React.ReactElement
  position?: [number, number, number]
  rotation?: [number, number, number]
  wireColor: string
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Solid ghost tint */}
      <mesh>
        {geometry}
        <meshBasicMaterial color={wireColor} transparent opacity={0.04} depthWrite={false} />
      </mesh>
      {/* Wireframe overlay */}
      <mesh>
        {geometry}
        <meshBasicMaterial color={wireColor} wireframe transparent opacity={0.55} />
      </mesh>
    </group>
  )
}

export function RocketMesh({
  pitch, yaw, roll,
  quatW, quatX, quatY, quatZ,
  accelX, accelY, accelZ,
  vehicleColor = '#38bdf8',
}: RocketMeshProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const importedDesign = useRocketDesignStore((s) => s.design)

  useFrame(() => {
    if (!groupRef.current) return

    // Prefer quaternion (avoids gimbal lock, matches real sensor output)
    if (
      quatW !== undefined && quatX !== undefined &&
      quatY !== undefined && quatZ !== undefined
    ) {
      groupRef.current.quaternion.set(quatX, quatY, quatZ, quatW)
    } else {
      groupRef.current.rotation.set(
        THREE.MathUtils.degToRad(pitch),
        THREE.MathUtils.degToRad(yaw),
        THREE.MathUtils.degToRad(roll),
        'YXZ',
      )
    }
  })

  const accelMag = Math.sqrt(accelX ** 2 + accelY ** 2 + accelZ ** 2)
  const accelVec = useMemo(() =>
    new THREE.Vector3(accelX * 0.028, accelZ * 0.028, -accelY * 0.028),
    [accelX, accelY, accelZ]
  )

  const bodyScaleY = importedDesign?.totalLengthMm
    ? THREE.MathUtils.clamp(importedDesign.totalLengthMm / 1600, 0.65, 1.9)
    : 1
  const bodyScaleXZ = importedDesign?.maxDiameterMm
    ? THREE.MathUtils.clamp(importedDesign.maxDiameterMm / 100, 0.55, 1.8)
    : 1

  const finAngles = [0, 90, 180, 270]

  // Body-frame axis vectors (unit)
  const axisUp    = new THREE.Vector3(0, 1, 0)   // +Y — thrust axis
  const axisRight = new THREE.Vector3(1, 0, 0)   // +X
  const axisFwd   = new THREE.Vector3(0, 0, -1)  // -Z

  return (
    <group ref={groupRef}>
      <group scale={[bodyScaleXZ, bodyScaleY, bodyScaleXZ]}>
        {/* ── Nosecone — ghost ── */}
        <GhostMesh
          geometry={<coneGeometry args={[0.08, 0.5, 24]} />}
          position={[0, 1.15, 0]}
          wireColor="#ff4466"
        />

        {/* ── Body cylinder — ghost ── */}
        <GhostMesh
          geometry={<cylinderGeometry args={[0.08, 0.1, 2.0, 24]} />}
          wireColor={vehicleColor}
        />

        {/* ── Motor nozzle — ghost ── */}
        <GhostMesh
          geometry={<cylinderGeometry args={[0.06, 0.085, 0.22, 16]} />}
          position={[0, -1.12, 0]}
          wireColor="#6688aa"
        />

        {/* ── Engine glow ring ── */}
        <mesh position={[0, -1.26, 0]}>
          <sphereGeometry args={[0.065, 12, 12]} />
          <meshBasicMaterial color="#ff6600" transparent opacity={0.7} />
        </mesh>

        {/* ── Fins — ghost ── */}
        {finAngles.map((angle, i) => {
          const rad = THREE.MathUtils.degToRad(angle)
          return (
            <GhostMesh
              key={i}
              geometry={<boxGeometry args={[0.016, 0.38, 0.24]} />}
              position={[
                Math.sin(rad) * 0.14,
                -0.76,
                Math.cos(rad) * 0.14,
              ]}
              rotation={[0, rad, 0]}
              wireColor="#446688"
            />
          )
        })}
      </group>

      {/* ── Orientation axis vectors (body-frame) ── */}
      <VectorArrow direction={axisUp}    origin={new THREE.Vector3(0,0,0)} length={1.2} color="#a8ff3e" label="+Y" />
      <VectorArrow direction={axisRight} origin={new THREE.Vector3(0,0,0)} length={0.7} color="#ff4466" label="+X" />
      <VectorArrow direction={axisFwd}   origin={new THREE.Vector3(0,0,0)} length={0.7} color="#38bdf8" label="-Z" />

      {/* ── Acceleration vector (world-frame) ── */}
      {accelMag > 0.3 && (
        <VectorArrow
          direction={accelVec}
          origin={new THREE.Vector3(0, 0.2, 0)}
          length={Math.min(accelMag * 0.028, 1.6)}
          color="#ffb800"
        />
      )}
    </group>
  )
}
