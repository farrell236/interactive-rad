import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { ctRangeProgressStyle } from '../lib/rangeProgress'
import CtVolumeAcquisition from './CtVolumeAcquisition'

const GRID_SIZE = 72
const DETECTOR_COUNT = 96
const MAX_VIEWS = 60
const ROOT_TWO = Math.sqrt(2)
const SINOGRAM_WINDOW_ROWS = 42

function insideEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rotation = 0) {
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const dx = x - cx
  const dy = y - cy
  const localX = (dx * cosine) + (dy * sine)
  const localY = (-dx * sine) + (dy * cosine)
  return ((localX * localX) / (rx * rx)) + ((localY * localY) / (ry * ry)) <= 1
}

const MODIFIED_SHEPP_LOGAN_ELLIPSES = [
  { value: 1, rx: 0.69, ry: 0.92, x: 0, y: 0, rotation: 0 },
  { value: -0.8, rx: 0.6624, ry: 0.874, x: 0, y: -0.0184, rotation: 0 },
  { value: -0.2, rx: 0.11, ry: 0.31, x: 0.22, y: 0, rotation: -18 },
  { value: -0.2, rx: 0.16, ry: 0.41, x: -0.22, y: 0, rotation: 18 },
  { value: 0.1, rx: 0.21, ry: 0.25, x: 0, y: 0.35, rotation: 0 },
  { value: 0.1, rx: 0.046, ry: 0.046, x: 0, y: 0.1, rotation: 0 },
  { value: 0.1, rx: 0.046, ry: 0.046, x: 0, y: -0.1, rotation: 0 },
  { value: 0.1, rx: 0.046, ry: 0.023, x: -0.08, y: -0.605, rotation: 0 },
  { value: 0.1, rx: 0.023, ry: 0.023, x: 0, y: -0.606, rotation: 0 },
  { value: 0.1, rx: 0.023, ry: 0.046, x: 0.06, y: -0.605, rotation: 0 },
] as const

function createModifiedSheppLoganPhantom() {
  const phantom = new Float32Array(GRID_SIZE * GRID_SIZE)

  for (let row = 0; row < GRID_SIZE; row += 1) {
    const y = ((row + 0.5) / GRID_SIZE) * 2 - 1
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const x = ((column + 0.5) / GRID_SIZE) * 2 - 1
      let attenuation = 0

      for (const ellipse of MODIFIED_SHEPP_LOGAN_ELLIPSES) {
        if (insideEllipse(x, y, ellipse.x, ellipse.y, ellipse.rx, ellipse.ry, (ellipse.rotation / 180) * Math.PI)) attenuation += ellipse.value
      }

      phantom[(row * GRID_SIZE) + column] = Math.max(0, attenuation)
    }
  }

  return phantom
}

const SHEPP_LOGAN_PHANTOM = createModifiedSheppLoganPhantom()

function forwardProject(image: Float32Array, angle: number) {
  const projection = new Float32Array(DETECTOR_COUNT)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)

  for (let row = 0; row < GRID_SIZE; row += 1) {
    const y = ((row + 0.5) / GRID_SIZE) * 2 - 1
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const value = image[(row * GRID_SIZE) + column]
      if (value === 0) continue

      const x = ((column + 0.5) / GRID_SIZE) * 2 - 1
      const detectorPosition = (x * cosine) + (y * sine)
      const detectorIndex = ((detectorPosition + ROOT_TWO) / (ROOT_TWO * 2)) * (DETECTOR_COUNT - 1)
      const lower = Math.floor(detectorIndex)
      const fraction = detectorIndex - lower

      if (lower >= 0 && lower < DETECTOR_COUNT) projection[lower] += value * (1 - fraction)
      if (lower + 1 >= 0 && lower + 1 < DETECTOR_COUNT) projection[lower + 1] += value * fraction
    }
  }

  for (let index = 0; index < projection.length; index += 1) projection[index] /= GRID_SIZE
  return projection
}

function rampFilter(projection: Float32Array) {
  const filtered = new Float32Array(DETECTOR_COUNT)

  for (let index = 0; index < DETECTOR_COUNT; index += 1) {
    let value = projection[index] * 0.25
    for (let offset = 1; offset < DETECTOR_COUNT; offset += 2) {
      const coefficient = -1 / (Math.PI * Math.PI * offset * offset)
      if (index - offset >= 0) value += projection[index - offset] * coefficient
      if (index + offset < DETECTOR_COUNT) value += projection[index + offset] * coefficient
    }
    filtered[index] = value
  }

  return filtered
}

