import { describe, expect, it } from 'vitest'
import { applyArtifact, parallelAliasOffsets, type ArtifactKind } from '../lib/mriArtifactSimulation'

const size = 128
const artifactKinds: ArtifactKind[] = ['motion', 'nyquist', 'wrap', 'susceptibility', 'chemicalShift', 'gibbs', 'bias', 'noise']

function syntheticSlice() {
  const values = new Float64Array(size * size)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - size / 2) / (size / 2)
      const ny = (y - size / 2) / (size / 2)
      const radial = Math.exp(-(nx * nx * 2.4 + ny * ny * 3.1))
      const asymmetricFeature = x > 69 && x < 94 && y > 39 && y < 67 ? 0.34 : 0
      values[y * size + x] = Math.min(1, radial * 0.68 + asymmetricFeature + x / size * 0.08)
    }
  }
  return values
}

describe('MRI artifact teaching transforms', () => {
  it.each(artifactKinds)('%s is an identity transform at zero emphasis', (kind) => {
    const source = syntheticSlice()
    const result = applyArtifact(source, kind, 0)
    let maximumError = 0
    for (let index = 0; index < source.length; index += 1) maximumError = Math.max(maximumError, Math.abs(result[index] - source[index]))
    expect(maximumError).toBeLessThan(1e-9)
  })

  it.each(artifactKinds)('%s changes the synthetic slice at strong emphasis', (kind) => {
    const source = syntheticSlice()
    const result = applyArtifact(source, kind, 80)
    const changedPixels = result.reduce((count, value, index) => count + (Math.abs(value - source[index]) > 1e-5 ? 1 : 0), 0)
    expect(changedPixels).toBeGreaterThan(32)
  })

  it('places residual folds according to the acceleration factor', () => {
    expect(parallelAliasOffsets(128, 1)).toEqual([])
    expect(parallelAliasOffsets(128, 2)).toEqual([64])
    expect(parallelAliasOffsets(128, 3)).toEqual([43, 85])
    expect(parallelAliasOffsets(128, 4)).toEqual([32, 64, 96])
  })
})
