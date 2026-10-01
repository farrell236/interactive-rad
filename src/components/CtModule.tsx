import { useState } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Aperture, Box, Gauge, Layers3, RotateCw, ScanLine, SlidersHorizontal, Table2, TriangleAlert, Waves } from 'lucide-react'
import { CtArtifactsLesson, CtProtocolLesson, CtRayLesson, CtReconstructionLesson, CtScannerGeometryLesson } from './CtChapterLessons'
import CtManyViewsLesson from './CtManyViewsLesson'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>
type AssetKind = 'demo' | 'figure' | 'table' | 'equation' | 'comparison' | 'gallery' | 'flow'

interface CtAsset {
  kind: AssetKind
  label: string
  title: string
  purpose: string
  notes: string[]
  wide?: boolean
  formula?: string
}

interface CtChapter {
  id: string
  label: string
  icon: IconComponent
  title: string
  summary: string
  coreTitle: string
  coreCopy: string
  assets: CtAsset[]
  takeaways: string[]
}

interface CtTeachingContent {
  layout: 'depth' | 'geometry' | 'ray' | 'reconstruction' | 'tradeoffs' | 'pipeline'
  kicker?: string
  cues: string[]
  sections: Array<{ title: string; paragraphs: string[] }>
  callout: { title: string; body: string }
}

const scannerVocabularyPattern = /(detector arrays?|detector channels?|detector rows?|fan beams?|cone beams?|isocenters?|collimation|sources?|gantries|tables?|pitch)/gi
const scannerVocabularyTerm = /^(detector arrays?|detector channels?|detector rows?|fan beams?|cone beams?|isocenters?|collimation|sources?|gantries|tables?|pitch)$/i

function emphasizeScannerVocabulary(text: string): ReactNode {
  return text.split(scannerVocabularyPattern).map((part, index) => (
    scannerVocabularyTerm.test(part) ? <strong key={`${part}-${index}`}>{part}</strong> : part
  ))
}

