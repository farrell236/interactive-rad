import { Canvas } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'

function LandingAnatomy() {
  const bodySource = useGLTF(`${import.meta.env.BASE_URL}models/anatomy-body.glb`).scene
  const skeletonSource = useGLTF(`${import.meta.env.BASE_URL}models/anatomy-skeleton.glb`).scene
  const organsSource = useGLTF(`${import.meta.env.BASE_URL}models/anatomy-organs.glb`).scene

  const bodyMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#78b9cb',
    roughness: 0.36,
    clearcoat: 0.16,
    transmission: 0.2,
    thickness: 0.28,
    ior: 1.36,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const skeletonMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#efe4cf',
    roughness: 0.54,
    transparent: true,
    opacity: 0.92,
  }), [])
  const organMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#b96f70',
    emissive: '#7d3944',
    emissiveIntensity: 0.08,
    roughness: 0.5,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])

  const body = useMemo(() => {
    const clone = bodySource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (child instanceof THREE.Mesh) {
        child.material = bodyMaterial
        child.renderOrder = 1
      }
    })
    return clone
  }, [bodyMaterial, bodySource])
  const skeleton = useMemo(() => {
    const clone = skeletonSource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (child instanceof THREE.Mesh) {
        child.material = skeletonMaterial
        child.renderOrder = 3
      }
    })
    return clone
  }, [skeletonMaterial, skeletonSource])
  const organs = useMemo(() => {
    const clone = organsSource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (child instanceof THREE.Mesh) {
        child.material = organMaterial
        child.renderOrder = 2
      }
    })
    return clone
  }, [organMaterial, organsSource])

  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial])
  useEffect(() => () => skeletonMaterial.dispose(), [skeletonMaterial])
  useEffect(() => () => organMaterial.dispose(), [organMaterial])

  return (
    <group position={[0, -2.02, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={2.5}>
      <primitive object={body} />
      <primitive object={organs} />
      <primitive object={skeleton} />
    </group>
  )
}

export default function LandingXrayPatient3d() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.62, 7.4], fov: 31, near: 0.1, far: 30 }}
      frameloop="demand"
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(0x000000, 0)
        gl.outputColorSpace = THREE.SRGBColorSpace
        camera.lookAt(0, 0.62, 0)
      }}
      aria-hidden="true"
    >
      <ambientLight intensity={1.1} color="#dff9ff" />
      <hemisphereLight args={['#f5ffff', '#26363d', 1.3]} />
      <directionalLight position={[3, 5, 5]} intensity={2.1} color="#f6ffff" />
      <pointLight position={[-3, 1, 4]} intensity={6} distance={12} color="#66d9ee" />
      <Suspense fallback={null}><LandingAnatomy /></Suspense>
    </Canvas>
  )
}
