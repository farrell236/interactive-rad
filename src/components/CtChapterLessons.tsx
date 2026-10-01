import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Pause, Play, RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import ctSliceUrl from '../assets/ct/lidc-idri-0001-i060-hu16le.bin?url'
import { getCtProjectionModel, simulateCtProjectionNoise } from '../lib/ctProjectionNoise'
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

type Point3 = [number, number, number]

const CONE_SOURCE: Point3 = [-3.55, 0, 0]
const CONE_DETECTOR_X = 3.55
const CONE_DETECTOR_HALF_HEIGHT = 1.45
const CONE_DETECTOR_HALF_WIDTH = 1.25

const CONE_CORNERS: Point3[] = [
  [CONE_DETECTOR_X, CONE_DETECTOR_HALF_HEIGHT, -CONE_DETECTOR_HALF_WIDTH],
  [CONE_DETECTOR_X, CONE_DETECTOR_HALF_HEIGHT, CONE_DETECTOR_HALF_WIDTH],
  [CONE_DETECTOR_X, -CONE_DETECTOR_HALF_HEIGHT, CONE_DETECTOR_HALF_WIDTH],
  [CONE_DETECTOR_X, -CONE_DETECTOR_HALF_HEIGHT, -CONE_DETECTOR_HALF_WIDTH],
]

function BeamTriangle({ points, opacity }: { points: [Point3, Point3, Point3]; opacity: number }) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3))
    next.computeVertexNormals()
    return next
  }, [points])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial color="#28c3e6" transparent opacity={opacity} side={THREE.DoubleSide} depthTest depthWrite={false} />
    </mesh>
  )
}

function planeSphereIntersection(rowY: number, radius = 1.006) {
  const a = Math.abs(CONE_SOURCE[0])
  const normal = new THREE.Vector3(rowY, -(2 * a), 0)
  const normalLengthSquared = normal.lengthSq()
  const constant = rowY * a
  const center = normal.clone().multiplyScalar(-constant / normalLengthSquared)
  const circleRadius = Math.sqrt(Math.max(0, (radius * radius) - center.lengthSq()))
  const normalUnit = normal.clone().normalize()
  const basisDepth = new THREE.Vector3(0, 0, 1)
  const basisAcross = new THREE.Vector3().crossVectors(normalUnit, basisDepth).normalize()

  return Array.from({ length: 97 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2
    const point = center.clone()
      .addScaledVector(basisDepth, Math.cos(angle) * circleRadius)
      .addScaledVector(basisAcross, Math.sin(angle) * circleRadius)
      .normalize()
      .multiplyScalar(radius)
    return point.toArray() as Point3
  })
}

