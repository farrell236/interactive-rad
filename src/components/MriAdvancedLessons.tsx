import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowRight, Check, ExternalLink, FileStack, ScanLine, ShieldCheck } from 'lucide-react'
import { forwardFft2d, inverseFft2d } from '../lib/fft2d'
import { mriVolumeSliceUrl } from '../lib/mriVolume'
import { ctRangeProgressStyle } from '../lib/rangeProgress'
import { sampleTimingLane, sequenceTimingDefinitions, type SequenceTimingKind } from '../lib/mriSequenceTiming'

type SequenceKind = SequenceTimingKind
type ArtifactKind = 'motion' | 'wrap' | 'susceptibility' | 'gibbs' | 'bias' | 'noise'
type PipelineStage = 'raw' | 'reconstruct' | 'series' | 'tensor'

const sourceUrl = mriVolumeSliceUrl(0)
const sourceSize = 128

const sequenceContent: Record<SequenceKind, {
  label: string
  layer: string
  role: string
  mechanism: string
  output: string
  check: string
  directlyAcquired: string
  parameters: string[]
}> = {
  spinEcho: {
    label: 'Spin echo',
    layer: 'Echo formation',
    role: 'RF-refocused echo',
    mechanism: 'A 90° excitation is followed by a 180° refocusing pulse. The pulse reverses dephasing from static field offsets but not irreversible T2 decay, so TE still controls how much T2-dependent signal remains.',
    output: 'The plot shows one echo. FSE/TSE repeats refocusing pulses to acquire several k-space lines per TR; effective TE, echo-train length, ordering, and refocusing angles then influence contrast, speed, and blurring.',
    check: 'TR · effective TE · echo-train length/spacing · k-space order · refocusing angles',
    directlyAcquired: 'Repeated complex echo samples → k-space → weighted image',
    parameters: ['TE 96 ms', '180° refocus · 48 ms after excitation', 'single echo shown'],
  },
  fastSpinEcho: {
    label: 'FSE / TSE',
    layer: 'Echo train',
    role: 'Refocused echo train',
    mechanism: 'One excitation is followed by several RF refocusing pulses. Each refocused echo is assigned a different phase encode, so several ky lines are acquired within one TR instead of repeating the entire sequence for every line.',
    output: 'The illustrated train acquires four ky lines. The echo assigned to central k-space defines the effective TE and strongly influences image contrast; echo spacing, ordering, train length, and refocusing angles also affect scan time and blurring.',
    check: 'TR · effective TE · echo-train length · echo spacing · ky order · refocusing angles',
    directlyAcquired: 'Complex echo-train samples → k-space → weighted image',
    parameters: ['echo-train length 4', '28 ms echo spacing', 'effective TE 88 ms'],
  },
  gradientEcho: {
    label: 'Gradient echo',
    layer: 'Echo formation',
    role: 'Gradient-refocused echo',
    mechanism: 'An excitation—often less than 90°—is followed by reversed readout-gradient area. No 180° RF pulse corrects static field offsets, so the echo retains T2* sensitivity. In this spoiled example, the post-readout spoiler gradient dephases residual transverse magnetization before the next excitation.',
    output: 'Supports fast 2D or 3D acquisitions and T1-, proton-density-, or T2*-sensitive contrast depending on TR, TE, flip angle, and preparation.',
    check: 'TR · TE · flip angle · spoiling · preparation',
    directlyAcquired: 'Repeated complex gradient echoes → k-space → weighted image',
    parameters: ['TE 26 ms', 'TR 56 ms', 'gradient spoiler shown'],
  },
  inversion: {
    label: 'Inversion recovery',
    layer: 'Preparation',
    role: 'Longitudinal preparation',
    mechanism: 'A 180° inversion drives longitudinal magnetization negative. After inversion time TI, an imaging readout samples tissues at different points in recovery; one tissue can be near zero signal.',
    output: 'Different TI values support fluid-like suppression in FLAIR or fat-like suppression in STIR. The displayed TI is illustrative—not a universal protocol value—and the later readout can use spin echo, FSE/TSE, or another architecture.',
    check: 'TI · TR · TE · readout family · field strength',
    directlyAcquired: 'Inversion-prepared echoes → k-space → suppressed-tissue image',
    parameters: ['TI 160 ms · illustrative', 'TE 100 ms', 'spin-echo readout'],
  },
  epi: {
    label: 'EPI',
    layer: 'Readout',
    role: 'Rapid k-space readout',
    mechanism: 'The plotted example is a reduced nine-line gradient-echo EPI acquisition: after one excitation, alternating readout gradients traverse k-space lines while brief phase blips move between them. EPI itself is a readout architecture and can instead follow spin-echo refocusing, as shown in the diffusion example. The illustrated 0.8 ms echo-to-echo interval is not receiver dwell time and should not be copied into the reconstruction-aware EffectiveEchoSpacing field without the required corrections.',
    output: 'Gradient-echo EPI is widely used for functional MRI, where repeated volumes form a 4D BOLD time series. Spin-echo EPI is commonly used for diffusion imaging. Both gain speed by traversing many k-space lines in one echo train and are sensitive to off-resonance distortion, signal decay through the train, and Nyquist ghosts.',
    check: 'EffectiveEchoSpacing · TotalReadoutTime · PhaseEncodingDirection · acceleration · bandwidth · fieldmap provenance',
    directlyAcquired: 'Rapid complex echo train → k-space → reconstructed volume or 4D series',
    parameters: ['TE 52 ms', '0.8 ms echo spacing', 'reduced 9-line example'],
  },
  diffusion: {
    label: 'Diffusion',
    layer: 'Contrast encoding',
    role: 'Motion-sensitive preparation',
    mechanism: 'A pair of diffusion gradients makes signal depend on motion along a chosen direction. Gradient amplitude, duration δ, separation Δ, ramps, and overall waveform shape jointly determine the b-value. For conventional linear encoding, a unit b-vector records direction; a b-matrix describes the full directional weighting. Both are defined in a coordinate frame and must be transformed when image axes are reoriented.',
    output: 'Diffusion-weighted k-space signals are acquired and reconstructed into a DWI volume series, with one b-value and b-vector per volume. An apparent diffusion coefficient (ADC) map is then fitted from at least one b=0 or low-b reference and one diffusion-weighted measurement under a declared signal model, and reported with units such as mm²/s. Tensor metrics require multiple directions, gradient orientations, and a model.',
    check: 'b-value · b-vector/b-matrix frame · TE · phase direction · readout time · ADC units/scaling · fit provenance',
    directlyAcquired: 'DW k-space → 4D DWI + bval/bvec → fitted ADC map',
    parameters: ['b = 1000 s/mm² · example', 'b = 0 reference', 'direction [0,1,0] · image axes'],
  },
}

