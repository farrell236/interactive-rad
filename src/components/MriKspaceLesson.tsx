import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ExternalLink, Pause, Play, RotateCcw } from 'lucide-react'
import { forwardFft2d, inverseFft2d, type ComplexGrid } from '../lib/fft2d'
import { applyKspacePhase, buildKspaceMask, type ReconstructionPhase, type SamplingMode } from '../lib/kspaceTeaching'
import { mriVolumeSliceUrl } from '../lib/mriVolume'
import { ctRangeProgressStyle } from '../lib/rangeProgress'

type KspaceDisplay = 'magnitude' | 'phase'
type OutputScale = 'fixed' | 'normalized'

const fftSize = 128
const sourceUrl = mriVolumeSliceUrl(0)

const modeContent: Record<SamplingMode, { label: string; short: string; title: string; copy: string }> = {
  full: {
    label: '1. Full grid',
    short: 'reference',
    title: 'All sampled frequencies contribute to one image',
    copy: 'With the complete complex grid, the inverse Fourier transform recovers the reference slice. No k-space point corresponds to one anatomical pixel; every retained basis pattern contributes across the image.',
  },
  center: {
    label: '2. Keep center',
    short: 'low-pass teaching mask',
    title: 'Central k-space preserves broad structure',
    copy: 'This circular teaching mask keeps low spatial frequencies and removes rapid transitions. Broad anatomy remains while fine detail blurs. The hard cutoff also produces ringing, so this demonstrates frequency content rather than a normal Cartesian acquisition.',
  },
  outer: {
    label: '3. Keep outer',
    short: 'high-pass teaching mask',
    title: 'Outer k-space isolates rapid spatial change',
    copy: 'The complementary circular teaching mask removes the slowly varying baseline while retaining boundaries and texture. Its sharp boundary also rings. This edge-like result is not a conventional MR image, detector channel, or acquisition trajectory.',
  },
  regular: {
    label: '4. Skip lines',
    short: 'Cartesian R',
    title: 'Regularly missing phase lines create coherent aliasing',
    copy: 'Keeping every Rth kᵧ line shortens the sampling pattern. A direct zero-filled inverse transform cannot distinguish the repeated phase-encoding positions, so anatomy wraps coherently rather than merely becoming noisier.',
  },
}

const modes = Object.keys(modeContent) as SamplingMode[]

const phaseContent: Record<ReconstructionPhase, { label: string; copy: string }> = {
  correct: { label: 'Original FFT phase', copy: 'The phase calculated from the source template preserves its spatial arrangement.' },
  removed: { label: 'Phase removed', copy: 'All retained coefficients are forced to zero phase; magnitude alone cannot preserve the anatomy.' },
  scrambled: { label: 'Phase scrambled', copy: 'The same coefficient magnitudes receive deterministic random phases, destroying normal spatial organization.' },
}

function hueToRgb(hue: number, value: number) {
  const sector = hue * 6
  const x = value * (1 - Math.abs(sector % 2 - 1))
  const segment = Math.floor(sector) % 6
  const channels = segment === 0 ? [value, x, 0]
    : segment === 1 ? [x, value, 0]
      : segment === 2 ? [0, value, x]
        : segment === 3 ? [0, x, value]
          : segment === 4 ? [x, 0, value]
            : [value, 0, x]
  return channels.map((channel) => Math.round(channel * 255))
}

function ImageDataCanvas({ pixels, size, label, className = '' }: { pixels: Uint8ClampedArray | null; size: number; label: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!pixels) return
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const imageData = context.createImageData(size, size)
    imageData.data.set(pixels)
    context.putImageData(imageData, 0, 0)
  }, [pixels, size])

  return <canvas ref={canvasRef} className={className} width={size} height={size} role="img" aria-label={label} />
}

