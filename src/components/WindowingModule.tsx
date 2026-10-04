import { Activity, Contrast, Crosshair, Pin, PinOff, ScanLine, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import ctSliceUrl from '../assets/ct/lidc-idri-0001-i060-hu16le.bin?url'

type ChapterId = 'hu' | 'mapping' | 'presets' | 'ml'
type PresetId = 'lung' | 'soft' | 'vascular' | 'bone'
type MappingMode = 'linear-exact' | 'sigmoid' | 'custom'
type MlPipeline = 'raw' | 'single' | 'multi'

type CurvePoint = {
  x: number
  y: number
}

type Probe = {
  x: number
  y: number
  hu: number
  label: string
}

type HuLandmark = {
  label: string
  hu: number
  x: number
  y: number
}

type WindowPreset = {
  id: PresetId
  label: string
  width: number
  center: number
  description: string
}

const chapters: Array<{ id: ChapterId; label: string; short: string }> = [
  { id: 'hu', label: 'Stored pixels and Hounsfield units', short: 'CT values' },
  { id: 'mapping', label: 'Clipping and display mapping', short: 'Windowing' },
  { id: 'presets', label: 'Common windows', short: 'Presets' },
  { id: 'ml', label: 'Model input and reproducibility', short: 'For ML' },
]

const chapterTakeaways: Record<ChapterId, string[]> = {
  hu: [
    'Stored integers require metadata before they can be interpreted as calibrated CT values.',
    'Hounsfield units describe reconstructed attenuation relative to water.',
    'Windowing is a display transform applied after calibration; it does not change the source HU.',
  ],
  mapping: [
    'Window center selects the HU neighborhood while window width controls displayed contrast.',
    'Values outside the selected interval are compressed or clipped by the chosen transfer function.',
    'The exact mapping must be reproduced whenever windowed pixels become model input.',
  ],
  presets: [
    'Different windows reveal different structures from the same calibrated voxels.',
    'A preset is a center-and-width convention, not a new reconstruction.',
    'Preset names are useful shorthand only when their numerical definitions are preserved.',
  ],
  ml: [
    'Calibrated HU, one window, and multi-window channels are different model representations; declare whether the tensor is a slice or volume.',
    'Training and inference must use the same calibration, clipping, scaling, and channel order.',
    'A windowed export is a display derivative and cannot recover the original CT values.',
  ],
}

const mlPipelines: Array<{ id: MlPipeline; label: string; shape: string; description: string }> = [
  { id: 'raw', label: 'Calibrated HU', shape: 'slice · 1 × H × W', description: 'Retain the calibrated numeric range, then normalize it explicitly for the model.' },
  { id: 'single', label: 'Single window', shape: 'slice · 1 × H × W', description: 'Apply one task-specific display transform consistently during training and inference.' },
  { id: 'multi', label: 'Multi-window', shape: 'slice · 3 × H × W', description: 'Stack complementary lung, soft-tissue, and bone views as separate input channels.' },
]

const defaultCurvePoints: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 0.24, y: 0.1 },
  { x: 0.5, y: 0.5 },
  { x: 0.76, y: 0.9 },
  { x: 1, y: 1 },
]

const presets: WindowPreset[] = [
  { id: 'lung', label: 'Lung', width: 1500, center: -600, description: 'Keeps aerated lung and its soft-tissue structures distinguishable.' },
  { id: 'soft', label: 'Soft tissue', width: 400, center: 40, description: 'Expands contrast around muscle, vessels, and mediastinal structures.' },
  { id: 'vascular', label: 'Vascular', width: 700, center: 100, description: 'Widens the bright, contrast-enhanced blood range for pulmonary vessels.' },
  { id: 'bone', label: 'Bone', width: 2000, center: 400, description: 'Uses a broad, high-centered range for cortical and trabecular bone.' },
]

const tissues: HuLandmark[] = [
  { label: 'Air', hu: -1000, x: 219, y: 173 },
  { label: 'Aerated lung', hu: -750, x: 192, y: 144 },
  { label: 'Fat', hu: -100, x: 63, y: 150 },
  { label: 'Water reference', hu: 0, x: 126, y: 150 },
  { label: 'Soft tissue', hu: 45, x: 311, y: 176 },
  { label: 'Enhanced blood', hu: 120, x: 283, y: 141 },
  { label: 'Dense bone', hu: 900, x: 182, y: 395 },
]

const teachingRescale = { slope: 1, intercept: -1024 }
const defaultWindow = { center: 40, width: 400 }
const ctSliceSize = 512
const huScaleDomain = { min: -1100, max: 1300 }
const curveDomain = { min: -1200, max: 2000 }
const curveHistogramBins = 84

let ctPixelPromise: Promise<Int16Array> | undefined

