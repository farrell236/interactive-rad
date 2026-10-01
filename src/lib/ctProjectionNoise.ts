export type CtKernel = 'smooth' | 'standard' | 'sharp'

export type CtProjectionModel = {
  imageSize: number
  detectorCount: number
  viewCount: number
  sinogram: Float32Array
  calibrationScale: number
  calibrationOffset: number
}

export type CtNoiseSimulation = {
  hu: Float32Array
  incidentPhotons: number
}

const IMAGE_SIZE = 144
const DETECTOR_COUNT = 204
const VIEW_COUNT = 180
const ROOT_TWO = Math.sqrt(2)
const MU_WATER = 0.2
const MU_AIR = 0.0002
const PROJECTION_SCALE = 1 / 16
const modelCache = new WeakMap<Int16Array, CtProjectionModel>()
const noisyReconstructionCache = new WeakMap<CtProjectionModel, Map<string, Float32Array>>()

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function normalizedHu(value: number) {
  return value <= -1500 ? -1000 : clamp(value, -1000, 2500)
}

function huToAttenuation(hu: number) {
  return Math.max(0, ((MU_WATER - MU_AIR) * hu / 1000) + MU_WATER)
}

function attenuationToHu(attenuation: number) {
  return ((attenuation - MU_WATER) / (MU_WATER - MU_AIR)) * 1000
}

function sourceSample(pixels: Int16Array, sourceSize: number, x: number, y: number) {
  const left = clamp(Math.floor(x), 0, sourceSize - 1)
  const right = clamp(left + 1, 0, sourceSize - 1)
  const top = clamp(Math.floor(y), 0, sourceSize - 1)
  const bottom = clamp(top + 1, 0, sourceSize - 1)
  const fractionX = x - Math.floor(x)
  const fractionY = y - Math.floor(y)
  const sample = (column: number, row: number) => pixels[(row * sourceSize) + column] ?? -2048
  const topLeft = sample(left, top)
  const topRight = sample(right, top)
  const bottomLeft = sample(left, bottom)
  const bottomRight = sample(right, bottom)
  const normalized = (value: number) => value <= -1500 ? -1000 : value
  const topValue = (normalized(topLeft) * (1 - fractionX)) + (normalized(topRight) * fractionX)
  const bottomValue = (normalized(bottomLeft) * (1 - fractionX)) + (normalized(bottomRight) * fractionX)
  const nearest = sample(clamp(Math.round(x), 0, sourceSize - 1), clamp(Math.round(y), 0, sourceSize - 1))
  return { hu: (topValue * (1 - fractionY)) + (bottomValue * fractionY), valid: nearest > -1500 }
}

function downsampleCt(pixels: Int16Array) {
  const sourceSize = Math.round(Math.sqrt(pixels.length))
  if (sourceSize * sourceSize !== pixels.length) throw new Error('Expected a square CT slice')
  const hu = new Float32Array(IMAGE_SIZE * IMAGE_SIZE)
  const attenuation = new Float32Array(IMAGE_SIZE * IMAGE_SIZE)
  const mask = new Uint8Array(IMAGE_SIZE * IMAGE_SIZE)

  for (let row = 0; row < IMAGE_SIZE; row += 1) {
    const sourceY = ((row + 0.5) / IMAGE_SIZE) * sourceSize - 0.5
    for (let column = 0; column < IMAGE_SIZE; column += 1) {
      const sourceX = ((column + 0.5) / IMAGE_SIZE) * sourceSize - 0.5
      const sample = sourceSample(pixels, sourceSize, sourceX, sourceY)
      const index = (row * IMAGE_SIZE) + column
      hu[index] = normalizedHu(sample.hu)
      if (sample.valid) {
        mask[index] = 1
        attenuation[index] = huToAttenuation(hu[index])
      }
    }
  }
  return { hu, attenuation, mask }
}

function forwardProject(image: Float32Array) {
  const sinogram = new Float32Array(VIEW_COUNT * DETECTOR_COUNT)
  for (let view = 0; view < VIEW_COUNT; view += 1) {
    const angle = (view / VIEW_COUNT) * Math.PI
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const projectionOffset = view * DETECTOR_COUNT
    for (let row = 0; row < IMAGE_SIZE; row += 1) {
      const y = ((row + 0.5) / IMAGE_SIZE) * 2 - 1
      for (let column = 0; column < IMAGE_SIZE; column += 1) {
        const value = image[(row * IMAGE_SIZE) + column]
        if (value === 0) continue
        const x = ((column + 0.5) / IMAGE_SIZE) * 2 - 1
        const detector = (((x * cosine) + (y * sine) + ROOT_TWO) / (ROOT_TWO * 2)) * (DETECTOR_COUNT - 1)
        const lower = Math.floor(detector)
        const fraction = detector - lower
        if (lower >= 0 && lower < DETECTOR_COUNT) sinogram[projectionOffset + lower] += value * (1 - fraction) * PROJECTION_SCALE
        if (lower + 1 >= 0 && lower + 1 < DETECTOR_COUNT) sinogram[projectionOffset + lower + 1] += value * fraction * PROJECTION_SCALE
      }
    }
  }
  return sinogram
}