const chapters: CtChapter[] = [
  {
    id: 'many-views',
    label: 'Views & sinogram',
    icon: Aperture,
    title: 'From one projection to many views',
    summary: 'See why one projection cannot localize depth, then organize measurements from many angles into a sinogram and reconstruct a slice.',
    coreTitle: 'A projection collapses depth; tomography reconstructs it.',
    coreCopy: 'Inside the gantry, an X-ray tube faces a detector array across the patient. The tube emits a fan-shaped beam through the body, and the detector records the transmitted X-rays along many adjacent paths. The patient lies near the center of rotation, called the isocenter, on a table that can move through the gantry. During acquisition, the tube and detector rotate together and record a projection at each angle. A single projection collapses depth like a radiograph, but the complete set of views allows the scanner to reconstruct an axial slice. Repeating this process as the table advances builds a three-dimensional volume.',
    assets: [
      { kind: 'demo', label: 'Primary interactive', title: 'Projection accumulation', purpose: 'Make the central CT idea visible before introducing scanner terminology.', wide: true, notes: ['Simple patient cross-section with a rotating source and detector.', 'Angle control: one view → sparse views → dense angular sampling.', 'Projection profile, sinogram, and reconstruction update together.'] },
      { kind: 'comparison', label: 'Teaching figure', title: 'Projection versus slice', purpose: 'Contrast overlapping anatomy with localized cross-sectional structure.', notes: ['Left: one radiographic projection.', 'Right: reconstructed axial slice from the same objects.', 'Use identical colors and object positions across both views.'] },
    ],
    takeaways: ['One projection cannot determine depth.', 'A sinogram arranges detector measurements by channel and acquisition angle.', 'Reconstruction converts measurement space into an estimated image—it is not a direct photograph.'],
  },
  {
    id: 'scanner-geometry',
    label: 'Scanner geometry',
    icon: RotateCw,
    title: 'Scanner geometry and scan modes',
    summary: 'Name the physical system, then compare axial and helical acquisition without turning the chapter into scanner history.',
    coreTitle: 'The gantry controls angle; the table controls longitudinal coverage.',
    coreCopy: 'Inside the gantry, an X-ray source faces a detector array across the isocenter. Axial scanning acquires a rotation at a fixed table position. Helical scanning moves the table continuously while the source rotates, producing a spiral sampling path through the patient.',
    assets: [
      { kind: 'demo', label: 'Primary interactive', title: 'Gantry and table motion', purpose: 'Link source rotation, table travel, scan mode, and pitch in one spatial scene.', wide: true, notes: ['3D gantry with source, detector, isocenter, patient table, and scan range.', 'Toggle: axial / helical.', 'Pitch control changes table travel per rotation and stretches the visible helix.'] },
      { kind: 'figure', label: 'Annotated figure', title: 'Fan beam and cone beam', purpose: 'Show how detector width changes sampling within and between slices.', notes: ['Use two aligned diagrams with the same source and isocenter.', 'Label detector rows and the z direction.', 'Keep the distinction conceptual rather than vendor-specific.'] },
      { kind: 'table', label: 'Reference table', title: 'Component and role', purpose: 'Provide a quick vocabulary reference beside the spatial demo.', notes: ['Source, detector array, gantry, isocenter, collimation, table.', 'One short function per component; no engineering specifications.'] },
    ],
    takeaways: ['The source and detector rotate as a paired measurement system.', 'Axial and helical scans differ mainly in table motion during acquisition.', 'Pitch describes table travel relative to the collimated beam width.'],
  },
  {
    id: 'projection-data',
    label: 'Measuring a ray',
    icon: Waves,
    title: 'From photons to line integrals',
    summary: 'Focus on one ray: connect detector counts to the attenuation measurement used by reconstruction.',
    coreTitle: 'CT reconstructs line integrals, not raw detector brightness.',
    coreCopy: 'The detector measures transmitted intensity I and compares it with the incident intensity I₀. The logarithmic transform converts their ratio into an estimate of accumulated attenuation along the ray. Each source angle produces many such measurements across the detector.',
    assets: [
      { kind: 'demo', label: 'Primary interactive', title: 'Photon path to line integral', purpose: 'Show how material and path length change transmitted intensity and the resulting projection value.', wide: true, notes: ['Controls: material attenuation and path length.', 'Visual: incident beam I₀, attenuating object, transmitted beam I.', 'Readouts update detector counts, transmission ratio, and p.'] },
      { kind: 'equation', label: 'Equation figure', title: 'Normalize, divide, then take the log', purpose: 'Give the transform a stable visual home without a long derivation.', formula: 'p = −ln(I / I₀)', notes: ['Annotate every symbol in plain language.', 'Include one short numerical example.', 'Keep photon statistics for the protocol chapter.'] },
      { kind: 'figure', label: 'Data figure', title: 'One view across the detector', purpose: 'Connect individual rays to a one-dimensional projection profile.', notes: ['Horizontal detector channels.', 'Ray bundle through a simple two-object phantom.', 'Profile below uses the same channel positions.'] },
    ],
    takeaways: ['Raw counts depend on both the incident and transmitted beam.', 'The log transform converts transmission into additive attenuation along a ray.', 'One projection angle contains a full row of detector measurements.'],
  },
  {
    id: 'reconstruction',
    label: 'Reconstruction',
    icon: Layers3,
    title: 'Reconstructing a slice',
    summary: 'Show why unfiltered backprojection blurs and how projection filtering or iterative methods produce a usable image.',
    coreTitle: 'Reconstruction asks where the measured attenuation most likely originated.',
    coreCopy: 'Backprojection spreads every measured projection back across the image along its original ray paths. Repeating this for many angles begins to localize structures, but the unfiltered result is blurred. Filtered backprojection first filters each projection, then backprojects and combines the filtered views; iterative methods repeatedly compare a candidate image with the measurements.',
    assets: [
      { kind: 'demo', label: 'Primary interactive', title: 'Progressive reconstruction', purpose: 'Let learners watch a slice emerge rather than presenting reconstruction as a black box.', wide: true, notes: ['Timeline: projection → filter → backproject → accumulate → reconstructed slice.', 'Play continuously, pause at each stage, or jump to a step.', 'View-count control exposes sparse-view streaking.'] },
      { kind: 'comparison', label: 'Comparison figure', title: 'Backprojection, filtered backprojection, iterative', purpose: 'Compare the visual result and the basic idea of each method.', notes: ['Three images use the same phantom and projection data.', 'Caption blur, edge recovery, noise behavior, and computation.', 'Avoid claiming one method is universally superior.'] },
      { kind: 'table', label: 'Method table', title: 'Reconstruction trade-offs', purpose: 'Create a compact reference for terminology encountered in datasets and papers.', notes: ['Rows: simple backprojection, FBP, iterative reconstruction.', 'Columns: central operation, characteristic appearance, computation.'] },
    ],
    takeaways: ['Backprojection localizes measurements but produces blur.', 'Filtering changes how spatial frequencies contribute to the reconstruction.', 'Reconstruction method and kernel can change image appearance without changing the patient.'],
  },
  {
    id: 'protocol',
    label: 'Resolution & noise',
    icon: SlidersHorizontal,
    title: 'Resolution, noise, and protocol choices',
    summary: 'Bring the coupled acquisition and reconstruction controls together without presenting clinical protocol recipes.',
    coreTitle: 'Image quality is a set of trade-offs, not a single quality slider.',
    coreCopy: 'Projection sampling, detector geometry, field of view, slice thickness, reconstruction kernel, tube output, and pitch influence different aspects of the result. Some settings improve spatial detail while increasing noise; others change dose, scan time, coverage, or the appearance of texture.',
    assets: [
      { kind: 'demo', label: 'Primary interactive', title: 'Protocol trade-off dashboard', purpose: 'Make coupled effects visible while keeping the number of controls manageable.', wide: true, notes: ['Controls: view count, mAs, pitch, slice thickness, reconstruction kernel.', 'Outputs: slice preview plus resolution, noise, coverage, and relative-dose indicators.', 'Changing one control highlights every affected output.'] },
      { kind: 'comparison', label: 'Comparison figure', title: 'Soft and sharp reconstruction kernels', purpose: 'Show why datasets reconstructed from the same acquisition can still look different.', notes: ['Same projection data and window for both images.', 'Include an edge profile and a homogeneous noise region.', 'Label this as a reconstruction choice, not windowing.'] },
      { kind: 'table', label: 'Effect table', title: 'Parameter → visible consequence', purpose: 'Give ML engineers a concise domain-shift reference.', notes: ['Rows: mAs, kVp, pitch, field of view, slice thickness, kernel.', 'Columns: primary effect, common visual change, linked trade-off.', 'Use qualitative directions rather than clinical technique values.'] },
    ],
    takeaways: ['Spatial resolution and noise are coupled.', 'Slice thickness and kernel are important sources of dataset variation.', 'Acquisition settings and reconstruction settings affect the image through different mechanisms.'],
  },
  {
    id: 'artifacts-output',
    label: 'Artifacts & output',
    icon: TriangleAlert,
    title: 'Artifacts and what reaches the model',
    summary: 'Finish by tracing acquisition failures and reconstruction choices into the exported image series.',
    coreTitle: 'Artifacts have causes in the patient, scanner, sampling, or reconstruction pipeline.',
    coreCopy: 'Motion, metal, beam hardening, truncation, partial volume, detector errors, and sparse angular sampling leave different signatures in projection data and reconstructed images. The exported CT series also carries choices such as slice thickness, kernel, field of view, contrast phase, and reconstruction method.',
    assets: [
      { kind: 'gallery', label: 'Primary interactive', title: 'Artifact cause → data → image', purpose: 'Teach artifacts as pipeline failures rather than a gallery of unexplained appearances.', wide: true, notes: ['Selectable causes: motion, metal, beam hardening, partial volume, truncation, rings, sparse views.', 'Three synchronized panels: cause in object space, sinogram signature, reconstructed appearance.', 'Each selection gets one concise mitigation or interpretation note.'] },
    ],
    takeaways: ['Artifacts can often be traced through both projection and image space.', 'Two series of the same anatomy can differ because of protocol and reconstruction.', 'The model receives a processed volume plus metadata, not direct scanner measurements.'],
  },
]

