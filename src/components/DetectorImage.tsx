import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { ScanLine } from 'lucide-react'
import { useId } from 'react'
import * as THREE from 'three'
import { deriveXrayState, getProjectionCameraGeometry, getProjectionGeometry } from '../simulation/xray'
import type { ExposurePhase, XraySettings } from '../types'
import { AnatomyPatient } from './XrayScene'

const phaseLabels: Record<ExposurePhase, string> = { ready: 'Ready', charging: 'Charging', emitting: 'Exposing', captured: 'Captured' }

function ProjectionCamera({ sourceX, verticalFov }: { sourceX: number; verticalFov: number }) {
  return <PerspectiveCamera makeDefault position={[sourceX, 0.65, 0]} rotation={[0, -Math.PI / 2, 0]} fov={verticalFov} near={0.05} far={30} />
}

function ModelProjection({ settings, bodyOpacity, boneOpacity, organOpacity }: { settings: XraySettings; bodyOpacity: number; boneOpacity: number; organOpacity: number }) {
  const { sourceX, verticalFov } = getProjectionCameraGeometry(settings)

  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping
        gl.setClearColor('#02070b', 1)
      }}
      aria-hidden="true"
    >
      <color attach="background" args={['#02070b']} />
      <ProjectionCamera sourceX={sourceX} verticalFov={verticalFov} />
      <AnatomyPatient settings={settings} detector bodyOpacity={bodyOpacity} boneOpacity={boneOpacity} organOpacity={organOpacity} />
    </Canvas>
  )
}

export function DetectorImage({ settings, phase, captureId }: { settings: XraySettings; phase: ExposurePhase; captureId: number }) {
  const derived = deriveXrayState(settings)
  const rawId = useId().replace(/:/g, '')
  const noiseId = `noise-${rawId}`
  const glowId = `glow-${rawId}`
  const clipId = `clip-${rawId}`
  const projectionGeometry = getProjectionGeometry(settings.projection)
  const fieldW = 320 * derived.fieldRatio
  const fieldH = 420 * derived.fieldRatio
  const fieldX = (320 - fieldW) / 2
  const fieldY = (420 - fieldH) / 2
  const noiseOpacity = Math.min(0.48, derived.noise * 1.35)
  const bodyOpacity = THREE.MathUtils.clamp(0.024 + (1 - derived.penetration) * 0.026 + derived.exposureIndex * 0.003, 0.024, 0.058)
  const boneOpacity = THREE.MathUtils.clamp(0.22 - derived.penetration * 0.08 + derived.exposureIndex * 0.01, 0.11, 0.24)
  // The organ asset contains many nested surfaces, so this is a calibrated
  // projection weight rather than a literal material opacity. Keep soft tissue
  // clearly below cortical bone while preserving visible organ silhouettes.
  const organOpacity = THREE.MathUtils.clamp(0.027 - derived.penetration * 0.008 + derived.exposureIndex * 0.002, 0.016, 0.032)
  const projectionBrightness = THREE.MathUtils.clamp(0.72 + derived.exposureIndex * 0.17, 0.72, 1.28)

  return (
    <aside className="detector-panel glass-panel" aria-label="Simulated detector output">
      <header className="detector-header">
        <div className="detector-title"><ScanLine aria-hidden="true" /><h3>Detector image</h3></div>
        <div className="exposure-state" data-phase={phase} aria-live="polite"><span aria-hidden="true" />{phaseLabels[phase]}</div>
      </header>

      <div className="radiograph-frame">
        <div
          className="radiograph-model"
          role="img"
          aria-label={`Mesh-projected ${projectionGeometry.label} radiograph generated from the three-dimensional patient model.`}
        >
          <div className="radiograph-projection" style={{ filter: `brightness(${projectionBrightness}) contrast(${derived.contrast})` }}>
            <ModelProjection settings={settings} bodyOpacity={bodyOpacity} boneOpacity={boneOpacity} organOpacity={organOpacity} />
          </div>
          <svg key={captureId} className="radiograph-overlay" viewBox="0 0 320 420" aria-hidden="true" preserveAspectRatio="none">
            <defs>
              <radialGradient id={glowId} cx="50%" cy="42%" r="68%">
                <stop offset="0" stopColor="#d4f2f5" stopOpacity={0.08 + derived.exposureIndex * 0.018} />
                <stop offset="0.7" stopColor="#31515c" stopOpacity="0.04" />
                <stop offset="1" stopColor="#02070b" stopOpacity="0" />
              </radialGradient>
              <filter id={noiseId} x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="2" seed={captureId + 17} />
                <feColorMatrix type="saturate" values="0" />
              </filter>
              <clipPath id={clipId}><rect x={fieldX} y={fieldY} width={fieldW} height={fieldH} rx="7" /></clipPath>
            </defs>

            <rect width="320" height="420" fill={`url(#${glowId})`} />
            <rect width="320" height="420" clipPath={`url(#${clipId})`} filter={`url(#${noiseId})`} opacity={noiseOpacity} style={{ mixBlendMode: 'screen' }} />
            <g fill="#000" opacity="0.94">
              <rect x="0" y="0" width="320" height={fieldY} />
              <rect x="0" y={fieldY + fieldH} width="320" height={420 - fieldY - fieldH} />
              <rect x="0" y={fieldY} width={fieldX} height={fieldH} />
              <rect x={fieldX + fieldW} y={fieldY} width={320 - fieldX - fieldW} height={fieldH} />
            </g>
            <rect x={fieldX} y={fieldY} width={fieldW} height={fieldH} rx="7" fill="none" stroke="#d2f5ff" strokeOpacity="0.16" />
            <g fill="#e5fbff" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
              <text x="160" y="25" textAnchor="middle" fontSize="10" opacity="0.72">MODEL PROJECTION • {projectionGeometry.label.toUpperCase()} • FIELD {settings.collimation}%</text>
              <text x={settings.projection === 'Lateral' ? 286 : 22} y="38" textAnchor="middle" fontSize="22" fontWeight="700">{projectionGeometry.sideMarker}</text>
              <text x="17" y="402" fontSize="8" opacity="0.55">{settings.kvp} kVp  {settings.mas.toFixed(1)} mAs  SID {settings.sid} cm</text>
            </g>
          </svg>
        </div>
        <div className={`radiograph-flash${phase === 'emitting' || phase === 'captured' ? ' is-active' : ''}`} aria-hidden="true" />
      </div>

      <div className="detector-metadata" aria-label="Acquisition metadata">
        <div><span>Projection</span><strong>{projectionGeometry.label}</strong></div>
        <div><span>Magnification</span><strong>{derived.magnification.toFixed(2)}×</strong></div>
        <div><span>Exposed field</span><strong>{settings.collimation}%</strong></div>
        <div><span>Noise index</span><strong>{Math.round(derived.noise * 100)}</strong></div>
      </div>
    </aside>
  )
}
