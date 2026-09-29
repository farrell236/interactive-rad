import { Activity, Contrast, Crosshair, Info, ScanLine, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

type ChapterId = 'hu' | 'mapping' | 'presets'
type PresetId = 'lung' | 'soft' | 'brain' | 'bone'
type MappingMode = 'linear' | 'sigmoid' | 'custom'

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
  { id: 'hu', label: 'CT and Hounsfield units', short: 'HU scale' },
  { id: 'mapping', label: 'How windowing works', short: 'Windowing' },
  { id: 'presets', label: 'Common windows', short: 'Presets' },
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

function CtSlice({ center, width, mode = 'linear', curvePoints = defaultCurvePoints, probe, onProbe, compact = false }: {
  center: number
  width: number
  mode?: MappingMode
  curvePoints?: CurvePoint[]
  probe?: Probe
  onProbe?: (probe: Probe) => void
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

  const handlePointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!onProbe) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 520
    const y = ((event.clientY - rect.top) / rect.height) * 420
    onProbe(sampleSlice(x, y))
  }

  return (
    <svg
      className={`ct-slice${compact ? ' is-compact' : ''}`}
      viewBox="0 0 520 420"
      role={compact ? undefined : 'img'}
      aria-label={compact ? undefined : 'Stylized axial chest CT responding to the selected window'}
      aria-hidden={compact || undefined}
      style={style}
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
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
        {probe && <g className="ct-probe" transform={`translate(${probe.x} ${probe.y})`} aria-hidden="true"><circle r="11" /><path d="M-17 0H17M0-17V17" /></g>}
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
  const xFor = (normalized: number) => plot.left + (normalized * plot.width)
  const yFor = (normalized: number) => plot.top + ((1 - normalized) * plot.height)
  const outputAt = (normalized: number) => huToGray(bounds.low + (normalized * width), center, width, mode, points) / 255
  const path = Array.from({ length: 81 }, (_, index) => {
    const input = index / 80
    return `${index === 0 ? 'M' : 'L'}${xFor(input).toFixed(2)} ${yFor(outputAt(input)).toFixed(2)}`
  }).join(' ')
  const probeInput = clamp((probeHu - bounds.low) / width, 0, 1)
  const probeOutput = huToGray(probeHu, center, width, mode, points) / 255
  const selected = points[selectedPoint] ?? points[1]

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
    updatePoint(index, (svgX - plot.left) / plot.width, 1 - ((svgY - plot.top) / plot.height))
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
        aria-label={`${mode} transfer curve mapping the selected Hounsfield unit interval to 8-bit display values`}
        onPointerMove={(event) => { if (dragging !== null) updateFromPointer(event, dragging) }}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        <rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} className="curve-plot" />
        <path className="curve-histogram" d="M52 210 L52 190 L72 186 L92 196 L112 170 L132 181 L152 126 L172 154 L192 186 L212 178 L232 108 L252 82 L272 102 L292 164 L312 183 L332 176 L352 142 L372 159 L392 191 L412 181 L432 196 L452 188 L472 194 L472 210Z" />
        <line x1={plot.left} x2={plot.left + plot.width} y1={yFor(0.5)} y2={yFor(0.5)} className="curve-gridline" />
        <line x1={xFor(0.5)} x2={xFor(0.5)} y1={plot.top} y2={plot.top + plot.height} className="curve-center" />
        <path d={path} className="curve-line" />
        {mode === 'custom' && points.map((point, index) => <circle
          key={index}
          cx={xFor(point.x)}
          cy={yFor(point.y)}
          r={selectedPoint === index ? 7 : 5.5}
          className={`curve-control-point${selectedPoint === index ? ' is-selected' : ''}${index === 0 || index === points.length - 1 ? ' is-fixed' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`Curve point ${index + 1}, input ${Math.round(point.x * 100)} percent, output ${Math.round(point.y * 255)}`}
          onPointerDown={(event) => { event.preventDefault(); setSelectedPoint(index); setDragging(index) }}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedPoint(index) }}
        />)}
        <circle cx={xFor(probeInput)} cy={yFor(probeOutput)} r="6" className="curve-probe" />
        <text x="15" y={plot.top + 4}>255</text><text x="25" y={plot.top + plot.height + 4}>0</text>
        <text x={plot.left} y="234" textAnchor="middle">{Math.round(bounds.low)}</text>
        <text x={xFor(0.5)} y="25" textAnchor="middle">C {center}</text>
        <text x={plot.left + plot.width} y="234" textAnchor="middle">{Math.round(bounds.high)}</text>
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

  const activeChapter = chapters.findIndex((item) => item.id === chapter)
  const activePreset = mappingMode === 'linear' ? presets.find((preset) => preset.center === center && preset.width === width) : undefined
  const bounds = windowBounds(center, width)
  const probeGray = huToGray(probe.hu, center, width, mappingMode, curvePoints)
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

  return (
    <article className="windowing-module">
      <header className="windowing-hero">
        <div>
          <p className="section-kicker"><Contrast aria-hidden="true" /> Intensity and display</p>
          <h2>From Hounsfield units to visible contrast.</h2>
          <p>Use one CT slice to see how thousands of attenuation values become a focused 8-bit display.</p>
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
            <CtSlice center={center} width={width} mode={mappingMode} curvePoints={curvePoints} probe={probe} onProbe={setProbe} />
            <div className="viewer-help"><Crosshair aria-hidden="true" /> Move over the image to inspect tissue</div>
          </div>
          <div className="probe-readout" role="status" aria-live="polite">
            <span><small>Sample</small><strong>{probe.label}</strong></span>
            <span><small>Input</small><strong>{probe.hu > 0 ? '+' : ''}{probe.hu} HU</strong></span>
            <span><small>Display</small><strong>{probeGray} / 255</strong></span>
            <span className="probe-swatch" style={{ background: grayColor(probe.hu, center, width, mappingMode, curvePoints) }} aria-label={`Displayed gray value ${probeGray}`} />
          </div>
        </section>

        <section className="windowing-lesson-card" aria-labelledby={`windowing-${chapter}-title`}>
          {chapter === 'hu' && <>
            <p className="lesson-number">01 · CT VALUE SCALE</p>
            <h3 id="windowing-hu-title">CT stores attenuation as Hounsfield units.</h3>
            <p>HU is a calibrated, relative scale: water anchors 0 HU and air is approximately −1000 HU. Denser, more attenuating materials usually have larger positive values.</p>
            <div className="hu-equation"><span>HU = 1000 ×</span><span className="equation-fraction"><b>μ<sub>tissue</sub> − μ<sub>water</sub></b><i>μ<sub>water</sub></i></span></div>
            <HuScale activeHu={probe.hu} onSelect={setProbe} />
            <p className="lesson-note"><Info aria-hidden="true" /> Tissue values are representative ranges, not immutable constants. Acquisition energy, reconstruction, contrast, and artifacts can shift measured HU.</p>
          </>}

          {chapter === 'mapping' && <>
            <p className="lesson-number">02 · WINDOW TRANSFER FUNCTION</p>
            <h3 id="windowing-mapping-title">Choose a useful interval, then map it to the display.</h3>
            <p>Center and width select the HU interval. The transfer function decides how values in that interval become display brightness from 0–255.</p>
            <CurveEditor center={center} width={width} probeHu={probe.hu} mode={mappingMode} onModeChange={setMappingMode} points={curvePoints} onPointsChange={setCurvePoints} />
            <div className="window-definition-row"><span><small>Low</small><strong>{Math.round(bounds.low)} HU → {huToGray(bounds.low, center, width, mappingMode, curvePoints)}</strong></span><span><small>Center</small><strong>{center} HU → {huToGray(center, center, width, mappingMode, curvePoints)}</strong></span><span><small>High</small><strong>{Math.round(bounds.high)} HU → {huToGray(bounds.high, center, width, mappingMode, curvePoints)}</strong></span></div>
            <p className="mapping-mode-note"><strong>{mappingMode === 'linear' ? 'Linear window' : mappingMode === 'sigmoid' ? 'Sigmoid window' : 'Custom VOI curve'}.</strong> {mappingMode === 'linear' ? 'Below the interval is black, above it is white, and the values between follow a straight ramp.' : mappingMode === 'sigmoid' ? 'The same center and width produce a smooth toe and shoulder instead of abrupt clipping.' : 'Drag the points to redistribute contrast inside the selected interval while preserving intensity order.'}</p>
            <div className="window-control-stack">
              <SliderControl label="Window width" value={width} min={1} max={3000} step={1} unit="HU" onChange={setWidth} />
              <p><strong>Width controls contrast.</strong> A narrow width spreads a small HU range across every gray; a wide width includes more tissue types with less separation.</p>
              <SliderControl label="Window center" value={center} min={-1000} max={1000} step={10} unit="HU" onChange={setCenter} />
              <p><strong>Center chooses the neighborhood.</strong> Moving it shifts both bounds together toward lower- or higher-attenuation anatomy.</p>
            </div>
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
              {tissueRows.map((tissue) => <button type="button" role="row" key={tissue.label} onClick={() => setProbe({ x: tissue.x, y: tissue.y, hu: tissue.hu, label: tissue.label })}><span role="cell">{tissue.label}</span><span role="cell">{tissue.hu}</span><span role="cell">{tissue.gray}</span><span role="cell" className="table-swatch"><i style={{ background: `rgb(${tissue.gray} ${tissue.gray} ${tissue.gray})` }} /></span></button>)}
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
        <a href="https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.11.2.html" target="_blank" rel="noreferrer">DICOM VOI LUT</a>
        <a href="https://www.ncbi.nlm.nih.gov/books/NBK547721/" target="_blank" rel="noreferrer">Hounsfield Unit</a>
        <a href="https://www.ncbi.nlm.nih.gov/books/NBK597347/" target="_blank" rel="noreferrer">CT physics</a>
        <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10361226/" target="_blank" rel="noreferrer">Representative lung windows</a>
      </footer>
    </article>
  )
}