function grayscalePixels(values: Float64Array, scale: number) {
  const pixels = new Uint8ClampedArray(values.length * 4)
  for (let index = 0; index < values.length; index += 1) {
    const level = Math.round(Math.max(0, Math.min(1, Math.abs(values[index]) / scale)) * 255)
    const output = index * 4
    pixels[output] = level
    pixels[output + 1] = level
    pixels[output + 2] = level
    pixels[output + 3] = 255
  }
  return pixels
}

function spectrumPixels(grid: ComplexGrid, mask: Uint8Array, display: KspaceDisplay, logMaximum: number) {
  const { re, im, size } = grid
  const pixels = new Uint8ClampedArray(re.length * 4)
  for (let shiftedY = 0; shiftedY < size; shiftedY += 1) {
    const sourceY = (shiftedY + size / 2) % size
    for (let shiftedX = 0; shiftedX < size; shiftedX += 1) {
      const sourceX = (shiftedX + size / 2) % size
      const sourceIndex = sourceY * size + sourceX
      const outputIndex = (shiftedY * size + shiftedX) * 4
      const retained = mask[sourceIndex] === 1
      const magnitude = retained ? Math.log1p(Math.hypot(re[sourceIndex], im[sourceIndex])) / logMaximum : 0
      if (display === 'phase' && retained) {
        const hue = (Math.atan2(im[sourceIndex], re[sourceIndex]) + Math.PI) / (2 * Math.PI)
        const [red, green, blue] = hueToRgb(hue, Math.max(0.12, Math.sqrt(magnitude)))
        pixels[outputIndex] = red
        pixels[outputIndex + 1] = green
        pixels[outputIndex + 2] = blue
      } else {
        const level = Math.round(Math.max(0, Math.min(1, Math.sqrt(magnitude))) * 255)
        pixels[outputIndex] = level
        pixels[outputIndex + 1] = level
        pixels[outputIndex + 2] = level
      }
      pixels[outputIndex + 3] = 255
    }
  }
  return pixels
}

function SampledFovCanvas({ source, fieldOfViewMm, matrixSize }: { source: Float64Array | null; fieldOfViewMm: number; matrixSize: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !source) return
    const imageData = context.createImageData(matrixSize, matrixSize)
    const anatomyPixels = matrixSize * 240 / fieldOfViewMm
    const anatomyStart = (matrixSize - anatomyPixels) / 2

    for (let y = 0; y < matrixSize; y += 1) {
      const sourceY = Math.round(((y + 0.5 - anatomyStart) / anatomyPixels) * fftSize - 0.5)
      for (let x = 0; x < matrixSize; x += 1) {
        const sourceX = Math.round(((x + 0.5 - anatomyStart) / anatomyPixels) * fftSize - 0.5)
        const output = (y * matrixSize + x) * 4
        const inside = sourceX >= 0 && sourceX < fftSize && sourceY >= 0 && sourceY < fftSize
        const level = inside ? Math.round(source[sourceY * fftSize + sourceX] * 255) : 0
        imageData.data[output] = level
        imageData.data[output + 1] = level
        imageData.data[output + 2] = level
        imageData.data[output + 3] = 255
      }
    }
    context.putImageData(imageData, 0, 0)
  }, [fieldOfViewMm, matrixSize, source])

  return <canvas ref={canvasRef} className="mri-kspace-sampled-fov" width={matrixSize} height={matrixSize} aria-hidden="true" />
}