const sequenceOrder = Object.keys(sequenceContent) as SequenceKind[]

function useRovingTabs<T extends string>(values: readonly T[], setSelected: (value: T) => void) {
  return (event: KeyboardEvent<HTMLButtonElement>, value: T) => {
    const index = values.indexOf(value)
    const nextIndex = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? (index + 1) % values.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? (index - 1 + values.length) % values.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : -1
    if (nextIndex < 0) return
    event.preventDefault()
    setSelected(values[nextIndex])
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs?.[nextIndex]?.focus()
  }
}

function SequenceTimeline({ kind }: { kind: SequenceKind }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(720)
  const definition = sequenceTimingDefinitions[kind]

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const updateWidth = () => setMeasuredWidth(Math.max(300, Math.floor(node.getBoundingClientRect().width)))
    updateWidth()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const width = measuredWidth
  const margin = { left: width < 430 ? 58 : 70, right: 14, top: definition.brackets.some((bracket) => bracket.level === 1) ? 54 : 38, bottom: 36 }
  const laneHeight = width < 430 ? 43 : 45
  const height = margin.top + definition.lanes.length * laneHeight + margin.bottom
  const plotLeft = margin.left
  const plotRight = width - margin.right
  const plotWidth = plotRight - plotLeft
  const xFor = (timeMs: number) => plotLeft + timeMs / definition.durationMs * plotWidth
  const baselineFor = (index: number) => margin.top + laneHeight * (index + 0.5)
  const amplitudeScale = laneHeight * 0.32
  const sampleCount = Math.max(420, Math.round(plotWidth * 1.5))
  const pathFor = (lane: (typeof definition.lanes)[number], index: number) => sampleTimingLane(definition, lane, sampleCount)
    .map((sample, sampleIndex) => `${sampleIndex === 0 ? 'M' : 'L'}${xFor(sample.timeMs).toFixed(2)} ${(baselineFor(index) - sample.value * amplitudeScale).toFixed(2)}`)
    .join(' ')
  const tickStep = width < 430 ? definition.tickMs * 2 : definition.tickMs
  const ticks = Array.from({ length: Math.floor(definition.durationMs / tickStep) + 1 }, (_, index) => index * tickStep)
  if (ticks.at(-1) !== definition.durationMs) {
    const finalTickGapPx = (definition.durationMs - (ticks.at(-1) ?? 0)) / definition.durationMs * plotWidth
    if (finalTickGapPx < 32) ticks[ticks.length - 1] = definition.durationMs
    else ticks.push(definition.durationMs)
  }

  return (
    <div className="mri-sequence-plot" ref={containerRef}>
      <svg className="mri-sequence-timeline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${sequenceContent[kind].label} timing plot from zero to ${definition.durationMs} milliseconds with ${definition.lanes.map((lane) => lane.label).join(', ')} lanes`}>
        <title>{sequenceContent[kind].label} sequence timing plot</title>
        <desc>{definition.timingSummary} The horizontal axis is time in milliseconds; waveform amplitudes are normalized.</desc>
        <defs><clipPath id={`mri-sequence-clip-${kind}`}><rect x={plotLeft} y={margin.top - laneHeight / 2} width={plotWidth} height={definition.lanes.length * laneHeight} /></clipPath></defs>
        <g className="mri-sequence-grid">
          {ticks.map((tick) => <line key={tick} x1={xFor(tick)} y1={margin.top - 11} x2={xFor(tick)} y2={height - margin.bottom + 3} />)}
        </g>
        <g clipPath={`url(#mri-sequence-clip-${kind})`}>
          {definition.readoutWindows.map((window, index) => <rect key={`${window.startMs}-${index}`} className="is-read-window" x={xFor(window.startMs)} y={margin.top - laneHeight / 2} width={Math.max(1, xFor(window.endMs) - xFor(window.startMs))} height={definition.lanes.length * laneHeight} />)}
        </g>
        {definition.brackets.map((bracket) => {
          const y = 13 + (bracket.level ?? 0) * 16
          return <g className="mri-sequence-bracket" key={`${bracket.label}-${bracket.startMs}`}><path d={`M${xFor(bracket.startMs)} ${y + 5} V${y} H${xFor(bracket.endMs)} V${y + 5}`} /><text x={(xFor(bracket.startMs) + xFor(bracket.endMs)) / 2} y={y - 3} textAnchor="middle">{bracket.label}</text></g>
        })}
        {definition.lanes.map((lane, index) => {
          const baseline = baselineFor(index)
          return <g className={`mri-sequence-lane is-${lane.key}`} key={lane.key}>
            <text className="is-lane-label" x={plotLeft - 9} y={baseline + 4} textAnchor="end">{lane.label}</text>
            <line className="is-baseline" x1={plotLeft} y1={baseline} x2={plotRight} y2={baseline} />
            <path className="is-waveform" clipPath={`url(#mri-sequence-clip-${kind})`} d={pathFor(lane, index)} />
            {lane.events.filter((event, eventIndex) => event.label && !(width < 430 && kind === 'fastSpinEcho' && lane.key === 'rf' && eventIndex === 1)).map((event) => {
              const center = (event.startMs + event.endMs) / 2
              return <text className="is-event-label" key={`${event.label}-${center}`} x={xFor(center)} y={baseline - amplitudeScale - 5} textAnchor="middle">{event.label}</text>
            })}
          </g>
        })}
        {definition.markers.filter((marker) => marker.kind === 'echo').map((marker) => {
          const markerX = xFor(marker.timeMs)
          const alignToEnd = markerX > plotRight - 150
          return <g className="mri-sequence-marker" key={`${marker.timeMs}-${marker.label}`}><line x1={markerX} y1={margin.top - 11} x2={markerX} y2={height - margin.bottom + 3} /><text x={markerX + (alignToEnd ? -5 : 5)} y={height - margin.bottom - 5} textAnchor={alignToEnd ? 'end' : 'start'}>{marker.label}</text></g>
        })}
        <line className="mri-sequence-axis" x1={plotLeft} y1={height - margin.bottom + 3} x2={plotRight} y2={height - margin.bottom + 3} />
        {ticks.map((tick, index) => <text className="is-axis-tick" key={`label-${tick}`} x={xFor(tick)} y={height - 16} textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}>{tick}</text>)}
        <text className="is-axis-title" x={(plotLeft + plotRight) / 2} y={height - 2} textAnchor="middle">Time (ms)</text>
      </svg>
      <p>{definition.timingSummary}</p>
    </div>
  )
}

