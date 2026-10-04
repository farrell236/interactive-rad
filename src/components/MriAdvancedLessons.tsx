import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowRight, Check, ExternalLink, FileStack, ScanLine, ShieldCheck } from 'lucide-react'
import { forwardFft2d, inverseFft2d } from '../lib/fft2d'
import { mriVolumeSliceUrl } from '../lib/mriVolume'
import { applyArtifact, parallelAliasOffsets, type ArtifactKind } from '../lib/mriArtifactSimulation'
import { ctRangeProgressStyle } from '../lib/rangeProgress'
import { sampleTimingLane, sequenceTimingDefinitions, type SequenceTimingKind } from '../lib/mriSequenceTiming'

type SequenceKind = SequenceTimingKind
type PipelineStage = 'raw' | 'reconstruct' | 'series' | 'convert' | 'preprocess' | 'tensor'
type TensorLayout = '2d' | '2.5d' | '3d' | 'dynamic'
type QualityMode = 'voxel' | 'signal' | 'speed'

const sourceUrl = mriVolumeSliceUrl(0)
const sourceSize = 128
const qualityModeOrder: QualityMode[] = ['voxel', 'signal', 'speed']
const qualityVolumeUrls = [-5, 0, 5].map(mriVolumeSliceUrl)

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
    const tabs = (event.currentTarget.closest('[role="tablist"]') ?? event.currentTarget.parentElement)?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
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
  direction?: 'phase' | 'readout'
}> = {
  motion: { label: 'Motion ghosting', signature: 'Repeated or blurred anatomy along the phase-encoding direction.', cause: 'The object changed while different k-space lines were acquired.', space: 'Inconsistent phase between lines', risk: 'A model may learn motion severity, duplicate boundaries, or lose small structures.', check: 'Review the full volume, acquisition time, repeats, and phase-encoding direction.', direction: 'phase' },
  nyquist: { label: 'EPI N/2 ghost', signature: 'A structured replica appears approximately half a field of view away along the phase-encoding direction.', cause: 'In EPI, alternating readout gradients sample odd and even k-space lines with opposite polarity. A phase mismatch between those line families creates a Nyquist, or N/2, ghost even when the patient is still.', space: 'Odd–even EPI mismatch → half-FOV ghost', risk: 'The displaced replica can overlap anatomy, corrupt masks, or become a sequence- and scanner-specific shortcut.', check: 'Verify EPI use, phase direction, ghost-correction provenance, and the full field of view; do not automatically label every ghost as motion.', direction: 'phase' },
  wrap: { label: 'Wraparound', signature: 'Anatomy outside the encoded field of view folds onto the opposite side.', cause: 'Sampling is insufficient for the object extent in the phase direction.', space: 'Aliasing from undersampling', risk: 'Nonlocal anatomy can overlap the target and corrupt masks or crops.', check: 'Verify FOV, phase direction, oversampling, and whether preprocessing cropped the fold.', direction: 'phase' },
  susceptibility: { label: 'Susceptibility', signature: 'Local geometric warping and signal loss, often strongest in long EPI readouts.', cause: 'Off-resonance accumulates phase throughout readout. In Cartesian EPI, the low-bandwidth phase-encoding direction usually shows the largest displacement; intravoxel dephasing produces signal loss.', space: 'Off-resonance phase → EPI phase-direction warp', risk: 'Anatomy can be misregistered to labels, other contrasts, or templates.', check: 'Verify EffectiveEchoSpacing, TotalReadoutTime, PhaseEncodingDirection, field maps or reversed-phase images, and distortion-correction provenance.', direction: 'phase' },
  chemicalShift: { label: 'Chemical shift', signature: 'This schematic shows Type 1 chemical shift: bright and dark displacement bands at a peripheral fat–water boundary along readout.', cause: 'Fat and water resonate at different frequencies, so frequency encoding assigns them slightly different positions. Type 1 displacement grows at higher B₀ or lower receiver bandwidth. Type 2 chemical shift is a separate echo-time-dependent cancellation of fat and water within the same voxel.', space: 'Type 1: fat–water displacement along readout', risk: 'Shifted boundaries can mimic or obscure thin structures and misalign image channels or labels.', check: 'For Type 1, check field strength, receiver bandwidth, readout direction, and fat suppression. For Type 2, check TE and whether the acquisition is in phase or opposed phase.', direction: 'readout' },
  gibbs: { label: 'Gibbs ringing', signature: 'Alternating bright and dark bands near sharp boundaries.', cause: 'Finite k-space extent truncates the representation of an abrupt edge.', space: 'Hard high-frequency cutoff', risk: 'Ringing can resemble thin anatomy or bias boundary-sensitive features.', check: 'Inspect native resolution before interpolation or sharpening.' },
  bias: { label: 'Bias field', signature: 'Slowly varying brightness across tissue that should be comparatively uniform.', cause: 'Transmit-field homogeneity and receive-coil sensitivity vary spatially.', space: 'Low-frequency intensity modulation', risk: 'The model may use coil position or site-specific shading as a shortcut.', check: 'Record coil/site, preserve uncorrected data, and fit correction without test leakage.' },
  noise: { label: 'Noise', signature: 'Granular background, a positive magnitude-image noise floor, and uncertain low-signal structure.', cause: 'Thermal noise is approximately Gaussian in complex coil data. Magnitude formation makes low-SNR noise non-Gaussian, while coil combination and parallel imaging can make its scale spatially variable.', space: 'Complex Gaussian noise → magnitude noise floor', risk: 'Gaussian image-space augmentation may be unrealistic; denoising can erase detail, and varying SNR can become a scanner or protocol cue.', check: 'Compare acquired voxel size, averages, bandwidth, coil combination, acceleration, denoising, and reconstruction.' },
}