function rampFilter(sinogram: Float32Array) {
  const filtered = new Float32Array(sinogram.length)
  for (let view = 0; view < VIEW_COUNT; view += 1) {
    const projectionOffset = view * DETECTOR_COUNT
    for (let detector = 0; detector < DETECTOR_COUNT; detector += 1) {
      let value = sinogram[projectionOffset + detector] * 0.25
      for (let offset = 1; offset < DETECTOR_COUNT; offset += 2) {
        const coefficient = -1 / (Math.PI * Math.PI * offset * offset)
        if (detector - offset >= 0) value += sinogram[projectionOffset + detector - offset] * coefficient
        if (detector + offset < DETECTOR_COUNT) value += sinogram[projectionOffset + detector + offset] * coefficient
      }
      filtered[projectionOffset + detector] = value
    }
  }
  return filtered
}

function backProject(filtered: Float32Array) {
  const output = new Float32Array(IMAGE_SIZE * IMAGE_SIZE)
  for (let row = 0; row < IMAGE_SIZE; row += 1) {
    const y = ((row + 0.5) / IMAGE_SIZE) * 2 - 1
    for (let column = 0; column < IMAGE_SIZE; column += 1) {
      const x = ((column + 0.5) / IMAGE_SIZE) * 2 - 1
      let sum = 0
      for (let view = 0; view < VIEW_COUNT; view += 1) {
        const angle = (view / VIEW_COUNT) * Math.PI
        const detector = (((x * Math.cos(angle)) + (y * Math.sin(angle)) + ROOT_TWO) / (ROOT_TWO * 2)) * (DETECTOR_COUNT - 1)
        const lower = Math.floor(detector)
        const fraction = detector - lower
        if (lower >= 0 && lower + 1 < DETECTOR_COUNT) {
          const projectionOffset = view * DETECTOR_COUNT
          sum += (filtered[projectionOffset + lower] * (1 - fraction)) + (filtered[projectionOffset + lower + 1] * fraction)
        }
      }
      output[(row * IMAGE_SIZE) + column] = sum / VIEW_COUNT
    }
  }
  return output
}

function fitAttenuationCalibration(reconstruction: Float32Array, attenuation: Float32Array, mask: Uint8Array) {
  let count = 0
  let reconstructionMean = 0
  let attenuationMean = 0
  for (let index = 0; index < reconstruction.length; index += 1) {
    if (!mask[index]) continue
    count += 1
    reconstructionMean += reconstruction[index]
    attenuationMean += attenuation[index]
  }
  if (count === 0) return { scale: 1, offset: 0 }
  reconstructionMean /= count
  attenuationMean /= count

  let variance = 0
  let covariance = 0
  for (let index = 0; index < reconstruction.length; index += 1) {
    if (!mask[index]) continue
    const reconstructionDelta = reconstruction[index] - reconstructionMean
    variance += reconstructionDelta * reconstructionDelta
    covariance += reconstructionDelta * (attenuation[index] - attenuationMean)
  }
  if (variance < 1e-12) return { scale: 1, offset: attenuationMean - reconstructionMean }
  const scale = covariance / variance
  return { scale, offset: attenuationMean - (scale * reconstructionMean) }
}

export function getCtProjectionModel(pixels: Int16Array) {
  const cached = modelCache.get(pixels)
  if (cached) return cached
  const { attenuation, mask } = downsampleCt(pixels)
  const sinogram = forwardProject(attenuation)
  const cleanReconstruction = backProject(rampFilter(sinogram))
  const calibration = fitAttenuationCalibration(cleanReconstruction, attenuation, mask)
  const model = {
    imageSize: IMAGE_SIZE,
    detectorCount: DETECTOR_COUNT,
    viewCount: VIEW_COUNT,
    sinogram,
    calibrationScale: calibration.scale,
    calibrationOffset: calibration.offset,
  }
  modelCache.set(pixels, model)
  return model
}

function makeRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function logFactorial(value: number) {
  if (value < 2) return 0
  if (value < 64) {
    let result = 0
    for (let factor = 2; factor <= value; factor += 1) result += Math.log(factor)
    return result
  }
  const x = value + 1
  return ((x - 0.5) * Math.log(x)) - x + (0.5 * Math.log(2 * Math.PI)) + (1 / (12 * x)) - (1 / (360 * x * x * x))
}