export function MriSequenceLesson() {
  const [selected, setSelected] = useState<SequenceKind>('spinEcho')
  const handleTabs = useRovingTabs(sequenceOrder, setSelected)
  const content = sequenceContent[selected]

  return (
    <div className="mri-advanced-references mri-sequence-references">
      <section className="mri-advanced-lab mri-sequence-lab">
        <header><div><span>Sequence comparator</span><h4>Read each recipe on a millisecond timeline</h4><p>Select an example acquisition to see which building block it emphasizes, when signal is sampled, and how the measured data becomes an image or fitted map. Each example uses its own labeled time range.</p></div><div className="mri-sequence-family"><small>Primary teaching role</small><strong>{content.role}</strong></div></header>
        <div className="mri-sequence-tabs" role="tablist" aria-label="MRI example acquisition">
          {sequenceOrder.map((kind) => <button key={kind} type="button" role="tab" id={`mri-sequence-tab-${kind}`} aria-controls="mri-sequence-panel" aria-selected={selected === kind} tabIndex={selected === kind ? 0 : -1} onClick={() => setSelected(kind)} onKeyDown={(event) => handleTabs(event, kind)}><small>{sequenceContent[kind].layer}</small><strong>{sequenceContent[kind].label}</strong></button>)}
        </div>
        <div id="mri-sequence-panel" role="tabpanel" aria-labelledby={`mri-sequence-tab-${selected}`} className="mri-sequence-panel" aria-live="polite">
          <figure><figcaption><strong>{content.label} timing</strong><span>schematic normalized amplitudes · milliseconds · independent time scale</span></figcaption><SequenceTimeline kind={selected} /></figure>
          <aside>
            <span>Mechanism</span><p>{content.mechanism}</p>
            <span>What it produces</span><p>{content.output}</p>
            <dl><div><dt>Representation</dt><dd>{content.directlyAcquired}</dd></div><div><dt>Metadata to verify</dt><dd>{content.check}</dd></div></dl>
          </aside>
        </div>
        <div className="mri-sequence-parameters" aria-label={`${content.label} key parameters`}><strong>Key parameters</strong><div>{content.parameters.map((parameter) => <span key={parameter}>{parameter}</span>)}</div></div>
      </section>

      <section className="mri-advanced-reference mri-sequence-output-reference">
        <header><div><span>Composition reference</span><h4>See how familiar acquisitions combine the building blocks</h4><p>Each example combines preparation, echo formation, echo-train architecture, and readout into a model-visible data product.</p></div></header>
        <div className="mri-sequence-output-grid">
          <article><strong>T2 FSE / TSE</strong><p>Spin-echo refocusing train + T2-weighting timing + conventional Cartesian line readout → reconstructed T2-weighted image.</p><small>ML consequence: effective TE, echo-train length, ordering, and refocusing angles change contrast and blur.</small></article>
          <article><strong>FLAIR</strong><p>Fluid-nulling inversion preparation + T2-weighted FSE/TSE echo train + Cartesian line readout → fluid-suppressed T2-weighted image.</p><small>ML consequence: TI, field strength, and readout determine what is suppressed and how the image appears.</small></article>
          <article><strong>DWI and ADC</strong><p>Diffusion preparation + spin-echo refocusing + commonly single-shot EPI → reconstructed 4D DWI paired with b-values and b-vectors; repeat across b-values → fitted ADC.</p><small>ML consequence: preserve the b-vector coordinate frame, ADC units and scaling, source b-values, and fit model.</small></article>
        </div>
        <aside><strong>Minimum ML handoff</strong><p>Retain acquisition classification, timing, echo-train and readout fields, geometry, phase direction, diffusion b-values and b-vectors with their coordinate frame, original/derived status, units and scaling, source images, and reconstruction or fitting provenance. Split by patient or subject first, then keep all related acquisitions, repeats, reconstructions, and derived maps in that same train, validation, or test split.</p></aside>
      </section>
    </div>
  )
}

