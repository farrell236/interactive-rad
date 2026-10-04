import { Activity, ExternalLink, Info, X, Zap } from 'lucide-react'
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { getProjectionGeometry, rangeProgress } from '../simulation/xray'
import type { ExposurePhase, Projection, XraySettings } from '../types'

type NumericSetting = Exclude<keyof XraySettings, 'projection'>

interface ReferenceSource {
  title: string
  url: string
}

interface ParameterGuidance {
  description: string
  summary: [string, string]
  detail: ReactNode
  sources: ReferenceSource[]
}

interface ParameterConfig {
  id: string
  label: string
  setting: NumericSetting
  min: number
  max: number
  step: number
  unit: string
}

interface ProjectionGuidance {
  imageEffect: string
  positioningCue: string
}

const PROJECTION_GUIDANCE: Record<Projection, ProjectionGuidance> = {
  AP: {
    imageEffect: 'The heart and mediastinum appear larger because they sit farther from the detector.',
    positioningCue: 'Back against detector; face the source and keep the shoulders level.',
  },
  PA: {
    imageEffect: 'The heart is closer to the detector, reducing geometric magnification.',
    positioningCue: 'Chest against detector; roll the shoulders forward to clear the scapulae.',
  },
  Lateral: {
    imageEffect: 'The lungs overlap, revealing front-to-back relationships hidden on frontal views.',
    positioningCue: 'Left side against detector; raise both arms clear of the chest.',
  },
}

const SOURCES = {
  cdcChest: {
    title: 'CDC/NIOSH: Specifications for Medical Examinations of Underground Coal Miners',
    url: 'https://www.cdc.gov/niosh/docs/2011-198/pdfs/2011-198.pdf#page=9',
  },
  protocolOptimisation: {
    title: 'Standardisation and optimisation of chest and pelvis X-ray imaging protocols',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12192178/',
  },
  chestCollimation: {
    title: 'Evaluation of X-ray beam collimation in adult chest radiography',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11448963/',
  },
  multicentreAudit: {
    title: 'Typical and local diagnostic reference levels for chest and abdomen radiography',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11766229/',
  },
  sidStudy: {
    title: 'Effect of source-to-image distance on adult AP chest radiography',
    url: 'https://pubmed.ncbi.nlm.nih.gov/40383107/',
  },
  aapm: {
    title: 'AAPM Report 31: Standardized methods for measuring diagnostic X-ray exposures',
    url: 'https://www.aapm.org/pubs/reports/RPT_31.pdf#page=8',
  },
  who: {
    title: 'WHO manual of diagnostic imaging: radiographic technique and projections',
    url: 'https://www.who.int/publications/i/item/9241546085',
  },
  nnuh: {
    title: 'NNUH: Justification criteria and technique guide for plain radiological examinations',
    url: 'https://www.nnuh.nhs.uk/publication/justification-criteria-technique-guide-for-plain-radiological-examinations-version-8/',
  },
} satisfies Record<string, ReferenceSource>

function Citation({ index, source }: { index: number; source: ReferenceSource }) {
  return <sup><a className="inline-citation" href={source.url} target="_blank" rel="noreferrer" title={source.title} aria-label={`Open source ${index}: ${source.title}`}>[{index}]</a></sup>
}

