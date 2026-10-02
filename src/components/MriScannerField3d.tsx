import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getMriPulseCyclePhase, isMriRfActive, MRI_RF_END, MRI_RF_START } from './mriPulseCycle'

const SCANNER_MODEL_URL = `${import.meta.env.BASE_URL}models/ct-scanner-room.glb`
const FIELD_CENTER_Y = 1.1
const FIELD_CENTER_Z = -1.03
const SCANNER_POSITION = [0, 0.04, -0.08] as const

function ScannerModel() {
  const source = useGLTF(SCANNER_MODEL_URL).scene
  const model = useMemo(() => {
    const clone = source.clone(true)
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.castShadow = true
      child.receiveShadow = true
    })
    return clone
  }, [source])

  return <primitive object={model} position={SCANNER_POSITION} />
}

interface FieldLoopConfig {
  angle: number
  phase: number
}

function createFieldCurve({ angle }: FieldLoopConfig) {
  const normalX = Math.cos(angle)
  const normalY = Math.sin(angle)
  const ringRadius = 0.9
  const loopCenterX = normalX * ringRadius
  const loopCenterY = FIELD_CENTER_Y + (normalY * ringRadius)
  const points = Array.from({ length: 128 }, (_, index) => {
    const progress = (index / 128) * Math.PI * 2
    const radialDistance = Math.cos(progress) * 0.48
    const axialDistance = Math.sin(progress) * 0.7
    return new THREE.Vector3(
      loopCenterX + (normalX * radialDistance),
      loopCenterY + (normalY * radialDistance),
      FIELD_CENTER_Z + axialDistance,
    )
  })

  return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5)
}