const artifactContent: Record<ArtifactKind, {
  label: string
  signature: string
  cause: string
  space: string
  risk: string
  check: string
}> = {
  motion: { label: 'Motion ghosting', signature: 'Repeated or blurred anatomy along the phase-encoding direction.', cause: 'The object changed while different k-space lines were acquired.', space: 'Inconsistent phase between lines', risk: 'A model may learn motion severity, duplicate boundaries, or lose small structures.', check: 'Review the full volume, acquisition time, repeats, and phase-encoding direction.' },
  wrap: { label: 'Wraparound', signature: 'Anatomy outside the encoded field of view folds onto the opposite side.', cause: 'Sampling is insufficient for the object extent in the phase direction.', space: 'Aliasing from undersampling', risk: 'Nonlocal anatomy can overlap the target and corrupt masks or crops.', check: 'Verify FOV, phase direction, oversampling, and whether preprocessing cropped the fold.' },
  susceptibility: { label: 'Susceptibility', signature: 'Local geometric warping and signal loss, often strongest in long EPI readouts.', cause: 'Off-resonance varies across tissue and air interfaces during frequency encoding.', space: 'Position-dependent phase accrual', risk: 'Anatomy can be misregistered to labels, other contrasts, or templates.', check: 'Check TE, bandwidth, echo spacing, phase direction, and distortion-correction provenance.' },
  gibbs: { label: 'Gibbs ringing', signature: 'Alternating bright and dark bands near sharp boundaries.', cause: 'Finite k-space extent truncates the representation of an abrupt edge.', space: 'Hard high-frequency cutoff', risk: 'Ringing can resemble thin anatomy or bias boundary-sensitive features.', check: 'Inspect native resolution before interpolation or sharpening.' },
  bias: { label: 'Bias field', signature: 'Slowly varying brightness across tissue that should be comparatively uniform.', cause: 'Transmit and receive field sensitivity varies spatially.', space: 'Low-frequency intensity modulation', risk: 'The model may use coil position or site-specific shading as a shortcut.', check: 'Record coil/site, preserve uncorrected data, and fit correction without test leakage.' },
  noise: { label: 'Noise', signature: 'Granular background and uncertain low-signal structure.', cause: 'Finite received signal, receiver noise, reconstruction, and acceleration.', space: 'Complex noise before magnitude', risk: 'Denoising can erase detail; varying SNR can become a scanner or protocol cue.', check: 'Compare acquired voxel size, averages, bandwidth, acceleration, and reconstruction.' },
}

