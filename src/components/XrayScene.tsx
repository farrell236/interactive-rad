import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, Line, MeshReflectorMaterial, OrbitControls, RoundedBox, useGLTF } from '@react-three/drei'
import { Pathtracer, usePathtracer } from '@react-three/gpu-pathtracer'
import { Bloom, DepthOfField, EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentRef, RefObject } from 'react'
import * as THREE from 'three'
import { DenoiseMaterial } from 'three-gpu-pathtracer'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { getProjectionGeometry, getScenePatientCenterX, getSceneSidGeometry } from '../simulation/xray'
import type { CameraPreset, ExposurePhase, XraySettings } from '../types'
import type { RtBackend } from '../rendering/rtBackend'

const CAMERA_POSITIONS: Record<CameraPreset, [number, number, number]> = {
  Room: [8.4, 4.7, 9.6],
  Beam: [0.1, 2.35, 9.6],
  Patient: [4.4, 1.4, 4.8],
  // A near side-on inspection angle makes patient-to-receptor contact legible.
  Detector: [4.15, 1.35, 7.2],
}

const RT_MIN_SAMPLES = 8
const RT_MAX_SAMPLES = 256

function setRendererExposure(renderer: THREE.WebGLRenderer, exposure: number) {
  renderer.toneMappingExposure = exposure
}

function CameraRig({ preset, lateral, targetX }: { preset: CameraPreset; lateral: boolean; targetX: number }) {
  const { camera, invalidate } = useThree()
  const transitioning = useRef(true)
  const desired = useMemo(() => lateral && preset === 'Patient'
    ? new THREE.Vector3(5.55, 1.75, 6.05)
    : new THREE.Vector3(...CAMERA_POSITIONS[preset]), [lateral, preset])

  useEffect(() => { transitioning.current = true; invalidate() }, [desired, invalidate, targetX])

  useFrame((_, delta) => {
    if (!transitioning.current) return
    const factor = 1 - Math.exp(-delta * 4)
    camera.position.lerp(desired, factor)
    const targetY = preset === 'Room' ? 2.7 : lateral && preset === 'Patient' ? 0.84 : 0.62
    camera.lookAt(targetX, targetY, 0)
    if (camera.position.distanceTo(desired) < 0.025) transitioning.current = false
    else invalidate()
  })

  return null
}

function RendererTuning({ rayTracing }: { rayTracing: boolean }) {
  const { gl, invalidate } = useThree()
  useEffect(() => {
    setRendererExposure(gl, rayTracing ? 1.32 : 0.94)
    invalidate()
  }, [gl, invalidate, rayTracing])
  return null
}

function WallMonitor({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[1.55, 1.02, 0.12]} radius={0.09} castShadow>
        <meshStandardMaterial color="#172936" metalness={0.42} roughness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0, 0.066]}>
        <planeGeometry args={[1.34, 0.78]} />
        <meshStandardMaterial color="#0c3240" emissive="#45cbe7" emissiveIntensity={0.55} roughness={0.35} />
      </mesh>
      <Line points={[[-0.51, 0.2, 0.075], [-0.28, 0.12, 0.075], [-0.1, 0.28, 0.075], [0.12, -0.11, 0.075], [0.3, 0.02, 0.075], [0.54, -0.18, 0.075]]} color="#9feeff" lineWidth={1.2} />
      <mesh position={[0, -0.62, -0.02]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 0.38, 12]} />
        <meshStandardMaterial color="#334d5d" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  )
}

function DetailedRoomFixtures() {
  const ceilingTiles = useMemo(() => [-6.5, -4.5, -2.5, -0.5, 1.5, 3.5, 5.5, 7.5].flatMap((x) =>
    [-4.25, -2.25, -0.25, 1.75, 3.75].map((z) => [x, z] as const)), [])
  const outletPositions = [-1.8, -1.3, -0.8, -0.3, 0.3, 0.8, 1.3, 1.8]
  const ventSlats = [-0.55, -0.4, -0.25, -0.1, 0.05, 0.2, 0.35, 0.5]

  return (
    <group>
      {ceilingTiles.map(([x, z]) => (
        <RoundedBox key={`ceiling-${x}-${z}`} args={[1.86, 0.045, 1.84]} radius={0.025} position={[x, 6.075, z]} receiveShadow>
          <meshStandardMaterial color="#c7d1d0" roughness={0.9} />
        </RoundedBox>
      ))}

      <group position={[0.85, 2.72, -5.2]}>
        <RoundedBox args={[4.75, 0.58, 0.18]} radius={0.07}>
          <meshStandardMaterial color="#dce4e3" roughness={0.5} />
        </RoundedBox>
        {outletPositions.map((x, index) => (
          <group key={x} position={[x, 0, 0.115]}>
            <RoundedBox args={[0.34, 0.36, 0.055]} radius={0.035}>
              <meshStandardMaterial color="#eef3f1" roughness={0.42} />
            </RoundedBox>
            {index < 5 ? [-0.085, 0.085].map((socketX) => (
              <mesh key={socketX} position={[socketX, 0, 0.038]}>
                <circleGeometry args={[0.045, 18]} />
                <meshStandardMaterial color="#50646a" roughness={0.48} />
              </mesh>
            )) : (
              <mesh position={[0, 0, 0.038]}>
                <circleGeometry args={[0.085, 24]} />
                <meshStandardMaterial color={index % 2 ? '#7fc7d8' : '#70c59b'} emissive={index % 2 ? '#2e7180' : '#27674b'} emissiveIntensity={0.25} roughness={0.38} />
              </mesh>
            )}
          </group>
        ))}
      </group>

      <group position={[2.55, 4.45, -5.205]}>
        <RoundedBox args={[1.45, 0.92, 0.14]} radius={0.06}>
          <meshStandardMaterial color="#c3cece" metalness={0.12} roughness={0.5} />
        </RoundedBox>
        <mesh position={[0, 0, 0.081]}>
          <planeGeometry args={[1.18, 0.67]} />
          <meshStandardMaterial color="#687b80" roughness={0.72} />
        </mesh>
        {ventSlats.map((y) => (
          <mesh key={y} position={[0, y * 0.58, 0.092]}>
            <boxGeometry args={[1.08, 0.035, 0.035]} />
            <meshStandardMaterial color="#aebcbd" metalness={0.22} roughness={0.45} />
          </mesh>
        ))}
      </group>

      <group position={[-6.5, -1.03, 3.45]}>
        <RoundedBox args={[1.45, 1.7, 0.78]} radius={0.11} castShadow>
          <meshStandardMaterial color="#d6e0df" roughness={0.54} />
        </RoundedBox>
        {[-0.48, 0, 0.48].map((y) => (
          <group key={y} position={[0, y, 0.41]}>
            <RoundedBox args={[1.23, 0.37, 0.055]} radius={0.035} castShadow>
              <meshStandardMaterial color="#b9c9ca" roughness={0.58} />
            </RoundedBox>
            <mesh position={[0.38, 0, 0.045]}>
              <boxGeometry args={[0.3, 0.035, 0.035]} />
              <meshStandardMaterial color="#4e6870" metalness={0.68} roughness={0.26} />
            </mesh>
          </group>
        ))}
        <RoundedBox args={[1.55, 0.1, 0.88]} radius={0.035} position={[0, 0.9, 0]} castShadow>
          <meshPhysicalMaterial color="#edf3f1" metalness={0.08} roughness={0.24} clearcoat={0.5} />
        </RoundedBox>
        {[-0.52, 0.52].flatMap((x) => [-0.27, 0.27].map((z) => (
          <group key={`${x}-${z}`} position={[x, -1.02, z]}>
            <mesh castShadow><cylinderGeometry args={[0.035, 0.035, 0.28, 12]} /><meshStandardMaterial color="#61777e" metalness={0.58} roughness={0.34} /></mesh>
            <mesh position={[0, -0.17, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.09, 0.035, 8, 18]} /><meshStandardMaterial color="#26373d" roughness={0.72} /></mesh>
          </group>
        )))}
        <mesh position={[-0.78, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.34, 0.035, 10, 32, Math.PI]} />
          <meshStandardMaterial color="#60777e" metalness={0.55} roughness={0.33} />
        </mesh>
      </group>

      <group position={[6.2, -1.58, 0.8]}>
        <mesh position={[0, 0.58, 0]} castShadow><cylinderGeometry args={[0.32, 0.28, 0.15, 32]} /><meshPhysicalMaterial color="#6d8e96" roughness={0.3} clearcoat={0.35} /></mesh>
        <mesh position={[0, 0.1, 0]} castShadow><cylinderGeometry args={[0.055, 0.07, 0.88, 18]} /><meshStandardMaterial color="#80969b" metalness={0.74} roughness={0.24} /></mesh>
        {[0, 1, 2, 3, 4].map((index) => {
          const angle = index * Math.PI * 0.4
          return <group key={index} rotation={[0, angle, 0]}><mesh position={[0.34, -0.33, 0]} castShadow><boxGeometry args={[0.65, 0.055, 0.07]} /><meshStandardMaterial color="#5e747a" metalness={0.62} roughness={0.32} /></mesh><mesh position={[0.68, -0.38, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.07, 0.028, 8, 16]} /><meshStandardMaterial color="#2b3a3e" roughness={0.7} /></mesh></group>
        })}
      </group>

      <group position={[-7.53, 1.65, 2.2]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 1.05, -0.03]} castShadow><boxGeometry args={[1.5, 0.08, 0.08]} /><meshStandardMaterial color="#647b82" metalness={0.56} roughness={0.35} /></mesh>
        {[-0.48, 0, 0.48].map((x, index) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 1, 0]} castShadow><cylinderGeometry args={[0.035, 0.035, 0.24, 12]} /><meshStandardMaterial color="#819297" metalness={0.6} roughness={0.32} /></mesh>
            <RoundedBox args={[0.66, 1.62, 0.08]} radius={0.16} position={[0, 0.14, 0]} castShadow>
              <meshStandardMaterial color={index === 1 ? '#31576a' : '#486f79'} roughness={0.78} />
            </RoundedBox>
            <mesh position={[0, 0.85, 0.02]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.16, 0.025, 8, 20, Math.PI]} /><meshStandardMaterial color="#a8b5b7" metalness={0.48} roughness={0.38} /></mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

