import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import volumeUrl from '../assets/ct/lidc-idri-0001-chest-192x192x133-hu16le.bin?url'
import volumeMetadata from '../assets/ct/lidc-idri-0001-chest-volume.json'
import { ctRangeProgressStyle } from '../lib/rangeProgress'
import CtScannerScene from './CtScannerScene'

const WINDOW_CENTER = -500
const WINDOW_WIDTH = 1500
const BASE_ROTATIONS = 9
const LOOP_END_PAUSE_MS = 450

type SliceCanvasProps = {
  volume: Int16Array | null
  width: number
  height: number
  depth: number
  sliceIndex: number
  averageDepth: number
  label?: string
  className?: string
  decorative?: boolean
  style?: CSSProperties
}

function SliceCanvas({ volume, width, height, depth, sliceIndex, averageDepth, label, className, decorative = false, style }: SliceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const image = context.createImageData(width, height)
    const pixelsPerSlice = width * height
    const windowLow = WINDOW_CENTER - (WINDOW_WIDTH / 2)
    const lastSlice = Math.max(0, depth - 1)

    for (let pixel = 0; pixel < pixelsPerSlice; pixel += 1) {
      let sum = 0
      let samples = 0
      for (let offset = 0; offset < averageDepth; offset += 1) {
        const sourceSlice = Math.min(lastSlice, sliceIndex + offset)
        const value = volume?.[(sourceSlice * pixelsPerSlice) + pixel]
        if (value === undefined) continue
        sum += value
        samples += 1
      }

      const hu = samples > 0 ? sum / samples : -1024
      const normalized = Math.max(0, Math.min(1, (hu - windowLow) / WINDOW_WIDTH))
      const gray = Math.round(normalized * 255)
      const output = pixel * 4
      image.data[output] = Math.round(gray * 0.93)
      image.data[output + 1] = Math.round(gray * 0.98)
      image.data[output + 2] = gray
      image.data[output + 3] = 255
    }

    context.putImageData(image, 0, 0)
  }, [averageDepth, depth, height, sliceIndex, volume, width])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={style}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
    />
  )
}

function stackSliceIndices(firstSlice: number, currentSlice: number, sliceStep: number) {
  const availablePlanes = Math.max(1, Math.floor((currentSlice - firstSlice) / sliceStep) + 1)
  return Array.from({ length: availablePlanes }, (_, index) => firstSlice + (index * sliceStep))
}

