export type SequenceTimingKind = 'spinEcho' | 'fastSpinEcho' | 'gradientEcho' | 'inversion' | 'epi' | 'diffusion'
export type TimingLaneKey = 'rf' | 'slice' | 'phase' | 'readout' | 'diffusion' | 'adc' | 'signal'
export type TimingEventShape = 'sinc' | 'trapezoid' | 'gate' | 'echo'

export interface TimingEvent {
  shape: TimingEventShape
  startMs: number
  endMs: number
  amplitude: number
  label?: string
  rampMs?: number
  cycles?: number
}

export interface TimingLane {
  key: TimingLaneKey
  label: string
  events: TimingEvent[]
}

export interface TimingBracket {
  startMs: number
  endMs: number
  label: string
  level?: number
}

export interface TimingMarker {
  timeMs: number
  label: string
  kind: 'echo' | 'excitation' | 'refocus' | 'inversion'
}

export interface SequenceTimingDefinition {
  durationMs: number
  tickMs: number
  lanes: TimingLane[]
  brackets: TimingBracket[]
  markers: TimingMarker[]
  readoutWindows: Array<{ startMs: number; endMs: number }>
  timingSummary: string
}

const sincPulse = (centerMs: number, widthMs: number, amplitude: number, label: string): TimingEvent => ({
  shape: 'sinc', startMs: centerMs - widthMs / 2, endMs: centerMs + widthMs / 2, amplitude, label,
})

const trapezoid = (startMs: number, endMs: number, amplitude: number, rampMs = 1.5, label?: string): TimingEvent => ({
  shape: 'trapezoid', startMs, endMs, amplitude, rampMs, label,
})

const gate = (startMs: number, endMs: number): TimingEvent => ({ shape: 'gate', startMs, endMs, amplitude: 0.8 })
const echo = (centerMs: number, widthMs: number, cycles = 9, amplitude = 0.9): TimingEvent => ({
  shape: 'echo', startMs: centerMs - widthMs / 2, endMs: centerMs + widthMs / 2, amplitude, cycles,
})

const spinEcho: SequenceTimingDefinition = {
  durationMs: 125,
  tickMs: 25,
  lanes: [
    { key: 'rf', label: 'RF', events: [sincPulse(4, 6, 1, '90°'), sincPulse(52, 7, 1.15, '180°')] },
    { key: 'slice', label: 'Gslice', events: [trapezoid(1, 7, 0.9), trapezoid(7, 13, -0.45), trapezoid(46, 49, 0.6), trapezoid(49, 55, 0.9), trapezoid(55, 58, 0.6)] },
    { key: 'phase', label: 'Gphase', events: [trapezoid(64, 76, 0.62)] },
    { key: 'readout', label: 'Gread', events: [trapezoid(63.25, 80, -0.8), trapezoid(84, 116, 0.8)] },
    { key: 'adc', label: 'Acquire', events: [gate(84, 116)] },
    { key: 'signal', label: 'Signal', events: [echo(100, 32)] },
  ],
  brackets: [{ startMs: 4, endMs: 100, label: 'TE = 96 ms' }],
  markers: [
    { timeMs: 4, label: '90° excitation', kind: 'excitation' },
    { timeMs: 52, label: '180° refocus', kind: 'refocus' },
    { timeMs: 100, label: 'echo / k-space center', kind: 'echo' },
  ],
  readoutWindows: [{ startMs: 84, endMs: 116 }],
  timingSummary: 'Illustrative single-line spin echo: the 180° pulse is halfway from excitation to the echo; receiver sampling is symmetric around TE.',
}