function HospitalRoom({ highQuality, rayTracing }: { highQuality: boolean; rayTracing: boolean }) {
  const cabinets = [-1.65, -0.55, 0.55, 1.65]
  const ceilingLights = [-4.2, 0, 4.2]
  const roomLeft = -7.7
  const roomRight = 9.5
  const roomBack = -5.35
  const roomFront = 7.1
  const roomWidth = roomRight - roomLeft
  const roomDepth = roomFront - roomBack
  const roomCenterX = (roomLeft + roomRight) / 2
  const roomCenterZ = (roomBack + roomFront) / 2

  return (
    <group>
      <mesh position={[roomCenterX, -2.09, roomCenterZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[roomWidth, roomDepth]} />
        {rayTracing ? (
          <meshPhysicalMaterial color="#62777d" emissive="#344a50" emissiveIntensity={0.13} roughness={0.5} metalness={0.12} clearcoat={0.28} clearcoatRoughness={0.5} />
        ) : (
          <MeshReflectorMaterial
            resolution={highQuality ? 1024 : 384}
            blur={highQuality ? [360, 110] : [220, 72]}
            mixBlur={1.25}
            mixStrength={6.5}
            mirror={0.22}
            depthScale={0.36}
            minDepthThreshold={0.32}
            maxDepthThreshold={1.45}
            color="#62777d"
            roughness={0.56}
            metalness={0.12}
          />
        )}
      </mesh>
      <gridHelper args={[roomDepth, 14, '#637b82', '#a5b4b7']} scale={[roomWidth / roomDepth, 1, 1]} position={[roomCenterX, -2.075, roomCenterZ]} material-transparent material-opacity={0.34} />

      <mesh position={[roomCenterX, 2.05, roomBack]} receiveShadow>
        <planeGeometry args={[roomWidth, 8.3]} />
        <meshStandardMaterial color="#87999c" roughness={0.82} />
      </mesh>
      <mesh position={[roomLeft, 2.05, roomCenterZ]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[roomDepth, 8.3]} />
        <meshStandardMaterial color="#788f94" roughness={0.86} />
      </mesh>
      <mesh position={[roomRight, 2.05, roomCenterZ]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[roomDepth, 8.3]} />
        <meshStandardMaterial color="#819599" roughness={0.86} />
      </mesh>
      <mesh position={[roomCenterX, 2.05, roomFront]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[roomWidth, 8.3]} />
        <meshStandardMaterial color="#82969a" roughness={0.86} />
      </mesh>
      <mesh position={[roomCenterX, 6.12, roomCenterZ]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[roomWidth, roomDepth]} />
        <meshStandardMaterial color="#a6b3b3" roughness={0.84} />
      </mesh>

      <mesh position={[roomCenterX, -1.82, roomBack + 0.09]} castShadow>
        <boxGeometry args={[roomWidth, 0.36, 0.18]} />
        <meshStandardMaterial color="#69848b" roughness={0.62} />
      </mesh>
      <mesh position={[roomLeft + 0.09, -1.82, roomCenterZ]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <boxGeometry args={[roomDepth, 0.36, 0.18]} />
        <meshStandardMaterial color="#69848b" roughness={0.62} />
      </mesh>
      <mesh position={[roomRight - 0.09, -1.82, roomCenterZ]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <boxGeometry args={[roomDepth, 0.36, 0.18]} />
        <meshStandardMaterial color="#69848b" roughness={0.62} />
      </mesh>
      <mesh position={[roomCenterX, -1.82, roomFront - 0.09]} castShadow>
        <boxGeometry args={[roomWidth, 0.36, 0.18]} />
        <meshStandardMaterial color="#69848b" roughness={0.62} />
      </mesh>

      {ceilingLights.map((x) => (
        <group key={x} position={[x, 5.99, -0.8]}>
          <RoundedBox args={[2.75, 0.08, 1.05]} radius={0.06} receiveShadow>
            <meshStandardMaterial color="#f1f6f4" emissive="#dff7fb" emissiveIntensity={1.25} roughness={0.38} />
          </RoundedBox>
          <pointLight position={[0, -0.28, 0]} intensity={4.2} distance={7.5} decay={2} color="#edfaff" />
        </group>
      ))}

      <DetailedRoomFixtures />

      <group position={[-4.25, 1.28, -5.15]}>
        <RoundedBox args={[4.4, 3.25, 0.2]} radius={0.12} castShadow>
          <meshStandardMaterial color="#526d78" metalness={0.38} roughness={0.38} />
        </RoundedBox>
        <mesh position={[0, 0, 0.12]}>
          <planeGeometry args={[4.05, 2.9]} />
          <meshPhysicalMaterial color="#16303a" roughness={0.15} metalness={0.2} transmission={0.25} transparent opacity={0.82} />
        </mesh>
        <mesh position={[0, -1.9, 0]} castShadow>
          <boxGeometry args={[4.5, 0.22, 0.58]} />
          <meshStandardMaterial color="#718992" roughness={0.54} />
        </mesh>
      </group>

      <group position={[3.35, -0.62, -5.02]}>
        <mesh position={[0, 0.15, 0]} castShadow>
          <boxGeometry args={[4.25, 1.82, 0.58]} />
          <meshStandardMaterial color="#d8e1e1" roughness={0.65} />
        </mesh>
        {cabinets.map((x) => (
          <group key={x} position={[x, 0.15, 0.32]}>
            <mesh castShadow>
              <boxGeometry args={[1, 1.58, 0.04]} />
              <meshStandardMaterial color="#b7c7ca" roughness={0.72} />
            </mesh>
            <mesh position={[0.34, 0, 0.035]}>
              <boxGeometry args={[0.05, 0.42, 0.04]} />
              <meshStandardMaterial color="#4d6872" metalness={0.68} roughness={0.3} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 1.13, 0.07]} castShadow>
          <boxGeometry args={[4.45, 0.16, 0.78]} />
          <meshPhysicalMaterial color="#edf4f3" roughness={0.27} clearcoat={0.7} />
        </mesh>
      </group>

      <WallMonitor position={[4.2, 2.78, -5.02]} />

      <group position={[7.4, 1.62, -5.02]}>
        <RoundedBox args={[1.82, 4.8, 0.22]} radius={0.09} castShadow>
          <meshStandardMaterial color="#839ba2" roughness={0.58} metalness={0.16} />
        </RoundedBox>
        <RoundedBox args={[1.48, 3.7, 0.05]} radius={0.05} position={[0, 0.25, 0.13]}>
          <meshStandardMaterial color="#9eb1b5" roughness={0.65} />
        </RoundedBox>
        <mesh position={[-0.52, 0.05, 0.2]}>
          <boxGeometry args={[0.07, 0.52, 0.06]} />
          <meshStandardMaterial color="#49636d" metalness={0.65} roughness={0.3} />
        </mesh>
        <mesh position={[0.55, 2, 0.19]}>
          <circleGeometry args={[0.12, 18]} />
          <meshStandardMaterial color="#ffb66a" emissive="#ff8b3f" emissiveIntensity={1.1} />
        </mesh>
      </group>

      <group>
        {[-2.4, 2.4].map((z) => (
          <RoundedBox key={z} args={[8.8, 0.2, 0.26]} radius={0.045} position={[-3.25, 5.78, z]} castShadow>
            <meshStandardMaterial color="#778a92" metalness={0.72} roughness={0.28} />
          </RoundedBox>
        ))}
        {[-6.5, -4.5, -2.5, -0.5].map((x) => (
          <mesh key={x} position={[x, 5.88, 0]} castShadow>
            <boxGeometry args={[0.14, 0.1, 5.08]} />
            <meshStandardMaterial color="#9aabad" metalness={0.55} roughness={0.36} />
          </mesh>
        ))}
      </group>

      <group position={[5.6, -1.23, 2.7]}>
        <RoundedBox args={[1.25, 1.42, 0.66]} radius={0.1} castShadow>
          <meshStandardMaterial color="#55707a" metalness={0.28} roughness={0.48} />
        </RoundedBox>
        <mesh position={[0, 0.18, 0.35]}>
          <planeGeometry args={[0.94, 0.63]} />
          <meshStandardMaterial color="#103642" emissive="#55d8e7" emissiveIntensity={0.35} />
        </mesh>
        {[-0.43, 0.43].map((x) => <mesh key={x} position={[x, -0.8, 0.18]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.13, 0.05, 8, 16]} /><meshStandardMaterial color="#253741" roughness={0.72} /></mesh>)}
      </group>
    </group>
  )
}

function TissueMaterial({ color, opacity = 0.68 }: { color: string; opacity?: number }) {
  return <meshPhysicalMaterial visible={false} color={color} roughness={0.38} clearcoat={0.18} clearcoatRoughness={0.46} transmission={0.12} thickness={0.32} ior={1.36} transparent opacity={opacity} depthWrite={false} />
}

function BoneMaterial({ opacity = 0.58 }: { opacity?: number }) {
  return <meshStandardMaterial color="#d3c5b3" roughness={0.58} transparent opacity={opacity} depthWrite={false} />
}

function Limb({ position, rotation = [0, 0, 0], radius, length, color, opacity = 0.68 }: { position: [number, number, number]; rotation?: [number, number, number]; radius: number; length: number; color: string; opacity?: number }) {
  return (
    <group position={position} rotation={rotation} renderOrder={1}>
      <mesh scale={[1, 1, 0.9]} castShadow>
        <capsuleGeometry args={[radius, length, 12, 32]} />
        <TissueMaterial color={color} opacity={opacity} />
      </mesh>
    </group>
  )
}

function Bone({ position, rotation = [0, 0, 0], radius, length, opacity = 0.6 }: { position: [number, number, number]; rotation?: [number, number, number]; radius: number; length: number; opacity?: number }) {
  return (
    <mesh position={position} rotation={rotation} renderOrder={3}>
      <capsuleGeometry args={[radius, length, 10, 24]} />
      <BoneMaterial opacity={opacity} />
    </mesh>
  )
}

function RibCage() {
  const ribs = useMemo(() => Array.from({ length: 10 }, (_, index) => {
    const y = 0.5 - index * 0.115
    const width = 0.45 - index * 0.011
    const depth = 0.3 - index * 0.006
    return [-1, 1].map((side) => new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.025, y, depth),
      new THREE.Vector3(side * width * 0.72, y - 0.016, depth * 0.76),
      new THREE.Vector3(side * width, y, 0),
      new THREE.Vector3(side * width * 0.72, y + 0.022, -depth * 0.72),
      new THREE.Vector3(side * 0.035, y, -depth),
    ], false, 'catmullrom', 0.52))
  }).flat(), [])

  return (
    <group renderOrder={3}>
      <Bone position={[0, -0.01, 0.17]} radius={0.034} length={1.12} opacity={0.64} />
      <Bone position={[0, 0.08, -0.285]} radius={0.022} length={0.72} opacity={0.52} />
      {ribs.map((curve, index) => (
        <mesh key={index} renderOrder={3}>
          <tubeGeometry args={[curve, 48, 0.011, 7, false]} />
          <BoneMaterial opacity={0.48} />
        </mesh>
      ))}
      <Line points={[[0, 0.43, -0.28], [-0.48, 0.4, -0.08]]} color="#d3c5b3" lineWidth={2.2} transparent opacity={0.54} />
      <Line points={[[0, 0.43, -0.28], [0.48, 0.4, -0.08]]} color="#d3c5b3" lineWidth={2.2} transparent opacity={0.54} />
    </group>
  )
}