const PARAMETER_GUIDANCE: Record<NumericSetting, ParameterGuidance> = {
  kvp: {
    description: 'Controls photon energy and beam penetration.',
    summary: ['↑ kVp → more penetration, flatter subject contrast', '↓ kVp → less penetration, steeper subject contrast'],
    detail: <>
      <p>Controls the energy and penetrating ability of the X-ray beam. Increasing it helps the beam pass through denser anatomy, but generally reduces subject contrast and produces a broader range of grey values. If it is too low, dense anatomy may be poorly penetrated even when thinner structures appear adequately exposed.</p>
      <p>Adult upright chest radiography commonly uses a high-energy technique around 110–125 kVp at a 180 cm source-to-image distance.<Citation index={1} source={SOURCES.cdcChest} /><Citation index={2} source={SOURCES.chestCollimation} /> Published pelvis protocols commonly use approximately 75–81 kVp at 115 cm.<Citation index={3} source={SOURCES.protocolOptimisation} /> These are reference examples rather than universal presets.</p>
    </>,
    sources: [SOURCES.cdcChest, SOURCES.chestCollimation, SOURCES.protocolOptimisation],
  },
  mas: {
    description: 'Controls the number of emitted X-ray photons.',
    summary: ['↑ mAs → more photons, less quantum noise', '↓ mAs → fewer photons, more quantum mottle'],
    detail: <>
      <p>Controls photon quantity rather than photon energy. Increasing it generally reduces quantum noise, while decreasing it produces a grainier image. It does not change anatomical magnification or positioning, and digital processing may normalize brightness enough to hide overexposure.</p>
      <p>One published adult PA chest workflow used 4–8 mAs with 110–125 kVp at a 183 cm distance.<Citation index={1} source={SOURCES.chestCollimation} /> Larger multi-centre audits show much wider ranges because patient thickness, grid use, detector response and automatic exposure control all affect the final mAs.<Citation index={2} source={SOURCES.multicentreAudit} /> In practice, the aim is the lowest exposure that still provides adequate diagnostic signal, with local technique charts adapted to the equipment and population.<Citation index={3} source={SOURCES.who} /></p>
    </>,
    sources: [SOURCES.chestCollimation, SOURCES.multicentreAudit, SOURCES.who],
  },
  sid: {
    description: 'Controls distance, magnification, and receptor exposure.',
    summary: ['↑ SID → less magnification, lower receptor fluence', '↓ SID → more magnification, higher receptor fluence'],
    detail: <>
      <p>Controls the distance from the focal spot to the image receptor. Increasing it reduces geometric magnification but also reduces the photon fluence reaching the detector unless exposure is compensated. A consistent distance makes serial examinations easier to compare.</p>
      <p>Approximately 180 cm is standard for upright adult chest imaging and helps limit apparent cardiac magnification.<Citation index={1} source={SOURCES.cdcChest} /><Citation index={2} source={SOURCES.sidStudy} /> Published pelvis protocols commonly use about 115 cm.<Citation index={3} source={SOURCES.protocolOptimisation} /> The correct distance remains projection- and equipment-specific.</p>
    </>,
    sources: [SOURCES.cdcChest, SOURCES.sidStudy, SOURCES.protocolOptimisation],
  },
  rotation: {
    description: 'Changes anatomical orientation and overlap.',
    summary: ['Away from 0° → more asymmetry and superimposition', 'Near 0° → neutral routine AP/PA positioning'],
    detail: <>
      <p>Changes which structures overlap in the two-dimensional projection. Rotation can make the lung fields asymmetric, alter the apparent width of the heart and mediastinum, and move ribs, clavicles and the spine relative to one another.</p>
      <p>Routine AP and PA chest examinations aim for neutral positioning with no intentional rotation. Deliberate obliquity is instead used when a particular structure must be separated from its neighbours, such as selected rib, sternum and joint projections. Projection protocols should be standardized so positioning differences are not mistaken for anatomical change.<Citation index={1} source={SOURCES.nnuh} /><Citation index={2} source={SOURCES.who} /></p>
    </>,
    sources: [SOURCES.nnuh, SOURCES.who],
  },
  collimation: {
    description: 'Controls how much anatomy is irradiated and captured.',
    summary: ['Smaller field → less scatter, tighter coverage', 'Larger field → more coverage and more scatter'],
    detail: <>
      <p>Controls the irradiated field. Tighter collimation reduces unnecessary exposure and scatter, which can improve contrast, but an excessively small field can exclude clinically important anatomy. A larger field includes more anatomy at the cost of additional scatter.</p>
      <p>The percentage shown here is an educational abstraction; clinical collimation is set to the anatomy required rather than a generic percentage. Adult chest work commonly uses a 35 × 43 cm receptor, but the field must still include the complete lungs and relevant margins without unnecessary tissue.<Citation index={1} source={SOURCES.chestCollimation} /> Accurate collimation should be visible on the submitted radiograph.<Citation index={2} source={SOURCES.nnuh} /></p>
    </>,
    sources: [SOURCES.chestCollimation, SOURCES.nnuh],
  },
  thickness: {
    description: 'Simulates attenuation and scatter through the patient.',
    summary: ['↑ thickness → more attenuation, scatter, and noise', '↓ thickness → less technique is usually required'],
    detail: <>
      <p>Represents a patient factor rather than a control selected by the operator. Greater thickness attenuates more of the beam and produces more scatter, so an unchanged technique generally yields less detector signal and more noise. Exposure selection or automatic exposure control must account for this.</p>
      <p>AAPM reference dimensions use approximately 23 cm for an average PA chest or AP abdomen and about 8 cm for a foot.<Citation index={1} source={SOURCES.aapm} /> These values show why the same technique cannot be transferred directly between body regions or patient sizes; technique charts should be adapted to local equipment and conditions.<Citation index={2} source={SOURCES.who} /></p>
    </>,
    sources: [SOURCES.aapm, SOURCES.who],
  },
}

