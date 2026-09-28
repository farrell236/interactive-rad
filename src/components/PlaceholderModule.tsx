import { Activity, Layers3, Magnet, Radio, ScanLine } from 'lucide-react'
import type { ComponentType, CSSProperties, SVGProps } from 'react'
import type { Modality } from '../types'

type FutureModality = Exclude<Modality, 'xray'>
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const moduleContent: Record<FutureModality, { accent: string; eyebrow: string; title: string; description: string; stages: string[]; controls: string[]; icon: IconComponent }> = {
  ct: { accent: '#6adcf4', eyebrow: 'Computed tomography', title: 'CT acquisition and reconstruction', description: 'Follow a rotating X-ray source from projection measurements to a reconstructed axial volume, then explore how acquisition choices shape image quality.', stages: ['Rotating gantry and helical acquisition', 'Projection measurements and sinogram', 'Axial reconstruction and multiplanar viewing'], controls: ['kVp', 'Tube current', 'Pitch', 'Rotation speed', 'Slice thickness', 'Plane'], icon: ScanLine },
  mri: { accent: '#a48aff', eyebrow: 'Magnetic resonance', title: 'MRI signal formation', description: 'Build intuition from alignment in the main field through RF excitation, relaxation, spatial encoding, and the signals that eventually become an image.', stages: ['Alignment in the main magnetic field', 'RF excitation and relaxation', 'Gradient encoding and k-space acquisition'], controls: ['TR', 'TE', 'Flip angle', 'Sequence', 'Imaging plane', 'Field strength'], icon: Magnet },
  interventional: { accent: '#70e1c1', eyebrow: 'Image-guided intervention', title: 'Interventional imaging', description: 'Position a virtual C-arm, guide a device with pulsed fluoroscopy, and reveal vascular flow through contrast timing and digital subtraction.', stages: ['Position the C-arm', 'Guide with pulsed fluoroscopy', 'Visualize contrast and subtraction'], controls: ['LAO / RAO', 'Cranial / caudal', 'Pulse rate', 'Collimation', 'Contrast timing', 'Flow'], icon: Radio },
  fundamentals: { accent: '#ffca75', eyebrow: 'Image representation', title: 'Medical imaging fundamentals', description: 'Build intuition for how pixel data becomes patient-space geometry through dimensions, spacing, origin, direction, orientation, and the metadata carried in medical image headers.', stages: ['Move from array indices to physical coordinates', 'Explore spacing, origin, and direction', 'Decode header fields that affect geometry and intensity'], controls: ['Dimensions', 'Spacing', 'Origin', 'Direction', 'LPS / RAS', 'Intensity scaling'], icon: Layers3 },
}

export function PlaceholderModule({ modality }: { modality: FutureModality }) {
  const content = moduleContent[modality]
  const Icon = content.icon
  return (
    <article className="placeholder-module glass-panel" style={{ '--module-accent': content.accent } as CSSProperties}>
      <div className="placeholder-visual" aria-hidden="true">
        <div className="placeholder-grid" />
        <div className="placeholder-orbit">
          <span className="orbit-ring" /><span className="orbit-ring" /><span className="orbit-ring" />
          <div className="orbit-core"><Icon /></div>
          <span className="orbit-node one" /><span className="orbit-node two" /><span className="orbit-node three" />
        </div>
        <div className="placeholder-visual-label"><span /> Module architecture ready</div>
      </div>
      <div className="placeholder-copy">
        <p className="section-kicker"><Activity /> {content.eyebrow}</p>
        <h2>{content.title}</h2>
        <p className="placeholder-description">{content.description}</p>
        <ol className="stage-list">{content.stages.map((stage) => <li key={stage}>{stage}</li>)}</ol>
        <div className="planned-controls"><p>Planned controls</p><div className="chip-row">{content.controls.map((control) => <span key={control}>{control}</span>)}</div></div>
      </div>
    </article>
  )
}