const fastSpinEcho: SequenceTimingDefinition = {
  durationMs: 140,
  tickMs: 20,
  lanes: [
    { key: 'rf', label: 'RF', events: [sincPulse(4, 6, 1, '90°'), sincPulse(20, 6, 1.1, '180°'), sincPulse(48, 6, 1.1, '180°'), sincPulse(76, 6, 1.1, '180°'), sincPulse(104, 6, 1.1, '180°')] },
    { key: 'slice', label: 'Gslice', events: [trapezoid(1, 7, 0.9), trapezoid(7, 12, -0.45), trapezoid(17, 23, 0.78), trapezoid(45, 51, 0.78), trapezoid(73, 79, 0.78), trapezoid(101, 107, 0.78)] },
    { key: 'phase', label: 'Gphase', events: [trapezoid(26, 30, -0.72), trapezoid(42, 46, 0.72), trapezoid(54, 58, -0.28), trapezoid(70, 74, 0.28), trapezoid(110, 114, 0.62), trapezoid(126, 130, -0.62)] },
    { key: 'readout', label: 'Gread', events: [trapezoid(23, 30, -0.8), trapezoid(30, 42, 0.8), trapezoid(51, 58, -0.8), trapezoid(58, 70, 0.8), trapezoid(79, 86, -0.8), trapezoid(86, 98, 0.8), trapezoid(107, 114, -0.8), trapezoid(114, 126, 0.8)] },
    { key: 'adc', label: 'Acquire', events: [gate(31, 41), gate(59, 69), gate(87, 97), gate(115, 125)] },
    { key: 'signal', label: 'Signal', events: [echo(36, 12, 7, 0.92), echo(64, 12, 7, 0.82), echo(92, 12, 7, 0.72), echo(120, 12, 7, 0.64)] },
  ],
  brackets: [{ startMs: 4, endMs: 92, label: 'effective TE = 88 ms' }, { startMs: 36, endMs: 64, label: 'echo spacing = 28 ms', level: 1 }],
  markers: [
    { timeMs: 4, label: '90° excitation', kind: 'excitation' },
    { timeMs: 20, label: 'first refocus', kind: 'refocus' },
    { timeMs: 92, label: 'effective TE / k-space center', kind: 'echo' },
  ],
  readoutWindows: [{ startMs: 31, endMs: 41 }, { startMs: 59, endMs: 69 }, { startMs: 87, endMs: 97 }, { startMs: 115, endMs: 125 }],
  timingSummary: 'Illustrative four-echo FSE/TSE train: each refocused echo samples a different ky line; the echo assigned to k-space center defines effective TE and strongly influences contrast.',
}

const gradientEcho: SequenceTimingDefinition = {
  durationMs: 65,
  tickMs: 10,
  lanes: [
    { key: 'rf', label: 'RF', events: [sincPulse(4, 6, 0.72, 'α'), sincPulse(60, 6, 0.72, 'next α')] },
    { key: 'slice', label: 'Gslice', events: [trapezoid(1, 7, 0.9), trapezoid(7, 12, -0.45), trapezoid(42, 52, 1.05, 1.5, 'spoiler')] },
    { key: 'phase', label: 'Gphase', events: [trapezoid(14, 20, 0.62)] },
    { key: 'readout', label: 'Gread', events: [trapezoid(13.25, 22, -0.8), trapezoid(22, 38, 0.8)] },
    { key: 'adc', label: 'Acquire', events: [gate(22, 38)] },
    { key: 'signal', label: 'Signal', events: [echo(30, 16, 7)] },
  ],
  brackets: [{ startMs: 4, endMs: 30, label: 'TE = 26 ms' }, { startMs: 4, endMs: 60, label: 'TR = 56 ms', level: 1 }],
  markers: [
    { timeMs: 4, label: 'α excitation', kind: 'excitation' },
    { timeMs: 30, label: 'gradient echo', kind: 'echo' },
  ],
  readoutWindows: [{ startMs: 22, endMs: 38 }],
  timingSummary: 'Illustrative gradient-spoiled gradient echo: a negative readout prephaser is rewound by the positive readout lobe, then a spoiler gradient dephases residual transverse magnetization before the next excitation. No 180° RF pulse removes static off-resonance.',
}