const PARAMETER_CONFIGS: ParameterConfig[] = [
  { id: 'kvp', label: 'Tube voltage', setting: 'kvp', min: 50, max: 140, step: 1, unit: ' kVp' },
  { id: 'mas', label: 'Tube current-time', setting: 'mas', min: 0.5, max: 10, step: 0.5, unit: ' mAs' },
  { id: 'sid', label: 'Source-image distance', setting: 'sid', min: 100, max: 200, step: 1, unit: ' cm' },
  { id: 'rotation', label: 'Patient rotation', setting: 'rotation', min: -45, max: 45, step: 1, unit: '°' },
  { id: 'collimation', label: 'Beam collimation', setting: 'collimation', min: 35, max: 100, step: 1, unit: '%' },
  { id: 'thickness', label: 'Patient thickness', setting: 'thickness', min: 16, max: 38, step: 1, unit: ' cm' },
]

function formatValue(value: number, step: number, unit: string) {
  return `${value.toFixed(step < 1 ? 1 : 0)}${unit}`
}

function ProjectionGlance({ projection }: { projection: Projection }) {
  const geometry = getProjectionGeometry(projection)
  const guidance = PROJECTION_GUIDANCE[projection]
  return (
    <section className="projection-glance" aria-label={`${geometry.label} projection at a glance`} aria-live="polite">
      <div className="projection-glance-heading"><span>Beam path</span><strong>{geometry.beamPath}</strong></div>
      <div className="projection-path" aria-hidden="true">
        <span className="projection-source-symbol"><span /><small>Source</small></span>
        <span className="projection-beam-segment" />
        <span className={`projection-patient-symbol${projection === 'Lateral' ? ' is-lateral' : ''}`}><span className="patient-head" /><span className="patient-torso" /><small>Patient</small></span>
        <span className="projection-beam-segment" />
        <span className="projection-detector-symbol"><span /><small>Detector</small></span>
      </div>
      <dl className="projection-glance-details">
        <div><dt>Image effect</dt><dd>{guidance.imageEffect}</dd></div>
        <div><dt>Positioning cue</dt><dd>{guidance.positioningCue}</dd></div>
      </dl>
    </section>
  )
}

interface SliderProps extends ParameterConfig {
  value: number
  pinned: boolean
  onChange: (setting: NumericSetting, value: number) => void
  onToggleDetail: (setting: NumericSetting) => void
}

function ParameterSlider({ id, label, setting, value, min, max, step, unit, pinned, onChange, onToggleDetail }: SliderProps) {
  const progress = rangeProgress(value, min, max)
  const guidance = PARAMETER_GUIDANCE[setting]
  const descriptionId = `${id}-description`
  const tooltipId = `${id}-tooltip`

  return (
    <div className={`parameter-control${pinned ? ' is-pinned' : ''}`}>
      <label className="control-label" htmlFor={id}><span>{label}</span><output htmlFor={id}>{formatValue(value, step, unit)}</output></label>
      <div className="parameter-description-row">
        <span id={descriptionId}>{guidance.description}</span>
        <span className="parameter-help">
          <button id={`${id}-help`} type="button" data-parameter-help aria-label={`Explain ${label}`} aria-describedby={tooltipId} aria-expanded={pinned} aria-controls={pinned ? 'parameter-detail' : undefined} onClick={() => onToggleDetail(setting)}>?</button>
          <span id={tooltipId} className="parameter-tooltip" role="tooltip"><span>{guidance.summary[0]}</span><span>{guidance.summary[1]}</span></span>
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-describedby={descriptionId} style={{ '--range-progress': progress } as CSSProperties} onChange={(event) => onChange(setting, Number(event.target.value))} />
    </div>
  )
}

