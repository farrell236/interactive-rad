import { Canvas, useThree } from '@react-three/fiber'
import { Edges, Line, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import volumeMetadata from '../assets/ct/lidc-idri-0001-chest-volume.json'

const MODEL_PATHS = {
  body: `${import.meta.env.BASE_URL}models/anatomy-body.glb`,
  skeleton: `${import.meta.env.BASE_URL}models/anatomy-skeleton.glb`,
  organs: `${import.meta.env.BASE_URL}models/anatomy-organs.glb`,
} as const

function writeWindowedPixel(data: Uint8Array, output: number, hu: number) {
  const center = -420
  const width = 1450
  const low = center - (width / 2)
  const normalized = Math.max(0, Math.min(1, (hu - low) / width))
  const gray = Math.round(normalized * 255)
  data[output] = Math.round(gray * 0.9)
  data[output + 1] = Math.round(gray * 0.98)
  data[output + 2] = gray
  data[output + 3] = 255
}

function makeTexture(outputWidth: number, outputHeight: number, sample: (column: number, row: number) => number) {
  const data = new Uint8Array(outputWidth * outputHeight * 4)
  for (let row = 0; row < outputHeight; row += 1) {
    for (let column = 0; column < outputWidth; column += 1) {
      writeWindowedPixel(data, ((row * outputWidth) + column) * 4, sample(column, row))
    }
  }
  const texture = new THREE.DataTexture(data, outputWidth, outputHeight, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function ImageDataCube({ volume }: { volume: Int16Array | null }) {
  const { width, height, depth } = volumeMetadata
  const textures = useMemo(() => {
    const pixelsPerSlice = width * height
    const axialSlice = 56
    const coronalRow = Math.round(height * 0.52)
    const sagittalColumn = Math.round(width * 0.5)
    const voxel = (x: number, y: number, z: number) => volume?.[(z * pixelsPerSlice) + (y * width) + x] ?? -1024

    return {
      axial: makeTexture(width, height, (x, y) => voxel(x, y, axialSlice)),
      coronal: makeTexture(width, depth, (x, row) => voxel(x, coronalRow, depth - 1 - row)),
      sagittal: makeTexture(height, depth, (y, row) => voxel(sagittalColumn, y, depth - 1 - row)),
    }
  }, [depth, height, volume, width])

  const materials = useMemo(() => {
    const imageMaterial = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, toneMapped: false })
    const hiddenMaterial = () => new THREE.MeshStandardMaterial({ color: '#16362d', roughness: 0.62, metalness: 0.04 })
    return [
      imageMaterial(textures.sagittal),
      hiddenMaterial(),
      imageMaterial(textures.axial),
      hiddenMaterial(),
      imageMaterial(textures.coronal),
      hiddenMaterial(),
    ]
  }, [textures])

  useEffect(() => () => {
    Object.values(textures).forEach((texture) => texture.dispose())
    materials.forEach((material) => material.dispose())
  }, [materials, textures])

  const halfExtent = 0.76
  const voxelDivisions = 6
  const voxelLines = Array.from({ length: voxelDivisions - 1 }, (_, index) => -halfExtent + ((index + 1) * ((halfExtent * 2) / voxelDivisions)))

  return (
    <group>
      <mesh material={materials}>
        <boxGeometry args={[halfExtent * 2, halfExtent * 2, halfExtent * 2]} />
        <Edges color="#8df0b4" threshold={12} />
      </mesh>
      {voxelLines.map((offset) => (
        <group key={offset}>
          <Line points={[[-halfExtent, halfExtent + 0.006, offset], [halfExtent, halfExtent + 0.006, offset]]} color="#8df0b4" transparent opacity={0.42} lineWidth={1} />
          <Line points={[[offset, halfExtent + 0.006, -halfExtent], [offset, halfExtent + 0.006, halfExtent]]} color="#8df0b4" transparent opacity={0.42} lineWidth={1} />
          <Line points={[[-halfExtent, offset, halfExtent + 0.006], [halfExtent, offset, halfExtent + 0.006]]} color="#8df0b4" transparent opacity={0.42} lineWidth={1} />
          <Line points={[[offset, -halfExtent, halfExtent + 0.006], [offset, halfExtent, halfExtent + 0.006]]} color="#8df0b4" transparent opacity={0.42} lineWidth={1} />
          <Line points={[[halfExtent + 0.006, -halfExtent, offset], [halfExtent + 0.006, halfExtent, offset]]} color="#8df0b4" transparent opacity={0.42} lineWidth={1} />
          <Line points={[[halfExtent + 0.006, offset, -halfExtent], [halfExtent + 0.006, offset, halfExtent]]} color="#8df0b4" transparent opacity={0.42} lineWidth={1} />
        </group>
      ))}
    </group>
  )
}

function CroppedAnatomy() {
  const bodySource = useGLTF(MODEL_PATHS.body).scene
  const skeletonSource = useGLTF(MODEL_PATHS.skeleton).scene
  const organsSource = useGLTF(MODEL_PATHS.organs).scene

  const clippingPlanes = useMemo(() => [
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.04),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.58),
  ], [])
  const bodyMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#71c998',
    roughness: 0.38,
    clearcoat: 0.14,
    transmission: 0.18,
    thickness: 0.24,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
    clippingPlanes,
  }), [clippingPlanes])
  const skeletonMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f2e8d4',
    roughness: 0.56,
    transparent: true,
    opacity: 0.94,
    clippingPlanes,
  }), [clippingPlanes])
  const organMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#b66f70',
    emissive: '#733942',
    emissiveIntensity: 0.08,
    roughness: 0.52,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    side: THREE.DoubleSide,
    clippingPlanes,
  }), [clippingPlanes])

  const body = useMemo(() => {
    const clone = bodySource.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Line) child.visible = false
      if (!(child instanceof THREE.Mesh)) return
      child.material = bodyMaterial
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
      child.renderOrder = 2
    })
    return clone
  }, [organMaterial, organsSource])

  useEffect(() => () => {
    bodyMaterial.dispose()
    skeletonMaterial.dispose()
    organMaterial.dispose()
  }, [bodyMaterial, organMaterial, skeletonMaterial])

  return (
    <group>
      <group position={[0, -2.02, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={2.5}>
        <primitive object={body} />
        <primitive object={organs} />
        <primitive object={skeleton} />
      </group>
      <mesh position={[0, 0.77, 0]}>
        <boxGeometry args={[1.68, 1.62, 0.92]} />
        <meshBasicMaterial color="#8df0b4" transparent opacity={0.1} wireframe />
      </mesh>
    </group>
  )
}

function PatientSpaceGrid() {
  const origin: [number, number, number] = [0, -0.4, 0]
  return (
    <group>
      <gridHelper args={[3.4, 10, '#78dba0', '#355f4a']} position={origin} />
      <Line points={[origin, [1.72, -0.4, 0]]} color="#c7f8d9" lineWidth={2} />
      <Line points={[origin, [0, 1.95, 0]]} color="#c7f8d9" lineWidth={2} />
      <Line points={[[0, -0.4, -1.42], [0, -0.4, 1.42]]} color="#c7f8d9" lineWidth={2} />
      <mesh position={[1.79, -0.4, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.055, 0.16, 12]} /><meshBasicMaterial color="#c7f8d9" /></mesh>
      <mesh position={[0, 2.03, 0]}><coneGeometry args={[0.055, 0.16, 12]} /><meshBasicMaterial color="#c7f8d9" /></mesh>
      <mesh position={[0, -0.4, 1.5]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.055, 0.16, 12]} /><meshBasicMaterial color="#c7f8d9" /></mesh>
    </group>
  )
}

