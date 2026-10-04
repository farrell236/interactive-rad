const GRID_SIZE = 72
const DETECTOR_COUNT = 96
const ROOT_TWO = Math.sqrt(2)

const ELLIPSES = [
  { value: 1, rx: 0.69, ry: 0.92, x: 0, y: 0, rotation: 0 },
  { value: -0.8, rx: 0.6624, ry: 0.874, x: 0, y: -0.0184, rotation: 0 },
  { value: -0.2, rx: 0.11, ry: 0.31, x: 0.22, y: 0, rotation: -18 },
  { value: -0.2, rx: 0.16, ry: 0.41, x: -0.22, y: 0, rotation: 18 },
  { value: 0.1, rx: 0.21, ry: 0.25, x: 0, y: 0.35, rotation: 0 },
  { value: 0.1, rx: 0.046, ry: 0.046, x: 0, y: 0.1, rotation: 0 },
  { value: 0.1, rx: 0.046, ry: 0.046, x: 0, y: -0.1, rotation: 0 },
  { value: 0.1, rx: 0.046, ry: 0.023, x: -0.08, y: -0.605, rotation: 0 },
  { value: 0.1, rx: 0.023, ry: 0.023, x: 0, y: -0.606, rotation: 0 },
  { value: 0.1, rx: 0.023, ry: 0.046, x: 0.06, y: -0.605, rotation: 0 },
] as const

function insideEllipse(x: number, y: number, ellipse: typeof ELLIPSES[number]) {
  const rotation = (ellipse.rotation / 180) * Math.PI
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const dx = x - ellipse.x
  const dy = y - ellipse.y
  const localX = (dx * cosine) + (dy * sine)
  const localY = (-dx * sine) + (dy * cosine)
  return ((localX * localX) / (ellipse.rx * ellipse.rx)) + ((localY * localY) / (ellipse.ry * ellipse.ry)) <= 1
}

function createPhantom() {
  const phantom = new Float32Array(GRID_SIZE * GRID_SIZE)
  for (let row = 0; row < GRID_SIZE; row += 1) {
    const y = ((row + 0.5) / GRID_SIZE) * 2 - 1
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const x = ((column + 0.5) / GRID_SIZE) * 2 - 1
      let attenuation = 0
      for (const ellipse of ELLIPSES) if (insideEllipse(x, y, ellipse)) attenuation += ellipse.value
      phantom[(row * GRID_SIZE) + column] = Math.max(0, attenuation)
    }
  }
  return phantom
}

const phantom = createPhantom()

function detectorCoordinate(x: number, y: number, angle: number) {
  const scannerAngle = angle - (Math.PI / 2)
  return (-x * Math.sin(scannerAngle)) + (y * Math.cos(scannerAngle))
}

function forwardProject(angle: number) {
  const projection = new Float32Array(DETECTOR_COUNT)
  for (let row = 0; row < GRID_SIZE; row += 1) {
    const y = ((row + 0.5) / GRID_SIZE) * 2 - 1
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const value = phantom[(row * GRID_SIZE) + column]
      if (value === 0) continue
      const x = ((column + 0.5) / GRID_SIZE) * 2 - 1
      const detectorIndex = ((detectorCoordinate(x, y, angle) + ROOT_TWO) / (ROOT_TWO * 2)) * (DETECTOR_COUNT - 1)
      const lower = Math.floor(detectorIndex)
      const fraction = detectorIndex - lower
      if (lower >= 0 && lower < DETECTOR_COUNT) projection[lower] += value * (1 - fraction)
      if (lower + 1 >= 0 && lower + 1 < DETECTOR_COUNT) projection[lower + 1] += value * fraction
    }
  }
  for (let index = 0; index < projection.length; index += 1) projection[index] /= GRID_SIZE
  return projection
}

function rampFilter(projection: Float32Array) {
  const filtered = new Float32Array(DETECTOR_COUNT)
  for (let index = 0; index < DETECTOR_COUNT; index += 1) {
    let value = projection[index] * 0.25
    for (let offset = 1; offset < DETECTOR_COUNT; offset += 2) {
      const coefficient = -1 / (Math.PI * Math.PI * offset * offset)
      if (index - offset >= 0) value += projection[index - offset] * coefficient
      if (index + offset < DETECTOR_COUNT) value += projection[index + offset] * coefficient
    }
    filtered[index] = value
  }
  return filtered
}

function calculate(viewCount: number) {
  const projections = Array.from({ length: viewCount }, (_, view) => {
    const angle = (view / viewCount) * Math.PI
    const projection = forwardProject(angle)
    return { angle, projection, filtered: rampFilter(projection) }
  })
  const sinogram = new Float32Array(viewCount * DETECTOR_COUNT)
  projections.forEach(({ projection }, view) => sinogram.set(projection, view * DETECTOR_COUNT))

  const accumulator = new Float32Array(GRID_SIZE * GRID_SIZE)
  const reconstructions = new Float32Array(viewCount * GRID_SIZE * GRID_SIZE)
  for (let view = 0; view < viewCount; view += 1) {
    const { angle, filtered } = projections[view]
    for (let row = 0; row < GRID_SIZE; row += 1) {
      const y = ((row + 0.5) / GRID_SIZE) * 2 - 1
      for (let column = 0; column < GRID_SIZE; column += 1) {
        const x = ((column + 0.5) / GRID_SIZE) * 2 - 1
        const detectorIndex = ((detectorCoordinate(x, y, angle) + ROOT_TWO) / (ROOT_TWO * 2)) * (DETECTOR_COUNT - 1)
        const lower = Math.floor(detectorIndex)
        const fraction = detectorIndex - lower
        if (lower >= 0 && lower + 1 < DETECTOR_COUNT) {
          accumulator[(row * GRID_SIZE) + column] += (filtered[lower] * (1 - fraction)) + (filtered[lower + 1] * fraction)
        }
      }
    }
    const outputOffset = view * GRID_SIZE * GRID_SIZE
    const divisor = view + 1
    for (let pixel = 0; pixel < accumulator.length; pixel += 1) reconstructions[outputOffset + pixel] = accumulator[pixel] / divisor
  }
  return { sinogram, reconstructions }
}

self.onmessage = (event: MessageEvent<{ viewCount: number }>) => {
  const viewCount = Math.max(1, Math.round(event.data.viewCount))
  const { sinogram, reconstructions } = calculate(viewCount)
  self.postMessage({ viewCount, sinogram, reconstructions }, { transfer: [sinogram.buffer, reconstructions.buffer] })
}

export {}
