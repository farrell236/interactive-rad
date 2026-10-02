export const MRI_PULSE_CYCLE_SECONDS = 8
export const MRI_RF_START = 0.18
export const MRI_RF_END = 0.32
export const MRI_READOUT_END = 0.82

export function getMriClockSeconds() {
  return performance.now() / 1000
}

export function getMriPulseCyclePhase(startedAt: number, now = getMriClockSeconds()) {
  const elapsed = Math.max(0, now - startedAt)
  return (elapsed % MRI_PULSE_CYCLE_SECONDS) / MRI_PULSE_CYCLE_SECONDS
}

export function isMriRfActive(phase: number) {
  return phase >= MRI_RF_START && phase < MRI_RF_END
}