function reconstruct(viewCount: number, acquiredViews = viewCount) {
  const reconstruction = new Float32Array(GRID_SIZE * GRID_SIZE)
  const projections = Array.from({ length: acquiredViews }, (_, view) => {
    const angle = (view / viewCount) * Math.PI
    return { angle, projection: rampFilter(forwardProject(SHEPP_LOGAN_PHANTOM, angle)) }
  })

  for (let row = 0; row < GRID_SIZE; row += 1) {
    const y = ((row + 0.5) / GRID_SIZE) * 2 - 1
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const x = ((column + 0.5) / GRID_SIZE) * 2 - 1
      let sum = 0

      for (const { angle, projection } of projections) {
        const detectorPosition = (x * Math.cos(angle)) + (y * Math.sin(angle))
        const detectorIndex = ((detectorPosition + ROOT_TWO) / (ROOT_TWO * 2)) * (DETECTOR_COUNT - 1)
        const lower = Math.floor(detectorIndex)
        const fraction = detectorIndex - lower
        if (lower >= 0 && lower + 1 < DETECTOR_COUNT) {
          sum += (projection[lower] * (1 - fraction)) + (projection[lower + 1] * fraction)
        }
      }

      reconstruction[(row * GRID_SIZE) + column] = sum / acquiredViews
    }
  }

  return reconstruction
}

function createSinogram(viewCount: number) {
  const sinogram = new Float32Array(viewCount * DETECTOR_COUNT)

  for (let view = 0; view < viewCount; view += 1) {
    const projection = forwardProject(SHEPP_LOGAN_PHANTOM, (view / viewCount) * Math.PI)
    sinogram.set(projection, view * DETECTOR_COUNT)
  }

  return sinogram
}

function positiveDisplayMaximum(values: Float32Array) {
  const positives = Array.from(values).filter((value) => value > 0).sort((a, b) => a - b)
  if (positives.length === 0) return 1
  return positives[Math.min(positives.length - 1, Math.floor(positives.length * 0.985))] || 1
}

function ScalarCanvas({ values, label, className = '' }: { values: Float32Array; label: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const image = context.createImageData(GRID_SIZE, GRID_SIZE)
    const maximum = positiveDisplayMaximum(values)

    for (let index = 0; index < values.length; index += 1) {
      const normalized = Math.max(0, Math.min(1, values[index] / maximum))
      const gray = Math.round(Math.pow(normalized, 0.72) * 255)
      const pixel = index * 4
      image.data[pixel] = gray
      image.data[pixel + 1] = gray
      image.data[pixel + 2] = gray
      image.data[pixel + 3] = 255
    }

    context.putImageData(image, 0, 0)
  }, [values])

  return <canvas ref={canvasRef} className={className} width={GRID_SIZE} height={GRID_SIZE} role="img" aria-label={label} />
}

function SinogramCanvas({ values, views, acquiredViews }: { values: Float32Array; views: number; acquiredViews: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const image = context.createImageData(SINOGRAM_WINDOW_ROWS, DETECTOR_COUNT)
    const maximum = Math.max(...values, 0.001)
    for (let channel = 0; channel < DETECTOR_COUNT; channel += 1) {
      for (let column = 0; column < SINOGRAM_WINDOW_ROWS; column += 1) {
        const pixel = ((channel * SINOGRAM_WINDOW_ROWS) + column) * 4
        image.data[pixel] = 3
        image.data[pixel + 1] = 8
        image.data[pixel + 2] = 11
        image.data[pixel + 3] = 255
      }
    }

    for (let canvasColumn = 0; canvasColumn < SINOGRAM_WINDOW_ROWS; canvasColumn += 1) {
      const view = views === 1 ? 0 : Math.round((canvasColumn / (SINOGRAM_WINDOW_ROWS - 1)) * (views - 1))
      if (view >= acquiredViews) continue
      for (let channel = 0; channel < DETECTOR_COUNT; channel += 1) {
        const normalized = Math.max(0, Math.min(1, values[(view * DETECTOR_COUNT) + channel] / maximum))
        const gray = Math.round(Math.pow(normalized, 0.75) * 255)
        const pixel = ((channel * SINOGRAM_WINDOW_ROWS) + canvasColumn) * 4
        image.data[pixel] = Math.round(gray * 0.76)
        image.data[pixel + 1] = Math.round(gray * 0.94)
        image.data[pixel + 2] = gray
        image.data[pixel + 3] = 255
      }
    }

    context.putImageData(image, 0, 0)
  }, [acquiredViews, values, views])

  return <canvas ref={canvasRef} className="ct-sinogram-canvas" width={SINOGRAM_WINDOW_ROWS} height={DETECTOR_COUNT} role="img" aria-label={`Sinogram wipe showing ${acquiredViews} of ${views} views`} />
}