function PelvisSkeleton() {
  return (
    <group position={[0, -0.15, 0]} renderOrder={3}>
      {[-0.17, 0.17].map((x, index) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0.06, index === 0 ? -0.18 : 0.18, index === 0 ? -0.12 : 0.12]} scale={[1, 1.12, 0.62]}>
          <torusGeometry args={[0.18, 0.034, 10, 38]} />
          <BoneMaterial opacity={0.52} />
        </mesh>
      ))}
      <Bone position={[0, 0.04, 0.11]} radius={0.048} length={0.23} opacity={0.5} />
      {[-0.25, 0.25].map((x) => <mesh key={x} position={[x, -0.18, 0]}><sphereGeometry args={[0.055, 20, 14]} /><BoneMaterial opacity={0.58} /></mesh>)}
    </group>
  )
}

function ImportedPatientSurface() {
  const source = useLoader(OBJLoader, '/models/FinalBaseMesh.obj')
  const material = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#75aac2',
    roughness: 0.34,
    clearcoat: 0.24,
    clearcoatRoughness: 0.42,
    transmission: 0.14,
    thickness: 0.38,
    ior: 1.36,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const patient = useMemo(() => {
    const clone = source.clone(true)
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.material = material
      child.castShadow = true
      child.receiveShadow = true
      child.renderOrder = 1
    })
    return clone
  }, [material, source])

  useEffect(() => () => material.dispose(), [material])

  return <primitive object={patient} position={[0, -1.99, 0]} scale={0.214} />
}

const ARM_AXIS = new THREE.Vector3(1, 0, 0)
const HEART_NODE_NAMES = new Set(['grp1.017', 'grp1.018', 'grp1.019', 'grp1.020', 'grp1.021'])
type OrganSystem = 'respiratory' | 'digestive' | 'renal' | 'heart'

function getOrganSystem(object: THREE.Object3D): OrganSystem {
  let current: THREE.Object3D | null = object
  while (current) {
    if (current.name === 'respiratory' || current.name === 'digestive' || current.name === 'renal') return current.name
    if (HEART_NODE_NAMES.has(current.name)) return 'heart'
    current = current.parent
  }
  return 'digestive'
}

function distanceToSegment(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) {
  const segment = end.clone().sub(start)
  const lengthSquared = segment.lengthSq()
  if (lengthSquared === 0) return point.distanceTo(start)
  const amount = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSquared, 0, 1)
  return point.distanceTo(start.clone().addScaledVector(segment, amount))
}

function removeSmallTriangleIslands(indices: number[], minimumTriangles = 32) {
  const triangleCount = Math.floor(indices.length / 3)
  if (triangleCount < minimumTriangles) return indices

  const parent = new Int32Array(triangleCount)
  const rank = new Uint8Array(triangleCount)
  const firstTriangleByVertex = new Map<number, number>()
  for (let triangle = 0; triangle < triangleCount; triangle += 1) parent[triangle] = triangle

  const find = (value: number) => {
    let root = value
    while (parent[root] !== root) root = parent[root]
    while (parent[value] !== value) {
      const next = parent[value]
      parent[value] = root
      value = next
    }
    return root
  }

  const union = (left: number, right: number) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot === rightRoot) return
    if (rank[leftRoot] < rank[rightRoot]) parent[leftRoot] = rightRoot
    else if (rank[leftRoot] > rank[rightRoot]) parent[rightRoot] = leftRoot
    else {
      parent[rightRoot] = leftRoot
      rank[leftRoot] += 1
    }
  }

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[triangle * 3 + corner]
      const firstTriangle = firstTriangleByVertex.get(vertex)
      if (firstTriangle === undefined) firstTriangleByVertex.set(vertex, triangle)
      else union(triangle, firstTriangle)
    }
  }

  const componentSizes = new Map<number, number>()
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const root = find(triangle)
    componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1)
  }

  const filtered: number[] = []
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if ((componentSizes.get(find(triangle)) ?? 0) < minimumTriangles) continue
    filtered.push(indices[triangle * 3], indices[triangle * 3 + 1], indices[triangle * 3 + 2])
  }
  return filtered
}

