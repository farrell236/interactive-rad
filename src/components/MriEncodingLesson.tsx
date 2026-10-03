import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ExternalLink } from 'lucide-react'
import { mriVolumeSliceUrl } from '../lib/mriVolume'
import { ctRangeProgressStyle } from '../lib/rangeProgress'
import { MriSliceSelection3d } from './MriSliceSelection3d'

type EncodingStage = 'slice' | 'phase' | 'readout' | 'combine'

const stageContent: Record<EncodingStage, { label: string; short: string; title: string; copy: string }> = {
  slice: {
    label: '1. Select slice',
    short: 'Gz + RF',
    title: 'Gradient turns frequency into a slice address',
    copy: 'Gz makes resonance frequency vary through the volume. The RF pulse excites only a frequency band, so only its matching slab contributes signal.',
  },
  phase: {
    label: '2. Phase encode',
    short: 'Gy moment',
    title: 'A brief gradient leaves a position-dependent phase',
    copy: 'Gy is applied briefly and then switched off. Spins return to the same base frequency, but the phase accumulated at each y-position remains. The arrows retain those relative offsets while sharing the same background precession at f₀.',
  },
  readout: {
    label: '3. Read out',
    short: 'Gx + ADC',
    title: 'A gradient maps x-position to frequency during sampling',
    copy: 'While the receiver samples the echo, Gx makes columns precess at different frequencies. The arrows are shown in a frame rotating at f₀, so the center is stationary and the two sides rotate in opposite directions. The waveform is still their combined complex signal.',
  },
  combine: {
    label: '4. Combine',
    short: 'x + y',
    title: 'Frequency and phase jointly encode a two-dimensional location',
    copy: 'The crosshair traces one hypothetical signal contributor; that location is not measured by itself. In the rotating frame, its row retains the Gy phase offset while its column rotates at the Gx frequency offset. One readout samples a line of spatial frequencies, and other Gy moments supply the remaining lines.',
  },
}

const stages = Object.keys(stageContent) as EncodingStage[]
const gyRows = [-3, -2, -1, 0, 1, 2, 3]
const gxColumns = [-3, -2, -1, 0, 1, 2, 3]
const encodingGridSpacing = 35
const teachingFovMm = 240

function EncodingTimeline({ stage }: { stage: EncodingStage }) {
  const activeSegments = stage === 'slice'
    ? [[32, 91]]
    : stage === 'phase'
      ? [[102, 137]]
      : stage === 'readout'
        ? [[152, 252]]
        : [[102, 137], [152, 252]]
  return (
    <svg className="mri-encoding-timeline" viewBox="0 0 390 160" role="img" aria-label={`Simplified MRI encoding timeline highlighting ${stageContent[stage].label}`}>
      <title>Simplified encoding timeline</title>
      <desc>One simplified two-dimensional Cartesian example: RF and slice selection occur first, followed by a phase-encoding gradient and then frequency encoding while the signal is sampled.</desc>
      {activeSegments.map(([start, end]) => <rect key={start} className="mri-encoding-timeline-highlight" x={start} y="12" width={end - start} height="127" rx="4" />)}
      <g className="mri-encoding-timeline-grid">
        {[34, 59, 84, 109, 134].map((y) => <line key={y} x1="30" y1={y} x2="378" y2={y} />)}
        {[90, 140, 250].map((x) => <line key={x} x1={x} y1="16" x2={x} y2="139" />)}
      </g>
      <g className="mri-encoding-timeline-labels">
        <text x="4" y="29">RF</text><text x="4" y="54">Gz</text><text x="4" y="79">Gy</text><text x="4" y="104">Gx</text><text x="4" y="129">signal</text>
      </g>
      <path className="is-rf" d="M 30 34 L 43 34 L 50 18 L 57 34 L 90 34" />
      <path className="is-gradient" d="M 30 59 H 39 V 44 H 82 V 59 H 378" />
      <path className="is-gradient" d="M 30 84 H 103 V 68 H 136 V 84 H 378" />
      <path className="is-gradient" d="M 30 109 H 151 V 118 H 169 V 94 H 250 V 109 H 378" />
      <path className="is-signal" d="M 30 134 H 157 C 163 116, 170 151, 177 121 S 191 145, 198 124 S 212 142, 219 127 S 233 139, 250 132 H 378" />
      <g className="mri-encoding-timeline-notes">
        <text x="53" y="154" textAnchor="middle">select</text>
        <text x="120" y="154" textAnchor="middle">phase</text>
        <text x="204" y="154" textAnchor="middle">readout</text>
      </g>
    </svg>
  )
}