function VoxelCubeScene({ volume }: { volume: Int16Array | null }) {
  return (
    <Canvas
      dpr={[1, 1.45]}
      orthographic
      camera={{ position: [3.4, 3.1, 5.2], zoom: 112, near: 0.1, far: 30 }}
      frameloop="demand"
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ camera, gl }) => {
        gl.setClearColor(0x000000, 0)
        gl.outputColorSpace = THREE.SRGBColorSpace
        camera.lookAt(0, 0, 0)
      }}
      aria-hidden="true"
    >
      <ambientLight intensity={1.25} color="#e1fff0" />
      <ImageDataCube volume={volume} />
    </Canvas>
  )
}

function ResponsiveAnatomyCamera() {
  const { camera, size } = useThree()

  useEffect(() => {
    const compact = size.width < 280
    if (compact) camera.position.set(2.35, 2.2, 4.65)
    else camera.position.set(3.15, 2.8, 6.4)
    camera.lookAt(0, compact ? 0.82 : 0.62, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.width])

  return null
}

function AnatomyScene() {
  return (
    <Canvas
      dpr={[1, 1.45]}
      camera={{ position: [3.15, 2.8, 6.4], fov: 31, near: 0.1, far: 30 }}
      frameloop="demand"
      gl={{ alpha: true, antialias: true, localClippingEnabled: true, powerPreference: 'high-performance' }}
      onCreated={({ camera, gl }) => {
        gl.setClearColor(0x000000, 0)
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.localClippingEnabled = true
        camera.lookAt(0, 0.62, 0)
      }}
      aria-hidden="true"
    >
      <ambientLight intensity={1.25} color="#e1fff0" />
      <hemisphereLight args={['#f1fff7', '#1a3328', 1.55]} />
      <directionalLight position={[4, 6, 6]} intensity={2.5} color="#f7fffa" />
      <pointLight position={[-3, 1.8, 4]} intensity={5} distance={12} color="#7ce3a5" />
      <ResponsiveAnatomyCamera />
      <PatientSpaceGrid />
      <Suspense fallback={null}><CroppedAnatomy /></Suspense>
    </Canvas>
  )
}

export default function LandingImageData3d({ volume }: { volume: Int16Array | null }) {
  return (
    <div className="landing-image-data-scenes">
      <div className="landing-image-data-scene is-voxel"><VoxelCubeScene volume={volume} /></div>
      <div className="landing-image-data-scene is-anatomy"><AnatomyScene /></div>
    </div>
  )
}

Object.values(MODEL_PATHS).forEach((path) => useGLTF.preload(path))