const inversion: SequenceTimingDefinition = {
  durationMs: 290,
  tickMs: 50,
  lanes: [
    { key: 'rf', label: 'RF', events: [sincPulse(5, 8, 1.15, '180° inversion'), sincPulse(165, 7, 1, '90°'), sincPulse(215, 8, 1.15, '180°')] },
    { key: 'slice', label: 'Gslice', events: [trapezoid(161, 169, 0.9), trapezoid(169, 180, -0.4), trapezoid(209, 212, 0.55), trapezoid(212, 219, 0.9), trapezoid(219, 222, 0.55)] },
    { key: 'phase', label: 'Gphase', events: [trapezoid(228, 242, 0.62)] },
    { key: 'readout', label: 'Gread', events: [trapezoid(228.25, 245, -0.8), trapezoid(249, 281, 0.8)] },
    { key: 'adc', label: 'Acquire', events: [gate(249, 281)] },
    { key: 'signal', label: 'Signal', events: [echo(265, 32)] },
  ],
  brackets: [{ startMs: 5, endMs: 165, label: 'TI = 160 ms' }, { startMs: 165, endMs: 265, label: 'TE = 100 ms', level: 1 }],
  markers: [
    { timeMs: 5, label: 'inversion', kind: 'inversion' },
    { timeMs: 165, label: 'excitation', kind: 'excitation' },
    { timeMs: 215, label: 'refocus', kind: 'refocus' },
    { timeMs: 265, label: 'echo', kind: 'echo' },
  ],
  readoutWindows: [{ startMs: 249, endMs: 281 }],
  timingSummary: 'Illustrative inversion-prepared spin echo: TI runs from inversion to excitation and TE ends at the sampled echo. The TI needed to null a tissue depends on tissue recovery, field strength, and readout.',
}

const epiLineCount = 9
const epiEchoSpacingMs = 0.8
const epiCenterMs = 56
const epiLineCenter = (index: number) => epiCenterMs + (index - Math.floor(epiLineCount / 2)) * epiEchoSpacingMs
const epiReadouts = Array.from({ length: epiLineCount }, (_, index) => {
  const centerMs = epiLineCenter(index)
  return trapezoid(centerMs - 0.32, centerMs + 0.32, index % 2 === 0 ? 0.92 : -0.92, 0.08)
})
const epiBlips = Array.from({ length: epiLineCount - 1 }, (_, index) => {
  const centerMs = (epiLineCenter(index) + epiLineCenter(index + 1)) / 2
  return trapezoid(centerMs - 0.06, centerMs + 0.06, 0.58, 0.025)
})
const epiGates = Array.from({ length: epiLineCount }, (_, index) => {
  const centerMs = epiLineCenter(index)
  return gate(centerMs - 0.27, centerMs + 0.27)
})

const epi: SequenceTimingDefinition = {
  durationMs: 68,
  tickMs: 10,
  lanes: [
    { key: 'rf', label: 'RF', events: [sincPulse(4, 6, 1, '90°')] },
    { key: 'slice', label: 'Gslice', events: [trapezoid(1, 7, 0.9), trapezoid(7, 13, -0.45)] },
    { key: 'phase', label: 'Gphase', events: [trapezoid(46, 51.5, -0.78), ...epiBlips] },
    { key: 'readout', label: 'Gread', events: [trapezoid(46, 51.5, -0.78), ...epiReadouts] },
    { key: 'adc', label: 'Acquire', events: epiGates },
    { key: 'signal', label: 'Signal', events: [echo(56, 12, 15)] },
  ],
  brackets: [{ startMs: 4, endMs: 56, label: 'TE = 52 ms' }],
  markers: [
    { timeMs: 4, label: 'excitation', kind: 'excitation' },
    { timeMs: 56, label: 'k-space center', kind: 'echo' },
  ],
  readoutWindows: epiGates.map((event) => ({ startMs: event.startMs, endMs: event.endMs })),
  timingSummary: 'Illustrative reduced-matrix single-shot gradient-echo EPI: nine lines are shown at 0.8 ms echo spacing. Alternating Gread lobes traverse kx while Gphase blips step through ky; TE marks the k-space-center echo.',
}

const diffusionLineCount = 9
const diffusionEchoSpacingMs = 0.8
const diffusionCenterMs = 120
const diffusionLineCenter = (index: number) => diffusionCenterMs + (index - Math.floor(diffusionLineCount / 2)) * diffusionEchoSpacingMs
const diffusionReadouts = Array.from({ length: diffusionLineCount }, (_, index) => {
  const centerMs = diffusionLineCenter(index)
  return trapezoid(centerMs - 0.32, centerMs + 0.32, index % 2 === 0 ? 0.92 : -0.92, 0.08)
})
const diffusionBlips = Array.from({ length: diffusionLineCount - 1 }, (_, index) => {
  const centerMs = (diffusionLineCenter(index) + diffusionLineCenter(index + 1)) / 2
  return trapezoid(centerMs - 0.06, centerMs + 0.06, 0.58, 0.025)
})
const diffusionGates = Array.from({ length: diffusionLineCount }, (_, index) => {
  const centerMs = diffusionLineCenter(index)
  return gate(centerMs - 0.27, centerMs + 0.27)
})

