import { Canvas } from '@react-three/fiber'
import { OrbitControls, RoundedBox, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

type HardwareView = 'all' | 'magnet' | 'rf' | 'receive' | 'x' | 'y' | 'z'

const anatomyUrl = (name: string) => `${import.meta.env.BASE_URL}models/${name}`

function GradientPatient() {
  const bodySource = useGLTF(anatomyUrl('anatomy-body.glb')).scene
  const skeletonSource = useGLTF(anatomyUrl('anatomy-skeleton.glb')).scene
  const organsSource = useGLTF(anatomyUrl('anatomy-organs.glb')).scene

  const bodyMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#73b7ca',
    roughness: 0.36,
    clearcoat: 0.16,
    transmission: 0.12,
    thickness: 0.22,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const skeletonMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#eadfcb',
    roughness: 0.52,
    transparent: true,
    opacity: 0.88,
    depthWrite: true,
  }), [])
  const organMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#b16f72',
    emissive: '#642c36',
    emissiveIntensity: 0.06,
    roughness: 0.55,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])

  const body = useMemo(() => {
    const clone = bodySource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = bodyMaterial
      child.renderOrder = 2
    })
    return clone
  }, [bodyMaterial, bodySource])
  const skeleton = useMemo(() => {
    const clone = skeletonSource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = skeletonMaterial
      child.renderOrder = 4
    })
    return clone
  }, [skeletonMaterial, skeletonSource])
  const organs = useMemo(() => {
    const clone = organsSource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = organMaterial
      child.renderOrder = 3
    })
    return clone
  }, [organMaterial, organsSource])

  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial])
  useEffect(() => () => skeletonMaterial.dispose(), [skeletonMaterial])
  useEffect(() => () => organMaterial.dispose(), [organMaterial])

  return (
    <group position={[0, -0.12, -0.08]} rotation={[-Math.PI / 2, 0, 0]} scale={0.68}>
      <group position={[0, -2.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[2.1, 2.55, 2.55]}>
        <primitive object={body} />
        <primitive object={organs} />
        <primitive object={skeleton} />
      </group>
    </group>
  )
}

function makeSaddleCurve(centerAngle: number, radius = 1.05, halfSpan = 0.56, halfLength = 1.55) {
  const points: THREE.Vector3[] = []
  const addPoint = (angle: number, z: number) => points.push(new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
    z,
  ))
  const segments = 24

  for (let index = 0; index <= segments; index += 1) addPoint(centerAngle - halfSpan, THREE.MathUtils.lerp(-halfLength, halfLength, index / segments))
  for (let index = 1; index <= segments; index += 1) addPoint(THREE.MathUtils.lerp(centerAngle - halfSpan, centerAngle + halfSpan, index / segments), halfLength)
  for (let index = 1; index <= segments; index += 1) addPoint(centerAngle + halfSpan, THREE.MathUtils.lerp(halfLength, -halfLength, index / segments))
  for (let index = 1; index <= segments; index += 1) addPoint(THREE.MathUtils.lerp(centerAngle + halfSpan, centerAngle - halfSpan, index / segments), -halfLength)

  return new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.35)
}

function CoilTube({ curve, color, emphasized }: { curve: THREE.Curve<THREE.Vector3>; color: string; emphasized: boolean }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 192, 0.026, 10, true), [curve])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emphasized ? 0.34 : 0.04} transparent opacity={emphasized ? 0.92 : 0.12} roughness={0.3} depthWrite={false} />
    </mesh>
  )
}

