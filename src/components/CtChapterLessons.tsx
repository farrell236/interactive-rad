import { memo, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, useGLTF } from '@react-three/drei'
import { Lock, LockOpen, Pause, Play, RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import ctSliceUrl from '../assets/ct/lidc-idri-0001-i060-hu16le.bin?url'
import type { CtKernel } from '../lib/ctProjectionNoise'
import { ctRangeProgressStyle } from '../lib/rangeProgress'

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))

function linePath(values: ArrayLike<number>, width: number, height: number, inset = 12) {
  let maximum = 0
  for (let index = 0; index < values.length; index += 1) maximum = Math.max(maximum, Math.abs(values[index]))
  maximum ||= 1
  return Array.from(values, (value, index) => {
    const x = inset + (index / Math.max(1, values.length - 1)) * (width - (inset * 2))
    const y = height - inset - (value / maximum) * (height - (inset * 2))
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function centeredLinePath(values: ArrayLike<number>, width: number, height: number, inset = 12) {
  let maximum = 0
  for (let index = 0; index < values.length; index += 1) maximum = Math.max(maximum, Math.abs(values[index]))
  maximum ||= 1
  const center = height / 2
  const amplitude = center - inset
  return Array.from(values, (value, index) => {
    const x = inset + (index / Math.max(1, values.length - 1)) * (width - (inset * 2))
    const y = center - (value / maximum) * amplitude
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function LessonHeader({ eyebrow, title, copy, value, id }: { eyebrow: string; title: string; copy: ReactNode; value?: string; id?: string }) {
  return (
    <header className="ct-built-header">
      <div><span>{eyebrow}</span><h4 id={id}>{title}</h4><p>{copy}</p></div>
      {value && <strong>{value}</strong>}
    </header>
  )
}

function ScannerFrontView({ angle }: { angle: number }) {
  const radians = angle * Math.PI / 180
  const sourceX = 150 + (Math.cos(radians) * 92)
  const sourceY = 132 + (Math.sin(radians) * 92)
  const detectorX = 150 - (Math.cos(radians) * 87)
  const detectorY = 132 - (Math.sin(radians) * 87)
  const tangentX = -Math.sin(radians)
  const tangentY = Math.cos(radians)

  return (
    <svg className="ct-geometry-front" viewBox="0 0 300 275" role="img" aria-label={`Front view of CT gantry at ${angle} degrees`}>
      <circle className="ct-geometry-gantry" cx="150" cy="132" r="112" />
      <circle className="ct-geometry-bore" cx="150" cy="132" r="75" />
      <line className="ct-geometry-crosshair" x1="71" x2="229" y1="132" y2="132" />
      <line className="ct-geometry-crosshair" x1="150" x2="150" y1="53" y2="211" />
      <ellipse className="ct-geometry-patient" cx="150" cy="132" rx="39" ry="53" />
      <polygon className="ct-geometry-fan" points={`${sourceX},${sourceY} ${detectorX + (tangentX * 38)},${detectorY + (tangentY * 38)} ${detectorX - (tangentX * 38)},${detectorY - (tangentY * 38)}`} />
      <line className="ct-geometry-detector" x1={detectorX + (tangentX * 38)} y1={detectorY + (tangentY * 38)} x2={detectorX - (tangentX * 38)} y2={detectorY - (tangentY * 38)} />
      <circle className="ct-geometry-source" cx={sourceX} cy={sourceY} r="8" />
      <circle className="ct-geometry-isocenter" cx="150" cy="132" r="4" />
      <text x="150" y="139">isocenter</text>
      <text x="150" y="264" textAnchor="middle">source and detector rotate as a pair</text>
    </svg>
  )
}

function HelicalTrajectory({ mode, pitch, progress }: { mode: 'axial' | 'helical'; pitch: number; progress: number }) {
  const helicalPaths = useMemo(() => {
    if (mode === 'axial') return { back: '', front: '' }
    const points = Array.from({ length: 121 }, (_, index) => {
      const t = index / 120
      const x = 76 + (t * 218 * (pitch / 1.5))
      const y = 126 + (Math.sin(t * Math.PI * 4) * 55)
      const layer: 'front' | 'back' = Math.cos(t * Math.PI * 4) >= 0 ? 'front' : 'back'
      return { x, y, layer }
    })
    const paths = { back: '', front: '' }
    points.forEach((point, index) => {
      const previous = points[index - 1]
      if (!previous || previous.layer !== point.layer) {
        const start = previous ?? point
        paths[point.layer] += ` M ${start.x.toFixed(1)} ${start.y.toFixed(1)}`
      }
      paths[point.layer] += ` L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    })
    return paths
  }, [mode, pitch])
  const markerT = progress / 720
  const axialAngle = (progress % 360) * Math.PI / 180
  const axialCenterX = 108 + (Math.min(1, Math.floor(progress / 360)) * 86)
  const markerX = mode === 'axial' ? axialCenterX + (Math.cos(axialAngle) * 15) : 76 + (markerT * 218 * (pitch / 1.5))
  const markerY = mode === 'axial' ? 126 + (Math.sin(axialAngle) * 57) : 126 + (Math.sin(markerT * Math.PI * 4) * 55)
  const markerIsFront = mode === 'axial'
    ? Math.cos(axialAngle) >= 0
    : Math.cos(markerT * Math.PI * 4) >= 0
  const axialBackHalf = (cx: number) => `M ${cx} 69 A 15 57 0 0 0 ${cx} 183`
  const axialFrontHalf = (cx: number) => `M ${cx} 69 A 15 57 0 0 1 ${cx} 183`

  return (
    <svg className="ct-geometry-trajectory" viewBox="0 0 340 230" role="img" aria-label={`${mode} CT acquisition path surrounding a sagittal projection of the anatomical patient at pitch ${pitch.toFixed(1)}`}>
      <text x="28" y="20">{mode === 'helical' ? `${pitch.toFixed(1)} pitch · continuous table motion` : 'stationary rotation · then table step'}</text>
      <rect className="ct-geometry-table" x="27" y="183" width="290" height="15" rx="3" />
      {mode === 'helical'
        ? <path className="ct-geometry-helix ct-geometry-path-back" d={helicalPaths.back} />
        : <>
            <path className="ct-geometry-axial-ring ct-geometry-path-back" d={axialBackHalf(108)} />
            <path className="ct-geometry-axial-ring ct-geometry-path-back" d={axialBackHalf(194)} />
            <path className="ct-geometry-step ct-geometry-path-back" d="M 124 126 L 178 126" />
          </>}
      {!markerIsFront && <circle className="ct-geometry-path-marker ct-geometry-path-back" cx={markerX} cy={markerY} r="7" />}
      <image className="ct-geometry-projected-patient" href={`${import.meta.env.BASE_URL}models/anatomy-sagittal.svg`} x="28" y="106" width="294" height="74" preserveAspectRatio="xMidYMid meet" />
      {mode === 'helical'
        ? <path className="ct-geometry-helix ct-geometry-path-front" d={helicalPaths.front} />
        : <>
            <path className="ct-geometry-axial-ring ct-geometry-path-front" d={axialFrontHalf(108)} />
            <path className="ct-geometry-axial-ring ct-geometry-path-front" d={axialFrontHalf(194)} />
          </>}
      {markerIsFront && <circle className="ct-geometry-path-marker ct-geometry-path-front" cx={markerX} cy={markerY} r="7" />}
      <line className="ct-geometry-z-axis" x1="304" x2="47" y1="209" y2="209" />
      <path className="ct-geometry-direction-arrow" d="M 36 209 L 49 202 L 49 216 Z" />
      <text className="ct-geometry-motion-label" x="123" y="224">patient and table motion · z</text>
    </svg>
  )
}

const CONE_BEAM_MODEL_URL = `${import.meta.env.BASE_URL}models/cone-beam-planes.glb`
const CONE_BEAM_TARGET: [number, number, number] = [0, 0, 0]

function ConeBeamModel() {
  const source = useGLTF(CONE_BEAM_MODEL_URL).scene
  const { invalidate } = useThree()
  const model = useMemo(() => {
    const clone = source.clone(true)
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone()
    })
    return clone
  }, [source])

  useEffect(() => {
    const updateContrast = () => {
      const dark = document.documentElement.dataset.theme !== 'light'
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        const objectName = object.name.toLowerCase()
        const isLabel = objectName.startsWith('label')
        const isDetectorGrid = objectName.includes('detector') && (objectName.includes('grid') || objectName.includes('frame'))
        if (!isLabel && !isDetectorGrid) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => {
          if ('color' in material && material.color instanceof THREE.Color) {
            material.color.set(dark ? (isLabel ? '#c7d2d7' : '#7d9098') : '#162026')
          }
        })
      })
      invalidate()
    }

    updateContrast()
    const observer = new MutationObserver(updateContrast)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [invalidate, model])

  return <primitive object={model} />
}

const ConeBeamCamera = memo(function ConeBeamCamera() {
  const { size } = useThree()
  return (
    <OrthographicCamera
      makeDefault
      position={[-4.845, 3.682, 12.402]}
      rotation={[-0.29455, -0.38788, 0]}
      zoom={Math.min(size.width / 9.9, size.height / 5.3)}
      near={0.1}
      far={100}
    />
  )
})

function ConeBeamIntersectionScene() {
  const [locked, setLocked] = useState(false)
  const [resetVersion, setResetVersion] = useState(0)

  return (
    <div className={`ct-cone-3d${locked ? ' is-locked' : ''}`}>
      <div className="ct-cone-3d-stage">
        <Canvas
          className="ct-cone-3d-canvas"
          role="img"
          aria-label="Draggable three-dimensional cone-beam model showing a point source, three fan planes intersecting a patient sphere, and a two-dimensional detector array"
          frameloop="demand"
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true }}
        >
          <ConeBeamCamera key={resetVersion} />
          <OrbitControls
            key={resetVersion}
            makeDefault
            enabled={!locked}
            enablePan={false}
            target={CONE_BEAM_TARGET}
            minPolarAngle={0.35}
            maxPolarAngle={2.35}
            minZoom={35}
            maxZoom={100}
          />
          <ambientLight intensity={0.65} />
          <Suspense fallback={null}><ConeBeamModel /></Suspense>
        </Canvas>
        <span className="ct-cone-scene-hint" aria-live="polite">{locked ? 'View locked' : 'Drag to orbit · Scroll to zoom'}</span>
      </div>
      <div className="ct-cone-scene-controls" role="group" aria-label="Cone beam view controls">
        <button type="button" aria-pressed={locked} onClick={() => setLocked((current) => !current)}>
          {locked ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}
          {locked ? 'Unlock' : 'Lock'}
        </button>
        <button type="button" onClick={() => setResetVersion((current) => current + 1)}>
          <RotateCcw aria-hidden="true" />
          Reset
        </button>
      </div>
    </div>
  )
}


export function CtScannerGeometryLesson() {
  const [mode, setMode] = useState<'axial' | 'helical'>('helical')
  const [pitch, setPitch] = useState(1)
  const [progress, setProgress] = useState(225)
  const [beamMode, setBeamMode] = useState<'fan' | 'cone'>('fan')
  const angle = progress % 360
  const beamWidth = 40
  const travel = mode === 'helical' ? pitch * beamWidth : 0

  return (
    <div className="ct-built-lesson ct-geometry-lesson">
      <section className="ct-built-primary" aria-labelledby="ct-geometry-demo-title">
        <LessonHeader id="ct-geometry-demo-title" eyebrow="Interactive geometry" title="Gantry and table motion" copy="Rotate the paired source–detector system, then change how the table advances along z." value={mode === 'helical' ? `${travel.toFixed(0)} mm / rotation` : '0 mm during rotation'} />
        <div className="ct-built-controls">
          <div className="ct-segmented" aria-label="Scan mode">
            <button type="button" aria-pressed={mode === 'axial'} onClick={() => setMode('axial')}>Axial</button>
            <button type="button" aria-pressed={mode === 'helical'} onClick={() => setMode('helical')}>Helical</button>
          </div>
          <label><span>Rotation progress <strong>{progress}°</strong></span><input aria-label="Rotation progress" type="range" min="0" max="720" step="5" value={progress} style={ctRangeProgressStyle(progress, 0, 720)} onChange={(event) => setProgress(Number(event.target.value))} /></label>
          <label className={mode === 'axial' ? 'is-disabled' : ''}><span>Pitch <strong>{pitch.toFixed(1)}</strong></span><input aria-label="Helical pitch" type="range" min="0.5" max="1.5" step="0.1" value={pitch} style={ctRangeProgressStyle(pitch, 0.5, 1.5)} disabled={mode === 'axial'} onChange={(event) => setPitch(Number(event.target.value))} /></label>
        </div>
        <div className="ct-geometry-stage">
          <figure><figcaption>Across the patient</figcaption><ScannerFrontView angle={angle} /></figure>
          <figure><figcaption>Along the patient</figcaption><HelicalTrajectory mode={mode} pitch={pitch} progress={progress} /></figure>
        </div>
        <div className="ct-geometry-readout" aria-live="polite">
          <span><small>Mode</small><strong>{mode === 'helical' ? 'Continuous' : 'Step-and-shoot'}</strong></span>
          <span><small>Nominal beam width</small><strong>{beamWidth} mm</strong></span>
          <span><small>Table travel</small><strong>{mode === 'helical' ? `${travel.toFixed(0)} mm / rotation` : '0 mm during rotation'}</strong></span>
          <span><small>Sampling overlap</small><strong>{mode === 'axial' ? 'Separate positions' : pitch < 1 ? 'Increased' : pitch > 1 ? 'Reduced' : 'Nominal'}</strong></span>
        </div>
      </section>

      <div className="ct-built-two-up ct-geometry-reference-grid">
        <section className="ct-built-card ct-beam-geometry-card">
          <LessonHeader
            eyebrow="Beam geometry"
            title={beamMode === 'fan' ? 'Fan beam: one detector row' : 'Cone beam: multiple detector rows'}
            copy={beamMode === 'fan'
              ? <>Within one transverse plane, rays diverge from the <strong>source</strong> toward a one-dimensional row of <strong>detector channels</strong>. That planar spread is the <strong>fan beam</strong>.</>
              : <>A multi-row <strong>detector array</strong> repeats <strong>detector channels</strong> along the patient’s z-axis. The <strong>detector rows</strong> give the beam a <strong>cone beam</strong> geometry with finite longitudinal coverage.</>}
          />
          <div className="ct-segmented ct-beam-mode-toggle" aria-label="Beam geometry view">
            <button type="button" aria-pressed={beamMode === 'fan'} onClick={() => setBeamMode('fan')}>Fan</button>
            <button type="button" aria-pressed={beamMode === 'cone'} onClick={() => setBeamMode('cone')}>Cone</button>
          </div>
          {beamMode === 'fan' ? (
            <svg className="ct-beam-comparison" viewBox="0 0 600 330" role="img" aria-label="Transverse view of a fan beam spreading from one source across detector channels in a single row">
              <text className="is-title" x="300" y="34" textAnchor="middle">transverse plane · x–y</text>
              <polygon className="is-fan-beam" points="62,164 500,74 500,254" />
              {Array.from({ length: 11 }, (_, index) => {
                const t = index / 10
                const x = 500 + (150 * t * (1 - t))
                const y = 74 + (180 * t)
                return <line key={`fan-ray-${index}`} className="is-fan-ray" x1="62" x2={x} y1="164" y2={y} />
              })}
              <line className="is-central-ray" x1="62" x2="538" y1="164" y2="164" />
              <ellipse className="is-object is-fan-patient" cx="292" cy="164" rx="58" ry="76" />
              <path className="is-detector-arc" d="M 500 74 Q 575 164 500 254" />
              {Array.from({ length: 11 }, (_, index) => {
                const t = index / 10
                const x = 500 + (150 * t * (1 - t))
                const y = 74 + (180 * t)
                return <circle key={`channel-${index}`} className="is-detector-element" cx={x} cy={y} r="3.2" />
              })}
              <circle className="is-source" cx="62" cy="164" r="9" />
              <text className="is-label" x="62" y="193" textAnchor="middle">source</text>
              <text className="is-label" x="292" y="258" textAnchor="middle">patient cross-section</text>
              <text className="is-title" x="512" y="53" textAnchor="middle">one detector row</text>
              <path className="is-axis-arrow" d="M 474 285 L 548 285 M 548 285 L 534 278 M 548 285 L 534 292" />
              <text className="is-axis-label" x="380" y="289">channels</text>
              <circle className="is-out-of-plane" cx="82" cy="287" r="12" />
              <circle className="is-out-of-plane-dot" cx="82" cy="287" r="3" />
              <text className="is-axis-label" x="103" y="291">z is perpendicular to this plane</text>
            </svg>
          ) : (
            <ConeBeamIntersectionScene />
          )}
          <div className="ct-beam-geometry-key">
            {beamMode === 'fan' ? <>
              <span><b>Point source</b><small>All displayed rays originate from one tube position.</small></span>
              <span><b>Detector channels</b><small>A single row samples the fan across the transverse plane.</small></span>
              <span><b>No z extent shown</b><small>This idealized view isolates one thin acquisition plane.</small></span>
            </> : <>
              <span><b>Channels</b><small>Each row still samples an in-plane fan.</small></span>
              <span><b>Detector rows</b><small>Adjacent fan planes add longitudinal coverage.</small></span>
              <span><b>One projection angle</b><small>The array records channels × rows simultaneously.</small></span>
            </>}
          </div>
        </section>

        <section className="ct-built-card">
          <LessonHeader eyebrow="Vocabulary" title="Component and role" copy="Read these names as parts of one measurement geometry." />
          <div className="ct-table-wrap"><table className="ct-built-table"><thead><tr><th>Component</th><th>Role</th></tr></thead><tbody>
            <tr><th>Source</th><td data-label="Role">Produces the X-ray beam from each acquisition angle.</td></tr>
            <tr><th>Detector array</th><td data-label="Role">Samples transmitted intensity across channels and rows.</td></tr>
            <tr><th>Gantry</th><td data-label="Role">Maintains and rotates the source–detector geometry.</td></tr>
            <tr><th>Isocenter</th><td data-label="Role">Defines the rotation axis and nominal reconstruction center.</td></tr>
            <tr><th>Collimation</th><td data-label="Role">Sets the nominal irradiated beam width along z.</td></tr>
            <tr><th>Table</th><td data-label="Role">Positions or continuously moves the patient through the beam.</td></tr>
            <tr><th>Fan / cone beam</th><td data-label="Role">A fan spreads across channels in one plane; multiple rows give it cone-like z extent.</td></tr>
            <tr><th>Pitch</th><td data-label="Role">Table travel per rotation divided by nominal collimated beam width in helical CT.</td></tr>
          </tbody></table></div>
        </section>
      </div>
    </div>
  )
}

const materialPresets = [
  { label: 'Low attenuation', mu: 0.05 },
  { label: 'Water-like', mu: 0.19 },
  { label: 'Dense material', mu: 0.38 },
] as const

function DetectorProfile() {
  const values = useMemo(() => Array.from({ length: 72 }, (_, index) => {
    const x = -1.2 + (index / 71) * 2.4
    const disk = (center: number, radius: number, mu: number) => {
      const offset = x - center
      return Math.abs(offset) < radius ? 2 * Math.sqrt((radius * radius) - (offset * offset)) * mu : 0
    }
    return disk(-0.26, 0.58, 0.18) + disk(0.38, 0.25, 0.32)
  }), [])
  return (
    <svg className="ct-ray-profile" viewBox="0 0 520 220" role="img" aria-label="One projection profile across detector channels">
      <line x1="44" x2="500" y1="184" y2="184" />
      <line x1="44" x2="44" y1="20" y2="184" />
      <path className="is-fill" d={`${linePath(values, 520, 200, 44)} L 476 184 L 44 184 Z`} />
      <path className="is-line" d={linePath(values, 520, 200, 44)} />
      <text x="272" y="213" textAnchor="middle">detector channel</text>
      <text x="14" y="104" textAnchor="middle" transform="rotate(-90 14 104)">p</text>
    </svg>
  )
}

export function CtRayLesson() {
  const [mu, setMu] = useState(0.19)
  const [length, setLength] = useState(12)
  const incident = 100000
  const lineIntegral = mu * length
  const transmission = Math.exp(-lineIntegral)
  const detected = Math.round(incident * transmission)
  const beamOpacity = clamp(0.12 + transmission * 0.88, 0.12, 1)

  return (
    <div className="ct-built-lesson ct-ray-lesson">
      <section className="ct-built-primary" aria-labelledby="ct-ray-demo-title">
        <LessonHeader id="ct-ray-demo-title" eyebrow="Interactive ray" title="Photon path to line integral" copy="Change attenuation or path length and follow the same measurement through transmission, normalization, and the logarithm." value={`p = ${lineIntegral.toFixed(2)}`} />
        <div className="ct-built-controls ct-ray-controls">
          <label><span>Attenuation coefficient μ <strong>{mu.toFixed(2)} cm⁻¹</strong></span><input aria-label="Attenuation coefficient" type="range" min="0.02" max="0.42" step="0.01" value={mu} style={ctRangeProgressStyle(mu, 0.02, 0.42)} onChange={(event) => setMu(Number(event.target.value))} /></label>
          <label><span>Path length L <strong>{length.toFixed(0)} cm</strong></span><input aria-label="Path length" type="range" min="1" max="24" step="1" value={length} style={ctRangeProgressStyle(length, 1, 24)} onChange={(event) => setLength(Number(event.target.value))} /></label>
          <div className="ct-ray-preset-control">
            <span>Material preset</span>
            <div className="ct-segmented" aria-label="Attenuation presets">{materialPresets.map((preset) => <button key={preset.label} type="button" aria-pressed={Math.abs(mu - preset.mu) < 0.001} onClick={() => setMu(preset.mu)}>{preset.label}</button>)}</div>
          </div>
        </div>
        <div className="ct-ray-stage">
          <svg viewBox="0 0 760 260" role="img" aria-label={`Idealized X-ray transmission with ${(transmission * 100).toFixed(1)} percent transmitted`}>
            <defs><linearGradient id="ct-ray-before" x1="0" x2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.22" /><stop offset="1" stopColor="currentColor" stopOpacity="0.52" /></linearGradient><linearGradient id="ct-ray-after" x1="0" x2="1"><stop offset="0" stopColor="currentColor" stopOpacity={beamOpacity} /><stop offset="1" stopColor="currentColor" stopOpacity={beamOpacity * 0.72} /></linearGradient></defs>
            <circle className="ct-ray-source" cx="52" cy="128" r="12" />
            <polygon className="ct-ray-before" points="64,128 260,74 260,182" />
            <rect className="ct-ray-object" x="260" y="52" width={90 + (length * 8)} height="152" rx="12" />
            <polygon className="ct-ray-after" style={{ opacity: beamOpacity }} points={`${350 + (length * 8)},74 682,106 682,150 ${350 + (length * 8)},182`} />
            <line className="ct-ray-centerline" x1="64" x2="682" y1="128" y2="128" />
            <rect className="ct-ray-detector" x="682" y="48" width="18" height="160" rx="4" />
            <text x="52" y="234" textAnchor="middle">I₀ = {incident.toLocaleString()}</text>
            <text x={305 + (length * 4)} y="41" textAnchor="middle">μ × L = {lineIntegral.toFixed(2)}</text>
            <text x="691" y="234" textAnchor="middle">I = {detected.toLocaleString()}</text>
          </svg>
          <div className="ct-ray-calculation" aria-live="polite">
            <span><small>Transmission</small><strong><i>I / I₀</i><output>{(transmission * 100).toFixed(2)}%</output></strong></span>
            <b><span><small>Apply</small><em>−ln</em></span></b>
            <span><small>Projection value</small><strong><i>p</i><output>{(-Math.log(Math.max(transmission, 1e-8))).toFixed(2)}</output></strong></span>
          </div>
        </div>
        <p className="ct-built-caption">Idealized monoenergetic model. The controls expose the Beer–Lambert relationship; clinical systems additionally correct spectral, scatter, detector, and geometric effects.</p>
      </section>

      <div className="ct-built-two-up">
        <section className="ct-built-card ct-equation-card">
          <LessonHeader eyebrow="Worked transform" title="Normalize, divide, then take the log" copy="The logarithm turns multiplication of transmissions into addition of path contributions." />
          <div className="ct-equation-stack">
            <p><span>Incident</span><code>I₀ = {incident.toLocaleString()}</code></p>
            <p><span>Transmitted</span><code>I = {detected.toLocaleString()}</code></p>
            <p className="is-result"><span>Line integral</span><code>p = −ln(I / I₀) = {lineIntegral.toFixed(2)}</code></p>
          </div>
          <div className="ct-additivity-example"><span>material A</span><b>+</b><span>material B</span><b>=</b><strong>one ray value</strong></div>
        </section>
        <section className="ct-built-card">
          <LessonHeader eyebrow="One source angle" title="A detector row becomes a profile" copy="Every channel contributes one line integral; together they form one projection view." />
          <DetectorProfile />
        </section>
      </div>
    </div>
  )
}

const RECON_SIZE = 56
const RECON_DETECTORS = 72
const RECON_ROOT_TWO = Math.sqrt(2)
const reconstructionEllipses = [
  [1, 0.69, 0.92, 0, 0, 0], [-0.8, 0.6624, 0.874, 0, -0.0184, 0], [-0.2, 0.11, 0.31, 0.22, 0, -18],
  [-0.2, 0.16, 0.41, -0.22, 0, 18], [0.1, 0.21, 0.25, 0, 0.35, 0], [0.1, 0.046, 0.046, 0, 0.1, 0],
  [0.1, 0.046, 0.046, 0, -0.1, 0], [0.1, 0.046, 0.023, -0.08, -0.605, 0], [0.1, 0.023, 0.023, 0, -0.606, 0],
  [0.1, 0.023, 0.046, 0.06, -0.605, 0],
] as const

function makeReconPhantom() {
  const output = new Float32Array(RECON_SIZE * RECON_SIZE)
  for (let row = 0; row < RECON_SIZE; row += 1) {
    const y = ((row + 0.5) / RECON_SIZE) * 2 - 1
    for (let column = 0; column < RECON_SIZE; column += 1) {
      const x = ((column + 0.5) / RECON_SIZE) * 2 - 1
      let value = 0
      for (const [amplitude, rx, ry, cx, cy, degrees] of reconstructionEllipses) {
        const radians = degrees * Math.PI / 180
        const dx = x - cx
        const dy = y - cy
        const localX = (dx * Math.cos(radians)) + (dy * Math.sin(radians))
        const localY = (-dx * Math.sin(radians)) + (dy * Math.cos(radians))
        if (((localX * localX) / (rx * rx)) + ((localY * localY) / (ry * ry)) <= 1) value += amplitude
      }
      output[(row * RECON_SIZE) + column] = Math.max(0, value)
    }
  }
  return output
}

const RECON_PHANTOM = makeReconPhantom()

function reconProject(image: Float32Array, angle: number) {
  const output = new Float32Array(RECON_DETECTORS)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  for (let row = 0; row < RECON_SIZE; row += 1) {
    const y = ((row + 0.5) / RECON_SIZE) * 2 - 1
    for (let column = 0; column < RECON_SIZE; column += 1) {
      const value = image[(row * RECON_SIZE) + column]
      if (value === 0) continue
      const x = ((column + 0.5) / RECON_SIZE) * 2 - 1
      const detector = (((x * cosine) + (y * sine) + RECON_ROOT_TWO) / (RECON_ROOT_TWO * 2)) * (RECON_DETECTORS - 1)
      const lower = Math.floor(detector)
      const fraction = detector - lower
      if (lower >= 0 && lower < RECON_DETECTORS) output[lower] += value * (1 - fraction)
      if (lower + 1 >= 0 && lower + 1 < RECON_DETECTORS) output[lower + 1] += value * fraction
    }
  }
  return output
}

function reconFilter(projection: Float32Array) {
  const output = new Float32Array(RECON_DETECTORS)
  for (let index = 0; index < RECON_DETECTORS; index += 1) {
    let value = projection[index] * 0.25
    for (let offset = 1; offset < RECON_DETECTORS; offset += 2) {
      const coefficient = -1 / (Math.PI * Math.PI * offset * offset)
      if (index - offset >= 0) value += projection[index - offset] * coefficient
      if (index + offset < RECON_DETECTORS) value += projection[index + offset] * coefficient
    }
    output[index] = value
  }
  return output
}

function reconstructPhantom(views: number, filtered: boolean) {
  const output = new Float32Array(RECON_SIZE * RECON_SIZE)
  const projections = Array.from({ length: views }, (_, view) => {
    const angle = view / views * Math.PI
    const raw = reconProject(RECON_PHANTOM, angle)
    return { angle, values: filtered ? reconFilter(raw) : raw }
  })
  for (let row = 0; row < RECON_SIZE; row += 1) {
    const y = ((row + 0.5) / RECON_SIZE) * 2 - 1
    for (let column = 0; column < RECON_SIZE; column += 1) {
      const x = ((column + 0.5) / RECON_SIZE) * 2 - 1
      let sum = 0
      for (const projection of projections) {
        const detector = (((x * Math.cos(projection.angle)) + (y * Math.sin(projection.angle)) + RECON_ROOT_TWO) / (RECON_ROOT_TWO * 2)) * (RECON_DETECTORS - 1)
        const lower = Math.floor(detector)
        const fraction = detector - lower
        if (lower >= 0 && lower + 1 < RECON_DETECTORS) sum += (projection.values[lower] * (1 - fraction)) + (projection.values[lower + 1] * fraction)
      }
      output[(row * RECON_SIZE) + column] = sum / views
    }
  }
  return output
}

function ReconCanvas({ values, label }: { values: Float32Array; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = ref.current?.getContext('2d')
    if (!context) return
    const image = context.createImageData(RECON_SIZE, RECON_SIZE)
    const sorted = Array.from(values).filter((value) => value > 0).sort((a, b) => a - b)
    const maximum = sorted[Math.max(0, Math.floor(sorted.length * 0.985))] || 1
    for (let index = 0; index < values.length; index += 1) {
      const normalized = clamp(values[index] / maximum, 0, 1)
      const gray = Math.round(Math.pow(normalized, 0.72) * 255)
      image.data[(index * 4)] = gray
      image.data[(index * 4) + 1] = gray
      image.data[(index * 4) + 2] = gray
      image.data[(index * 4) + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [values])
  return <canvas ref={ref} width={RECON_SIZE} height={RECON_SIZE} role="img" aria-label={label} />
}

const RADON_TRANSFORM_MATH = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><msub><mi>R</mi><mi>θ</mi></msub><mo>(</mo><mi>t</mi><mo>)</mo><mo>=</mo><mo>∬</mo><mi>f</mi><mo>(</mo><mi>x</mi><mo>,</mo><mi>y</mi><mo>)</mo><mi>δ</mi><mo>(</mo><mi>t</mi><mo>−</mo><mi>x</mi><mo>cos</mo><mi>θ</mi><mo>−</mo><mi>y</mi><mo>sin</mo><mi>θ</mi><mo>)</mo><mi>d</mi><mi>x</mi><mi>d</mi><mi>y</mi></mrow></math>`
const SINGLE_FILTERED_BACKPROJECTION_MATH = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><msub><mi>b</mi><mi>θ</mi></msub><mo>(</mo><mi>x</mi><mo>,</mo><mi>y</mi><mo>)</mo><mo>=</mo><msub><mi>Q</mi><mi>θ</mi></msub><mo>(</mo><mi>x</mi><mo>cos</mo><mi>θ</mi><mo>+</mo><mi>y</mi><mo>sin</mo><mi>θ</mi><mo>)</mo></mrow></math>`
const RAMP_FILTER_MATH = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><msub><mi>Q</mi><mi>θ</mi></msub><mo>(</mo><mi>t</mi><mo>)</mo><mo>=</mo><mo>(</mo><msub><mi>R</mi><mi>θ</mi></msub><mo>∗</mo><mi>h</mi><mo>)</mo><mo>(</mo><mi>t</mi><mo>)</mo><mspace width="1.5em"/><mtext>with</mtext><mspace width="0.5em"/><mover accent="true"><mi>h</mi><mo>^</mo></mover><mo>(</mo><mi>ω</mi><mo>)</mo><mo>=</mo><mo>|</mo><mi>ω</mi><mo>|</mo></mrow></math>`
const FILTERED_BACKPROJECTION_MATH = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>f</mi><mo>(</mo><mi>x</mi><mo>,</mo><mi>y</mi><mo>)</mo><mo>=</mo><msubsup><mo>∫</mo><mn>0</mn><mi>π</mi></msubsup><msub><mi>Q</mi><mi>θ</mi></msub><mo>(</mo><mi>x</mi><mo>cos</mo><mi>θ</mi><mo>+</mo><mi>y</mi><mo>sin</mo><mi>θ</mi><mo>)</mo><mi>d</mi><mi>θ</mi></mrow></math>`

const reconstructionStages = ['Measure', 'Filter', 'Backproject', 'Accumulate', 'Final slice'] as const

export function CtReconstructionLesson() {
  const [stage, setStage] = useState(0)
  const [views, setViews] = useState(36)
  const [playing, setPlaying] = useState(true)
  const rawMany = useMemo(() => reconstructPhantom(views, false), [views])
  const filteredOne = useMemo(() => reconstructPhantom(1, true), [])
  const accumulatedViewCount = Math.max(1, Math.floor(views / 2))
  const filteredPartial = useMemo(() => reconstructPhantom(accumulatedViewCount, true), [accumulatedViewCount])
  const filtered = useMemo(() => reconstructPhantom(views, true), [views])
  const projection = useMemo(() => reconProject(RECON_PHANTOM, Math.PI / 5), [])
  const filteredProjection = useMemo(() => reconFilter(projection), [projection])

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => setStage((current) => (current + 1) % reconstructionStages.length), stage === reconstructionStages.length - 1 ? 1700 : 1250)
    return () => window.clearTimeout(timer)
  }, [playing, stage])

  const setManualStage = (next: number) => { setStage(next); setPlaying(false) }
  const stageContent = [
    {
      kicker: 'Radon measurement',
      paragraphs: [
        <>This teaching demo uses an idealized two-dimensional parallel-beam model. Real CT scanners use fan- or cone-beam geometry, but the same projection-to-image relationship is easier to see with parallel rays.</>,
        <>For one source angle <i>θ</i>, each detector coordinate <i>t</i> stores a line integral through the slice. The resulting profile is written as R<sub>θ</sub>(t).</>,
        <>Repeating the measurement across angles produces the sinogram: projection angle on one axis and detector position on the other.</>,
      ],
      equations: [{ label: 'Forward Radon transform', math: RADON_TRANSFORM_MATH, aria: 'R theta of t equals the double integral of f of x y times delta of t minus x cosine theta minus y sine theta, d x d y' }],
      definition: <><b>R<sub>θ</sub>(t)</b> is the measured projection at angle <i>θ</i> and detector coordinate <i>t</i>.</>,
    },
    {
      kicker: 'Correct the frequency weighting',
      paragraphs: [
        <>Before backprojection, each measured projection is convolved with a ramp filter. This corrects the characteristic low-frequency emphasis that would otherwise make simple backprojection appear blurred.</>,
        <>The filtered profile Q<sub>θ</sub>(t) contains positive and negative values around zero. Practical reconstruction kernels modify this frequency weighting to trade spatial detail against noise.</>,
      ],
      equations: [{ label: 'Ramp-filtered projection', math: RAMP_FILTER_MATH, aria: 'Q theta of t equals R theta convolved with h, where h hat of omega equals the absolute value of omega' }],
      definition: <><b>Q<sub>θ</sub>(t)</b> is the filtered projection that will be spread back through image space.</>,
    },
    {
      kicker: 'Reverse the geometry',
      paragraphs: [
        <>Backprojection takes each value in the filtered profile and spreads it across every image location that could have contributed to that ray.</>,
        <>One angle still creates a broad image-space contribution. It cannot localize the object by itself; localization emerges when contributions from many angles are combined.</>,
      ],
      equations: [{ label: 'One filtered backprojection', math: SINGLE_FILTERED_BACKPROJECTION_MATH, aria: 'b theta of x y equals Q theta evaluated at x cosine theta plus y sine theta' }],
      definition: <><b>b<sub>θ</sub>(x,y)</b> is the image-space contribution from one filtered projection angle.</>,
    },
    {
      kicker: 'Combine the filtered views',
      paragraphs: [
        <>The displayed intermediate uses {accumulatedViewCount} of the {views} available angles. Where backprojected contributions repeatedly agree, the object becomes increasingly localized.</>,
        <>Filtered backprojection sums these contributions across the full angular range. The integral below is the continuous-angle ideal; this demo approximates it with a finite number of views.</>,
      ],
      equations: [{ label: 'Filtered backprojection', math: FILTERED_BACKPROJECTION_MATH, aria: 'f of x y equals the integral from zero to pi of Q theta evaluated at x cosine theta plus y sine theta, d theta' }],
      definition: <>Normalization constants vary with the Radon and Fourier-transform convention; the operational order does not.</>,
      note: <><strong>Filter each projection → backproject it at its angle → sum across angles.</strong></>,
    },
    {
      kicker: 'Reconstructed image',
      paragraphs: [
        <>After all {views} filtered views are backprojected and accumulated, the result is a two-dimensional attenuation map rather than a detector frame.</>,
        <>With sparse angular sampling, the same operation leaves visible streaks because too few views constrain the reconstruction.</>,
      ],
      equations: [],
      definition: <>The displayed phantom is a numerical teaching reconstruction, not a vendor scanner algorithm.</>,
    },
  ]
  const activeStageContent = stageContent[stage]
  const visual = stage === 0
    ? <svg className="ct-recon-projection" viewBox="0 0 280 280" role="img" aria-label="Measured detector profile"><line x1="35" x2="35" y1="25" y2="245" /><line x1="35" x2="255" y1="245" y2="245" /><path d={linePath(projection, 280, 260, 35)} /><text x="145" y="274" textAnchor="middle">detector channel</text></svg>
    : stage === 1
      ? <svg className="ct-recon-projection" viewBox="0 0 280 280" role="img" aria-label="Ramp-filtered detector profile"><line x1="35" x2="35" y1="25" y2="245" /><line x1="35" x2="255" y1="140" y2="140" /><path d={centeredLinePath(filteredProjection, 280, 260, 35)} /><text x="145" y="274" textAnchor="middle">detector channel</text></svg>
      : <ReconCanvas values={stage === 2 ? filteredOne : stage === 3 ? filteredPartial : filtered} label={stage === 2 ? 'Backprojection of one filtered projection' : stage === 3 ? `Accumulation of ${accumulatedViewCount} of ${views} filtered views` : `Final filtered-backprojection slice using ${views} views`} />

  return (
    <div className="ct-built-lesson ct-reconstruction-lesson">
      <section className="ct-built-primary" aria-labelledby="ct-reconstruction-demo-title">
        <LessonHeader id="ct-reconstruction-demo-title" eyebrow="Animated reconstruction" title="Progressive reconstruction" copy="Follow one set of measurements through projection filtering, backprojection, angular accumulation, and the reconstructed slice." value={`${views} views`} />
        <div className="ct-recon-toolbar">
          <div className="ct-recon-stages" aria-label="Reconstruction stage">{reconstructionStages.map((label, index) => <button key={label} type="button" aria-label={`${index + 1}. ${label}`} aria-pressed={stage === index} onClick={() => setManualStage(index)}><span aria-hidden="true">{index + 1}</span>{label}</button>)}</div>
          <button className="ct-action-button" type="button" aria-pressed={playing} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{playing ? 'Pause' : 'Play'}</button>
          <button className="ct-action-button" type="button" onClick={() => { setStage(0); setPlaying(true) }}><RotateCcw aria-hidden="true" />Restart</button>
        </div>
        <div className="ct-recon-view-control">
          <label><span>Angular views <strong>{views}</strong></span><input aria-label="Reconstruction view count" type="range" min="6" max="60" step="6" value={views} style={ctRangeProgressStyle(views, 6, 60)} onChange={(event) => { setViews(Number(event.target.value)); setPlaying(false) }} /></label>
          <small>Changes the multi-view accumulation and final reconstruction</small>
        </div>
        <div className="ct-recon-stage">
          <div className="ct-recon-visual">{visual}<span>{reconstructionStages[stage]}</span></div>
          <div className="ct-recon-stage-copy" aria-live="polite">
            <span>0{stage + 1} · {activeStageContent.kicker}</span>
            <h5>{reconstructionStages[stage]}</h5>
            <div className="ct-recon-stage-explanation">{activeStageContent.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
            {activeStageContent.equations.length > 0 && <div className="ct-recon-stage-equations">{activeStageContent.equations.map((equation) => <div key={equation.label}><span>{equation.label}</span><div className="ct-display-equation" role="img" aria-label={equation.aria} dangerouslySetInnerHTML={{ __html: equation.math }} /></div>)}</div>}
            <div className={`ct-recon-stage-support${'note' in activeStageContent && activeStageContent.note ? ' has-note' : ''}`}>
              <p className="ct-recon-stage-definition">{activeStageContent.definition}</p>
              {'note' in activeStageContent && activeStageContent.note && <p className="ct-recon-stage-note">{activeStageContent.note}</p>}
            </div>
            {stage === 3 && <nav className="ct-reconstruction-reading" aria-label="Further reading about CT reconstruction"><span>Further reading</span><a href="https://scikit-image.org/docs/stable/auto_examples/transform/plot_radon_transform.html" target="_blank" rel="noreferrer">scikit-image: Radon transform</a><a href="https://www.slaney.org/pct/pct-toc.html" target="_blank" rel="noreferrer">Kak &amp; Slaney: CT reconstruction</a></nav>}
          </div>
        </div>
      </section>

      <section className="ct-built-card">
        <LessonHeader eyebrow="Same projection data" title="Compare reconstruction approaches" copy="Only the first two images below are numerically reconstructed here; the iterative panel shows the update logic rather than pretending to reproduce a vendor algorithm." />
        <div className="ct-recon-comparison">
          <figure><ReconCanvas values={rawMany} label={`Simple backprojection from ${views} views`} /><figcaption><strong>Simple backprojection</strong><span>Localized, but characteristically blurred.</span></figcaption></figure>
          <figure><ReconCanvas values={filtered} label={`Filtered backprojection from ${views} views`} /><figcaption><strong>Filtered backprojection</strong><span>Frequency correction restores edge detail.</span></figcaption></figure>
          <figure className="ct-iterative-loop">
            <div className="ct-iterative-cycle" role="img" aria-label="Iterative reconstruction cycle: estimate, predict, compare, update, then return to the estimate">
              <span className="is-estimate">estimate</span><b className="is-right">→</b><span className="is-predict">predict</span>
              <b className="is-up">↑</b><b className="is-down">↓</b>
              <span className="is-update">update</span><b className="is-left">←</b><span className="is-compare">compare</span>
            </div>
            <figcaption><strong>Iterative reconstruction</strong><span>Repeatedly reduces disagreement with measured projections.</span></figcaption>
          </figure>
        </div>
      </section>

      <section className="ct-built-card">
        <LessonHeader eyebrow="Reference" title="Reconstruction trade-offs" copy="The algorithm name alone is not enough; implementation and settings determine the final appearance." />
        <div className="ct-table-wrap"><table className="ct-built-table"><thead><tr><th>Method</th><th>Central operation</th><th>Characteristic result</th><th>Computation</th></tr></thead><tbody>
          <tr><th>Unfiltered backprojection</th><td data-label="Central operation">Spread each measurement along its ray.</td><td data-label="Characteristic result">Strong low-frequency blur.</td><td data-label="Computation">Low</td></tr>
          <tr><th>Filtered backprojection</th><td data-label="Central operation">Filter projections, then backproject.</td><td data-label="Characteristic result">Fast; noise and resolution depend on the filter or kernel.</td><td data-label="Computation">Moderate</td></tr>
          <tr><th>Iterative</th><td data-label="Central operation">Predict measurements, compare, update.</td><td data-label="Characteristic result">Model- and regularization-dependent texture.</td><td data-label="Computation">Higher</td></tr>
        </tbody></table></div>
      </section>
    </div>
  )
}

type Kernel = CtKernel

const protocolCtSize = 512
let protocolCtPixelPromise: Promise<Int16Array> | undefined

function loadProtocolCtPixels() {
  if (!protocolCtPixelPromise) {
    protocolCtPixelPromise = fetch(ctSliceUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load the CT image (${response.status})`)
      const buffer = await response.arrayBuffer()
      if (buffer.byteLength !== protocolCtSize * protocolCtSize * 2) throw new Error('The CT image has an unexpected size')
      return new Int16Array(buffer)
    })
  }
  return protocolCtPixelPromise
}

function useProtocolCtPixels() {
  const [pixels, setPixels] = useState<Int16Array | null>(null)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    let cancelled = false
    loadProtocolCtPixels()
      .then((loadedPixels) => { if (!cancelled) setPixels(loadedPixels) })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
  }, [])
  return { pixels, loadError }
}

type ProtocolSimulation = { hu: Float32Array; size: number; incidentPhotons: number }

function ProtocolImage({ simulation, loadError, label }: { simulation: ProtocolSimulation | null; loadError: boolean; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !simulation) return
    const context = canvas.getContext('2d')
    if (!context) return
    const image = context.createImageData(simulation.size, simulation.size)
    const center = -500
    const width = 1500
    const low = center - (width / 2)
    for (let index = 0; index < simulation.hu.length; index += 1) {
      const gray = Math.round(clamp((simulation.hu[index] - low) / width, 0, 1) * 255)
      image.data[(index * 4)] = gray
      image.data[(index * 4) + 1] = gray
      image.data[(index * 4) + 2] = gray
      image.data[(index * 4) + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [simulation])

  return (
    <div className="ct-protocol-image-frame">
      <canvas ref={canvasRef} className="ct-protocol-image" width={simulation?.size ?? 96} height={simulation?.size ?? 96} role="img" aria-label={label} />
      {!simulation && <span className={loadError ? 'is-error' : ''}>{loadError ? 'CT slice unavailable' : 'Reconstructing real CT slice…'}</span>}
    </div>
  )
}

export function CtProtocolLesson() {
  const [mas, setMas] = useState(120)
  const [pitch, setPitch] = useState(1)
  const [thickness, setThickness] = useState(2.5)
  const [kernel, setKernel] = useState<Kernel>('standard')
  const { pixels, loadError } = useProtocolCtPixels()
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const [workerReady, setWorkerReady] = useState(false)
  const [protocolSimulations, setProtocolSimulations] = useState<Record<string, ProtocolSimulation>>({})
  const kernelNoise = { smooth: 0.72, standard: 1, sharp: 1.42 }[kernel]
  const kernelDetail = { smooth: 0.76, standard: 1, sharp: 1.22 }[kernel]
  const noiseIndex = clamp(36 * Math.sqrt(120 / mas) * Math.sqrt(2.5 / thickness) * kernelNoise, 8, 98)
  const detailIndex = clamp(52 * Math.sqrt(2.5 / thickness) * kernelDetail, 20, 98)
  const relativeOutput = clamp((mas / 120) / pitch * 100, 18, 250)
  const incidentPhotons = Math.round(clamp(65536 * (mas / 120) * (1 / pitch) * (thickness / 2.5), 2048, 1048576))

  useEffect(() => {
    if (!pixels || typeof Worker === 'undefined') return undefined
    const worker = new Worker(new URL('../workers/ctProtocolWorker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<{ type: 'ready' } | { type: 'result'; requestId: number; results: Array<ProtocolSimulation & { id: string }> }>) => {
      if (event.data.type === 'ready') {
        setWorkerReady(true)
        return
      }
      if (event.data.requestId !== requestIdRef.current) return
      setProtocolSimulations(Object.fromEntries(event.data.results.map((result) => [result.id, result])))
    }
    const copy = pixels.slice()
    worker.postMessage({ type: 'init', pixels: copy }, [copy.buffer])
    return () => {
      workerRef.current = null
      worker.terminate()
    }
  }, [pixels])

  useEffect(() => {
    if (!workerReady || !workerRef.current) return undefined
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const timer = window.setTimeout(() => workerRef.current?.postMessage({
      type: 'simulate',
      requestId,
      configs: [
        { id: 'current', mas, pitch, thickness, kernel },
        { id: 'smooth', mas: 120, pitch: 1, thickness: 2.5, kernel: 'smooth' },
        { id: 'sharp', mas: 120, pitch: 1, thickness: 2.5, kernel: 'sharp' },
      ],
    }), 70)
    return () => window.clearTimeout(timer)
  }, [kernel, mas, pitch, thickness, workerReady])

  return (
    <div className="ct-built-lesson ct-protocol-lesson">
      <section className="ct-built-primary" aria-labelledby="ct-protocol-demo-title">
        <LessonHeader id="ct-protocol-demo-title" eyebrow="Interactive trade-offs" title="Protocol trade-off dashboard" copy="Change the controls to reproject the same real chest slice, resample its transmitted photon counts, and reconstruct it again." value={`${kernel} kernel`} />
        <div className="ct-protocol-workbench">
          <div className="ct-protocol-controls">
            <label><span>Tube current-time <strong>{mas} mAs</strong></span><input aria-label="CT tube current-time" type="range" min="10" max="400" step="10" value={mas} style={ctRangeProgressStyle(mas, 10, 400)} onChange={(event) => setMas(Number(event.target.value))} /></label>
            <label><span>Pitch <strong>{pitch.toFixed(1)}</strong></span><input aria-label="Protocol pitch" type="range" min="0.6" max="1.5" step="0.1" value={pitch} style={ctRangeProgressStyle(pitch, 0.6, 1.5)} onChange={(event) => setPitch(Number(event.target.value))} /></label>
            <label><span>Slice thickness <strong>{thickness.toFixed(1)} mm</strong></span><input aria-label="Slice thickness" type="range" min="0.5" max="5" step="0.5" value={thickness} style={ctRangeProgressStyle(thickness, 0.5, 5)} onChange={(event) => setThickness(Number(event.target.value))} /></label>
            <div><span className="ct-control-label">Reconstruction kernel</span><div className="ct-segmented" aria-label="Reconstruction kernel">{(['smooth', 'standard', 'sharp'] as const).map((value) => <button key={value} type="button" aria-pressed={kernel === value} onClick={() => setKernel(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div>
          </div>
          <div className="ct-protocol-preview">
            <ProtocolImage simulation={protocolSimulations.current ?? null} loadError={loadError} label={`Poisson-noisy reconstruction of a real LIDC-IDRI chest slice with ${mas} mAs, pitch ${pitch.toFixed(1)}, ${thickness} millimeter slices, and ${kernel} kernel`} />
            <div className="ct-protocol-pipeline" role="group" aria-label="Noise simulation pipeline"><span>HU → μ</span><b>→</b><span>sinogram</span><b>→</b><span>Poisson counts</span><b>→</b><span>−ln(I / I₀)</span><b>→</b><span>FBP</span></div>
            <span>real LIDC-IDRI anatomy · W 1500 · C −500</span>
          </div>
          <div className="ct-protocol-metrics" aria-live="polite">
            <div><span>Visible noise</span><strong>{noiseIndex.toFixed(0)}</strong><i><b style={{ width: `${noiseIndex}%` }} /></i><small>higher is noisier</small></div>
            <div><span>Fine-detail response</span><strong>{detailIndex.toFixed(0)}</strong><i><b style={{ width: `${detailIndex}%` }} /></i><small>not the same as pixel count</small></div>
            <div><span>Incident photons N₀</span><strong>{incidentPhotons.toLocaleString()}</strong><i><b style={{ width: `${Math.min(100, relativeOutput / 2.5)}%` }} /></i><small>simulation count per ray</small></div>
          </div>
        </div>
        <p className="ct-built-caption">The anatomy is a de-identified LIDC-IDRI chest CT. The browser converts HU to attenuation, computes an idealized parallel-beam sinogram, applies Poisson sampling to transmitted photon counts, and reconstructs it with ramp-filtered backprojection. Controls and indicators are teaching models, not protocol recommendations or patient-dose estimates.</p>
      </section>

      <section className="ct-built-card">
        <LessonHeader eyebrow="Reconstruction choice" title="Smooth and sharp kernels" copy="Both previews use the same real anatomy, Poisson-sampled projection data, and display window. Only the reconstruction response changes." />
        <div className="ct-kernel-comparison">
          <figure><ProtocolImage simulation={protocolSimulations.smooth ?? null} loadError={loadError} label="Smooth-kernel reconstruction of the LIDC-IDRI chest slice" /><figcaption><strong>Smooth</strong><span>Lower noise; softer edges and fine texture.</span></figcaption></figure>
          <div className="ct-edge-profile" aria-hidden="true"><span>edge response</span><svg viewBox="0 0 180 90"><path className="is-smooth" d="M 8 72 C 62 72 70 18 124 18 L 172 18" /><path className="is-sharp" d="M 8 72 L 88 72 L 92 12 L 97 22 L 172 22" /></svg></div>
          <figure><ProtocolImage simulation={protocolSimulations.sharp ?? null} loadError={loadError} label="Sharp-kernel reconstruction of the LIDC-IDRI chest slice" /><figcaption><strong>Sharp</strong><span>Stronger edges; more prominent noise and texture.</span></figcaption></figure>
        </div>
      </section>

      <section className="ct-built-card">
        <LessonHeader eyebrow="Effect table" title="Parameter → visible consequence" copy="Use directions as relationships, not as universal clinical prescriptions." />
        <div className="ct-table-wrap"><table className="ct-built-table"><thead><tr><th>Parameter</th><th>Primary effect</th><th>Common visible change</th><th>Linked trade-off</th></tr></thead><tbody>
          <tr><th>mAs ↑</th><td data-label="Primary effect">More photons</td><td data-label="Common visible change">Lower quantum noise</td><td data-label="Linked trade-off">Higher tube output</td></tr>
          <tr><th>Pitch ↑</th><td data-label="Primary effect">More table travel per rotation</td><td data-label="Common visible change">Less longitudinal overlap</td><td data-label="Linked trade-off">Coverage and sampling change</td></tr>
          <tr><th>Slice thickness ↑</th><td data-label="Primary effect">More signal averaged through z</td><td data-label="Common visible change">Lower noise, more partial volume</td><td data-label="Linked trade-off">Less through-plane detail</td></tr>
          <tr><th>Sharper kernel</th><td data-label="Primary effect">More high-frequency response</td><td data-label="Common visible change">Sharper edges and noisier texture</td><td data-label="Linked trade-off">Detail–noise balance</td></tr>
          <tr><th>Field of view ↓</th><td data-label="Primary effect">Smaller nominal pixel spacing</td><td data-label="Common visible change">Finer sampling grid</td><td data-label="Linked trade-off">Does not guarantee true resolution</td></tr>
        </tbody></table></div>
      </section>
    </div>
  )
}

type ContrastTimingMode = 'fixed' | 'tracking'
type ContrastPhaseId = 'noncontrast' | 'arterial' | 'portal' | 'delayed'

const contrastPhaseImages: Array<{
  id: ContrastPhaseId
  label: string
  timing: string
  crop: number
  description: string
  pattern: string
}> = [
  {
    id: 'noncontrast',
    label: 'Non-contrast',
    timing: 'Before injection',
    crop: 0,
    description: 'Baseline attenuation before intravenous iodine enters the circulation.',
    pattern: 'The aorta and abdominal organs retain their native attenuation. This is a separate acquisition, not the zero-second point of an enhanced scan.',
  },
  {
    id: 'arterial',
    label: 'Arterial',
    timing: 'First-pass window',
    crop: 1,
    description: 'The arterial system enhances strongly while portal venous and parenchymal enhancement are still evolving.',
    pattern: 'The baked-in white arrow marks a transient hepatic attenuation difference beside the abscess; it is conspicuous during this arterial phase.',
  },
  {
    id: 'portal',
    label: 'Portal venous',
    timing: 'Commonly 60–80 s',
    crop: 2,
    description: 'Portal venous inflow and abdominal parenchymal enhancement are more established.',
    pattern: 'At the same baked-in white arrow, the transient arterial-phase difference has become isodense with the rest of the liver.',
  },
  {
    id: 'delayed',
    label: 'Delayed',
    timing: 'Minutes after injection',
    crop: 3,
    description: 'Further redistribution and washout create a later enhancement state.',
    pattern: 'The baked-in white arrow again marks the previously conspicuous region, which remains isodense with the rest of the liver in this case.',
  },
]

function gammaCurve(time: number, start: number, peakOffset: number, amplitude: number, shape: number) {
  if (time <= start) return 0
  const normalized = (time - start) / peakOffset
  return amplitude * Math.pow(normalized, shape) * Math.exp(shape * (1 - normalized))
}

const representativeContrastWindows = [
  { start: 0, end: 35, label: 'Pre-/early enhancement', shortLabel: 'pre-/early enhancement', note: 'This is before the representative late-arterial window; the enhancement state depends strongly on arrival and the clinical target.' },
  { start: 35, end: 45, label: 'Late arterial example', shortLabel: 'late arterial', note: 'A representative fixed-delay late-arterial window for multiphasic liver imaging.' },
  { start: 45, end: 60, label: 'Transitional', shortLabel: 'transitional', note: 'Between the representative late-arterial and portal-venous windows.' },
  { start: 60, end: 80, label: 'Portal venous example', shortLabel: 'portal venous', note: 'A representative portal-venous window for abdominal imaging.' },
  { start: 80, end: 180, label: 'Late venous', shortLabel: 'late venous', note: 'Enhancement continues to redistribute after the usual portal-venous window.' },
  { start: 180, end: Number.POSITIVE_INFINITY, label: 'Delayed example', shortLabel: 'delayed', note: 'Minutes after injection; the exact target depends on the examination.' },
]

function contrastPhaseAt(scanStart: number, scanEnd: number) {
  if (scanEnd <= 0) return { label: 'Non-contrast', note: 'The entire acquisition finishes before injection begins.' }
  if (scanStart < 0) return { label: 'Straddles injection start', note: 'Part of the acquisition occurs before injection and part occurs after it begins.' }
  const overlaps = representativeContrastWindows.filter((window) => scanStart < window.end && scanEnd > window.start)
  if (overlaps.length === 1) return { label: overlaps[0].label, note: overlaps[0].note }
  if (overlaps.length > 1) return {
    label: `${overlaps[0].shortLabel} → ${overlaps[overlaps.length - 1].shortLabel}`,
    note: 'The acquisition window crosses representative timing regions, so one phase name hides within-volume timing variation.',
  }
  return { label: 'Outside teaching range', note: 'This timing falls outside the representative windows used by the teaching model.' }
}

function ContrastTimingGraph({
  volume,
  flowRate,
  iodineConcentration,
  salineFlushVolume,
  arrival,
  scanStart,
  scanDuration,
  triggerTime,
}: {
  volume: number
  flowRate: number
  iodineConcentration: number
  salineFlushVolume: number
  arrival: number
  scanStart: number
  scanDuration: number
  triggerTime: number | null
}) {
  const width = 760
  const height = 320
  const margin = { left: 58, right: 18, top: 35, bottom: 54 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const minimumTime = -15
  const maximumTime = 300
  const injectionDuration = volume / flowRate
  const salineFlushDuration = salineFlushVolume / flowRate
  const flushEnd = injectionDuration + salineFlushDuration
  const xFor = (time: number) => margin.left + ((time - minimumTime) / (maximumTime - minimumTime)) * plotWidth
  const yFor = (value: number) => margin.top + plotHeight - (value / 180) * plotHeight
  const times = Array.from({ length: maximumTime - minimumTime + 1 }, (_, index) => minimumTime + index)
  const compactness = clamp(4 / flowRate, 0.65, 1.35)
  const arterialPeak = 12 + (injectionDuration * 0.28 * compactness)
  const iodineDeliveryRate = (flowRate * iodineConcentration) / 1000
  const totalIodineDose = (volume * iodineConcentration) / 1000
  const arterialAmplitude = 126 * Math.sqrt(iodineDeliveryRate / 1.4)
  const doseFactor = clamp(totalIodineDose / 35, 0.55, 1.6)
  const arterial = times.map((time) => gammaCurve(time, arrival, arterialPeak, arterialAmplitude, 3.1))
  const portal = times.map((time) => gammaCurve(time, arrival + 7, 43 + (injectionDuration * 0.18), 112 * Math.pow(doseFactor, 0.38), 2.2))
  const parenchyma = times.map((time) => gammaCurve(time, arrival + 11, 64 + (injectionDuration * 0.2), 84 * Math.pow(doseFactor, 0.38), 1.65))
  const pathFor = (values: number[]) => values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${xFor(times[index]).toFixed(2)} ${yFor(value).toFixed(2)}`).join(' ')
  const ticks = [-10, 0, 30, 60, 90, 180, 300]
  const scanEnd = scanStart + scanDuration
  const scanX = xFor(scanStart)
  const scanWidth = Math.max(2, xFor(scanEnd) - scanX)

  return (
    <svg className="ct-contrast-timing-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Illustrative contrast enhancement curves for ${iodineConcentration} milligrams iodine per milliliter, with contrast injection from 0 to ${injectionDuration.toFixed(1)} seconds, saline flush ending at ${flushEnd.toFixed(1)} seconds, and acquisition from ${scanStart.toFixed(0)} to ${scanEnd.toFixed(0)} seconds`}>
      <title>Injection and CT acquisition timing</title>
      <desc>Illustrative relative enhancement curves for arterial blood, portal venous blood, and abdominal parenchyma. The upper bar separates iodine injection from the following saline flush, and the shaded vertical band shows the selected acquisition window.</desc>
      <g className="ct-contrast-phase-bands" aria-hidden="true">
        <rect className="is-arterial" x={xFor(35)} y={margin.top} width={xFor(45) - xFor(35)} height={plotHeight} />
        <rect className="is-portal" x={xFor(60)} y={margin.top} width={xFor(80) - xFor(60)} height={plotHeight} />
        <rect className="is-delayed" x={xFor(180)} y={margin.top} width={xFor(300) - xFor(180)} height={plotHeight} />
      </g>
      <g className="ct-contrast-grid" aria-hidden="true">
        {[0, 60, 120, 180].map((value) => <line key={`y-${value}`} x1={margin.left} x2={width - margin.right} y1={yFor(value)} y2={yFor(value)} />)}
        {ticks.map((time) => <line key={`x-${time}`} x1={xFor(time)} x2={xFor(time)} y1={margin.top} y2={margin.top + plotHeight} />)}
      </g>
      <rect className="ct-contrast-scan-window" x={scanX} y={margin.top} width={scanWidth} height={plotHeight} />
      <line className="ct-contrast-injection-start" x1={xFor(0)} x2={xFor(0)} y1={margin.top - 7} y2={margin.top + plotHeight} />
      {triggerTime !== null && <line className="ct-contrast-trigger" x1={xFor(triggerTime)} x2={xFor(triggerTime)} y1={margin.top - 7} y2={margin.top + plotHeight} />}
      <path className="ct-contrast-curve is-arterial" d={pathFor(arterial)} />
      <path className="ct-contrast-curve is-portal" d={pathFor(portal)} />
      <path className="ct-contrast-curve is-parenchyma" d={pathFor(parenchyma)} />
      <g className="ct-contrast-injection-bar">
        <rect className="is-contrast" x={xFor(0)} y={14} width={Math.max(2, xFor(injectionDuration) - xFor(0))} height={8} rx={4} />
        <rect className="is-saline" x={xFor(injectionDuration)} y={14} width={Math.max(2, xFor(flushEnd) - xFor(injectionDuration))} height={8} rx={4} />
        <text className="is-contrast" x={(xFor(0) + xFor(injectionDuration)) / 2} y={10} textAnchor="middle">iodine contrast</text>
        <text className="is-saline" x={xFor(flushEnd) + 5} y={21}>saline flush</text>
      </g>
      <line className="ct-contrast-axis" x1={margin.left} x2={width - margin.right} y1={margin.top + plotHeight} y2={margin.top + plotHeight} />
      <line className="ct-contrast-axis" x1={margin.left} x2={margin.left} y1={margin.top} y2={margin.top + plotHeight} />
      {ticks.map((time, index) => <text className="ct-contrast-tick" key={time} x={xFor(time)} y={height - 28} textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}>{time}</text>)}
      <text className="ct-contrast-axis-title" x={(margin.left + width - margin.right) / 2} y={height - 7} textAnchor="middle">Time from injection start (s)</text>
      <text className="ct-contrast-y-title" x={15} y={margin.top + (plotHeight / 2)} textAnchor="middle" transform={`rotate(-90 15 ${margin.top + (plotHeight / 2)})`}>Schematic relative enhancement</text>
      <g className="ct-contrast-legend" transform={`translate(${margin.left + 10} ${margin.top + 12})`}>
        <line className="is-arterial" x1="0" x2="18" y1="0" y2="0" /><text x="23" y="4">arterial blood</text>
        <line className="is-portal" x1="117" x2="135" y1="0" y2="0" /><text x="140" y="4">portal venous blood</text>
        <line className="is-parenchyma" x1="286" x2="304" y1="0" y2="0" /><text x="309" y="4">parenchyma</text>
        <rect className="is-scan" x="390" y="-6" width="12" height="10" rx="2" /><text x="408" y="4">scan window</text>
      </g>
      {triggerTime !== null && <text className="ct-contrast-trigger-label" x={xFor(triggerTime)} y={margin.top + plotHeight - 8} textAnchor="middle">threshold</text>}
    </svg>
  )
}

export function CtContrastLesson() {
  const [timingMode, setTimingMode] = useState<ContrastTimingMode>('fixed')
  const [volume, setVolume] = useState(100)
  const [flowRate, setFlowRate] = useState(4)
  const [iodineConcentration, setIodineConcentration] = useState(350)
  const [arrival, setArrival] = useState(18)
  const [thresholdRiseTime, setThresholdRiseTime] = useState(3)
  const [fixedScanStart, setFixedScanStart] = useState(35)
  const [postTriggerDelay, setPostTriggerDelay] = useState(8)
  const [scanDuration, setScanDuration] = useState(8)
  const [selectedPhase, setSelectedPhase] = useState<ContrastPhaseId>('arterial')
  const salineFlushVolume = 30
  const injectionDuration = volume / flowRate
  const salineFlushDuration = salineFlushVolume / flowRate
  const iodineDeliveryRate = (flowRate * iodineConcentration) / 1000
  const totalIodineDose = (volume * iodineConcentration) / 1000
  const triggerTime = arrival + thresholdRiseTime
  const scanStart = timingMode === 'tracking' ? triggerTime + postTriggerDelay : fixedScanStart
  const scanPhase = contrastPhaseAt(scanStart, scanStart + scanDuration)
  const activePhase = contrastPhaseImages.find((phase) => phase.id === selectedPhase) ?? contrastPhaseImages[0]
  const setPreset = (phase: ContrastPhaseId, start: number) => {
    setTimingMode('fixed')
    setFixedScanStart(start)
    setSelectedPhase(phase)
  }
  const movePhaseFocus = (phase: ContrastPhaseId, direction: -1 | 1 | 'first' | 'last') => {
    const currentIndex = contrastPhaseImages.findIndex((candidate) => candidate.id === phase)
    const nextIndex = direction === 'first'
      ? 0
      : direction === 'last'
        ? contrastPhaseImages.length - 1
        : (currentIndex + direction + contrastPhaseImages.length) % contrastPhaseImages.length
    const nextPhase = contrastPhaseImages[nextIndex]
    setSelectedPhase(nextPhase.id)
    requestAnimationFrame(() => document.getElementById(`ct-phase-tab-${nextPhase.id}`)?.focus())
  }

  return (
    <div className="ct-built-lesson ct-contrast-lesson">
      <section className="ct-built-primary" aria-labelledby="ct-contrast-demo-title">
        <LessonHeader
          id="ct-contrast-demo-title"
          eyebrow="Interactive bolus timing"
          title="Place the scan on the enhancement curve"
          copy="Adjust injection and circulation, then move the acquisition window. Curves and timings are an illustrative abdominal teaching model—not patient-specific protocol recommendations."
          value={scanPhase.label}
        />
        <div className="ct-contrast-presets" aria-label="Representative contrast phase preset">
          <button type="button" aria-pressed={timingMode === 'fixed' && fixedScanStart < 0} onClick={() => setPreset('noncontrast', -10)}><small>Before injection</small><strong>Non-contrast</strong></button>
          <button type="button" aria-pressed={timingMode === 'fixed' && fixedScanStart === 35} onClick={() => setPreset('arterial', 35)}><small>35 s example</small><strong>Late arterial</strong></button>
          <button type="button" aria-pressed={timingMode === 'fixed' && fixedScanStart === 65} onClick={() => setPreset('portal', 65)}><small>65 s example</small><strong>Portal venous</strong></button>
          <button type="button" aria-pressed={timingMode === 'fixed' && fixedScanStart === 240} onClick={() => setPreset('delayed', 240)}><small>4 min example</small><strong>Delayed</strong></button>
        </div>
        <div className="ct-contrast-workbench">
          <div className="ct-contrast-controls">
            <div>
              <span className="ct-control-label">Timing method</span>
              <div className="ct-segmented" aria-label="Contrast timing method">
                <button type="button" aria-pressed={timingMode === 'fixed'} onClick={() => setTimingMode('fixed')}>Fixed delay</button>
                <button type="button" aria-pressed={timingMode === 'tracking'} onClick={() => setTimingMode('tracking')}>Bolus tracking</button>
              </div>
            </div>
            <label><span>Contrast volume <strong>{volume} mL</strong></span><input aria-label="Contrast volume" type="range" min="60" max="140" step="5" value={volume} style={ctRangeProgressStyle(volume, 60, 140)} onChange={(event) => setVolume(Number(event.target.value))} /></label>
            <label><span>Iodine concentration <strong>{iodineConcentration} mg I/mL</strong></span><input aria-label="Iodine concentration" type="range" min="250" max="400" step="10" value={iodineConcentration} style={ctRangeProgressStyle(iodineConcentration, 250, 400)} onChange={(event) => setIodineConcentration(Number(event.target.value))} /></label>
            <label><span>Flow rate <strong>{flowRate.toFixed(1)} mL/s</strong></span><input aria-label="Contrast flow rate" type="range" min="2" max="6" step="0.5" value={flowRate} style={ctRangeProgressStyle(flowRate, 2, 6)} onChange={(event) => setFlowRate(Number(event.target.value))} /></label>
            <label><span>Estimated arrival <strong>{arrival} s</strong></span><input aria-label="Estimated bolus arrival" type="range" min="12" max="30" step="1" value={arrival} style={ctRangeProgressStyle(arrival, 12, 30)} onChange={(event) => setArrival(Number(event.target.value))} /></label>
            {timingMode === 'tracking' && <label><span>Arrival → ROI threshold <strong>{thresholdRiseTime} s</strong></span><input aria-label="Modeled time from bolus arrival to ROI threshold" type="range" min="1" max="10" step="1" value={thresholdRiseTime} style={ctRangeProgressStyle(thresholdRiseTime, 1, 10)} onChange={(event) => setThresholdRiseTime(Number(event.target.value))} /></label>}
            {timingMode === 'fixed'
              ? <label><span>Scan starts <strong>{fixedScanStart < 0 ? `${Math.abs(fixedScanStart)} s before injection` : `${fixedScanStart} s`}</strong></span><input aria-label="Fixed scan start after injection" type="range" min="-12" max="300" step="1" value={fixedScanStart} style={ctRangeProgressStyle(fixedScanStart, -12, 300)} onChange={(event) => setFixedScanStart(Number(event.target.value))} /></label>
              : <label><span>Post-trigger delay <strong>{postTriggerDelay} s</strong></span><input aria-label="Bolus tracking post-trigger delay" type="range" min="3" max="30" step="1" value={postTriggerDelay} style={ctRangeProgressStyle(postTriggerDelay, 3, 30)} onChange={(event) => setPostTriggerDelay(Number(event.target.value))} /></label>}
            <label><span>Scan duration <strong>{scanDuration} s</strong></span><input aria-label="Contrast scan duration" type="range" min="4" max="20" step="1" value={scanDuration} style={ctRangeProgressStyle(scanDuration, 4, 20)} onChange={(event) => setScanDuration(Number(event.target.value))} /></label>
          </div>
          <div className="ct-contrast-plot">
            <ContrastTimingGraph volume={volume} flowRate={flowRate} iodineConcentration={iodineConcentration} salineFlushVolume={salineFlushVolume} arrival={arrival} scanStart={scanStart} scanDuration={scanDuration} triggerTime={timingMode === 'tracking' ? triggerTime : null} />
          </div>
        </div>
        <div className="ct-contrast-readout" aria-live="polite">
          <div><span>Iodine delivery</span><strong>{totalIodineDose.toFixed(1)} g I total · {iodineDeliveryRate.toFixed(2)} g I/s</strong><small>{volume} mL at {iodineConcentration} mg I/mL over {injectionDuration.toFixed(1)} s</small></div>
          <div><span>{timingMode === 'tracking' ? 'Schematic trigger' : 'Clock origin'}</span><strong>{timingMode === 'tracking' ? `ROI threshold at ${triggerTime} s` : 'injection start = 0 s'}</strong><small>{timingMode === 'tracking' ? `${thresholdRiseTime} s after modeled arrival · ${postTriggerDelay} s post-trigger delay` : `${salineFlushVolume} mL saline flush follows for ${salineFlushDuration.toFixed(1)} s`}</small></div>
          <div><span>Acquisition window</span><strong>{scanStart.toFixed(0)}–{(scanStart + scanDuration).toFixed(0)} s</strong><small>{scanDuration} s means different z positions are sampled at slightly different times</small></div>
          <div><span>Teaching classification</span><strong>{scanPhase.label}</strong><small>{scanPhase.note}</small></div>
        </div>
        <p className="ct-built-caption">The graph is a schematic teaching model. It makes iodine dose, iodine delivery rate, bolus arrival, ROI threshold crossing, and the saline flush visible, but it does not predict measured vessel HU, patient enhancement, diagnostic adequacy, or safety.</p>
      </section>

      <section className="ct-built-card" aria-labelledby="ct-phase-comparison-title">
        <LessonHeader id="ct-phase-comparison-title" eyebrow="Matched clinical phases" title="One examination at four time points" copy="Compare the same case across phases. Small differences in breath-hold and slice position can remain even within one examination." value={activePhase.label} />
        <div className="ct-contrast-phase-tabs" role="tablist" aria-label="Matched CT contrast phase">
          {contrastPhaseImages.map((phase) => (
            <button key={phase.id} type="button" role="tab" id={`ct-phase-tab-${phase.id}`} aria-controls="ct-phase-panel" aria-selected={selectedPhase === phase.id} tabIndex={selectedPhase === phase.id ? 0 : -1} onClick={() => setSelectedPhase(phase.id)} onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') { event.preventDefault(); movePhaseFocus(phase.id, -1) }
              if (event.key === 'ArrowRight') { event.preventDefault(); movePhaseFocus(phase.id, 1) }
              if (event.key === 'Home') { event.preventDefault(); movePhaseFocus(phase.id, 'first') }
              if (event.key === 'End') { event.preventDefault(); movePhaseFocus(phase.id, 'last') }
            }}>
              <span className="ct-contrast-phase-image">
                <img src={`${import.meta.env.BASE_URL}assets/ct-contrast-phases.jpg`} style={{ transform: `translateY(-${phase.crop * 25}%)` }} alt={`Axial abdominal CT from the matched liver abscess case, ${phase.label.toLowerCase()} phase`} />
              </span>
              <span><strong>{phase.label}</strong><small>{phase.timing}</small></span>
            </button>
          ))}
        </div>
        <div id="ct-phase-panel" role="tabpanel" aria-labelledby={`ct-phase-tab-${selectedPhase}`} className="ct-contrast-phase-panel" aria-live="polite">
          <div><span>What this phase represents</span><p>{activePhase.description}</p></div>
          <div><span>What changes in this case</span><p>{activePhase.pattern}</p></div>
        </div>
        <p className="ct-contrast-attribution">The baked-in white arrows mark the transient hepatic attenuation difference described by the source. Clinical image: Khaladkar, Bakshi, Bhargava, and Kulkarni, cropped from <a href="https://commons.wikimedia.org/wiki/File:CT_of_abscess_and_THAD.jpg" target="_blank" rel="noreferrer">CT of abscess and THAD</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.</p>
      </section>

      <section className="ct-built-card" aria-labelledby="ct-phase-reference-title">
        <LessonHeader id="ct-phase-reference-title" eyebrow="Phase and provenance reference" title="Classify by timing and enhancement—not name alone" copy="Representative ranges below orient the learner to a common multiphasic liver examination. Other clinical questions use different targets and phase names." />
        <div className="ct-table-wrap"><table className="ct-built-table ct-contrast-reference-table" aria-label="CT contrast phase reference"><colgroup><col className="is-phase" /><col className="is-timing" /><col className="is-emphasis" /><col className="is-risk" /></colgroup><thead><tr><th>Phase or target</th><th>Representative timing reference</th><th>Enhancement emphasis</th><th>ML ingestion risk</th></tr></thead><tbody>
          <tr><th>Non-contrast</th><td data-label="Representative timing reference">Before IV iodine</td><td data-label="Enhancement emphasis">Baseline tissue, calcification, blood products, fat</td><td data-label="ML ingestion risk">Misclassified as a poorly enhanced post-contrast series</td></tr>
          <tr><th>First-pass / angiographic target</th><td data-label="Representative timing reference">Usually bolus tracked; vessel and examination specific</td><td data-label="Enhancement emphasis">Target arterial lumen</td><td data-label="ML ingestion risk">Grouped with late arterial despite different parenchymal enhancement</td></tr>
          <tr><th>Late arterial</th><td data-label="Representative timing reference">Illustrative fixed-delay liver example: about 35–45 s from injection start</td><td data-label="Enhancement emphasis">Arteries plus developing organ enhancement</td><td data-label="ML ingestion risk">Fixed-delay and triggered acquisitions treated as equivalent</td></tr>
          <tr><th>Portal venous</th><td data-label="Representative timing reference">Illustrative abdominal example: about 60–80 s</td><td data-label="Enhancement emphasis">Portal veins and more uniform abdominal parenchyma</td><td data-label="ML ingestion risk">Mixed with late venous or single-phase routine abdomen</td></tr>
          <tr><th>Delayed</th><td data-label="Representative timing reference">Illustrative liver example: about 3–5 min</td><td data-label="Enhancement emphasis">Redistribution, retention, and washout</td><td data-label="ML ingestion risk">“Delayed” or “equilibrium” used without the actual delay or clinical target</td></tr>
          <tr><th>Organ-specific phases</th><td data-label="Representative timing reference">Protocol dependent</td><td data-label="Enhancement emphasis">Examples include nephrographic and excretory targets</td><td data-label="ML ingestion risk">Forced into generic arterial/venous labels</td></tr>
        </tbody></table></div>
        <div className="ct-contrast-metadata" aria-label="Contrast metadata to preserve">
          <div><strong>Injection</strong><span>agent · iodine concentration · volume · flow rate · duration · saline flush</span></div>
          <div><strong>Timing</strong><span>injection start/stop · test bolus or tracking · vessel/threshold · post-trigger delay · acquisition time</span></div>
          <div><strong>Acquisition</strong><span>intended phase · scan duration · direction · coverage · tube voltage or spectral energy · reconstruction and series relationship</span></div>
          <p><strong>DICOM caveat.</strong> Standard fields can encode agent, route, volume, start/stop time, total dose, flow rate/duration, ingredient, and concentration, but these fields may be absent or incomplete. Injector logs and protocol records may be needed to recover the full timing chain.</p>
        </div>
        <nav className="ct-contrast-sources" aria-label="Contrast timing references"><span>References</span><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9406360/" target="_blank" rel="noreferrer">Representative multiphasic liver timing</a><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5893493/" target="_blank" rel="noreferrer">Iodine delivery rate and dose</a><a href="https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.7.6.4.html" target="_blank" rel="noreferrer">Current DICOM Contrast/Bolus Module</a></nav>
      </section>
    </div>
  )
}

type ArtifactId = 'motion' | 'metal' | 'beam-hardening' | 'partial-volume' | 'truncation' | 'rings' | 'sparse-views'

const artifactDefinitions: Array<{ id: ArtifactId; label: string; cause: string; signature: string; image: string; note: string }> = [
  { id: 'motion', label: 'Motion', cause: 'Object changes between angles.', signature: 'Sinogram traces become discontinuous or duplicated.', image: 'Blur, doubled edges, or streaks.', note: 'Check whether anatomy moved during the acquisition rather than treating the pattern as intrinsic structure.' },
  { id: 'metal', label: 'Metal', cause: 'Selected paths have extreme attenuation and spectral errors.', signature: 'Bright or missing bands follow metal-intersecting rays.', image: 'Alternating bright and dark streaks.', note: 'Metal artifact reduction may alter both the artifact and nearby anatomy; keep the reconstruction method with the series.' },
  { id: 'beam-hardening', label: 'Beam hardening', cause: 'Low-energy photons are removed preferentially.', signature: 'Path response becomes nonlinear with object thickness.', image: 'Cupping or dark bands between dense objects.', note: 'Calibration and correction reduce the effect, but residual patterns can remain around dense anatomy.' },
  { id: 'partial-volume', label: 'Partial volume', cause: 'One voxel averages materials that are not resolved separately.', signature: 'Projection data can be valid; the reconstructed sampling region is too large.', image: 'Intermediate values and softened small structures.', note: 'Thinner slices or finer sampling can reduce averaging, although noise and data volume may increase.' },
  { id: 'truncation', label: 'Truncation', cause: 'Anatomy extends beyond the measured detector field.', signature: 'Projection profiles are cut off at detector edges.', image: 'Bright borders, shading, or missing peripheral anatomy.', note: 'Inspect reconstruction field of view and whether the patient was fully covered by the acquisition.' },
  { id: 'rings', label: 'Rings', cause: 'A detector-channel calibration error repeats at every angle.', signature: 'One channel forms a nearly straight band through angle space.', image: 'Concentric rings around isocenter.', note: 'The circular image pattern originates from a detector-fixed error, not a circular structure in the patient.' },
  { id: 'sparse-views', label: 'Sparse views', cause: 'Too few angular measurements constrain the image.', signature: 'Large gaps exist along the angle axis.', image: 'Directional streaks radiate from high-contrast edges.', note: 'This is a sampling limitation: interpolation cannot create independent measurements that were never acquired.' },
]

function ArtifactObject({ artifact }: { artifact: ArtifactId }) {
  return (
    <svg viewBox="0 0 230 210" role="img" aria-label={`${artifact} cause in object space`}>
      <ellipse className="is-body" cx="115" cy="105" rx="73" ry="88" />
      <ellipse className="is-lung" cx="88" cy="101" rx="25" ry="48" /><ellipse className="is-lung" cx="142" cy="101" rx="25" ry="48" />
      {artifact === 'motion' && <ellipse className="is-motion" cx="124" cy="105" rx="73" ry="88" />}
      {artifact === 'metal' && <circle className="is-metal" cx="151" cy="91" r="12" />}
      {artifact === 'beam-hardening' && <><circle className="is-dense" cx="85" cy="75" r="10" /><circle className="is-dense" cx="145" cy="75" r="10" /></>}
      {artifact === 'partial-volume' && <circle className="is-partial" cx="71" cy="123" r="9" />}
      {artifact === 'truncation' && <><rect className="is-fov" x="55" y="12" width="120" height="186" /><path className="is-cut" d="M 55 20 L 55 190 M 175 20 L 175 190" /></>}
      {artifact === 'rings' && <circle className="is-detector-error" cx="115" cy="105" r="4" />}
      {artifact === 'sparse-views' && Array.from({ length: 8 }, (_, index) => <line key={index} className="is-spoke" x1="115" y1="105" x2={115 + (Math.cos(index * Math.PI / 4) * 101)} y2={105 + (Math.sin(index * Math.PI / 4) * 101)} />)}
    </svg>
  )
}

function ArtifactSinogram({ artifact }: { artifact: ArtifactId }) {
  const curves = [0, 1, 2, 3].map((curve) => Array.from({ length: 48 }, (_, index) => {
    const t = index / 47
    const x = 16 + (t * 198)
    const y = 105 + (Math.sin((t * Math.PI * 2) + (curve * 1.15)) * (20 + curve * 8))
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' '))
  return (
    <svg viewBox="0 0 230 210" role="img" aria-label={`${artifact} signature in sinogram space`}>
      <rect className="is-field" x="12" y="12" width="206" height="186" />
      {curves.map((path, index) => <path key={index} className="is-trace" d={path} />)}
      {artifact === 'motion' && <path className="is-artifact" d="M 112 12 L 112 78 L 132 92 L 132 198" />}
      {artifact === 'metal' && <path className="is-artifact is-wide" d={curves[2]} />}
      {artifact === 'beam-hardening' && <path className="is-shade" d="M 12 92 C 70 68 162 70 218 102 L 218 132 C 162 106 68 110 12 138 Z" />}
      {artifact === 'partial-volume' && <path className="is-soft-trace" d={curves[0]} />}
      {artifact === 'truncation' && <><rect className="is-mask" x="12" y="12" width="20" height="186" /><rect className="is-mask" x="198" y="12" width="20" height="186" /></>}
      {artifact === 'rings' && <line className="is-artifact" x1="144" x2="144" y1="12" y2="198" />}
      {artifact === 'sparse-views' && Array.from({ length: 9 }, (_, index) => <rect key={index} className="is-mask" x={24 + (index * 22)} y="12" width="13" height="186" />)}
    </svg>
  )
}

function ArtifactImage({ artifact }: { artifact: ArtifactId }) {
  return (
    <svg viewBox="0 0 230 210" role="img" aria-label={`${artifact} appearance in reconstructed image space`}>
      <ellipse className="is-body" cx="115" cy="105" rx="73" ry="88" />
      <ellipse className="is-lung" cx="88" cy="101" rx="25" ry="48" /><ellipse className="is-lung" cx="142" cy="101" rx="25" ry="48" />
      {artifact === 'motion' && <><ellipse className="is-ghost" cx="123" cy="108" rx="73" ry="88" /><path className="is-streak" d="M 34 76 L 202 142 M 30 92 L 196 158" /></>}
      {artifact === 'metal' && <><circle className="is-metal" cx="151" cy="91" r="12" />{Array.from({ length: 12 }, (_, index) => <line key={index} className="is-streak" x1="151" y1="91" x2={151 + Math.cos(index * Math.PI / 6) * 120} y2={91 + Math.sin(index * Math.PI / 6) * 120} />)}</>}
      {artifact === 'beam-hardening' && <path className="is-dark-band" d="M 69 80 Q 115 122 161 80 Q 148 120 115 132 Q 82 120 69 80 Z" />}
      {artifact === 'partial-volume' && <circle className="is-partial" cx="71" cy="123" r="12" />}
      {artifact === 'truncation' && <><path className="is-bright-edge" d="M 50 30 Q 25 105 50 180 M 180 30 Q 205 105 180 180" /><rect className="is-crop" x="20" y="0" width="24" height="210" /><rect className="is-crop" x="186" y="0" width="24" height="210" /></>}
      {artifact === 'rings' && <>{[20, 34, 49, 64].map((radius) => <circle key={radius} className="is-ring" cx="115" cy="105" r={radius} />)}</>}
      {artifact === 'sparse-views' && Array.from({ length: 12 }, (_, index) => <line key={index} className="is-streak" x1="115" y1="105" x2={115 + Math.cos(index * Math.PI / 6) * 125} y2={105 + Math.sin(index * Math.PI / 6) * 125} />)}
    </svg>
  )
}

export function CtArtifactsLesson() {
  const [selected, setSelected] = useState<ArtifactId>('motion')
  const definition = artifactDefinitions.find((item) => item.id === selected) ?? artifactDefinitions[0]
  return (
    <div className="ct-built-lesson ct-artifacts-lesson">
      <section className="ct-built-primary" aria-labelledby="ct-artifact-demo-title">
        <LessonHeader id="ct-artifact-demo-title" eyebrow="Synchronized artifact map" title="Cause → projection data → reconstructed image" copy="Select an artifact and trace where the inconsistency begins before learning its image-space signature." value={definition.label} />
        <div className="ct-artifact-picker" aria-label="Artifact type">{artifactDefinitions.map((artifact) => <button key={artifact.id} type="button" aria-pressed={selected === artifact.id} onClick={() => setSelected(artifact.id)}>{artifact.label}</button>)}</div>
        <div className="ct-artifact-triptych">
          <figure><figcaption><span>01</span>Object or acquisition</figcaption><ArtifactObject artifact={selected} /><p>{definition.cause}</p></figure>
          <b aria-hidden="true">→</b>
          <figure><figcaption><span>02</span>Projection space</figcaption><ArtifactSinogram artifact={selected} /><p>{definition.signature}</p></figure>
          <b aria-hidden="true">→</b>
          <figure><figcaption><span>03</span>Image space</figcaption><ArtifactImage artifact={selected} /><p>{definition.image}</p></figure>
        </div>
        <aside className="ct-artifact-note" aria-live="polite"><strong>Interpretation</strong><p>{definition.note}</p></aside>
      </section>
    </div>
  )
}
