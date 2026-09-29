import { Canvas } from '@react-three/fiber'
import { Billboard, ContactShadows, Line, OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

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

function TeachingAnatomy() {
  const bodySource = useGLTF(`${import.meta.env.BASE_URL}models/anatomy-body.glb`).scene
  const skeletonSource = useGLTF(`${import.meta.env.BASE_URL}models/anatomy-skeleton.glb`).scene
  const organsSource = useGLTF(`${import.meta.env.BASE_URL}models/anatomy-organs.glb`).scene

  const bodyMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#76b8cf',
    roughness: 0.34,
    clearcoat: 0.18,
    transmission: 0.16,
    thickness: 0.25,
    ior: 1.36,
    transparent: true,
    opacity: 0.27,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const skeletonMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#eadfca',
    roughness: 0.5,
    metalness: 0.02,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  }), [])
  const organMaterials = useMemo<Record<OrganSystem, THREE.MeshPhysicalMaterial>>(() => {
    const makeMaterial = (color: string, opacity: number) => new THREE.MeshPhysicalMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.08,
      roughness: 0.48,
      clearcoat: 0.1,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    return {
      respiratory: makeMaterial('#b96f6f', 0.34),
      digestive: makeMaterial('#bc875e', 0.3),
      renal: makeMaterial('#9675a6', 0.44),
      heart: makeMaterial('#d05262', 0.58),
    }
  }, [])

  const body = useMemo(() => {
    const clone = bodySource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = bodyMaterial
      child.castShadow = true
      child.receiveShadow = true
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
      child.castShadow = true
      child.renderOrder = 4
    })
    return clone
  }, [skeletonMaterial, skeletonSource])
  const organs = useMemo(() => {
    const clone = organsSource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = organMaterials[getOrganSystem(child)]
      child.castShadow = true
      child.renderOrder = 3
    })
    return clone
  }, [organMaterials, organsSource])

  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial])
  useEffect(() => () => skeletonMaterial.dispose(), [skeletonMaterial])
  useEffect(() => () => Object.values(organMaterials).forEach((material) => material.dispose()), [organMaterials])

  return (
    <group position={[0, -2.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={2.55}>
      <primitive object={body} />
      <primitive object={organs} />
      <primitive object={skeleton} />
    </group>
  )
}

function TeachingPlane({ color, position, rotation, size }: { color: string; position: [number, number, number]; rotation: [number, number, number]; size: [number, number] }) {
  const [width, height] = size
  const x = width / 2
  const y = height / 2
  const outline: Array<[number, number, number]> = [[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0], [-x, -y, 0]]

  return (
    <group position={position} rotation={rotation}>
      <mesh renderOrder={1}>
        <planeGeometry args={size} />
        <meshBasicMaterial color={color} transparent opacity={0.17} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Line points={outline} color={color} lineWidth={1.2} transparent opacity={0.82} depthTest={false} renderOrder={6} />
    </group>
  )
}

type CoordinateConvention = 'LPS' | 'RAS'

function OrientationLabel({ position, anatomical, coordinate, axis }: { position: [number, number, number]; anatomical: string; coordinate: string; axis: 'lr' | 'ap' | 'si' }) {
  const color = axis === 'lr' ? '#74c8ff' : axis === 'ap' ? '#d9a0ff' : '#ffd178'
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 88
    const context = canvas.getContext('2d')
    if (context) {
      context.beginPath()
      context.roundRect(4, 4, 232, 80, 16)
      context.fillStyle = 'rgba(8, 22, 28, 0.88)'
      context.fill()
      context.lineWidth = 4
      context.strokeStyle = color
      context.stroke()
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = '700 34px -apple-system, BlinkMacSystemFont, sans-serif'
      context.fillStyle = color
      context.fillText(anatomical, 85, 45)
      context.font = '600 28px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillStyle = 'rgba(239, 249, 252, 0.76)'
      context.fillText(coordinate, 153, 45)
    }
    const labelTexture = new THREE.CanvasTexture(canvas)
    labelTexture.colorSpace = THREE.SRGBColorSpace
    labelTexture.minFilter = THREE.LinearFilter
    return labelTexture
  }, [anatomical, color, coordinate])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <Billboard position={position} follow>
      <mesh renderOrder={10}>
        <planeGeometry args={[0.76, 0.279]} />
        <meshBasicMaterial map={texture} transparent depthTest={true} depthWrite={false} toneMapped={false} />
      </mesh>
    </Billboard>
  )
}

function LabelOcclusionVolume() {
  return (
    <mesh position={[0, 0.25, 0]} scale={[0.48, 0.52, 0.34]} renderOrder={9}>
      <sphereGeometry args={[1, 36, 24]} />
      <meshBasicMaterial transparent opacity={1} colorWrite={false} depthTest={true} depthWrite={true} />
    </mesh>
  )
}

