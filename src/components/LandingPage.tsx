import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import ctSliceUrl from '../assets/ct/lidc-idri-0001-i060-hu16le.bin?url'
import ctVolumeUrl from '../assets/ct/lidc-idri-0001-chest-192x192x133-hu16le.bin?url'
import ctVolumeMetadata from '../assets/ct/lidc-idri-0001-chest-volume.json'
import type { Modality } from '../types'

const LandingXrayPatient3d = lazy(() => import('./LandingXrayPatient3d'))
const LandingCtScanner3d = lazy(() => import('./LandingCtScanner3d'))
const LandingImageData3d = lazy(() => import('./LandingImageData3d'))

type LandingPageProps = {
  onActiveChange: (modality: Modality | null) => void
  onOpenModule: (modality: Modality) => void
}

type Showcase = {
  id: Modality
  eyebrow: string
  title: string
  description: string
  sequence: string[]
  accent: string
}

const showcases: Showcase[] = [
  {
    id: 'xray',
    eyebrow: 'Projection imaging',
    title: 'X-ray records a two-dimensional projection.',
    description: 'Follow photons from source to detector and see how geometry, attenuation, and overlap shape the radiograph before any model sees it.',
    sequence: ['Source', 'Patient', 'Detector', 'Projection'],
    accent: '#45d7f0',
  },
  {
    id: 'ct',
    eyebrow: 'Computed tomography',
    title: 'CT reconstructs slices from many angular views.',
    description: 'Rotate around the patient, assemble detector measurements into a sinogram, and reconstruct axial slices into a spatial volume.',
    sequence: ['Views', 'Sinogram', 'Reconstruction', 'Volume'],
    accent: '#30b7d8',
  },
  {
    id: 'windowing',
    eyebrow: 'CT display',
    title: 'Windowing maps Hounsfield units to display brightness.',
    description: 'Map quantitative Hounsfield units into a finite display range and see why window choice changes visibility without changing the underlying voxels.',
    sequence: ['HU values', 'Window', 'Display', 'Model input'],
    accent: '#f0a24a',
  },
  {
    id: 'mri',
    eyebrow: 'Magnetic resonance',
    title: 'MRI encodes hydrogen signal into k-space.',
    description: 'Connect hydrogen magnetization, RF excitation, gradients, receive-coil voltage, k-space, and Fourier reconstruction as one measurement chain.',
    sequence: ['Magnetize', 'Excite', 'Encode', 'Reconstruct'],
    accent: '#a987ff',
  },
  {
    id: 'image-data',
    eyebrow: 'Image data',
    title: 'Geometry gives image arrays physical meaning.',
    description: 'Carry values, orientation, spacing, coordinate systems, and provenance from scanner output into arrays that an ML pipeline can interpret correctly.',
    sequence: ['Frames', 'Geometry', 'Volume', 'Tensor'],
    accent: '#5fcf8b',
  },
]

function ClinicalCtCanvas({ pixels, center, width, label, className = '', style }: { pixels: Int16Array | null; center: number; width: number; label: string; className?: string; style?: CSSProperties }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !pixels || pixels.length < 512 * 512) return
    const context = canvas.getContext('2d')
    if (!context) return
    const image = context.createImageData(512, 512)
    const low = center - width / 2
    for (let index = 0; index < 512 * 512; index += 1) {
      const value = Math.max(0, Math.min(1, (pixels[index]! - low) / width))
      const gray = Math.round(value * 255)
      const offset = index * 4
      image.data[offset] = gray
      image.data[offset + 1] = gray
      image.data[offset + 2] = gray
      image.data[offset + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [center, pixels, width])

  return <canvas ref={canvasRef} className={`landing-clinical-canvas${className ? ` ${className}` : ''}`} style={style} width="512" height="512" role="img" aria-label={label} />
}