function DipoleArrowGlyph({ x, y }: { x: number; y: number }) {
  const length = 13
  const x2 = x + length
  return (
    <>
      <circle cx={x} cy={y} r="2.2" />
      <line x1={x} y1={y} x2={x2} y2={y} />
      <path d={`M ${x2} ${y} l -5 -4 M ${x2} ${y} l -5 4`} />
    </>
  )
}

function readoutSpinMotion(column: number, gradient: number) {
  const frequencyOffsetMagnitude = Math.abs(column) * gradient
  const duration = frequencyOffsetMagnitude === 0
    ? '3.00'
    : Math.min(12, 3.6 / (Math.abs(column) * (0.25 + 0.75 * gradient / 8))).toFixed(2)
  return { frequencyOffsetMagnitude, duration }
}

function PhaseSpinArrow({ x, y, row, phaseOffset, active = false }: { x: number; y: number; row: number; phaseOffset: number; active?: boolean }) {
  return (
    <g
      className={`mri-spin-arrow mri-phase-spin${active ? ' is-active' : ''}`}
      data-phase-row={row}
      style={{ transform: `rotate(${phaseOffset}deg)`, transformOrigin: `${x}px ${y}px` }}
    >
      <g className="mri-phase-spin-rotation" style={{ transformOrigin: `${x}px ${y}px` }}>
        <DipoleArrowGlyph x={x} y={y} />
      </g>
    </g>
  )
}

function ReadoutSpinArrow({ x, y, column, gradient, active = false }: { x: number; y: number; column: number; gradient: number; active?: boolean }) {
  const { frequencyOffsetMagnitude, duration } = readoutSpinMotion(column, gradient)
  const style = {
    animationDirection: column < 0 ? 'reverse' : 'normal',
    animationDuration: `${duration}s`,
    transformOrigin: `${x}px ${y}px`,
  } as CSSProperties
  return (
    <g
      className={`mri-spin-arrow mri-readout-spin${column === 0 ? ' is-reference' : ''}${frequencyOffsetMagnitude === 0 ? ' is-stationary' : ''}${active ? ' is-active' : ''}`}
      data-frequency-column={column}
      style={style}
    >
      <DipoleArrowGlyph x={x} y={y} />
    </g>
  )
}

function CombinedSpinArrow({ x, y, row, column, phaseStep, gradient, active = false }: { x: number; y: number; row: number; column: number; phaseStep: number; gradient: number; active?: boolean }) {
  const phaseOffset = row * phaseStep * 60
  const { frequencyOffsetMagnitude, duration } = readoutSpinMotion(column, gradient)
  const frequencyStyle = {
    animationDirection: column < 0 ? 'reverse' : 'normal',
    animationDuration: `${duration}s`,
    transformOrigin: `${x}px ${y}px`,
  } as CSSProperties
  return (
    <g
      className={`mri-spin-arrow mri-phase-spin mri-combined-spin${active ? ' is-active' : ''}`}
      data-phase-row={row}
      data-frequency-column={column}
      style={{ transform: `rotate(${phaseOffset}deg)`, transformOrigin: `${x}px ${y}px` }}
    >
      <g className={`mri-combined-frequency-spin${frequencyOffsetMagnitude === 0 ? ' is-stationary' : ''}`} style={frequencyStyle}>
        <DipoleArrowGlyph x={x} y={y} />
      </g>
    </g>
  )
}

