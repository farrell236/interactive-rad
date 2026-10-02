import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { MriScannerField3d } from './MriScannerField3d'
import { MriSpinEnsemble3d } from './MriSpinEnsemble3d'
import { getMriClockSeconds, getMriPulseCyclePhase, isMriRfActive, MRI_READOUT_END, MRI_RF_END } from './mriPulseCycle'

type SignalStageId = 'hydrogen' | 'random' | 'align' | 'cycle'

interface SignalStage {
  id: SignalStageId
  label: string
  title: string
  copy: string
}

const signalStages: SignalStage[] = [
  {
    id: 'hydrogen',
    label: 'Hydrogen',
    title: 'Hydrogen supplies the raw signal source',
    copy: 'MRI primarily detects hydrogen nuclei because water and fat make them abundant in the body. Each proton has a magnetic moment, represented by the arrow on the sphere, but the scanner does not measure one proton in isolation. Image signal comes from the combined magnetization of an enormous population within tissue. The number of mobile hydrogen nuclei affects the available signal, while their molecular environment and the chosen sequence determine how much of that signal is ultimately measured.',
  },
  {
    id: 'random',
    label: 'Random spin',
    title: 'Random magnetic moments cancel at the population level',
    copy: 'As a conceptual reference before a strong external field is applied, magnetic moments point in many directions and their vector contributions cancel. Individual nuclei still have magnetic moments, but the ensemble has no stable net direction, no longitudinal magnetization to tip, and no useful receive-coil signal. The different arrow orientations show this lack of macroscopic order; they are not meant to imply a shared precession axis or that every nucleus follows the same motion.',
  },
  {
    id: 'align',
    label: 'B₀',
    title: 'B₀ creates equilibrium—not perfect alignment',
    copy: 'The main field B₀ establishes the longitudinal axis and sets the Larmor precession frequency. Slightly more moments occupy the lower-energy alignment than the opposite alignment, producing the small net magnetization M₀. This is a population bias—not every moment pointing in exactly the same direction. Their transverse phases remain distributed and cancel at equilibrium, so no changing transverse magnetic flux reaches the receive coil and the voltage stays at baseline.',
  },
  {
    id: 'cycle',
    label: 'Pulse cycle',
    title: 'RF excitation creates a measurable, decaying signal',
    copy: 'A short RF field B₁ applied near resonance transfers energy, tips the net magnetization away from B₀, and brings transverse components into phase. The receiver is blanked during transmission; after the pulse ends, rotating transverse magnetization induces the schematic decaying voltage shown in the graph. Imaging sequences may form a gradient echo or spin echo before sampling, but the measured waveform is still a complex signal with amplitude and phase. Receive arrays preserve a separate version from each coil element while transverse coherence is lost and longitudinal magnetization recovers.',
  },
]

function useCyclePhase(active: boolean, cycleStartedAt: number) {
  const [phase, setPhase] = useState(() => getMriPulseCyclePhase(cycleStartedAt))

  useEffect(() => {
    if (!active) return undefined

    let frame = 0
    const update = () => {
      setPhase(getMriPulseCyclePhase(cycleStartedAt))
      frame = window.requestAnimationFrame(update)
    }
    update()
    return () => window.cancelAnimationFrame(frame)
  }, [active, cycleStartedAt])

  return active ? phase : 0
}

