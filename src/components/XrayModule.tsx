import { Atom, Boxes, ExternalLink, MousePointer2, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AcquisitionControls } from './AcquisitionControls'
import { DetectorImage } from './DetectorImage'
import { XrayScene } from './XrayScene'
import { describeRtSelection, detectRtCapabilities, detectWebGl2Support, selectRtBackend } from '../rendering/rtBackend'
import { DEFAULT_XRAY_SETTINGS, deriveXrayState, getProjectionGeometry } from '../simulation/xray'
import type { CameraPreset, ExposurePhase, Projection, XraySettings } from '../types'
import type { RtBackendSelection } from '../rendering/rtBackend'

const cameraPresets: CameraPreset[] = ['Room', 'Beam', 'Patient', 'Detector']
type RenderMode = 'standard' | 'hq' | 'rt'

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

function useRtBackendSelection(): RtBackendSelection {
  const [selection, setSelection] = useState<RtBackendSelection>(() => {
    const capabilities = { webgpu: false, webgl2: detectWebGl2Support() }
    return { backend: selectRtBackend(capabilities), capabilities, probing: true }
  })

  useEffect(() => {
    let active = true
    void detectRtCapabilities(selection.capabilities.webgl2).then((capabilities) => {
      if (!active) return
      setSelection({ backend: selectRtBackend(capabilities), capabilities, probing: false })
    })
    return () => { active = false }
  }, [selection.capabilities.webgl2])

  return selection
}

export default function XrayModule() {
  const [settings, setSettings] = useState<XraySettings>(DEFAULT_XRAY_SETTINGS)
  const [phase, setPhase] = useState<ExposurePhase>('ready')
  const [captureId, setCaptureId] = useState(0)
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('Beam')
  const [renderMode, setRenderMode] = useState<RenderMode>('hq')
  const timers = useRef<number[]>([])
  const rtStatusRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const rtSelection = useRtBackendSelection()
  const rayTracingSupported = rtSelection.backend !== null
  const rtDescription = describeRtSelection(rtSelection)
  const derived = useMemo(() => deriveXrayState(settings), [settings])
  const projectionGeometry = getProjectionGeometry(settings.projection)

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  const updateSetting = (setting: Exclude<keyof XraySettings, 'projection'>, value: number) => setSettings((current) => ({ ...current, [setting]: value }))
  const updateProjection = (projection: Projection) => { setSettings((current) => ({ ...current, projection, rotation: 0 })); setCameraPreset('Beam') }
  const toggleRenderMode = (mode: Exclude<RenderMode, 'standard'>) => setRenderMode((current) => current === mode ? 'standard' : mode)

  const takeExposure = () => {
    if (phase !== 'ready') return
    timers.current.forEach(window.clearTimeout)
    setPhase('charging')
    const charge = reducedMotion ? 80 : 320
    const emit = reducedMotion ? 160 : 980
    const settle = reducedMotion ? 700 : 2100
    timers.current = [
      window.setTimeout(() => setPhase('emitting'), charge),
      window.setTimeout(() => { setPhase('captured'); setCaptureId((id) => id + 1) }, emit),
      window.setTimeout(() => setPhase('ready'), settle),
    ]
  }

  return (
    <article className="xray-module">
      <header className="module-intro">
        <div><p className="section-kicker"><Boxes aria-hidden="true" /> Projection radiography</p><h2>Chest X-ray acquisition</h2><p>Explore how patient positioning, geometry, and exposure shape the projection.</p></div>
        <div className="geometry-readout" aria-label="Live geometry"><div><span>SID</span><strong>{settings.sid} cm</strong></div><div><span>OID</span><strong>{derived.odd.toFixed(1)} cm</strong></div><div><span>Mag.</span><strong>{derived.magnification.toFixed(2)}×</strong></div></div>
      </header>
      <div className="visual-workbench">
        <section className="scene-shell glass-panel" aria-label="Interactive 3D X-ray acquisition scene">
          <p className="sr-only">A three-dimensional educational scene showing an X-ray source, a standing patient, a cone beam, and a flat-panel detector. Use the camera preset buttons or drag to orbit the scene.</p>
          <div className="scene-topbar">
            <div className="scene-badge"><span aria-hidden="true" /> {projectionGeometry.label} · {projectionGeometry.beamPath}</div>
            <div className="scene-tools">
              <div className="render-toggles" role="group" aria-label="Rendering enhancements">
                <button className="render-toggle" data-mode="hq" type="button" aria-label="High quality rendering" aria-pressed={renderMode === 'hq'} onClick={() => toggleRenderMode('hq')}><Sparkles aria-hidden="true" /> HQ</button>
                <button className="render-toggle" data-mode="rt" data-backend={rtSelection.backend ?? 'unavailable'} type="button" aria-label="Ray-traced rendering" aria-pressed={renderMode === 'rt'} disabled={!rayTracingSupported} title={rtDescription} onClick={() => toggleRenderMode('rt')}><Atom aria-hidden="true" /> RT</button>
              </div>
              <div className="camera-presets" aria-label="Camera view">{cameraPresets.map((preset) => <button key={preset} type="button" aria-pressed={cameraPreset === preset} onClick={() => setCameraPreset(preset)}>{preset}</button>)}</div>
            </div>
          </div>
          <XrayScene settings={settings} phase={phase} cameraPreset={cameraPreset} renderMode={renderMode} rtBackend={rtSelection.backend} rtStatusRef={rtStatusRef} />
          {renderMode === 'rt' && rtSelection.backend && <div ref={rtStatusRef} className="rt-status" data-backend={rtSelection.backend} aria-live="polite">{rtSelection.backend === 'webgpu' ? 'WebGPU RT' : 'WebGL RT'} · warming</div>}
          <div className="scene-instruction"><MousePointer2 aria-hidden="true" /> Drag to orbit · Scroll to zoom</div>
          <div className={`exposure-vignette${phase === 'emitting' ? ' is-emitting' : ''}`} aria-hidden="true" />
        </section>
        <DetectorImage settings={settings} phase={phase} captureId={captureId} />
      </div>
      <AcquisitionControls settings={settings} phase={phase} onSettingChange={updateSetting} onProjectionChange={updateProjection} onExpose={takeExposure} />
      <section className="xray-takeaways lesson-takeaways glass-panel" aria-label="Chest X-ray acquisition learning points">
        <span>Keep from this lesson</span>
        <ol>
          <li>Projection choice changes which anatomy overlaps and how far structures sit from the detector.</li>
          <li>Geometry controls magnification and coverage; kVp primarily changes beam energy and penetration, while mAs primarily changes photon number and quantum noise.</li>
          <li>The detector records transmitted X-ray signal; processing produces a projection that represents accumulated attenuation along overlapping paths.</li>
        </ol>
      </section>
      <footer className="xray-sources module-reference-strip">
        <span>Asset sources</span>
        <a href="https://3dassets.dev/packs/hospital-wards-and-clinic-operations" target="_blank" rel="noreferrer">Scanner room · CC0 <ExternalLink aria-hidden="true" /></a>
        <a href="https://blendswap.com/blend/26915" target="_blank" rel="noreferrer">Anatomical model · CC BY-SA <ExternalLink aria-hidden="true" /></a>
        <a href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">BodyParts3D <ExternalLink aria-hidden="true" /></a>
      </footer>
      <p className="sr-only" aria-live="polite">{phase === 'captured' ? `Exposure captured using ${settings.projection}, ${settings.kvp} kilovolts peak, ${settings.mas} milliampere-seconds, and ${settings.sid} centimetre SID.` : ''}</p>
    </article>
  )
}
