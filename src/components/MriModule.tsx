import { useState } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Box, Database, Gauge, Grid3X3, Layers3, Magnet, ScanLine, Table2, TriangleAlert, Waves, Workflow } from 'lucide-react'
import { MriEncodingLesson } from './MriEncodingLesson'
import { MriArtifactLesson, MriMlPipelineLesson, MriSequenceLesson } from './MriAdvancedLessons'
import { MriKspaceLesson } from './MriKspaceLesson'
import { MriRelaxationReferences } from './MriRelaxationLesson'
import { MriSignalReferences } from './MriSignalLesson'
import { MriSignalSequenceLesson } from './MriSignalSequenceLesson'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>
type MriAssetKind = 'demo' | 'figure' | 'table' | 'comparison' | 'gallery' | 'flow'
type TeachingLayout = 'depth' | 'geometry' | 'ray' | 'reconstruction' | 'tradeoffs' | 'pipeline' | 'narrative'

interface MriAsset {
  kind: MriAssetKind
  label: string
  title: string
  purpose: string
  notes: string[]
  preview: string[]
  wide?: boolean
  lead?: boolean
}

interface MriTeachingContent {
  layout: TeachingLayout
  kicker: string
  cues: string[]
  sections: Array<{ title: string; paragraphs: string[] }>
  callout?: { title: string; body: string }
}

interface MriChapter {
  id: string
  label: string
  icon: IconComponent
  title: string
  summary: string
  coreTitle: string
  coreCopy: string
  teaching: MriTeachingContent
  assets: MriAsset[]
  takeaways: string[]
}

const vocabularyPattern = /(?<![A-Za-z0-9])(net magnetization|receive coils?|RF pulses?|flip angles?|proton density|T1|T2\*?|TR|TE|TI|slice-selection gradients?|phase-encoding gradients?|frequency-encoding gradients?|readout gradients?|k-space|Fourier transform|spin echoes?|gradient echoes?|inversion recovery|EPI|DWI|ADC|SNR|bias fields?|magnitude images?|phase images?|DICOM|NIfTI|B0)(?![A-Za-z0-9])/gi
const vocabularyTerm = /^(net magnetization|receive coils?|RF pulses?|flip angles?|proton density|T1|T2\*?|TR|TE|TI|slice-selection gradients?|phase-encoding gradients?|frequency-encoding gradients?|readout gradients?|k-space|Fourier transform|spin echoes?|gradient echoes?|inversion recovery|EPI|DWI|ADC|SNR|bias fields?|magnitude images?|phase images?|DICOM|NIfTI|B0)$/i

function emphasizeVocabulary(text: string): ReactNode {
  return text.split(vocabularyPattern).map((part, index) => (
    vocabularyTerm.test(part) ? <strong key={`${part}-${index}`}>{part}</strong> : part
  ))
}