function EncodedSliceVisual({ stage, phaseStep, readoutGradient, probeX, probeY, slicePosition }: { stage: EncodingStage; phaseStep: number; readoutGradient: number; probeX: number; probeY: number; slicePosition: number }) {
  const probeSvgX = 150 + probeX / 120 * 105
  const probeSvgY = 150 - probeY / 120 * 105
  const edgeFrequencyKhz = (42.58 * readoutGradient * 120 / 1000).toFixed(1)
  return (
    <div className={`mri-encoded-slice is-${stage}`} role="img" aria-label={`${stageContent[stage].label} overlay on an axial T2-weighted brain template at z ${slicePosition} millimeters`}>
      <img src={mriVolumeSliceUrl(slicePosition)} alt="" aria-hidden="true" />
      <svg viewBox="0 0 300 300" aria-hidden="true">
        {(stage === 'phase' || stage === 'combine') && (
          <g className="mri-phase-overlay">
            {stage === 'phase' && <line className="mri-phase-active-row" x1="36" y1={150 - Math.round(probeY / 40) * encodingGridSpacing} x2="264" y2={150 - Math.round(probeY / 40) * encodingGridSpacing} />}
            {stage === 'phase' && gyRows.map((row) => {
              const y = 150 - row * encodingGridSpacing
              const phaseOffset = row * phaseStep * 60
              const active = row === Math.round(probeY / 40)
              return gxColumns.map((column) => <PhaseSpinArrow key={`${column}-${row}`} x={150 + column * encodingGridSpacing} y={y} row={row} phaseOffset={phaseOffset} active={active} />)
            })}
            <path d="M 40 45 H 260 M 40 80 H 260 M 40 115 H 260 M 40 150 H 260 M 40 185 H 260 M 40 220 H 260 M 40 255 H 260" />
          </g>
        )}
        {(stage === 'readout' || stage === 'combine') && (
          <g className="mri-frequency-overlay">
            {gxColumns.map((column) => <line key={column} x1={150 + column * encodingGridSpacing} y1="40" x2={150 + column * encodingGridSpacing} y2="260" />)}
            {stage === 'readout' && gxColumns.flatMap((column) => gyRows.map((row) => (
              <ReadoutSpinArrow
                key={`${column}-${row}`}
                x={150 + column * encodingGridSpacing}
                y={150 - row * encodingGridSpacing}
                column={column}
                gradient={readoutGradient}
                active={column === Math.round(probeX / 40)}
              />
            )))}
            <text x="49" y="282">−{edgeFrequencyKhz} kHz</text><text x="150" y="282" textAnchor="middle">f₀</text><text x="251" y="282" textAnchor="end">+{edgeFrequencyKhz} kHz</text>
          </g>
        )}
        {stage === 'combine' && (
          <g className="mri-combined-spin-overlay">
            {gxColumns.flatMap((column) => gyRows.map((row) => (
              <CombinedSpinArrow
                key={`${column}-${row}`}
                x={150 + column * encodingGridSpacing}
                y={150 - row * encodingGridSpacing}
                row={row}
                column={column}
                phaseStep={phaseStep}
                gradient={readoutGradient}
                active={column === Math.round(probeX / 40) && row === Math.round(probeY / 40)}
              />
            )))}
          </g>
        )}
        {stage === 'combine' && (
          <g className="mri-encoding-probe">
            <line x1={probeSvgX} y1="35" x2={probeSvgX} y2="265" />
            <line x1="35" y1={probeSvgY} x2="265" y2={probeSvgY} />
            <circle cx={probeSvgX} cy={probeSvgY} r="7" />
          </g>
        )}
      </svg>
    </div>
  )
}

