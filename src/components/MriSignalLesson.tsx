import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Pause, Play } from 'lucide-react'
import { MriGradientHardware3d } from './MriGradientHardware3d'

type JourneyStageId = 'hydrogen' | 'align' | 'excite' | 'encode' | 'repeat' | 'reconstruct'

interface JourneyStage {
  id: JourneyStageId
  short: string
  title: string
  copy: string
  change: string
}

const journeyStages: JourneyStage[] = [
  {
    id: 'hydrogen',
    short: 'Hydrogen',
    title: 'The patient supplies the signal source',
    copy: 'Hydrogen nuclei are abundant in water and fat. Their magnetic moments provide the population that MRI can excite and measure.',
    change: 'Nothing has been localized or imaged yet; this is only the available signal pool.',
  },
  {
    id: 'align',
    short: 'B₀',
    title: 'The main field creates a small net magnetization',
    copy: 'B₀ does not make every magnetic moment point the same way. A slight population imbalance produces the measurable net direction M₀.',
    change: 'The ensemble now has an equilibrium direction and a resonance frequency.',
  },
  {
    id: 'excite',
    short: 'RF',
    title: 'RF excitation tips the net magnetization',
    copy: 'A brief radiofrequency field transfers energy near resonance, creating a coherent transverse component that can induce voltage in a receive coil.',
    change: 'Energy goes into the spin system; an image has still not been formed.',
  },
  {
    id: 'encode',
    short: 'Encode',
    title: 'Gradients give the measured signal a location',
    copy: 'Controlled field gradients make frequency and phase depend on position. The receive coil records the resulting spatially encoded complex waveform.',
    change: 'The signal is structured by position—not converted into literal stripes inside the patient.',
  },
  {
    id: 'repeat',
    short: 'Repeat',
    title: 'The sequence repeats with new encoding',
    copy: 'RF, gradients, and readout are repeated with different settings. Relaxation changes the available signal, while each repetition contributes another k-space measurement.',
    change: 'Timing creates contrast; repeated encoding supplies the information needed for reconstruction.',
  },
  {
    id: 'reconstruct',
    short: 'Image',
    title: 'A Fourier transform reconstructs image space',
    copy: 'The acquired complex k-space samples are combined mathematically into a spatial image. A stack of reconstructed slices—or a 3D acquisition—forms a volume.',
    change: 'The familiar MR image is a reconstructed representation of many measurements.',
  },
]

const scannerAsset = `${import.meta.env.BASE_URL}assets/mri/nih-mri-machine.svg`
const brainAsset = `${import.meta.env.BASE_URL}assets/mri/mri-brain-t1-axial-11.jpg`

const spinPositions = Array.from({ length: 30 }, (_, index) => ({
  x: 58 + (index % 6) * 48,
  y: 58 + Math.floor(index / 6) * 48,
}))

const restingAngles = [-43, 28, -18, 64, -67, 12, 38, -31, 71, -55, 21, -9, 49, -72, 31, -26, 57, -47, 6, 44, -61, 18, -13, 69, -35, 52, -76, 25, -4, 41]

function spinAngle(stage: JourneyStageId, index: number) {
  if (stage === 'hydrogen') return restingAngles[index] ?? 0
  if (stage === 'align') return (restingAngles[index] ?? 0) * 0.78
  if (stage === 'excite') return 82 + ((index % 3) - 1) * 5
  if (stage === 'encode') return ((index % 6) * 28) + (Math.floor(index / 6) * 12) - 72
  if (stage === 'repeat') return ((index * 29) % 170) - 85
  return ((index * 43) % 160) - 80
}

function KSpaceGrid({ className = '' }: { className?: string }) {
  const cells = useMemo(() => Array.from({ length: 144 }, (_, index) => {
    const row = Math.floor(index / 12)
    const column = index % 12
    const distance = Math.hypot(column - 5.5, row - 5.5)
    return { row, column, opacity: Math.max(0.1, 1 - (distance / 8.2)) }
  }), [])

  return (
    <g className={className} transform="translate(72 62)">
      <rect className="mri-kspace-frame" width="216" height="216" rx="7" />
      {cells.map(({ row, column, opacity }) => <rect key={`${row}-${column}`} className="mri-kspace-cell" x={column * 18 + 2} y={row * 18 + 2} width="14" height="14" rx="2" style={{ opacity }} />)}
      <line className="mri-kspace-axis" x1="108" y1="4" x2="108" y2="212" />
      <line className="mri-kspace-axis" x1="4" y1="108" x2="212" y2="108" />
      <text className="mri-focus-label" x="108" y="242" textAnchor="middle">complex k-space samples</text>
    </g>
  )
}