const chapters: MriChapter[] = [
  {
    id: 'signal',
    label: 'MRI overview',
    icon: Magnet,
    title: 'From hydrogen to image',
    summary: 'Follow one complete MR measurement before opening the physics of contrast, spatial encoding, k-space, and reconstruction in later chapters.',
    coreTitle: 'MRI reconstructs an image from repeated measurements of hydrogen magnetization.',
    coreCopy: 'Hydrogen in the patient supplies magnetic moments. The main field B0 creates a small net magnetization, an RF pulse perturbs it, gradients encode position, and receive coils measure the response as complex voltage. Repeating the experiment with different encoding fills k-space; a Fourier transform reconstructs the spatial image.',
    teaching: {
      layout: 'narrative',
      kicker: 'From received signal to image',
      cues: ['Spatial encoding', 'Reconstruction'],
      sections: [
        {
          title: 'Gradients encode where the measured signal originated',
          paragraphs: [
            'RF excitation creates measurable signal but does not identify its location. Slice-selection gradients restrict the excited region, phase-encoding gradients change phase between repetitions, and the readout gradient makes frequency depend on position during sampling.',
            'Each readout is still a complex mixture from the excited tissue rather than a row of detector pixels. Repeating the experiment with different encoding collects the spatial-frequency samples that populate k-space.',
          ],
        },
        {
          title: 'Reconstruction converts complex k-space into image space',
          paragraphs: [
            'Receive arrays retain separate complex k-space measurements from coil elements with different spatial sensitivities. A Fourier transform maps the encoded spatial frequencies into image space; coil combination and, when used, parallel-imaging reconstruction then produce the displayed image.',
            'The reconstructed values are sequence-dependent MR signal rather than a universal tissue scale. Ordered slices or a direct 3D acquisition form the volume that is exported for viewing and supplied to an ML pipeline.',
          ],
        },
      ],
    },
    assets: [],
    takeaways: ['Hydrogen in water and fat supplies the measurable magnetic moments.', 'B0, RF, and gradient fields prepare, excite, and spatially encode the spin system.', 'Receive coils record complex voltage mixtures—not pixels or voxels directly.', 'Repeated measurements fill k-space, and reconstruction produces the spatial image.'],
  },
  {
    id: 'relaxation',
    label: 'Relaxation & weighting',
    icon: Waves,
    title: 'How tissue response becomes signal weighting',
    summary: 'Separate proton density, T1, T2, and T2* from the acquisition timing that makes one property more visible than another.',
    coreTitle: 'Relaxation describes tissue behavior; weighting describes how the acquisition samples it.',
    coreCopy: 'After excitation, longitudinal magnetization recovers with a T1-dependent time course while transverse coherence decays with a T2-dependent time course. Proton density sets the available signal. TR and TE determine when that evolving signal is sampled, so a weighted image emphasizes selected differences without directly measuring a tissue time constant.',
    teaching: {
      layout: 'geometry',
      kicker: 'Property → sampled signal → weighting',
      cues: ['Properties', 'Timing', 'Output'],
      sections: [
        {
          title: 'Proton density, T1, and T2 are properties of the spin system',
          paragraphs: [
            'A voxel’s MR-visible hydrogen sets its available equilibrium magnetization. After RF excitation, its longitudinal component recovers toward equilibrium with T1 while its transverse component loses coherence with T2. T2* adds dephasing from local field offsets before refocusing. These parameters describe signal evolution—not pulse-sequence names—and their values vary with field strength and acquisition conditions.',
          ],
        },
        {
          title: 'TR and TE choose which part of the response is observed',
          paragraphs: [
            'TR is the interval between repeated excitations, so it controls how much longitudinal recovery occurs before the spin system is perturbed again. TE is the delay from excitation to the measured echo, so it controls how much transverse signal remains at readout.',
            'Changing either time changes the relative signal contributed by tissues with different relaxation behavior. Refocusing, inversion, flip angle, and fast-readout strategies build on this timing foundation in the pulse-sequence chapter.',
          ],
        },
        {
          title: 'Weighting emphasizes a property; mapping estimates it',
          paragraphs: [
            'A weighted image emphasizes selected tissue differences, but its pixel values are not direct measurements of T1 or T2. Quantitative maps fit a parameter from multiple measurements and a signal model. Conventional magnitude brightness also changes with coil sensitivity, gain, reconstruction, field strength, and preprocessing, so it is not a fixed material identity across unrelated series.',
          ],
        },
      ],
      callout: { title: 'MRI has no single HU equivalent.', body: 'Quantitative T1 and T2 maps can carry interpretable units, but conventional proton-density-, T1-, and T2-weighted intensities remain relative to their acquisition and processing context.' },
    },
    assets: [],
    takeaways: ['Proton density, T1 recovery, T2 decay, and T2* dephasing describe different signal properties.', 'TR and TE select when the evolving signal is excited again and measured.', 'A weighted MR image is not a quantitative map and does not have a universal intensity scale.'],
  },
  {
    id: 'encoding',
    label: 'Encoding position',
    icon: Grid3X3,
    title: 'Giving the signal a location',
    summary: 'Show how controlled field gradients turn one combined MR signal into measurements that can be assigned to a slice and in-plane position.',
    coreTitle: 'Gradients make resonance frequency and phase depend on position.',
    coreCopy: 'The receive coil hears signal from a region rather than reading one voxel at a time. MRI localizes that signal by combining a slice-selection gradient with an RF pulse, encoding one in-plane direction as phase, and encoding the other as frequency during readout. Repeating the measurement with different phase encoding fills the information needed for an image.',
    teaching: {
      layout: 'ray',
      kicker: 'Encode one plane',
      cues: ['Select', 'Phase', 'Read'],
      sections: [
        {
          title: 'Select a slice with gradient plus RF bandwidth',
          paragraphs: [
            'A slice-selection gradient makes resonance frequency vary along one direction. An RF pulse excites a band of frequencies, so only the corresponding band of positions is selected.',
            'Slice thickness depends on both gradient strength and RF bandwidth. The selected direction can be oriented by combining physical gradient axes.',
          ],
        },
        {
          title: 'Encode one in-plane direction as phase',
          paragraphs: [
            'A phase-encoding gradient briefly makes spins at different positions accumulate different phase shifts. When the gradient turns off, that positional phase difference remains in the signal.',
            'The sequence repeats with different phase-encoding strengths. In this simplified Cartesian acquisition, each repetition contributes one k-space line containing many spatial-frequency samples rather than directly measuring one image row.',
          ],
        },
        {
          title: 'Encode the other direction during readout',
          paragraphs: [
            'A frequency-encoding or readout gradient makes precession frequency vary across the remaining in-plane direction while the signal is sampled.',
            'The acquired waveform mixes contributions from many positions. Fourier reconstruction later separates those frequencies and phases into spatial locations.',
          ],
        },
      ],
      callout: { title: 'Encoding axes are acquisition choices.', body: 'Slice, phase, and readout directions are not permanently tied to left–right, anterior–posterior, or superior–inferior. Their relationship to the patient belongs in image geometry and acquisition metadata.' },
    },
    assets: [],
    takeaways: ['Slice selection combines a gradient with a frequency-selective RF pulse.', 'Phase and frequency encoding describe position indirectly through the measured signal.', 'Acquisition encoding axes and patient anatomical axes are related through geometry metadata.'],
  },
  {
    id: 'k-space',
    label: 'K-space',
    icon: Layers3,
    title: 'From frequency samples to an image',
    summary: 'Connect one encoded readout to a complex measurement grid, then show how grid geometry, phase, and missing samples determine the reconstructed image.',
    coreTitle: 'MRI fills measurement space before it reconstructs image space.',
    coreCopy: 'During Cartesian acquisition, one readout samples a line across k-space and repeated phase-encoding steps fill the other direction. Each stored value is complex and weights a spatial-frequency pattern across the selected anatomy—not one image pixel. The inverse Fourier transform combines the completed grid into the familiar spatial image.',
    teaching: {
      layout: 'geometry',
      kicker: 'Two linked domains',
      cues: ['Fill', 'Geometry', 'Reconstruct'],
      sections: [
        {
          title: 'Repeated readouts fill a measurement grid',
          paragraphs: [
            'Chapter 3 ended with one frequency-encoded readout. In a simplified 2D Cartesian acquisition, that waveform supplies many kx samples along one ky line. The sequence repeats with a different phase-encoding gradient moment to acquire another ky line.',
            'Acquisition order can be linear, center-out, or sequence-specific, but array location still identifies a spatial frequency. K-space is therefore a measurement grid—not a scrambled anatomical picture.',
          ],
        },
        {
          title: 'Grid spacing and extent set image geometry',
          paragraphs: [
            'The spacing between adjacent samples sets the reconstructed field of view: Δk = 1/FOV. The sampled extent sets nominal pixel spacing: kₘₐₓ ≈ 1/(2Δx). For a Cartesian matrix, N = FOV/Δx.',
            'These are sampling relationships, not guarantees of true anatomical resolution. Signal bandwidth, gradients, motion, point-spread effects, reconstruction, and interpolation can all change the detail actually recoverable from the image.',
          ],
        },
        {
          title: 'Complex values reconstruct position and structure',
          paragraphs: [
            'Every k-space value has real and imaginary components, or equivalently magnitude and phase. Low spatial frequencies describe broad variation; progressively higher frequencies support faster spatial changes. The inverse Fourier transform combines all retained basis patterns across the image.',
            'Missing samples do not have one universal appearance. Regularly skipped Cartesian lines create coherent aliasing, while other masks or trajectories create different errors. Coil sensitivity, model assumptions, or learned priors may estimate missing information, but estimates are not measured ground truth.',
          ],
        },
      ],
      callout: { title: 'Do not train on a picture of k-space.', body: 'Raw MRI commonly contains complex, multi-coil arrays with acquisition-specific dimensions. A rendered log-magnitude screenshot discards phase, scale, coil channels, and sampling metadata required to reproduce the reconstruction.' },
    },
    assets: [],
    takeaways: ['One readout samples kx; repeated phase encodes fill ky.', 'Δk sets FOV; sampled extent sets nominal pixel spacing.', 'Magnitude and phase jointly determine the inverse FFT.', 'The missing-sample pattern determines the artifact.'],
  },
  {
    id: 'sequences',
    label: 'Pulse sequences',
    icon: ScanLine,
    title: 'How MRI measurement recipes differ',
    summary: 'Separate echo formation, preparation, echo-train architecture, and readout, then connect those building blocks to reconstructed images and fitted maps.',
    coreTitle: 'A pulse sequence composes several measurement jobs on one clock.',
    coreCopy: 'A sequence schedules preparation, RF excitation and refocusing, spatial-encoding gradients, and readout. Spin echo and gradient echo describe how an echo forms; inversion and diffusion modify the signal before readout; FSE/TSE uses an echo train; and EPI rapidly traverses k-space. These are composable building blocks—not interchangeable labels for tissue contrast.',
    teaching: {
      layout: 'reconstruction',
      kicker: 'Read the measurement recipe',
      cues: ['Optional prep', 'Form echo', 'Read'],
      sections: [
        {
          title: 'Optional preparation and excitation modify the signal before readout',
          paragraphs: [
            'Inversion recovery begins with an inversion pulse and waits for a chosen TI before excitation. A tissue can be suppressed when its longitudinal magnetization is near zero, but the required TI depends on the tissue, field strength, and readout. FLAIR and STIR use different timing to suppress fluid-like and fat-like signal, respectively.',
            'Diffusion gradients add motion-dependent phase before readout. Gradient amplitude, duration, separation, and waveform shape jointly determine the b-value. For conventional linear encoding, a unit b-vector records direction; a b-matrix describes the full directional weighting. Flip angle controls how strongly excitation rotates net magnetization. Each setting changes the signal delivered to the echo and readout.',
          ],
        },
        {
          title: 'Spin echo and gradient echo form echoes differently',
          paragraphs: [
            'Spin echo uses an RF refocusing pulse to reverse dephasing caused by static field offsets. It does not restore irreversible T2 signal loss, so the echo amplitude still depends on T2 at the selected TE. Gradient echo forms an echo by reversing gradient area without an RF refocusing pulse and therefore retains T2* sensitivity.',
            'A single spin echo can acquire one k-space line per repetition. Fast or turbo spin echo (FSE/TSE) generates a train of refocused echoes so several lines can be acquired per TR. Effective TE identifies when central k-space is sampled; echo-train length, spacing, ordering, and refocusing angles affect speed, contrast, and blurring.',
          ],
        },
        {
          title: 'Readout strategy determines how k-space is traversed',
          paragraphs: [
            'A basic single-echo Cartesian acquisition usually collects one phase-encoded ky line per repetition. FSE/TSE assigns several ky lines to successive refocused echoes. Single-shot EPI is also commonly Cartesian, but alternates the readout gradient and inserts phase blips to traverse many ky lines in one zig-zag echo train after a single excitation.',
            'Diffusion preparation is often followed by an EPI readout, but the two describe different jobs. For an ML dataset, keep preparation metadata such as b-value and b-vector separate from readout metadata such as echo spacing, phase-encoding direction, acceleration, and bandwidth.',
          ],
        },
      ],
      callout: { title: 'Series names are clues, not protocol definitions.', body: 'Do not identify a dataset from Series Description alone. Preserve TR, TE, TI, flip angle, echo-train details, acquisition dimensionality, phase direction, diffusion b-values and b-vectors, original/derived status, geometry, and reconstruction provenance. Normalize units during ingestion: BIDS timing fields such as EchoTime and EffectiveEchoSpacing are stored in seconds, while the corresponding DICOM Echo Time value is stored in milliseconds.' },
    },
    assets: [
      { kind: 'gallery', label: 'Primary sequence map', title: 'Recipe family → echo → output', purpose: 'Organize sequences by how the measurement is produced rather than repeating the weighting comparison from chapter 2.', wide: true, lead: true, preview: ['Spin echo', 'Gradient echo', 'Inversion recovery', 'EPI / diffusion'], notes: ['Use one selected family at a time with a compact pulse-and-readout sketch beside one representative output.', 'Keep the anatomy secondary to the acquisition mechanism.', 'Reveal the important timing fields and whether the displayed output was directly acquired or derived.'] },
      { kind: 'figure', label: 'Timing figure', title: 'Six measurement recipes on millisecond timelines', purpose: 'Compare excitation, refocusing or inversion, gradient action, echo formation, and readout using numerical timing while allowing each example its own time range.', preview: ['Spin echo', 'FSE / TSE', 'Gradient echo', 'Inversion recovery', 'EPI', 'Diffusion'], notes: ['Use aligned rows with time increasing left to right.', 'Label the independent horizontal range in each tab.', 'Highlight the event that forms or samples the echo; avoid vendor-specific diagrams and exhaustive waveforms.'] },
      { kind: 'table', label: 'Output reference', title: 'Sequence output → acquired or derived', purpose: 'Distinguish acquisition families, weighted outputs, and maps without re-teaching basic relaxation.', preview: ['SE / GRE', 'FLAIR / STIR', 'DWI', 'ADC'], notes: ['Columns: sequence family, key preparation or readout, acquired output, derived output, and metadata to check.', 'Use DWI versus ADC as the clearest acquired-versus-derived example.', 'Keep clinical interpretation out; focus on representation and provenance needed by an ML pipeline.'] },
    ],
    takeaways: ['A sequence composes echo formation, preparation, echo-train architecture, encoding, and readout.', 'FSE/TSE acquires several k-space lines across a refocused echo train; EPI traverses many lines rapidly after one excitation.', 'Preserve the provenance chain: acquired complex signals → reconstructed weighted image → fitted parameter map.'],
  },
  {
    id: 'quality',
    label: 'Quality & artifacts',
    icon: TriangleAlert,
    title: 'Resolution, SNR, speed, and artifacts',
    summary: 'Connect acquisition trade-offs to recognizable image failures without turning the chapter into a catalog of scanner troubleshooting.',
    coreTitle: 'MRI quality is a balance among information, signal, and acquisition time.',
    coreCopy: 'Smaller voxels can preserve finer spatial detail but collect less signal. More averages can improve SNR but take longer. Faster or incomplete sampling reduces time but shifts burden to reconstruction. Motion, field nonuniformity, sampling, and coil sensitivity then leave different signatures in the final image.',
    teaching: {
      layout: 'tradeoffs',
      kicker: 'Nothing improves alone',
      cues: ['Resolve', 'Measure', 'Accelerate'],
      sections: [
        {
          title: 'Voxel size and SNR move together',
          paragraphs: [
            'Reducing voxel dimensions decreases the amount of signal contributing to each reconstructed voxel. Increasing matrix size without changing field of view therefore does not provide free detail.',
            'Slice thickness, receiver bandwidth, number of averages, coil sensitivity, and field strength also influence visible noise and effective resolution.',
          ],
        },
        {
          title: 'Artifacts point back to a physical or sampling cause',
          paragraphs: [
            'Motion changes the object during acquisition and can create ghosting or blur. Insufficient field of view can wrap anatomy across the image. Susceptibility and chemical shift alter local frequency and produce displacement, signal loss, or distortion.',
            'Truncation can produce Gibbs ringing near sharp boundaries, while spatially varying coil sensitivity can appear as a bias field across otherwise similar tissue.',
          ],
        },
        {
          title: 'Acceleration changes the reconstruction problem',
          paragraphs: [
            'Parallel imaging uses differences among coil sensitivities to separate aliased signals. Compressed sensing uses structured undersampling with reconstruction assumptions. Learned reconstruction may add a trained prior to the process.',
            'These methods can shorten acquisition, but noise amplification, residual aliasing, smoothing, or hallucinated structure may depend on sampling and implementation.',
          ],
        },
      ],
      callout: { title: 'Image quality is task dependent.', body: 'An image can look smoother yet contain less recoverable detail, or look noisy while preserving useful boundaries. Evaluate the acquisition and reconstruction against the downstream task rather than visual polish alone.' },
    },
    assets: [
      { kind: 'gallery', label: 'Primary interactive', title: 'Artifact cause → image signature', purpose: 'Teach a small set of high-value artifacts through controlled changes to one reference image.', wide: true, lead: true, preview: ['Motion', 'Wrap', 'Susceptibility', 'Bias field'], notes: ['Selectable causes: motion, wraparound, susceptibility, chemical shift, Gibbs ringing, bias field.', 'Pair the image with a small acquisition-space explanation.', 'One concise ML consequence per artifact: shortcut, misregistration, intensity drift, or lost anatomy.'] },
      { kind: 'comparison', label: 'Trade-off figure', title: 'Resolution ↔ SNR ↔ time', purpose: 'Show why image quality cannot be reduced to one slider.', preview: ['Smaller voxels', 'More signal', 'Shorter scan'], notes: ['Use a triangular relationship with two concrete examples.', 'Keep dose out of MRI terminology.', 'Distinguish acquired resolution from interpolation or display enlargement.'] },
      { kind: 'table', label: 'Reference table', title: 'Artifact → likely cause → ML risk', purpose: 'Provide a practical dataset-screening checklist.', preview: ['Pattern', 'Upstream cause', 'Data risk'], notes: ['Keep only common, visually distinct artifacts.', 'Do not imply one appearance always has one cause.', 'Link correction choices to provenance rather than hiding them.'] },
    ],
    takeaways: ['Smaller voxels, higher SNR, and shorter scans cannot all be maximized independently.', 'Artifacts carry information about motion, fields, sampling, coils, and reconstruction.', 'Acceleration changes both the acquisition and the assumptions used to recover an image.'],
  },
  {
    id: 'model-input',
    label: 'MRI for ML',
    icon: Database,
    title: 'What reaches the model',
    summary: 'Trace raw multi-coil measurements into reconstructed series, converted volumes, preprocessing steps, and the tensor used for training.',
    coreTitle: 'The model receives one selected representation of an MR experiment.',
    coreCopy: 'Raw MRI begins as complex k-space from one or more receive coils. Reconstruction, coil combination, corrections, and image selection produce magnitude or phase series in DICOM. Conversion may group those series into NIfTI volumes, and preprocessing can register, resample, normalize, crop, or mask them before tensor construction.',
    teaching: {
      layout: 'pipeline',
      kicker: 'Keep the acquisition identity',
      cues: ['Raw', 'Series', 'Tensor'],
      sections: [
        {
          title: 'Raw data can contain coils, echoes, phases, and repetitions',
          paragraphs: [
            'The raw array is commonly complex and may include dimensions beyond k-space position: receive coil, echo, time point, diffusion direction, cardiac phase, or repetition. These axes must be identified before reconstruction or learning.',
            'Coil combination produces a convenient image but removes some information about the separate receiver sensitivities. Magnitude reconstruction also discards the sign and phase relationships present in complex data.',
          ],
        },
        {
          title: 'An examination contains several non-interchangeable series',
          paragraphs: [
            'A single examination may include localizers, repeated acquisitions, multiple orientations, pre- and post-contrast series, derived maps, and processed images. Series description alone is not always sufficient to classify them.',
            'Useful context includes TR, TE, TI, flip angle, field strength, acquisition type, phase-encoding direction, diffusion b-values and directions, image type, geometry, and whether the series is original or derived.',
          ],
        },
        {
          title: 'Preprocessing changes the representation seen by the model',
          paragraphs: [
            'Registration, resampling, bias correction, denoising, skull stripping, cropping, and intensity normalization can make data easier to combine while also changing interpolation, scale, field of view, or visible artifacts.',
            'Because conventional MRI intensity is relative, normalization is often useful—but it should be fitted and documented with awareness of scanner, protocol, anatomy, pathology, and data leakage.',
          ],
        },
      ],
      callout: { title: 'Split by patient before learning preprocessing statistics.', body: 'Repeated series, derived images, and registered copies can place nearly identical anatomy in several folders. Provenance-aware grouping is necessary to prevent leakage across training, validation, and test sets.' },
    },
    assets: [
      { kind: 'flow', label: 'Pipeline figure', title: 'K-space → reconstruction → series → tensor', purpose: 'Show exactly where representation-changing operations enter the ML pipeline.', wide: true, preview: ['Multi-coil k-space', 'Reconstruct', 'DICOM / NIfTI', 'Model tensor'], notes: ['Use a left-to-right pipeline with a visible provenance record beneath it.', 'Mark where complex data become magnitude/phase and where geometry is applied.', 'Make conversion and preprocessing expandable later; the skeleton should remain readable without interaction.'] },
      { kind: 'table', label: 'Inspection table', title: 'Metadata worth preserving', purpose: 'Give engineers a compact checklist for series identity and domain shift.', preview: ['Identity', 'Timing', 'Encoding', 'Geometry'], notes: ['Groups: sequence identity, timing, field/coil, spatial encoding, diffusion, geometry, derivation.', 'Show DICOM-friendly names rather than requiring tag memorization.', 'Explain missing metadata as unknown rather than silently defaulting it.'] },
      { kind: 'comparison', label: 'Processing comparison', title: 'Same acquisition, different model input', purpose: 'Make preprocessing provenance visible instead of treating it as harmless formatting.', preview: ['Original', 'Normalized', 'Resampled'], notes: ['Same slice before and after bias correction, normalization, and resampling.', 'Show a small intensity profile and geometry readout.', 'Label which changes affect values, geometry, or both.'] },
    ],
    takeaways: ['Raw MRI may be complex, multi-coil, and higher dimensional than the exported image.', 'Series identity depends on acquisition and derivation metadata, not filename or brightness alone.', 'Conversion and preprocessing are part of the data-generating pipeline and must be recorded.'],
  },
]