function AnatomicalOrientationCompass({ convention }: { convention: CoordinateConvention }) {
  const labels = convention === 'LPS'
    ? { left: '+X', right: '−X', anterior: '−Y', posterior: '+Y' }
    : { left: '−X', right: '+X', anterior: '+Y', posterior: '−Y' }

  return (
    <group position={[0, 0.25, 0]}>
      <Line points={[[-0.96, 0, 0], [0.96, 0, 0]]} color="#74c8ff" lineWidth={2.25} depthTest={false} renderOrder={8} />
      <Line points={[[0, -0.96, 0], [0, 0.96, 0]]} color="#ffd178" lineWidth={2.25} depthTest={false} renderOrder={8} />
      <Line points={[[0, 0, -0.96], [0, 0, 0.96]]} color="#d9a0ff" lineWidth={2.25} depthTest={false} renderOrder={8} />
      <mesh renderOrder={9}><sphereGeometry args={[0.055, 20, 16]} /><meshBasicMaterial color="#f2fbff" depthTest={false} /></mesh>
      <OrientationLabel position={[1.18, 0, 0]} anatomical="L" coordinate={labels.left} axis="lr" />
      <OrientationLabel position={[-1.18, 0, 0]} anatomical="R" coordinate={labels.right} axis="lr" />
      <OrientationLabel position={[0, 1.18, 0]} anatomical="S" coordinate="+Z" axis="si" />
      <OrientationLabel position={[0, -1.18, 0]} anatomical="I" coordinate="−Z" axis="si" />
      <OrientationLabel position={[0, 0, 1.18]} anatomical="A" coordinate={labels.anterior} axis="ap" />
      <OrientationLabel position={[0, 0, -1.18]} anatomical="P" coordinate={labels.posterior} axis="ap" />
    </group>
  )
}

function SceneContents({ convention }: { convention: CoordinateConvention }) {
  return (
    <>
      <ambientLight intensity={0.72} color="#c8e5ec" />
      <hemisphereLight args={['#effcff', '#24363e', 1.35]} />
      <directionalLight position={[3.8, 6, 5]} intensity={2.6} color="#f4fbff" castShadow />
      <pointLight position={[-4, 1.7, 3.5]} intensity={6} distance={10} decay={2} color="#68d7ef" />
      <pointLight position={[4, 1.2, 2.5]} intensity={3.5} distance={9} decay={2} color="#ffc48e" />

      <TeachingPlane color="#4fb4ff" position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]} size={[3.4, 2.1]} />
      <TeachingPlane color="#ffad45" position={[0, 0.15, -0.04]} rotation={[0, 0, 0]} size={[3.1, 4.3]} />
      <TeachingPlane color="#c77dff" position={[0, 0.15, 0]} rotation={[0, Math.PI / 2, 0]} size={[2.1, 4.3]} />

      <Suspense fallback={null}><TeachingAnatomy /></Suspense>
      <LabelOcclusionVolume />
      <AnatomicalOrientationCompass convention={convention} />
      <ContactShadows position={[0, -2.04, 0]} opacity={0.34} scale={5.5} blur={2.8} far={3.5} frames={1} resolution={512} color="#071015" />
      <OrbitControls makeDefault target={[0, 0.12, 0]} enablePan={false} minDistance={5.2} maxDistance={10} minPolarAngle={0.3} maxPolarAngle={1.72} />
    </>
  )
}

export default function AnatomicalPlanesScene() {
  const [convention, setConvention] = useState<CoordinateConvention>('LPS')

  return (
    <div className="anatomical-planes-viewport" role="region" aria-label={`Interactive three-dimensional anatomical model intersected by axial, coronal, and sagittal planes, with patient orientation labelled in ${convention} coordinates. Drag to orbit the model.`}>
      <div className="anatomical-planes-legend" aria-hidden="true">
        <span className="is-axial"><i />Axial</span>
        <span className="is-coronal"><i />Coronal</span>
        <span className="is-sagittal"><i />Sagittal</span>
      </div>
      <div className="anatomical-coordinate-toggle" role="group" aria-label="Coordinate convention shown on the anatomical model">
        {(['LPS', 'RAS'] as const).map((option) => <button key={option} type="button" className={convention === option ? 'is-selected' : undefined} aria-pressed={convention === option} onClick={() => setConvention(option)}>{option}</button>)}
      </div>
      <span className="sr-only">{convention === 'LPS' ? 'LPS orientation: left is positive X, posterior is positive Y, and superior is positive Z.' : 'RAS orientation: right is positive X, anterior is positive Y, and superior is positive Z.'}</span>
      <span className="anatomical-planes-instruction" aria-hidden="true">Drag to orbit</span>
      <Canvas
        dpr={[1, 1.55]}
        camera={{ position: [4.7, 1.8, 6.5], fov: 34, near: 0.1, far: 50 }}
        shadows
        frameloop="demand"
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.08
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.shadowMap.type = THREE.PCFSoftShadowMap
        }}
        aria-hidden="true"
      >
        <SceneContents convention={convention} />
      </Canvas>
    </div>
  )
}
