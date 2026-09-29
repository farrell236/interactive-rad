import { Activity, Contrast, Crosshair, Info, Pin, PinOff, ScanLine, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

type ChapterId = 'hu' | 'mapping' | 'presets' | 'ml'
type PresetId = 'lung' | 'soft' | 'brain' | 'bone'
type MappingMode = 'linear' | 'sigmoid' | 'custom'
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

const mlPipelines: Array<{ id: MlPipeline; label: string; shape: string; description: string }> = [
  { id: 'raw', label: 'Calibrated HU', shape: '1 × H × W', description: 'Retain the calibrated numeric range, then normalize it explicitly for the model.' },
  { id: 'single', label: 'Single window', shape: '1 × H × W', description: 'Clip one task-specific interval and scale it consistently for training and inference.' },
  { id: 'multi', label: 'Multi-window', shape: '3 × H × W', description: 'Stack complementary lung, soft-tissue, and bone views as separate input channels.' },
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
  { id: 'brain', label: 'Brain', width: 80, center: 40, description: 'Uses a narrow range to separate subtly different intracranial tissues.' },
  { id: 'bone', label: 'Bone', width: 2000, center: 400, description: 'Uses a broad, high-centered range for cortical and trabecular bone.' },
]

const tissues = [
  { label: 'Air', hu: -1000, x: 62, y: 55 },
  { label: 'Aerated lung', hu: -750, x: 164, y: 205 },
  { label: 'Fat', hu: -100, x: 90, y: 270 },
  { label: 'Water', hu: 0, x: 435, y: 82 },
  { label: 'Soft tissue', hu: 45, x: 285, y: 255 },
  { label: 'Contrast blood', hu: 120, x: 273, y: 210 },
  { label: 'Cortical bone', hu: 900, x: 260, y: 350 },
]

const teachingRescale = { slope: 1, intercept: -1024 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function windowBounds(center: number, width: number) {
  return { low: center - width / 2, high: center + width / 2 }
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

function huToGray(hu: number, center: number, width: number, mode: MappingMode = 'linear', points: CurvePoint[] = defaultCurvePoints) {
  const { low, high } = windowBounds(center, width)
  if (mode === 'sigmoid') return Math.round((1 / (1 + Math.exp((-4 * (hu - center)) / width))) * 255)
  const normalized = clamp((hu - low) / (high - low), 0, 1)
  const output = mode === 'custom' ? customCurveValue(normalized, points) : normalized
  return Math.round(output * 255)
}

function grayColor(hu: number, center: number, width: number, mode: MappingMode = 'linear', points: CurvePoint[] = defaultCurvePoints) {
  const value = huToGray(hu, center, width, mode, points)
  return `rgb(${value} ${value} ${value})`
}

function sampleSlice(x: number, y: number): Probe {
  const insideEllipse = (cx: number, cy: number, rx: number, ry: number) => (((x - cx) / rx) ** 2) + (((y - cy) / ry) ** 2) <= 1
  const insideCircle = (cx: number, cy: number, radius: number) => Math.hypot(x - cx, y - cy) <= radius

  if (!insideEllipse(260, 230, 210, 182)) return { x, y, hu: -1000, label: 'Air' }
  if (insideCircle(260, 348, 34) && !insideCircle(260, 348, 13)) return { x, y, hu: 900, label: 'Cortical bone' }
  if (insideCircle(260, 348, 13)) return { x, y, hu: 35, label: 'Spinal canal' }
  if (insideEllipse(260, 85, 14, 30)) return { x, y, hu: 900, label: 'Sternum' }
  if (insideCircle(273, 210, 19)) return { x, y, hu: 120, label: 'Contrast blood' }
  if (insideEllipse(281, 255, 73, 92)) return { x, y, hu: 45, label: 'Heart / soft tissue' }
  if (insideEllipse(165, 217, 82, 124) || insideEllipse(355, 217, 82, 124)) {
    const vessel = insideCircle(176, 192, 12) || insideCircle(143, 238, 8) || insideCircle(343, 183, 11) || insideCircle(378, 235, 9)
    return { x, y, hu: vessel ? 55 : -750, label: vessel ? 'Pulmonary vessel' : 'Aerated lung' }
  }
  const bodyEdge = !insideEllipse(260, 230, 188, 160)
  return { x, y, hu: bodyEdge ? -100 : 45, label: bodyEdge ? 'Subcutaneous fat' : 'Soft tissue' }
}

function CtSlice({ center, width, mode = 'linear', curvePoints = defaultCurvePoints, probe, probePinned = false, onProbePreview, onProbePin, compact = false }: {
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
  const style = {
    '--air': grayColor(-1000, center, width, mode, curvePoints),
    '--lung': grayColor(-750, center, width, mode, curvePoints),
    '--fat': grayColor(-100, center, width, mode, curvePoints),
    '--soft': grayColor(45, center, width, mode, curvePoints),
    '--blood': grayColor(120, center, width, mode, curvePoints),
    '--bone': grayColor(900, center, width, mode, curvePoints),
  } as CSSProperties

  const probeFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 520
    const y = ((event.clientY - rect.top) / rect.height) * 420
    return sampleSlice(x, y)
  }

  return (
    <svg
      className={`ct-slice${compact ? ' is-compact' : ''}`}
      viewBox="0 0 520 420"
      role={compact ? undefined : 'img'}
      aria-label={compact ? undefined : `Stylized axial chest CT responding to the selected window. ${probePinned ? 'Selected voxel pinned; click elsewhere in the image to move it.' : 'Move over the image to inspect tissue; click to pin the selected voxel.'}`}
      aria-hidden={compact || undefined}
      style={style}
      onPointerMove={(event) => {
        if (!probePinned && onProbePreview) onProbePreview(probeFromPointer(event))
      }}
      onPointerDown={(event) => {
        if (onProbePin) onProbePin(probeFromPointer(event))
      }}
    >
      <defs>
        <filter id={compact ? 'ct-soft-compact' : 'ct-soft'}>
          <feGaussianBlur stdDeviation={compact ? 1.1 : 1.8} />
        </filter>
        <filter id={compact ? 'ct-grain-compact' : 'ct-grain'} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence baseFrequency="0.72" numOctaves="2" seed="17" type="fractalNoise" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
          <feBlend in="SourceGraphic" in2="mono" mode="soft-light" />
        </filter>
      </defs>
      <rect width="520" height="420" fill="var(--air)" />
      <ellipse cx="260" cy="230" rx="212" ry="184" fill="var(--fat)" stroke="var(--soft)" strokeWidth="8" />
      <ellipse cx="260" cy="230" rx="190" ry="162" fill="var(--soft)" opacity="0.96" />
      <path d="M93 118 C118 69 183 74 217 116 C235 139 229 290 185 333 C143 352 91 305 78 240 C70 196 74 154 93 118Z" fill="var(--lung)" stroke="var(--fat)" strokeWidth="4" />
      <path d="M427 118 C402 69 337 74 303 116 C285 139 291 290 335 333 C377 352 429 305 442 240 C450 196 446 154 427 118Z" fill="var(--lung)" stroke="var(--fat)" strokeWidth="4" />
      <path d="M270 163 C223 163 205 211 215 267 C223 315 263 338 304 318 C342 299 358 254 343 213 C330 178 307 163 270 163Z" fill="var(--soft)" />
      <ellipse cx="281" cy="255" rx="70" ry="89" fill="var(--soft)" opacity="0.98" />
      <circle cx="273" cy="210" r="20" fill="var(--blood)" stroke="var(--soft)" strokeWidth="5" />
      <g fill="var(--soft)" opacity="0.92">
        <circle cx="176" cy="192" r="12" /><circle cx="143" cy="238" r="8" /><circle cx="343" cy="183" r="11" /><circle cx="378" cy="235" r="9" />
        <path d="M176 192 L127 160 M176 192 L143 238 M343 183 L397 150 M343 183 L378 235" stroke="var(--soft)" strokeWidth="8" strokeLinecap="round" />
      </g>
      <g fill="none" stroke="var(--bone)" strokeWidth="7" opacity="0.93">
        <path d="M109 121 C66 166 59 252 91 309" /><path d="M411 121 C454 166 461 252 429 309" />
        <path d="M129 101 C91 153 87 278 117 327" /><path d="M391 101 C429 153 433 278 403 327" />
      </g>
      <ellipse cx="260" cy="85" rx="14" ry="30" fill="var(--bone)" />
      <circle cx="260" cy="348" r="36" fill="var(--bone)" />
      <circle cx="260" cy="348" r="14" fill="var(--soft)" />
      <g opacity="0.12" filter={`url(#${compact ? 'ct-grain-compact' : 'ct-grain'})`}>
        <ellipse cx="260" cy="230" rx="207" ry="179" fill="white" />
      </g>
      {!compact && <>
        <text x="22" y="32" className="ct-orientation-label">R</text>
        <text x="480" y="32" className="ct-orientation-label">L</text>
        {probe && <g className={`ct-probe ${probePinned ? 'is-pinned' : 'is-live'}`} transform={`translate(${probe.x} ${probe.y})`} aria-hidden="true">
          <circle className="ct-probe-ring" r="11" />
          <path className="ct-probe-lines" d="M-17 0H17M0-17V17" />
          {probePinned && <g className="ct-probe-lock" transform="translate(15 -15)"><circle r="8" /><path d="M-2.6-1.2v-2a2.6 2.6 0 0 1 5.2 0v2M-3.4-1.2h6.8v5.5h-6.8z" /></g>}
        </g>}
      </>}
    </svg>
  )
}

function CurveEditor({ center, width, probeHu, mode, onModeChange, points, onPointsChange }: {
  center: number
  width: number
  probeHu: number
  mode: MappingMode
  onModeChange: (mode: MappingMode) => void
  points: CurvePoint[]
  onPointsChange: (points: CurvePoint[]) => void
}) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [selectedPoint, setSelectedPoint] = useState(2)
  const bounds = windowBounds(center, width)
  const plot = { left: 52, top: 34, width: 420, height: 176 }
  const domain = { min: -1200, max: 2000 }
  const xForHu = (hu: number) => plot.left + ((clamp(hu, domain.min, domain.max) - domain.min) / (domain.max - domain.min) * plot.width)
  const yFor = (normalized: number) => plot.top + ((1 - normalized) * plot.height)
  const path = Array.from({ length: 161 }, (_, index) => {
    const hu = domain.min + ((index / 160) * (domain.max - domain.min))
    const output = huToGray(hu, center, width, mode, points) / 255
    return `${index === 0 ? 'M' : 'L'}${xForHu(hu).toFixed(2)} ${yFor(output).toFixed(2)}`
  }).join(' ')
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
    const svgX = ((event.clientX - rect.left) / rect.width) * 520
    const svgY = ((event.clientY - rect.top) / rect.height) * 260
    const hu = domain.min + (clamp((svgX - plot.left) / plot.width, 0, 1) * (domain.max - domain.min))
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
      <div className="mapping-modes" role="group" aria-label="Display mapping function">
        {(['linear', 'sigmoid', 'custom'] as MappingMode[]).map((mappingMode) => <button key={mappingMode} type="button" aria-pressed={mode === mappingMode} onClick={() => onModeChange(mappingMode)}>{mappingMode === 'custom' ? 'Custom curve' : mappingMode[0]?.toUpperCase() + mappingMode.slice(1)}</button>)}
      </div>
      <svg
        className="window-curve"
        viewBox="0 0 520 260"
        role="img"
        aria-label={`${mode} transfer curve on a fixed Hounsfield unit axis, showing clipping outside the selected interval`}
        onPointerMove={(event) => { if (dragging !== null) updateFromPointer(event, dragging) }}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        <rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} className="curve-plot" />
        <path className="curve-histogram" d="M52 210 L52 190 L72 186 L92 196 L112 170 L132 181 L152 126 L172 154 L192 186 L212 178 L232 108 L252 82 L272 102 L292 164 L312 183 L332 176 L352 142 L372 159 L392 191 L412 181 L432 196 L452 188 L472 194 L472 210Z" />
        <rect x={lowX} y={plot.top} width={Math.max(0, highX - lowX)} height={plot.height} className="curve-window-band" />
        {mode !== 'sigmoid' && <>
          <rect x={plot.left} y={plot.top} width={Math.max(0, lowX - plot.left)} height={plot.height} className="curve-clipped-zone" />
          <rect x={highX} y={plot.top} width={Math.max(0, (plot.left + plot.width) - highX)} height={plot.height} className="curve-clipped-zone" />
          {lowX - plot.left > 50 && <text x={(plot.left + lowX) / 2} y="55" textAnchor="middle" className="curve-clip-label">CLIPPED BLACK</text>}
          {(plot.left + plot.width) - highX > 50 && <text x={(highX + plot.left + plot.width) / 2} y="55" textAnchor="middle" className="curve-clip-label">CLIPPED WHITE</text>}
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
        {[-1000, 0, 1000, 2000].map((tick) => <g key={tick}><line x1={xForHu(tick)} x2={xForHu(tick)} y1={plot.top + plot.height} y2={plot.top + plot.height + 5} className="curve-axis-tick" /><text x={xForHu(tick)} y="231" textAnchor="middle">{tick}</text></g>)}
        <text x={xForHu(center)} y="25" textAnchor="middle">C {center}</text>
        <text x={plot.left + plot.width} y="253" textAnchor="end">Input HU</text>
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

function HuScale({ activeHu, onSelect }: { activeHu: number; onSelect: (probe: Probe) => void }) {
  return (
    <div className="hu-scale" aria-label="Representative Hounsfield unit scale">
      <div className="hu-scale-track"><span className="hu-scale-gradient" /></div>
      <div className="hu-scale-markers">
        {[...tissues].reverse().map((tissue) => {
          const selected = tissue.hu === activeHu
          return (
            <button key={tissue.label} type="button" className={selected ? 'is-selected' : ''} onClick={() => onSelect({ x: tissue.x, y: tissue.y, hu: tissue.hu, label: tissue.label })}>
              <span>{tissue.hu > 0 ? '+' : ''}{tissue.hu} HU</span><strong>{tissue.label}</strong>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MiniWindowPreview({ preset }: { preset: WindowPreset }) {
  return <div className="mini-window-preview"><CtSlice center={preset.center} width={preset.width} compact /></div>
}

export default function WindowingModule() {
  const [chapter, setChapter] = useState<ChapterId>('hu')
  const [center, setCenter] = useState(40)
  const [width, setWidth] = useState(400)
  const [mappingMode, setMappingMode] = useState<MappingMode>('linear')
  const [curvePoints, setCurvePoints] = useState<CurvePoint[]>(() => defaultCurvePoints.map((point) => ({ ...point })))
  const [probe, setProbe] = useState<Probe>({ x: 285, y: 255, hu: 45, label: 'Heart / soft tissue' })
  const [probePinned, setProbePinned] = useState(false)
  const [mlPipeline, setMlPipeline] = useState<MlPipeline>('raw')

  useEffect(() => {
    const releaseProbe = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProbePinned(false)
    }
    window.addEventListener('keydown', releaseProbe)
    return () => window.removeEventListener('keydown', releaseProbe)
  }, [])

  const activeChapter = chapters.findIndex((item) => item.id === chapter)
  const activePreset = mappingMode === 'linear' ? presets.find((preset) => preset.center === center && preset.width === width) : undefined
  const bounds = windowBounds(center, width)
  const probeGray = huToGray(probe.hu, center, width, mappingMode, curvePoints)
  const storedValue = Math.round((probe.hu - teachingRescale.intercept) / teachingRescale.slope)
  const huPerDisplayStep = width / 255
  const tissueRows = useMemo(() => tissues.map((tissue) => ({ ...tissue, gray: huToGray(tissue.hu, center, width, mappingMode, curvePoints) })), [center, width, mappingMode, curvePoints])
  const mappingGradient = useMemo(() => `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, index) => {
    const position = index / 8
    const gray = huToGray(bounds.low + (position * width), center, width, mappingMode, curvePoints)
    return `rgb(${gray} ${gray} ${gray}) ${position * 100}%`
  }).join(', ')})`, [bounds.low, center, curvePoints, mappingMode, width])

  const applyPreset = (preset: WindowPreset) => {
    setCenter(preset.center)
    setWidth(preset.width)
    setMappingMode('linear')
  }

  const selectProbe = (nextProbe: Probe) => {
    setProbe(nextProbe)
    setProbePinned(true)
  }

  return (
    <article className="windowing-module">
      <header className="windowing-hero">
        <div>
          <p className="section-kicker"><Contrast aria-hidden="true" /> Intensity and display</p>
          <h2>From stored pixels to visible contrast.</h2>
          <p>Follow a CT value from its encoded integer through HU calibration, windowing, and model-ready input.</p>
        </div>
        <div className="windowing-progress" aria-label={`Section ${activeChapter + 1} of ${chapters.length}`}><strong>{activeChapter + 1} / {chapters.length}</strong><span>Explore at your own pace</span></div>
      </header>

      <nav className="windowing-chapters" aria-label="Windowing learning sections">
        {chapters.map((item, index) => <button key={item.id} type="button" className={chapter === item.id ? 'is-active' : ''} onClick={() => { setChapter(item.id); if (item.id === 'presets') setMappingMode('linear') }}><span>{index + 1}</span><strong>{item.short}</strong><small>{item.label}</small></button>)}
      </nav>

      <div className="windowing-workbench">
        <section className="ct-viewer-card" aria-label="Interactive CT window viewer">
          <div className="viewer-toolbar"><span><ScanLine aria-hidden="true" /> AXIAL · CHEST</span><span>{mappingMode.toUpperCase()} · W {width} · C {center}</span></div>
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
            <p><strong>VOI (Value of Interest)</strong> is the DICOM display transform applied after modality values have been recovered. It selects which part of the value range receives visible contrast. In CT, this is commonly defined using window center and width, although a VOI lookup table or sigmoid function can also be used. With linear windowing, values below the selected range become black, values above it become white, and values inside it are distributed across the available grays.</p>
            <div className="value-pipeline" aria-label={`Example value pipeline: stored value ${storedValue}, slope 1, intercept minus 1024, ${probe.hu} Hounsfield units, display value ${probeGray}`}>
              <span><small>Pixel Data</small><strong>{storedValue}</strong><code>stored value</code></span>
              <b aria-hidden="true">× 1 + (−1024)</b>
              <span className="is-active"><small>Modality value</small><strong>{probe.hu > 0 ? '+' : ''}{probe.hu} HU</strong><code>slope + intercept</code></span>
              <b aria-hidden="true">VOI</b>
              <span><small>Display</small><strong>{probeGray} / 255</strong><code>current window</code></span>
            </div>
            <p className="pipeline-caption">This teaching example uses Rescale Slope 1 and Rescale Intercept −1024: stored value 24 therefore becomes −1000 HU. Real files can specify different values, an identity transform, or a Modality LUT; Bits Stored and Pixel Representation define the raw numeric range.</p>
            <h4>What the calibrated value means</h4>
            <p>For conventional CT, HU is a relative attenuation scale: water anchors 0 HU and air is approximately −1000 HU. Denser, more attenuating materials usually have larger positive values.</p>
            <div className="hu-equation"><span>HU = 1000 ×</span><span className="equation-fraction"><b>μ<sub>tissue</sub> − μ<sub>water</sub></b><i>μ<sub>water</sub></i></span></div>
            <HuScale activeHu={probe.hu} onSelect={selectProbe} />
            <p className="lesson-note"><Info aria-hidden="true" /> Tissue values are representative ranges, not immutable constants. Acquisition energy, reconstruction, contrast, and artifacts can shift measured HU.</p>
            <p className="lesson-note is-contrast"><Info aria-hidden="true" /><span><strong>CT is the calibrated case.</strong> Routine MR intensity is relative to the sequence, scanner, and acquisition; it has no universal HU-like tissue scale.</span></p>
          </>}

          {chapter === 'mapping' && <>
            <p className="lesson-number">02 · WINDOW TRANSFER FUNCTION</p>
            <h3 id="windowing-mapping-title">Choose a useful interval, then map it to the display.</h3>
            <p>Center and width select the HU interval. The transfer function decides how values in that interval become display brightness from 0–255.</p>
            <CurveEditor center={center} width={width} probeHu={probe.hu} mode={mappingMode} onModeChange={setMappingMode} points={curvePoints} onPointsChange={setCurvePoints} />
            <div className="window-definition-row"><span><small>Low</small><strong>{Math.round(bounds.low)} HU → {huToGray(bounds.low, center, width, mappingMode, curvePoints)}</strong></span><span><small>Center</small><strong>{center} HU → {huToGray(center, center, width, mappingMode, curvePoints)}</strong></span><span><small>High</small><strong>{Math.round(bounds.high)} HU → {huToGray(bounds.high, center, width, mappingMode, curvePoints)}</strong></span></div>
            <p className="mapping-mode-note"><strong>{mappingMode === 'linear' ? 'Linear window' : mappingMode === 'sigmoid' ? 'Sigmoid window' : 'Custom VOI curve'}.</strong> {mappingMode === 'linear' ? 'Below the interval is black, above it is white, and the values between follow a straight ramp.' : mappingMode === 'sigmoid' ? 'The same center and width produce a smooth toe and shoulder instead of abrupt clipping.' : 'Drag the points to redistribute contrast inside the selected interval while preserving intensity order.'}</p>
            <div className="display-consequences" aria-label="Window clipping and quantization summary">
              <span><small>Below {Math.round(bounds.low)} HU</small><strong>0 · clipped black</strong></span>
              <span><small>Inside the window</small><strong>0–255 · quantized</strong></span>
              <span><small>Above {Math.round(bounds.high)} HU</small><strong>255 · clipped white</strong></span>
            </div>
            <p className="quantization-note">{mappingMode === 'linear' ? `At this width, one 8-bit display step covers about ${huPerDisplayStep < 10 ? huPerDisplayStep.toFixed(1) : huPerDisplayStep.toFixed(0)} HU. Several input values can therefore share one displayed gray.` : 'With a nonlinear curve, HU-per-gray-step varies across the interval. The output is still a reduced display representation.'}</p>
            <div className="window-control-stack">
              <SliderControl label="Window width" value={width} min={1} max={3000} step={1} unit="HU" onChange={setWidth} />
              <p><strong>Width controls contrast.</strong> A narrow width spreads a small HU range across every gray; a wide width includes more tissue types with less separation.</p>
              <SliderControl label="Window center" value={center} min={-1000} max={1000} step={10} unit="HU" onChange={setCenter} />
              <p><strong>Center chooses the neighborhood.</strong> Moving it shifts both bounds together toward lower- or higher-attenuation anatomy.</p>
            </div>
            <p className="lesson-note"><Info aria-hidden="true" /><span><strong>DICOM nuance.</strong> A VOI stage may be linear, sigmoid, or an explicit lookup table. This demo assumes MONOCHROME2, where lower output values appear darker; MONOCHROME1 reverses that presentation. The 0–255 output here is an intuitive teaching target, not a limit on every clinical display pipeline.</span></p>
          </>}

          {chapter === 'presets' && <>
            <p className="lesson-number">03 · REPRESENTATIVE PRESETS</p>
            <h3 id="windowing-presets-title">The same voxels can answer different questions.</h3>
            <p>A preset is only a saved center and width. It changes the presentation—not the reconstructed CT values underneath.</p>
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
              {tissueRows.map((tissue) => <button type="button" role="row" key={tissue.label} onClick={() => selectProbe({ x: tissue.x, y: tissue.y, hu: tissue.hu, label: tissue.label })}><span role="cell">{tissue.label}</span><span role="cell">{tissue.hu}</span><span role="cell">{tissue.gray}</span><span role="cell" className="table-swatch"><i style={{ background: `rgb(${tissue.gray} ${tissue.gray} ${tissue.gray})` }} /></span></button>)}
            </div>
          </>}

          {chapter === 'ml' && <>
            <p className="lesson-number">04 · MODEL INPUT</p>
            <h3 id="windowing-ml-title">Display choices become preprocessing choices.</h3>
            <p>A model can consume calibrated HU, one windowed image, or several windows as channels. These representations are not interchangeable, even when they originate from the same CT voxels.</p>
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
                <div><small>Current transform</small><strong>W {width} · C {center}</strong><p>Compact and familiar, but every value below or above the chosen interval has been collapsed.</p></div>
              </>}
              {mlPipeline === 'multi' && <>
                <div className="ml-window-stack" aria-hidden="true">{[presets[0], presets[1], presets[3]].map((preset) => preset && <div key={preset.id}><CtSlice center={preset.center} width={preset.width} compact /><span>{preset.label}</span></div>)}</div>
                <div><small>Channel stack</small><strong>Lung · Soft · Bone</strong><p>Preserves several task-specific views, but increases channels and makes the window definitions part of the model contract.</p></div>
              </>}
            </div>
            <div className="ml-practice-list">
              <p><strong>Record the transform.</strong><span>Keep slope/intercept handling, clipping bounds, scaling, channel order, and output dtype with the experiment.</span></p>
              <p><strong>Match training and inference.</strong><span>A different window or a second accidental rescale changes the input distribution.</span></p>
              <p><strong>Know what was exported.</strong><span>A windowed PNG is a display derivative—not a recoverable copy of the original CT values.</span></p>
            </div>
          </>}
        </section>
      </div>

      <section className="windowing-summary" aria-label="Current window mapping">
        <div><SlidersHorizontal aria-hidden="true" /><span><small>Current interval</small><strong>{Math.round(bounds.low)} to {Math.round(bounds.high)} HU</strong></span></div>
        <div className="windowing-ramp" style={{ background: mappingGradient }} aria-hidden="true"><span style={{ left: `${clamp(((probe.hu - bounds.low) / width) * 100, 0, 100)}%` }} /></div>
        <div><Activity aria-hidden="true" /><span><small>Selected voxel</small><strong>{probe.hu} HU → {probeGray}</strong></span></div>
      </section>

      <footer className="windowing-sources">
        <span>Reference material</span>
        <a href="https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.11.html#sect_C.11.1" target="_blank" rel="noreferrer">DICOM Modality LUT</a>
        <a href="https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.11.2.html" target="_blank" rel="noreferrer">DICOM VOI LUT</a>
        <a href="https://www.ncbi.nlm.nih.gov/books/NBK547721/" target="_blank" rel="noreferrer">Hounsfield Unit</a>
        <a href="https://www.ncbi.nlm.nih.gov/books/NBK597347/" target="_blank" rel="noreferrer">CT physics</a>
        <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10361226/" target="_blank" rel="noreferrer">Representative lung windows</a>
      </footer>
    </article>
  )
}