function loadCtPixels() {
  if (!ctPixelPromise) {
    ctPixelPromise = fetch(ctSliceUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load the CT image (${response.status})`)
      const buffer = await response.arrayBuffer()
      if (buffer.byteLength !== ctSliceSize * ctSliceSize * 2) throw new Error('The CT image has an unexpected size')
      return new Int16Array(buffer)
    })
  }
  return ctPixelPromise
}

function useCtPixels() {
  const [pixels, setPixels] = useState<Int16Array | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadCtPixels()
      .then((loadedPixels) => { if (!cancelled) setPixels(loadedPixels) })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
  }, [])

  return { pixels, loadError }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function windowBounds(center: number, width: number) {
  return { low: center - width / 2, high: center + width / 2 }
}

function ctHistogram(pixels: Int16Array | null) {
  if (!pixels) return []
  const bins = Array.from({ length: curveHistogramBins }, () => 0)
  const domainWidth = curveDomain.max - curveDomain.min
  for (const hu of pixels) {
    if (hu < curveDomain.min || hu > curveDomain.max) continue
    const index = Math.min(curveHistogramBins - 1, Math.floor(((hu - curveDomain.min) / domainWidth) * curveHistogramBins))
    bins[index] += 1
  }
  const peak = Math.max(...bins, 1)
  return bins.map((count) => count / peak)
}

function autoWindowFromPixels(pixels: Int16Array | null) {
  if (!pixels) return null
  const domainMinimum = curveDomain.min
  const counts = new Uint32Array(curveDomain.max - domainMinimum + 1)
  let total = 0
  for (const hu of pixels) {
    if (hu < domainMinimum || hu > curveDomain.max) continue
    counts[hu - domainMinimum] += 1
    total += 1
  }
  if (total === 0) return null

  const quantile = (fraction: number) => {
    const target = Math.floor((total - 1) * fraction)
    let cumulative = 0
    for (let index = 0; index < counts.length; index += 1) {
      cumulative += counts[index] ?? 0
      if (cumulative > target) return domainMinimum + index
    }
    return curveDomain.max
  }

  const low = quantile(0.01)
  const high = quantile(0.99)
  const center = Math.round((low + high) / 2)
  const width = Math.max(1, Math.min(3000, 2 * Math.ceil(Math.max(center - low, high - center))))
  return { center, width }
}

function customCurveValue(input: number, points: CurvePoint[]) {
  const value = clamp(input, 0, 1)
  const index = points.findIndex((point) => point.x >= value)
  if (index <= 0) return points[0]?.y ?? value
  const right = points[index]
  const left = points[index - 1]
  if (!left || !right) return points.at(-1)?.y ?? value
  const segment = (value - left.x) / Math.max(0.0001, right.x - left.x)
  const eased = segment * segment * (3 - (2 * segment))
  return left.y + ((right.y - left.y) * eased)
}

function huToGray(hu: number, center: number, width: number, mode: MappingMode = 'linear-exact', points: CurvePoint[] = defaultCurvePoints) {
  const { low, high } = windowBounds(center, width)
  if (mode === 'sigmoid') return Math.round((1 / (1 + Math.exp((-4 * (hu - center)) / width))) * 255)
  if (mode === 'linear-exact') {
    if (hu <= low) return 0
    if (hu > high) return 255
    return Math.round((((hu - center) / width) + 0.5) * 255)
  }
  const normalized = clamp((hu - low) / (high - low), 0, 1)
  return Math.round(customCurveValue(normalized, points) * 255)
}

function grayColor(hu: number, center: number, width: number, mode: MappingMode = 'linear-exact', points: CurvePoint[] = defaultCurvePoints) {
  const value = huToGray(hu, center, width, mode, points)
  return `rgb(${value} ${value} ${value})`
}

function describeHu(hu: number) {
  if (hu <= -1900) return 'Outside reconstructed field'
  if (hu <= -950) return 'Air-range voxel'
  if (hu <= -500) return 'Aerated-lung range'
  if (hu <= -30) return 'Fat-range voxel'
  if (hu < 30) return 'Water-range voxel'
  if (hu < 90) return 'Soft-tissue range'
  if (hu < 300) return 'High soft-tissue / contrast range'
  if (hu < 700) return 'Dense material / trabecular-bone range'
  return 'Cortical-bone range'
}

function CtSlice({ center, width, mode = 'linear-exact', curvePoints = defaultCurvePoints, probe, probePinned = false, onProbePreview, onProbePin, compact = false }: {
  center: number
  width: number
  mode?: MappingMode
  curvePoints?: CurvePoint[]
  probe?: Probe
  probePinned?: boolean
  onProbePreview?: (probe: Probe) => void
  onProbePin?: (probe: Probe) => void
  compact?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { pixels, loadError } = useCtPixels()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !pixels) return
    const context = canvas.getContext('2d')
    if (!context) return
    const image = context.createImageData(ctSliceSize, ctSliceSize)
    for (let index = 0; index < pixels.length; index += 1) {
      const gray = huToGray(pixels[index] ?? -2048, center, width, mode, curvePoints)
      const outputIndex = index * 4
      image.data[outputIndex] = gray
      image.data[outputIndex + 1] = gray
      image.data[outputIndex + 2] = gray
      image.data[outputIndex + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [center, curvePoints, mode, pixels, width])

  const probeFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clamp(Math.floor(((event.clientX - rect.left) / rect.width) * ctSliceSize), 0, ctSliceSize - 1)
    const y = clamp(Math.floor(((event.clientY - rect.top) / rect.height) * ctSliceSize), 0, ctSliceSize - 1)
    const hu = pixels?.[(y * ctSliceSize) + x] ?? -2048
    return { x, y, hu, label: pixels ? describeHu(hu) : 'Loading calibrated pixels' }
  }

  return (
    <div
      className={`ct-slice${compact ? ' is-compact' : ''}`}
      role={compact ? undefined : 'img'}
      aria-label={compact ? undefined : `De-identified axial chest CT responding to the selected window. ${probePinned ? 'Selected voxel pinned; click elsewhere in the image to move it.' : 'Move over the image to inspect a calibrated voxel; click to pin it.'}`}
      aria-hidden={compact || undefined}
      onPointerMove={(event) => {
        if (!probePinned && onProbePreview) onProbePreview(probeFromPointer(event))
      }}
      onPointerDown={(event) => {
        if (onProbePin) onProbePin(probeFromPointer(event))
      }}
    >
      <canvas ref={canvasRef} width={ctSliceSize} height={ctSliceSize} aria-hidden="true" />
      {!pixels && <span className="ct-loading-state">{loadError ? 'CT data unavailable' : 'Loading calibrated CT data…'}</span>}
      {!compact && <svg className="ct-overlay" viewBox={`0 0 ${ctSliceSize} ${ctSliceSize}`} aria-hidden="true">
        <text x="20" y="32" className="ct-orientation-label">R</text>
        <text x="480" y="32" className="ct-orientation-label">L</text>
        {probe && <g className={`ct-probe ${probePinned ? 'is-pinned' : 'is-live'}`} transform={`translate(${probe.x} ${probe.y})`}>
          <circle className="ct-probe-ring" r="11" />
          <path className="ct-probe-lines" d="M-17 0H17M0-17V17" />
          {probePinned && <g className="ct-probe-lock" transform="translate(15 -15)"><circle r="8" /><path d="M-2.6-1.2v-2a2.6 2.6 0 0 1 5.2 0v2M-3.4-1.2h6.8v5.5h-6.8z" /></g>}
        </g>}
      </svg>}
    </div>
  )
}

function CurveEditor({ center, width, probeHu, mode, histogram, onModeChange, onAuto, onReset, autoAvailable, points, onPointsChange }: {
  center: number
  width: number
  probeHu: number
  mode: MappingMode
  histogram: number[]
  onModeChange: (mode: MappingMode) => void
  onAuto: () => void
  onReset: () => void
  autoAvailable: boolean
  points: CurvePoint[]
  onPointsChange: (points: CurvePoint[]) => void
}) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [selectedPoint, setSelectedPoint] = useState(2)
  const bounds = windowBounds(center, width)
  const canvas = { width: 520, height: 210 }
  const plot = { left: 52, top: 34, width: 420, height: 126 }
  const xForHu = (hu: number) => plot.left + ((clamp(hu, curveDomain.min, curveDomain.max) - curveDomain.min) / (curveDomain.max - curveDomain.min) * plot.width)
  const yFor = (normalized: number) => plot.top + ((1 - normalized) * plot.height)
  const path = Array.from({ length: 161 }, (_, index) => {
    const hu = curveDomain.min + ((index / 160) * (curveDomain.max - curveDomain.min))
    const output = huToGray(hu, center, width, mode, points) / 255
    return `${index === 0 ? 'M' : 'L'}${xForHu(hu).toFixed(2)} ${yFor(output).toFixed(2)}`
  }).join(' ')
  const histogramPath = histogram.length > 1 ? [
    `M${plot.left} ${plot.top + plot.height}`,
    ...histogram.map((value, index) => {
      const x = plot.left + ((index / (histogram.length - 1)) * plot.width)
      const y = plot.top + plot.height - (value * plot.height * 0.72)
      return `L${x.toFixed(2)} ${y.toFixed(2)}`
    }),
    `L${plot.left + plot.width} ${plot.top + plot.height}Z`,
  ].join(' ') : ''
  const probeOutput = huToGray(probeHu, center, width, mode, points) / 255
  const selected = points[selectedPoint] ?? points[1]
  const lowX = xForHu(bounds.low)
  const highX = xForHu(bounds.high)

  const updatePoint = (index: number, x: number, y: number) => {
    if (index <= 0 || index >= points.length - 1) return
    const previous = points[index - 1]
    const next = points[index + 1]
    if (!previous || !next) return
    const updated = points.map((point, pointIndex) => pointIndex === index ? {
      x: clamp(x, previous.x + 0.025, next.x - 0.025),
      y: clamp(y, previous.y, next.y),
    } : point)
    onPointsChange(updated)
  }

  const updateFromPointer = (event: ReactPointerEvent<SVGSVGElement>, index: number) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const svgX = ((event.clientX - rect.left) / rect.width) * canvas.width
    const svgY = ((event.clientY - rect.top) / rect.height) * canvas.height
    const hu = curveDomain.min + (clamp((svgX - plot.left) / plot.width, 0, 1) * (curveDomain.max - curveDomain.min))
    updatePoint(index, (hu - bounds.low) / width, 1 - ((svgY - plot.top) / plot.height))
  }

  const addPoint = () => {
    if (points.length >= 8) return
    let insertion = 1
    let largestGap = 0
    for (let index = 1; index < points.length; index += 1) {
      const left = points[index - 1]
      const right = points[index]
      if (left && right && right.x - left.x > largestGap) {
        largestGap = right.x - left.x
        insertion = index
      }
    }
    const left = points[insertion - 1]
    const right = points[insertion]
    if (!left || !right) return
    const x = (left.x + right.x) / 2
    const y = customCurveValue(x, points)
    onPointsChange([...points.slice(0, insertion), { x, y }, ...points.slice(insertion)])
    setSelectedPoint(insertion)
  }

  const removePoint = () => {
    if (points.length <= 3 || selectedPoint <= 0 || selectedPoint >= points.length - 1) return
    onPointsChange(points.filter((_, index) => index !== selectedPoint))
    setSelectedPoint(Math.max(1, selectedPoint - 1))
  }

  const resetPoints = () => {
    onPointsChange(defaultCurvePoints.map((point) => ({ ...point })))
    setSelectedPoint(2)
  }

  return (
    <div className="curve-editor">
      <div className="curve-toolbar">
        <div className="mapping-modes" role="group" aria-label="Display mapping function">
          {(['linear-exact', 'sigmoid', 'custom'] as MappingMode[]).map((mappingMode) => <button key={mappingMode} type="button" aria-pressed={mode === mappingMode} onClick={() => onModeChange(mappingMode)}>{mappingMode === 'linear-exact' ? 'LINEAR_EXACT' : mappingMode === 'custom' ? 'Custom curve' : 'Sigmoid'}</button>)}
        </div>
        <div className="histogram-actions" role="group" aria-label="Automatic window controls">
          <button type="button" onClick={onAuto} disabled={!autoAvailable} aria-label="Auto window from histogram" title="Set the window from the image's 1st–99th intensity percentiles">Auto</button>
          <button type="button" onClick={onReset} aria-label="Reset window" title="Restore the default soft-tissue window">Reset</button>
        </div>
      </div>
      <svg
        className="window-curve"
        viewBox={`0 0 ${canvas.width} ${canvas.height}`}
        role="img"
        aria-label={`${mode} transfer curve over the measured Hounsfield unit histogram, ${mode === 'sigmoid' ? 'showing low and high reference values' : 'showing clipping outside the selected interval'}`}
        onPointerMove={(event) => { if (dragging !== null) updateFromPointer(event, dragging) }}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        <rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} className="curve-plot" />
        {histogramPath && <path className="curve-histogram" d={histogramPath} data-testid="ct-histogram" data-source="calibrated-ct-voxels" />}
        <rect x={lowX} y={plot.top} width={Math.max(0, highX - lowX)} height={plot.height} className="curve-window-band" />
        {mode !== 'sigmoid' && <>
          <rect x={plot.left} y={plot.top} width={Math.max(0, lowX - plot.left)} height={plot.height} className="curve-clipped-zone" />
          <rect x={highX} y={plot.top} width={Math.max(0, (plot.left + plot.width) - highX)} height={plot.height} className="curve-clipped-zone" />
          <text x={plot.left + 8} y="55" textAnchor="start" className="curve-clip-label">CLIPPED ≤ {Math.round(bounds.low)} HU</text>
          <text x={plot.left + plot.width - 8} y="55" textAnchor="end" className="curve-clip-label">CLIPPED &gt; {Math.round(bounds.high)} HU</text>
        </>}
        {mode === 'sigmoid' && <>
          <text x={plot.left + 8} y="55" textAnchor="start" className="curve-clip-label">LOW {Math.round(bounds.low)} HU → {huToGray(bounds.low, center, width, mode, points)}</text>
          <text x={plot.left + plot.width - 8} y="55" textAnchor="end" className="curve-clip-label">HIGH {Math.round(bounds.high)} HU → {huToGray(bounds.high, center, width, mode, points)}</text>
        </>}
        <line x1={plot.left} x2={plot.left + plot.width} y1={yFor(0.5)} y2={yFor(0.5)} className="curve-gridline" />
        <line x1={lowX} x2={lowX} y1={plot.top} y2={plot.top + plot.height} className="curve-window-boundary" />
        <line x1={highX} x2={highX} y1={plot.top} y2={plot.top + plot.height} className="curve-window-boundary" />
        <line x1={xForHu(center)} x2={xForHu(center)} y1={plot.top} y2={plot.top + plot.height} className="curve-center" />
        <path d={path} className="curve-line" data-testid="window-curve-path" />
        {mode === 'custom' && points.map((point, index) => <circle
          key={index}
          cx={xForHu(bounds.low + (point.x * width))}
          cy={yFor(point.y)}
          r={selectedPoint === index ? 7 : 5.5}
          className={`curve-control-point${selectedPoint === index ? ' is-selected' : ''}${index === 0 || index === points.length - 1 ? ' is-fixed' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`Curve point ${index + 1}, input ${Math.round(point.x * 100)} percent, output ${Math.round(point.y * 255)}`}
          onPointerDown={(event) => { event.preventDefault(); setSelectedPoint(index); setDragging(index) }}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedPoint(index) }}
        />)}
        <circle cx={xForHu(probeHu)} cy={yFor(probeOutput)} r="6" className="curve-probe" />
        <text x="15" y={plot.top + 4}>255</text><text x="25" y={plot.top + plot.height + 4}>0</text>
        {[-1000, 0, 1000, 2000].map((tick) => <g key={tick}><line x1={xForHu(tick)} x2={xForHu(tick)} y1={plot.top + plot.height} y2={plot.top + plot.height + 5} className="curve-axis-tick" /><text x={xForHu(tick)} y={plot.top + plot.height + 21} textAnchor="middle">{tick}</text></g>)}
        <text x={xForHu(center)} y="25" textAnchor="middle">C {center}</text>
        <text x={plot.left + plot.width} y={canvas.height - 7} textAnchor="end">Input HU</text>
      </svg>
      {mode === 'custom' && selected && <div className="curve-point-controls">
        <div className="curve-point-heading"><span>Point {selectedPoint + 1}</span><small>Input {Math.round(selected.x * 100)}% · Output {Math.round(selected.y * 255)}</small></div>
        <label><span>Input position</span><input type="range" aria-label="Selected curve point input" min={0} max={100} step={1} value={Math.round(selected.x * 100)} disabled={selectedPoint === 0 || selectedPoint === points.length - 1} onChange={(event) => updatePoint(selectedPoint, Number(event.target.value) / 100, selected.y)} /></label>
        <label><span>Output brightness</span><input type="range" aria-label="Selected curve point output" min={0} max={255} step={1} value={Math.round(selected.y * 255)} disabled={selectedPoint === 0 || selectedPoint === points.length - 1} onChange={(event) => updatePoint(selectedPoint, selected.x, Number(event.target.value) / 255)} /></label>
        <div className="curve-actions"><button type="button" onClick={addPoint} disabled={points.length >= 8}>Add point</button><button type="button" onClick={removePoint} disabled={points.length <= 3 || selectedPoint === 0 || selectedPoint === points.length - 1}>Remove</button><button type="button" onClick={resetPoints}>Reset curve</button></div>
      </div>}
    </div>
  )
}