function articulateBodyArms(root: THREE.Object3D, angle: number) {
  root.updateMatrixWorld(true)
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry.getAttribute('position')) return
    child.geometry = child.geometry.clone()
    const positions = child.geometry.getAttribute('position') as THREE.BufferAttribute
    const world = child.matrixWorld.clone()
    const local = world.clone().invert()
    const point = new THREE.Vector3()
    const posed = new THREE.Vector3()
    const influenced = new Uint8Array(positions.count)

    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(world)
      const side = point.x < 0 ? -1 : 1
      const shoulder = new THREE.Vector3(side * 0.19, 0.023, 1.41)
      const elbow = new THREE.Vector3(side * 0.215, 0.012, 1.09)
      const wrist = new THREE.Vector3(side * 0.27, -0.035, 0.86)
      const fingertips = new THREE.Vector3(side * 0.31, -0.06, 0.69)
      const armDistance = Math.min(
        distanceToSegment(point, shoulder, elbow),
        distanceToSegment(point, elbow, wrist),
        distanceToSegment(point, wrist, fingertips),
      )
      if (armDistance > 0.105 || Math.abs(point.x) < 0.16) continue
      influenced[index] = 1
      posed.copy(point).sub(shoulder).applyAxisAngle(ARM_AXIS, angle).add(shoulder)
      point.copy(posed).applyMatrix4(local)
      positions.setXYZ(index, point.x, point.y, point.z)
    }
    const sourceIndex = child.geometry.getIndex()
    if (sourceIndex) {
      const cleanIndex: number[] = []
      const aPosition = new THREE.Vector3()
      const bPosition = new THREE.Vector3()
      const cPosition = new THREE.Vector3()
      for (let offset = 0; offset < sourceIndex.count; offset += 3) {
        const a = sourceIndex.getX(offset)
        const b = sourceIndex.getX(offset + 1)
        const c = sourceIndex.getX(offset + 2)
        const influencedCount = influenced[a] + influenced[b] + influenced[c]
        if (influencedCount === 0) cleanIndex.push(a, b, c)
        if (influencedCount === 3) {
          aPosition.fromBufferAttribute(positions, a)
          bPosition.fromBufferAttribute(positions, b)
          cPosition.fromBufferAttribute(positions, c)
          const longestEdge = Math.max(
            aPosition.distanceTo(bPosition),
            bPosition.distanceTo(cPosition),
            cPosition.distanceTo(aPosition),
          )
          if (longestEdge < 0.08) cleanIndex.push(a, b, c)
        }
      }
      child.geometry.setIndex(removeSmallTriangleIslands(cleanIndex))
    }
    positions.needsUpdate = true
    child.geometry.computeVertexNormals()
    child.geometry.computeBoundingBox()
    child.geometry.computeBoundingSphere()
  })
}

function MatchedAnatomy({ armsRaised, detector = false, bodyOpacity, boneOpacity, organOpacity }: { armsRaised: boolean; detector?: boolean; bodyOpacity?: number; boneOpacity?: number; organOpacity?: number }) {
  const bodySource = useGLTF('/models/anatomy-body.glb').scene
  const skeletonSource = useGLTF('/models/anatomy-skeleton.glb').scene
  const organsSource = useGLTF('/models/anatomy-organs.glb').scene
  const bodyMaterial = useMemo(() => detector
    ? new THREE.MeshBasicMaterial({
      color: '#83a9b4',
      transparent: true,
      opacity: bodyOpacity ?? 0.075,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    : new THREE.MeshPhysicalMaterial({
      color: '#6ba4bd',
      roughness: 0.34,
      clearcoat: 0.2,
      clearcoatRoughness: 0.4,
      transmission: 0.16,
      thickness: 0.28,
      ior: 1.36,
      transparent: true,
      opacity: armsRaised ? 0.28 : 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    }), [armsRaised, bodyOpacity, detector])
  const skeletonMaterial = useMemo(() => detector
    ? new THREE.MeshBasicMaterial({
      color: '#dff7fb',
      transparent: true,
      opacity: boneOpacity ?? 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
    : new THREE.MeshStandardMaterial({
      color: '#d8c9b4',
      roughness: 0.56,
      transparent: true,
      opacity: 0.82,
      depthWrite: true,
    }), [boneOpacity, detector])
  const organMaterials = useMemo<Record<OrganSystem, THREE.Material>>(() => {
    if (detector) {
      const makeProjectionMaterial = (opacity: number) => new THREE.MeshBasicMaterial({
        color: '#afcbd1',
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      const baseOpacity = organOpacity ?? 0.065
      return {
        // Air-filled lungs remain the most radiolucent. The other organs stay
        // close together because unenhanced soft tissues attenuate similarly.
        respiratory: makeProjectionMaterial(baseOpacity * 0.48),
        digestive: makeProjectionMaterial(baseOpacity * 0.92),
        renal: makeProjectionMaterial(baseOpacity * 1.04),
        heart: makeProjectionMaterial(baseOpacity * 1.12),
      }
    }
    const makeSceneMaterial = (color: string, opacity: number) => new THREE.MeshPhysicalMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.12,
      roughness: 0.52,
      clearcoat: 0.12,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    return {
      respiratory: makeSceneMaterial('#bb7773', 0.36),
      digestive: makeSceneMaterial('#b7855f', 0.34),
      renal: makeSceneMaterial('#896d9b', 0.48),
      heart: makeSceneMaterial('#b94f5d', 0.56),
    }
  }, [detector, organOpacity])
  const body = useMemo(() => {
    const clone = bodySource.clone(true)
    if (armsRaised) articulateBodyArms(clone, -2.62)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = bodyMaterial
      child.castShadow = !detector
      child.receiveShadow = !detector
      child.renderOrder = 1
    })
    return clone
  }, [armsRaised, bodyMaterial, bodySource, detector])
  const skeleton = useMemo(() => {
    const clone = skeletonSource.clone(true)
    const leftArm: THREE.Mesh[] = []
    const rightArm: THREE.Mesh[] = []
    clone.updateMatrixWorld(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = skeletonMaterial
      child.castShadow = !detector
      child.renderOrder = 3
      const center = new THREE.Box3().setFromObject(child).getCenter(new THREE.Vector3())
      if (Math.abs(center.x) > 0.16 && center.z > 0.68 && center.z < 1.46) {
        if (center.x < 0) leftArm.push(child)
        else rightArm.push(child)
      }
    })

    const articulateArm = (name: string, pivotX: number, parts: THREE.Mesh[]) => {
      const pivot = new THREE.Group()
      pivot.name = name
      pivot.position.set(pivotX, 0.023, 1.41)
      clone.add(pivot)
      clone.updateMatrixWorld(true)
      parts.forEach((part) => pivot.attach(part))
      pivot.rotation.x = armsRaised ? -2.62 : 0
    }
    articulateArm('left-arm-pivot', -0.19, leftArm)
    articulateArm('right-arm-pivot', 0.19, rightArm)
    return clone
  }, [armsRaised, detector, skeletonMaterial, skeletonSource])
  const organs = useMemo(() => {
    const clone = organsSource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = organMaterials[getOrganSystem(child)]
      child.castShadow = !detector
      child.receiveShadow = !detector
      child.renderOrder = 2
    })
    return clone
  }, [detector, organMaterials, organsSource])

  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial])
  useEffect(() => () => skeletonMaterial.dispose(), [skeletonMaterial])
  useEffect(() => () => Object.values(organMaterials).forEach((material) => material.dispose()), [organMaterials])
  useEffect(() => () => {
    if (!armsRaised) return
    body.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose()
    })
  }, [armsRaised, body])

  return (
    <group position={[0, -2.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={2.55}>
      <primitive object={body} />
      <primitive object={organs} />
      {armsRaised && [-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.19, 0.023, 1.41]} scale={[0.055, 0.047, 0.055]} material={bodyMaterial} castShadow={!detector} renderOrder={1}>
          <sphereGeometry args={[1, 32, 24]} />
        </mesh>
      ))}
      <primitive object={skeleton} />
    </group>
  )
}