const artifactOrder = Object.keys(artifactContent) as ArtifactKind[]

function clamp(value: number) { return Math.max(0, Math.min(1, value)) }
function sourceCoordinate(coordinate: number, size: number) { return ((coordinate % size) + size) % size }

function applyArtifact(source: Float64Array, kind: ArtifactKind, amount: number) {
  const output = new Float64Array(source.length)
  const mix = amount / 100
  if (kind === 'gibbs') {
    const spectrum = forwardFft2d(source, sourceSize)
    const halfWidth = Math.round(54 - mix * 38)
    for (let y = 0; y < sourceSize; y += 1) {
      const ky = y <= sourceSize / 2 ? y : y - sourceSize
      for (let x = 0; x < sourceSize; x += 1) {
        const kx = x <= sourceSize / 2 ? x : x - sourceSize
        if (Math.abs(kx) > halfWidth || Math.abs(ky) > halfWidth) {
          const index = y * sourceSize + x
          spectrum.re[index] = 0
          spectrum.im[index] = 0
        }
      }
    }
    const reconstructed = inverseFft2d(spectrum)
    for (let index = 0; index < output.length; index += 1) output[index] = clamp(reconstructed.re[index])
    return output
  }

  for (let y = 0; y < sourceSize; y += 1) {
    for (let x = 0; x < sourceSize; x += 1) {
      const index = y * sourceSize + x
      const value = source[index]
      if (kind === 'motion') {
        const offset = Math.max(3, Math.round(8 + mix * 18))
        const ghostA = source[sourceCoordinate(y + offset, sourceSize) * sourceSize + x]
        const ghostB = source[sourceCoordinate(y - offset * 2, sourceSize) * sourceSize + x]
        output[index] = clamp((value + ghostA * mix * 0.42 + ghostB * mix * 0.25) / (1 + mix * 0.67))
      } else if (kind === 'wrap') {
        const folded = source[sourceCoordinate(y + Math.round(sourceSize * (0.48 - mix * 0.13)), sourceSize) * sourceSize + x]
        const edgeWeight = Math.pow(Math.abs(y - sourceSize / 2) / (sourceSize / 2), 1.4)
        output[index] = clamp(value + folded * mix * 0.7 * edgeWeight)
      } else if (kind === 'susceptibility') {
        const normalizedY = (y - sourceSize / 2) / (sourceSize / 2)
        const local = Math.exp(-Math.pow((normalizedY + 0.15) / 0.28, 2))
        const shift = Math.round(Math.sin(normalizedY * 8) * mix * 12 * local)
        const shifted = source[y * sourceSize + sourceCoordinate(x + shift, sourceSize)]
        const dropout = 1 - mix * 0.72 * local * Math.exp(-Math.pow((x - sourceSize * 0.58) / 23, 2))
        output[index] = clamp(shifted * dropout)
      } else if (kind === 'bias') {
        const nx = (x - sourceSize * 0.18) / sourceSize
        const ny = (y - sourceSize * 0.22) / sourceSize
        const field = 1.35 - mix * 1.55 * Math.sqrt(nx * nx + ny * ny)
        output[index] = clamp(value * Math.max(0.32, field))
      } else {
        const hashA = Math.sin((x * 127.1 + y * 311.7) * 0.017) * 43758.5453
        const hashB = Math.sin((x * 269.5 + y * 183.3) * 0.019) * 24634.6345
        const n1 = (hashA - Math.floor(hashA) - 0.5) * mix * 0.34
        const n2 = (hashB - Math.floor(hashB) - 0.5) * mix * 0.34
        output[index] = clamp(Math.sqrt(Math.pow(value + n1, 2) + n2 * n2))
      }
    }
  }
  return output
}

function pixelBuffer(values: Float64Array, difference?: Float64Array) {
  const pixels = new Uint8ClampedArray(values.length * 4)
  for (let index = 0; index < values.length; index += 1) {
    const value = difference ? Math.abs(values[index] - difference[index]) * 2.4 : values[index]
    const level = Math.round(clamp(value) * 255)
    const out = index * 4
    if (difference) {
      pixels[out] = Math.round(level * 0.72)
      pixels[out + 1] = Math.round(level * 0.36)
      pixels[out + 2] = level
    } else pixels[out] = pixels[out + 1] = pixels[out + 2] = level
    pixels[out + 3] = 255
  }
  return pixels
}