const artifactOrder = Object.keys(artifactContent) as ArtifactKind[]

function clamp(value: number) { return Math.max(0, Math.min(1, value)) }
function sourceCoordinate(coordinate: number, size: number) { return ((coordinate % size) + size) % size }

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

function SourceImageFallback({ error, alt }: { error: boolean; alt: string }) {
  return error
    ? <div className="mri-image-load-error" role="status">Source image unavailable.</div>
    : <img src={sourceUrl} alt={alt} />
}

function MlSourceImage({ alt }: { alt: string }) {
  const [failed, setFailed] = useState(false)
  return failed
    ? <div className="mri-image-load-error" role="status">Source image unavailable.</div>
    : <img src={sourceUrl} alt={alt} onError={() => setFailed(true)} />
}

function useArtifactSource() {
  const [state, setState] = useState<{ data: Float64Array | null; error: boolean }>({ data: null, error: false })
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = sourceSize
        canvas.height = sourceSize
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas 2D context unavailable')
        context.drawImage(image, 0, 0, sourceSize, sourceSize)
        const data = context.getImageData(0, 0, sourceSize, sourceSize).data
        const values = new Float64Array(sourceSize * sourceSize)
        for (let index = 0; index < values.length; index += 1) values[index] = data[index * 4] / 255
        setState({ data: values, error: false })
      } catch {
        setState({ data: null, error: true })
      }
    }
    image.onerror = () => { if (!cancelled) setState({ data: null, error: true }) }
    image.src = sourceUrl
    return () => { cancelled = true }
  }, [])
  return state
}

function useQualitySourceVolume() {
  const [state, setState] = useState<{ data: Float64Array[] | null; error: boolean }>({ data: null, error: false })
  useEffect(() => {
    let cancelled = false
    const loads = qualityVolumeUrls.map((url) => new Promise<Float64Array>((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = sourceSize
          canvas.height = sourceSize
          const context = canvas.getContext('2d')
          if (!context) throw new Error('Canvas 2D context unavailable')
          context.drawImage(image, 0, 0, sourceSize, sourceSize)
          const data = context.getImageData(0, 0, sourceSize, sourceSize).data
          const values = new Float64Array(sourceSize * sourceSize)
          for (let index = 0; index < values.length; index += 1) values[index] = data[index * 4] / 255
          resolve(values)
        } catch (error) {
          reject(error)
        }
      }
      image.onerror = () => reject(new Error(`Unable to load MRI teaching image: ${url}`))
      image.src = url
    }))
    Promise.all(loads)
      .then((values) => { if (!cancelled) setState({ data: values, error: false }) })
      .catch(() => { if (!cancelled) setState({ data: null, error: true }) })
    return () => { cancelled = true }
  }, [])
  return state
}

function applyQualityModel(sourceSlices: Float64Array[], matrix: number, sliceThickness: number, bandwidth: number, acceleration: number, showAccelerationFailure: boolean, relativeSnr: number) {
  const [inferior, center, superior] = sourceSlices
  const slabAverage = new Float64Array(center.length)
  const output = new Float64Array(center.length)
  const neighborMix = Math.max(0, (sliceThickness - 1) / 7) * 0.54
  for (let index = 0; index < center.length; index += 1) {
    slabAverage[index] = center[index] * (1 - neighborMix) + (inferior[index] + superior[index]) * 0.5 * neighborMix
  }

  let sampled = slabAverage
  if (matrix < 512) {
    const spectrum = forwardFft2d(slabAverage, sourceSize)
    const cutoff = sourceSize / 2 * matrix / 512
    const taperStart = cutoff * 0.82
    for (let y = 0; y < sourceSize; y += 1) {
      const ky = y <= sourceSize / 2 ? y : y - sourceSize
      for (let x = 0; x < sourceSize; x += 1) {
        const kx = x <= sourceSize / 2 ? x : x - sourceSize
        const spatialFrequency = Math.max(Math.abs(kx), Math.abs(ky))
        const weight = spatialFrequency <= taperStart
          ? 1
          : spatialFrequency >= cutoff
            ? 0
            : 0.5 * (1 + Math.cos(Math.PI * (spatialFrequency - taperStart) / (cutoff - taperStart)))
        const index = y * sourceSize + x
        spectrum.re[index] *= weight
        spectrum.im[index] *= weight
      }
    }
    sampled = new Float64Array(inverseFft2d(spectrum).re)
  }

  const aliasOffsets = showAccelerationFailure ? parallelAliasOffsets(sourceSize, acceleration) : []
  const residualAlias = aliasOffsets.length > 0 ? 0.12 + Math.max(0, acceleration - 2) * 0.04 : 0
  // Display intensities remain normalized, so noise standard deviation varies
  // inversely with the reported relative SNR. The cap keeps the lowest-SNR
  // teaching state legible without changing the stated direction of effect.
  const noiseSigma = 0.032 * Math.min(4, 1 / Math.max(0.25, relativeSnr))

  for (let y = 0; y < sourceSize; y += 1) {
    for (let x = 0; x < sourceSize; x += 1) {
      const index = y * sourceSize + x
      let value = sampled[index]

      if (residualAlias > 0) {
        const foldedMean = aliasOffsets.reduce((sum, offset) => sum + sampled[sourceCoordinate(y + offset, sourceSize) * sourceSize + x], 0) / aliasOffsets.length
        value = (value + foldedMean * residualAlias) / (1 + residualAlias * 0.35)
      }

      const hashA = Math.sin((x * 127.1 + y * 311.7 + matrix * 0.13) * 0.017) * 43758.5453
      const hashB = Math.sin((x * 269.5 + y * 183.3 + bandwidth * 0.07) * 0.019) * 24634.6345
      const uniformA = Math.max(1e-7, hashA - Math.floor(hashA))
      const uniformB = hashB - Math.floor(hashB)
      const gaussianRadius = Math.sqrt(-2 * Math.log(uniformA))
      const gaussianAngle = 2 * Math.PI * uniformB
      const n1 = gaussianRadius * Math.cos(gaussianAngle) * noiseSigma
      const n2 = gaussianRadius * Math.sin(gaussianAngle) * noiseSigma
      output[index] = clamp(Math.sqrt(Math.pow(value + n1, 2) + n2 * n2))
    }
  }

  return output
}