function SpinField({ stage }: { stage: JourneyStageId }) {
  const showSpins = stage !== 'reconstruct'
  const showNet = stage === 'align' || stage === 'excite'
  const isEncoded = stage === 'encode'

  return (
    <svg viewBox="0 0 360 340" role="img" aria-label={`Magnified hydrogen magnetization during the ${stage} stage`}>
      <defs>
        <radialGradient id="mri-tissue-field" cx="38%" cy="30%" r="72%">
          <stop offset="0" stopColor="#bfb2ff" stopOpacity="0.22" />
          <stop offset="0.66" stopColor="#876cff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#111528" stopOpacity="0.24" />
        </radialGradient>
        <linearGradient id="mri-gradient-field" x1="0" x2="1">
          <stop offset="0" stopColor="#53d6f0" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="#9b7cff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#f1b86a" stopOpacity="0.25" />
        </linearGradient>
        <marker id="mri-journey-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0 0 L7 3.5 L0 7 Z" fill="currentColor" />
        </marker>
        <clipPath id="mri-tissue-clip"><circle cx="180" cy="170" r="147" /></clipPath>
      </defs>

      <circle className="mri-journey-tissue" cx="180" cy="170" r="147" />
      {isEncoded && <rect className="mri-gradient-wash" x="33" y="23" width="294" height="294" clipPath="url(#mri-tissue-clip)" />}
      <ellipse className="mri-journey-equator" cx="180" cy="170" rx="147" ry="50" />
      <path className="mri-journey-meridian" d="M180 23 C118 72 118 268 180 317 C242 268 242 72 180 23" />

      {stage === 'hydrogen' && (
        <g className="mri-hydrogen-clusters">
          {spinPositions.slice(0, 18).map(({ x, y }, index) => (
            <g key={`${x}-${y}`} transform={`translate(${x + ((index % 2) * 8)} ${y})`}>
              <circle r="13" /><text textAnchor="middle" y="4">H</text>
            </g>
          ))}
          <text className="mri-focus-label" x="180" y="300" textAnchor="middle">abundant in water + fat</text>
        </g>
      )}

      {showSpins && stage !== 'hydrogen' && (
        <g className={`mri-spin-field is-${stage}`}>
          {spinPositions.map(({ x, y }, index) => {
            const angle = spinAngle(stage, index)
            return (
              <g key={`${x}-${y}`} className="mri-spin-arrow" style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${x}px ${y}px` }}>
                <line x1={x} y1={y + 10} x2={x} y2={y - 12} />
                <path d={`M${x - 4} ${y - 7} L${x} ${y - 14} L${x + 4} ${y - 7}`} />
              </g>
            )
          })}
        </g>
      )}

      {showNet && (
        <g className={`mri-net-magnetization is-${stage}`}>
          <line x1="180" y1="170" x2={stage === 'align' ? 180 : 285} y2={stage === 'align' ? 50 : 170} markerEnd="url(#mri-journey-arrow)" />
          <text x={stage === 'align' ? 192 : 290} y={stage === 'align' ? 56 : 164}>{stage === 'align' ? 'M₀' : 'Mˣʸ'}</text>
        </g>
      )}

      {stage === 'align' && <g className="mri-b0-axis"><line x1="315" y1="286" x2="315" y2="58" markerEnd="url(#mri-journey-arrow)" /><text x="300" y="45">B₀</text></g>}
      {stage === 'excite' && <g className="mri-rf-wave"><path d="M40 292 H72 L79 271 L88 313 L97 261 L106 320 L115 271 L123 292 H164" /><text x="43" y="326">RF field B₁</text></g>}
      {isEncoded && (
        <g className="mri-encoding-labels">
          <path d="M44 300 H316" markerEnd="url(#mri-journey-arrow)" />
          <text x="180" y="327" textAnchor="middle">frequency changes with position</text>
          <text x="180" y="36" textAnchor="middle">phase varies across the field</text>
        </g>
      )}
      {stage === 'repeat' && (
        <g className="mri-relaxation-preview">
          <path className="is-recovery" d="M58 237 C105 209 134 170 177 103 C215 47 255 52 302 49" />
          <path className="is-decay" d="M58 72 C105 87 145 130 184 185 C225 239 263 254 302 263" />
          <text x="276" y="42">Mᶻ recovers</text><text x="266" y="285">Mˣʸ decays</text>
        </g>
      )}
      {stage === 'reconstruct' && <KSpaceGrid className="mri-focus-kspace" />}
    </svg>
  )
}

function SignalWave() {
  const path = Array.from({ length: 72 }, (_, index) => {
    const x = 12 + index * 3.1
    const y = 66 - Math.exp(-index / 28) * Math.sin(index * 0.64) * 39
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  return <svg viewBox="0 0 250 132" role="img" aria-label="Decaying complex voltage measured by a receive coil"><path className="mri-output-axis" d="M10 66 H238 M10 16 V116" /><path className="mri-output-wave" d={path} /><text x="14" y="14">voltage</text><text x="218" y="83">time</text></svg>
}

function RfPulse() {
  const path = Array.from({ length: 78 }, (_, index) => {
    const x = 12 + index * 2.95
    const envelope = Math.exp(-Math.pow((index - 38.5) / 18, 2))
    const y = 66 - envelope * Math.sin(index * 1.15) * 42
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  return <svg viewBox="0 0 250 132" role="img" aria-label="Short radiofrequency transmit pulse"><path className="mri-output-axis" d="M10 66 H238 M10 16 V116" /><path className="mri-rf-pulse-path" d={path} /><text x="14" y="14">B₁</text><text x="218" y="83">time</text></svg>
}

function RepeatGrid() {
  return (
    <div className="mri-repeat-grid" role="img" aria-label="Repeated acquisitions filling successive lines of k-space">
      {Array.from({ length: 64 }, (_, index) => <i key={index} className={index < 43 ? 'is-filled' : ''} />)}
      <span>different encoding each repetition</span>
    </div>
  )
}

function JourneyOutput({ stage }: { stage: JourneyStageId }) {
  if (stage === 'hydrogen') return <div className="mri-signal-pool"><span><i>H</i><strong>Water</strong></span><b>+</b><span><i>H</i><strong>Fat</strong></span><small>large pool of MR-visible hydrogen</small></div>
  if (stage === 'align') return <div className="mri-equilibrium-output"><i><span /></i><strong>M₀ along B₀</strong><small>small net effect from a large population</small></div>
  if (stage === 'excite') return <div className="mri-rf-output"><RfPulse /><strong>RF energy in</strong><small>coherent transverse magnetization is created</small></div>
  if (stage === 'encode') return <div className="mri-receive-output"><SignalWave /><strong>Complex voltage out</strong><small>amplitude + phase carry the encoded measurement</small></div>
  if (stage === 'repeat') return <RepeatGrid />
  return <div className="mri-reconstruction-output"><span>image domain</span><img src={brainAsset} alt="Axial T1-weighted brain MRI reconstructed from acquired measurements" /><small>one reconstructed axial image</small></div>
}

function JourneyDiagram({ stage }: { stage: JourneyStageId }) {
  const stageIndex = journeyStages.findIndex((item) => item.id === stage)
  const linkLabel = stage === 'hydrogen' ? 'identify' : stage === 'align' ? 'sum' : stage === 'excite' ? 'tip' : stage === 'encode' ? 'measure' : stage === 'repeat' ? 'accumulate' : 'transform'
  return (
    <div className={`mri-journey-scene is-${stage}`}>
      <div className="mri-journey-scanner">
        <span>1 · scanner + patient</span>
        <img src={scannerAsset} alt="Illustrated clinical MRI scanner and patient table" />
        <div className="mri-scanner-field" aria-hidden="true"><i /><i /><i /></div>
        <strong>{stage === 'hydrogen' ? 'Hydrogen-rich tissue enters the bore' : stage === 'align' ? 'B₀ establishes equilibrium' : stage === 'excite' ? 'Transmit RF is applied' : stage === 'encode' ? 'Gradients and receive coils are active' : stage === 'repeat' ? 'The sequence runs repeatedly' : 'Acquisition is complete'}</strong>
      </div>

      <div className="mri-journey-link is-first" aria-hidden="true"><span>magnify</span><b>→</b></div>

      <figure className="mri-journey-focus">
        <figcaption>2 · what changes in the spin system</figcaption>
        <SpinField stage={stage} />
      </figure>

      <div className="mri-journey-link is-second" aria-hidden="true"><span>{linkLabel}</span><b>→</b></div>

      <div className="mri-journey-output">
        <span>3 · {stageIndex < 3 ? 'result of this step' : 'data product'}</span>
        <JourneyOutput stage={stage} />
      </div>
    </div>
  )
}

export function MriSignalLesson() {
  const [stageIndex, setStageIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const stage = journeyStages[stageIndex] ?? journeyStages[0]

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setStageIndex((current) => (current + 1) % journeyStages.length), 4200)
    return () => window.clearInterval(timer)
  }, [playing])

  const selectStage = (index: number) => {
    setPlaying(false)
    setStageIndex(index)
  }

  return (
    <section className="mri-signal-cycle" aria-labelledby="mri-signal-cycle-title">
      <header>
        <div>
          <span>Interactive overview</span>
          <h4 id="mri-signal-cycle-title">Follow one MR measurement</h4>
          <p>Watch one continuous story from hydrogen in the patient to a reconstructed image. Later chapters reopen the encoding, contrast, and reconstruction stages in detail.</p>
        </div>
        <button type="button" className="mri-cycle-play" aria-pressed={playing} onClick={() => setPlaying((current) => !current)}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {playing ? 'Pause overview' : 'Play overview'}
        </button>
      </header>

      <div className="mri-journey-steps" role="group" aria-label="MRI measurement stage">
        {journeyStages.map((item, index) => (
          <button key={item.id} type="button" aria-pressed={stageIndex === index} onClick={() => selectStage(index)}>
            <small>{String(index + 1).padStart(2, '0')}</small><span>{item.short}</span><i aria-hidden="true" />
          </button>
        ))}
      </div>

      <JourneyDiagram stage={stage.id} />

      <div className="mri-journey-caption" aria-live="polite">
        <span>{String(stageIndex + 1).padStart(2, '0')}</span>
        <div><strong>{stage.title}</strong><p>{stage.copy}</p></div>
        <aside><small>What changed</small><p>{stage.change}</p></aside>
      </div>

      <footer className="mri-primary-asset-credit">
        <span>Scanner: NIAID / NIH BioArt, public domain.</span>
        <a href="https://commons.wikimedia.org/wiki/File:MRI_Machine_(NIH_BioArt_692_-_782415).svg" target="_blank" rel="noreferrer">Scanner source <ExternalLink aria-hidden="true" /></a>
        <span>Brain MRI: 511KeV, CC BY-SA 4.0, used unchanged.</span>
        <a href="https://commons.wikimedia.org/wiki/File:MRI_Brain_T1_Axial_(11).jpg" target="_blank" rel="noreferrer">MRI source <ExternalLink aria-hidden="true" /></a>
      </footer>
    </section>
  )
}

const hardwareNotes = [
  { cue: 'Static field · B₀', title: 'The main magnet establishes equilibrium', copy: 'Its strong, static field sets the equilibrium direction and resonance reference throughout the bore.' },
  { cue: 'Spatial encoding', title: 'Gradient coils make field strength depend on position', copy: 'Brief, controlled changes along x, y, and z provide slice selection, phase encoding, and frequency encoding.' },
  { cue: 'Excitation · B₁', title: 'The transmit RF coil perturbs magnetization', copy: 'A radiofrequency field near resonance transfers energy and tips net magnetization away from equilibrium.' },
  { cue: 'Measurement', title: 'Receive coils convert the response into voltage', copy: 'Changing magnetic flux induces a complex voltage in each coil element; these measured signals are later reconstructed into an image.' },
]

export function MriSignalReferences() {
  return (
    <article className="mri-hardware-reference">
      <header><span>Hardware reference</span><h4>Four systems, four different jobs</h4><p>The scanner is a set of nested systems rather than one undifferentiated machine. Isolate each layer in the cutaway, then connect its physical job to the measured signal.</p></header>
      <div className="mri-hardware-content">
        <figure className="mri-hardware-gradients">
          <div className="mri-hardware-figure-heading"><strong>MRI scanner cutaway</strong><small>Main magnet → gradients → transmit RF → receive array → patient</small></div>
          <MriGradientHardware3d />
          <figcaption>
            <span>Original teaching figure; hardware geometry is schematic. Anatomy: ogbog’s Blender adaptation of BodyParts3D, CC BY-SA.</span>
            <span className="mri-hardware-links"><a href="https://blendswap.com/blend/26915" target="_blank" rel="noreferrer">Anatomy source <ExternalLink aria-hidden="true" /></a><a href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">BodyParts3D <ExternalLink aria-hidden="true" /></a></span>
          </figcaption>
        </figure>
        <div className="mri-hardware-notes" aria-label="MRI scanner components and measurement jobs">
          {hardwareNotes.map((item) => <article key={item.title}><header><span>{item.cue}</span><h5>{item.title}</h5></header><p>{item.copy}</p></article>)}
        </div>
      </div>
    </article>
  )
}