const teachingContent: Partial<Record<string, CtTeachingContent>> = {
  'scanner-geometry': {
    layout: 'geometry',
    kicker: 'Read the hardware, then the path',
    cues: ['The gantry', 'The trajectory', 'The overlap'],
    sections: [
      {
        title: 'Source, detector, and isocenter',
        paragraphs: [
          'The X-ray source and detector array face one another across the gantry opening. Their rotation axis defines the scanner isocenter, which is also the center of the nominal reconstruction field of view.',
          'A fan beam spreads across detector channels within a plane. A multi-row detector also samples along the patient’s longitudinal axis, giving the beam a cone-like extent and enabling multiple slices per rotation.',
        ],
      },
      {
        title: 'Axial and helical acquisition',
        paragraphs: [
          'In axial or step-and-shoot scanning, the table remains stationary while one rotation or short group of rotations is acquired, then advances to the next position. The sampled planes are tied closely to those table positions.',
          'In helical scanning, the source rotates continuously while the table moves. The measured paths form a helix, and reconstruction interpolates those measurements to produce images at selected longitudinal positions.',
        ],
      },
      {
        title: 'Pitch describes longitudinal sampling',
        paragraphs: [
          'For helical CT, pitch is commonly expressed as table travel during one rotation divided by the total nominal collimated beam width. A pitch of 1 means the table advances by approximately one beam width per rotation.',
          'Higher pitch covers more length per rotation and reduces sampling overlap when other settings are unchanged. Lower pitch increases overlap. The final effect on noise, dose, and resolution also depends on scanner control systems and reconstruction methods.',
        ],
      },
    ],
    callout: { title: 'Pitch is not voxel spacing.', body: 'Pitch describes the acquisition trajectory. Pixel spacing and slice spacing describe the geometry of the reconstructed image that is produced afterward.' },
  },
  'projection-data': {
    layout: 'ray',
    kicker: 'Follow one ray',
    cues: ['Measure', 'Transform', 'Correct'],
    sections: [
      {
        title: 'Photon counts encode transmission',
        paragraphs: [
          'For an ideal monoenergetic beam, transmitted intensity follows I = I₀ exp(−∫μ ds). The attenuation coefficient μ can vary along the path, so the exponent contains the integral of attenuation over distance.',
          'The detector records photon-dependent signals rather than μ directly. Thicker or more attenuating material reduces transmission, while random photon statistics introduce uncertainty into the measured count.',
        ],
      },
      {
        title: 'The logarithm produces a line integral',
        paragraphs: [
          'Air or reference measurements estimate the incident signal I₀. Dividing the transmitted signal I by I₀ gives a transmission fraction. Applying p = −ln(I/I₀) converts that fraction into an estimate of ∫μ ds.',
          'This transform is useful because attenuation from consecutive materials becomes additive. Two segments along one ray contribute to the same projection value through the sum of their path-integrated attenuation.',
        ],
      },
      {
        title: 'Calibration precedes reconstruction',
        paragraphs: [
          'Real systems correct detector offsets, channel-to-channel gain, source output variation, geometry, scatter, and other nonideal behavior before or during reconstruction. These steps aim to make measurements from different channels and angles comparable.',
          'Incorrect or incomplete correction can become structured image artifacts. By the time a reconstructed CT image reaches a dataset, it is already several processing stages removed from the original detector signal.',
        ],
      },
    ],
    callout: { title: 'Raw counts are not Hounsfield units.', body: 'Detector signals first become projection measurements, projection measurements become a reconstructed attenuation image, and only then is the image calibrated to the familiar CT value scale.' },
  },
  reconstruction: {
    layout: 'reconstruction',
    kicker: 'Three reconstruction ideas',
    cues: ['Spread back', 'Recover detail', 'Compare · update'],
    sections: [
      {
        title: 'Backprojection reverses the ray geometry',
        paragraphs: [
          'Backprojection takes each projection value and distributes it through the image along the ray path that produced it. One view creates broad bands; many views intersect and reinforce the locations that consistently explain the measurements.',
          'This localizes structure, but simple backprojection produces a blurred result because every value is spread across an entire path rather than placed at one point.',
        ],
      },
      {
        title: 'Filtering corrects the characteristic blur',
        paragraphs: [
          'Filtered backprojection applies a ramp-like frequency filter to each projection before backprojection. The filter restores spatial frequencies that simple backprojection suppresses, producing sharper and more quantitatively useful images.',
          'Practical reconstruction kernels modify this frequency response. Smoother kernels reduce noise and soften edges; sharper kernels retain more high-frequency detail while making noise and fine texture more prominent.',
        ],
      },
      {
        title: 'Iterative methods compare and update',
        paragraphs: [
          'Iterative reconstruction starts with an image estimate, forward-projects it into measurement space, compares the predicted projections with the acquired data, and updates the image to reduce the mismatch.',
          'Statistical models, physical system models, and regularization can be incorporated into this loop. The result can suppress noise or artifacts, but its texture and resolution behavior depend on the specific implementation and strength.',
        ],
      },
    ],
    callout: { title: 'Reconstruction is not a neutral file-conversion step.', body: 'The same projection data can yield visibly different images when reconstructed with different algorithms, kernels, slice thicknesses, or regularization settings.' },
  },
  protocol: {
    layout: 'tradeoffs',
    kicker: 'Nothing changes alone',
    cues: ['In-plane', 'Through-plane', 'Noise · detail'],
    sections: [
      {
        title: 'Sampling limits useful resolution',
        paragraphs: [
          'Reconstruction matrix and field of view determine the nominal in-plane pixel spacing, but pixel spacing alone is not the true spatial resolution. Detector sampling, focal spot size, number of views, motion, and reconstruction kernel also limit recoverable detail.',
          'A 512 × 512 image can therefore represent very different physical fields of view and very different levels of resolved anatomy. Array dimensions should never be treated as a resolution measurement by themselves.',
        ],
      },
      {
        title: 'Longitudinal detail depends on reconstruction',
        paragraphs: [
          'Slice thickness describes the reconstructed extent represented along the longitudinal direction. Reconstruction interval describes the distance between neighboring image positions; overlapping slices can have an interval smaller than their thickness.',
          'Thicker slices average more signal, usually reducing visible noise but increasing partial-volume averaging. Thin slices preserve more longitudinal detail at the cost of noisier individual images and greater data volume.',
        ],
      },
      {
        title: 'Photon statistics and kernels trade noise for detail',
        paragraphs: [
          'Increasing tube current-time generally increases the number of detected photons and reduces quantum noise, with radiation output increasing as well. Tube voltage changes photon energy, penetration, material contrast, and dose in a more coupled way.',
          'Pitch changes longitudinal sampling and scan coverage, while the reconstruction kernel redistributes frequency response after acquisition. These controls should be interpreted together rather than as independent image-quality sliders.',
        ],
      },
    ],
    callout: { title: 'Equal matrix size does not mean equal image quality.', body: 'For model development, record physical spacing, slice thickness, reconstruction kernel, dose-related noise, and scan protocol—not only rows and columns.' },
  },
  'artifacts-output': {
    layout: 'pipeline',
    kicker: 'Trace the signature upstream',
    cues: ['Broken consistency', 'Recognizable pattern', 'Delivered series'],
    sections: [
      {
        title: 'Inconsistent or extreme measurements create streaks',
        paragraphs: [
          'Patient motion changes anatomy while projections are being collected, so measurements from different angles no longer describe one consistent object. The reconstruction may show blur, doubled edges, or streaks.',
          'Metal and other highly attenuating material can cause photon starvation, spectral effects, scatter, and nonlinear measurements along selected paths. Those corrupted paths are spread through the reconstruction as bright and dark streaks.',
        ],
      },
      {
        title: 'Sampling and averaging have recognizable signatures',
        paragraphs: [
          'Beam hardening can produce cupping or dark bands because lower-energy photons are preferentially removed. Detector calibration errors can repeat at every angle and reconstruct into rings. Truncation occurs when anatomy extends beyond the measured field.',
          'Partial volume is different: a voxel averages multiple materials because the sampled region is too large to separate them. Sparse angular sampling leaves insufficient directional information and produces view-dependent streaking.',
        ],
      },
      {
        title: 'The exported series is one chosen reconstruction',
        paragraphs: [
          'A CT examination may contain multiple reconstructed series with different kernels, fields of view, slice thicknesses, intervals, planes, contrast phases, or iterative-reconstruction settings. They can share acquisition data while differing substantially in appearance.',
          'The output series then carries calibrated values and geometry into DICOM. Windowing, resampling, normalization, and tensor construction occur downstream, as covered in the CT Windowing and Image Data modules.',
        ],
      },
    ],
    callout: { title: 'Artifacts can become shortcuts for a model.', body: 'If artifact prevalence, reconstruction style, or protocol differs between classes or sites, a model may learn acquisition signatures instead of the intended anatomy or pathology.' },
  },
}