const lastAvailableChapterIndex = 4

const assetIcons: Record<MriAssetKind, IconComponent> = {
  demo: Gauge,
  figure: Box,
  table: Table2,
  comparison: Layers3,
  gallery: Grid3X3,
  flow: Workflow,
}

function MriAssetPreview({ asset }: { asset: MriAsset }) {
  if (asset.kind === 'table') return <div className="ct-asset-preview is-table" aria-hidden="true">{asset.preview.slice(0, 3).flatMap((label) => [<span key={`${label}-key`}>{label}</span>, <span key={`${label}-value`} />])}</div>
  if (asset.kind === 'comparison') return <div className="ct-asset-preview is-comparison" aria-hidden="true"><span>{asset.preview[0]}</span><b>↔</b><span>{asset.preview[1]}</span></div>
  if (asset.kind === 'gallery') return <div className="ct-asset-preview is-gallery mri-asset-gallery" aria-hidden="true">{asset.preview.map((label) => <span key={label}><small>{label}</small></span>)}</div>
  if (asset.kind === 'flow') return <div className="ct-asset-preview is-flow mri-asset-flow" aria-hidden="true">{asset.preview.flatMap((label, index) => [<span key={label}>{label}</span>, index < asset.preview.length - 1 ? <b key={`${label}-arrow`}>→</b> : []])}</div>
  if (asset.kind === 'figure') return <div className="ct-asset-preview mri-asset-figure" aria-hidden="true">{asset.preview.map((label, index) => <span key={label}><b>{String(index + 1).padStart(2, '0')}</b>{label}</span>)}</div>
  return <div className="ct-asset-preview is-demo" aria-hidden="true"><span>{asset.preview[0]}</span><b>→</b><span>{asset.preview[1]}</span><b>→</b><span>{asset.preview[2]}</span></div>
}