export default function CtVolumeAcquisition() {
  const experienceRef = useRef<HTMLDivElement>(null)
  const hasAutoStartedRef = useRef(false)
  const [volume, setVolume] = useState<Int16Array | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(() => typeof window.IntersectionObserver !== 'function')
  const [progress, setProgress] = useState(0)
  const [rotationTime, setRotationTime] = useState(0.7)
  const [pitch, setPitch] = useState(1)
  const [sliceThickness, setSliceThickness] = useState(volumeMetadata.sliceSpacingMm)
  const progressRef = useRef(progress)

  const pixelsPerSlice = volumeMetadata.width * volumeMetadata.height
  const loadedDepth = volume ? Math.min(volumeMetadata.depth, Math.floor(volume.length / pixelsPerSlice)) : volumeMetadata.depth
  const canUseTeachingRange = loadedDepth > volumeMetadata.teachingRangeIndices[1]
  const firstScanSlice = canUseTeachingRange ? volumeMetadata.teachingRangeIndices[0] : 0
  const lastScanSlice = canUseTeachingRange ? volumeMetadata.teachingRangeIndices[1] : Math.max(0, loadedDepth - 1)
  const scanDepth = Math.max(1, lastScanSlice - firstScanSlice + 1)
  const sliceStep = Math.max(1, Math.round(sliceThickness / volumeMetadata.sliceSpacingMm))
  const rotations = BASE_ROTATIONS / pitch
  const currentRelativeSlice = Math.min(scanDepth - 1, Math.floor(progress * Math.max(0, scanDepth - 1)))
  const currentSlice = firstScanSlice + currentRelativeSlice
  const acquiredSlices = progress >= 1 ? scanDepth : Math.min(scanDepth, currentRelativeSlice + 1)
  const reconstructedSlices = Math.max(1, Math.ceil(acquiredSlices / sliceStep))
  const totalReconstructedSlices = Math.max(1, Math.ceil(scanDepth / sliceStep))
  const currentReconstructionSlice = Math.min(
    lastScanSlice,
    firstScanSlice + ((reconstructedSlices - 1) * sliceStep),
  )
  const stackLayerInterval = totalReconstructedSlices > 1
    ? (scanDepth - 1) / (totalReconstructedSlices - 1)
    : 0
  const gantryAngle = progress * rotations * Math.PI * 2
  const completedRotations = Math.min(Math.ceil(rotations), Math.floor(progress * rotations) + 1)
  const stackIndices = useMemo(() => stackSliceIndices(firstScanSlice, currentSlice, sliceStep), [currentSlice, firstScanSlice, sliceStep])

  useEffect(() => {
    const controller = new AbortController()

    fetch(volumeUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load CT volume (${response.status})`)
        return response.arrayBuffer()
      })
      .then((buffer) => setVolume(new Int16Array(buffer)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadError(true)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  useEffect(() => {
    const element = experienceRef.current
    if (!element || typeof window.IntersectionObserver !== 'function') return

    const observer = new window.IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || hasAutoStartedRef.current) return
      hasAutoStartedRef.current = true
      progressRef.current = 0
      setProgress(0)
      setIsPlaying(true)
    }, { threshold: 0.16 })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isPlaying || typeof window.requestAnimationFrame !== 'function') return
    let frame = 0
    let previous = performance.now()
    let loopCompletedAt: number | null = null
    const duration = Math.max(1.8, rotations * rotationTime)

    const animate = (time: number) => {
      if (progressRef.current >= 1) {
        loopCompletedAt ??= time
        if (time - loopCompletedAt < LOOP_END_PAUSE_MS) {
          frame = window.requestAnimationFrame(animate)
          return
        }

        loopCompletedAt = null
        previous = time
        progressRef.current = 0
        setProgress(0)
        frame = window.requestAnimationFrame(animate)
        return
      }

      const elapsed = Math.min(0.08, Math.max(0, (time - previous) / 1000))
      previous = time
      const next = Math.min(1, progressRef.current + (elapsed / duration))
      progressRef.current = next
      setProgress(next)
      if (next >= 1) {
        loopCompletedAt = time
        frame = window.requestAnimationFrame(animate)
        return
      }
      frame = window.requestAnimationFrame(animate)
    }

    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [isPlaying, rotationTime, rotations])

  const updateProgress = (next: number) => {
    progressRef.current = next
    setProgress(next)
  }

  const togglePlayback = () => {
    if (!isPlaying && progress >= 1) updateProgress(0)
    setIsPlaying((playing) => !playing)
  }

  const restart = () => {
    updateProgress(0)
    setIsPlaying(true)
  }

  return (
    <div ref={experienceRef} className="ct-volume-acquisition-experience">
      <CtScannerScene scanProgress={progress} gantryAngle={gantryAngle} />

      <section className="ct-volume-acquisition" aria-labelledby="ct-volume-acquisition-title">
        <header>
          <div>
            <span>Slice acquisition</span>
            <h4 id="ct-volume-acquisition-title">Watch a chest scan become a volume</h4>
            <p>During helical scanning, the source–detector assembly rotates around a fixed imaging plane while the table moves the patient through it. Follow the latest axial reconstruction on the left and the ordered stack of completed slices on the right.</p>
          </div>
          <div className="ct-volume-acquisition-status" aria-live="polite">
            <strong>{reconstructedSlices} / {totalReconstructedSlices}</strong>
            <span>displayed slices</span>
          </div>
        </header>

        <div className="ct-volume-acquisition-controls">
          <div className="ct-volume-transport">
            <button type="button" aria-label={isPlaying ? 'Pause CT acquisition' : 'Play CT acquisition'} aria-pressed={isPlaying} onClick={togglePlayback}>
              {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {isPlaying ? 'Pause' : progress >= 1 ? 'Replay' : 'Play'}
            </button>
            <button type="button" aria-label="Restart CT acquisition" onClick={restart}><RotateCcw aria-hidden="true" />Restart</button>
          </div>

          <label className="ct-volume-progress-control">
            <span>Scan progress <strong>{Math.round(progress * 100)}%</strong></span>
            <input aria-label="CT acquisition progress" type="range" min="0" max="1000" step="1" value={Math.round(progress * 1000)} style={ctRangeProgressStyle(progress, 0, 1)} onChange={(event) => { setIsPlaying(false); updateProgress(Number(event.target.value) / 1000) }} />
          </label>

          <label>
            <span>Rotation time <strong>{rotationTime.toFixed(1)} s</strong></span>
            <input aria-label="CT rotation time" type="range" min="0.3" max="1" step="0.1" value={rotationTime} style={ctRangeProgressStyle(rotationTime, 0.3, 1)} onChange={(event) => setRotationTime(Number(event.target.value))} />
          </label>

          <label>
            <span>Pitch <strong>{pitch.toFixed(1)}</strong></span>
            <input aria-label="Helical pitch in acquisition animation" type="range" min="0.5" max="1.5" step="0.1" value={pitch} style={ctRangeProgressStyle(pitch, 0.5, 1.5)} onChange={(event) => setPitch(Number(event.target.value))} />
          </label>

          <label>
            <span>Slice thickness <strong>{sliceThickness.toFixed(1)} mm</strong></span>
            <input aria-label="Reconstructed slice thickness" type="range" min={volumeMetadata.sliceSpacingMm} max={volumeMetadata.sliceSpacingMm * 3} step={volumeMetadata.sliceSpacingMm} value={sliceThickness} style={ctRangeProgressStyle(sliceThickness, volumeMetadata.sliceSpacingMm, volumeMetadata.sliceSpacingMm * 3)} onChange={(event) => setSliceThickness(Number(event.target.value))} />
          </label>
        </div>

        <div className="ct-volume-acquisition-results">
          <article className="ct-current-slice-card">
            <header><span>Current reconstruction</span><strong>Slice {reconstructedSlices} of {totalReconstructedSlices}</strong></header>
            <div className="ct-current-slice-frame">
              <SliceCanvas
                volume={volume}
                width={volumeMetadata.width}
                height={volumeMetadata.height}
                depth={loadedDepth}
                sliceIndex={currentReconstructionSlice}
                averageDepth={sliceStep}
                label={`Current LIDC-IDRI axial chest CT slice ${reconstructedSlices} of ${totalReconstructedSlices}`}
                className="ct-current-slice-canvas"
              />
              <span className="is-left">R</span>
              <span className="is-right">L</span>
              <small>LUNG WINDOW · W {WINDOW_WIDTH} · C {WINDOW_CENTER}</small>
            </div>
            <div className="ct-current-slice-readout">
              <span><small>Rotation</small><strong>{completedRotations} / {Math.ceil(rotations)}</strong></span>
              <span><small>Table travel</small><strong>{Math.round(progress * 100)}%</strong></span>
              <span><small>Thickness</small><strong>{sliceThickness.toFixed(1)} mm</strong></span>
            </div>
            <p className="ct-volume-result-copy">Measurements from multiple angles are combined into one axial image. Its pixels estimate attenuation within a finite slice thickness; this is a reconstructed image, not a direct detector frame.</p>
          </article>

          <article className="ct-growing-volume-card">
            <header><span>Accumulated volume</span><strong>{Math.round(acquiredSlices * volumeMetadata.sliceSpacingMm)} mm covered</strong></header>
            <div className="ct-volume-stack-stage" role="img" aria-label={`Growing CT volume with ${reconstructedSlices} of ${totalReconstructedSlices} displayed slices acquired`}>
              <div className="ct-volume-stack">
                {stackIndices.map((sliceIndex, layer) => (
                  <SliceCanvas
                    key={`${sliceIndex}-${sliceStep}`}
                    volume={volume}
                    width={volumeMetadata.width}
                    height={volumeMetadata.height}
                    depth={loadedDepth}
                    sliceIndex={sliceIndex}
                    averageDepth={sliceStep}
                    decorative
                    className={sliceIndex === currentReconstructionSlice ? 'is-current' : ''}
                    style={{
                      '--stack-offset': layer * stackLayerInterval,
                    } as CSSProperties}
                  />
                ))}
              </div>
              <div className="ct-volume-stack-axis" aria-hidden="true"><span>Inferior</span><i /><span>Superior</span></div>
            </div>
            <p className="ct-volume-result-copy">Each completed slice is placed at its position along the superior–inferior axis. The ordered stack forms a three-dimensional voxel volume that can be viewed in other planes or supplied to an ML pipeline.</p>
            <p>Helical acquisition is continuous, but reconstructed images occupy discrete output positions. Pitch controls table travel per rotation relative to the total beam width. In this demo, reconstruction interval matches slice thickness, so thicker images appear farther apart across the same scanned extent; neither setting changes the couch movement.</p>
          </article>
        </div>

        <footer>
          {loadError ? <strong>CT volume could not be loaded.</strong> : volume ? 'Real CT data loaded.' : 'Loading the CT volume…'}{' '}
          Helical mode uses continuous table motion; step-and-shoot axial CT would move the table between acquisitions instead. LIDC-IDRI-0001 · {scanDepth}-slice thoracic range from 133 source slices · 2.5 mm spacing · CC BY 3.0. Rotation time and pitch are teaching controls, not recovered protocol values from this series.
        </footer>
      </section>
    </div>
  )
}