const assetIcons: Record<AssetKind, IconComponent> = {
  demo: Gauge,
  figure: Box,
  table: Table2,
  equation: Waves,
  comparison: Layers3,
  gallery: TriangleAlert,
  flow: ScanLine,
}

function AssetPreview({ asset }: { asset: CtAsset }) {
  if (asset.kind === 'equation') return <div className="ct-asset-preview is-equation"><code>{asset.formula}</code><span>Annotated equation and worked example</span></div>
  if (asset.kind === 'table') return <div className="ct-asset-preview is-table"><span /><span /><span /><span /><span /><span /></div>
  if (asset.kind === 'comparison') return <div className="ct-asset-preview is-comparison"><span>View A</span><b>↔</b><span>View B</span></div>
  if (asset.kind === 'gallery') return <div className="ct-asset-preview is-gallery"><span /><span /><span /><span /><span /><span /></div>
  if (asset.kind === 'flow') return <div className="ct-asset-preview is-flow"><span>Acquire</span><b>→</b><span>Measure</span><b>→</b><span>Reconstruct</span><b>→</b><span>Export</span></div>
  if (asset.kind === 'figure') return <div className="ct-asset-preview is-figure"><span className="ct-figure-orbit" /><span className="ct-figure-object" /><span className="ct-figure-axis x" /><span className="ct-figure-axis y" /></div>
  return <div className="ct-asset-preview is-demo"><span>Controls</span><b>→</b><span>Interactive scene</span><b>→</b><span>Live output</span></div>
}