function PixelCanvas({ pixels, label }: { pixels: Uint8ClampedArray | null; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!pixels) return
    const context = ref.current?.getContext('2d')
    if (!context) return
    const image = context.createImageData(sourceSize, sourceSize)
    image.data.set(pixels)
    context.putImageData(image, 0, 0)
  }, [pixels])
  return <canvas ref={ref} width={sourceSize} height={sourceSize} role="img" aria-label={label} />
}

function useArtifactSource() {
  const [source, setSource] = useState<Float64Array | null>(null)
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width = sourceSize
      canvas.height = sourceSize
      const context = canvas.getContext('2d')
      if (!context) return
      context.drawImage(image, 0, 0, sourceSize, sourceSize)
      const data = context.getImageData(0, 0, sourceSize, sourceSize).data
      const values = new Float64Array(sourceSize * sourceSize)
      for (let index = 0; index < values.length; index += 1) values[index] = data[index * 4] / 255
      setSource(values)
    }
    image.src = sourceUrl
    return () => { cancelled = true }
  }, [])
  return source
}

export function MriArtifactLesson() {
  const [selected, setSelected] = useState<ArtifactKind>('motion')
  const [severity, setSeverity] = useState(58)
  const source = useArtifactSource()
  const content = artifactContent[selected]
  const handleTabs = useRovingTabs(artifactOrder, setSelected)
  const rendered = useMemo(() => source ? applyArtifact(source, selected, severity) : null, [selected, severity, source])
  const sourcePixels = useMemo(() => source ? pixelBuffer(source) : null, [source])
  const renderedPixels = useMemo(() => rendered ? pixelBuffer(rendered) : null, [rendered])
  const differencePixels = useMemo(() => source && rendered ? pixelBuffer(rendered, source) : null, [rendered, source])

  return (
    <div className="mri-advanced-references mri-artifact-references">
      <section className="mri-advanced-lab mri-artifact-lab">
        <header><div><span>Controlled comparison</span><h4>Trace an artifact back upstream</h4><p>Apply one educational approximation to the same real T2-weighted slice. Compare the visible signature with its acquisition-space cause and likely ML failure.</p></div><label className="mri-artifact-severity"><span><strong>Severity</strong><output>{severity}%</output></span><input type="range" min="10" max="100" value={severity} aria-label="Artifact severity" style={ctRangeProgressStyle(severity, 10, 100)} onChange={(event) => setSeverity(Number(event.target.value))} /></label></header>
        <div className="mri-artifact-tabs" role="tablist" aria-label="MRI artifact type">
          {artifactOrder.map((kind) => <button key={kind} type="button" role="tab" id={`mri-artifact-tab-${kind}`} aria-controls={`mri-artifact-panel-${kind}`} aria-selected={selected === kind} tabIndex={selected === kind ? 0 : -1} onClick={() => setSelected(kind)} onKeyDown={(event) => handleTabs(event, kind)}>{artifactContent[kind].label}</button>)}
        </div>
        <div id={`mri-artifact-panel-${selected}`} role="tabpanel" aria-labelledby={`mri-artifact-tab-${selected}`} className="mri-artifact-stage">
          <figure><figcaption><strong>Reference</strong><span>same slice</span></figcaption><div>{sourcePixels ? <PixelCanvas pixels={sourcePixels} label="Unaltered axial T2-weighted reference slice" /> : <img src={sourceUrl} alt="Unaltered axial T2-weighted reference slice" />}</div></figure>
          <figure><figcaption><strong>{content.label}</strong><span>{severity}% teaching effect</span></figcaption><div>{renderedPixels ? <PixelCanvas pixels={renderedPixels} label={`Axial T2-weighted slice with simulated ${content.label.toLowerCase()}`} /> : <img src={sourceUrl} alt="Loading artifact rendering" />}</div></figure>
          <figure><figcaption><strong>Difference</strong><span>absolute change</span></figcaption><div className="is-difference">{differencePixels ? <PixelCanvas pixels={differencePixels} label={`Difference map for simulated ${content.label.toLowerCase()}`} /> : null}</div></figure>
        </div>
        <div className="mri-artifact-explanation">
          <article><span>Visible signature</span><p>{content.signature}</p></article>
          <article><span>Upstream cause</span><p>{content.cause}</p><small>{content.space}</small></article>
          <article><span>ML consequence</span><p>{content.risk}</p><small>{content.check}</small></article>
        </div>
        <p className="mri-artifact-caveat"><AlertTriangle aria-hidden="true" />These controlled renderings isolate a recognizable signature; real artifacts can combine, vary by sequence, and require raw data or metadata to diagnose.</p>
      </section>

      <section className="mri-advanced-reference mri-quality-reference">
        <header><div><span>Acquisition trade-off</span><h4>Resolution, signal, and time share one budget</h4><p>Changing a displayed matrix or interpolating an image does not create acquired detail. The protocol determines what was measured.</p></div></header>
        <div className="mri-quality-triad">
          <article><strong>Smaller acquired voxels</strong><p>Can represent finer spatial variation, but less tissue contributes signal to each voxel.</p><small>Check FOV, matrix, slice thickness, and point spread—not display size.</small></article>
          <ArrowRight aria-hidden="true" />
          <article><strong>Recover more SNR</strong><p>Increase voxel volume or averages, lower bandwidth, use coil sensitivity, or accept longer acquisition.</p><small>Each option changes another part of the experiment.</small></article>
          <ArrowRight aria-hidden="true" />
          <article><strong>Shorten the scan</strong><p>Reduce samples or use acceleration, shifting work toward coil encoding, assumptions, and reconstruction.</p><small>Inspect residual aliasing, noise amplification, and smoothing.</small></article>
        </div>
        <div className="mri-artifact-reference-grid">
          {artifactOrder.map((kind) => <article key={kind}><strong>{artifactContent[kind].label}</strong><span>{artifactContent[kind].space}</span><p>{artifactContent[kind].risk}</p></article>)}
        </div>
        <footer><span>Source anatomy: CIE T2 template · CC BY 4.0</span><a href="https://doi.org/10.5281/zenodo.5018356" target="_blank" rel="noreferrer">Template record <ExternalLink aria-hidden="true" /></a></footer>
      </section>
    </div>
  )
}