function MriAssetCard({ asset }: { asset: MriAsset }) {
  const Icon = assetIcons[asset.kind]
  return (
    <article className={`ct-asset-card${asset.wide ? ' is-wide' : ''}`}>
      <header><span><Icon aria-hidden="true" />{asset.label}</span><em>Planned asset</em></header>
      <h5>{asset.title}</h5>
      <p>{asset.purpose}</p>
      <MriAssetPreview asset={asset} />
      <div className="ct-build-notes"><strong>Build notes</strong><ul>{asset.notes.map((note) => <li key={note}>{note}</li>)}</ul></div>
    </article>
  )
}

function MriTeachingBlock({ content }: { content: MriTeachingContent }) {
  return (
    <section className={`ct-teaching-block is-${content.layout}`} aria-label="MRI chapter explanation">
      <header className="ct-teaching-block-heading"><span>{content.kicker}</span></header>
      <div className="ct-teaching-sections">
        {content.sections.map((section, index) => (
          <article key={section.title}>
            <header><span>{content.cues[index]}</span><h4>{emphasizeVocabulary(section.title)}</h4></header>
            <div>{section.paragraphs.map((paragraph) => <p key={paragraph}>{emphasizeVocabulary(paragraph)}</p>)}</div>
          </article>
        ))}
      </div>
      {content.callout && <aside className="ct-teaching-callout"><strong>{emphasizeVocabulary(content.callout.title)}</strong><p>{emphasizeVocabulary(content.callout.body)}</p></aside>}
    </section>
  )
}

