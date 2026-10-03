import { describe, expect, it } from 'vitest'
import { sampleTimingLane, sequenceTimingDefinitions, timingEventArea, timingEventValue } from './mriSequenceTiming'

const centerOf = (event: { startMs: number; endMs: number }) => (event.startMs + event.endMs) / 2
const eventWithLabel = (kind: keyof typeof sequenceTimingDefinitions, label: string) => {
  const event = sequenceTimingDefinitions[kind].lanes.flatMap((lane) => lane.events).find((candidate) => candidate.label === label)
  if (!event) throw new Error(`Missing ${label} in ${kind}`)
  return event
}

describe('MRI sequence timing definitions', () => {
  it('places RF refocusing halfway between excitation and the spin echo', () => {
    const definition = sequenceTimingDefinitions.spinEcho
    const excitation = centerOf(eventWithLabel('spinEcho', '90°'))
    const refocus = centerOf(eventWithLabel('spinEcho', '180°'))
    const echo = definition.markers.find((marker) => marker.kind === 'echo')?.timeMs
    expect(echo).toBe(100)
    expect(refocus).toBe((excitation + echo!) / 2)
  })

  it('uses balanced prephaser and half-readout areas for single-line echoes', () => {
    for (const kind of ['spinEcho', 'gradientEcho', 'inversion'] as const) {
      const events = sequenceTimingDefinitions[kind].lanes.find((lane) => lane.key === 'readout')!.events
      expect(events).toHaveLength(2)
      expect(Math.abs(timingEventArea(events[0]))).toBeCloseTo(Math.abs(timingEventArea(events[1])) / 2, 8)
    }
  })

  it('uses a four-echo FSE train and assigns effective TE to the central k-space echo', () => {
    const definition = sequenceTimingDefinitions.fastSpinEcho
    const refocusingPulses = definition.lanes.find((lane) => lane.key === 'rf')!.events.filter((event) => event.label === '180°')
    const signalEchoes = definition.lanes.find((lane) => lane.key === 'signal')!.events
    expect(refocusingPulses).toHaveLength(4)
    expect(signalEchoes).toHaveLength(4)
    expect(definition.readoutWindows).toHaveLength(4)
    expect(definition.markers.find((marker) => marker.kind === 'echo')?.timeMs).toBe(92)
  })

  it('omits RF refocusing from gradient echo and alternates the EPI readout polarity', () => {
    const gradientRfLabels = sequenceTimingDefinitions.gradientEcho.lanes.find((lane) => lane.key === 'rf')!.events.map((event) => event.label)
    expect(gradientRfLabels).toEqual(['α', 'next α'])
    expect(eventWithLabel('gradientEcho', 'spoiler')).toBeDefined()

    const epiReadouts = sequenceTimingDefinitions.epi.lanes.find((lane) => lane.key === 'readout')!.events.slice(1)
    expect(epiReadouts).toHaveLength(9)
    expect(epiReadouts.map((event) => Math.sign(event.amplitude))).toEqual([1, -1, 1, -1, 1, -1, 1, -1, 1])
    expect(sequenceTimingDefinitions.epi.readoutWindows).toHaveLength(9)
    expect(centerOf(epiReadouts[1]) - centerOf(epiReadouts[0])).toBeCloseTo(0.8, 8)
  })

  it('places equal diffusion lobes symmetrically around the 180 degree pulse', () => {
    const definition = sequenceTimingDefinitions.diffusion
    const lobes = definition.lanes.find((lane) => lane.key === 'diffusion')!.events
    const refocus = centerOf(eventWithLabel('diffusion', '180°'))
    expect(lobes).toHaveLength(2)
    expect(lobes[0].endMs - lobes[0].startMs).toBe(lobes[1].endMs - lobes[1].startMs)
    expect(centerOf(lobes[0]) + centerOf(lobes[1])).toBe(refocus * 2)
    expect(timingEventArea(lobes[0])).toBeCloseTo(timingEventArea(lobes[1]), 10)
  })

  it('samples waveform values from numerical event times', () => {
    const definition = sequenceTimingDefinitions.spinEcho
    const rfLane = definition.lanes.find((lane) => lane.key === 'rf')!
    const samples = sampleTimingLane(definition, rfLane, 500)
    expect(samples).toHaveLength(501)
    expect(samples[0].timeMs).toBe(0)
    expect(samples.at(-1)?.timeMs).toBe(definition.durationMs)
    expect(timingEventValue(rfLane.events[0], centerOf(rfLane.events[0]))).toBeCloseTo(1, 10)
    expect(timingEventValue(rfLane.events[0], rfLane.events[0].endMs + 1)).toBe(0)
  })
})
