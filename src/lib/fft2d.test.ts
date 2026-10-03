import { describe, expect, it } from 'vitest'
import { forwardFft2d, inverseFft2d } from './fft2d'

describe('2D Fourier transform', () => {
  it('round-trips a real image through complex k-space', () => {
    const size = 8
    const source = Float64Array.from({ length: size * size }, (_, index) => {
      const x = index % size
      const y = Math.floor(index / size)
      return 0.4 + 0.2 * Math.sin(x * 0.8) + 0.3 * Math.cos(y * 0.5)
    })
    const reconstructed = inverseFft2d(forwardFft2d(source, size))

    reconstructed.re.forEach((value, index) => expect(value).toBeCloseTo(source[index], 10))
    reconstructed.im.forEach((value) => expect(value).toBeCloseTo(0, 10))
  })

  it('places a constant image entirely at the DC coefficient', () => {
    const size = 4
    const spectrum = forwardFft2d(new Float64Array(size * size).fill(2), size)

    expect(spectrum.re[0]).toBeCloseTo(32, 10)
    expect(spectrum.im[0]).toBeCloseTo(0, 10)
    spectrum.re.slice(1).forEach((value) => expect(value).toBeCloseTo(0, 10))
    spectrum.im.slice(1).forEach((value) => expect(value).toBeCloseTo(0, 10))
  })
})
