import type { ComplexGrid } from './fft2d'

export type SamplingMode = 'full' | 'center' | 'outer' | 'regular'
export type ReconstructionPhase = 'correct' | 'removed' | 'scrambled'

function signedFrequency(index: number, size: number) {
  return index < size / 2 ? index : index - size
}

function deterministicPhase(index: number) {
  const value = Math.sin((index + 1) * 12.9898) * 43758.5453
  return (value - Math.floor(value)) * 2 * Math.PI - Math.PI
}

export function buildKspaceMask(grid: ComplexGrid, mode: SamplingMode, boundaryPercent: number, acceleration: number, acquiredLines: number) {
  const mask = new Uint8Array(grid.re.length)
  const radiusBoundary = boundaryPercent / 100
  const centerOutRows = Array.from({ length: grid.size }, (_, row) => row)
    .sort((rowA, rowB) => Math.abs(signedFrequency(rowA, grid.size)) - Math.abs(signedFrequency(rowB, grid.size)))
  const acquiredRows = new Set(centerOutRows.slice(0, acquiredLines))
  let retained = 0
  let retainedEnergy = 0
  let totalEnergy = 0

  for (let y = 0; y < grid.size; y += 1) {
    const ky = signedFrequency(y, grid.size)
    for (let x = 0; x < grid.size; x += 1) {
      const kx = signedFrequency(x, grid.size)
      const index = y * grid.size + x
      const radius = Math.hypot(kx, ky) / (grid.size / 2)
      const keep = (mode === 'full' && acquiredRows.has(y))
        || (mode === 'center' && radius <= radiusBoundary)
        || (mode === 'outer' && radius > radiusBoundary)
        || (mode === 'regular' && ((ky % acceleration) + acceleration) % acceleration === 0)
      const energy = grid.re[index] ** 2 + grid.im[index] ** 2
      totalEnergy += energy
      if (keep) {
        mask[index] = 1
        retained += 1
        retainedEnergy += energy
      }
    }
  }

  return {
    mask,
    retainedFraction: retained / mask.length,
    energyFraction: totalEnergy === 0 ? 0 : retainedEnergy / totalEnergy,
  }
}

export function applyKspacePhase(grid: ComplexGrid, mask: Uint8Array, phaseMode: ReconstructionPhase) {
  const re = new Float64Array(grid.re.length)
  const im = new Float64Array(grid.im.length)
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue
    if (phaseMode === 'correct') {
      re[index] = grid.re[index]
      im[index] = grid.im[index]
      continue
    }
    const magnitude = Math.hypot(grid.re[index], grid.im[index])
    const phase = phaseMode === 'removed' ? 0 : deterministicPhase(index)
    re[index] = magnitude * Math.cos(phase)
    im[index] = magnitude * Math.sin(phase)
  }
  return { re, im, size: grid.size }
}
