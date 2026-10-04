import { Bloom, DepthOfField, EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'
import type { CameraPreset } from '../types'

const FOCUS_BY_CAMERA: Record<CameraPreset, { distance: number; range: number }> = {
  Room: { distance: 12.5, range: 7 },
  Beam: { distance: 9.4, range: 5 },
  Patient: { distance: 6.2, range: 3.8 },
  Detector: { distance: 8.2, range: 4.8 },
}

export default function XrayHighQualityEffects({ cameraPreset }: { cameraPreset: CameraPreset }) {
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