function projectionPath(projection: Float32Array, maximum: number) {
  return Array.from(projection, (value, index) => {
    const x = 24 + (value / maximum) * 166
    const y = 12 + (index / (projection.length - 1)) * 184
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function ScannerDiagram({ angle }: { angle: number }) {
  const radians = (angle / 180) * Math.PI
  const directionX = Math.cos(radians)
  const directionY = Math.sin(radians)
  const tangentX = -directionY
  const tangentY = directionX
  const source = { x: 160 + (directionX * 120), y: 150 + (directionY * 120) }
  const detector = { x: 160 - (directionX * 108), y: 150 - (directionY * 108) }
  const detectorStart = { x: detector.x - (tangentX * 53), y: detector.y - (tangentY * 53) }
  const detectorEnd = { x: detector.x + (tangentX * 53), y: detector.y + (tangentY * 53) }

  return (
    <svg className="ct-views-scanner" viewBox="0 0 320 300" role="img" aria-label={`Schematic CT source and detector at ${angle} degrees`}>
      <circle className="ct-views-orbit" cx="160" cy="150" r="120" />
      {Array.from({ length: 13 }, (_, index) => {
        const offset = -1 + ((index / 12) * 2)
        return <line key={offset} className={`ct-views-ray${index === 0 || index === 12 ? ' is-edge' : ''}`} x1={source.x} y1={source.y} x2={detector.x + (tangentX * 53 * offset)} y2={detector.y + (tangentY * 53 * offset)} />
      })}
      <g className="ct-views-phantom" aria-hidden="true">
        <ellipse cx="160" cy="150" rx="48" ry="70" />
        <ellipse className="is-inner" cx="160" cy="149" rx="46" ry="67" />
        <ellipse className="is-void" cx="175" cy="150" rx="8" ry="24" transform="rotate(-18 175 150)" />
        <ellipse className="is-void" cx="145" cy="150" rx="11" ry="31" transform="rotate(18 145 150)" />
        <ellipse className="is-feature" cx="160" cy="176" rx="15" ry="19" />
        <circle className="is-detail" cx="160" cy="158" r="4" />
        <circle className="is-detail" cx="160" cy="142" r="4" />
        <ellipse className="is-detail" cx="154" cy="104" rx="4" ry="2" />
        <circle className="is-detail" cx="160" cy="104" r="2" />
        <ellipse className="is-detail" cx="164" cy="104" rx="2" ry="4" />
      </g>
      <line className="ct-views-detector" x1={detectorStart.x} y1={detectorStart.y} x2={detectorEnd.x} y2={detectorEnd.y} />
      <circle className="ct-views-source" cx={source.x} cy={source.y} r="9" />
      <text className="ct-views-source-label" x={source.x} y={source.y - 15} textAnchor="middle">source</text>
      <text className="ct-views-angle-label" x="160" y="288" textAnchor="middle">θ = {angle}°</text>
    </svg>
  )
}

function AmbiguousInterior({ reversed, label }: { reversed: boolean; label: string }) {
  const firstX = reversed ? 198 : 104
  const secondX = reversed ? 112 : 204
  const beamId = `ambiguity-beam-${reversed ? 'b' : 'a'}`
  const arrowId = `ambiguity-arrow-${reversed ? 'b' : 'a'}`
  const rayLevels = [42, 66, 88, 111, 134]

  return (
    <figure>
      <figcaption>{label}</figcaption>
      <svg viewBox="0 0 300 176" role="img" aria-label={`${label}: the same objects arranged at different depths produce the same parallel-beam projection`}>
        <defs>
          <linearGradient id={beamId} x1="0" x2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.06" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.14" />
          </linearGradient>
          <marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" className="ct-ambiguity-arrow" />
          </marker>
        </defs>
        <rect className="ct-ambiguity-beam" x="24" y="32" width="246" height="112" fill={`url(#${beamId})`} />
        {rayLevels.map((y) => (
          <line key={y} className="ct-ambiguity-ray" x1="24" y1={y} x2="262" y2={y} markerEnd={`url(#${arrowId})`} />
        ))}
        <circle className="ct-ambiguity-object is-dense" cx={firstX} cy="66" r="18" />
        <circle className="ct-ambiguity-object" cx={secondX} cy="111" r="14" />
        <line className="ct-ambiguity-detector" x1="270" y1="32" x2="270" y2="144" />
        <rect className="ct-ambiguity-signal is-strong" x="276" y="56" width="10" height="20" rx="2" />
        <rect className="ct-ambiguity-signal" x="276" y="103" width="6" height="16" rx="2" />
        <text x="18" y="162">parallel rays</text>
        <text x="228" y="162">detector</text>
      </svg>
    </figure>
  )
}

export default function CtManyViewsLesson() {
  const [viewCount, setViewCount] = useState(MAX_VIEWS)
  const [activeView, setActiveView] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const acquiredViews = activeView + 1
  const angle = Math.round((activeView / viewCount) * 180)
  const projection = useMemo(() => forwardProject(SHEPP_LOGAN_PHANTOM, (angle / 180) * Math.PI), [angle])
  const sinogram = useMemo(() => createSinogram(viewCount), [viewCount])
  const projectionMaximum = useMemo(() => Math.max(...sinogram, 0.001), [sinogram])
  const reconstruction = useMemo(() => reconstruct(viewCount, acquiredViews), [acquiredViews, viewCount])
  const angularStep = 180 / viewCount

  useEffect(() => {
    if (!isPlaying) return
    const delay = activeView === viewCount - 1 ? 900 : 130
    const timer = window.setTimeout(() => setActiveView((current) => current === viewCount - 1 ? 0 : current + 1), delay)
    return () => window.clearTimeout(timer)
  }, [activeView, isPlaying, viewCount])

  const changeViewCount = (nextViewCount: number) => {
    setViewCount(nextViewCount)
    setActiveView(0)
  }

  return (
    <div className="ct-many-views-built">
      <CtVolumeAcquisition />
      <section className="ct-many-views-demo" aria-labelledby="ct-slice-reconstruction-title">
        <header>
          <div>
            <span>Slice reconstruction</span>
            <h4 id="ct-slice-reconstruction-title">From sinogram space to image space</h4>
            <p>The inverse Radon transform converts data from the <strong>sinogram&nbsp;domain</strong>—projection angle and detector position—into the <strong>image&nbsp;domain</strong>, a two-dimensional map of the reconstructed slice.</p>
          </div>
          <div className="ct-many-views-status" aria-live="polite"><strong>{acquiredViews} / {viewCount}</strong><span>views acquired</span></div>
        </header>

        <div className="ct-reconstruction-primer is-domains-only">
          <section className="ct-domain-explainer" aria-label="Sinogram and image domains">
            <div className="ct-domain-grid">
              <article>
                <strong>Sinogram domain <em>Radon space</em></strong>
                <p>One axis represents projection angle and the other represents detector position. At each angle, the detector records one projection profile. In this demo, each profile becomes a column: angle runs horizontally and detector channel vertically.</p>
              </article>
              <b aria-hidden="true">→</b>
              <article>
                <strong>Image domain <em>spatial space</em></strong>
                <p>The output is an axial grid indexed by <i>x</i> and <i>y</i>. Each pixel estimates the attenuation at a spatial location in the reconstructed slice, producing the familiar cross-sectional CT image.</p>
              </article>
            </div>
          </section>
        </div>

        <div className="ct-many-views-controls">
          <label>
            <span>Views in a full sweep <strong>{viewCount}</strong></span>
            <input aria-label="Views in a full sweep" type="range" min="1" max={MAX_VIEWS} step="1" value={viewCount} style={ctRangeProgressStyle(viewCount, 1, MAX_VIEWS)} onChange={(event) => changeViewCount(Number(event.target.value))} />
          </label>
          <div className="ct-many-views-presets" aria-label="View count presets">
            {[{ label: 'One', value: 1 }, { label: 'Sparse', value: 12 }, { label: 'Dense', value: 60 }].map((preset) => <button key={preset.value} type="button" aria-pressed={viewCount === preset.value} onClick={() => changeViewCount(preset.value)}>{preset.label}</button>)}
          </div>
          <label>
            <span>Acquisition angle <strong>{angle}°</strong></span>
            <input aria-label="Acquisition progress" type="range" min="0" max={Math.max(0, viewCount - 1)} step="1" value={activeView} style={ctRangeProgressStyle(activeView, 0, Math.max(0, viewCount - 1))} onChange={(event) => { setIsPlaying(false); setActiveView(Number(event.target.value)) }} />
          </label>
          <div className="ct-acquisition-actions">
            <button type="button" aria-pressed={isPlaying} onClick={() => setIsPlaying((playing) => !playing)}>{isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{isPlaying ? 'Pause' : 'Play'}</button>
            <button type="button" onClick={() => { setActiveView(0); setIsPlaying(true) }}><RotateCcw aria-hidden="true" />Restart</button>
          </div>
        </div>

        <div className="ct-many-views-stage">
          <section>
            <header><span>01</span><strong>Acquire one view</strong></header>
            <ScannerDiagram angle={angle} />
          </section>
          <section>
            <header><span>02</span><strong>Record detector values</strong></header>
            <svg className="ct-projection-profile" viewBox="0 0 220 220" role="img" aria-label={`Projection profile measured at ${angle} degrees`}>
              <line x1="24" y1="12" x2="24" y2="196" />
              <line x1="24" y1="196" x2="200" y2="196" />
              <path className="ct-projection-profile-fill" d={`${projectionPath(projection, projectionMaximum)} L 24 196 L 24 12 Z`} />
              <path d={projectionPath(projection, projectionMaximum)} />
              <text x="116" y="214" textAnchor="middle">line integral</text>
              <text x="9" y="104" textAnchor="middle" transform="rotate(-90 9 104)">detector channel</text>
            </svg>
            <p>The profile changes with angle because different structures now share each ray.</p>
          </section>
          <section>
            <header><span>03</span><strong>Build the sinogram by angle</strong></header>
            <div className="ct-sinogram-frame">
              <div className="ct-sinogram-plot" style={{ '--sinogram-wipe-left': `${Math.min(99.5, (acquiredViews / viewCount) * 100)}%` } as CSSProperties}>
                <SinogramCanvas values={sinogram} views={viewCount} acquiredViews={acquiredViews} />
                <i aria-hidden="true" />
                <span className="is-angle">angle</span>
              </div>
              <span className="is-detector">detector channel</span>
            </div>
            <p>The acquisition angle advances a fixed wipe. Previously measured columns remain in place.</p>
          </section>
          <section>
            <header><span>04</span><strong>Reconstruct {acquiredViews} / {viewCount} views</strong></header>
            <div className="ct-reconstruction-frame">
              <ScalarCanvas values={reconstruction} label={`Progressive reconstruction using ${acquiredViews} of ${viewCount} views`} className="ct-reconstruction-canvas" />
              <span>{viewCount === 1 ? 'single direction' : `${angularStep.toFixed(viewCount < 10 ? 0 : 1)}° sampling`}</span>
            </div>
            <p>Each new direction constrains where the measured attenuation can belong.</p>
          </section>
        </div>

        <footer>Panels 01–04 use the same discretized modified Shepp–Logan phantom. Detector profiles are numerical line sums; reconstructions use the same filtered-backprojection calculation at every view count.</footer>
      </section>

      <section className="ct-ambiguity-lesson" aria-labelledby="ct-ambiguity-title">
        <header>
          <div>
            <span>Depth ambiguity</span>
            <h4 id="ct-ambiguity-title">Two interiors can cast the same projection.</h4>
            <p>Moving an object along a parallel ray does not change where its shadow reaches the detector. One projection therefore cannot reveal depth; a second angle breaks the tie.</p>
          </div>
        </header>
        <div className="ct-ambiguity-pair">
          <AmbiguousInterior reversed={false} label="Possible interior A" />
          <div className="ct-ambiguity-equals"><span>=</span><small>same detector signal</small></div>
          <AmbiguousInterior reversed label="Possible interior B" />
        </div>
      </section>

    </div>
  )
}