function SliceMeasurement({ thicknessMm, rfBandwidth, sliceGradient, slicePosition }: { thicknessMm: number; rfBandwidth: number; sliceGradient: number; slicePosition: number }) {
  const centerFrequencyOffset = Math.round(42.58 * sliceGradient * slicePosition)
  const plotLeft = 29
  const plotRight = 228
  const plotTop = 16
  const plotBottom = 104
  const frequencyMin = -60000
  const frequencyMax = 90000
  const mapPosition = (positionMm: number) => plotLeft + (positionMm + 60) / 150 * (plotRight - plotLeft)
  const mapFrequency = (frequencyHz: number) => plotTop + (frequencyMax - frequencyHz) / (frequencyMax - frequencyMin) * (plotBottom - plotTop)
  const selectedX = mapPosition(slicePosition)
  const selectedY = mapFrequency(centerFrequencyOffset)
  const bandHeight = 6 + (rfBandwidth - 400) / 1600 * 6
  const gradientStartY = mapFrequency(42.58 * sliceGradient * -60)
  const gradientEndY = mapFrequency(42.58 * sliceGradient * 90)
  return (
    <div className="mri-encoding-measurement is-slice">
      <svg className="mri-slice-frequency-map" viewBox="0 0 250 124" role="img" aria-label={`RF passband centered on z ${slicePosition} millimeters along the slice-selection frequency gradient`}>
        <title>Slice position from RF center frequency</title>
        <desc>The slice-selection gradient maps position to resonance frequency. Moving the RF passband moves its intersection with the gradient and therefore the selected slice.</desc>
        <g className="is-axis"><line x1={plotLeft} y1={plotTop} x2={plotLeft} y2={plotBottom} /><line x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} /></g>
        <rect className="is-rf-passband" x={plotLeft} y={selectedY - bandHeight / 2} width={plotRight - plotLeft} height={bandHeight} rx="2" />
        <line className="is-rf-center" x1={plotLeft} y1={selectedY} x2={plotRight} y2={selectedY} />
        <line className="is-gradient-line" x1={plotLeft} y1={gradientStartY} x2={plotRight} y2={gradientEndY} />
        <line className="is-position-guide" x1={selectedX} y1={selectedY} x2={selectedX} y2={plotBottom} />
        <circle className="is-selected-position" cx={selectedX} cy={selectedY} r="4" />
        <text className="is-rf-label" x={plotRight - 2} y={Math.max(plotTop + 8, selectedY - bandHeight / 2 - 4)} textAnchor="end">RF passband</text>
        <text className="is-y-label" x="10" y="63" textAnchor="middle" transform="rotate(-90 10 63)">frequency offset Δf</text>
        <text className="is-x-label" x={plotRight} y="119" textAnchor="end">position z</text>
        <text className="is-z-label" x={Math.min(plotRight - 5, Math.max(plotLeft + 5, selectedX))} y={plotBottom - 5} textAnchor={slicePosition > 70 ? 'end' : slicePosition < -40 ? 'start' : 'middle'}>z₀</text>
      </svg>
      <dl><div><dt>Slice center</dt><dd>z = {slicePosition} mm</dd></div><div><dt>RF center offset</dt><dd>{centerFrequencyOffset >= 0 ? '+' : ''}{centerFrequencyOffset} Hz</dd></div><div><dt>RF bandwidth</dt><dd>{rfBandwidth} Hz</dd></div></dl>
      <output><small>Selected thickness</small><strong>{thicknessMm.toFixed(1)} mm</strong></output>
      <p>Δz = BW<sub>RF</sub> / (γ̄Gz)</p>
    </div>
  )
}

function PhaseMeasurement({ phaseStep, probeY }: { phaseStep: number; probeY: number }) {
  const phaseDegrees = Math.round((360 * phaseStep * probeY / teachingFovMm) % 360)
  const displayDegrees = phaseDegrees < 0 ? phaseDegrees + 360 : phaseDegrees
  const kyPerMeter = phaseStep / (teachingFovMm / 1000)
  const radians = displayDegrees * Math.PI / 180
  const x2 = 70 + Math.cos(radians) * 43
  const y2 = 70 - Math.sin(radians) * 43
  return (
    <div className="mri-encoding-measurement is-phase">
      <svg className="mri-phase-dial" viewBox="0 0 140 140" role="img" aria-label={`Phase at the selected y position is ${displayDegrees} degrees`}>
        <circle cx="70" cy="70" r="49" />
        <line x1="70" y1="70" x2={x2} y2={y2} />
        <circle cx="70" cy="70" r="4" />
        <text x="70" y="12" textAnchor="middle">phase after Gy</text>
        <text x="70" y="132" textAnchor="middle">{displayDegrees}° at y = {probeY} mm</text>
      </svg>
      <output><small>Selected phase-line index</small><strong>nᵧ = {phaseStep}</strong><em>kᵧ = {kyPerMeter >= 0 ? '+' : ''}{kyPerMeter.toFixed(2)} m⁻¹</em></output>
      <div className="mri-phase-equation-bridge">
        <p>kᵧ = γ̄∫Gᵧ(t)dt = nᵧ / FOVᵧ</p>
        <p>φ(y) = 2πkᵧy</p>
        <small>Teaching FOVᵧ = {teachingFovMm} mm</small>
      </div>
    </div>
  )
}