function ClinicalCtVolumeSliceCanvas({ volume, sliceIndex, label, className = '', style }: { volume: Int16Array | null; sliceIndex: number; label: string; className?: string; style?: CSSProperties }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { width, height, depth } = ctVolumeMetadata

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const image = context.createImageData(width, height)
    const pixelsPerSlice = width * height
    const boundedSlice = Math.max(0, Math.min(depth - 1, sliceIndex))
    const sourceStart = boundedSlice * pixelsPerSlice
    const windowCenter = -500
    const windowWidth = 1500
    const windowLow = windowCenter - (windowWidth / 2)

    for (let pixel = 0; pixel < pixelsPerSlice; pixel += 1) {
      const hu = volume?.[sourceStart + pixel] ?? -1024
      const normalized = Math.max(0, Math.min(1, (hu - windowLow) / windowWidth))
      const gray = Math.round(normalized * 255)
      const output = pixel * 4
      image.data[output] = Math.round(gray * 0.93)
      image.data[output + 1] = Math.round(gray * 0.98)
      image.data[output + 2] = gray
      image.data[output + 3] = 255
    }

    context.putImageData(image, 0, 0)
  }, [depth, height, sliceIndex, volume, width])

  return (
    <canvas
      ref={canvasRef}
      className={`landing-clinical-canvas${className ? ` ${className}` : ''}`}
      style={style}
      width={width}
      height={height}
      role="img"
      aria-label={label}
    />
  )
}

function XrayLandingVisual() {
  return (
    <>
      <svg viewBox="0 0 760 520" role="img" aria-label="X-ray source projecting through a patient and forming a real chest radiograph at the detector">
        <defs>
          <radialGradient id="landing-xray-body" cx="42%" cy="28%" r="72%">
            <stop offset="0" stopColor="#f4fbff" stopOpacity=".84" />
            <stop offset="1" stopColor="#6d8796" stopOpacity=".48" />
          </radialGradient>
          <linearGradient id="landing-xray-beam" x1="0" x2="1">
            <stop stopColor="#45d7f0" stopOpacity=".08" />
            <stop offset="1" stopColor="#45d7f0" stopOpacity=".3" />
          </linearGradient>
          <filter id="landing-xray-glow"><feGaussianBlur stdDeviation="8" /></filter>
        </defs>
        <path className="landing-xray-beam" d="M76 260 522 105v250Z" fill="url(#landing-xray-beam)" />
        <path d="M76 260 522 105M76 260l446 95" fill="none" stroke="#75e5f6" strokeOpacity=".72" strokeWidth="2" />
        <circle className="landing-source-glow" cx="76" cy="260" r="28" fill="#45d7f0" opacity=".3" filter="url(#landing-xray-glow)" />
        <circle cx="76" cy="260" r="14" fill="#bff6ff" />
        <g className="landing-xray-detector">
          <rect x="522" y="104" width="215" height="252" rx="14" fill="#071014" stroke="#8cecff" strokeWidth="3" />
          <image href="/assets/landing/normal-pa-chest-xray.jpg" x="530" y="112" width="199" height="236" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Normal posteroanterior chest radiograph" />
          <rect x="530" y="112" width="199" height="236" rx="8" fill="none" stroke="#e8fbff" strokeOpacity=".32" />
        </g>
      </svg>
      <div className="landing-xray-patient-3d" aria-hidden="true"><Suspense fallback={<span className="landing-xray-patient-loading" />}><LandingXrayPatient3d /></Suspense></div>
      <p className="landing-source-credit">Normal PA chest radiograph · CC0</p>
    </>
  )
}

