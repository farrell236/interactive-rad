import { Canvas } from '@react-three/fiber'
import { OrbitControls, RoundedBox, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'

type ModelProps = Pick<ThreeElements['group'], 'position' | 'rotation' | 'scale'> & {
  path: string
}

interface CtScannerSceneProps {
  scanProgress?: number
  gantryAngle?: number
}

const PATIENT_CAMERA = { position: [1.75, 1.92, 3.25] as [number, number, number], target: [0, 1.05, 0.22] as [number, number, number] }
const LANDING_CAMERA = { position: [1.05, 1.55, 1.55] as [number, number, number], target: [0, 1.02, -0.55] as [number, number, number] }
const ROOM_GRID = [-3, -1, 1, 3] as const
const GANTRY_ISOCENTER_Y = 1.1
const COUCH_CENTER_Y = GANTRY_ISOCENTER_Y - 0.2
const ACQUISITION_PLANE_Z = -1.03
const PATIENT_START_Z = -0.15
const PATIENT_END_Z = -0.93
const LANDING_PATIENT_START_Z = -0.93
const LANDING_PATIENT_END_Z = -0.3

const ROOM_MODELS = {
  scanner: 'models/ct-scanner-room.glb',
  floor: 'models/ct-room-floor.glb',
  ceiling: 'models/ct-room-ceiling.glb',
  wall: 'models/ct-room-wall.glb',
  glazedWall: 'models/ct-room-glazed-wall.glb',
  counter: 'models/ct-room-counter.glb',
  monitor: 'models/ct-room-monitor.glb',
  services: 'models/ct-room-services.glb',
  fridge: 'models/ct-room-fridge.glb',
} as const

function modelUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path}`
}

function MedicalAsset({ path, ...props }: ModelProps) {
  const source = useGLTF(modelUrl(path)).scene
  const model = useMemo(() => {
    const clone = source.clone(true)
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.castShadow = true
      child.receiveShadow = true
    })
    return clone
  }, [source])

  return <group {...props}><primitive object={model} /></group>
}

function CtPatient({ scanProgress, startZ = PATIENT_START_Z, endZ = PATIENT_END_Z }: { scanProgress: number; startZ?: number; endZ?: number }) {
  const bodySource = useGLTF(modelUrl('models/anatomy-body.glb')).scene
  const skeletonSource = useGLTF(modelUrl('models/anatomy-skeleton.glb')).scene
  const organsSource = useGLTF(modelUrl('models/anatomy-organs.glb')).scene

  const bodyMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#73aabd',
    roughness: 0.42,
    clearcoat: 0.14,
    transmission: 0.08,
    thickness: 0.2,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const skeletonMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e7dcc6',
    roughness: 0.58,
    transparent: true,
    opacity: 0.88,
    depthWrite: true,
  }), [])
  const organMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#a96f68',
    emissive: '#6f2d30',
    emissiveIntensity: 0.06,
    roughness: 0.56,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])

  const body = useMemo(() => {
    const clone = bodySource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = bodyMaterial
      child.castShadow = true
      child.receiveShadow = true
      child.renderOrder = 1
    })
    return clone
  }, [bodyMaterial, bodySource])
  const skeleton = useMemo(() => {
    const clone = skeletonSource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = skeletonMaterial
      child.castShadow = true
      child.renderOrder = 3
    })
    return clone
  }, [skeletonMaterial, skeletonSource])
  const organs = useMemo(() => {
    const clone = organsSource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = organMaterial
      child.castShadow = true
      child.renderOrder = 2
    })
    return clone
  }, [organMaterial, organsSource])

  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial])
  useEffect(() => () => skeletonMaterial.dispose(), [skeletonMaterial])
  useEffect(() => () => organMaterial.dispose(), [organMaterial])

  const patientZ = THREE.MathUtils.lerp(startZ, endZ, scanProgress)

  return (
    <group position={[0, GANTRY_ISOCENTER_Y, patientZ]} rotation={[-Math.PI / 2, 0, 0]} scale={0.405}>
      <group position={[0, -2.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={2.55}>
        <primitive object={body} />
        <primitive object={organs} />
        <primitive object={skeleton} />
      </group>
    </group>
  )
}

function MovingCouchSurface({ scanProgress, startZ = PATIENT_START_Z, endZ = PATIENT_END_Z }: { scanProgress: number; startZ?: number; endZ?: number }) {
  const patientZ = THREE.MathUtils.lerp(startZ, endZ, scanProgress)

  return (
    <RoundedBox
      args={[0.46, 0.1, 2.16]}
      radius={0.022}
      smoothness={4}
      position={[0, COUCH_CENTER_Y, patientZ - 0.075]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#b9d5da" roughness={0.58} metalness={0.06} />
    </RoundedBox>
  )
}

function GantryBoreExtension() {
  return (
    <group position={[0, GANTRY_ISOCENTER_Y, ACQUISITION_PLANE_Z]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[1.02, 1.02, 0.8, 64, 1, true]} />
        <meshStandardMaterial color="#dce9eb" roughness={0.38} metalness={0.12} side={THREE.DoubleSide} />
      </mesh>
      <mesh receiveShadow>
        <cylinderGeometry args={[0.73, 0.73, 0.79, 64, 1, true]} />
        <meshStandardMaterial color="#9fc7cd" roughness={0.34} metalness={0.18} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

function AcquisitionOverlay({ angle }: { angle: number }) {
  // Keep the teaching orbit inside the hollow bore and recess it into the
  // gantry tunnel so the scanner visibly surrounds and occludes it.
  const orbitRadius = 0.48
  const sourcePosition = [Math.cos(angle) * orbitRadius, Math.sin(angle) * orbitRadius, 0] as [number, number, number]
  const detectorPosition = [-sourcePosition[0], -sourcePosition[1], 0] as [number, number, number]
  const trail = useMemo(() => Array.from({ length: 15 }, (_, index) => {
    const trailAngle = angle - ((index + 1) * 0.048)
    return {
      position: [Math.cos(trailAngle) * orbitRadius, Math.sin(trailAngle) * orbitRadius, 0] as [number, number, number],
      opacity: Math.max(0.08, 0.56 - (index * 0.032)),
      scale: Math.max(0.024, 0.046 - (index * 0.0015)),
    }
  }), [angle])

  return (
    <group>
      <group position={[0, GANTRY_ISOCENTER_Y, ACQUISITION_PLANE_Z]}>
        <mesh>
          <torusGeometry args={[orbitRadius, 0.008, 10, 96]} />
          <meshBasicMaterial color="#28d9ff" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        {trail.map((marker, index) => (
          <mesh key={index} position={marker.position} scale={marker.scale}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color="#16d8ff" transparent opacity={marker.opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}
        <mesh position={sourcePosition}>
          <sphereGeometry args={[0.052, 18, 18]} />
          <meshBasicMaterial color="#75efff" toneMapped={false} />
        </mesh>
        <mesh position={detectorPosition} rotation={[0, 0, angle]}>
          <boxGeometry args={[0.14, 0.035, 0.07]} />
          <meshStandardMaterial color="#ffc878" emissive="#ff9f35" emissiveIntensity={1.2} roughness={0.35} />
        </mesh>
        <pointLight position={sourcePosition} intensity={0.8} distance={1.4} decay={2} color="#42ddff" />
      </group>

      <mesh position={[0, GANTRY_ISOCENTER_Y, ACQUISITION_PLANE_Z]}>
        <planeGeometry args={[0.92, 0.72]} />
        <meshBasicMaterial color="#53ddff" transparent opacity={0.13} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, GANTRY_ISOCENTER_Y, ACQUISITION_PLANE_Z + 0.002]}>
        <planeGeometry args={[0.92, 0.72]} />
        <meshBasicMaterial color="#a9f5ff" transparent opacity={0.5} depthWrite={false} wireframe side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function CtSuite({ scanProgress, gantryAngle }: { scanProgress: number; gantryAngle: number }) {
  const tilePositions = useMemo(() => ROOM_GRID.flatMap((x) => ROOM_GRID.map((z) => [x, z] as const)), [])

  return (
    <group>
      {tilePositions.map(([x, z]) => <MedicalAsset key={`floor-${x}-${z}`} path={ROOM_MODELS.floor} position={[x, 0, z]} />)}

      {ROOM_GRID.map((x) => (
        <MedicalAsset key={`back-${x}`} path={x === -1 ? ROOM_MODELS.glazedWall : ROOM_MODELS.wall} position={[x, 0, -4]} />
      ))}
      {ROOM_GRID.map((x) => (
        <MedicalAsset key={`front-${x}`} path={x === 1 ? ROOM_MODELS.glazedWall : ROOM_MODELS.wall} position={[x, 0, 4]} rotation={[0, Math.PI, 0]} />
      ))}
      {ROOM_GRID.map((z) => <MedicalAsset key={`left-${z}`} path={ROOM_MODELS.wall} position={[-4, 0, z]} rotation={[0, Math.PI / 2, 0]} />)}
      {ROOM_GRID.map((z) => <MedicalAsset key={`right-${z}`} path={ROOM_MODELS.wall} position={[4, 0, z]} rotation={[0, -Math.PI / 2, 0]} />)}

      {tilePositions.map(([x, z]) => <MedicalAsset key={`ceiling-${x}-${z}`} path={ROOM_MODELS.ceiling} position={[x, 2.72, z]} />)}

      <MedicalAsset path={ROOM_MODELS.counter} position={[-2.6, 0.04, -3.57]} />
      <MedicalAsset path={ROOM_MODELS.fridge} position={[3.35, 0.04, -3.57]} />
      <MedicalAsset path={ROOM_MODELS.monitor} position={[-3.55, 0.04, -0.62]} rotation={[0, Math.PI / 2, 0]} />
      <MedicalAsset path={ROOM_MODELS.services} position={[0.95, 1.45, -3.9]} />

      <MedicalAsset path={ROOM_MODELS.scanner} position={[0, 0.04, -0.08]} />
      <GantryBoreExtension />
      <MovingCouchSurface scanProgress={scanProgress} />
      <CtPatient scanProgress={scanProgress} />
      <AcquisitionOverlay angle={gantryAngle} />
    </group>
  )
}

function Scene({ scanProgress, gantryAngle }: { scanProgress: number; gantryAngle: number }) {
  return (
    <>
      <color attach="background" args={['#20363d']} />
      <fog attach="fog" args={['#20363d', 8.5, 15]} />
      <ambientLight intensity={1.15} color="#d7edf0" />
      <hemisphereLight args={['#f3fbff', '#273e44', 1.6]} />
      <directionalLight position={[3.5, 6.4, 4.8]} intensity={3.1} color="#f8fcff" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} />
      <pointLight position={[-2.2, 2.35, 1.4]} intensity={5.5} distance={7} decay={2} color="#b8eeff" />
      <pointLight position={[2.35, 2.15, -1.8]} intensity={3.2} distance={6} decay={2} color="#fff0d4" />
      <Suspense fallback={null}><CtSuite scanProgress={scanProgress} gantryAngle={gantryAngle} /></Suspense>
      <OrbitControls makeDefault target={PATIENT_CAMERA.target} enablePan={false} minDistance={2.2} maxDistance={3.65} minPolarAngle={1.05} maxPolarAngle={1.55} />
    </>
  )
}

function LandingCtSuite({ scanProgress, gantryAngle }: { scanProgress: number; gantryAngle: number }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, -0.3]} receiveShadow>
        <planeGeometry args={[5.5, 5.5]} />
        <meshStandardMaterial color="#294047" roughness={0.92} />
      </mesh>
      <MedicalAsset path={ROOM_MODELS.scanner} position={[0, 0.04, -0.08]} />
      <GantryBoreExtension />
      <MovingCouchSurface scanProgress={scanProgress} startZ={LANDING_PATIENT_START_Z} endZ={LANDING_PATIENT_END_Z} />
      <CtPatient scanProgress={scanProgress} startZ={LANDING_PATIENT_START_Z} endZ={LANDING_PATIENT_END_Z} />
      <AcquisitionOverlay angle={gantryAngle} />
    </group>
  )
}

function LandingCtScene({ scanProgress, gantryAngle }: { scanProgress: number; gantryAngle: number }) {
  return (
    <>
      <color attach="background" args={['#20363d']} />
      <fog attach="fog" args={['#20363d', 6.5, 12]} />
      <ambientLight intensity={1.35} color="#d7edf0" />
      <hemisphereLight args={['#f3fbff', '#273e44', 1.75]} />
      <directionalLight position={[3.5, 6.4, 4.8]} intensity={3.2} color="#f8fcff" castShadow shadow-mapSize={[768, 768]} />
      <pointLight position={[-2.2, 2.35, 1.4]} intensity={5.2} distance={7} decay={2} color="#b8eeff" />
      <pointLight position={[2.35, 2.15, -1.8]} intensity={3.1} distance={6} decay={2} color="#fff0d4" />
      <Suspense fallback={null}><LandingCtSuite scanProgress={scanProgress} gantryAngle={gantryAngle} /></Suspense>
    </>
  )
}

export function LandingCtScannerCanvas({ scanProgress = 0, gantryAngle = 0 }: CtScannerSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.35]}
      camera={{ position: LANDING_CAMERA.position, fov: 36, near: 0.05, far: 30 }}
      shadows
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(...LANDING_CAMERA.target)
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.08
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.shadowMap.type = THREE.PCFSoftShadowMap
      }}
      aria-hidden="true"
    >
      <LandingCtScene scanProgress={scanProgress} gantryAngle={gantryAngle} />
    </Canvas>
  )
}

export default function CtScannerScene({ scanProgress = 0, gantryAngle = 0 }: CtScannerSceneProps) {
  return (
    <section className="ct-room-model" aria-labelledby="ct-room-model-title">
      <header>
        <div>
          <span>Core concept</span>
          <h4 id="ct-room-model-title">A projection collapses depth; tomography reconstructs it.</h4>
          <p>Inside the gantry, an X-ray tube faces a detector array across the patient. The tube emits a fan-shaped beam through the body, and the detector records the transmitted X-rays along many adjacent paths. The patient lies near the center of rotation, called the isocenter, on a table that can move through the gantry.</p>
          <p>During acquisition, the tube and detector rotate together and record a projection at each angle. A single projection collapses depth like a radiograph, but the complete set of views allows the scanner to reconstruct an axial slice. Repeating this process as the table advances builds a three-dimensional volume.</p>
        </div>
      </header>
      <div className="ct-room-viewport" role="img" aria-label="Interactive three-dimensional hospital CT suite containing a scanner mesh and anatomical patient on the couch. Drag to orbit and scroll to zoom.">
        <div className="ct-room-scene-legend" aria-hidden="true"><span><i />Gantry</span><span><i />Patient couch</span><span><i />Live acquisition</span></div>
        <span className="ct-room-orbit-hint" aria-hidden="true">Drag to orbit · Scroll to zoom</span>
        <Canvas
          dpr={[1, 1.6]}
          camera={{ position: PATIENT_CAMERA.position, fov: 37, near: 0.05, far: 40 }}
          shadows
          frameloop="demand"
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.08
            gl.outputColorSpace = THREE.SRGBColorSpace
            gl.shadowMap.type = THREE.PCFSoftShadowMap
          }}
          aria-hidden="true"
        >
          <Scene scanProgress={scanProgress} gantryAngle={gantryAngle} />
        </Canvas>
      </div>
      <footer>Scanner and room meshes: 3D Assets, “Hospital Wards and Clinic Operations” (CC0 1.0). Anatomical patient: ogbog’s Blender adaptation of BodyParts3D (CC BY-SA).</footer>
    </section>
  )
}

Object.values(ROOM_MODELS).forEach((path) => useGLTF.preload(modelUrl(path)))
useGLTF.preload(modelUrl('models/anatomy-body.glb'))
useGLTF.preload(modelUrl('models/anatomy-skeleton.glb'))
useGLTF.preload(modelUrl('models/anatomy-organs.glb'))
