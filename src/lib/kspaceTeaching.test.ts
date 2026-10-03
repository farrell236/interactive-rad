import { describe, expect, it } from 'vitest'
import type { ComplexGrid } from './fft2d'
import { applyKspacePhase, buildKspaceMask } from './kspaceTeaching'

function uniformGrid(size = 8): ComplexGrid {
  return {
    re: new Float64Array(size * size).fill(1),
    im: new Float64Array(size * size),
    size,
  }
}

describe('k-space teaching transforms', () => {
  it('fills complete phase-encode rows in center-out order', () => {
    const grid = uniformGrid()
    const oneLine = buildKspaceMask(grid, 'full', 38, 2, 1)
    const threeLines = buildKspaceMask(grid, 'full', 38, 2, 3)

    expect(Array.from(oneLine.mask).reduce((sum, value) => sum + value, 0)).toBe(8)
    expect(oneLine.mask.slice(0, 8).every((value) => value === 1)).toBe(true)
    expect(Array.from(threeLines.mask).reduce((sum, value) => sum + value, 0)).toBe(24)
  })

  it('keeps complementary center and outer teaching masks', () => {
    const grid = uniformGrid()
    const center = buildKspaceMask(grid, 'center', 50, 2, grid.size)
    const outer = buildKspaceMask(grid, 'outer', 50, 2, grid.size)

    center.mask.forEach((value, index) => expect(value + outer.mask[index]).toBe(1))
    expect(center.retainedFraction + outer.retainedFraction).toBeCloseTo(1, 12)
    expect(center.energyFraction + outer.energyFraction).toBeCloseTo(1, 12)
  })

  it('retains every Rth Cartesian phase-encode line', () => {
    const grid = uniformGrid()
    const result = buildKspaceMask(grid, 'regular', 38, 4, grid.size)

    expect(result.retainedFraction).toBeCloseTo(0.25, 12)
    expect(result.energyFraction).toBeCloseTo(0.25, 12)
  })

  it('preserves retained coefficient magnitudes for every phase treatment', () => {
    const grid: ComplexGrid = {
      re: Float64Array.from([3, -4, 0, 5]),
      im: Float64Array.from([4, 3, 2, -12]),
      size: 2,
    }
    const mask = Uint8Array.from([1, 1, 0, 1])

    for (const mode of ['correct', 'removed', 'scrambled'] as const) {
      const result = applyKspacePhase(grid, mask, mode)
      result.re.forEach((value, index) => {
        const expected = mask[index] ? Math.hypot(grid.re[index], grid.im[index]) : 0
        expect(Math.hypot(value, result.im[index])).toBeCloseTo(expected, 10)
      })
    }

    const removed = applyKspacePhase(grid, mask, 'removed')
    expect(Array.from(removed.im)).toEqual([0, 0, 0, 0])
    expect(Array.from(removed.re)).toEqual([5, 5, 0, 13])
  })
})