const pipelineContent: Record<PipelineStage, {
  label: string
  shape: string
  representation: string
  operation: string
  preserve: string
  lost: string
}> = {
  raw: { label: 'Raw acquisition', shape: '[coil, echo, kᵧ, kₓ] complex', representation: 'Separate real/imaginary or magnitude/phase values for each receive channel.', operation: 'Identify axes, sampling mask, trajectory, noise scans, calibration, and acquisition metadata before reordering.', preserve: 'Coil identity · phase · sampling coordinates · timing', lost: 'Nothing should be silently squeezed, sorted, or cast to magnitude.' },
  reconstruct: { label: 'Reconstruction', shape: '[coil, z, y, x] complex → [z, y, x]', representation: 'Fourier or model-based reconstruction applies geometry, corrections, and coil combination.', operation: 'Record the reconstruction version, sensitivity estimation, acceleration, filters, and whether magnitude or phase was exported.', preserve: 'Affine · orientation · voxel spacing · complex provenance', lost: 'Magnitude removes phase; coil combination removes independent channels.' },
  series: { label: 'Series selection', shape: 'several non-interchangeable 3D or 4D volumes', representation: 'Original images, repeats, localizers, contrasts, diffusion volumes, and derived maps may coexist.', operation: 'Classify with image type and acquisition metadata—not filename, brightness, or series description alone.', preserve: 'Series UID · timing · sequence · derivation · phase direction', lost: 'Selecting one export can hide repeats, source images, or fit provenance.' },
  tensor: { label: 'Model tensor', shape: '[batch, channel, depth, height, width]', representation: 'Registered channels or one selected series after documented preprocessing.', operation: 'Split by patient first; then fit intensity statistics on training data and apply geometry-aware resampling consistently.', preserve: 'Channel meaning · affine · mask · transform chain · subject group', lost: 'Cropping, normalization, and resampling can hide original scale and field of view.' },
}

const pipelineOrder = Object.keys(pipelineContent) as PipelineStage[]