function ScannerState({ stage, cycleStartedAt }: { stage: SignalStageId; cycleStartedAt: number }) {
  const fieldActive = stage === 'align' || stage === 'cycle'
  const cyclePhase = useCyclePhase(stage === 'cycle', cycleStartedAt)
  const rfActive = stage === 'cycle' && isMriRfActive(cyclePhase)
  return (
    <section className={`mri-sequence-scanner is-${stage}`} aria-label="MRI scanner field state">
      <header><span>Scanner fields</span><small>{fieldActive ? 'B₀ active' : stage === 'random' ? 'Conceptual state before B₀' : 'Nucleus before the field model'}</small></header>
      <div className={`mri-sequence-scanner-visual${fieldActive ? ' is-b0-active' : ''}${rfActive ? ' is-rf-active' : ''}`}>
        <MriScannerField3d fieldActive={fieldActive} pulseActive={stage === 'cycle'} cycleStartedAt={cycleStartedAt} />
        <div className="mri-field-key" aria-hidden="true"><span className="is-b0">B₀</span><span className="is-rf">RF · B₁</span></div>
      </div>
      <p>{stage === 'hydrogen' ? 'Hydrogen supplies the measurable nuclei.' : stage === 'random' ? 'The moments have no preferred direction.' : stage === 'align' ? 'The main magnet establishes equilibrium.' : 'B₀ remains active while transmission and reception alternate.'}</p>
    </section>
  )
}