function KspaceGeometryDemo({ source, fieldOfViewMm, matrixSize, deltaK, pixelSpacingMm }: { source: Float64Array | null; fieldOfViewMm: number; matrixSize: number; deltaK: number; pixelSpacingMm: number }) {
  const plotCenterX = 160
  const plotCenterY = 120
  const plotHalfWidth = 100
  const maximumDisplayedK = 800
  const kScale = plotHalfWidth / maximumDisplayedK
  const displayedStride = 16
  const regularlyDisplayedIndices = Array.from({ length: matrixSize / displayedStride }, (_, index) => -matrixSize / 2 + index * displayedStride)
  const positiveEdgeIndex = matrixSize / 2 - 1
  const displayedIndices = regularlyDisplayedIndices.includes(positiveEdgeIndex) ? regularlyDisplayedIndices : [...regularlyDisplayedIndices, positiveEdgeIndex]
  const negativeSampleLimit = matrixSize / 2 * deltaK
  const positiveSampleLimit = positiveEdgeIndex * deltaK
  const negativeSampleExtent = negativeSampleLimit * kScale
  const positiveSampleExtent = positiveSampleLimit * kScale
  const extentCenterX = plotCenterX + (positiveSampleExtent - negativeSampleExtent) / 2
  const extentLeft = plotCenterX - negativeSampleExtent
  const extentTop = plotCenterY - positiveSampleExtent
  const extentLabelInside = extentTop <= 24
  const imageFrame = { x: 70, y: 24, size: 180 }
  const gridStep = imageFrame.size * displayedStride / matrixSize
  const gridLines = Array.from({ length: matrixSize / displayedStride + 1 }, (_, index) => imageFrame.x + index * gridStep)

  return (
    <div className="mri-kspace-geometry-demo">
      <figure>
        <figcaption><strong>Physical k-space grid</strong><span>fixed axes · ±800 m⁻¹</span></figcaption>
        <svg viewBox="0 0 320 250" role="img" aria-label={`K-space grid with sample spacing ${deltaK.toFixed(2)} inverse metres, extending from minus ${negativeSampleLimit.toFixed(1)} to plus ${positiveSampleLimit.toFixed(1)} inverse metres`}>
          <title>Physical k-space sampling grid</title>
          <desc>Every sixteenth acquired sample and the positive edge sample are shown on fixed physical axes. The outline follows the actual discrete bounds. Changing field of view changes sample spacing; changing matrix size changes the extent.</desc>
          <defs>
            <marker id="mri-kspace-geometry-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 Z" />
            </marker>
          </defs>
          <rect className="is-k-physical-frame" x="60" y="20" width="200" height="200" />
          <line className="is-k-axis" x1="48" y1={plotCenterY} x2="278" y2={plotCenterY} markerEnd="url(#mri-kspace-geometry-arrow)" />
          <line className="is-k-axis" x1={plotCenterX} y1="232" x2={plotCenterX} y2="8" markerEnd="url(#mri-kspace-geometry-arrow)" />
          <rect className="is-k-extent" x={extentLeft} y={extentTop} width={negativeSampleExtent + positiveSampleExtent} height={negativeSampleExtent + positiveSampleExtent} />
          {displayedIndices.flatMap((ky) => displayedIndices.map((kx) => {
            const x = plotCenterX + kx * deltaK * kScale
            const y = plotCenterY - ky * deltaK * kScale
            const isDc = kx === 0 && ky === 0
            return <circle key={`${kx}-${ky}`} className={isDc ? 'is-k-sample is-dc' : 'is-k-sample'} cx={x} cy={y} r={isDc ? 3.2 : 1.75} />
          }))}
          <text className="is-axis-label" x="282" y={plotCenterY - 7}>kₓ</text>
          <text className="is-axis-label" x={plotCenterX + 8} y="15">kᵧ</text>
          <line className="is-dc-leader" x1={plotCenterX + 4} y1={plotCenterY + 4} x2={plotCenterX + 11} y2={plotCenterY + 19} />
          <text className="is-dc-label" x={plotCenterX + 13} y={plotCenterY + 25}>DC</text>
          <text x="60" y="239">−800</text>
          <text x="260" y="239" textAnchor="end">+800</text>
          <text className="is-extent-label" x={extentLabelInside ? extentLeft + 8 : extentCenterX} y={extentLabelInside ? extentTop + 16 : extentTop - 8} textAnchor={extentLabelInside ? 'start' : 'middle'}>sampled bounds</text>
        </svg>
        <div className="mri-kspace-geometry-key"><span><i className="is-dot" />Every 16th sample; edge included</span><span><i className="is-dc-dot" />DC · k = 0</span><span><i className="is-box" />Actual discrete bounds</span></div>
      </figure>

      <div className="mri-kspace-geometry-bridge" aria-hidden="true"><span>FFT⁻¹</span><i>→</i><small>same N × N array</small></div>

      <figure>
        <figcaption><strong>Reconstructed field of view</strong><span>same anatomy · physical scale</span></figcaption>
        <svg viewBox="0 0 320 250" role="img" aria-label={`${fieldOfViewMm} millimetre field of view reconstructed on a ${matrixSize} by ${matrixSize} grid with ${pixelSpacingMm.toFixed(2)} millimetre nominal pixel spacing`}>
          <title>Reconstructed image grid</title>
          <desc>The anatomy stays at a fixed physical scale and is sampled onto the selected matrix. A larger field of view includes more surrounding space, while a larger matrix divides the field into smaller pixels without inventing source detail.</desc>
          <defs>
            <clipPath id="mri-kspace-image-grid-clip"><rect x={imageFrame.x} y={imageFrame.y} width={imageFrame.size} height={imageFrame.size} /></clipPath>
            <marker id="mri-kspace-fov-arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 Z" /></marker>
          </defs>
          <rect className="is-image-field" x={imageFrame.x} y={imageFrame.y} width={imageFrame.size} height={imageFrame.size} />
          <foreignObject x={imageFrame.x} y={imageFrame.y} width={imageFrame.size} height={imageFrame.size} clipPath="url(#mri-kspace-image-grid-clip)">
            <SampledFovCanvas source={source} fieldOfViewMm={fieldOfViewMm} matrixSize={matrixSize} />
          </foreignObject>
          <g className="is-image-grid" clipPath="url(#mri-kspace-image-grid-clip)">
            {gridLines.map((position) => <line key={`x-${position}`} x1={position} y1={imageFrame.y} x2={position} y2={imageFrame.y + imageFrame.size} />)}
            {gridLines.map((position) => <line key={`y-${position}`} x1={imageFrame.x} y1={position - imageFrame.x + imageFrame.y} x2={imageFrame.x + imageFrame.size} y2={position - imageFrame.x + imageFrame.y} />)}
          </g>
          <rect className="is-fov-outline" x={imageFrame.x} y={imageFrame.y} width={imageFrame.size} height={imageFrame.size} />
          <line className="is-fov-bracket" x1={imageFrame.x} y1="221" x2={imageFrame.x + imageFrame.size} y2="221" markerStart="url(#mri-kspace-fov-arrow)" markerEnd="url(#mri-kspace-fov-arrow)" />
          <text className="is-axis-label" x="160" y="241" textAnchor="middle">FOV</text>
          <text x={imageFrame.x} y="17">grid: N × N</text>
          <text x={imageFrame.x + imageFrame.size} y="17" textAnchor="end">pixel: Δx</text>
        </svg>
        <div className="mri-kspace-geometry-key"><span><i className="is-grid" />Every 16th pixel line shown</span><span><i className="is-anatomy" />Fixed anatomy sampled onto N × N</span></div>
      </figure>
    </div>
  )
}