function ParameterDetail({ config, value, onClose }: { config: ParameterConfig; value: number; onClose: () => void }) {
  const guidance = PARAMETER_GUIDANCE[config.setting]
  return (
    <div id="parameter-detail" className="parameter-detail" role="region" aria-label={`${config.label} detailed explanation`}>
      <div className="parameter-detail-header">
        <div><strong>{config.label}</strong><span>{formatValue(value, config.step, config.unit)}</span></div>
        <button type="button" aria-label="Close parameter explanation" onClick={onClose}><X aria-hidden="true" /></button>
      </div>
      <div className="parameter-detail-copy">{guidance.detail}</div>
      <div className="parameter-references">
        {guidance.sources.map((source, index) => (
          <a key={source.url} href={source.url} target="_blank" rel="noreferrer" aria-label={`Open source ${index + 1}: ${source.title}`}><span>[{index + 1}] {source.title}</span><ExternalLink aria-hidden="true" /></a>
        ))}
      </div>
    </div>
  )
}

export function AcquisitionControls({ settings, phase, onSettingChange, onProjectionChange, onExpose }: { settings: XraySettings; phase: ExposurePhase; onSettingChange: (setting: NumericSetting, value: number) => void; onProjectionChange: (projection: Projection) => void; onExpose: () => void }) {
  const [pinnedSetting, setPinnedSetting] = useState<NumericSetting | null>(null)
  const busy = phase !== 'ready'
  const actionLabel = phase === 'charging' ? 'Charging…' : phase === 'emitting' ? 'Exposing…' : phase === 'captured' ? 'Captured' : 'Take X-ray'
  const projectionGeometry = getProjectionGeometry(settings.projection)
  const pinnedConfig = PARAMETER_CONFIGS.find((config) => config.setting === pinnedSetting)

  return (
    <section className="control-deck glass-panel" aria-labelledby="acquisition-controls-title">
      <header className="control-deck-header">
        <div className="control-heading"><Activity aria-hidden="true" /><div><h3 id="acquisition-controls-title">Acquisition controls</h3><p>Adjust geometry and exposure, then capture the detector image.</p></div></div>
        <button className="exposure-button" type="button" onClick={onExpose} disabled={busy}><Zap aria-hidden="true" /> {actionLabel}</button>
      </header>
      <div className="controls-body">
        <div className="projection-group">
          <div className="control-label"><span>Projection preset</span><output>{projectionGeometry.label}</output></div>
          <div className="segmented-control" aria-label="Projection preset">
            {(['AP', 'PA', 'Lateral'] as Projection[]).map((projection) => <button key={projection} type="button" aria-pressed={settings.projection === projection} onClick={() => onProjectionChange(projection)}>{getProjectionGeometry(projection).label}</button>)}
          </div>
          <ProjectionGlance projection={settings.projection} />
        </div>
        <div className="sliders-grid">
          {PARAMETER_CONFIGS.map((config) => (
            <ParameterSlider key={config.setting} {...config} value={settings[config.setting]} pinned={pinnedSetting === config.setting} onChange={onSettingChange} onToggleDetail={(setting) => setPinnedSetting((current) => current === setting ? null : setting)} />
          ))}
        </div>
      </div>
      {pinnedConfig && <ParameterDetail config={pinnedConfig} value={settings[pinnedConfig.setting]} onClose={() => setPinnedSetting(null)} />}
      <div className="science-strip"><Info aria-hidden="true" /><span><strong>Qualitative projection model.</strong> Technique values are educational reference examples; clinical protocols are equipment-, patient-, and institution-specific.</span></div>
    </section>
  )
}
