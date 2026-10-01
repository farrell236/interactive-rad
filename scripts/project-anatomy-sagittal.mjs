import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'public/models/FinalBaseMesh.obj')
const outputPath = resolve(root, 'public/models/anatomy-sagittal.svg')
const lines = readFileSync(sourcePath, 'utf8').split(/\r?\n/)
const vertices = []
const faces = []

for (const line of lines) {
  if (line.startsWith('v  ')) {
    const [, x, y, z] = line.trim().split(/\s+/)
    vertices.push([Number(x), Number(y), Number(z)])
  } else if (line.startsWith('f ')) {
    const indices = line.trim().slice(2).split(/\s+/).map((entry) => Number(entry.split('/')[0]) - 1)
    if (indices.length < 3) continue
    for (let index = 1; index < indices.length - 1; index += 1) faces.push([indices[0], indices[index], indices[index + 1]])
  }
}

const minimum = [Infinity, Infinity, Infinity]
const maximum = [-Infinity, -Infinity, -Infinity]
for (const vertex of vertices) {
  for (let axis = 0; axis < 3; axis += 1) {
    minimum[axis] = Math.min(minimum[axis], vertex[axis])
    maximum[axis] = Math.max(maximum[axis], vertex[axis])
  }
}

const width = 960
const height = 260
const marginX = 16
const marginY = 12
const spanY = maximum[1] - minimum[1]
const spanZ = maximum[2] - minimum[2]
const project = ([, y, z]) => [
  marginX + ((maximum[1] - y) / spanY) * (width - (marginX * 2)),
  marginY + ((maximum[2] - z) / spanZ) * (height - (marginY * 2)),
]
const subtract = (a, b) => a.map((value, index) => value - b[index])
const cross = (a, b) => [
  (a[1] * b[2]) - (a[2] * b[1]),
  (a[2] * b[0]) - (a[0] * b[2]),
  (a[0] * b[1]) - (a[1] * b[0]),
]
const normalize = (vector) => {
  const length = Math.hypot(...vector) || 1
  return vector.map((value) => value / length)
}
const light = normalize([0.72, 0.34, 0.6])
const visibleFaces = []

for (const face of faces) {
  const points = face.map((index) => vertices[index])
  const normal = normalize(cross(subtract(points[1], points[0]), subtract(points[2], points[0])))
  if (normal[0] <= 0.015) continue
  const diffuse = Math.max(0, (normal[0] * light[0]) + (normal[1] * light[1]) + (normal[2] * light[2]))
  const shade = Math.max(0, Math.min(11, Math.round((0.28 + (diffuse * 0.72)) * 11)))
  visibleFaces.push({
    depth: points.reduce((sum, point) => sum + point[0], 0) / 3,
    shade,
    points: points.map(project),
  })
}

visibleFaces.sort((a, b) => a.depth - b.depth)
const palette = Array.from({ length: 12 }, (_, index) => {
  const t = index / 11
  const start = [65, 112, 124]
  const end = [205, 231, 235]
  return `rgb(${start.map((value, channel) => Math.round(value + ((end[channel] - value) * t))).join(' ')})`
})
const polygons = visibleFaces.map(({ points, shade }) => {
  const coordinates = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return `<polygon points="${coordinates}" fill="${palette[shade]}"/>`
}).join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sagittal projection of the bundled anatomical body mesh"><g shape-rendering="geometricPrecision">${polygons}</g></svg>\n`
writeFileSync(outputPath, svg)
console.log(`Wrote ${outputPath} with ${visibleFaces.length} visible triangles.`)