function samplePoisson(lambda: number, random: () => number) {
  if (lambda <= 0) return 0
  if (lambda < 30) {
    const limit = Math.exp(-lambda)
    let product = 1
    let count = 0
    do {
      count += 1
      product *= random()
    } while (product > limit)
    return count - 1
  }

  const root = Math.sqrt(lambda)
  const logLambda = Math.log(lambda)
  const b = 0.931 + (2.53 * root)
  const a = -0.059 + (0.02483 * b)
  const inverseAlpha = 1.1239 + (1.1328 / (b - 3.4))
  const squeeze = 0.9277 - (3.6224 / (b - 2))
  while (true) {
    const u = random() - 0.5
    const v = Math.max(random(), Number.EPSILON)
    const distance = 0.5 - Math.abs(u)
    const candidate = Math.floor((((2 * a) / distance) + b) * u + lambda + 0.43)
    if (distance >= 0.07 && v <= squeeze) return candidate
    if (candidate < 0 || (distance < 0.013 && v > distance)) continue
    const acceptance = Math.log((v * inverseAlpha) / ((a / (distance * distance)) + b))
    if (acceptance <= (-lambda + (candidate * logLambda) - logFactorial(candidate))) return candidate
  }
}

function blur(values: Float32Array) {
  const horizontal = new Float32Array(values.length)
  const output = new Float32Array(values.length)
  for (let row = 0; row < IMAGE_SIZE; row += 1) {
    for (let column = 0; column < IMAGE_SIZE; column += 1) {
      const left = values[(row * IMAGE_SIZE) + Math.max(0, column - 1)]
      const center = values[(row * IMAGE_SIZE) + column]
      const right = values[(row * IMAGE_SIZE) + Math.min(IMAGE_SIZE - 1, column + 1)]
      horizontal[(row * IMAGE_SIZE) + column] = (left * 0.25) + (center * 0.5) + (right * 0.25)
    }
  }
  for (let row = 0; row < IMAGE_SIZE; row += 1) {
    for (let column = 0; column < IMAGE_SIZE; column += 1) {
      const top = horizontal[(Math.max(0, row - 1) * IMAGE_SIZE) + column]
      const center = horizontal[(row * IMAGE_SIZE) + column]
      const bottom = horizontal[(Math.min(IMAGE_SIZE - 1, row + 1) * IMAGE_SIZE) + column]
      output[(row * IMAGE_SIZE) + column] = (top * 0.25) + (center * 0.5) + (bottom * 0.25)
    }
  }
  return output
}

function applyKernel(values: Float32Array, kernel: CtKernel) {
  const softened = blur(values)
  if (kernel === 'smooth') return blur(softened)
  if (kernel === 'standard') return values.slice()
  const sharpened = new Float32Array(values.length)
  for (let index = 0; index < values.length; index += 1) sharpened[index] = clamp(values[index] + ((values[index] - softened[index]) * 0.9), -1200, 3000)
  return sharpened
}

export function simulateCtProjectionNoise(model: CtProjectionModel, mas: number, pitch: number, thickness: number, kernel: CtKernel): CtNoiseSimulation {
  const incidentPhotons = Math.round(clamp(65536 * (mas / 120) * (1 / pitch) * (thickness / 2.5), 2048, 1048576))
  const cacheKey = `${mas}|${pitch.toFixed(2)}|${thickness.toFixed(2)}`
  let reconstructionCache = noisyReconstructionCache.get(model)
  if (!reconstructionCache) {
    reconstructionCache = new Map()
    noisyReconstructionCache.set(model, reconstructionCache)
  }
  let reconstructedHu = reconstructionCache.get(cacheKey)
  if (!reconstructedHu) {
    const random = makeRandom(0x51f15e ^ Math.round(mas * 31) ^ Math.round(pitch * 1000) ^ Math.round(thickness * 10000))
    const noisySinogram = new Float32Array(model.sinogram.length)
    for (let index = 0; index < model.sinogram.length; index += 1) {
      const expectedCounts = incidentPhotons * Math.exp(-Math.max(0, model.sinogram[index]))
      const measuredCounts = Math.max(0.5, samplePoisson(expectedCounts, random))
      noisySinogram[index] = -Math.log(measuredCounts / incidentPhotons)
    }
    const reconstructed = backProject(rampFilter(noisySinogram))
    reconstructedHu = new Float32Array(reconstructed.length)
    for (let index = 0; index < reconstructed.length; index += 1) {
      const attenuation = (reconstructed[index] * model.calibrationScale) + model.calibrationOffset
      reconstructedHu[index] = clamp(attenuationToHu(attenuation), -1200, 3000)
    }
    reconstructionCache.set(cacheKey, reconstructedHu)
  }
  return { hu: applyKernel(reconstructedHu, kernel), incidentPhotons }
}