function GradientAssembly({ selected }: { selected: HardwareView }) {
  const xCurves = useMemo(() => [makeSaddleCurve(0), makeSaddleCurve(Math.PI)], [])
  const yCurves = useMemo(() => [makeSaddleCurve(Math.PI / 2), makeSaddleCurve(-Math.PI / 2)], [])
  const show = (axis: 'x' | 'y' | 'z') => selected === 'all' || selected === axis

  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.13, 1.13, 3.95, 72, 1, true]} />
        <meshStandardMaterial color="#91a1b4" transparent opacity={selected === 'all' || selected === 'x' || selected === 'y' || selected === 'z' ? 0.055 : 0.018} roughness={0.3} metalness={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, -1.98]}><torusGeometry args={[1.13, 0.024, 12, 96]} /><meshStandardMaterial color="#77889c" transparent opacity={0.38} /></mesh>
      <mesh position={[0, 0, 1.98]}><torusGeometry args={[1.13, 0.024, 12, 96]} /><meshStandardMaterial color="#77889c" transparent opacity={0.38} /></mesh>

      {xCurves.map((curve, index) => <CoilTube key={`x-${index}`} curve={curve} color="#36c9e8" emphasized={show('x')} />)}
      {yCurves.map((curve, index) => <CoilTube key={`y-${index}`} curve={curve} color="#a98cff" emphasized={show('y')} />)}
      {[-1.58, -1.34, 1.34, 1.58].map((z) => (
        <mesh key={z} position={[0, 0, z]}>
          <torusGeometry args={[1.025, 0.03, 12, 96]} />
          <meshStandardMaterial color="#f1b86a" emissive="#f1b86a" emissiveIntensity={show('z') ? 0.3 : 0.03} transparent opacity={show('z') ? 0.9 : 0.12} roughness={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function MainMagnet({ selected }: { selected: HardwareView }) {
  const emphasized = selected === 'all' || selected === 'magnet'
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      {[-1.3, -0.44, 0.44, 1.3].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh>
            <torusGeometry args={[1.34, 0.105, 18, 128, Math.PI * 1.5]} />
            <meshStandardMaterial color="#345a70" emissive="#1b6c8b" emissiveIntensity={emphasized ? 0.16 : 0.01} transparent opacity={emphasized ? 0.9 : 0.08} roughness={0.38} depthWrite={false} />
          </mesh>
          <mesh position={[1.34, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.106, 32]} />
            <meshStandardMaterial color="#345a70" emissive="#1b6c8b" emissiveIntensity={emphasized ? 0.16 : 0.01} transparent opacity={emphasized ? 1 : 0.08} roughness={0.38} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -1.34, 0]} rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[0.106, 32]} />
            <meshStandardMaterial color="#345a70" emissive="#1b6c8b" emissiveIntensity={emphasized ? 0.16 : 0.01} transparent opacity={emphasized ? 1 : 0.08} roughness={0.38} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function RfCoil({ selected }: { selected: HardwareView }) {
  const emphasized = selected === 'all' || selected === 'rf'
  const railAngles = useMemo(() => Array.from({ length: 8 }, (_, index) => Math.PI / 2 + (index * Math.PI * 1.5) / 7), [])
  return (
    <group>
      <group rotation={[0, 0, Math.PI / 2]}>
        {[-1.5, 1.5].map((z) => <mesh key={z} position={[0, 0, z]}><torusGeometry args={[0.79, 0.035, 12, 112, Math.PI * 1.5]} /><meshStandardMaterial color="#f3d060" emissive="#e99b35" emissiveIntensity={emphasized ? 0.34 : 0.02} transparent opacity={emphasized ? 0.94 : 0.08} roughness={0.32} depthWrite={false} /></mesh>)}
      </group>
      {railAngles.map((angle) => (
        <mesh key={angle} position={[Math.cos(angle) * 0.79, Math.sin(angle) * 0.79, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.024, 0.024, 3, 10]} />
          <meshStandardMaterial color="#f3d060" emissive="#e99b35" emissiveIntensity={emphasized ? 0.34 : 0.02} transparent opacity={emphasized ? 0.94 : 0.08} roughness={0.32} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function ReceiveArray({ selected }: { selected: HardwareView }) {
  const emphasized = selected === 'all' || selected === 'receive'
  return (
    <group>
      {[-0.72, -0.24, 0.24, 0.72].map((z) => (
        <mesh key={z} position={[0, -0.02, z]}>
          <torusGeometry args={[0.5, 0.018, 10, 80]} />
          <meshStandardMaterial color="#74d79b" emissive="#28995a" emissiveIntensity={emphasized ? 0.32 : 0.02} transparent opacity={emphasized ? 0.94 : 0.07} roughness={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function ScannerHousing() {
  const innerRadius = 0.91
  const outerRadius = 1.73
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      {[-1.9, 1.9].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh>
            <ringGeometry args={[innerRadius, outerRadius, 96, 1, 0, Math.PI * 1.5]} />
            <meshStandardMaterial color="#c4d0d5" roughness={0.5} metalness={0.04} side={THREE.DoubleSide} />
          </mesh>
          <mesh>
            <torusGeometry args={[1.62, 0.13, 18, 128, Math.PI * 1.5]} />
            <meshStandardMaterial color="#c7d3d8" roughness={0.46} metalness={0.06} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function GradientScene({ selected }: { selected: HardwareView }) {
  return (
    <>
      <ambientLight intensity={1.35} color="#e9f8ff" />
      <hemisphereLight args={['#ffffff', '#344257', 1.2]} />
      <directionalLight position={[4, 5, 5]} intensity={2.8} color="#ffffff" />
      <pointLight position={[-3, 1.5, 2]} intensity={5} distance={8} color="#78dff3" />
      <Suspense fallback={null}>
        <ScannerHousing />
        <MainMagnet selected={selected} />
        <RfCoil selected={selected} />
        <ReceiveArray selected={selected} />
        <GradientPatient />
        <GradientAssembly selected={selected} />
        <RoundedBox args={[0.58, 0.1, 4.5]} radius={0.025} smoothness={4} position={[0, -0.3, 0]}>
          <meshStandardMaterial color="#c6d6dc" roughness={0.58} />
        </RoundedBox>
      </Suspense>
      <OrbitControls makeDefault target={[0, -0.02, 0]} enablePan={false} minDistance={5.2} maxDistance={8.2} minPolarAngle={0.68} maxPolarAngle={1.72} />
    </>
  )
}

const gradientLabels: Record<HardwareView, string> = {
  all: 'The main magnet, gradient insert, transmit RF coil, and local receive array are nested around the patient.',
  magnet: 'The superconducting main magnet establishes the strong, static B₀ field through the bore.',
  rf: 'The body RF coil transmits the B₁ excitation field into the patient.',
  receive: 'A local receive array sits close to the patient so that each element records its own complex voltage signal.',
  x: 'Gx uses opposing saddle-coil sets to vary B₀ from left to right.',
  y: 'Gy uses a rotated saddle-coil set to vary B₀ from posterior to anterior.',
  z: 'Gz uses paired circular windings to vary B₀ along the bore.',
}

export function MriGradientHardware3d() {
  const [selected, setSelected] = useState<HardwareView>('all')

  return (
    <div className="mri-gradient-hardware">
      <div className="mri-gradient-switch" role="group" aria-label="MRI scanner hardware layer">
        {(['all', 'magnet', 'rf', 'receive', 'x', 'y', 'z'] as const).map((layer) => <button key={layer} type="button" aria-pressed={selected === layer} onClick={() => setSelected(layer)}>{layer === 'all' ? 'All' : layer === 'magnet' ? 'Magnet' : layer === 'rf' ? 'Tx RF' : layer === 'receive' ? 'Rx' : `G${layer}`}</button>)}
      </div>
      <div className="mri-gradient-canvas" role="img" aria-label="Interactive three-dimensional MRI cutaway showing the main magnet, radiofrequency coil, gradient coils, patient, and table">
        <Canvas dpr={[1, 1.5]} camera={{ position: [5.6, 3.75, 6.45], fov: 35, near: 0.05, far: 30 }} frameloop="demand" gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} aria-hidden="true">
          <GradientScene selected={selected} />
        </Canvas>
        <div className="mri-gradient-legend" aria-hidden="true"><span className="is-magnet">Main magnet</span><span className="is-rf">Tx RF</span><span className="is-receive">Rx array</span><span className="is-x">Gx</span><span className="is-y">Gy</span><span className="is-z">Gz</span></div>
        <small>Drag to orbit · Scroll to zoom</small>
      </div>
      <p>{gradientLabels[selected]}</p>
    </div>
  )
}

useGLTF.preload(anatomyUrl('anatomy-body.glb'))
useGLTF.preload(anatomyUrl('anatomy-skeleton.glb'))
useGLTF.preload(anatomyUrl('anatomy-organs.glb'))