function ConeBeamIntersectionScene() {
  const rowPlanes = useMemo(() => [-1.05, 0, 1.05].map((rowY) => ({
    rowY,
    triangle: [
      CONE_SOURCE,
      [CONE_DETECTOR_X, rowY, -CONE_DETECTOR_HALF_WIDTH] as Point3,
      [CONE_DETECTOR_X, rowY, CONE_DETECTOR_HALF_WIDTH] as Point3,
    ] as [Point3, Point3, Point3],
    intersection: planeSphereIntersection(rowY),
  })), [])

  return (
    <div className="ct-cone-3d" role="img" aria-label="Three-dimensional cone beam intersecting a spherical patient volume before reaching a two-dimensional detector array">
      <div className="ct-cone-3d-stage">
        <Canvas
          className="ct-cone-3d-canvas"
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={{ position: [0.9, 2.65, 8.4], rotation: [-0.29, 0.105, 0.03], fov: 35, near: 0.1, far: 30 }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={1.35} />
          <directionalLight position={[-3, 4, 6]} intensity={2.7} />
          <directionalLight position={[4, -2, 3]} intensity={1.1} color="#b9eafa" />

          <group position={[0, 0.18, 0]}>
          <mesh position={[0, 0, 0]} renderOrder={1}>
            <sphereGeometry args={[1, 72, 48]} />
            <meshStandardMaterial color="#9fb2ba" roughness={0.58} metalness={0.02} />
          </mesh>

          {[
            [CONE_SOURCE, CONE_CORNERS[0], CONE_CORNERS[1]],
            [CONE_SOURCE, CONE_CORNERS[1], CONE_CORNERS[2]],
            [CONE_SOURCE, CONE_CORNERS[2], CONE_CORNERS[3]],
            [CONE_SOURCE, CONE_CORNERS[3], CONE_CORNERS[0]],
          ].map((points, index) => <BeamTriangle key={`surface-${index}`} points={points as [Point3, Point3, Point3]} opacity={index === 0 || index === 2 ? 0.17 : 0.12} />)}

          {rowPlanes.map(({ rowY, triangle, intersection }) => (
            <group key={`row-plane-${rowY}`}>
              <BeamTriangle points={triangle} opacity={rowY === 0 ? 0.22 : 0.11} />
              <Line points={intersection} color={rowY === 0 ? '#0e9fbe' : '#27b7d6'} lineWidth={rowY === 0 ? 1.85 : 1.2} depthTest depthWrite={false} transparent opacity={rowY === 0 ? 1 : 0.86} />
            </group>
          ))}

          {CONE_CORNERS.map((corner, index) => (
            <Line key={`cone-edge-${index}`} points={[CONE_SOURCE, corner]} color="#27b7d6" lineWidth={1.1} depthTest depthWrite={false} transparent opacity={0.95} />
          ))}

          <mesh position={CONE_SOURCE}>
            <sphereGeometry args={[0.13, 24, 16]} />
            <meshStandardMaterial color="#27b7d6" emissive="#0d6d82" emissiveIntensity={0.25} />
          </mesh>

          <mesh position={[CONE_DETECTOR_X, 0, 0]}>
            <boxGeometry args={[0.08, CONE_DETECTOR_HALF_HEIGHT * 2, CONE_DETECTOR_HALF_WIDTH * 2]} />
            <meshStandardMaterial color="#cbd7dc" roughness={0.72} metalness={0.02} />
          </mesh>

          {Array.from({ length: 7 }, (_, index) => {
            const y = -CONE_DETECTOR_HALF_HEIGHT + ((index / 6) * CONE_DETECTOR_HALF_HEIGHT * 2)
            return <Line key={`detector-row-${index}`} points={[[CONE_DETECTOR_X - 0.045, y, -CONE_DETECTOR_HALF_WIDTH], [CONE_DETECTOR_X - 0.045, y, CONE_DETECTOR_HALF_WIDTH]]} color="#546a73" lineWidth={0.72} />
          })}
          {Array.from({ length: 6 }, (_, index) => {
            const z = -CONE_DETECTOR_HALF_WIDTH + ((index / 5) * CONE_DETECTOR_HALF_WIDTH * 2)
            return <Line key={`detector-column-${index}`} points={[[CONE_DETECTOR_X - 0.045, -CONE_DETECTOR_HALF_HEIGHT, z], [CONE_DETECTOR_X - 0.045, CONE_DETECTOR_HALF_HEIGHT, z]]} color="#546a73" lineWidth={0.72} />
          })}
          </group>
        </Canvas>
        <span className="is-source-label">source</span>
        <span className="is-patient-label">patient</span>
        <span className="is-detector-label">2D detector array</span>
        <span className="is-detector-axis">rows × channels</span>
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
            <tr><th>Source</th><td>Produces the X-ray beam from each acquisition angle.</td></tr>
            <tr><th>Detector array</th><td>Samples transmitted intensity across channels and rows.</td></tr>
            <tr><th>Gantry</th><td>Maintains and rotates the source–detector geometry.</td></tr>
            <tr><th>Isocenter</th><td>Defines the rotation axis and nominal reconstruction center.</td></tr>
            <tr><th>Collimation</th><td>Sets the nominal irradiated beam width along z.</td></tr>
            <tr><th>Table</th><td>Positions or continuously moves the patient through the beam.</td></tr>
            <tr><th>Fan / cone beam</th><td>A fan spreads across channels in one plane; multiple rows give it cone-like z extent.</td></tr>
            <tr><th>Pitch</th><td>Table travel per rotation divided by nominal collimated beam width in helical CT.</td></tr>
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
          <tr><th>Unfiltered backprojection</th><td>Spread each measurement along its ray.</td><td>Strong low-frequency blur.</td><td>Low</td></tr>
          <tr><th>Filtered backprojection</th><td>Filter projections, then backproject.</td><td>Fast; noise and resolution depend on the filter or kernel.</td><td>Moderate</td></tr>
          <tr><th>Iterative</th><td>Predict measurements, compare, update.</td><td>Model- and regularization-dependent texture.</td><td>Higher</td></tr>
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

function ProtocolImage({ mas, pitch, thickness, kernel, label }: { mas: number; pitch: number; thickness: number; kernel: Kernel; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { pixels, loadError } = useProtocolCtPixels()
  const simulation = useMemo(() => {
    if (!pixels) return null
    const model = getCtProjectionModel(pixels)
    return { ...simulateCtProjectionNoise(model, mas, pitch, thickness, kernel), size: model.imageSize }
  }, [kernel, mas, pitch, pixels, thickness])

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
  const kernelNoise = { smooth: 0.72, standard: 1, sharp: 1.42 }[kernel]
  const kernelDetail = { smooth: 0.76, standard: 1, sharp: 1.22 }[kernel]
  const noiseIndex = clamp(36 * Math.sqrt(120 / mas) * Math.sqrt(2.5 / thickness) * kernelNoise, 8, 98)
  const detailIndex = clamp(52 * Math.sqrt(2.5 / thickness) * kernelDetail, 20, 98)
  const relativeOutput = clamp((mas / 120) / pitch * 100, 18, 250)
  const incidentPhotons = Math.round(clamp(65536 * (mas / 120) * (1 / pitch) * (thickness / 2.5), 2048, 1048576))

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
            <ProtocolImage mas={mas} pitch={pitch} thickness={thickness} kernel={kernel} label={`Poisson-noisy reconstruction of a real LIDC-IDRI chest slice with ${mas} mAs, pitch ${pitch.toFixed(1)}, ${thickness} millimeter slices, and ${kernel} kernel`} />
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
          <figure><ProtocolImage mas={120} pitch={1} thickness={2.5} kernel="smooth" label="Smooth-kernel reconstruction of the LIDC-IDRI chest slice" /><figcaption><strong>Smooth</strong><span>Lower noise; softer edges and fine texture.</span></figcaption></figure>
          <div className="ct-edge-profile" aria-hidden="true"><span>edge response</span><svg viewBox="0 0 180 90"><path className="is-smooth" d="M 8 72 C 62 72 70 18 124 18 L 172 18" /><path className="is-sharp" d="M 8 72 L 88 72 L 92 12 L 97 22 L 172 22" /></svg></div>
          <figure><ProtocolImage mas={120} pitch={1} thickness={2.5} kernel="sharp" label="Sharp-kernel reconstruction of the LIDC-IDRI chest slice" /><figcaption><strong>Sharp</strong><span>Stronger edges; more prominent noise and texture.</span></figcaption></figure>
        </div>
      </section>

      <section className="ct-built-card">
        <LessonHeader eyebrow="Effect table" title="Parameter → visible consequence" copy="Use directions as relationships, not as universal clinical prescriptions." />
        <div className="ct-table-wrap"><table className="ct-built-table"><thead><tr><th>Parameter</th><th>Primary effect</th><th>Common visible change</th><th>Linked trade-off</th></tr></thead><tbody>
          <tr><th>mAs ↑</th><td>More photons</td><td>Lower quantum noise</td><td>Higher tube output</td></tr>
          <tr><th>Pitch ↑</th><td>More table travel per rotation</td><td>Less longitudinal overlap</td><td>Coverage and sampling change</td></tr>
          <tr><th>Slice thickness ↑</th><td>More signal averaged through z</td><td>Lower noise, more partial volume</td><td>Less through-plane detail</td></tr>
          <tr><th>Sharper kernel</th><td>More high-frequency response</td><td>Sharper edges and noisier texture</td><td>Detail–noise balance</td></tr>
          <tr><th>Field of view ↓</th><td>Smaller nominal pixel spacing</td><td>Finer sampling grid</td><td>Does not guarantee true resolution</td></tr>
        </tbody></table></div>
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
