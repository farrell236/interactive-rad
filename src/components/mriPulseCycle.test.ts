import { describe, expect, it } from 'vitest'
import { getMriPulseCyclePhase, isMriRfActive, MRI_PULSE_CYCLE_SECONDS, MRI_RF_END, MRI_RF_START } from './mriPulseCycle'

describe('MRI pulse-cycle clock', () => {
  it('keeps every consumer on the same repeating phase', () => {
    const startedAt = 100
    expect(getMriPulseCyclePhase(startedAt, startedAt)).toBe(0)
    expect(getMriPulseCyclePhase(startedAt, startedAt + (MRI_PULSE_CYCLE_SECONDS / 2))).toBe(0.5)
    expect(getMriPulseCyclePhase(startedAt, startedAt + MRI_PULSE_CYCLE_SECONDS)).toBe(0)
  })

  it('uses one RF transmission interval', () => {
    expect(isMriRfActive(MRI_RF_START)).toBe(true)
    expect(isMriRfActive((MRI_RF_START + MRI_RF_END) / 2)).toBe(true)
    expect(isMriRfActive(MRI_RF_END)).toBe(false)
  })
})
