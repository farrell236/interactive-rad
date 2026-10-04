type SliceImageOptions = {
  width: number
  height: number
  depth: number
  sliceIndex: number
  averageDepth?: number
  center: number
  windowWidth: number
  tint?: [number, number, number]
}

const imageCache = new WeakMap<Int16Array, Map<string, string>>()

function cacheKey(options: SliceImageOptions) {
  const { width, height, depth, sliceIndex, averageDepth = 1, center, windowWidth, tint = [1, 1, 1] } = options
  return [width, height, depth, sliceIndex, averageDepth, center, windowWidth, ...tint].join(':')
}

export function getCtSliceImageDataUrl(volume: Int16Array, options: SliceImageOptions) {
  let volumeCache = imageCache.get(volume)
  if (!volumeCache) {
    volumeCache = new Map()
    imageCache.set(volume, volumeCache)
  }

  const key = cacheKey(options)
  const cached = volumeCache.get(key)
  if (cached) return cached

  const {
    width,
    height,
    depth,
    sliceIndex,
    averageDepth = 1,
    center,
    windowWidth,
    tint = [1, 1, 1],
  } = options
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return ''

  const image = context.createImageData(width, height)
  const pixelsPerSlice = width * height
  const low = center - (windowWidth / 2)
  const lastSlice = Math.max(0, depth - 1)

  for (let pixel = 0; pixel < pixelsPerSlice; pixel += 1) {
    let sum = 0
    let samples = 0
    for (let offset = 0; offset < averageDepth; offset += 1) {
      const sourceSlice = Math.min(lastSlice, sliceIndex + offset)
      const value = volume[(sourceSlice * pixelsPerSlice) + pixel]
      if (value === undefined) continue
      sum += value
      samples += 1
    }
    const hu = samples > 0 ? sum / samples : -1024
    const normalized = Math.max(0, Math.min(1, (hu - low) / windowWidth))
    const gray = Math.round(normalized * 255)
    const output = pixel * 4
    image.data[output] = Math.round(gray * tint[0])
    image.data[output + 1] = Math.round(gray * tint[1])
    image.data[output + 2] = Math.round(gray * tint[2])
    image.data[output + 3] = 255
  }

  context.putImageData(image, 0, 0)
  if (typeof navigator !== 'undefined' && /\bjsdom\b/i.test(navigator.userAgent)) return ''
  const url = canvas.toDataURL('image/png')
  volumeCache.set(key, url)
  return url
}

export function useCtSliceImageDataUrl(volume: Int16Array | null, options: SliceImageOptions) {
  const [rendered, setRendered] = useState<{ volume: Int16Array; src: string } | null>(null)
  const { width, height, depth, sliceIndex, averageDepth = 1, center, windowWidth, tint = [1, 1, 1] } = options
  const [tintR, tintG, tintB] = tint

  useEffect(() => {
    if (!volume) return undefined
    let cancelled = false
    const render = () => {
      const next = getCtSliceImageDataUrl(volume, { width, height, depth, sliceIndex, averageDepth, center, windowWidth, tint: [tintR, tintG, tintB] })
      if (!cancelled) setRendered({ volume, src: next })
    }
    const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 8 }), 0))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const handle = schedule(render, { timeout: 80 })
    return () => {
      cancelled = true
      cancel(handle)
    }
  }, [averageDepth, center, depth, height, sliceIndex, tintB, tintG, tintR, volume, width, windowWidth])

  return rendered?.volume === volume ? rendered.src : ''
}
import { useEffect, useState } from 'react'