function CtAssetCard({ asset }: { asset: CtAsset }) {
  const Icon = assetIcons[asset.kind]
  return (
    <article className={`ct-asset-card${asset.wide ? ' is-wide' : ''}`}>
      <header><span><Icon aria-hidden="true" />{asset.label}</span><em>Planned asset</em></header>
      <h5>{asset.title}</h5>
      <p>{asset.purpose}</p>
      <AssetPreview asset={asset} />
      <div className="ct-build-notes"><strong>Build notes</strong><ul>{asset.notes.map((note) => <li key={note}>{note}</li>)}</ul></div>
    </article>
  )
}

function CtTeachingBlock({ content, emphasizeVocabulary = false }: { content: CtTeachingContent; emphasizeVocabulary?: boolean }) {
  const renderText = (text: string) => emphasizeVocabulary ? emphasizeScannerVocabulary(text) : text
  return (
    <section className={`ct-teaching-block is-${content.layout}`} aria-label="Chapter explanation">
      {content.kicker && <header className="ct-teaching-block-heading"><span>{content.kicker}</span></header>}

      <div className="ct-teaching-sections">
        {content.sections.map((section, index) => (
          <article key={section.title}>
            <header>
              <span>{content.cues[index]}</span>
              <h4>{renderText(section.title)}</h4>
            </header>
            <div>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{renderText(paragraph)}</p>)}
            </div>
          </article>
        ))}
      </div>

      <aside className="ct-teaching-callout">
        <strong>{renderText(content.callout.title)}</strong>
        <p>{renderText(content.callout.body)}</p>
      </aside>
    </section>
  )
}