export function AnatomyPatient({ settings, detector = false, bodyOpacity, boneOpacity, organOpacity }: { settings: XraySettings; detector?: boolean; bodyOpacity?: number; boneOpacity?: number; organOpacity?: number }) {
  const projection = getProjectionGeometry(settings.projection)
  const rotation = projection.patientYawRadians + THREE.MathUtils.degToRad(settings.rotation)
  const armsRaised = settings.projection === 'Lateral'
  return <group position={[0, -0.02, 0]} rotation={[0, rotation, 0]}><Suspense fallback={null}><MatchedAnatomy armsRaised={armsRaised} detector={detector} bodyOpacity={bodyOpacity} boneOpacity={boneOpacity} organOpacity={organOpacity} /></Suspense></group>
}

export function LegacyPatient({ settings }: { settings: XraySettings }) {
  const projection = getProjectionGeometry(settings.projection)
  const rotation = projection.patientYawRadians + THREE.MathUtils.degToRad(settings.rotation)
  const isLateral = settings.projection === 'Lateral'
  const armDepth = settings.projection === 'PA' ? -0.08 : 0
  const torsoProfile = useMemo(() => [
    new THREE.Vector2(0.2, -0.88), new THREE.Vector2(0.38, -0.7), new THREE.Vector2(0.48, -0.34),
    new THREE.Vector2(0.55, 0.08), new THREE.Vector2(0.52, 0.43), new THREE.Vector2(0.43, 0.7),
    new THREE.Vector2(0.25, 0.86), new THREE.Vector2(0.15, 0.9),
  ], [])
  const tissue = '#79a9bd'

  return (
    <group position={[0, -0.02, 0]} rotation={[0, rotation, 0]}>
      <Suspense fallback={null}>
        <ImportedPatientSurface />
      </Suspense>
      <mesh position={[0, 2.03, 0]} scale={[0.94, 1.08, 0.9]} castShadow renderOrder={1}>
        <sphereGeometry args={[0.31, 48, 32]} />
        <TissueMaterial color={tissue} opacity={0.64} />
      </mesh>
      <mesh position={[0, 2.16, 0.015]} scale={[0.82, 0.92, 0.78]} renderOrder={3}>
        <sphereGeometry args={[0.285, 40, 28]} />
        <BoneMaterial opacity={0.38} />
      </mesh>
      <mesh position={[0, 2.045, -0.11]} scale={[0.8, 0.48, 0.72]} rotation={[0, 0, Math.PI]} renderOrder={3}>
        <torusGeometry args={[0.22, 0.025, 8, 32, Math.PI]} />
        <BoneMaterial opacity={0.32} />
      </mesh>
      {[-0.085, 0.085].map((x) => <mesh key={`socket-${x}`} position={[x, 2.2, -0.245]} scale={[1, 0.82, 0.55]} renderOrder={4}><sphereGeometry args={[0.04, 18, 12]} /><meshBasicMaterial color="#263238" transparent opacity={0.3} depthWrite={false} /></mesh>)}
      <mesh position={[0, 2.04, -0.31]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.055, 0.12, 16]} />
        <TissueMaterial color={tissue} opacity={0.66} />
      </mesh>
      {[-0.285, 0.285].map((x) => <mesh key={x} position={[x, 2.04, 0]} scale={[0.45, 1, 0.58]} renderOrder={1}><sphereGeometry args={[0.105, 18, 12]} /><TissueMaterial color={tissue} opacity={0.62} /></mesh>)}
      <mesh position={[0, 1.67, 0]} castShadow renderOrder={1}><capsuleGeometry args={[0.145, 0.05, 10, 24]} /><TissueMaterial color={tissue} opacity={0.66} /></mesh>
      <Bone position={[0, 1.8, 0.06]} radius={0.032} length={0.22} opacity={0.52} />

      <mesh position={[0, 0.78, 0]} scale={[1.07, 1, 0.73]} castShadow renderOrder={1}>
        <latheGeometry args={[torsoProfile, 48]} />
        <meshPhysicalMaterial visible={false} color={tissue} roughness={0.35} transmission={0.16} thickness={0.46} ior={1.36} clearcoat={0.2} transparent opacity={0.58} depthWrite={false} />
      </mesh>
      <mesh position={[-0.5, 1.24, 0]} scale={[0.38, 0.23, 0.43]} castShadow renderOrder={1}><sphereGeometry args={[0.42, 28, 18]} /><TissueMaterial color={tissue} opacity={0.64} /></mesh>
      <mesh position={[0.5, 1.24, 0]} scale={[0.38, 0.23, 0.43]} castShadow renderOrder={1}><sphereGeometry args={[0.42, 28, 18]} /><TissueMaterial color={tissue} opacity={0.64} /></mesh>

      <group position={[0, 0.92, 0]}>
        <mesh position={[-0.2, 0.08, -0.02]} scale={[0.42, 0.86, 0.46]}>
          <sphereGeometry args={[0.53, 28, 20]} />
          <meshStandardMaterial color="#294957" roughness={0.76} transparent opacity={0.5} depthWrite={false} />
        </mesh>
        <mesh position={[0.2, 0.08, -0.02]} scale={[0.42, 0.86, 0.46]}>
          <sphereGeometry args={[0.53, 28, 20]} />
          <meshStandardMaterial color="#294957" roughness={0.76} transparent opacity={0.5} depthWrite={false} />
        </mesh>
        <mesh position={[-0.12, -0.12, -0.02]} scale={[0.32, 0.44, 0.38]} rotation={[0.18, 0, 0.12]}>
          <sphereGeometry args={[0.5, 24, 18]} />
          <meshStandardMaterial color="#9aa9a6" roughness={0.68} transparent opacity={0.52} />
        </mesh>
        <RibCage />
      </group>

      {isLateral ? (
        <>
          <Limb position={[-0.55, 1.6, -0.02]} rotation={[0, 0, -0.12]} radius={0.12} length={0.72} color={tissue} />
          <Limb position={[-0.43, 2.27, -0.02]} rotation={[0, 0, 0.25]} radius={0.1} length={0.62} color={tissue} />
          <Limb position={[0.55, 1.6, 0.02]} rotation={[0, 0, 0.12]} radius={0.12} length={0.72} color={tissue} />
          <Limb position={[0.43, 2.27, 0.02]} rotation={[0, 0, -0.25]} radius={0.1} length={0.62} color={tissue} />
          {[-0.35, 0.35].map((x) => <mesh key={x} position={[x, 2.66, 0]} scale={[0.11, 0.2, 0.08]} castShadow><capsuleGeometry args={[0.12, 0.18, 8, 20]} /><TissueMaterial color={tissue} opacity={0.66} /></mesh>)}
        </>
      ) : (
        <>
          <Limb position={[-0.59, 0.76, armDepth]} rotation={[0, 0, -0.07]} radius={0.125} length={0.62} color={tissue} />
          <Limb position={[-0.64, 0.04, armDepth]} rotation={[0.02, 0, 0.04]} radius={0.105} length={0.62} color={tissue} />
          <Limb position={[0.59, 0.76, armDepth]} rotation={[0, 0, 0.07]} radius={0.125} length={0.62} color={tissue} />
          <Limb position={[0.64, 0.04, armDepth]} rotation={[0.02, 0, -0.04]} radius={0.105} length={0.62} color={tissue} />
          {[-0.65, 0.65].map((x) => <mesh key={x} position={[x, -0.39, armDepth]} scale={[0.11, 0.2, 0.08]} castShadow><capsuleGeometry args={[0.12, 0.18, 8, 20]} /><TissueMaterial color={tissue} opacity={0.66} /></mesh>)}
        </>
      )}

      <Bone position={[-0.82, 1.05, 0]} rotation={[0, 0, -0.62]} radius={0.036} length={0.53} />
      <Bone position={[-1.13, 0.42, 0]} rotation={[0, 0, -0.3]} radius={0.03} length={0.62} />
      <Bone position={[0.82, 1.05, 0]} rotation={[0, 0, 0.62]} radius={0.036} length={0.53} />
      <Bone position={[1.13, 0.42, 0]} rotation={[0, 0, 0.3]} radius={0.03} length={0.62} />

      <mesh position={[0, -0.14, 0]} scale={[1, 0.68, 0.78]} castShadow renderOrder={1}><sphereGeometry args={[0.44, 32, 22]} /><TissueMaterial color={tissue} opacity={0.64} /></mesh>
      <PelvisSkeleton />
      <Limb position={[-0.245, -0.73, 0]} radius={0.17} length={0.67} color={tissue} />
      <Limb position={[0.245, -0.73, 0]} radius={0.17} length={0.67} color={tissue} />
      {[-0.245, 0.245].map((x) => <mesh key={x} position={[x, -1.16, 0]} castShadow renderOrder={1}><sphereGeometry args={[0.18, 28, 20]} /><TissueMaterial color={tissue} opacity={0.68} /></mesh>)}
      <Limb position={[-0.245, -1.49, 0]} radius={0.14} length={0.58} color={tissue} />
      <Limb position={[0.245, -1.49, 0]} radius={0.14} length={0.58} color={tissue} />
      <Bone position={[-0.255, -0.43, 0]} radius={0.052} length={0.68} />
      <Bone position={[0.255, -0.43, 0]} radius={0.052} length={0.68} />
      {[-0.255, 0.255].map((x) => <mesh key={`patella-${x}`} position={[x, -0.86, -0.08]} renderOrder={3}><sphereGeometry args={[0.052, 18, 12]} /><BoneMaterial opacity={0.6} /></mesh>)}
      <Bone position={[-0.255, -1.34, 0]} radius={0.043} length={0.74} />
      <Bone position={[0.255, -1.34, 0]} radius={0.043} length={0.74} />
      {[-0.245, 0.245].map((x) => <group key={x} position={[x, -1.92, -0.13]}>
        <mesh scale={[0.17, 0.11, 0.34]} castShadow renderOrder={1}><sphereGeometry args={[1, 28, 18]} /><TissueMaterial color={tissue} opacity={0.68} /></mesh>
        <mesh position={[0, 0.015, 0.01]} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}><capsuleGeometry args={[0.04, 0.18, 8, 18]} /><BoneMaterial opacity={0.5} /></mesh>
      </group>)}
    </group>
  )
}