function ReadoutMeasurement({ readoutGradient, probeX }: { readoutGradient: number; probeX: number }) {
  const frequency = Math.round(42.58 * readoutGradient * probeX)
  const edgeFrequency = Math.round(42.58 * readoutGradient * 120)
  const maximumEdgeFrequency = 42.58 * 8 * 120
  const samplePositions = [-120, -80, -40, 0, 40, 80, 120]
  const spectrumX = (positionMm: number) => 130 + 42.58 * readoutGradient * positionMm / maximumEdgeFrequency * 100
  return (
    <div className="mri-encoding-measurement is-readout">
      <svg className="mri-readout-spectrum" viewBox="0 0 250 132" role="img" aria-label={`Frequency-position map at Gx ${readoutGradient.toFixed(1)} millitesla per meter; edge positions are offset by minus and plus ${edgeFrequency} hertz on a fixed 41 kilohertz display scale`}>
        <title>Readout gradient frequency-position mapping</title>
        <desc>Each marker represents a fixed x-position. Increasing the readout gradient spreads their frequency offsets apart on a fixed frequency scale; these are not separate detector measurements.</desc>
        <g className="mri-readout-spectrum-grid"><line x1="25" y1="103" x2="235" y2="103" /><line x1="130" y1="18" x2="130" y2="108" /></g>
        {samplePositions.map((positionMm, index) => {
          const x = spectrumX(positionMm)
          const columnIndex = index - 3
          return <g key={positionMm} className={`mri-readout-frequency-marker${columnIndex === Math.round(probeX / 40) ? ' is-active' : ''}`}>
            <line x1={x} y1="103" x2={x} y2="45" />
            <circle cx={x} cy="45" r="4" />
          </g>
        })}
        <text className="is-map-label" x="130" y="13" textAnchor="middle">position samples → frequency offsets</text>
        <text x="25" y="124">−41 kHz</text><text x="130" y="124" textAnchor="middle">0</text><text x="235" y="124" textAnchor="end">+41 kHz</text>
      </svg>
      <output><small>Probe frequency offset</small><strong>{frequency >= 0 ? '+' : ''}{frequency} Hz</strong></output>
      <p>Δf(x) = γ̄Gₓx</p>
    </div>
  )
}

function CombinedMeasurement({ phaseStep, readoutGradient, probeX, probeY }: { phaseStep: number; readoutGradient: number; probeX: number; probeY: number }) {
  const frequency = Math.round(42.58 * readoutGradient * probeX)
  return (
    <div className="mri-encoding-measurement is-combine">
      <div className="mri-encoding-coordinate-readout">
        <span><small>x-position</small><strong>{probeX} mm</strong><em>{frequency >= 0 ? '+' : ''}{frequency} Hz during readout</em></span>
        <span><small>y-position</small><strong>{probeY} mm</strong><em>phase depends on line nᵧ = {phaseStep}</em></span>
      </div>
      <div className="mri-encoding-kspace-line" data-sampled-row={5 - phaseStep} role="img" aria-label={`One k-space readout along k x at phase-encoding line index n y equals ${phaseStep}`}>
        {Array.from({ length: 11 }, (_, y) => Array.from({ length: 11 }, (_, x) => <i key={`${x}-${y}`} className={y === 5 - phaseStep ? 'is-sampled' : ''} />))}
      </div>
      <p>The crosshair traces one hypothetical contributor; the receiver still samples the whole slice. One echo samples a kₓ line, and other nᵧ steps fill different kᵧ lines in the 2D measurement grid.</p>
    </div>
  )
}

