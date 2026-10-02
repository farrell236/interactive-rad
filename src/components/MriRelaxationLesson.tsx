import { useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { ctRangeProgressStyle } from '../lib/rangeProgress'

type TissueKey = 'white' | 'gray' | 'csf'
type PresetKey = 't1' | 'pd' | 't2'
type ComparisonMode = 'predefined' | 'custom'
type IntensityScale = 'relative' | 'fixed'
type AcquisitionModel = 'spinEcho' | 'gradientEcho'
type RelaxationPlotKind = 'recovery' | 'decay' | 't2star'

interface RelaxationTimingProps {
  tr: number
  te: number
  onTrChange: (value: number) => void
  onTeChange: (value: number) => void
}

interface Tissue {
  key: TissueKey
  name: string
  short: string
  color: string
  protonDensity: number
  t1: number
  t2: number
  t2Star: number
}

const tissues: Tissue[] = [
  { key: 'white', name: 'White matter', short: 'WM', color: '#f3b86a', protonDensity: 0.70, t1: 850, t2: 80, t2Star: 50 },
  { key: 'gray', name: 'Gray matter', short: 'GM', color: '#c39cff', protonDensity: 0.86, t1: 1350, t2: 100, t2Star: 60 },
  { key: 'csf', name: 'CSF', short: 'CSF', color: '#60d4ea', protonDensity: 1.00, t1: 4000, t2: 2000, t2Star: 300 },
]

const presets: Array<{ key: PresetKey; label: string; tr: number; te: number; rationale: string }> = [
  { key: 't1', label: 'T1 emphasis', tr: 500, te: 15, rationale: 'Short TR preserves T1 contrast; short TE limits T2 influence.' },
  { key: 'pd', label: 'PD emphasis', tr: 3000, te: 15, rationale: 'Long TR and short TE reduce T1 and T2 influence, emphasizing proton density.' },
  { key: 't2', label: 'T2 emphasis', tr: 3000, te: 110, rationale: 'Long TR limits T1 influence; long TE emphasizes T2 decay.' },
]

const t2StarPreset = {
  label: 'T2* emphasis',
  tr: 700,
  te: 30,
  flipAngle: 20,
  rationale: 'A gradient echo omits 180° refocusing, so TE samples the faster T2* decay while flip angle and TR set longitudinal saturation.',
}

const imageComparisons = [
  {
    id: 't1',
    title: 'T1-weighted',
    timing: 'longitudinal contrast',
    asset: 'cie-template-t1.png',
    copy: 'Longitudinal recovery dominates: white matter is brighter than cortex, while CSF is dark.',
  },
  {
    id: 'pd',
    title: 'Proton-density weighted',
    timing: 'proton-density contrast',
    asset: 'cie-template-pd.png',
    copy: 'Competing T1 and T2 effects are reduced, making mobile-hydrogen density more influential.',
  },
  {
    id: 't2',
    title: 'T2-weighted',
    timing: 'spin-echo contrast',
    asset: 'cie-template-t2.png',
    copy: 'RF refocusing suppresses static-field dephasing, emphasizing intrinsic transverse decay; CSF is bright.',
  },
  {
    id: 't2star',
    title: 'T2*-weighted',
    timing: 'gradient-echo contrast',
    asset: 'cie-template-t2star.png',
    copy: 'Without RF refocusing, intrinsic T2 decay and local field inhomogeneity both contribute to signal loss.',
  },
]

const imageBase = `${import.meta.env.BASE_URL}assets/mri/`

function signalFor(tissue: Tissue, tr: number, te: number, acquisitionModel: AcquisitionModel, flipAngle: number) {
  const recovery = 1 - Math.exp(-tr / tissue.t1)
  const effectiveT2 = acquisitionModel === 'gradientEcho' ? tissue.t2Star : tissue.t2
  const decay = Math.exp(-te / effectiveT2)
  if (acquisitionModel === 'gradientEcho') {
    const e1 = Math.exp(-tr / tissue.t1)
    const flipRadians = flipAngle * Math.PI / 180
    const spoiledGradientEcho = Math.sin(flipRadians) * (1 - e1) / Math.max(1 - Math.cos(flipRadians) * e1, Number.EPSILON)
    return {
      recovery,
      decay,
      signal: tissue.protonDensity * spoiledGradientEcho * decay,
    }
  }
  return {
    recovery,
    decay,
    signal: tissue.protonDensity * recovery * decay,
  }
}

type RelaxationChartGeometry = {
  className: string
  viewWidth: number
  xStart: number
  xSpan: number
  axisEnd: number
  ariaHidden?: boolean
}

const relaxationChartGeometries: RelaxationChartGeometry[] = [
  { className: 'is-wide', viewWidth: 420, xStart: 36, xSpan: 348, axisEnd: 392 },
  { className: 'is-compact', viewWidth: 300, xStart: 28, xSpan: 250, axisEnd: 286, ariaHidden: true },
]

function curvePath(tissue: Tissue, kind: RelaxationPlotKind, geometry: RelaxationChartGeometry) {
  const maxTime = kind === 'recovery' ? 4000 : kind === 't2star' ? 120 : 180
  return Array.from({ length: 81 }, (_, index) => {
    const time = (index / 80) * maxTime
    const value = kind === 'recovery'
      ? 1 - Math.exp(-time / tissue.t1)
      : Math.exp(-time / (kind === 't2star' ? tissue.t2Star : tissue.t2))
    const x = geometry.xStart + (index / 80) * geometry.xSpan
    const y = 198 - value * 160
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function RelaxationPlot({ kind, sampleTime, onSampleTimeChange }: { kind: RelaxationPlotKind; sampleTime: number; onSampleTimeChange: (value: number) => void }) {
  const maxTime = kind === 'recovery' ? 4000 : kind === 't2star' ? 120 : 180
  const minTime = kind === 'recovery' ? 100 : kind === 't2star' ? 2 : 5
  const step = kind === 'recovery' ? 50 : kind === 't2star' ? 2 : 5
  const label = kind === 'recovery' ? 'Longitudinal recovery' : kind === 't2star' ? 'Effective transverse decay' : 'Transverse decay'
  const symbol = kind === 'recovery' ? 'Mᶻ / M₀' : 'Mˣʸ / M₀'
  const yAxisLabel = `${symbol} (unitless)`
  const timeLabel = kind === 'recovery' ? 'TR' : 'TE'
  const controlLabel = kind === 'recovery' ? 'Repetition time TR' : 'Echo time TE'
  const controlHelp = kind === 'recovery'
    ? 'Choose when the next excitation samples longitudinal recovery.'
    : kind === 't2star'
      ? 'Choose when the gradient echo samples combined T2 decay and field-dependent dephasing.'
      : 'Choose when the spin echo samples transverse decay after RF refocusing.'

  return (
    <figure className="mri-relaxation-plot">
      <figcaption><strong>{label}</strong><span>{symbol}</span></figcaption>
      <label className="mri-relaxation-plot-control">
        <span><strong>{timeLabel}<span className="mri-relaxation-control-kind"> · {kind === 'recovery' ? 'repetition time' : 'echo time'}</span></strong><output>{sampleTime} ms</output></span>
        <div><input type="range" min={minTime} max={maxTime} step={step} value={sampleTime} aria-label={controlLabel} style={ctRangeProgressStyle(sampleTime, minTime, maxTime)} onChange={(event) => onSampleTimeChange(Number(event.target.value))} /></div>
        <small>{controlHelp}</small>
      </label>
      {relaxationChartGeometries.map((geometry) => {
        const markerX = geometry.xStart + Math.min(sampleTime / maxTime, 1) * geometry.xSpan
        const xEnd = geometry.xStart + geometry.xSpan
        return (
          <svg key={geometry.className} className={`mri-relaxation-chart ${geometry.className}`} viewBox={`0 0 ${geometry.viewWidth} 230`} role={geometry.ariaHidden ? undefined : 'img'} aria-hidden={geometry.ariaHidden || undefined} aria-label={geometry.ariaHidden ? undefined : `${label} curves of ${yAxisLabel} with ${timeLabel} at ${sampleTime} milliseconds`}>
            <g className="mri-relaxation-grid">
              {[0, 1, 2, 3, 4].map((index) => <line key={`v-${index}`} x1={geometry.xStart + index * geometry.xSpan / 4} y1="34" x2={geometry.xStart + index * geometry.xSpan / 4} y2="198" />)}
              {[0, 1, 2, 3, 4].map((index) => <line key={`h-${index}`} x1={geometry.xStart} y1={38 + index * 40} x2={xEnd} y2={38 + index * 40} />)}
            </g>
            <path className="mri-relaxation-axis" d={`M ${geometry.xStart} 30 V 198 H ${geometry.axisEnd}`} />
            <text className="mri-relaxation-axis-label" transform={`translate(${geometry.className === 'is-wide' ? 10 : 8} 114) rotate(-90)`} textAnchor="middle">{yAxisLabel}</text>
            <text className="mri-relaxation-axis-tick" x={geometry.xStart - 5} y="41" textAnchor="end">1.0</text>
            <text className="mri-relaxation-axis-tick" x={geometry.xStart - 5} y="199" textAnchor="end">0</text>
            {tissues.map((tissue) => <path key={tissue.key} className={`is-tissue-${tissue.key}`} d={curvePath(tissue, kind, geometry)} fill="none" stroke={tissue.color} strokeWidth="3" strokeLinecap="round" />)}
            <line className="mri-relaxation-sample-line" x1={markerX} y1="29" x2={markerX} y2="201" />
            <text className="mri-relaxation-axis-text" x={geometry.xStart} y="220">0</text>
            <text className="mri-relaxation-axis-text" x={xEnd} y="220" textAnchor="end">{maxTime} ms</text>
          </svg>
        )
      })}
      <div className="mri-relaxation-legend" aria-label="Tissue curve colors">
        {tissues.map((tissue) => <span key={tissue.key}><i className={`is-tissue-${tissue.key}`} style={{ color: tissue.color }} />{tissue.short}</span>)}
      </div>
    </figure>
  )
}

function MriCustomTimingLab({ tr, te, onTrChange, onTeChange }: RelaxationTimingProps) {
  const [intensityScale, setIntensityScale] = useState<IntensityScale>('fixed')
  const [acquisitionModel, setAcquisitionModel] = useState<AcquisitionModel>('spinEcho')
  const [flipAngle, setFlipAngle] = useState(t2StarPreset.flipAngle)
  const measurements = useMemo(
    () => tissues.map((tissue) => ({ tissue, ...signalFor(tissue, tr, te, acquisitionModel, flipAngle) })),
    [acquisitionModel, flipAngle, te, tr],
  )
  const brightestSignal = Math.max(...measurements.map((item) => item.signal), Number.EPSILON)
  const activePreset = acquisitionModel === 'spinEcho' ? presets.find((preset) => preset.tr === tr && preset.te === te) : undefined
  const gradientPresetActive = acquisitionModel === 'gradientEcho' && tr === t2StarPreset.tr && te === t2StarPreset.te && flipAngle === t2StarPreset.flipAngle
  const fixedSignalReference = acquisitionModel === 'gradientEcho' ? 0.20 : 0.65
  const displaySignal = (signal: number) => intensityScale === 'relative' ? signal / brightestSignal : Math.min(signal / fixedSignalReference, 1)
  const scaleExplanation = intensityScale === 'relative'
    ? 'Normalized mode rescales the brightest tissue to 1.00, emphasizing contrast rather than total signal.'
    : `Fixed mode preserves one display scale within the ${acquisitionModel === 'gradientEcho' ? 'gradient-echo' : 'spin-echo'} model, so low-signal settings remain darker.`

  const updateTr = (value: number) => {
    onTrChange(value)
  }

  const updateTe = (value: number) => {
    onTeChange(value)
  }

  const applyPreset = (preset: (typeof presets)[number]) => {
    setAcquisitionModel('spinEcho')
    onTrChange(preset.tr)
    onTeChange(preset.te)
  }

  const applyT2StarPreset = () => {
    setAcquisitionModel('gradientEcho')
    setFlipAngle(t2StarPreset.flipAngle)
    onTrChange(t2StarPreset.tr)
    onTeChange(t2StarPreset.te)
  }

  const modelRationale = acquisitionModel === 'gradientEcho'
    ? (gradientPresetActive ? t2StarPreset.rationale : 'TR and flip angle set longitudinal saturation; TE samples the effective T2* decay.')
    : (activePreset?.rationale ?? 'TR and TE jointly determine the relative T1 and T2 contribution.')

  return (
    <div className="mri-custom-lab">
      <div className="mri-relaxation-presets" role="group" aria-label="Relaxation weighting presets">
        {presets.map((preset) => (
          <button key={preset.key} type="button" className={activePreset?.key === preset.key ? 'is-selected' : ''} aria-pressed={activePreset?.key === preset.key} onClick={() => applyPreset(preset)}>
            <strong>{preset.label}</strong><small>TR {preset.tr} · TE {preset.te} ms</small>
          </button>
        ))}
        <button type="button" className={gradientPresetActive ? 'is-selected' : ''} aria-pressed={gradientPresetActive} onClick={applyT2StarPreset}>
          <strong>{t2StarPreset.label}</strong><small>TR {t2StarPreset.tr} · TE {t2StarPreset.te} ms · α {t2StarPreset.flipAngle}°</small>
        </button>
      </div>

      <div className="mri-custom-lab-grid">
        <RelaxationPlot kind="recovery" sampleTime={tr} onSampleTimeChange={updateTr} />
        <RelaxationPlot kind={acquisitionModel === 'gradientEcho' ? 't2star' : 'decay'} sampleTime={te} onSampleTimeChange={updateTe} />
        <figure className="mri-custom-output">
          <header>
            <span>Simulated image</span>
            <div className="mri-intensity-scale" role="group" aria-label="Simulated image scaling">
              <button type="button" title="Rescale the brightest tissue to 1.00" className={intensityScale === 'relative' ? 'is-selected' : ''} aria-pressed={intensityScale === 'relative'} onClick={() => setIntensityScale('relative')}>Normalized</button>
              <button type="button" title="Preserve one display scale within the selected signal model" className={intensityScale === 'fixed' ? 'is-selected' : ''} aria-pressed={intensityScale === 'fixed'} onClick={() => setIntensityScale('fixed')}>Fixed</button>
            </div>
          </header>
          <div className="mri-custom-output-body">
            <div className="mri-custom-slice" role="img" aria-label={`Simulated axial ${acquisitionModel === 'gradientEcho' ? `gradient-echo image at TR ${tr} milliseconds, TE ${te} milliseconds, and flip angle ${flipAngle} degrees` : `spin-echo image at TR ${tr} milliseconds and TE ${te} milliseconds`}`}>
              {measurements.map(({ tissue, signal }) => (
                <img key={tissue.key} src={`${imageBase}openbrain-${tissue.key}-matter.png`} alt="" aria-hidden="true" style={{ opacity: displaySignal(signal) }} />
              ))}
            </div>
            <label className={`mri-flip-angle-control is-vertical${acquisitionModel === 'spinEcho' ? ' is-disabled' : ''}`}>
              <strong>Flip angle</strong>
              <input type="range" min="5" max="60" step="1" value={flipAngle} disabled={acquisitionModel === 'spinEcho'} aria-label="Flip angle" style={ctRangeProgressStyle(flipAngle, 5, 60)} onChange={(event) => setFlipAngle(Number(event.target.value))} />
              <output>{flipAngle}°</output>
            </label>
          </div>
        </figure>
      </div>

      <footer className="mri-custom-model-summary">
        <div className="mri-custom-model-equation">
          <div className={`mri-relaxation-equation${acquisitionModel === 'gradientEcho' ? ' is-gradient-echo' : ''}`} aria-label={`Simplified ${acquisitionModel === 'gradientEcho' ? 'spoiled gradient echo' : 'spin echo'} signal model`}>
            <small>{acquisitionModel === 'gradientEcho' ? 'Simplified spoiled GRE model' : 'Simplified spin-echo model'}</small>
            {acquisitionModel === 'gradientEcho' ? (
              <strong><span>S ∝ ρ sin α · <span className="mri-equation-fraction"><i>1 − E₁</i><i>1 − E₁ cos α</i></span> · e<sup>−TE/T2*</sup></span><span className="mri-equation-definition">E₁ = e<sup>−TR/T1</sup></span></strong>
            ) : (
              <strong>S ∝ ρ · (1 − e<sup>−TR/T1</sup>) · e<sup>−TE/T2</sup></strong>
            )}
          </div>
        </div>
        <p><strong>{acquisitionModel === 'gradientEcho' ? (gradientPresetActive ? t2StarPreset.label : 'Custom gradient echo') : (activePreset?.label ?? 'Custom spin echo')}.</strong> {modelRationale} {scaleExplanation}</p>
        <div className="mri-custom-output-signals" aria-label={`${intensityScale === 'relative' ? 'Relative' : 'Fixed-scale'} simulated tissue signal`}>
          {measurements.map(({ tissue, signal }) => {
            const displayed = displaySignal(signal)
            return <div key={tissue.key}><span><i style={{ background: tissue.color }} /><strong>{tissue.short}</strong><output>{displayed.toFixed(2)}</output></span><b><i style={{ width: `${Math.max(3, displayed * 100)}%`, background: tissue.color }} /></b></div>
          })}
        </div>
      </footer>
    </div>
  )
}

function T2StarComparison() {
  return (
    <figure className="mri-t2-star-comparison">
      <figcaption>
        <span>T2 versus T2*</span>
        <strong>T2* ≤ T2 because field offsets add reversible dephasing to intrinsic T2 decay.</strong>
      </figcaption>
      <svg viewBox="0 0 330 112" role="img" aria-label="Normalized transverse signal S over S zero, a unitless quantity, showing T2 star signal decaying faster than T2 signal">
        <g className="mri-t2-star-grid">
          <line x1="40" y1="10" x2="40" y2="88" />
          <line x1="40" y1="88" x2="320" y2="88" />
          <line x1="40" y1="49" x2="320" y2="49" />
        </g>
        <text className="mri-t2-star-axis-label" transform="translate(10 49) rotate(-90)" textAnchor="middle">S / S₀ (unitless)</text>
        <text className="mri-t2-star-axis-tick" x="35" y="16" textAnchor="end">1.0</text>
        <text className="mri-t2-star-axis-tick" x="35" y="91" textAnchor="end">0</text>
        <path className="is-t2" d="M 40 14 C 98 23, 188 48, 320 76" />
        <path className="is-t2-star" d="M 40 14 C 92 45, 168 76, 320 86" />
        <text x="286" y="68" className="is-t2-label">T2</text>
        <text x="272" y="82" className="is-t2-star-label">T2*</text>
        <text x="40" y="106">relative time (a.u.)</text>
      </svg>
      <div className="mri-t2-star-paths" aria-label="How echo type determines transverse decay sensitivity">
        <p><strong>Spin echo</strong><span>refocuses static offsets</span><b>T2</b></p>
        <p><strong>Gradient echo</strong><span>offsets remain</span><b>T2*</b></p>
      </div>
    </figure>
  )
}

export function MriRelaxationReferences({ tr, te, onTrChange, onTeChange }: RelaxationTimingProps) {
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('predefined')

  return (
    <div className="mri-relaxation-references">
      <section className="mri-weighting-comparison" aria-labelledby="mri-weighting-comparison-title">
        <header>
          <div>
            <span>From timing to image contrast</span>
            <h4 id="mri-weighting-comparison-title">One aligned template, four contrasts</h4>
            <p>{comparisonMode === 'predefined'
              ? 'Compare spatially aligned T1-, proton-density-, T2-, and T2*-weighted population-average templates from the same cognitively intact cohort.'
              : 'Move TR and TE directly on the recovery and decay curves. T2* mode also enables flip angle. A simplified tissue model updates the relative brightness of white matter, gray matter, and CSF.'}</p>
          </div>
          <div className="mri-weighting-tabs" role="tablist" aria-label="Weighting comparison mode">
            <button type="button" role="tab" aria-selected={comparisonMode === 'predefined'} onClick={() => setComparisonMode('predefined')}>Predefined</button>
            <button type="button" role="tab" aria-selected={comparisonMode === 'custom'} onClick={() => setComparisonMode('custom')}>Custom</button>
          </div>
        </header>
        {comparisonMode === 'predefined' ? (
          <div role="tabpanel" aria-label="Predefined weighting comparison">
            <div className="mri-weighting-images">
              {imageComparisons.map((item) => (
                <figure key={item.id}>
                  <div><img src={`${imageBase}${item.asset}`} alt={`${item.title} axial CIE average MR template`} /></div>
                  <figcaption><span><strong>{item.title}</strong><small>{item.timing}</small></span><p>{item.copy}</p></figcaption>
                </figure>
              ))}
            </div>
            <footer className="mri-weighting-source">
              <span>Dadar et al. · cognitively intact elderly average template · CC BY 4.0</span>
              <a href="https://doi.org/10.5281/zenodo.5018356" target="_blank" rel="noreferrer">Multi-sequence templates <ExternalLink aria-hidden="true" /></a>
            </footer>
          </div>
        ) : (
          <div className="mri-custom-weighting" role="tabpanel" aria-label="Custom timing simulation">
            <MriCustomTimingLab tr={tr} te={te} onTrChange={onTrChange} onTeChange={onTeChange} />
            <footer className="mri-weighting-source">
              <span>Illustrative tissue parameters · no specific field strength or protocol · idealized signal models</span>
              <a href="https://huggingface.co/datasets/openbrain-anon/openbrain_v1_0" target="_blank" rel="noreferrer">OpenBrain v1.0 · CC0 <ExternalLink aria-hidden="true" /></a>
            </footer>
          </div>
        )}
      </section>

      <section className="mri-property-reference" aria-labelledby="mri-property-reference-title">
        <header>
          <span>Property reference</span>
          <h4 id="mri-property-reference-title">Property, weighting, and map are different data products</h4>
          <p>Use the noun carefully: a tissue has relaxation properties, an acquisition creates weighting, and a fitted multi-measurement model may estimate a quantitative map.</p>
        </header>
        <div className="mri-property-reference-body">
          <div className="mri-property-table-wrap">
            <table>
              <thead><tr><th>Property</th><th>What it describes</th><th>How an image emphasizes it</th><th>When values are quantitative</th></tr></thead>
              <tbody>
                <tr><th>Proton density · ρ</th><td data-label="What it describes">Available MR-visible hydrogen signal.</td><td data-label="How an image emphasizes it">Long TR and short TE reduce competing T1 and T2 influence.</td><td data-label="When values are quantitative">A calibrated PD estimate requires an explicit acquisition and correction model.</td></tr>
                <tr><th>T1</th><td data-label="What it describes">Longitudinal recovery toward equilibrium.</td><td data-label="How an image emphasizes it">Short TR samples tissues before their recovery curves converge.</td><td data-label="When values are quantitative">A T1 map fits repeated measurements and reports time, usually in ms.</td></tr>
                <tr><th>T2</th><td data-label="What it describes">Irreversible transverse coherence loss from spin–spin interactions.</td><td data-label="How an image emphasizes it">Long TE lets tissues separate according to how quickly signal decays.</td><td data-label="When values are quantitative">A T2 map fits multiple echo times and reports time, usually in ms.</td></tr>
                <tr><th>T2*</th><td data-label="What it describes">T2 decay plus reversible dephasing from field nonuniformity.</td><td data-label="How an image emphasizes it">Gradient-echo signal remains sensitive to both effects.</td><td data-label="When values are quantitative">A T2* or R2* map requires multi-echo data and an appropriate decay model.</td></tr>
              </tbody>
            </table>
          </div>
          <T2StarComparison />
        </div>
        <aside><strong>ML implication</strong><p>A T1-weighted image is not a T1 map. Treat weighted magnitude intensities as acquisition-dependent values unless the dataset explicitly provides a calibrated quantitative parameter.</p></aside>
      </section>
    </div>
  )
}