function buildFidPath() {
  return Array.from({ length: 150 }, (_, index) => {
    const x = 22 + index * 1.82
    const envelope = Math.exp(-index / 65)
    const amplitude = envelope * Math.sin(index * 0.67) * 72
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${(150 - amplitude).toFixed(1)}`
  }).join(' ')
}

const fidPath = buildFidPath()

function DetectorReadout({ stage, cycleStartedAt }: { stage: SignalStageId; cycleStartedAt: number }) {
  const cyclePhase = useCyclePhase(stage === 'cycle', cycleStartedAt)
  const rfActive = stage === 'cycle' && isMriRfActive(cyclePhase)
  const recording = stage === 'cycle' && cyclePhase >= MRI_RF_END && cyclePhase < MRI_READOUT_END
  const waiting = stage === 'cycle' && !rfActive && !recording
  const traceProgress = recording
    ? Math.min(1, Math.max(0, (cyclePhase - MRI_RF_END) / (MRI_READOUT_END - MRI_RF_END)))
    : cyclePhase >= MRI_READOUT_END ? 1 : 0
  const traceOpacity = recording ? 1 : cyclePhase >= MRI_READOUT_END ? Math.max(0, (1 - cyclePhase) / (1 - MRI_READOUT_END)) : 0
  const status = stage === 'cycle' ? 'RF blanking → schematic signal → recovery' : 'No transverse signal measured'
  return (
    <section className={`mri-detector-readout is-${stage}`} aria-label="Receive coil measurement">
      <header><span>Receive coil voltage</span><small>{status}</small></header>
      <svg viewBox="0 0 320 310" role="img" aria-label={status}>
        <title>{status}</title>
        <path className="mri-detector-grid" d="M22 42 H296 M22 96 H296 M22 150 H296 M22 204 H296 M22 258 H296 M22 36 V276 M90 36 V276 M158 36 V276 M226 36 V276 M296 36 V276" />
        <path className="mri-detector-axis" d="M22 150 H302 M22 30 V278" /><path className="mri-detector-baseline" d="M22 150 H296" /><path className="mri-detector-cycle" d={fidPath} style={stage === 'cycle' ? { animation: 'none', opacity: traceOpacity, clipPath: `inset(0 ${(1 - traceProgress) * 100}% 0 0)` } : undefined} />
        <text x="24" y="20">voltage</text><text x="268" y="300">time</text>
        {stage === 'cycle' ? (
          <g className="mri-receiver-state" aria-hidden="true">
            <text className="is-waiting" style={{ animation: 'none', opacity: waiting ? 1 : 0 }} x="294" y="22" textAnchor="end">Receiver waiting</text>
            <text className="is-blanked" style={{ animation: 'none', opacity: rfActive ? 1 : 0 }} x="294" y="22" textAnchor="end">Receiver blanked</text>
            <text className="is-recording" style={{ animation: 'none', opacity: recording ? 1 : 0 }} x="294" y="22" textAnchor="end">Receiver recording</text>
          </g>
        ) : <text className="mri-receiver-idle" x="294" y="22" textAnchor="end">Receiver idle</text>}
      </svg>
      <p>{stage === 'hydrogen' ? 'A nucleus alone is not an image or detector reading.' : stage === 'random' ? 'Random contributions cancel at the ensemble level.' : stage === 'align' ? 'Longitudinal equilibrium magnetization does not produce the readout waveform.' : 'The receiver is blanked during RF, then records a schematic decaying complex signal after transmission ends.'}</p>
    </section>
  )
}

function SignalSequence({ stage, cycleStartedAt }: { stage: SignalStageId; cycleStartedAt: number }) {
  return <div className={`mri-sequence-stage is-${stage}`}><ScannerState stage={stage} cycleStartedAt={cycleStartedAt} /><MriSpinEnsemble3d stage={stage} cycleStartedAt={cycleStartedAt} /><DetectorReadout stage={stage} cycleStartedAt={cycleStartedAt} /></div>
}

export function MriSignalSequenceLesson() {
  const [stageIndex, setStageIndex] = useState(0)
  const [cycleStartedAt, setCycleStartedAt] = useState(getMriClockSeconds)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const stage = signalStages[stageIndex] ?? signalStages[0]

  const selectStage = (nextIndex: number, focus = false) => {
    if (signalStages[nextIndex]?.id === 'cycle') setCycleStartedAt(getMriClockSeconds())
    setStageIndex(nextIndex)
    if (focus) window.requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus())
  }

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % signalStages.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + signalStages.length) % signalStages.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = signalStages.length - 1
    else return
    event.preventDefault()
    selectStage(nextIndex, true)
  }

  return (
    <section className="mri-signal-cycle" aria-labelledby="mri-signal-cycle-title">
      <header><div><span>Core concept</span><h4 id="mri-signal-cycle-title">Follow the MR signal</h4><p>Hydrogen in the patient supplies magnetic moments. Use the synchronized scanner, spin-ensemble, and voltage views to follow how <strong>B₀</strong> creates a small <strong>net magnetization</strong>, an <strong>RF pulse</strong> produces transverse coherence, and <strong>receive coils</strong> record the decaying response as complex voltage while the system recovers. Repeating the experiment with <strong>spatial encoding</strong> fills <strong>k-space</strong>; a <strong>Fourier transform</strong> reconstructs the image. The first three tabs build this model conceptually; <strong>B₀</strong> remains continuously active during an actual examination.</p></div></header>
      <div className="mri-signal-tabs" role="tablist" aria-label="MRI signal sequence">
        {signalStages.map((item, index) => (
          <button key={item.id} ref={(element) => { tabRefs.current[index] = element }} id={`mri-signal-tab-${item.id}`} type="button" role="tab" aria-controls="mri-signal-sequence-panel" aria-selected={stageIndex === index} tabIndex={stageIndex === index ? 0 : -1} onClick={() => selectStage(index)} onKeyDown={(event) => handleTabKey(event, index)}>
            <small>{String(index + 1).padStart(2, '0')}</small><span>{item.label}</span><i aria-hidden="true" />
          </button>
        ))}
      </div>
      <div id="mri-signal-sequence-panel" role="tabpanel" aria-labelledby={`mri-signal-tab-${stage.id}`}>
        <SignalSequence stage={stage.id} cycleStartedAt={cycleStartedAt} />
        <div className="mri-sequence-caption" aria-live="polite"><span>{String(stageIndex + 1).padStart(2, '0')}</span><div><strong>{stage.title}</strong><p>{stage.copy}</p></div></div>
      </div>
      <footer className="mri-primary-asset-credit">
        <span>Scanner mesh: 3D Assets, “Hospital Wards and Clinic Operations — CT Scanner” (CC0 1.0).</span>
        <a href="https://3dassets.dev/assets/hospital-wards-and-clinic-operations-ct-scanner-f8d327b3" target="_blank" rel="noreferrer">Asset source</a>
        <span>Field lines are a schematic representation of B₀.</span>
      </footer>
    </section>
  )
}
