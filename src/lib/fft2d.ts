export interface ComplexGrid {
  re: Float64Array
  im: Float64Array
  size: number
}

function transform1d(re: Float64Array, im: Float64Array, inverse: boolean) {
  const length = re.length

  for (let index = 1, reversed = 0; index < length; index += 1) {
    let bit = length >> 1
    while (reversed & bit) {
      reversed ^= bit
      bit >>= 1
    }
    reversed ^= bit
    if (index < reversed) {
      const reValue = re[index]
      const imValue = im[index]
      re[index] = re[reversed]
      im[index] = im[reversed]
      re[reversed] = reValue
      im[reversed] = imValue
    }
  }

  for (let width = 2; width <= length; width <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / width
    const stepRe = Math.cos(angle)
    const stepIm = Math.sin(angle)
    const half = width >> 1

    for (let start = 0; start < length; start += width) {
      let rotationRe = 1
      let rotationIm = 0
      for (let offset = 0; offset < half; offset += 1) {
        const even = start + offset
        const odd = even + half
        const oddRe = re[odd] * rotationRe - im[odd] * rotationIm
        const oddIm = re[odd] * rotationIm + im[odd] * rotationRe
        const evenRe = re[even]
        const evenIm = im[even]

        re[even] = evenRe + oddRe
        im[even] = evenIm + oddIm
        re[odd] = evenRe - oddRe
        im[odd] = evenIm - oddIm

        const nextRotationRe = rotationRe * stepRe - rotationIm * stepIm
        rotationIm = rotationRe * stepIm + rotationIm * stepRe
        rotationRe = nextRotationRe
      }
    }
  }

  if (inverse) {
    for (let index = 0; index < length; index += 1) {
      re[index] /= length
      im[index] /= length
    }
  }
}

function transform2d(re: Float64Array, im: Float64Array, size: number, inverse: boolean) {
  const lineRe = new Float64Array(size)
  const lineIm = new Float64Array(size)

  for (let row = 0; row < size; row += 1) {
    const start = row * size
    lineRe.set(re.subarray(start, start + size))
    lineIm.set(im.subarray(start, start + size))
    transform1d(lineRe, lineIm, inverse)
    re.set(lineRe, start)
    im.set(lineIm, start)
  }

  for (let column = 0; column < size; column += 1) {
    for (let row = 0; row < size; row += 1) {
      const index = row * size + column
      lineRe[row] = re[index]
      lineIm[row] = im[index]
    }
    transform1d(lineRe, lineIm, inverse)
    for (let row = 0; row < size; row += 1) {
      const index = row * size + column
      re[index] = lineRe[row]
      im[index] = lineIm[row]
    }
  }
}

export function forwardFft2d(source: Float64Array, size: number): ComplexGrid {
  if (source.length !== size * size || (size & (size - 1)) !== 0) {
    throw new Error('FFT input must be a square power-of-two grid.')
  }
  const re = Float64Array.from(source)
  const im = new Float64Array(source.length)
  transform2d(re, im, size, false)
  return { re, im, size }
}

export function inverseFft2d(grid: ComplexGrid): ComplexGrid {
  const re = Float64Array.from(grid.re)
  const im = Float64Array.from(grid.im)
  transform2d(re, im, grid.size, true)
  return { re, im, size: grid.size }
}