function SliderControl({ label, value, min, max, step, unit, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}) {
  const progress = `${((value - min) / (max - min)) * 100}%`
  return (
    <label className="window-slider" style={{ '--range-progress': progress } as CSSProperties}>
      <span><strong>{label}</strong><output>{value} {unit}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function HuScale({ activeProbe, onSelect }: { activeProbe: Probe; onSelect: (landmark: HuLandmark) => void }) {
  return (
    <div className="hu-scale" role="region" tabIndex={0} aria-label="Representative Hounsfield unit scale">
      <div className="hu-scale-axis">
        <div className="hu-scale-track" aria-hidden="true"><span className="hu-scale-gradient" /></div>
        <svg className="hu-scale-connectors" viewBox="0 0 1000 72" preserveAspectRatio="none" aria-hidden="true">
          {tissues.map((tissue, index) => {
            const markerX = clamp((tissue.hu - huScaleDomain.min) / (huScaleDomain.max - huScaleDomain.min), 0, 1) * 1000
            const labelX = ((index + 0.5) / tissues.length) * 1000
            const elbowY = 60 - (index * 7)
            const selected = tissue.x === activeProbe.x && tissue.y === activeProbe.y
            return <polyline key={tissue.label} className={selected ? 'is-selected' : ''} points={`${markerX},0 ${markerX},${elbowY} ${labelX},${elbowY} ${labelX},72`} />
          })}
        </svg>
        <div className="hu-scale-markers">
          {tissues.map((tissue) => {
            const selected = tissue.x === activeProbe.x && tissue.y === activeProbe.y
            return (
              <button
                key={tissue.label}
                type="button"
                aria-pressed={selected}
                className={selected ? 'is-selected' : ''}
                onClick={() => onSelect(tissue)}
              >
                <strong>{tissue.label}</strong>
                <span>{tissue.hu > 0 ? '+' : ''}{tissue.hu} HU</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MiniWindowPreview({ preset }: { preset: WindowPreset }) {
  return <div className="mini-window-preview"><CtSlice center={preset.center} width={preset.width} compact /></div>
}

export default function WindowingModule() {
  const [chapter, setChapter] = useState<ChapterId>('hu')
  const [center, setCenter] = useState(defaultWindow.center)
  const [width, setWidth] = useState(defaultWindow.width)
  const [mappingMode, setMappingMode] = useState<MappingMode>('linear-exact')
  const [curvePoints, setCurvePoints] = useState<CurvePoint[]>(() => defaultCurvePoints.map((point) => ({ ...point })))
  const [probe, setProbe] = useState<Probe>({ x: 280, y: 200, hu: 187, label: 'High soft-tissue / contrast range' })
  const [probePinned, setProbePinned] = useState(false)
  const [mlPipeline, setMlPipeline] = useState<MlPipeline>('raw')
  const { pixels: ctPixels } = useCtPixels()

  useEffect(() => {
    const releaseProbe = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProbePinned(false)
    }
    window.addEventListener('keydown', releaseProbe)
    return () => window.removeEventListener('keydown', releaseProbe)
  }, [])

  const activeChapter = chapters.findIndex((item) => item.id === chapter)
  const activePreset = mappingMode === 'linear-exact' ? presets.find((preset) => preset.center === center && preset.width === width) : undefined
  const bounds = windowBounds(center, width)
  const probeGray = huToGray(probe.hu, center, width, mappingMode, curvePoints)
  const storedValue = Math.round((probe.hu - teachingRescale.intercept) / teachingRescale.slope)
  const huPerDisplayStep = width / 255
  const histogram = useMemo(() => ctHistogram(ctPixels), [ctPixels])
  const automaticWindow = useMemo(() => autoWindowFromPixels(ctPixels), [ctPixels])
  const tissueRows = useMemo(() => tissues.map((tissue) => {
    const hu = ctPixels?.[(tissue.y * ctSliceSize) + tissue.x] ?? tissue.hu
    return { ...tissue, hu, gray: huToGray(hu, center, width, mappingMode, curvePoints) }
  }), [center, ctPixels, width, mappingMode, curvePoints])
  const mappingGradient = useMemo(() => `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, index) => {
    const position = index / 8
    const gray = huToGray(bounds.low + (position * width), center, width, mappingMode, curvePoints)
    return `rgb(${gray} ${gray} ${gray}) ${position * 100}%`
  }).join(', ')})`, [bounds.low, center, curvePoints, mappingMode, width])

  const applyPreset = (preset: WindowPreset) => {
    setCenter(preset.center)
    setWidth(preset.width)
    setMappingMode('linear-exact')
  }

  const applyAutomaticWindow = () => {
    if (!automaticWindow) return
    setCenter(automaticWindow.center)
    setWidth(automaticWindow.width)
    setMappingMode('linear-exact')
  }

  const resetWindow = () => {
    setCenter(defaultWindow.center)
    setWidth(defaultWindow.width)
    setMappingMode('linear-exact')
    setCurvePoints(defaultCurvePoints.map((point) => ({ ...point })))
  }

  const selectProbe = (nextProbe: Probe) => {
    setProbe(nextProbe)
    setProbePinned(true)
  }

  const selectLandmark = (landmark: HuLandmark) => {
    const hu = ctPixels?.[(landmark.y * ctSliceSize) + landmark.x] ?? landmark.hu
    selectProbe({ x: landmark.x, y: landmark.y, hu, label: describeHu(hu) })
  }

  return (
    <article className="windowing-module">
      <header className="windowing-hero">
        <div>
          <p className="section-kicker"><Contrast aria-hidden="true" /> Intensity and display</p>
          <h2>From stored pixels to visible contrast.</h2>
          <p>Follow a CT value from its encoded integer through HU calibration, windowing, and model-ready input.</p>
        </div>
        <div className="windowing-progress" aria-label={`Section ${activeChapter + 1} of ${chapters.length}`}><strong>{activeChapter + 1} / {chapters.length}</strong></div>
      </header>

      <label className="windowing-chapter-picker">
        <span><small>Section</small><strong>{chapters[activeChapter]?.short}</strong></span>
        <select
          aria-label="Select CT windowing section"
          value={chapter}
          onChange={(event) => {
            const next = event.target.value as ChapterId
            setChapter(next)
            if (next === 'presets') setMappingMode('linear-exact')
          }}
        >
          {chapters.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.short}</option>)}
        </select>
      </label>

      <nav className="windowing-chapters" aria-label="Windowing learning sections">
        {chapters.map((item, index) => <button key={item.id} type="button" className={chapter === item.id ? 'is-active' : ''} aria-current={chapter === item.id ? 'step' : undefined} onClick={() => { setChapter(item.id); if (item.id === 'presets') setMappingMode('linear-exact') }}><span>{index + 1}</span><strong>{item.short}</strong><small>{item.label}</small></button>)}
      </nav>

      <div className="windowing-workbench">
        <section className="ct-viewer-card" aria-label="Interactive CT window viewer">
          <div className="viewer-toolbar"><span><ScanLine aria-hidden="true" /> AXIAL · CHEST · LIDC-IDRI</span><span>{mappingMode.toUpperCase().replace('-', '_')} · W {width} · C {center}</span></div>
          <div className="ct-viewer-stage">
            <CtSlice center={center} width={width} mode={mappingMode} curvePoints={curvePoints} probe={probe} probePinned={probePinned} onProbePreview={setProbe} onProbePin={selectProbe} />
            <div className={`viewer-help${probePinned ? ' is-pinned' : ''}`}>
              {probePinned ? <Pin aria-hidden="true" /> : <Crosshair aria-hidden="true" />}
              {probePinned ? 'Pinned · Click elsewhere to move · Esc to release' : 'Move over image · Click to pin'}
            </div>
          </div>
          <div className="probe-readout">
            <div className="probe-readout-values" role="status" aria-live="polite">
              <span><small>Sample</small><strong>{probe.label}</strong></span>
              <span><small>Input</small><strong>{probe.hu > 0 ? '+' : ''}{probe.hu} HU</strong></span>
              <span><small>Display</small><strong>{probeGray} / 255</strong></span>
              <span className="probe-swatch" style={{ background: grayColor(probe.hu, center, width, mappingMode, curvePoints) }} aria-label={`Displayed gray value ${probeGray}`} />
            </div>
            {probePinned
              ? <button className="probe-state-control is-pinned" type="button" aria-label="Unpin selected voxel" onPointerDown={() => setProbePinned(false)} onClick={() => setProbePinned(false)}><PinOff aria-hidden="true" />Unpin</button>
              : <span className="probe-state-control is-live" aria-label="Selected voxel follows the pointer"><Crosshair aria-hidden="true" />Live</span>}
          </div>
        </section>

        <section className="windowing-lesson-card" aria-labelledby={`windowing-${chapter}-title`}>
          {chapter === 'hu' && <>
            <p className="lesson-number">01 · STORED VALUE → HU</p>
            <h3 id="windowing-hu-title">The stored integer is only the first value.</h3>
            <p>CT commonly stores voxel samples as fixed-width integers for compact, predictable storage. These are storage-domain values: their physical meaning cannot be determined from the pixel array alone. DICOM metadata defines the conversion into modality values, commonly <code>output = stored value × slope + intercept</code>. The conversion can change the number or be an identity transform, so software should apply or verify the metadata before treating an array as HU.</p>
            <p><strong>VOI (Value of Interest)</strong> is the next display stage: it maps calibrated values to visible brightness. The Windowing section explores that mapping in detail.</p>
            <div className="value-pipeline" aria-label={`Example value pipeline: stored value ${storedValue}, slope 1, intercept minus 1024, ${probe.hu} Hounsfield units, display value ${probeGray}`}>
              <span><small>Pixel Data</small><strong>{storedValue}</strong><code>stored value</code></span>
              <b aria-hidden="true">× 1 + (−1024)</b>
              <span className="is-active"><small>Modality value</small><strong>{probe.hu > 0 ? '+' : ''}{probe.hu} HU</strong><code>slope + intercept</code></span>
              <b aria-hidden="true">VOI</b>
              <span><small>Display</small><strong>{probeGray} / 255</strong><code>current window</code></span>
            </div>
            <h4>What the calibrated value means</h4>
            <p>For conventional CT, HU expresses a voxel's reconstructed linear attenuation coefficient (μ) relative to water. Here, μ describes the energy-dependent probability of X-ray attenuation per unit path length. Water anchors 0 HU, air is approximately −1000 HU, and more attenuating materials usually have larger positive values.</p>
            <div className="hu-equation"><span>HU = 1000 ×</span><span className="equation-fraction"><b>μ<sub>tissue</sub> − μ<sub>water</sub></b><i>μ<sub>water</sub></i></span></div>
            <h4>Example landmarks in this frame</h4>
            <p className="hu-scale-caption">The endpoints show numerical position; the labels are spaced evenly for readability. Select one to sample that actual voxel rather than substituting the printed reference value.</p>
            <HuScale activeProbe={probe} onSelect={selectLandmark} />
          </>}

          {chapter === 'mapping' && <>
            <p className="lesson-number">02 · WINDOW TRANSFER FUNCTION</p>
            <h3 id="windowing-mapping-title">Map a useful range to the display.</h3>
            <p>Center and width position and scale the mapping. In this demo, the transfer function maps HU values to display brightness from 0–255.</p>
            <CurveEditor center={center} width={width} probeHu={probe.hu} mode={mappingMode} histogram={histogram} onModeChange={setMappingMode} onAuto={applyAutomaticWindow} onReset={resetWindow} autoAvailable={Boolean(automaticWindow)} points={curvePoints} onPointsChange={setCurvePoints} />
            <div className="window-definition-row"><span><small>Low</small><strong>{Math.round(bounds.low)} HU → {huToGray(bounds.low, center, width, mappingMode, curvePoints)}</strong></span><span><small>Center</small><strong>{center} HU → {huToGray(center, center, width, mappingMode, curvePoints)}</strong></span><span><small>High</small><strong>{Math.round(bounds.high)} HU → {huToGray(bounds.high, center, width, mappingMode, curvePoints)}</strong></span></div>
            <p className="mapping-mode-note"><strong>{mappingMode === 'linear-exact' ? 'DICOM LINEAR_EXACT' : mappingMode === 'sigmoid' ? 'Sigmoid window' : 'Custom VOI curve'}.</strong> {mappingMode === 'linear-exact' ? 'The exact bounds are C − W/2 and C + W/2: values at or below the low bound are black, values above the high bound are white, and the values between follow a straight ramp.' : mappingMode === 'sigmoid' ? 'The same center and width produce a smooth toe and shoulder instead of abrupt clipping.' : 'Drag the points to redistribute contrast inside the selected interval while preserving intensity order.'}</p>
            <p className="quantization-note">{mappingMode === 'linear-exact' ? `At this width, one 8-bit display step covers about ${huPerDisplayStep < 10 ? huPerDisplayStep.toFixed(1) : huPerDisplayStep.toFixed(0)} HU. ${huPerDisplayStep > 1 ? 'Multiple HU values can therefore share one displayed gray.' : 'For this integer-valued image, some display levels may be skipped between adjacent HU values.'}` : 'With a nonlinear curve, HU-per-gray-step varies across the mapping. The output is still a reduced display representation.'}</p>
            <div className="window-control-grid">
              <div>
                <SliderControl label="Window width" value={width} min={1} max={3000} step={1} unit="HU" onChange={setWidth} />
                <p><strong>Width controls contrast.</strong> A narrow width spreads a small HU range across every gray; a wide width includes more tissue types with less separation.</p>
              </div>
              <div>
                <SliderControl label="Window center" value={center} min={-1000} max={1000} step={10} unit="HU" onChange={setCenter} />
                <p><strong>Center chooses the neighborhood.</strong> Moving it shifts both bounds together toward lower- or higher-attenuation anatomy.</p>
              </div>
            </div>
            <p className="monochrome-explainer"><strong>MONOCHROME2</strong> displays lower output values darker and higher values brighter. <strong>MONOCHROME1</strong> reverses that relationship.</p>
          </>}

          {chapter === 'presets' && <>
            <p className="lesson-number">03 · REPRESENTATIVE PRESETS</p>
            <h3 id="windowing-presets-title">The same voxels can answer different questions.</h3>
            <p>A preset stores a center and width. It changes presentation, not the reconstructed CT values.</p>
            <div className="window-preset-grid">
              {presets.map((preset) => <button key={preset.id} type="button" aria-label={`${preset.label} window, width ${preset.width}, center ${preset.center}`} className={activePreset?.id === preset.id ? 'is-selected' : ''} onClick={() => applyPreset(preset)}>
                <MiniWindowPreview preset={preset} />
                <span><strong>{preset.label}</strong><small>W {preset.width} · C {preset.center}</small></span>
                <p>{preset.description}</p>
              </button>)}
            </div>
            <div className="mapping-table-intro"><strong>Current tissue mapping</strong><span>Select a row to place the image probe.</span></div>
            <div className="mapping-table" role="table" aria-label="Current HU to display mapping">
              <div role="row" className="mapping-table-head"><span role="columnheader">Tissue</span><span role="columnheader">HU</span><span role="columnheader">8-bit</span><span role="columnheader">Output</span></div>
              {tissueRows.map((tissue) => <button type="button" role="row" key={tissue.label} onClick={() => selectLandmark(tissue)}><span role="cell">{tissue.label}</span><span role="cell">{tissue.hu}</span><span role="cell">{tissue.gray}</span><span role="cell" className="table-swatch"><i style={{ background: `rgb(${tissue.gray} ${tissue.gray} ${tissue.gray})` }} /></span></button>)}
            </div>
          </>}

          {chapter === 'ml' && <>
            <p className="lesson-number">04 · MODEL INPUT</p>
            <h3 id="windowing-ml-title">Display choices become preprocessing choices.</h3>
            <p>A model can consume calibrated HU, one windowed image, or several windows as channels. These representations are not interchangeable, even when they originate from the same CT voxels.</p>
            <p className="ml-shape-note"><strong>Declare the tensor axes.</strong> The shapes below describe the displayed two-dimensional slice. A three-dimensional volume adds depth: <code>C × D × H × W</code>.</p>
            <div className="ml-pipeline-options" role="group" aria-label="CT model input representation">
              {mlPipelines.map((pipeline) => <button key={pipeline.id} type="button" aria-pressed={mlPipeline === pipeline.id} className={mlPipeline === pipeline.id ? 'is-selected' : ''} onClick={() => setMlPipeline(pipeline.id)}>
                <span><strong>{pipeline.label}</strong><small>{pipeline.shape}</small></span>
                <p>{pipeline.description}</p>
              </button>)}
            </div>
            <div className="ml-input-preview" aria-live="polite">
              {mlPipeline === 'raw' && <>
                <div className="raw-value-grid" aria-hidden="true"><span>−750</span><span>−742</span><span>45</span><span>−715</span><span>120</span><span>51</span><span>−98</span><span>42</span><span>900</span></div>
                <div><small>Selected voxel</small><strong>{probe.hu > 0 ? '+' : ''}{probe.hu} HU</strong><p>Retains distinctions outside any one viewing window. Normalization still has to be defined and reproduced.</p></div>
              </>}
              {mlPipeline === 'single' && <>
                <div className="ml-window-thumbnail"><CtSlice center={center} width={width} mode={mappingMode} curvePoints={curvePoints} compact /></div>
                <div><small>Current transform</small><strong>W {width} · C {center}</strong><p>{mappingMode === 'sigmoid' ? 'The sigmoid compresses values progressively into dark and bright tails rather than clipping them at finite boundaries.' : 'Compact and familiar, but every value below or above the chosen interval has been collapsed.'}</p></div>
              </>}
              {mlPipeline === 'multi' && <>
                <div className="ml-window-stack" aria-hidden="true">{[presets[0], presets[1], presets[3]].map((preset) => preset && <div key={preset.id}><CtSlice center={preset.center} width={preset.width} compact /><span>{preset.label}</span></div>)}</div>
                <div><small>Channel stack</small><strong>Lung · Soft · Bone</strong><p>Preserves several task-specific views, but increases channels and makes the window definitions part of the model contract.</p></div>
              </>}
            </div>
            <div className="ml-practice-list">
              <p><strong>Record the transform.</strong><span>Keep slope/intercept handling, clipping bounds, scaling, channel order, and output dtype with the experiment.</span></p>
              <p><strong>Match training and inference.</strong><span>A different window or a second accidental rescale changes the input distribution.</span></p>
              <p><strong>Mask stored padding.</strong><span>DICOM Pixel Padding Value or Range identifies samples outside the native image. Exclude them from histograms, normalization, and model inputs before applying the modality transform.</span></p>
              <p><strong>Know what was exported.</strong><span>A windowed PNG is a display derivative—not a recoverable copy of the original CT values.</span></p>
            </div>
          </>}
        </section>
      </div>

      <section className="windowing-takeaways lesson-takeaways glass-panel" aria-label={`${chapters[activeChapter]?.short} learning points`}>
        <span>Keep from this section</span>
        <ol>{chapterTakeaways[chapter].map((point) => <li key={point}>{point}</li>)}</ol>
      </section>

      <section className="windowing-summary" aria-label="Current window mapping">
        <div><SlidersHorizontal aria-hidden="true" /><span><small>Current interval</small><strong>{Math.round(bounds.low)} to {Math.round(bounds.high)} HU</strong></span></div>
        <div className="windowing-ramp" style={{ background: mappingGradient }} aria-hidden="true"><span style={{ left: `${clamp(((probe.hu - bounds.low) / width) * 100, 0, 100)}%` }} /></div>
        <div><Activity aria-hidden="true" /><span><small>Selected voxel</small><strong>{probe.hu} HU → {probeGray}</strong></span></div>
      </section>

      <footer className="windowing-sources module-reference-strip">
        <span>Reference material</span>
        <a href="https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.11.html#sect_C.11.1" target="_blank" rel="noreferrer">DICOM Modality LUT</a>
        <a href="https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.11.2.html" target="_blank" rel="noreferrer">DICOM VOI LUT</a>
        <a href="https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.7.5.html#sect_C.7.5.1.1.2" target="_blank" rel="noreferrer">DICOM Pixel Padding</a>
        <a href="https://www.cancerimagingarchive.net/collection/lidc-idri/" target="_blank" rel="noreferrer">CT image: LIDC-IDRI</a>
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>
        <a href="https://doi.org/10.7937/K9/TCIA.2015.LO9QL9SX" target="_blank" rel="noreferrer">Dataset DOI</a>
        <a href="https://www.ncbi.nlm.nih.gov/books/NBK547721/" target="_blank" rel="noreferrer">Hounsfield Unit</a>
        <a href="https://www.ncbi.nlm.nih.gov/books/NBK597347/" target="_blank" rel="noreferrer">CT physics</a>
        <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10361226/" target="_blank" rel="noreferrer">Representative lung windows</a>
        <a href="https://pubmed.ncbi.nlm.nih.gov/31415352/" target="_blank" rel="noreferrer">Vascular window reference</a>
      </footer>
    </article>
  )
}
