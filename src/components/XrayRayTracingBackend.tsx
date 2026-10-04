import { useFrame } from '@react-three/fiber'
import { Pathtracer, usePathtracer } from '@react-three/gpu-pathtracer'
import { useEffect, useRef } from 'react'
import type { ComponentRef, RefObject } from 'react'
import * as THREE from 'three'
import { DenoiseMaterial } from 'three-gpu-pathtracer'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import type { RtBackend } from '../rendering/rtBackend'

const RT_MIN_SAMPLES = 8
const RT_MAX_SAMPLES = 256

function PathTracingSynchronizer({ geometryVersion, materialVersion, statusRef, backend, onComplete }: { geometryVersion: string; materialVersion: string; statusRef: RefObject<HTMLDivElement | null>; backend: RtBackend; onComplete: () => void }) {
  const { pathtracer, update } = usePathtracer()
  const initialGeometry = useRef(true)
  const previousCamera = useRef(new THREE.Matrix4())
  const nextStatusUpdate = useRef(0)
  const completed = useRef(false)

  useEffect(() => {
    completed.current = false
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
    completed.current = false
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
      if (samples >= RT_MAX_SAMPLES && !completed.current) {
        completed.current = true
        onComplete()
      }
    }
  }, 0)

  return null
}

function WebGlRayTracingRenderer({ geometryVersion, materialVersion, statusRef, onComplete }: { geometryVersion: string; materialVersion: string; statusRef: RefObject<HTMLDivElement | null>; onComplete: () => void }) {
  const tracer = useRef<ComponentRef<typeof Pathtracer>>(null)

  useEffect(() => {
    const pathtracer = tracer.current
    if (!pathtracer) return
    pathtracer.multipleImportanceSampling = true
    pathtracer.transmissiveBounces = 3
    pathtracer.filterGlossyFactor = 1.25

    const denoiseMaterial = new DenoiseMaterial({ sigma: 1.25, kSigma: 1, threshold: 10 })
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
    <Pathtracer ref={tracer} samples={RT_MAX_SAMPLES} minSamples={RT_MIN_SAMPLES} bounces={4} tiles={[1, 1]} resolutionFactor={0.48} renderDelay={120} fadeDuration={1800} dynamicLowRes={false} rasterizeScene>
      <PathTracingSynchronizer geometryVersion={geometryVersion} materialVersion={materialVersion} statusRef={statusRef} backend="webgl2" onComplete={onComplete} />
    </Pathtracer>
  )
}

export default function XrayRayTracingBackend({ backend, geometryVersion, materialVersion, statusRef, onComplete }: { backend: RtBackend; geometryVersion: string; materialVersion: string; statusRef: RefObject<HTMLDivElement | null>; onComplete: () => void }) {
  if (backend !== 'webgl2') return null
  return <WebGlRayTracingRenderer geometryVersion={geometryVersion} materialVersion={materialVersion} statusRef={statusRef} onComplete={onComplete} />
}