function Patient({ settings }: { settings: XraySettings }) {
  return <AnatomyPatient settings={settings} />
}

function SourceAssembly({ phase, sourceX }: { phase: ExposurePhase; sourceX: number }) {
  const pulse = useRef<THREE.Mesh>(null)
  const { invalidate } = useThree()
  const isEmitting = phase === 'emitting'
  const cableCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.02, 4.55, 0.5),
    new THREE.Vector3(0.48, 4.0, 0.73),
    new THREE.Vector3(0.58, 2.85, 0.76),
    new THREE.Vector3(0.36, 1.65, 0.64),
    new THREE.Vector3(0.3, 0.92, 0.4),
  ]), [])

  useFrame(() => {
    if (phase !== 'emitting' || !pulse.current) return
    const wave = 1 + Math.sin(performance.now() * 0.024) * 0.12
    pulse.current.scale.setScalar(wave)
    invalidate()
  })

  return (
    <group position={[sourceX - 0.88, 0.72, 0]}>
      <RoundedBox args={[0.72, 0.24, 5.08]} radius={0.07} position={[-0.44, 4.98, 0]} castShadow>
        <meshStandardMaterial color="#82959c" metalness={0.68} roughness={0.28} />
      </RoundedBox>
      {[-2.38, 2.38].map((z) => (
        <group key={z} position={[-0.44, 5.12, z]}>
          <RoundedBox args={[0.72, 0.2, 0.44]} radius={0.05} castShadow><meshStandardMaterial color="#4b626d" metalness={0.76} roughness={0.24} /></RoundedBox>
          <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.085, 0.085, 0.28, 18]} /><meshStandardMaterial color="#243740" metalness={0.72} roughness={0.34} /></mesh>
        </group>
      ))}
      <RoundedBox args={[1.18, 0.58, 1.08]} radius={0.1} position={[-0.44, 4.66, 0]} castShadow>
        <meshStandardMaterial color="#d8e1e2" metalness={0.28} roughness={0.3} />
      </RoundedBox>
      <RoundedBox args={[0.68, 1.18, 0.7]} radius={0.075} position={[-0.44, 3.82, 0]} castShadow>
        <meshStandardMaterial color="#c7d2d5" metalness={0.38} roughness={0.29} />
      </RoundedBox>
      <RoundedBox args={[0.56, 1.08, 0.59]} radius={0.065} position={[-0.44, 2.82, 0]} castShadow>
        <meshStandardMaterial color="#dce4e5" metalness={0.28} roughness={0.3} />
      </RoundedBox>
      <RoundedBox args={[0.45, 0.98, 0.49]} radius={0.055} position={[-0.44, 1.92, 0]} castShadow>
        <meshStandardMaterial color="#c4d0d3" metalness={0.38} roughness={0.28} />
      </RoundedBox>
      <RoundedBox args={[0.34, 0.72, 0.38]} radius={0.045} position={[-0.44, 1.18, 0]} castShadow>
        <meshStandardMaterial color="#e1e8e8" metalness={0.25} roughness={0.32} />
      </RoundedBox>
      <RoundedBox args={[0.98, 0.16, 0.28]} radius={0.05} position={[0.02, 1.02, 0]} castShadow>
        <meshStandardMaterial color="#6f858d" metalness={0.62} roughness={0.27} />
      </RoundedBox>
      <mesh position={[0.48, 0.83, 0]}><torusGeometry args={[0.24, 0.055, 10, 28]} /><meshStandardMaterial color="#607780" metalness={0.66} roughness={0.25} /></mesh>
      <mesh castShadow>
        <tubeGeometry args={[cableCurve, 40, 0.055, 12, false]} />
        <meshStandardMaterial color="#586b72" metalness={0.38} roughness={0.58} />
      </mesh>
      <mesh position={[0.48, 0.72, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.43, 0.5, 1.05, 32]} /><meshStandardMaterial color="#d5ddde" metalness={0.34} roughness={0.24} /></mesh>
      <RoundedBox args={[0.5, 0.72, 0.72]} radius={0.12} position={[0.48, 0, 0]} castShadow><meshStandardMaterial color="#8199a3" metalness={0.46} roughness={0.24} /></RoundedBox>
      <mesh ref={pulse} position={[0.77, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><cylinderGeometry args={[0.13, 0.23, 0.2, 28]} /><meshStandardMaterial color={isEmitting ? '#e8fcff' : '#2c748a'} emissive="#74ddff" emissiveIntensity={isEmitting ? 8 : 0.7} /></mesh>
      {[{ radius: 0.28, ready: 0.008, active: 0.035 }, { radius: 0.18, ready: 0.018, active: 0.08 }, { radius: 0.095, ready: 0.055, active: 0.22 }].map((glow, index) => (
        <mesh key={glow.radius} position={[0.91 + index * 0.006, 0, 0]} renderOrder={4 + index}>
          <sphereGeometry args={[glow.radius, 28, 18]} />
          <meshBasicMaterial color={index === 2 ? '#e7fbff' : '#79dff8'} transparent opacity={isEmitting ? glow.active : glow.ready} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <pointLight position={[0.95, 0, 0]} intensity={isEmitting ? 6 : 0.35} distance={3.2} decay={2} color="#9beeff" />
      <mesh position={[0.14, 0.31, 0.37]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.22, 0.028, 8, 28, Math.PI]} /><meshStandardMaterial color="#3c5661" metalness={0.7} roughness={0.28} /></mesh>
      <mesh position={[-0.25, 0.26, -0.37]}><circleGeometry args={[0.055, 18]} /><meshStandardMaterial color="#76e6c6" emissive="#76e6c6" emissiveIntensity={1.6} /></mesh>
    </group>
  )
}

function Detector({ x, phase, fieldRatio }: { x: number; phase: ExposurePhase; fieldRatio: number }) {
  const fieldHeight = 3.18 * fieldRatio
  const fieldWidth = 2.34 * fieldRatio
  const isEmitting = phase === 'emitting'
  const footprintLayers = [
    { scale: 1.12, ready: 0.018, active: 0.075, color: '#4fb2cf' },
    { scale: 1.06, ready: 0.028, active: 0.12, color: '#70d9ed' },
    { scale: 1, ready: 0.06, active: 0.25, color: '#b9f5ff' },
    { scale: 0.91, ready: 0.025, active: 0.1, color: '#e1fbff' },
  ]

  return (
    <group position={[x, 0.58, 0]}>
      <RoundedBox args={[0.2, 3.48, 2.62]} radius={0.14} castShadow receiveShadow><meshStandardMaterial color="#334956" metalness={0.43} roughness={0.27} /></RoundedBox>
      <RoundedBox args={[0.03, 3.18, 2.34]} radius={0.08} position={[-0.116, 0, 0]}><meshStandardMaterial color="#182d38" emissive="#367c91" emissiveIntensity={0.15} roughness={0.42} /></RoundedBox>
      {footprintLayers.map((layer, index) => (
        <RoundedBox
          key={layer.scale}
          args={[0.006, Math.min(3.18, fieldHeight * layer.scale), Math.min(2.34, fieldWidth * layer.scale)]}
          radius={Math.min(0.075, fieldWidth * 0.04)}
          smoothness={6}
          position={[-0.135 - index * 0.002, 0, 0]}
          renderOrder={2 + index}
        >
          <meshBasicMaterial color={layer.color} transparent opacity={isEmitting ? layer.active : layer.ready} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </RoundedBox>
      ))}
      <RoundedBox args={[0.13, 0.18, 0.72]} radius={0.05} position={[0.13, 0.95, -1.52]} castShadow><meshStandardMaterial color="#718995" metalness={0.58} roughness={0.28} /></RoundedBox>
      <mesh position={[0, -2.32, 0]} castShadow><cylinderGeometry args={[0.1, 0.14, 1.18, 20]} /><meshStandardMaterial color="#526a75" metalness={0.62} roughness={0.3} /></mesh>
      <mesh position={[0, -2.88, 0]} castShadow><boxGeometry args={[1.35, 0.14, 0.68]} /><meshStandardMaterial color="#3e555f" metalness={0.6} roughness={0.32} /></mesh>
      {[-0.49, 0.49].flatMap((z) => [-0.43, 0.43].map((offset) => <mesh key={`${z}-${offset}`} position={[offset, -3, z]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.105, 0.04, 8, 16]} /><meshStandardMaterial color="#26363d" roughness={0.72} /></mesh>))}
      <mesh position={[0.13, -1.48, 1.08]}><circleGeometry args={[0.045, 16]} /><meshStandardMaterial color="#70e1c1" emissive="#70e1c1" emissiveIntensity={1.5} /></mesh>
    </group>
  )
}

function RectangularBeam({ sourceX, sourceY, targetX, targetY, halfHeight, halfWidth, phase, rayTracing }: { sourceX: number; sourceY: number; targetX: number; targetY: number; halfHeight: number; halfWidth: number; phase: ExposurePhase; rayTracing: boolean }) {
  const geometries = useMemo(() => {
    const apex: [number, number, number] = [sourceX, sourceY, 0]
    const scaledHeight = halfHeight * 1.06
    const scaledWidth = halfWidth * 1.06
    const corners: [number, number, number][] = [
      [targetX, targetY - scaledHeight, -scaledWidth],
      [targetX, targetY + scaledHeight, -scaledWidth],
      [targetX, targetY + scaledHeight, scaledWidth],
      [targetX, targetY - scaledHeight, scaledWidth],
    ]
    const vertices: number[] = []
    corners.forEach((corner, index) => vertices.push(...apex, ...corner, ...corners[(index + 1) % corners.length]))
    const envelope = new THREE.BufferGeometry()
    envelope.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    envelope.computeVertexNormals()

    const makeSheet = (positions: number[]) => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
      geometry.setIndex([0, 1, 2, 0, 2, 3])
      geometry.computeVertexNormals()
      return geometry
    }

    const vertical = makeSheet([
      sourceX, sourceY - 0.012, 0,
      targetX, targetY - halfHeight, 0,
      targetX, targetY + halfHeight, 0,
      sourceX, sourceY + 0.012, 0,
    ])
    const horizontal = makeSheet([
      sourceX, sourceY, -0.012,
      targetX, targetY, -halfWidth,
      targetX, targetY, halfWidth,
      sourceX, sourceY, 0.012,
    ])

    return { envelope, horizontal, vertical }
  }, [halfHeight, halfWidth, sourceX, sourceY, targetX, targetY])

  useEffect(() => () => Object.values(geometries).forEach((geometry) => geometry.dispose()), [geometries])

  const isEmitting = phase === 'emitting'
  const sheetOpacity = isEmitting ? 0.18 : 0.065
  const sheetUniforms = {
    uColor: { value: new THREE.Color(isEmitting ? '#c6f8ff' : '#65cada') },
    uOpacity: { value: sheetOpacity },
  }
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `
  const fragmentShader = `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying vec2 vUv;
    void main() {
      float edgeFade = pow(max(sin(vUv.y * 3.14159265), 0.0), 1.7);
      float sourceFade = smoothstep(0.0, 0.075, vUv.x);
      float receptorFalloff = 1.0 - 0.14 * smoothstep(0.76, 1.0, vUv.x);
      float alpha = uOpacity * edgeFade * sourceFade * receptorFalloff;
      gl_FragColor = vec4(uColor, alpha);
    }
  `

  return (
    <>
      <mesh geometry={geometries.envelope} renderOrder={1}>
        {rayTracing ? (
          <meshPhysicalMaterial color="#79d8e8" emissive="#4fc8df" emissiveIntensity={isEmitting ? 0.45 : 0.08} roughness={1} transparent opacity={isEmitting ? 0.022 : 0.007} side={THREE.DoubleSide} depthWrite={false} />
        ) : (
          <meshBasicMaterial color="#79d8e8" transparent opacity={isEmitting ? 0.016 : 0.005} side={THREE.DoubleSide} depthWrite={false} />
        )}
      </mesh>
      {!rayTracing && <mesh geometry={geometries.vertical} renderOrder={2}>
        <shaderMaterial uniforms={sheetUniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} transparent side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>}
      {!rayTracing && <mesh geometry={geometries.horizontal} renderOrder={2}>
        <shaderMaterial uniforms={sheetUniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} transparent side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>}
    </>
  )
}

function AcquisitionGeometry({ settings, phase, rayTracing }: { settings: XraySettings; phase: ExposurePhase; rayTracing: boolean }) {
  const { sourceX, detectorCenterX, detectorFaceX } = getSceneSidGeometry(settings.sid)
  const patientCenterX = getScenePatientCenterX(settings)
  const fieldRatio = settings.collimation / 100
  const beamHalfHeight = 1.59 * fieldRatio
  const beamHalfWidth = 1.17 * fieldRatio

  return (
    <>
      <SourceAssembly phase={phase} sourceX={sourceX} />
      <group position={[patientCenterX, 0, 0]}>
        <Patient settings={settings} />
      </group>
      <Detector x={detectorCenterX} phase={phase} fieldRatio={fieldRatio} />
      <RectangularBeam sourceX={sourceX} sourceY={0.72} targetX={detectorFaceX} targetY={0.58} halfHeight={beamHalfHeight} halfWidth={beamHalfWidth} phase={phase} rayTracing={rayTracing} />
    </>
  )
}

const FOCUS_BY_CAMERA: Record<CameraPreset, { distance: number; range: number }> = {
  Room: { distance: 12.5, range: 7 },
  Beam: { distance: 9.4, range: 5 },
  Patient: { distance: 6.2, range: 3.8 },
  Detector: { distance: 8.2, range: 4.8 },
}

function HighQualityEffects({ cameraPreset }: { cameraPreset: CameraPreset }) {
  const focus = FOCUS_BY_CAMERA[cameraPreset]
  return (
    <EffectComposer multisampling={0} resolutionScale={0.9}>
      <N8AO halfRes={false} quality="high" aoRadius={0.42} intensity={1.05} distanceFalloff={0.85} denoiseRadius={5} />
      <Bloom mipmapBlur intensity={0.28} luminanceThreshold={0.82} luminanceSmoothing={0.24} radius={0.72} />
      <DepthOfField worldFocusDistance={focus.distance} worldFocusRange={focus.range} bokehScale={0.62} resolutionScale={0.65} />
      <SMAA />
    </EffectComposer>
  )
}

function PathTracingSynchronizer({ geometryVersion, materialVersion, statusRef, backend }: { geometryVersion: string; materialVersion: string; statusRef: RefObject<HTMLDivElement | null>; backend: RtBackend }) {
  const { pathtracer, update } = usePathtracer()
  const initialGeometry = useRef(true)
  const previousCamera = useRef(new THREE.Matrix4())
  const nextStatusUpdate = useRef(0)

  useEffect(() => {
    if (initialGeometry.current) {
      initialGeometry.current = false
      return
    }
    const frame = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(frame)
  }, [geometryVersion, update])

  useEffect(() => {
    pathtracer.updateMaterials()
    pathtracer.reset()
  }, [materialVersion, pathtracer])

  useFrame(({ camera, clock }) => {
    camera.updateMatrixWorld()
    if (!previousCamera.current.equals(camera.matrixWorld)) {
      previousCamera.current.copy(camera.matrixWorld)
      pathtracer.updateCamera()
    }
    if (statusRef.current && clock.elapsedTime >= nextStatusUpdate.current) {
      const samples = Math.floor(pathtracer.samples)
      const backendLabel = backend === 'webgpu' ? 'WebGPU RT' : 'WebGL RT'
      statusRef.current.textContent = samples < RT_MIN_SAMPLES
        ? `${backendLabel} · warming · ${samples}/${RT_MIN_SAMPLES} spp`
        : samples >= RT_MAX_SAMPLES
          ? `${backendLabel} · ready · ${samples} spp`
          : `${backendLabel} · resolving · ${samples} spp`
      nextStatusUpdate.current = clock.elapsedTime + 0.25
    }
  }, 0)

  return null
}

function WebGlRayTracingRenderer({ settings, phase, cameraPreset, statusRef }: { settings: XraySettings; phase: ExposurePhase; cameraPreset: CameraPreset; statusRef: RefObject<HTMLDivElement | null> }) {
  const tracer = useRef<ComponentRef<typeof Pathtracer>>(null)
  const geometryVersion = `${settings.projection}:${settings.rotation}:${settings.sid}:${settings.collimation}:${settings.thickness}:${cameraPreset}`
  const materialVersion = `${phase}:${settings.kvp}:${settings.mas}`

  useEffect(() => {
    const pathtracer = tracer.current
    if (!pathtracer) return
    pathtracer.multipleImportanceSampling = true
    pathtracer.transmissiveBounces = 3
    pathtracer.filterGlossyFactor = 1.25

    const denoiseMaterial = new DenoiseMaterial({
      sigma: 1.25,
      kSigma: 1,
      threshold: 10,
    })
    denoiseMaterial.transparent = true
    denoiseMaterial.blending = THREE.NormalBlending
    const denoiseQuad = new FullScreenQuad(denoiseMaterial)
    const defaultCanvasRenderer = pathtracer.renderToCanvasCallback

    pathtracer.renderToCanvasCallback = (target, renderer, interpolationQuad) => {
      const previousAutoClear = renderer.autoClear
      if (pathtracer.scene && pathtracer.camera) pathtracer.rasterizeSceneCallback(pathtracer.scene, pathtracer.camera)
      renderer.autoClear = false
      denoiseMaterial.map = target.texture
      denoiseMaterial.opacity = Math.min(interpolationQuad.material.opacity, 0.3)
      denoiseQuad.render(renderer)
      renderer.autoClear = previousAutoClear
    }

    return () => {
      pathtracer.renderToCanvasCallback = defaultCanvasRenderer
      denoiseQuad.dispose()
      denoiseMaterial.dispose()
      pathtracer.dispose()
    }
  }, [])

  return (
    <Pathtracer
      ref={tracer}
      samples={RT_MAX_SAMPLES}
      minSamples={RT_MIN_SAMPLES}
      bounces={4}
      tiles={[1, 1]}
      resolutionFactor={0.48}
      renderDelay={120}
      fadeDuration={1800}
      dynamicLowRes={false}
      rasterizeScene
    >
      <PathTracingSynchronizer geometryVersion={geometryVersion} materialVersion={materialVersion} statusRef={statusRef} backend="webgl2" />
    </Pathtracer>
  )
}

function RayTracingBackend({ backend, settings, phase, cameraPreset, statusRef }: { backend: RtBackend; settings: XraySettings; phase: ExposurePhase; cameraPreset: CameraPreset; statusRef: RefObject<HTMLDivElement | null> }) {
  // Backend selection lives above the scene. Until the WebGPU implementation
  // reaches feature parity, the selector can only resolve to the stable tracer.
  if (backend !== 'webgl2') return null
  return <WebGlRayTracingRenderer settings={settings} phase={phase} cameraPreset={cameraPreset} statusRef={statusRef} />
}

export function XrayScene({ settings, phase, cameraPreset, renderMode, rtBackend, rtStatusRef }: { settings: XraySettings; phase: ExposurePhase; cameraPreset: CameraPreset; renderMode: 'standard' | 'hq' | 'rt'; rtBackend: RtBackend | null; rtStatusRef: RefObject<HTMLDivElement | null> }) {
  const highQuality = renderMode === 'hq'
  const rayTracing = renderMode === 'rt'
  const [rayTracerMounted, setRayTracerMounted] = useState(false)
  const { sourceX, detectorFaceX } = getSceneSidGeometry(settings.sid)
  const patientCenterX = getScenePatientCenterX(settings)
  const systemCenterX = (sourceX + detectorFaceX) / 2
  const cameraTargetX = cameraPreset === 'Patient'
    ? patientCenterX
    : cameraPreset === 'Detector'
      ? detectorFaceX
      : systemCenterX
  const cameraTargetY = cameraPreset === 'Room' ? 2.7 : settings.projection === 'Lateral' && cameraPreset === 'Patient' ? 0.84 : 0.62

  useEffect(() => {
    const timer = window.setTimeout(() => setRayTracerMounted(rayTracing), rayTracing ? 90 : 0)
    return () => window.clearTimeout(timer)
  }, [rayTracing])

  return (
    <Canvas
      dpr={[1, rayTracing ? 1.35 : highQuality ? 1.8 : 1.35]}
      camera={{ position: CAMERA_POSITIONS.Room, fov: 43, near: 0.1, far: 100 }}
      shadows
      frameloop={rayTracing ? 'always' : 'demand'}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 0.94
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.shadowMap.type = THREE.PCFSoftShadowMap
      }}
      aria-hidden="true"
    >
      <color attach="background" args={['#506a72']} />
      <fog attach="fog" args={['#506a72', 17, 34]} />
      <ambientLight intensity={0.46} color="#c9e2e6" />
      <hemisphereLight args={['#eef8f7', '#42545b', 0.74]} />
      <directionalLight position={[3.8, 7, 5]} intensity={1.75} color="#f3fbfa" />
      <spotLight position={[0.5, 5.7, 2.7]} intensity={11} angle={0.76} penumbra={0.94} distance={17} decay={2} color="#e4f7fa" />
      <pointLight position={[-4.2, 2.2, 3.1]} intensity={5.1} distance={11} decay={2} color="#79d9eb" />
      <pointLight position={[5.2, 1.5, 2.2]} intensity={2.55} distance={10} decay={2} color="#ffd0a0" />
      <pointLight position={[2.4, 3.6, -3.8]} intensity={3.35} distance={9} decay={2} color="#bce0e5" />
      {rayTracing && [-4.2, 0, 4.2].map((x) => <rectAreaLight key={x} ref={(light) => light?.lookAt(x, 0, -0.8)} position={[x, 5.82, -0.8]} width={2.7} height={1.05} intensity={22} color="#eefcff" />)}

      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3.2} color="#efffff" position={[0, 5, -4]} rotation={[Math.PI / 2, 0, 0]} scale={[9, 2, 1]} />
        <Lightformer form="rect" intensity={2.15} color="#8ce5f3" position={[-6, 1.5, 2]} rotation={[0, Math.PI / 2, 0]} scale={[3, 5, 1]} />
        <Lightformer form="rect" intensity={1.35} color="#ffd1a7" position={[6, 1, 3]} rotation={[0, -Math.PI / 2, 0]} scale={[2.5, 4, 1]} />
      </Environment>

      <HospitalRoom highQuality={highQuality} rayTracing={rayTracing} />
      <AcquisitionGeometry settings={settings} phase={phase} rayTracing={rayTracing} />
      {!rayTracing && <ContactShadows position={[0, -2.055, 0]} opacity={0.26} scale={17} blur={highQuality ? 4.8 : 3.6} far={3.7} frames={1} resolution={highQuality ? 1024 : 512} color="#17252b" />}
      <RendererTuning rayTracing={rayTracing} />
      <CameraRig preset={cameraPreset} lateral={settings.projection === 'Lateral'} targetX={cameraTargetX} />
      <OrbitControls makeDefault target={[cameraTargetX, cameraTargetY, 0]} enablePan={false} minDistance={4} maxDistance={16} minPolarAngle={0.42} maxPolarAngle={1.55} />
      {highQuality && <HighQualityEffects cameraPreset={cameraPreset} />}
      {rayTracing && rayTracerMounted && rtBackend && <RayTracingBackend backend={rtBackend} settings={settings} phase={phase} cameraPreset={cameraPreset} statusRef={rtStatusRef} />}
    </Canvas>
  )
}
