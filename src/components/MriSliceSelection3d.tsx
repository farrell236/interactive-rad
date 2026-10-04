import { Canvas } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'
import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mriVolumeSliceUrl } from '../lib/mriVolume'

const slicePositions = Array.from({ length: 31 }, (_, index) => -60 + index * 5)
const contextTextureIndexes = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30]
const contextTextureUrls = contextTextureIndexes.map((index) => mriVolumeSliceUrl(slicePositions[index]))

function BrainSlicePlanes({ thicknessMm, slicePositionMm }: { thicknessMm: number; slicePositionMm: number }) {
  const contextSourceTextures = useTexture(contextTextureUrls)
  const selectedTextureIndex = Math.round((slicePositionMm + 60) / 5)
  const selectedSourceTexture = useTexture(mriVolumeSliceUrl(slicePositions[selectedTextureIndex]))
  const contextTextures = useMemo(() => {
    return contextSourceTextures.map((sourceTexture) => {
      const clone = sourceTexture.clone()
      clone.colorSpace = THREE.SRGBColorSpace
      clone.anisotropy = 8
      clone.needsUpdate = true
      return clone
    })
  }, [contextSourceTextures])
  const selectedTexture = useMemo(() => {
    const clone = selectedSourceTexture.clone()
    clone.colorSpace = THREE.SRGBColorSpace
    clone.anisotropy = 8
    clone.needsUpdate = true
    return clone
  }, [selectedSourceTexture])
  const slabHeight = THREE.MathUtils.clamp(thicknessMm * 0.025, 0.012, 0.32)
  const slabCenterY = (slicePositionMm - 15) / 75 * 0.82

  useEffect(() => () => contextTextures.forEach((item) => item.dispose()), [contextTextures])
  useEffect(() => () => selectedTexture.dispose(), [selectedTexture])

  return (
    <group rotation={[0, -0.08, 0]}>
      <mesh scale={[1.32, 1.03, 1.18]}>
        <sphereGeometry args={[1, 64, 40]} />
        <meshBasicMaterial color="#8c7be8" transparent opacity={0.035} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {contextTextureIndexes.map((textureIndex, contextIndex) => {
        const positionMm = slicePositions[textureIndex]
        const y = (positionMm - 15) / 75 * 0.82
        return <mesh key={textureIndex} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.22, 1, 1]} renderOrder={textureIndex}>
          <circleGeometry args={[1, 96]} />
          <meshBasicMaterial
            map={contextTextures[contextIndex]}
            color="#b9c4e8"
            transparent
            opacity={0.14}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      })}

      <mesh position={[0, slabCenterY, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.22, 1, 1]} renderOrder={40}>
        <circleGeometry args={[1, 96]} />
        <meshBasicMaterial map={selectedTexture} color="#ffffff" transparent opacity={0.98} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      <mesh position={[0, slabCenterY, 0]}>
        <cylinderGeometry args={[1.24, 1.24, slabHeight, 96, 1, true]} />
        <meshBasicMaterial color="#9b7cff" transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {[-slabHeight / 2, slabHeight / 2].map((y) => (
        <mesh key={y} position={[0, slabCenterY + y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.18, 1.25, 96]} />
          <meshBasicMaterial color="#b59fff" transparent opacity={0.92} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}

      <mesh position={[1.55, 0.04, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 2.45, 12]} />
        <meshBasicMaterial color="#9b7cff" toneMapped={false} />
      </mesh>
      <mesh position={[1.55, 1.29, 0]}>
        <coneGeometry args={[0.065, 0.18, 18]} />
        <meshBasicMaterial color="#9b7cff" toneMapped={false} />
      </mesh>
      {[0.62, -0.62].map((y) => (
        <mesh key={y} position={[1.55, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.09, 0.011, 8, 36]} />
          <meshBasicMaterial color="#a994ff" transparent opacity={0.68} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function SliceSelectionScene({ thicknessMm, slicePositionMm }: { thicknessMm: number; slicePositionMm: number }) {
  return (
    <>
      <ambientLight intensity={1.2} />
      <Suspense fallback={null}><BrainSlicePlanes thicknessMm={thicknessMm} slicePositionMm={slicePositionMm} /></Suspense>
      <OrbitControls makeDefault target={[0, 0, 0]} enablePan={false} enableZoom={false} minPolarAngle={0.62} maxPolarAngle={1.38} minAzimuthAngle={-1.25} maxAzimuthAngle={1.25} />
    </>
  )
}

export function MriSliceSelection3d({ thicknessMm, slicePositionMm }: { thicknessMm: number; slicePositionMm: number }) {
  return (
    <div className="mri-slice-selection-3d" role="img" aria-label={`Three-dimensional axial brain volume with a selected slice centered at z ${slicePositionMm} millimeters and ${thicknessMm.toFixed(1)} millimeters thick`}>
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        camera={{ position: [3.55, 2.85, 4.15], fov: 33, near: 0.05, far: 20 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        aria-hidden="true"
      >
        <SliceSelectionScene thicknessMm={thicknessMm} slicePositionMm={slicePositionMm} />
      </Canvas>
      <div className="mri-slice-selection-3d-axis" aria-hidden="true"><b>Gz</b><span>resonance frequency increases</span></div>
      <small>Drag to inspect the selected plane</small>
    </div>
  )
}