function EncodingControls({ stage, sliceGradient, rfBandwidth, slicePosition, phaseStep, readoutGradient, probeX, probeY, onSliceGradient, onRfBandwidth, onSlicePosition, onPhaseStep, onReadoutGradient, onProbeX, onProbeY }: {
  stage: EncodingStage
  sliceGradient: number
  rfBandwidth: number
  slicePosition: number
  phaseStep: number
  readoutGradient: number
  probeX: number
  probeY: number
  onSliceGradient: (value: number) => void
  onRfBandwidth: (value: number) => void
  onSlicePosition: (value: number) => void
  onPhaseStep: (value: number) => void
  onReadoutGradient: (value: number) => void
  onProbeX: (value: number) => void
  onProbeY: (value: number) => void
}) {
  if (stage === 'slice') return (
    <div className="mri-encoding-controls is-three">
      <label><span><strong>Slice center · z₀</strong><output>{slicePosition} mm</output></span><input aria-label="Slice center position" type="range" min="-60" max="90" step="5" value={slicePosition} style={ctRangeProgressStyle(slicePosition, -60, 90)} onChange={(event) => onSlicePosition(Number(event.target.value))} /><small>Changes the RF center frequency to move the slab without changing thickness.</small></label>
      <label><span><strong>Slice gradient · Gz</strong><output>{sliceGradient.toFixed(1)} mT/m</output></span><input aria-label="Slice selection gradient strength" type="range" min="4" max="20" step="0.5" value={sliceGradient} style={ctRangeProgressStyle(sliceGradient, 4, 20)} onChange={(event) => onSliceGradient(Number(event.target.value))} /><small>Stronger gradient maps the RF band onto a thinner slab.</small></label>
      <label><span><strong>RF bandwidth</strong><output>{rfBandwidth} Hz</output></span><input aria-label="RF excitation bandwidth" type="range" min="400" max="2000" step="50" value={rfBandwidth} style={ctRangeProgressStyle(rfBandwidth, 400, 2000)} onChange={(event) => onRfBandwidth(Number(event.target.value))} /><small>Wider bandwidth excites a thicker frequency—and position—range.</small></label>
    </div>
  )
  if (stage === 'phase') return (
    <div className="mri-encoding-controls is-two">
      <label><span><strong>Phase-encode line · nᵧ</strong><output>{phaseStep}</output></span><input aria-label="Phase encode line index" type="range" min="-5" max="5" step="1" value={phaseStep} style={ctRangeProgressStyle(phaseStep, -5, 5)} onChange={(event) => onPhaseStep(Number(event.target.value))} /><small>Each repetition uses a different Gy moment. Within the 240 mm teaching FOV, index nᵧ corresponds to one physical kᵧ coordinate.</small></label>
      <label><span><strong>Inspect y-position</strong><output>{probeY} mm</output></span><input aria-label="Phase encoding y position" type="range" min="-120" max="120" step="40" value={probeY} style={ctRangeProgressStyle(probeY, -120, 120)} onChange={(event) => onProbeY(Number(event.target.value))} /><small>Phase changes with position for the same gradient moment.</small></label>
    </div>
  )
  if (stage === 'readout') return (
    <div className="mri-encoding-controls is-two">
      <label><span><strong>Readout gradient · Gx</strong><output>{readoutGradient.toFixed(1)} mT/m</output></span><input aria-label="Readout gradient strength" type="range" min="0" max="8" step="0.5" value={readoutGradient} style={ctRangeProgressStyle(readoutGradient, 0, 8)} onChange={(event) => onReadoutGradient(Number(event.target.value))} /><small>At zero there is no frequency offset; increasing Gx separates the column rates.</small></label>
      <label><span><strong>Inspect x-position</strong><output>{probeX} mm</output></span><input aria-label="Readout x position" type="range" min="-120" max="120" step="40" value={probeX} style={ctRangeProgressStyle(probeX, -120, 120)} onChange={(event) => onProbeX(Number(event.target.value))} /><small>The center remains near f₀; opposite sides shift in opposite directions.</small></label>
    </div>
  )
  return (
    <div className="mri-encoding-controls is-four">
      <label><span><strong>Phase-encode line · nᵧ</strong><output>{phaseStep}</output></span><input aria-label="Phase encode line index" type="range" min="-5" max="5" step="1" value={phaseStep} style={ctRangeProgressStyle(phaseStep, -5, 5)} onChange={(event) => onPhaseStep(Number(event.target.value))} /><small>Linked to Phase encode; line index nᵧ corresponds to one physical kᵧ coordinate.</small></label>
      <label><span><strong>Readout gradient · Gx</strong><output>{readoutGradient.toFixed(1)} mT/m</output></span><input aria-label="Readout gradient strength" type="range" min="0" max="8" step="0.5" value={readoutGradient} style={ctRangeProgressStyle(readoutGradient, 0, 8)} onChange={(event) => onReadoutGradient(Number(event.target.value))} /><small>Linked to the Read out tab; sets the column-dependent rotation rate.</small></label>
      <label><span><strong>Trace x-position</strong><output>{probeX} mm</output></span><input aria-label="Combined encoding x position" type="range" min="-120" max="120" step="40" value={probeX} style={ctRangeProgressStyle(probeX, -120, 120)} onChange={(event) => onProbeX(Number(event.target.value))} /><small>Hypothetical contribution encoded as frequency during readout.</small></label>
      <label><span><strong>Trace y-position</strong><output>{probeY} mm</output></span><input aria-label="Combined encoding y position" type="range" min="-120" max="120" step="40" value={probeY} style={ctRangeProgressStyle(probeY, -120, 120)} onChange={(event) => onProbeY(Number(event.target.value))} /><small>Hypothetical contribution encoded as phase by the selected Gy moment.</small></label>
    </div>
  )
}

