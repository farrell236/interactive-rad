import { forwardFft2d, inverseFft2d } from './fft2d'

export type ArtifactKind = 'motion' | 'nyquist' | 'wrap' | 'susceptibility' | 'chemicalShift' | 'gibbs' | 'bias' | 'noise'

const sourceSize = 128

function clamp(value: number) { return Math.max(0, Math.min(1, value)) }
function sourceCoordinate(coordinate: number, size: number) { return ((coordinate % size) + size) % size }

export function applyArtifact(source: Float64Array, kind: ArtifactKind, amount: number) {
  const output = new Float64Array(source.length)
  const mix = amount / 100
  if (kind === 'gibbs') {
    const spectrum = forwardFft2d(source, sourceSize)
    const halfWidth = Math.round(sourceSize / 2 - mix * (sourceSize / 2 - 16))
    for (let y = 0; y < sourceSize; y += 1) {
      const ky = y <= sourceSize / 2 ? y : y - sourceSize
      for (let x = 0; x < sourceSize; x += 1) {
        const kx = x <= sourceSize / 2 ? x : x - sourceSize
        if (Math.abs(kx) > halfWidth || Math.abs(ky) > halfWidth) {
          const index = y * sourceSize + x
          spectrum.re[index] = 0
          spectrum.im[index] = 0
        }
      }
    }
    const reconstructed = inverseFft2d(spectrum)
    for (let index = 0; index < output.length; index += 1) output[index] = clamp(reconstructed.re[index])
    return output
  }

  for (let y = 0; y < sourceSize; y += 1) {
    for (let x = 0; x < sourceSize; x += 1) {
      const index = y * sourceSize + x
      const value = source[index]
      if (kind === 'motion') {
        const offset = Math.max(3, Math.round(8 + mix * 18))
        const ghostA = source[sourceCoordinate(y + offset, sourceSize) * sourceSize + x]
        const ghostB = source[sourceCoordinate(y - offset * 2, sourceSize) * sourceSize + x]
        output[index] = clamp((value + ghostA * mix * 0.42 + ghostB * mix * 0.25) / (1 + mix * 0.67))
      } else if (kind === 'nyquist') {
        const halfFieldGhost = source[sourceCoordinate(y + Math.round(sourceSize / 2), sourceSize) * sourceSize + x]
        const ghostStrength = mix * 0.62
        output[index] = clamp((value + halfFieldGhost * ghostStrength) / (1 + ghostStrength * 0.35))
      } else if (kind === 'wrap') {
        const folded = source[sourceCoordinate(y + Math.round(sourceSize * (0.48 - mix * 0.13)), sourceSize) * sourceSize + x]
        const edgeWeight = Math.pow(Math.abs(y - sourceSize / 2) / (sourceSize / 2), 1.4)
        output[index] = clamp(value + folded * mix * 0.7 * edgeWeight)
      } else if (kind === 'susceptibility') {
        const normalizedX = (x - sourceSize / 2) / (sourceSize / 2)
        const local = Math.exp(-Math.pow((normalizedX + 0.08) / 0.3, 2))
        const shift = Math.round(Math.sin(normalizedX * 8) * mix * 12 * local)
        const shifted = source[sourceCoordinate(y + shift, sourceSize) * sourceSize + x]
        const dropout = 1 - mix * 0.72 * local * Math.exp(-Math.pow((y - sourceSize * 0.58) / 23, 2))
        output[index] = clamp(shifted * dropout)
      } else if (kind === 'chemicalShift') {
        const shift = Math.max(1, Math.round(1 + mix * 7))
        const towardReadout = source[y * sourceSize + sourceCoordinate(x - shift, sourceSize)]
        const awayFromReadout = source[y * sourceSize + sourceCoordinate(x + shift, sourceSize)]
        const boundaryBand = (towardReadout - awayFromReadout) * mix * 0.42
        const normalizedX = (x - sourceSize / 2) / (sourceSize / 2)
        const normalizedY = (y - sourceSize / 2) / (sourceSize / 2)
        const radius = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY)
        const peripheralBoundary = Math.exp(-Math.pow((radius - 0.68) / 0.12, 2))
        output[index] = clamp(value + boundaryBand * peripheralBoundary)
      } else if (kind === 'bias') {
        const nx = (x - sourceSize * 0.18) / sourceSize
        const ny = (y - sourceSize * 0.22) / sourceSize
        const field = 1 + mix * (0.35 - 1.15 * Math.sqrt(nx * nx + ny * ny))
        output[index] = clamp(value * Math.max(0.32, field))
      } else {
        const hashA = Math.sin((x * 127.1 + y * 311.7) * 0.017) * 43758.5453
        const hashB = Math.sin((x * 269.5 + y * 183.3) * 0.019) * 24634.6345
        const uniformA = Math.max(1e-7, hashA - Math.floor(hashA))
        const uniformB = hashB - Math.floor(hashB)
        const gaussianRadius = Math.sqrt(-2 * Math.log(uniformA))
        const gaussianAngle = 2 * Math.PI * uniformB
        const sigma = mix * 0.1
        const n1 = gaussianRadius * Math.cos(gaussianAngle) * sigma
        const n2 = gaussianRadius * Math.sin(gaussianAngle) * sigma
        output[index] = clamp(Math.sqrt(Math.pow(value + n1, 2) + n2 * n2))
      }
    }
  }
  return output
}

export function parallelAliasOffsets(size: number, acceleration: number) {
  const factor = Math.max(1, Math.round(acceleration))
  return Array.from({ length: factor - 1 }, (_, fold) => Math.round(size * (fold + 1) / factor))
}