function QualitySlider({ label, value, display, min, max, step, ariaLabel, onChange }: { label: string; value: number; display: string; min: number; max: number; step: number; ariaLabel: string; onChange: (value: number) => void }) {
  return <label className="mri-quality-control"><span><strong>{label}</strong><output>{display}</output></span><input type="range" min={min} max={max} step={step} value={value} aria-label={ariaLabel} style={ctRangeProgressStyle(value, min, max)} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

function artifactEmphasisLabel(value: number) {
  if (value < 25) return 'Subtle'
  if (value < 70) return 'Moderate'
  return 'Strong'
}

function MriQualityBudget() {
  const [qualityMode, setQualityMode] = useState<QualityMode>('voxel')
  const [matrix, setMatrix] = useState(256)
  const [sliceThickness, setSliceThickness] = useState(4)
  const [averages, setAverages] = useState(1)
  const [bandwidth, setBandwidth] = useState(250)
  const [acceleration, setAcceleration] = useState(1)
  const [showAccelerationFailure, setShowAccelerationFailure] = useState(false)
  const sourceVolumeState = useQualitySourceVolume()
  const sourceVolume = sourceVolumeState.data
  const source = sourceVolume?.[1] ?? null
  const selectQualityMode = (mode: QualityMode) => {
    setQualityMode(mode)
    if (mode !== 'voxel') {
      setMatrix(256)
      setSliceThickness(4)
    }
    if (mode !== 'signal') {
      setAverages(1)
      setBandwidth(250)
    }
    if (mode !== 'speed') {
      setAcceleration(1)
      setShowAccelerationFailure(false)
    }
  }
  const handleTabs = useRovingTabs(qualityModeOrder, selectQualityMode)
  const fieldOfView = 240
  const idealizedGFactor = 1
  const pixelSize = fieldOfView / matrix
  const voxelVolume = pixelSize * pixelSize * sliceThickness
  const baselineVoxelVolume = Math.pow(fieldOfView / 256, 2) * 4
  const relativeSnr = (voxelVolume / baselineVoxelVolume) * Math.sqrt(averages) * Math.sqrt(250 / bandwidth) / (idealizedGFactor * Math.sqrt(acceleration))
  const relativeTime = (matrix / 256) * averages / acceleration
  const relativeReadoutDuration = 250 / bandwidth
  const bandwidthCue = bandwidth < 250
    ? 'Lower bandwidth raises the simplified SNR estimate, but lengthens readout and increases chemical-shift and off-resonance displacement.'
    : bandwidth > 250
      ? 'Higher bandwidth lowers the simplified SNR estimate, but shortens readout and reduces chemical-shift and off-resonance displacement.'
      : 'The baseline bandwidth balances the displayed SNR estimate against readout duration and frequency-offset displacement.'
  const partialVolumeCue = sliceThickness <= 2
    ? 'Thin slices reduce through-plane mixing, but each voxel contributes less signal.'
    : sliceThickness >= 6
      ? 'Thicker slices mix more tissues through-plane even if the displayed in-plane matrix looks sharp.'
      : 'Intermediate slice thickness balances through-plane separation against voxel signal.'

  const sourcePixels = useMemo(() => source ? pixelBuffer(source) : null, [source])
  const rendered = useMemo(() => sourceVolume ? applyQualityModel(sourceVolume, matrix, sliceThickness, bandwidth, acceleration, showAccelerationFailure, relativeSnr) : null, [acceleration, bandwidth, matrix, relativeSnr, showAccelerationFailure, sliceThickness, sourceVolume])
  const renderedPixels = useMemo(() => rendered ? pixelBuffer(rendered) : null, [rendered])
  const resetQuality = () => {
    setMatrix(256)
    setSliceThickness(4)
    setAverages(1)
    setBandwidth(250)
    setAcceleration(1)
    setShowAccelerationFailure(false)
  }

  return (
    <div className="mri-quality-budget">
      <div className="mri-quality-baseline"><strong>Fixed 2D Cartesian baseline</strong><span>FOV 240 mm · 256 × 256 · 4 mm · NEX 1 · 250 Hz/px · parallel R 1 · idealized g 1</span><small>V₀ and BW₀ refer to this baseline. Images are a 128 × 128 display proxy derived from the template; matrix and voxel metrics describe nominal acquisition scenarios, not the source PNG dimensions. Metrics describe one centered 2D acquisition: slice count and anatomical coverage are not modeled. The thickness preview averages adjacent template planes, while a 3D acquisition adds partition encoding and follows different SNR and scan-time relationships.</small></div>
      <div className="mri-quality-demo">
        <div className="mri-quality-images">
          <figure><figcaption><strong>Reference template</strong><span>population-average T2 slice</span></figcaption><div>{sourcePixels ? <PixelCanvas pixels={sourcePixels} label="Reference axial slice from a population-average T2-weighted template" /> : <SourceImageFallback error={sourceVolumeState.error} alt="Reference axial slice from a population-average T2-weighted template" />}</div></figure>
          <figure><figcaption><strong>Current acquisition</strong><span>{qualityMode === 'voxel' ? 'k-space detail + slab mixing' : qualityMode === 'signal' ? 'noise + readout-time trade-off' : showAccelerationFailure ? 'SNR + failure mode' : 'SNR penalty'}</span></figcaption><div>{renderedPixels ? <PixelCanvas pixels={renderedPixels} label="Current acquisition image after applying the selected MRI quality trade-offs" /> : <SourceImageFallback error={sourceVolumeState.error} alt="Current acquisition image after applying the selected MRI quality trade-offs" />}</div></figure>
        </div>
        <div className="mri-quality-panel">
          <div className="mri-quality-panel-heading"><div><strong>Change one part of the acquisition</strong><span>The image and summary update together.</span></div><button type="button" onClick={resetQuality}>Reset baseline</button></div>
          <div className="mri-quality-tabs" role="tablist" aria-label="MRI quality teaching mode">
            <button type="button" role="tab" id="mri-quality-tab-voxel" aria-controls="mri-quality-panel" aria-selected={qualityMode === 'voxel'} tabIndex={qualityMode === 'voxel' ? 0 : -1} onClick={() => selectQualityMode('voxel')} onKeyDown={(event) => handleTabs(event, 'voxel')}>Voxel detail</button>
            <button type="button" role="tab" id="mri-quality-tab-signal" aria-controls="mri-quality-panel" aria-selected={qualityMode === 'signal'} tabIndex={qualityMode === 'signal' ? 0 : -1} onClick={() => selectQualityMode('signal')} onKeyDown={(event) => handleTabs(event, 'signal')}>Signal</button>
            <button type="button" role="tab" id="mri-quality-tab-speed" aria-controls="mri-quality-panel" aria-selected={qualityMode === 'speed'} tabIndex={qualityMode === 'speed' ? 0 : -1} onClick={() => selectQualityMode('speed')} onKeyDown={(event) => handleTabs(event, 'speed')}>Speed</button>
          </div>
          <div className="mri-quality-mode" id="mri-quality-panel" role="tabpanel" aria-labelledby={`mri-quality-tab-${qualityMode}`}>
            {qualityMode === 'voxel' && <><p>At fixed FOV, matrix changes the highest sampled in-plane spatial frequency. Slice thickness changes voxel signal and how much neighboring anatomy is averaged through-plane.</p><div className="mri-quality-mode-controls"><QualitySlider label="Acquired matrix" value={matrix} display={`${matrix} × ${matrix}`} min={128} max={512} step={64} ariaLabel="Quality model acquired matrix size at fixed field of view" onChange={setMatrix} /><QualitySlider label="Slice thickness" value={sliceThickness} display={`${sliceThickness} mm`} min={1} max={8} step={1} ariaLabel="Quality model slice thickness" onChange={setSliceThickness} /></div><small><strong>Partial volume is signal mixing, not random noise.</strong> {partialVolumeCue} This preview low-pass filters k-space for matrix changes and averages the neighboring ±5 mm template planes for thickness. It is illustrative rather than a calibrated slice-profile simulation; resampling cannot recover separation that was never acquired.</small></>}
            {qualityMode === 'signal' && <><p>Averages repeat measurements to suppress random noise. Receiver bandwidth trades SNR against readout duration and sensitivity to chemical shift and off-resonance.</p><div className="mri-quality-mode-controls"><QualitySlider label="Averages · NEX" value={averages} display={`${averages}`} min={1} max={4} step={1} ariaLabel="Quality model number of averages" onChange={setAverages} /><QualitySlider label="Receiver bandwidth" value={bandwidth} display={`${bandwidth} Hz/px`} min={100} max={600} step={50} ariaLabel="Quality model receiver bandwidth" onChange={setBandwidth} /></div><div className="mri-quality-inline-result"><span>Relative readout duration</span><strong>≈ {relativeReadoutDuration.toFixed(2)}×</strong><small>Per readout line; this changes frequency-offset displacement and timing constraints, not the phase-line-count estimate below.</small></div><small><strong>Bandwidth trade-off.</strong> {bandwidthCue} The preview renders the noise consequence only; spatial displacement is taught in the artifact comparison.</small></>}
            {qualityMode === 'speed' && <><p>Parallel imaging skips phase-encoding lines and reconstructs them using coil sensitivity. The expected penalty is lower, spatially varying SNR; visible aliasing is a reconstruction failure, not an inevitable result.</p><div className="mri-quality-mode-controls is-single"><QualitySlider label="Parallel imaging · R" value={acceleration} display={`${acceleration}×`} min={1} max={4} step={1} ariaLabel="Quality model parallel imaging acceleration factor" onChange={setAcceleration} /></div><label className="mri-quality-failure-toggle"><input type="checkbox" checked={showAccelerationFailure} disabled={acceleration === 1} onChange={(event) => setShowAccelerationFailure(event.target.checked)} /><span><strong>Show reconstruction mismatch</strong><small>{acceleration === 1 ? 'Increase R to enable the residual-aliasing example.' : `Adds an exaggerated residual R-fold alias pattern for R = ${acceleration} as a conditional failure mode.`}</small></span></label><small><strong>Idealized model.</strong> Real parallel-imaging SNR is approximately proportional to 1/(g√R), with spatially varying g-factor noise amplification. This preview fixes the g-factor at its ideal lower bound, g = 1, so the reported SNR is a best-case upper bound; it changes global noise only and does not simulate a coil-specific spatial g-factor map. Calibration and sequence constraints can make actual whole-scan speedup smaller than R; compressed sensing and learned reconstruction do not follow this simple equation.</small></>}
          </div>
        </div>
      </div>
      <div className="mri-quality-metrics">
        <article><span>Nominal acquired voxel</span><strong>{pixelSize.toFixed(2)} × {pixelSize.toFixed(2)} × {sliceThickness.toFixed(1)} mm</strong><small>{voxelVolume.toFixed(2)} mm³ · spacing is not the same as effective resolution or point-spread width.</small></article>
        <article><span>Predicted relative SNR</span><strong>≈ {relativeSnr.toFixed(2)}×</strong><small>Scaling only at fixed sequence contrast, field strength, coil, and FOV—not measured image SNR. SNR<sub>rel</sub> ≈ V/V₀ · √NEX · √(BW₀/BW) · 1/(g√R). Fixing g at its ideal lower bound of 1 makes this a best-case upper bound on SNR.</small></article>
        <article><span>Idealized phase-line time</span><strong>≈ {relativeTime.toFixed(2)}×</strong><small>t<sub>rel</sub> ≈ phase lines/256 · NEX/R. Readout duration, calibration, TR limits, and overhead are excluded.</small></article>
      </div>
      <p className="mri-quality-distinction"><strong>SNR is not CNR or resolution.</strong>SNR describes a tissue signal relative to noise; contrast-to-noise ratio describes the separation between two tissue signals relative to noise; resolution determines whether nearby structures remain spatially separable. A high-SNR image can still have weak tissue contrast or blurred detail.</p>
      <p className="mri-quality-model-note"><AlertTriangle aria-hidden="true" />The image is a deterministic teaching approximation, not a scanner simulator. Relative values show expected directions of change and are not image-based SNR measurements: magnitude formation, coil combination, acceleration, denoising, and learned reconstruction can make noise non-Gaussian or spatially varying. Real SNR and scan time also depend on sequence timing, tissue contrast, partial Fourier, reconstruction, and hardware.</p>
    </div>
  )
}

export function MriArtifactLesson() {
  const [selected, setSelected] = useState<ArtifactKind>('motion')
  const [severity, setSeverity] = useState(58)
  const sourceState = useArtifactSource()
  const source = sourceState.data
  const content = artifactContent[selected]
  const emphasis = artifactEmphasisLabel(severity)
  const handleTabs = useRovingTabs(artifactOrder, setSelected)
  const rendered = useMemo(() => source ? applyArtifact(source, selected, severity) : null, [selected, severity, source])
  const sourcePixels = useMemo(() => source ? pixelBuffer(source) : null, [source])
  const renderedPixels = useMemo(() => rendered ? pixelBuffer(rendered) : null, [rendered])
  const differencePixels = useMemo(() => source && rendered ? pixelBuffer(rendered, source) : null, [rendered, source])

  return (
    <div className="mri-advanced-references mri-artifact-references">
      <section className="mri-advanced-lab mri-artifact-lab">
        <header><div><span>Controlled comparison</span><h4>Trace an artifact back upstream</h4><p>Apply one educational approximation to the same population-average T2-weighted template slice. Compare the visible signature with its acquisition-space cause and likely ML failure.</p></div><label className="mri-artifact-severity"><span><strong>Visual emphasis</strong><output>{emphasis}</output></span><input type="range" min="0" max="100" value={severity} aria-label="Artifact visual emphasis" aria-valuetext={emphasis} style={ctRangeProgressStyle(severity, 0, 100)} onChange={(event) => setSeverity(Number(event.target.value))} /><small>Each artifact uses its own tuned display mapping. This is not a physical scale and values are not comparable across artifacts.</small></label></header>
        <div className="mri-artifact-tabs" role="tablist" aria-label="MRI artifact type">
          {artifactOrder.map((kind) => <button key={kind} type="button" role="tab" id={`mri-artifact-tab-${kind}`} aria-controls="mri-artifact-panel" aria-selected={selected === kind} tabIndex={selected === kind ? 0 : -1} onClick={() => setSelected(kind)} onKeyDown={(event) => handleTabs(event, kind)}>{artifactContent[kind].label}</button>)}
        </div>
        <div id="mri-artifact-panel" role="tabpanel" aria-labelledby={`mri-artifact-tab-${selected}`}>
          <div className="mri-artifact-stage">
            <figure><figcaption><strong>Reference</strong><span>same slice</span></figcaption><div>{sourcePixels ? <PixelCanvas pixels={sourcePixels} label="Unaltered axial T2-weighted reference slice" /> : <SourceImageFallback error={sourceState.error} alt="Unaltered axial T2-weighted reference slice" />}</div></figure>
            <figure><figcaption><strong>{content.label}</strong><span>{emphasis} visual emphasis</span></figcaption><div className="mri-artifact-render">{renderedPixels ? <PixelCanvas pixels={renderedPixels} label={`Axial T2-weighted slice with simulated ${content.label.toLowerCase()}`} /> : <SourceImageFallback error={sourceState.error} alt="Loading artifact rendering" />}{content.direction && <div className={`mri-artifact-direction is-${content.direction}`} role="img" aria-label={content.direction === 'phase' ? 'Phase-encoding direction' : 'Readout direction'}><span>{content.direction === 'phase' ? 'phase encode' : 'readout'}</span><ArrowRight aria-hidden="true" /></div>}{selected === 'chemicalShift' && <div className="mri-chemical-shift-key" role="img" aria-label="Fat signal shifted relative to water along the readout direction"><span className="is-water">water</span><span className="is-fat">fat +Δx</span><ArrowRight aria-hidden="true" /></div>}</div></figure>
            <figure><figcaption><strong>Difference</strong><span>absolute change · display gain 2.4×</span></figcaption><div className="is-difference">{differencePixels ? <PixelCanvas pixels={differencePixels} label={`Amplified absolute difference map for simulated ${content.label.toLowerCase()} with 2.4 times display gain`} /> : sourceState.error ? <div className="mri-image-load-error" role="status">Source image unavailable.</div> : null}</div></figure>
          </div>
          <div className="mri-artifact-explanation">
            <article><span>Visible signature</span><p>{content.signature}</p></article>
            <article><span>Upstream cause</span><p>{content.cause}</p><small>{content.space}</small></article>
            <article><span>ML consequence</span><p>{content.risk}</p><small>{content.check}</small></article>
          </div>
        </div>
        <p className="mri-artifact-caveat"><AlertTriangle aria-hidden="true" />These are controlled image-space teaching approximations, not a calibrated forward simulation. Real artifacts can combine, vary by sequence, and require raw data or metadata to diagnose.</p>
      </section>

      <section className="mri-advanced-reference mri-quality-reference">
        <header><div><span>Acquisition trade-off</span><h4>Resolution, signal, and time share one budget</h4><p>Changing a displayed matrix or interpolating an image does not create acquired detail. The protocol determines what was measured.</p></div></header>
        <MriQualityBudget />
        <div className="mri-artifact-reference-grid">
          {artifactOrder.map((kind) => <article key={kind}><strong>{artifactContent[kind].label}</strong><span>{artifactContent[kind].space}</span><p>{artifactContent[kind].risk}</p><small><b>Verify:</b> {artifactContent[kind].check}</small></article>)}
        </div>
        <footer><span>Source anatomy: Dadar, Camicioli, and Duchesne · CIE T2 population-average template · cropped/resampled teaching derivative · CC BY 4.0</span><a href="https://doi.org/10.5281/zenodo.5018356" target="_blank" rel="noreferrer">Template record <ExternalLink aria-hidden="true" /></a></footer>
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
  raw: { label: 'Raw acquisition', shape: 'one Cartesian example · [coil, echo, kᵧ, kₓ] complex', representation: 'Raw MRI is commonly stored as complex readout acquisitions with channel data, acquisition headers, loop counters, and sometimes a trajectory—not necessarily as one dense array.', operation: 'Identify every axis, sampling coordinate, trajectory, noise scan, calibration record, and timing field before reordering. The displayed array is one common Cartesian teaching layout.', preserve: 'Coil identity · complex phase · sampling coordinates · timing', lost: 'Nothing should be silently squeezed, sorted, gridded, or cast to magnitude.' },
  reconstruct: { label: 'Reconstruction', shape: '[coil, z, y, x] complex → image volume', representation: 'Fourier, non-Cartesian, parallel-imaging, compressed-sensing, or learned reconstruction can produce coil images or a combined image.', operation: 'Record the reconstruction version, calibration, sensitivity estimation, acceleration, filters, and exported component: magnitude, phase, real, or imaginary.', preserve: 'Image affine · spacing · complex-component provenance · source raw data', lost: 'Magnitude alone discards complex phase; coil combination removes independent receiver channels.' },
  series: { label: 'Series selection', shape: 'many non-interchangeable 2D, 3D, or 4D series', representation: 'Original images, repeats, localizers, contrasts, diffusion volumes, dynamic acquisitions, and derived maps may coexist in one examination.', operation: 'Classify with image type and acquisition metadata—not filename, brightness, or series description alone. Treat missing metadata as unknown rather than inventing a default.', preserve: 'Series UID · sequence/timing · derivation · units · encoding direction', lost: 'Selecting one export can hide repeats, source images, coil information, or fitting provenance.' },
  convert: { label: 'Conversion & geometry', shape: 'DICOM frames + metadata → volume + sidecar', representation: 'Conversion assembles frames, applies or records intensity scaling, translates coordinate conventions, and writes a volume plus metadata.', operation: 'Distinguish reindexing or header reorientation from interpolation. A physical-space-preserving conversion need not resample voxels; an explicit resample does.', preserve: 'UID mapping · affine/qform/sform · slope/intercept · dtype · units', lost: 'Incorrect sorting, scaling, axis signs, or discarded private metadata can silently alter the dataset.' },
  preprocess: { label: 'Preprocessing & QC', shape: 'native volume → documented model-space volume', representation: 'Bias correction, denoising, registration, resampling, cropping, masking, and normalization change values, geometry, or both.', operation: 'Split subjects first. Fit cohort-level statistics inside each training fold; apply subject-local operations per case; use label-preserving interpolation for categorical targets.', preserve: 'Native source · transform chain · fit scope · QC result · target alignment', lost: 'Original scale, field of view, artifacts, and interpolation history can disappear from the final tensor.' },
  tensor: { label: 'Tensor + target', shape: 'input representation + aligned learning target', representation: 'A sample may be 2D, 2.5D, 3D, dynamic, diffusion, or multi-echo. The dataloader normally adds the batch dimension.', operation: 'Declare axis meaning, channel presence, missing-modality policy, target provenance, and grouping key before batching. Never represent an absent modality as an unexplained all-zero image.', preserve: 'Channel semantics · affine · target space · presence mask · pseudonymous subject group', lost: 'Tensor construction can hide acquisition axes, units, missingness, and the distinction between source images and derived labels.' },
}

const pipelineOrder = Object.keys(pipelineContent) as PipelineStage[]

const tensorLayouts: Record<TensorLayout, { label: string; shape: string; targetShape: string; note: string }> = {
  '2d': { label: '2D', shape: '[B, C, H, W]', targetShape: '[B, 1, H, W]', note: 'one slice per sample' },
  '2.5d': { label: '2.5D', shape: '[B, C×K, H, W]', targetShape: '[B, 1, H, W]', note: 'K neighboring slices as channels' },
  '3d': { label: '3D', shape: '[B, C, D, H, W]', targetShape: '[B, 1, D, H, W]', note: 'one spatial volume per sample' },
  dynamic: { label: '4D / dynamic', shape: '[B, C, T, D, H, W]', targetShape: 'task dependent', note: 'retain time, echo, or another acquisition axis' },
}

export function MriMlPipelineLesson() {
  const [selected, setSelected] = useState<PipelineStage>('raw')
  const [channels, setChannels] = useState({ t1: true, t2: true, flair: false })
  const [tensorLayout, setTensorLayout] = useState<TensorLayout>('3d')
  const handleTabs = useRovingTabs(pipelineOrder, setSelected)
  const selectedChannels = Object.entries(channels).filter(([, enabled]) => enabled).map(([name]) => name.toUpperCase())
  const layout = tensorLayouts[tensorLayout]
  const inputShape = layout.shape.replace('C', String(selectedChannels.length))
  const channelPresence = (['t1', 't2', 'flair'] as const).map((channel) => channels[channel] ? 1 : 0).join(', ')

  const stageVisual = (stage: PipelineStage) => {
    if (stage === 'raw') return <div className="mri-ml-array is-raw" aria-label="One common Cartesian complex multi-coil raw-data layout"><i /><i /><i /><i /><b>Re + iIm</b><small>coil × echo × kᵧ × kₓ · Cartesian example</small></div>
    if (stage === 'reconstruct') return <div className="mri-ml-reconstruction"><div className="mri-ml-array is-coils"><i /><i /><i /><b>complex coil images</b></div><ArrowRight aria-hidden="true" /><MlSourceImage alt="Reconstructed axial T2-weighted magnitude image" /></div>
    if (stage === 'series') return <div className="mri-ml-series-list" aria-label="Example MRI examination series"><span>Localizer <small>exclude</small></span><span>T1w <small>original</small></span><span className="is-selected">T2w <small>original</small></span><span>FLAIR <small>original</small></span><span>DWI b=0/1000 <small>original</small></span><span>ADC <small>derived · units</small></span></div>
    if (stage === 'convert') return <div className="mri-ml-conversion" aria-label="DICOM to NIfTI conversion with value and geometry metadata"><article><b>DICOM series</b><strong>frames + LPS geometry</strong><small>stored dtype · per-frame order · slope/intercept</small></article><ArrowRight aria-hidden="true" /><article><b>NIfTI + sidecar</b><strong>volume + affine</strong><small>qform/sform · dtype/scaling · units · UID map</small></article><p><strong>Reorientation is not resampling.</strong> Axis order or coordinate convention can change while physical samples stay fixed; interpolation occurs only when a new voxel grid is requested.</p></div>
    if (stage === 'preprocess') return <div className="mri-ml-processing" aria-label="Same MRI acquisition at three processing stages"><article><div><MlSourceImage alt="Original native-space axial T2-weighted image" /></div><strong>Original</strong><span>native values + grid</span><small>reference retained</small></article><article className="is-normalized"><div><MlSourceImage alt="Illustrative bias-corrected and normalized axial T2-weighted image" /></div><strong>Normalized</strong><span>values changed</span><small>geometry unchanged</small></article><article className="is-resampled"><div><MlSourceImage alt="Illustrative resampled and cropped axial T2-weighted image" /></div><strong>Resampled</strong><span>grid + FOV changed</span><small>interpolation recorded</small></article></div>
    return <div className="mri-ml-tensor-workspace">
      <div className="mri-ml-layout-picker" role="group" aria-label="Model tensor dimensionality">{(Object.keys(tensorLayouts) as TensorLayout[]).map((kind) => <button key={kind} type="button" aria-pressed={tensorLayout === kind} onClick={() => setTensorLayout(kind)}>{tensorLayouts[kind].label}</button>)}</div>
      <div className="mri-ml-tensor-builder">
        <div className="mri-ml-channel-picker" role="group" aria-label="Model tensor channels">{(['t1', 't2', 'flair'] as const).map((channel) => { const lastEnabled = channels[channel] && selectedChannels.length === 1; return <button key={channel} type="button" aria-pressed={channels[channel]} aria-describedby="mri-ml-missing-policy" disabled={lastEnabled} onClick={() => setChannels((current) => ({ ...current, [channel]: !current[channel] }))}><span>{channels[channel] && <Check aria-hidden="true" />}</span>{channel.toUpperCase()}</button> })}</div>
        <div className="mri-ml-tensor"><small>Input</small><b>{selectedChannels.join(' + ')}</b><strong>{inputShape}</strong><span>{layout.note}</span><small>Batch B is added by the dataloader.</small></div>
        <div className="mri-ml-target"><small>Aligned target</small><strong>Segmentation mask</strong><b>{layout.targetShape}</b><span>categorical labels use nearest-neighbor resampling</span><small>annotation source + version + target space</small></div>
      </div>
      <p id="mri-ml-missing-policy"><strong>Missingness is data:</strong> presence mask [T1, T2, FLAIR] = [{channelPresence}]. An absent channel is not the same as a zero-valued image.</p>
    </div>
  }

  return (
    <div className="mri-advanced-references mri-ml-references">
      <section className="mri-advanced-lab mri-ml-lab">
        <header><div><span>Representation trace</span><h4>Follow one examination into a tensor</h4><p>At each stage, identify the array axes, the operation that changed them, and the information that no longer reaches the model.</p></div><div className="mri-ml-integrity"><ShieldCheck aria-hidden="true" /><span><small>Invariant</small><strong>Pseudonymous subject key + provenance</strong></span></div></header>
        <div className="mri-ml-pipeline" role="tablist" aria-label="MRI data pipeline stage">
          {pipelineOrder.map((stage, index) => <div key={stage}><button type="button" role="tab" id={`mri-ml-tab-${stage}`} aria-controls={`mri-ml-panel-${stage}`} aria-selected={selected === stage} tabIndex={selected === stage ? 0 : -1} onClick={() => setSelected(stage)} onKeyDown={(event) => handleTabs(event, stage)}><small>{String(index + 1).padStart(2, '0')}</small><strong>{pipelineContent[stage].label}</strong></button>{index < pipelineOrder.length - 1 && <ArrowRight aria-hidden="true" />}</div>)}
        </div>
        {pipelineOrder.map((stage) => { const content = pipelineContent[stage]; return <div key={stage} id={`mri-ml-panel-${stage}`} role="tabpanel" aria-labelledby={`mri-ml-tab-${stage}`} className="mri-ml-stage" hidden={selected !== stage}>
          <figure className={`is-${stage}`}><figcaption><strong>{content.label}</strong><span>{content.shape}</span></figcaption>{stageVisual(stage)}</figure>
          <aside><span>Representation</span><p>{content.representation}</p><span>Operation</span><p>{content.operation}</p><dl><div><dt>Preserve</dt><dd>{content.preserve}</dd></div><div><dt>Information removed or changed</dt><dd>{content.lost}</dd></div></dl></aside>
        </div> })}
      </section>

      <section className="mri-advanced-reference mri-ml-reference">
        <header><div><span>Engineering checklist</span><h4>Validate identity before values</h4><p>A clean tensor can still be wrong if its series, axes, geometry, derivation, target, or split membership were inferred incorrectly.</p></div></header>
        <div className="mri-ml-checks">
          <article><FileStack aria-hidden="true" /><strong>Series identity</strong><p>Sequence family, TR/TE/TI, flip angle, image component, original/derived status, echo, b-value, direction, contrast state, and units. Missing means unknown—not a default.</p></article>
          <article><ScanLine aria-hidden="true" /><strong>Geometry</strong><p>Affine/qform/sform, spacing, orientation, handedness, slice order, phase direction, and interpolation. Rotate b-vectors when image axes rotate; keep targets in the same physical space.</p></article>
          <article><ShieldCheck aria-hidden="true" /><strong>Intensity + QC</strong><p>Stored dtype, slope/intercept, quantitative units, magnitude/phase status, bias correction, clipping, artifacts, missing series, and transform versions.</p></article>
          <article><AlertTriangle aria-hidden="true" /><strong>Leakage + shift</strong><p>Group all visits, repeats, and derivatives by pseudonymous subject before fitting each training fold. Audit site, vendor/model, field strength, coil, software, protocol, and reconstruction.</p></article>
        </div>
        <div className="mri-ml-contract" aria-label="Minimum model-input contract"><strong>Before training, every sample should answer:</strong><span>Which acquisition and series?</span><span>Which axes and affine?</span><span>Which values, scaling, and units?</span><span>Which transforms and QC?</span><span>Which target, subject group, and split?</span></div>
        <div className="mri-ml-ledger" role="table" aria-label="MRI representation provenance ledger">
          <div role="row" className="is-heading"><span role="columnheader">Stage</span><span role="columnheader">Value change</span><span role="columnheader">Geometry change</span><span role="columnheader">Minimum record</span></div>
          <div role="row"><strong role="cell">Reconstruct</strong><span role="cell" data-label="Value change">complex coils → magnitude, phase, real, or imaginary; filters may alter values</span><span role="cell" data-label="Geometry change">trajectory + scanner coordinates → image grid and affine</span><span role="cell" data-label="Minimum record">method · calibration · acceleration · filters · version</span></div>
          <div role="row"><strong role="cell">Convert</strong><span role="cell" data-label="Value change">stored dtype may change; apply or retain scaling and units</span><span role="cell" data-label="Geometry change">reindex/reorient without interpolation unless explicitly resampled</span><span role="cell" data-label="Minimum record">UID map · affine/qform/sform · dtype · slope/intercept · units</span></div>
          <div role="row"><strong role="cell">Preprocess</strong><span role="cell" data-label="Value change">bias correction · denoising · normalization</span><span role="cell" data-label="Geometry change">registration · resampling · crop alter grid or FOV</span><span role="cell" data-label="Minimum record">parameters · fit scope · image/label interpolation · transform chain · QC</span></div>
          <div role="row"><strong role="cell">Attach target</strong><span role="cell" data-label="Value change">categorical label, landmark, clinical outcome, or quantitative target</span><span role="cell" data-label="Geometry change">align spatial targets in physical coordinates</span><span role="cell" data-label="Minimum record">source · annotator/rule · version · units · target space</span></div>
        </div>
        <footer><span>Source anatomy: Dadar, Camicioli, and Duchesne · CIE T2 population-average template · cropped/resampled teaching derivative · CC BY 4.0</span><a href="https://doi.org/10.5281/zenodo.5018356" target="_blank" rel="noreferrer">Template record <ExternalLink aria-hidden="true" /></a></footer>
      </section>
    </div>
  )
}