const diffusion: SequenceTimingDefinition = {
  durationMs: 145,
  tickMs: 25,
  lanes: [
    { key: 'rf', label: 'RF', events: [sincPulse(4, 6, 1, '90°'), sincPulse(62, 8, 1.15, '180°')] },
    { key: 'slice', label: 'Gslice', events: [trapezoid(1, 7, 0.9), trapezoid(7, 13, -0.45), trapezoid(56, 59, 0.55), trapezoid(59, 66, 0.9), trapezoid(66, 69, 0.55)] },
    { key: 'diffusion', label: 'Gdiff', events: [trapezoid(27, 49, 0.92, 2.5, 'δ = 22 ms'), trapezoid(75, 97, 0.92, 2.5, 'δ = 22 ms')] },
    { key: 'phase', label: 'Gphase', events: [trapezoid(111, 115, -0.72), ...diffusionBlips] },
    { key: 'readout', label: 'Gread', events: [trapezoid(111, 115, -0.72), ...diffusionReadouts] },
    { key: 'adc', label: 'Acquire', events: diffusionGates },
    { key: 'signal', label: 'Signal', events: [echo(120, 12, 11)] },
  ],
  brackets: [{ startMs: 4, endMs: 120, label: 'TE = 116 ms' }, { startMs: 38, endMs: 86, label: 'Δ = 48 ms', level: 1 }],
  markers: [
    { timeMs: 4, label: 'excitation', kind: 'excitation' },
    { timeMs: 62, label: 'refocus', kind: 'refocus' },
    { timeMs: 120, label: 'k-space center', kind: 'echo' },
  ],
  readoutWindows: diffusionGates.map((event) => ({ startMs: event.startMs, endMs: event.endMs })),
  timingSummary: 'Illustrative diffusion-prepared spin-echo EPI: equal diffusion lobes surround the 180° pulse, then a reduced nine-line EPI train with 0.8 ms echo spacing samples k-space around TE.',
}

export const sequenceTimingDefinitions: Record<SequenceTimingKind, SequenceTimingDefinition> = {
  spinEcho,
  fastSpinEcho,
  gradientEcho,
  inversion,
  epi,
  diffusion,
}

export function timingEventValue(event: TimingEvent, timeMs: number) {
  if (timeMs < event.startMs || timeMs > event.endMs) return 0
  const duration = event.endMs - event.startMs
  const progress = duration === 0 ? 0.5 : (timeMs - event.startMs) / duration
  if (event.shape === 'sinc') {
    const position = (progress - 0.5) * 6
    const sinc = Math.abs(position) < 1e-8 ? 1 : Math.sin(Math.PI * position) / (Math.PI * position)
    const window = 0.5 - 0.5 * Math.cos(progress * Math.PI * 2)
    return event.amplitude * sinc * window
  }
  if (event.shape === 'echo') {
    const centered = progress - 0.5
    const envelope = Math.exp(-18 * centered * centered)
    return event.amplitude * envelope * Math.cos(centered * Math.PI * 2 * (event.cycles ?? 8))
  }
  if (event.shape === 'gate') return event.amplitude
  const ramp = Math.min(event.rampMs ?? 0, duration / 2)
  if (ramp <= 0) return event.amplitude
  if (timeMs < event.startMs + ramp) return event.amplitude * (timeMs - event.startMs) / ramp
  if (timeMs > event.endMs - ramp) return event.amplitude * (event.endMs - timeMs) / ramp
  return event.amplitude
}

export function sampleTimingLane(definition: SequenceTimingDefinition, lane: TimingLane, sampleCount = 800) {
  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const timeMs = index / sampleCount * definition.durationMs
    const value = lane.events.reduce((sum, event) => sum + timingEventValue(event, timeMs), 0)
    return { timeMs, value }
  })
}

export function timingEventArea(event: TimingEvent) {
  if (event.shape !== 'trapezoid') return 0
  const duration = event.endMs - event.startMs
  const ramp = Math.min(event.rampMs ?? 0, duration / 2)
  return event.amplitude * (duration - ramp)
}