function CtLandingVisual({ volume }: { volume: Int16Array | null }) {
  const [scanProgress, setScanProgress] = useState(0)

  useEffect(() => {
    const cycleDuration = 7000
    const acquisitionDuration = 5600
    let animationFrame = 0
    let cycleStart = performance.now()

    const update = (now: number) => {
      const elapsed = now - cycleStart
      if (elapsed >= cycleDuration) cycleStart = now - (elapsed % cycleDuration)
      const cycleElapsed = (now - cycleStart) % cycleDuration
      setScanProgress(Math.min(1, cycleElapsed / acquisitionDuration))
      animationFrame = window.requestAnimationFrame(update)
    }

    animationFrame = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [])

  const [firstSuperiorSlice, lastInferiorSlice] = ctVolumeMetadata.teachingRangeIndices
  const totalStackLayers = lastInferiorSlice - firstSuperiorSlice + 1
  const visibleStackLayers = Math.max(1, Math.min(totalStackLayers, Math.floor(scanProgress * (totalStackLayers - 1)) + 1))
  const acquiredSliceIndices = Array.from({ length: visibleStackLayers }, (_, index) => lastInferiorSlice - index)
  const currentSlice = acquiredSliceIndices[acquiredSliceIndices.length - 1] ?? lastInferiorSlice
  const gantryAngle = scanProgress * 9 * Math.PI * 2

  return (
    <>
      <svg viewBox="0 0 760 520" role="img" aria-label="A CT acquisition plane moving along a sagittal patient while reconstructed axial slices accumulate into a volume">
        <rect x="28" y="76" width="414" height="350" rx="24" fill="#071419" fillOpacity=".3" stroke="#75e5f6" strokeOpacity=".16" />

        <foreignObject x="462" y="76" width="270" height="350">
          <div className="ct-volume-stack-stage landing-ct-volume-stack-stage" role="img" aria-label={`Accumulated CT volume with ${visibleStackLayers} of ${totalStackLayers} axial slices; current source slice ${currentSlice}`}>
            <strong className="landing-ct-volume-heading">RECONSTRUCTED VOLUME</strong>
            <div className="ct-volume-stack landing-ct-volume-stack">
              {acquiredSliceIndices.map((sliceIndex, index) => (
                <ClinicalCtVolumeSliceCanvas
                  key={sliceIndex}
                  volume={volume}
                  sliceIndex={sliceIndex}
                  label={`Accumulated real CT slice ${index + 1} of ${totalStackLayers}; source slice ${sliceIndex}`}
                  className={index === visibleStackLayers - 1 ? 'is-current' : ''}
                  style={{ '--stack-offset': index } as CSSProperties}
                />
              ))}
            </div>
            <div className="ct-volume-stack-axis" aria-hidden="true"><span>Inferior</span><i /><span>Superior</span></div>
          </div>
        </foreignObject>
      </svg>
      <div className="landing-ct-scanner-3d" aria-hidden="true">
        <strong className="landing-ct-scanner-heading">ACQUISITION ALONG THE PATIENT</strong>
        <Suspense fallback={<span className="landing-xray-patient-loading" />}>
          <LandingCtScanner3d scanProgress={scanProgress} gantryAngle={gantryAngle} />
        </Suspense>
      </div>
      <p className="landing-source-credit">LIDC-IDRI-0001 · CC BY 3.0</p>
    </>
  )
}

function WindowingLandingVisual({ pixels }: { pixels: Int16Array | null }) {
  return (
    <>
      <svg viewBox="0 0 760 520" role="img" aria-label="The same real CT slice displayed with three window settings">
        <defs><linearGradient id="landing-window-ramp"><stop stopColor="#050607" /><stop offset="1" stopColor="#fff" /></linearGradient></defs>
        {[
          { x: 92, center: -500, width: 1500, name: 'Lung', detail: 'W 1500 · C −500' },
          { x: 296, center: 40, width: 400, name: 'Soft tissue', detail: 'W 400 · C 40' },
          { x: 500, center: 400, width: 1800, name: 'Bone', detail: 'W 1800 · C 400' },
        ].map((setting) => (
          <g key={setting.name}>
            <rect x={setting.x - 9} y="105" width="178" height="222" rx="15" fill="#071014" stroke="#fff" strokeOpacity=".13" />
            <foreignObject x={setting.x} y="115" width="160" height="160">
              <div className="landing-svg-ct-image">
                <ClinicalCtCanvas pixels={pixels} center={setting.center} width={setting.width} label={`Real CT slice with ${setting.name.toLowerCase()} window`} />
              </div>
            </foreignObject>
            <text x={setting.x + 80} y="298" textAnchor="middle" fill="#f7fbff" fontSize="15" fontWeight="700">{setting.name}</text>
            <text x={setting.x + 80} y="316" textAnchor="middle" fill="#b8c0c5" fontSize="11">{setting.detail} HU</text>
          </g>
        ))}
        <g className="landing-window-cursor">
          <animateTransform attributeName="transform" type="translate" values="-204 0;-204 0;0 0;0 0;204 0;204 0;-204 0" keyTimes="0;.28;.34;.62;.68;.95;1" dur="9s" repeatCount="indefinite" />
          <rect x="276" y="92" width="200" height="248" rx="20" fill="#f0a24a" fillOpacity=".045" stroke="#f0a24a" strokeWidth="4" />
          <circle cx="376" cy="350" r="8" fill="#ffd39f" />
        </g>
        <g className="landing-window-readout">
          <text x="380" y="370" textAnchor="middle" fill="#f0a24a" fontSize="12" fontWeight="750">
            Lung window · −1250 to 250 HU
            <animate attributeName="opacity" values="1;1;0;0;0;0;1" keyTimes="0;.28;.34;.62;.68;.95;1" dur="9s" repeatCount="indefinite" />
          </text>
          <text x="380" y="370" textAnchor="middle" fill="#f0a24a" fontSize="12" fontWeight="750" opacity="0">
            Soft-tissue window · −160 to 240 HU
            <animate attributeName="opacity" values="0;0;1;1;0;0;0" keyTimes="0;.28;.34;.62;.68;.95;1" dur="9s" repeatCount="indefinite" />
          </text>
          <text x="380" y="370" textAnchor="middle" fill="#f0a24a" fontSize="12" fontWeight="750" opacity="0">
            Bone window · −500 to 1300 HU
            <animate attributeName="opacity" values="0;0;0;0;1;1;0" keyTimes="0;.28;.34;.62;.68;.95;1" dur="9s" repeatCount="indefinite" />
          </text>
          <rect x="104" y="392" width="552" height="18" rx="9" fill="url(#landing-window-ramp)" stroke="#fff" strokeOpacity=".2" />
          <rect x="150" y="385" width="276" height="32" rx="7" fill="#f0a24a" fillOpacity=".12" stroke="#f0a24a" strokeWidth="3">
            <animate attributeName="x" values="150;150;351;351;288;288;150" keyTimes="0;.28;.34;.62;.68;.95;1" dur="9s" repeatCount="indefinite" />
            <animate attributeName="width" values="276;276;74;74;331;331;276" keyTimes="0;.28;.34;.62;.68;.95;1" dur="9s" repeatCount="indefinite" />
          </rect>
          <text x="104" y="438" fill="#9ba0a5" fontSize="10">−1500 HU</text>
          <text x="380" y="438" fill="#9ba0a5" fontSize="10" textAnchor="middle">0 HU</text>
          <text x="656" y="438" fill="#9ba0a5" fontSize="10" textAnchor="end">+1500 HU</text>
        </g>
      </svg>
      <p className="landing-source-credit">Same LIDC-IDRI CT values · three display mappings</p>
    </>
  )
}

function MriLandingVisual() {
  return (
    <>
      <svg viewBox="0 0 760 520" role="img" aria-label="MRI field, excited spins, receive signal, and a real reconstructed MR image">
        <defs>
          <radialGradient id="landing-mri-bore"><stop stopColor="#09121d" /><stop offset=".67" stopColor="#172135" /><stop offset="1" stopColor="#566176" /></radialGradient>
          <filter id="landing-mri-glow"><feGaussianBlur stdDeviation="9" /></filter>
        </defs>
        <g className="landing-mri-scanner">
          <ellipse cx="280" cy="257" rx="180" ry="190" fill="none" stroke="#dce4ee" strokeOpacity=".78" strokeWidth="60" />
          <ellipse cx="280" cy="257" rx="138" ry="148" fill="url(#landing-mri-bore)" stroke="#a987ff" strokeOpacity=".4" strokeWidth="5" />
          <path d="M46 356h300" stroke="#dce4ee" strokeOpacity=".58" strokeWidth="28" strokeLinecap="round" />
        </g>
        <g className="landing-mri-fields" fill="none" stroke="#6bcfff" strokeWidth="2">
          <ellipse cx="280" cy="257" rx="207" ry="105" opacity=".26" />
          <ellipse cx="280" cy="257" rx="208" ry="141" opacity=".34" transform="rotate(30 280 257)" />
          <ellipse cx="280" cy="257" rx="208" ry="141" opacity=".34" transform="rotate(-30 280 257)" />
        </g>
        <g className="landing-mri-grid" stroke="#a987ff" strokeOpacity=".13" strokeWidth="1">
          {[220, 260, 300, 340].map((x) => <line key={`column-${x}`} x1={x} y1="190" x2={x} y2="328" />)}
          {[202, 239, 276, 313].map((y) => <line key={`row-${y}`} x1="207" y1={y} x2="353" y2={y} />)}
        </g>
        <g className="landing-mri-spins" stroke="#e6dfff" strokeWidth="4" strokeLinecap="round">
          {Array.from({ length: 16 }, (_, index) => {
            const row = Math.floor(index / 4)
            const column = index % 4
            const duration = [1.65, 2.35, 2.35, 1.65][column]!
            const phase = row * 28 + column * 14
            const direction = column < 2 ? -1 : 1
            return (
              <g key={index} transform={`translate(${220 + column * 40} ${202 + row * 37})`}>
                <g className="landing-mri-dipole">
                  <animateTransform attributeName="transform" type="rotate" from={`${phase} 0 0`} to={`${phase + direction * 360} 0 0`} dur={`${duration}s`} repeatCount="indefinite" />
                  <circle r="6" fill="#a987ff" stroke="none" />
                  <path d="M0 0V-22" />
                  <path d="m-5-16 5-7 5 7" fill="none" />
                </g>
              </g>
            )
          })}
        </g>
        <text x="196" y="258" fill="#b9a4e8" fontSize="9" textAnchor="middle" transform="rotate(-90 196 258)">phase offset</text>
        <text x="280" y="346" fill="#b9a4e8" fontSize="9" textAnchor="middle">frequency shift</text>
        <g className="landing-mri-rf">
          <circle cx="280" cy="257" r="62" fill="none" stroke="#c78fff" strokeWidth="5" opacity=".28" filter="url(#landing-mri-glow)" />
          <circle cx="280" cy="257" r="78" fill="none" stroke="#c78fff" strokeWidth="3" opacity=".55" />
        </g>
        <g className="landing-mri-output">
          <rect x="493" y="110" width="202" height="298" rx="18" fill="#090d14" stroke="#a987ff" strokeOpacity=".46" />
          <image href="/assets/mri/cie-template-t2.png" x="504" y="122" width="180" height="180" role="img" aria-label="Axial T2-weighted population-average brain MRI" />
          <path d="M505 354h166" stroke="#fff" strokeOpacity=".16" />
          <path className="landing-mri-signal-trace" d="M505 354q9-36 18 0t18 0q9-27 18 0t18 0q9-18 18 0t18 0q9-10 18 0t18 0" fill="none" stroke="#c5a9ff" strokeWidth="3" />
          <text x="504" y="330" fill="#cbbdea" fontSize="11" fontWeight="700">RECEIVED SIGNAL → IMAGE</text>
        </g>
      </svg>
      <p className="landing-source-credit">CIE T2 template · Dadar et al. · CC BY 4.0</p>
    </>
  )
}

function DataLandingVisual({ volume }: { volume: Int16Array | null }) {
  return (
    <div className="landing-data-3d" role="img" aria-label="Three-dimensional image-data scene with real axial, coronal, and sagittal CT faces on the left and cropped anatomical torso in a patient-space coordinate grid on the right">
      <Suspense fallback={<span className="landing-xray-patient-loading" />}><LandingImageData3d volume={volume} /></Suspense>
      <div className="landing-data-3d-label is-cube"><strong>VOXEL VOLUME</strong><span>axial · coronal · sagittal faces</span></div>
      <div className="landing-data-3d-label is-volume"><strong>PATIENT-SPACE VOLUME</strong><span>lower abdomen → neck · x / y / z</span></div>
      <div className="landing-data-tensor-card"><strong>C × D × H × W</strong><span>voxel array + affine geometry</span></div>
      <p className="landing-source-credit">LIDC-IDRI CT · BodyParts3D anatomical reference</p>
    </div>
  )
}

function LandingVisual({ modality, ctPixels, ctVolume }: { modality: Modality; ctPixels: Int16Array | null; ctVolume: Int16Array | null }) {
  if (modality === 'xray') return <XrayLandingVisual />
  if (modality === 'ct') return <CtLandingVisual volume={ctVolume} />
  if (modality === 'windowing') return <WindowingLandingVisual pixels={ctPixels} />
  if (modality === 'mri') return <MriLandingVisual />
  return <DataLandingVisual volume={ctVolume} />
}

export default function LandingPage({ onActiveChange, onOpenModule }: LandingPageProps) {
  const sectionRefs = useRef<Array<HTMLElement | null>>([])
  const activeRef = useRef<Modality | null>(null)
  const [ctPixels, setCtPixels] = useState<Int16Array | null>(null)
  const [ctVolume, setCtVolume] = useState<Int16Array | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(ctSliceUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`CT image request failed: ${response.status}`)
        return response.arrayBuffer()
      })
      .then((buffer) => setCtPixels(new Int16Array(buffer)))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.error(error)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(ctVolumeUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`CT volume request failed: ${response.status}`)
        return response.arrayBuffer()
      })
      .then((buffer) => setCtVolume(new Int16Array(buffer)))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.error(error)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    let animationFrame = 0

    const updateSections = () => {
      animationFrame = 0
      const viewportHeight = window.innerHeight || 800
      const compactLayout = window.innerWidth <= 900
      const focusLine = viewportHeight * 0.5
      let nextActive: Modality | null = null
      let nearestDistance = Number.POSITIVE_INFINITY

      sectionRefs.current.forEach((section, index) => {
        if (!section) return
        const rect = section.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const distance = Math.abs(center - focusLine)
        const visible = rect.bottom > viewportHeight * 0.16 && rect.top < viewportHeight * 0.84
        const normalizedDistance = Math.min(1, distance / (viewportHeight * 0.95))
        const presence = visible ? Math.max(0.16, 1 - normalizedDistance) : 0.08
        const direction = index % 2 === 0 ? 1 : -1
        const travel = Math.max(-1, Math.min(1, (center - focusLine) / viewportHeight))

        section.style.setProperty('--section-opacity', presence.toFixed(3))
        section.style.setProperty('--section-scale', (0.965 + presence * 0.035).toFixed(3))
        section.style.setProperty('--section-shift-x', compactLayout ? '0px' : `${(travel * direction * 74).toFixed(1)}px`)
        section.style.setProperty('--section-copy-shift', compactLayout ? '0px' : `${(travel * direction * -34).toFixed(1)}px`)

        if (visible && distance < nearestDistance) {
          nearestDistance = distance
          nextActive = showcases[index]?.id ?? null
        }
      })

      if (activeRef.current !== nextActive) {
        activeRef.current = nextActive
        onActiveChange(nextActive)
      }
    }

    const requestUpdate = () => {
      if (animationFrame) return
      animationFrame = window.requestAnimationFrame(updateSections)
    }

    updateSections()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    return () => {
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      activeRef.current = null
      onActiveChange(null)
    }
  }, [onActiveChange])

  return (
    <div className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-orbit" aria-hidden="true">
          <span /><span /><span />
        </div>
        <p className="landing-overline">Interactive acquisition and image formation</p>
        <h1 id="landing-title">Interactive Radiology</h1>
        <p className="landing-hero-copy">See how physical measurements become images—and how those images become data an ML system can use.</p>
        <div className="landing-path" aria-label="Learning path">
          <span>Acquire</span><b>→</b><span>Reconstruct</span><b>→</b><span>Display</span><b>→</b><span>Model</span>
        </div>
        <a className="landing-scroll-cue" href="#landing-xray">
          <span>Explore the imaging chain</span>
          <ChevronDown aria-hidden="true" />
        </a>
      </section>

      <div className="landing-showcases">
        {showcases.map((showcase, index) => {
          const style = { '--showcase-accent': showcase.accent } as CSSProperties
          return (
            <section
              ref={(node) => { sectionRefs.current[index] = node }}
              key={showcase.id}
              id={`landing-${showcase.id}`}
              className={`landing-showcase landing-showcase-${showcase.id}`}
              style={style}
              data-modality={showcase.id}
            >
              <div className="landing-showcase-sticky">
                <div className="landing-showcase-copy">
                  <p className="landing-showcase-index">0{index + 1} <span>{showcase.eyebrow}</span></p>
                  <h2>{showcase.title}</h2>
                  <p>{showcase.description}</p>
                  <ol className="landing-sequence" aria-label={`${showcase.eyebrow} measurement chain`}>
                    {showcase.sequence.map((step, stepIndex) => <li key={step}><span>{stepIndex + 1}</span>{step}</li>)}
                  </ol>
                  <button className="landing-module-button" type="button" onClick={() => onOpenModule(showcase.id)}>
                    Explore {showcase.id === 'image-data' ? 'Image Data' : showcase.id === 'windowing' ? 'CT Windowing' : showcase.id === 'xray' ? 'X-ray' : showcase.id.toUpperCase()}
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
                <div className="landing-visual-shell">
                  <div className="landing-visual-grid" aria-hidden="true" />
                  <LandingVisual modality={showcase.id} ctPixels={ctPixels} ctVolume={ctVolume} />
                  <div className="landing-visual-caption"><span />{showcase.sequence.join(' · ')}</div>
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <section className="landing-finale">
        <h2>Let’s start.</h2>
        <button type="button" onClick={() => onOpenModule('xray')}>Begin with X-ray <ArrowRight aria-hidden="true" /></button>
      </section>
    </div>
  )
}