function CtChapterExperience({ chapter }: { chapter: CtChapter }) {
  if (chapter.id === 'many-views') return <CtManyViewsLesson />
  if (chapter.id === 'scanner-geometry') return <CtScannerGeometryLesson />
  if (chapter.id === 'projection-data') return <CtRayLesson />
  if (chapter.id === 'reconstruction') return <CtReconstructionLesson />
  if (chapter.id === 'protocol') return <CtProtocolLesson />
  if (chapter.id === 'artifacts-output') return <CtArtifactsLesson />
  return <div className="ct-asset-grid">{chapter.assets.map((asset) => <CtAssetCard key={asset.title} asset={asset} />)}</div>
}

export default function CtModule() {
  const [chapterIndex, setChapterIndex] = useState(0)
  const chapter = chapters[chapterIndex] ?? chapters[0]
  const teaching = teachingContent[chapter.id]
  const ChapterIcon = chapter.icon

  return (
    <article className="ct-learning-module">
      <header className="ct-learning-hero">
        <div>
          <p className="section-kicker"><ScanLine aria-hidden="true" /> Computed tomography</p>
          <h2>From projections to a volume.</h2>
          <p>Follow the CT pipeline from rotating X-ray measurements through sinograms and reconstruction to the series used for viewing and machine learning.</p>
        </div>
        <div className="ct-learning-progress-copy"><strong>{chapterIndex + 1} / {chapters.length}</strong><span>Acquisition and reconstruction</span></div>
        <div className="ct-learning-progress" aria-label={`CT chapter ${chapterIndex + 1} of ${chapters.length}`}>{chapters.map((item, index) => <span key={item.id} className={index <= chapterIndex ? 'is-active' : ''} />)}</div>
      </header>

      <div className="ct-learning-workspace">
        <label className="ct-learning-chapter-picker">
          <span><small>Chapter</small><strong>{chapter.title}</strong></span>
          <select aria-label="Select CT chapter" value={chapterIndex} onChange={(event) => setChapterIndex(Number(event.target.value))}>{chapters.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.label}</option>)}</select>
        </label>

        <nav className="ct-learning-chapters" aria-label="CT learning chapters">
          <p>Chapters</p>
          {chapters.map((item, index) => {
            const Icon = item.icon
            return <button key={item.id} type="button" className={index === chapterIndex ? 'is-selected' : ''} aria-current={index === chapterIndex ? 'step' : undefined} onClick={() => setChapterIndex(index)}><span>{index + 1}</span><Icon aria-hidden="true" /><b>{item.label}</b></button>
          })}
        </nav>

        <section className="ct-learning-lesson" aria-labelledby="ct-learning-lesson-title">
          <header className="ct-learning-lesson-heading">
            <div><span><ChapterIcon aria-hidden="true" /> Chapter {chapterIndex + 1}</span><h3 id="ct-learning-lesson-title">{chapter.title}</h3><p>{chapter.summary}</p></div>
            <em>Interactive lesson</em>
          </header>

          {chapter.id !== 'many-views' && (
            <section className="ct-core-concept glass-panel">
              <small>Core concept</small>
              <h4>{chapter.coreTitle}</h4>
              <p>{chapter.id === 'scanner-geometry' ? emphasizeScannerVocabulary(chapter.coreCopy) : chapter.coreCopy}</p>
            </section>
          )}

          {teaching && <CtTeachingBlock content={teaching} emphasizeVocabulary={chapter.id === 'scanner-geometry'} />}

          <CtChapterExperience chapter={chapter} />

          <section className="ct-chapter-takeaways glass-panel" aria-label={`${chapter.title} teaching goals`}>
            <span>Keep from this chapter</span>
            <ol>{chapter.takeaways.map((takeaway) => <li key={takeaway}>{chapter.id === 'scanner-geometry' ? emphasizeScannerVocabulary(takeaway) : takeaway}</li>)}</ol>
          </section>
        </section>
      </div>
    </article>
  )
}