export function MriMlPipelineLesson() {
  const [selected, setSelected] = useState<PipelineStage>('raw')
  const [channels, setChannels] = useState({ t1: true, t2: true, flair: false })
  const handleTabs = useRovingTabs(pipelineOrder, setSelected)
  const selectedChannels = Object.entries(channels).filter(([, enabled]) => enabled).map(([name]) => name.toUpperCase())
  const content = pipelineContent[selected]

  return (
    <div className="mri-advanced-references mri-ml-references">
      <section className="mri-advanced-lab mri-ml-lab">
        <header><div><span>Representation trace</span><h4>Follow one examination into a tensor</h4><p>At each stage, identify the array axes, the operation that changed them, and the information that no longer reaches the model.</p></div><div className="mri-ml-integrity"><ShieldCheck aria-hidden="true" /><span><small>Invariant</small><strong>Patient identity + provenance</strong></span></div></header>
        <div className="mri-ml-pipeline" role="tablist" aria-label="MRI data pipeline stage">
          {pipelineOrder.map((stage, index) => <div key={stage}><button type="button" role="tab" id={`mri-ml-tab-${stage}`} aria-controls={`mri-ml-panel-${stage}`} aria-selected={selected === stage} tabIndex={selected === stage ? 0 : -1} onClick={() => setSelected(stage)} onKeyDown={(event) => handleTabs(event, stage)}><small>{String(index + 1).padStart(2, '0')}</small><strong>{pipelineContent[stage].label}</strong></button>{index < pipelineOrder.length - 1 && <ArrowRight aria-hidden="true" />}</div>)}
        </div>
        <div id={`mri-ml-panel-${selected}`} role="tabpanel" aria-labelledby={`mri-ml-tab-${selected}`} className="mri-ml-stage">
          <figure className={`is-${selected}`}>
            <figcaption><strong>{content.label}</strong><span>{content.shape}</span></figcaption>
            {selected === 'raw' && <div className="mri-ml-array is-raw" aria-label="Complex multi-coil raw array"><i /><i /><i /><i /><b>Re + iIm</b><small>coil × echo × kᵧ × kₓ</small></div>}
            {selected === 'reconstruct' && <div className="mri-ml-reconstruction"><div className="mri-ml-array is-coils"><i /><i /><i /><b>coil images</b></div><ArrowRight aria-hidden="true" /><img src={sourceUrl} alt="Reconstructed axial T2-weighted magnitude image" /></div>}
            {selected === 'series' && <div className="mri-ml-series-list" aria-label="Example MRI examination series"><span>Localizer <small>exclude</small></span><span>T1w <small>original</small></span><span className="is-selected">T2w <small>original</small></span><span>FLAIR <small>original</small></span><span>DWI b=0/1000 <small>original</small></span><span>ADC <small>derived</small></span></div>}
            {selected === 'tensor' && <div className="mri-ml-tensor-builder"><div className="mri-ml-channel-picker" role="group" aria-label="Model tensor channels">{(['t1', 't2', 'flair'] as const).map((channel) => <button key={channel} type="button" aria-pressed={channels[channel]} onClick={() => setChannels((current) => ({ ...current, [channel]: !current[channel] }))}><span>{channels[channel] && <Check aria-hidden="true" />}</span>{channel.toUpperCase()}</button>)}</div><div className="mri-ml-tensor"><b>{selectedChannels.length > 0 ? selectedChannels.join(' + ') : 'No channels'}</b><strong>[B, {selectedChannels.length}, D, H, W]</strong><small>stack only after geometry is reconciled</small></div></div>}
          </figure>
          <aside>
            <span>Representation</span><p>{content.representation}</p>
            <span>Operation</span><p>{content.operation}</p>
            <dl><div><dt>Preserve</dt><dd>{content.preserve}</dd></div><div><dt>Information removed or changed</dt><dd>{content.lost}</dd></div></dl>
          </aside>
        </div>
      </section>

      <section className="mri-advanced-reference mri-ml-reference">
        <header><div><span>Engineering checklist</span><h4>Validate identity before values</h4><p>A clean tensor can still be wrong if its series, axes, geometry, derivation, or split membership were inferred incorrectly.</p></div></header>
        <div className="mri-ml-checks">
          <article><FileStack aria-hidden="true" /><strong>Series identity</strong><p>Sequence family, TR/TE/TI, flip angle, image type, original/derived status, echo, b-value, direction, and contrast agent state.</p></article>
          <article><ScanLine aria-hidden="true" /><strong>Geometry</strong><p>Orientation, affine, spacing, slice order, handedness, phase-encoding direction, registration target, and interpolation method.</p></article>
          <article><ShieldCheck aria-hidden="true" /><strong>Intensity + QC</strong><p>Magnitude/phase status, bias correction, normalization fit, clipping, artifact checks, missing series, and transform versions.</p></article>
          <article><AlertTriangle aria-hidden="true" /><strong>Leakage + shift</strong><p>Split by patient before fitting preprocessing; group repeats and derivatives; audit scanner, site, protocol, and artifact shortcuts.</p></article>
        </div>
        <div className="mri-ml-ledger" role="table" aria-label="MRI representation provenance ledger">
          <div role="row" className="is-heading"><span role="columnheader">Stage</span><span role="columnheader">Value change</span><span role="columnheader">Geometry change</span><span role="columnheader">Minimum record</span></div>
          <div role="row"><strong role="cell">Reconstruct</strong><span role="cell">complex → magnitude / phase</span><span role="cell">k-space → image affine</span><span role="cell">method + calibration + version</span></div>
          <div role="row"><strong role="cell">Convert</strong><span role="cell">usually preserved</span><span role="cell">DICOM frames → NIfTI axes</span><span role="cell">UID map + affine + orientation</span></div>
          <div role="row"><strong role="cell">Preprocess</strong><span role="cell">normalize / correct / denoise</span><span role="cell">register / resample / crop</span><span role="cell">parameters + fitted data + transform chain</span></div>
        </div>
        <footer><span>Source anatomy: CIE T2 template · CC BY 4.0</span><a href="https://doi.org/10.5281/zenodo.5018356" target="_blank" rel="noreferrer">Template record <ExternalLink aria-hidden="true" /></a></footer>
      </section>
    </div>
  )
}