function FieldLoop({ config, index }: { config: FieldLoopConfig; index: number }) {
  const markerRef = useRef<THREE.Mesh | null>(null)
  const curve = useMemo(() => createFieldCurve(config), [config])
  const tubeGeometry = useMemo(() => new THREE.TubeGeometry(curve, 128, 0.0065, 8, true), [curve])
  const markerGeometry = useMemo(() => new THREE.ConeGeometry(0.025, 0.075, 12), [])
  const markerMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#5bdcff',
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    toneMapped: false,
  }), [])
  const tangent = useMemo(() => new THREE.Vector3(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  useEffect(() => () => {
    tubeGeometry.dispose()
    markerGeometry.dispose()
    markerMaterial.dispose()
  }, [markerGeometry, markerMaterial, tubeGeometry])

  useFrame(({ clock }) => {
    const marker = markerRef.current
    if (!marker) return
    const progress = (clock.getElapsedTime() * 0.065 + config.phase + (index * 0.04)) % 1
    curve.getPointAt(progress, position)
    curve.getTangentAt(progress, tangent).normalize()
    quaternion.setFromUnitVectors(up, tangent)
    marker.position.copy(position)
    marker.quaternion.copy(quaternion)
  })

  return (
    <group>
      <mesh geometry={tubeGeometry}>
        <meshBasicMaterial color="#30c9f2" transparent opacity={0.52} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={markerRef} geometry={markerGeometry} material={markerMaterial} />
    </group>
  )
}

function B0FieldLines({ visible }: { visible: boolean }) {
  const loops = useMemo<FieldLoopConfig[]>(() => Array.from({ length: 24 }, (_, index) => ({
    angle: (index / 24) * Math.PI * 2,
    phase: (index / 24) + 0.04,
  })), [])

  return (
    <group visible={visible}>
      {loops.map((config, index) => <FieldLoop key={config.angle} config={config} index={index} />)}
    </group>
  )
}

function RfImplosion({ active, cycleStartedAt }: { active: boolean; cycleStartedAt: number }) {
  const pulseRef = useRef<THREE.Group | null>(null)
  const orbitRef = useRef<THREE.Group | null>(null)
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null)
  const haloMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null)
  const flashMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null)
  const lightRef = useRef<THREE.PointLight | null>(null)
  const trail = useMemo(() => Array.from({ length: 10 }, (_, index) => ({
    angle: -(index + 1) * 0.12,
    opacity: 0.58 - (index * 0.045),
    scale: 0.034 - (index * 0.0018),
  })), [])

  useEffect(() => {
    if (!active && pulseRef.current) pulseRef.current.visible = false
  }, [active])

  useFrame(() => {
    const pulse = pulseRef.current
    const orbit = orbitRef.current
    const ringMaterial = ringMaterialRef.current
    const haloMaterial = haloMaterialRef.current
    const flashMaterial = flashMaterialRef.current
    if (!pulse || !orbit || !ringMaterial || !haloMaterial || !flashMaterial) return
    if (!active) {
      pulse.visible = false
      return
    }

    const cycle = getMriPulseCyclePhase(cycleStartedAt)
    if (!isMriRfActive(cycle)) {
      pulse.visible = false
      return
    }

    const progress = (cycle - MRI_RF_START) / (MRI_RF_END - MRI_RF_START)
    const eased = progress * progress * (3 - (2 * progress))
    const scale = THREE.MathUtils.lerp(1, 0.14, eased)
    const envelope = Math.pow(Math.sin(progress * Math.PI), 0.58)
    pulse.visible = true
    pulse.scale.setScalar(scale)
    orbit.rotation.z = progress * Math.PI * 4.25
    ringMaterial.opacity = 0.84 * envelope
    haloMaterial.opacity = 0.22 * envelope
    flashMaterial.opacity = Math.max(0, (progress - 0.78) / 0.22) * (1 - progress) * 4.2
    if (lightRef.current) lightRef.current.intensity = 1.8 * envelope
  })

  return (
    <group ref={pulseRef} position={[0, FIELD_CENTER_Y, FIELD_CENTER_Z]} visible={false}>
      <group ref={orbitRef}>
        <mesh>
          <torusGeometry args={[0.61, 0.018, 12, 112]} />
          <meshBasicMaterial ref={ringMaterialRef} color="#b69cff" transparent opacity={0} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh>
          <torusGeometry args={[0.61, 0.055, 12, 112]} />
          <meshBasicMaterial ref={haloMaterialRef} color="#8f6cff" transparent opacity={0} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh position={[0.61, 0, 0]}>
          <sphereGeometry args={[0.052, 18, 18]} />
          <meshBasicMaterial color="#eadfff" transparent opacity={0.96} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
        {trail.map((marker, index) => (
          <mesh key={index} position={[Math.cos(marker.angle) * 0.61, Math.sin(marker.angle) * 0.61, 0]} scale={marker.scale}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color="#a98dff" transparent opacity={marker.opacity} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}
      </group>
      <mesh>
        <sphereGeometry args={[0.14, 22, 22]} />
        <meshBasicMaterial ref={flashMaterialRef} color="#e5d8ff" transparent opacity={0} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight ref={lightRef} color="#a98dff" intensity={0} distance={1.9} decay={2} />
    </group>
  )
}

function Scene({ fieldActive, pulseActive, cycleStartedAt }: { fieldActive: boolean; pulseActive: boolean; cycleStartedAt: number }) {
  return (
    <>
      <ambientLight intensity={1.35} color="#e8f7fa" />
      <hemisphereLight args={['#f8fdff', '#31525b', 1.45]} />
      <directionalLight position={[3.5, 5.8, 4.2]} intensity={3.1} color="#ffffff" castShadow />
      <pointLight position={[-2.1, 2.3, 1.8]} intensity={4.2} distance={7} decay={2} color="#79dcf1" />
      <Suspense fallback={null}>
        <ScannerModel />
        <B0FieldLines visible={fieldActive} />
        <RfImplosion active={pulseActive} cycleStartedAt={cycleStartedAt} />
      </Suspense>
      <OrbitControls
        makeDefault
        target={[-0.08, 1, -0.67]}
        enablePan={false}
        enableRotate={false}
        enableZoom={false}
      />
    </>
  )
}

export function MriScannerField3d({ fieldActive, pulseActive = false, cycleStartedAt }: { fieldActive: boolean; pulseActive?: boolean; cycleStartedAt: number }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [3.77, 4.85, 3.18], fov: 32, near: 0.05, far: 30 }}
      shadows
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      aria-hidden="true"
    >
      <Scene fieldActive={fieldActive} pulseActive={pulseActive} cycleStartedAt={cycleStartedAt} />
    </Canvas>
  )
}

useGLTF.preload(SCANNER_MODEL_URL)