export function MriEncodingLesson() {
  const [stage, setStage] = useState<EncodingStage>('slice')
  const [sliceGradient, setSliceGradient] = useState(12)
  const [rfBandwidth, setRfBandwidth] = useState(1200)
  const [slicePosition, setSlicePosition] = useState(0)
  const [phaseStep, setPhaseStep] = useState(2)
  const [readoutGradient, setReadoutGradient] = useState(4)
  const [probeX, setProbeX] = useState(40)
  const [probeY, setProbeY] = useState(40)
  const sliceThickness = useMemo(() => rfBandwidth / (42.58 * sliceGradient), [rfBandwidth, sliceGradient])
  const content = stageContent[stage]
  const stageTabs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedStageIndex = stages.indexOf(stage)

  const selectStageFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % stages.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + stages.length) % stages.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = stages.length - 1
    else return
    event.preventDefault()
    setStage(stages[nextIndex])
    stageTabs.current[nextIndex]?.focus()
  }

  return (
    <div className="mri-encoding-references">
      <section className="mri-encoding-lab" aria-labelledby="mri-encoding-lab-title">
        <header>
          <div><span>Interactive encoding laboratory</span><h4 id="mri-encoding-lab-title">Trace one selected slice into spatial measurements</h4><p>The same anatomy remains visible while a simplified 2D Cartesian sequence isolates one job of the gradients at a time.</p></div>
          <div className="mri-encoding-stage-tabs" role="tablist" aria-label="MRI spatial encoding stage">
            {stages.map((item, index) => <button key={item} ref={(element) => { stageTabs.current[index] = element }} id={`mri-encoding-tab-${item}`} type="button" role="tab" aria-controls="mri-encoding-stage-panel" aria-selected={stage === item} tabIndex={selectedStageIndex === index ? 0 : -1} onKeyDown={(event) => selectStageFromKeyboard(event, index)} onClick={() => setStage(item)}><small>{stageContent[item].short}</small><strong>{stageContent[item].label}</strong></button>)}
          </div>
        </header>
        <div id="mri-encoding-stage-panel" className="mri-encoding-stage" role="tabpanel" aria-labelledby={`mri-encoding-tab-${stage}`}>
          <figure className="mri-encoding-sequence"><figcaption><strong>Applied fields</strong><span>time →</span></figcaption><EncodingTimeline stage={stage} /></figure>
          <figure className="mri-encoding-anatomy">
            <figcaption><strong>{stage === 'slice' ? 'Volume and selected slab' : 'Selected axial slice'}</strong><span>{stage === 'phase' ? 'relative phase + common f₀' : stage === 'readout' || stage === 'combine' ? 'rotating frame · relative to f₀' : content.short}</span></figcaption>
            {stage === 'slice' ? <MriSliceSelection3d thicknessMm={sliceThickness} slicePositionMm={slicePosition} /> : <EncodedSliceVisual stage={stage} phaseStep={phaseStep} readoutGradient={readoutGradient} probeX={probeX} probeY={probeY} slicePosition={slicePosition} />}
          </figure>
          <section className="mri-encoding-result" aria-label="Measured encoding consequence"><header><strong>Measured consequence</strong><span>not a detector pixel</span></header>
            {stage === 'slice' && <SliceMeasurement thicknessMm={sliceThickness} rfBandwidth={rfBandwidth} sliceGradient={sliceGradient} slicePosition={slicePosition} />}
            {stage === 'phase' && <PhaseMeasurement phaseStep={phaseStep} probeY={probeY} />}
            {stage === 'readout' && <ReadoutMeasurement readoutGradient={readoutGradient} probeX={probeX} />}
            {stage === 'combine' && <CombinedMeasurement phaseStep={phaseStep} readoutGradient={readoutGradient} probeX={probeX} probeY={probeY} />}
          </section>
        </div>
        <EncodingControls stage={stage} sliceGradient={sliceGradient} rfBandwidth={rfBandwidth} slicePosition={slicePosition} phaseStep={phaseStep} readoutGradient={readoutGradient} probeX={probeX} probeY={probeY} onSliceGradient={setSliceGradient} onRfBandwidth={setRfBandwidth} onSlicePosition={setSlicePosition} onPhaseStep={setPhaseStep} onReadoutGradient={setReadoutGradient} onProbeX={setProbeX} onProbeY={setProbeY} />
        <footer className="mri-encoding-stage-copy" aria-live="polite"><strong>{content.title}</strong><p>{content.copy}</p></footer>
        <div className="mri-encoding-source"><span>Simplified 2D Cartesian encoding · γ̄ for hydrogen = 42.58 MHz/T · schematic fields</span><a href="https://doi.org/10.5281/zenodo.5018356" target="_blank" rel="noreferrer">CIE template: Dadar et al. · CC BY 4.0 <ExternalLink aria-hidden="true" /></a></div>
      </section>

      <section className="mri-encoding-reference" aria-labelledby="mri-encoding-reference-title">
        <header><span>Encoding reference</span><h4 id="mri-encoding-reference-title">Three gradient jobs, one coordinate system</h4><p>“Slice,” “phase,” and “readout” describe roles in a particular acquisition. The physical x, y, and z gradient coils can be combined to orient those roles relative to the patient.</p></header>
        <div className="mri-encoding-reference-grid">
          <article><span>Slice selection</span><strong>frequency band → plane</strong><p>Gradient and RF act together. Bandwidth and gradient strength determine slice thickness.</p></article>
          <article><span>Phase encoding</span><strong>gradient moment → phase</strong><p>A brief gradient leaves a phase pattern. The sequence repeats with several moments.</p></article>
          <article><span>Frequency encoding</span><strong>frequency during ADC → position</strong><p>The readout gradient stays on while the receiver samples the mixed complex waveform.</p></article>
        </div>
        <aside><strong>2D versus 3D</strong><p>A 2D acquisition excites and reconstructs selected slices. A 3D acquisition instead excites a slab or volume, then adds phase encoding through the third direction before reconstructing its slices.</p></aside>
        <aside><strong>ML implication</strong><p>Array row and column are not universal anatomical directions. Preserve the affine or DICOM orientation, phase-encoding direction, voxel spacing, and slice order before resampling or augmentation.</p></aside>
      </section>
    </div>
  )
}