export default function MriModule() {
  const [chapterIndex, setChapterIndex] = useState(0)
  const [relaxationTiming, setRelaxationTiming] = useState({ tr: 500, te: 15 })
  const chapter = chapters[chapterIndex] ?? chapters[0]
  const ChapterIcon = chapter.icon
  const leadAssets = chapter.assets.filter((asset) => asset.lead)
  const supportAssets = chapter.assets.filter((asset) => !asset.lead)
  const hasBuiltLesson = ['signal', 'relaxation', 'encoding', 'k-space', 'sequences', 'quality', 'model-input'].includes(chapter.id)

  return (
    <article className="ct-learning-module mri-learning-module">
      <header className="ct-learning-hero">
        <div>
          <p className="section-kicker"><Magnet aria-hidden="true" /> Magnetic resonance</p>
          <h2>From magnetization to image.</h2>
          <p>Follow how RF excitation, relaxation, spatial encoding, and reconstruction produce the MR series and tensors used by machine learning.</p>
        </div>
        <div className="ct-learning-progress-copy"><strong>{chapterIndex + 1} / {chapters.length}</strong></div>
        <div className="ct-learning-progress" aria-label={`MRI chapter ${chapterIndex + 1} of ${chapters.length}`}>{chapters.map((item, index) => <span key={item.id} className={index <= chapterIndex ? 'is-active' : ''} />)}</div>
      </header>

      <div className="ct-learning-workspace">
        <label className="ct-learning-chapter-picker">
          <span><small>Chapter</small><strong>{chapter.title}</strong></span>
          <select aria-label="Select MRI chapter" value={chapterIndex} onChange={(event) => setChapterIndex(Number(event.target.value))}>{chapters.map((item, index) => <option key={item.id} value={index} disabled={index > lastAvailableChapterIndex}>{index + 1}. {item.label}</option>)}</select>
        </label>

        <nav className="ct-learning-chapters" aria-label="MRI learning chapters">
          <p>Chapters</p>
          {chapters.map((item, index) => {
            const Icon = item.icon
            const isDisabled = index > lastAvailableChapterIndex
            return <button key={item.id} type="button" className={index === chapterIndex ? 'is-selected' : ''} aria-current={index === chapterIndex ? 'step' : undefined} disabled={isDisabled} title={isDisabled ? 'Coming soon' : undefined} onClick={() => setChapterIndex(index)}><span>{index + 1}</span><Icon aria-hidden="true" /><b>{item.label}</b></button>
          })}
        </nav>

        <section className="ct-learning-lesson" aria-labelledby="mri-learning-lesson-title">
          <header className="ct-learning-lesson-heading">
            <div><span><ChapterIcon aria-hidden="true" /> Chapter {chapterIndex + 1}</span><h3 id="mri-learning-lesson-title">{chapter.title}</h3><p>{chapter.summary}</p></div>
          </header>

          {chapter.id !== 'signal' && (
            <section className="ct-core-concept glass-panel">
              <small>Core concept</small>
              <h4>{emphasizeVocabulary(chapter.coreTitle)}</h4>
              <p>{emphasizeVocabulary(chapter.coreCopy)}</p>
            </section>
          )}

          {chapter.id === 'signal' ? <MriSignalSequenceLesson /> : <MriTeachingBlock content={chapter.teaching} />}
          {chapter.id === 'signal'
            ? <MriSignalReferences />
            : chapter.id === 'relaxation'
              ? <MriRelaxationReferences
                  tr={relaxationTiming.tr}
                  te={relaxationTiming.te}
                  onTrChange={(tr) => setRelaxationTiming((current) => ({ ...current, tr }))}
                  onTeChange={(te) => setRelaxationTiming((current) => ({ ...current, te }))}
                />
              : chapter.id === 'encoding'
                ? <MriEncodingLesson />
              : chapter.id === 'k-space'
                ? <MriKspaceLesson />
              : chapter.id === 'sequences'
                ? <MriSequenceLesson />
              : chapter.id === 'quality'
                ? <MriArtifactLesson />
              : chapter.id === 'model-input'
                ? <MriMlPipelineLesson />
              : !hasBuiltLesson && <>
                  {leadAssets.length > 0 && <div className="ct-asset-grid mri-lead-assets">{leadAssets.map((asset) => <MriAssetCard key={asset.title} asset={asset} />)}</div>}
                  {supportAssets.length > 0 && <div className="ct-asset-grid">{supportAssets.map((asset) => <MriAssetCard key={asset.title} asset={asset} />)}</div>}
                </>}

          <section className="ct-chapter-takeaways glass-panel" aria-label={`${chapter.title} teaching goals`}>
            <span>Keep from this chapter</span>
            <ol>{chapter.takeaways.map((takeaway) => <li key={takeaway}>{emphasizeVocabulary(takeaway)}</li>)}</ol>
          </section>
        </section>
      </div>
    </article>
  )
}