export function MriKspaceLesson() {
  const [mode, setMode] = useState<SamplingMode>('full')
  const [boundaryPercent, setBoundaryPercent] = useState(38)
  const [acceleration, setAcceleration] = useState(2)
  const [acquiredLines, setAcquiredLines] = useState(fftSize)
  const [isPlaying, setIsPlaying] = useState(false)
  const [display, setDisplay] = useState<KspaceDisplay>('magnitude')
  const [phaseMode, setPhaseMode] = useState<ReconstructionPhase>('correct')
  const [outputScale, setOutputScale] = useState<OutputScale>('fixed')
  const [fieldOfViewMm, setFieldOfViewMm] = useState(240)
  const [matrixSize, setMatrixSize] = useState(128)
  const [source, setSource] = useState<Float64Array | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const sourceMaximum = useMemo(() => source ? Math.max(...source) : 1, [source])
  const spectrum = useMemo(() => source ? forwardFft2d(source, fftSize) : null, [source])
  const samplingTabs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedModeIndex = modes.indexOf(mode)

  const selectMode = (nextMode: SamplingMode) => {
    setIsPlaying(false)
    setMode(nextMode)
  }

  const selectModeFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % modes.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + modes.length) % modes.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = modes.length - 1
    else return
    event.preventDefault()
    selectMode(modes[nextIndex])
    samplingTabs.current[nextIndex]?.focus()
  }

  useEffect(() => {
    let active = true
    const image = new Image()
    image.onload = () => {
      if (!active) return
      const canvas = document.createElement('canvas')
      canvas.width = fftSize
      canvas.height = fftSize
      const context = canvas.getContext('2d')
      if (!context || typeof context.drawImage !== 'function' || typeof context.getImageData !== 'function') {
        setLoadState('error')
        return
      }
      context.fillStyle = '#000'
      context.fillRect(0, 0, fftSize, fftSize)
      context.drawImage(image, 0, 0, fftSize, fftSize)
      const rgba = context.getImageData(0, 0, fftSize, fftSize).data
      const values = new Float64Array(fftSize * fftSize)
      for (let index = 0; index < values.length; index += 1) values[index] = rgba[index * 4] / 255
      setSource(values)
      setLoadState('ready')
    }
    image.onerror = () => { if (active) setLoadState('error') }
    image.src = sourceUrl
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!isPlaying) return
    const timer = window.setTimeout(() => {
      if (acquiredLines >= fftSize) setIsPlaying(false)
      else setAcquiredLines((current) => Math.min(fftSize, current + 2))
    }, 45)
    return () => window.clearTimeout(timer)
  }, [acquiredLines, isPlaying])

  const result = useMemo(() => {
    if (!spectrum) return null
    const selection = buildKspaceMask(spectrum, mode, boundaryPercent, acceleration, acquiredLines)
    const selectedSpectrum = applyKspacePhase(spectrum, selection.mask, phaseMode)
    const reconstruction = inverseFft2d(selectedSpectrum)
    const magnitude = new Float64Array(reconstruction.re.length)
    for (let index = 0; index < magnitude.length; index += 1) magnitude[index] = Math.hypot(reconstruction.re[index], reconstruction.im[index])
    const reconstructionMaximum = Math.max(...magnitude)
    let logMaximum = 0
    for (let index = 0; index < spectrum.re.length; index += 1) logMaximum = Math.max(logMaximum, Math.log1p(Math.hypot(spectrum.re[index], spectrum.im[index])))
    return {
      ...selection,
      kspacePixels: spectrumPixels(selectedSpectrum, selection.mask, display, logMaximum || 1),
      reconstructionPixels: grayscalePixels(magnitude, outputScale === 'normalized' ? reconstructionMaximum || 1 : sourceMaximum || 1),
    }
  }, [acceleration, acquiredLines, boundaryPercent, display, mode, outputScale, phaseMode, sourceMaximum, spectrum])

  const content = modeContent[mode]
  const controlMinimum = mode === 'full' ? 1 : mode === 'regular' ? 2 : 15
  const controlMaximum = mode === 'full' ? fftSize : mode === 'regular' ? 4 : 70
  const controlValue = mode === 'full' ? acquiredLines : mode === 'regular' ? acceleration : boundaryPercent
  const retainedLabel = result ? `${Math.round(result.retainedFraction * 100)}%` : '—'
  const energyLabel = result ? `${Math.round(result.energyFraction * 1000) / 10}%` : '—'
  const fieldOfViewMeters = fieldOfViewMm / 1000
  const deltaK = 1 / fieldOfViewMeters
  const pixelSpacingMm = fieldOfViewMm / matrixSize
  const kMaximum = 1 / (2 * pixelSpacingMm / 1000)

  return (
    <div className="mri-kspace-references">
      <section className="mri-kspace-lab" aria-labelledby="mri-kspace-lab-title">
        <header>
          <div><span>Linked Fourier laboratory</span><h4 id="mri-kspace-lab-title">Acquire, alter, and reconstruct one k-space grid</h4><p>A real CC-licensed magnitude template supplies the anatomy. Its real-valued teaching FFT has Hermitian symmetry; scanner multi-coil k-space is complex, coil-dependent, and need not share that symmetry.</p></div>
          <div className="mri-kspace-display" role="group" aria-label="K-space display">
            <button type="button" className={display === 'magnitude' ? 'is-selected' : ''} aria-pressed={display === 'magnitude'} onClick={() => setDisplay('magnitude')}>Log magnitude</button>
            <button type="button" className={display === 'phase' ? 'is-selected' : ''} aria-pressed={display === 'phase'} onClick={() => setDisplay('phase')}>FFT phase</button>
          </div>
        </header>

        <div className="mri-kspace-tabs" role="tablist" aria-label="K-space sampling pattern">
          {modes.map((item, index) => <button key={item} ref={(element) => { samplingTabs.current[index] = element }} id={`mri-kspace-tab-${item}`} type="button" role="tab" aria-selected={mode === item} aria-controls="mri-kspace-panel" tabIndex={selectedModeIndex === index ? 0 : -1} onKeyDown={(event) => selectModeFromKeyboard(event, index)} onClick={() => selectMode(item)}><small>{modeContent[item].short}</small><strong>{modeContent[item].label}</strong></button>)}
        </div>

        <div className="mri-kspace-data-controls">
          <section>
            <span>Reconstruction phase</span>
            <div role="group" aria-label="Reconstruction phase treatment">
              {(Object.keys(phaseContent) as ReconstructionPhase[]).map((item) => <button key={item} type="button" className={phaseMode === item ? 'is-selected' : ''} aria-pressed={phaseMode === item} onClick={() => setPhaseMode(item)}>{phaseContent[item].label}</button>)}
            </div>
            <small aria-live="polite">{phaseContent[phaseMode].copy}</small>
          </section>
          <section>
            <span>Reconstruction brightness</span>
            <div role="group" aria-label="Reconstruction brightness scale">
              <button type="button" className={outputScale === 'fixed' ? 'is-selected' : ''} aria-pressed={outputScale === 'fixed'} onClick={() => setOutputScale('fixed')}>Fixed scale</button>
              <button type="button" className={outputScale === 'normalized' ? 'is-selected' : ''} aria-pressed={outputScale === 'normalized'} onClick={() => setOutputScale('normalized')}>Normalize preview</button>
            </div>
            <small>{outputScale === 'fixed' ? 'Comparable brightness across masks preserves relative coefficient energy.' : 'Display-only rescaling reveals structure; the coefficients are unchanged.'}</small>
          </section>
        </div>

        <div className="mri-kspace-stage" id="mri-kspace-panel" role="tabpanel" aria-labelledby={`mri-kspace-tab-${mode}`}>
          <figure>
            <figcaption><strong>Image domain</strong><span>x, y</span></figcaption>
            <div className="mri-kspace-image-frame"><img src={sourceUrl} alt="Axial CIE average T2-weighted MR template used as the source image" /></div>
            <div className="mri-kspace-figure-note"><small>Reference magnitude image</small></div>
          </figure>
          <figure>
            <figcaption><strong>Retained k-space</strong><span>kᵧ ↑ · kₓ →</span></figcaption>
            <div className="mri-kspace-canvas-frame is-kspace">
              <ImageDataCanvas pixels={result?.kspacePixels ?? null} size={fftSize} label={`${display === 'magnitude' ? 'Log magnitude' : 'Phase'} of retained complex k-space for ${content.label}`} />
              {loadState !== 'ready' && <span className="mri-kspace-load-state" role={loadState === 'error' ? 'alert' : 'status'}>{loadState === 'error' ? 'FFT could not be prepared.' : 'Preparing FFT…'}</span>}
            </div>
            <div className="mri-kspace-figure-note">
              <small>{display === 'magnitude' ? 'FFT-shifted display · DC centered · log magnitude' : 'FFT-shifted display · hue is cyclic phase · DC centered'}</small>
              {display === 'phase' && <div className="mri-kspace-phase-key" aria-label="Cyclic phase color key from minus pi through zero to plus pi"><span>−π</span><i /><span>0</span><i /><span>+π</span></div>}
            </div>
          </figure>
          <figure>
            <figcaption><strong>Zero-filled reconstruction</strong><span>FFT⁻¹</span></figcaption>
            <div className="mri-kspace-canvas-frame">
              <ImageDataCanvas pixels={result?.reconstructionPixels ?? null} size={fftSize} label={`Zero-filled inverse Fourier reconstruction using ${content.label}, ${phaseContent[phaseMode].label}, and ${outputScale} brightness`} />
              {loadState !== 'ready' && <span className="mri-kspace-load-state" aria-hidden="true">{loadState === 'error' ? 'Unavailable' : 'Preparing…'}</span>}
            </div>
            <div className="mri-kspace-figure-note"><small>{outputScale === 'fixed' ? 'Fixed scale across every mask' : 'Preview normalized to its own maximum'}</small></div>
          </figure>
        </div>

        <div className="mri-kspace-controls">
          <div className="mri-kspace-control-block">
            <div className="mri-kspace-control-heading">
              <label htmlFor="mri-kspace-primary-control"><strong>{mode === 'full' ? 'Acquired phase-encode lines · kᵧ' : mode === 'regular' ? 'Acceleration factor · R' : 'Boundary of circular teaching mask'}</strong></label>
              <div>
                {mode === 'full' && <button type="button" className="mri-kspace-play" aria-label={isPlaying ? 'Pause k-space acquisition' : acquiredLines === fftSize ? 'Replay k-space acquisition' : 'Continue k-space acquisition'} onClick={() => { if (isPlaying) setIsPlaying(false); else { if (acquiredLines === fftSize) setAcquiredLines(1); setIsPlaying(true) } }}>{isPlaying ? <Pause aria-hidden="true" /> : acquiredLines === fftSize ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}<span>{isPlaying ? 'Pause' : acquiredLines === fftSize ? 'Replay fill' : 'Continue'}</span></button>}
                <output>{mode === 'full' ? `${acquiredLines} / ${fftSize}` : mode === 'regular' ? `${acceleration}×` : `${boundaryPercent}%`}</output>
              </div>
            </div>
            <input
              id="mri-kspace-primary-control"
              aria-label={mode === 'full' ? 'Acquired phase encode line count' : mode === 'regular' ? 'K-space acceleration factor' : 'K-space radial boundary'}
              type="range"
              min={controlMinimum}
              max={controlMaximum}
              step={mode === 'regular' ? 1 : 1}
              value={controlValue}
              style={ctRangeProgressStyle(controlValue, controlMinimum, controlMaximum)}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (mode === 'full') { setIsPlaying(false); setAcquiredLines(value) }
                else if (mode === 'regular') setAcceleration(value)
                else setBoundaryPercent(value)
              }}
            />
            <small>{mode === 'full' ? 'Center-out order is shown for teaching; actual acquisition order is sequence dependent.' : mode === 'regular' ? 'R controls how many regularly spaced phase-encoding lines are retained.' : 'Radius is measured from DC toward the k-space edge; this is not a standard trajectory.'}</small>
          </div>
          <dl aria-live="polite">
            <div><dt>{mode === 'full' ? 'kᵧ lines acquired' : 'Samples retained'}</dt><dd>{mode === 'full' ? `${acquiredLines} / ${fftSize}` : retainedLabel}</dd></div>
            <div><dt>Fourier energy · Σ|S|²</dt><dd>{energyLabel}</dd></div>
            <div><dt>Reconstruction</dt><dd>Zero-filled FFT⁻¹</dd></div>
          </dl>
        </div>

        <div className="mri-kspace-stage-copy" aria-live="polite"><strong>{content.title}</strong><p>{content.copy}</p></div>
        <footer className="mri-kspace-source"><span>Real CIE magnitude template · derived Hermitian 128 × 128 teaching FFT · not scanner raw data</span><a href="https://doi.org/10.5281/zenodo.5018356" target="_blank" rel="noreferrer">Dadar et al. · CC BY 4.0 <ExternalLink aria-hidden="true" /></a></footer>
      </section>

      <section className="mri-kspace-reference" aria-labelledby="mri-kspace-reference-title">
        <header><span>Grid geometry</span><h4 id="mri-kspace-reference-title">How sample spacing becomes an image array</h4><p>Use a hypothetical square Cartesian acquisition to separate field of view from nominal pixel spacing. These sampling values describe the reconstruction grid, not guaranteed effective anatomical resolution.</p></header>
        <div className="mri-kspace-geometry-controls">
          <label><span><strong>Field of view</strong><output>{fieldOfViewMm} mm</output></span><input aria-label="Teaching field of view" type="range" min="160" max="320" step="10" value={fieldOfViewMm} style={ctRangeProgressStyle(fieldOfViewMm, 160, 320)} onChange={(event) => setFieldOfViewMm(Number(event.target.value))} /><small>At fixed matrix size, a larger FOV increases pixel spacing and decreases Δk.</small></label>
          <label><span><strong>Matrix size · N</strong><output>{matrixSize} × {matrixSize}</output></span><input aria-label="Teaching reconstruction matrix size" type="range" min="64" max="256" step="32" value={matrixSize} style={ctRangeProgressStyle(matrixSize, 64, 256)} onChange={(event) => setMatrixSize(Number(event.target.value))} /><small>At fixed FOV, more samples extend k-space and reduce nominal pixel spacing.</small></label>
        </div>
        <KspaceGeometryDemo source={source} fieldOfViewMm={fieldOfViewMm} matrixSize={matrixSize} deltaK={deltaK} pixelSpacingMm={pixelSpacingMm} />
        <div className="mri-kspace-geometry-results" aria-live="polite">
          <article><span>Sample spacing</span><strong>Δk = 1 / FOV</strong><output>{deltaK.toFixed(2)} m⁻¹</output><p>Closer k-space samples reconstruct a wider field of view.</p></article>
          <article><span>Nominal pixel spacing</span><strong>Δx = FOV / N</strong><output>{pixelSpacingMm.toFixed(2)} mm</output><p>Pixel spacing describes the grid; interpolation cannot create measured detail.</p></article>
          <article><span>Approximate extent</span><strong>k<sub>max</sub> ≈ 1 / (2Δx)</strong><output>{kMaximum.toFixed(1)} m⁻¹</output><p>Greater sampled extent supports faster spatial variation.</p></article>
        </div>
        <div className="mri-kspace-reference-heading"><span>Raw-array anatomy</span><h5>What one k-space entry means</h5><p>A displayed k-space image is only a visualization. The reconstructable object is a complex array with coordinates and acquisition dimensions.</p></div>
        <div className="mri-kspace-reference-grid">
          <article><span>Value</span><strong>s(kₓ, kᵧ) = a + ib</strong><p>Real and imaginary components preserve magnitude and phase. Both are needed for a faithful inverse transform.</p></article>
          <article><span>Coordinate</span><strong>One spatial-frequency basis</strong><p>kₓ and kᵧ identify oscillation rate and direction across the field of view—not one voxel address.</p></article>
          <article><span>Surrounding axes</span><strong>Coil · echo · frame · kᶻ</strong><p>Raw arrays may retain receiver channels, repetitions, time points, echoes, partitions, or trajectories.</p></article>
          <article><span>Display</span><strong>log |s| is diagnostic only</strong><p>Log magnitude discards phase and changes scale. This view is FFT-shifted to center DC; stored arrays may instead place DC at index (0, 0).</p></article>
        </div>
        <aside><strong>ML implication</strong><p>Preserve the complex values, sampling mask or trajectory, FOV and matrix geometry, coil dimension, scaling, and reconstruction provenance. A PNG of k-space cannot reproduce the acquired data.</p></aside>
      </section>
    </div>
  )
}
