import { useEffect, useRef, useState } from 'react'
import type { ComponentType, CSSProperties, KeyboardEvent, PointerEvent, SVGProps } from 'react'
import { Binary, Braces, Database, ExternalLink, FileStack, Move3d, Scan, Waypoints } from 'lucide-react'
import AnatomicalPlanesScene from './AnatomicalPlanesScene'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>
type ChapterId = 'formats' | 'contents' | 'spacing' | 'origin' | 'direction' | 'transform' | 'planes'

interface ImageDataChapter {
  id: ChapterId
  title: string
  navigationLabel: string
  summary: string
  learningPoints: string[]
  icon: IconComponent
}

const chapters: ImageDataChapter[] = [
  {
    id: 'formats',
    title: 'Data formats',
    navigationLabel: 'Data formats',
    summary: 'Start by comparing how common formats package the same underlying image and its metadata.',
    learningPoints: [
      'Choose formats by workflow and interoperability—not by assuming one is universally best.',
      'A DICOM study contains one or more series; each series contains related instances that may hold one or multiple frames.',
      'Conversion must preserve geometry and clinically important metadata, not only the voxel array.',
    ],
    icon: FileStack,
  },
  {
    id: 'contents',
    title: 'Header and voxel data',
    navigationLabel: 'Header & voxel data',
    summary: 'Separate the stored samples from the information required to decode and position them correctly.',
    learningPoints: [
      'Dimensions and numeric type tell software how to reconstruct the stored samples as an array.',
      'An index (i, j, k) is a dimensionless address inside that array—not a physical location.',
      'Spacing, direction, and origin locate the array in physical space without changing its stored values.',
    ],
    icon: Database,
  },
  {
    id: 'planes',
    title: 'Planes and coordinate conventions',
    navigationLabel: 'Planes & coordinates',
    summary: 'Connect anatomical slice planes with the LPS and RAS coordinate conventions used by imaging software.',
    learningPoints: [
      'Axial, coronal, and sagittal are patient-relative planes—not names for array axes.',
      'LPS and RAS describe the same physical space with opposite signs on the first two axes; superior remains positive Z.',
      'An IJK index becomes anatomically meaningful only after image geometry maps it into patient coordinates.',
    ],
    icon: Scan,
  },
  {
    id: 'spacing',
    title: 'Size and spacing',
    navigationLabel: 'Size & spacing',
    summary: 'Distinguish the number of samples from the physical distance represented by each step through the array.',
    learningPoints: [
      'Size counts samples along each image axis; spacing measures the distance between neighbouring voxel centres.',
      'For N samples, the centre-to-centre span from the first voxel to the last is (N − 1) × spacing.',
      'Missing spacing means the physical scale is unknown—not that the voxels are isotropic or 1 × 1 × 1 mm.',
    ],
    icon: Binary,
  },
  {
    id: 'origin',
    title: 'Origin',
    navigationLabel: 'Origin',
    summary: 'See how the image grid is anchored to a physical coordinate system without changing the array itself.',
    learningPoints: [
      'Origin assigns a physical location to image index (0, 0, 0).',
      'It is not necessarily the anatomical centre or a visible corner of the patient.',
      'Changing origin translates the grid while size, spacing, direction, and voxel values remain unchanged.',
    ],
    icon: Move3d,
  },
  {
    id: 'direction',
    title: 'Direction',
    navigationLabel: 'Direction',
    summary: 'Understand how image axes point through physical space and why ignoring this matrix can mirror or rotate anatomy.',
    learningPoints: [
      'Each column of the direction matrix is a unit vector showing where one image axis points in physical space.',
      'The identity matrix aligns i, j, and k with physical X, Y, and Z; each component’s sign shows whether an image axis points toward a positive or negative physical direction.',
      'Changing direction metadata reorients the existing grid in physical space without reordering or resampling its voxel values.',
    ],
    icon: Waypoints,
  },
  {
    id: 'transform',
    title: 'Putting geometry together',
    navigationLabel: 'Geometry together',
    summary: 'Combine spacing, direction, and origin in a worked calculation that locates one voxel in physical space.',
    learningPoints: [
      'The mapping is applied in order: scale by spacing, orient with direction, then add origin.',
      'A non-identity direction matrix reorients the scaled displacement before origin is added.',
      'Voxel intensity is not part of the coordinate transform and remains unchanged.',
    ],
    icon: Braces,
  },
]

function AssetHeader({ id, eyebrow, title, description, badge }: { id: string; eyebrow: string; title: string; description: string; badge?: string }) {
  return (
    <header className="image-data-asset-header">
      <div><small>{eyebrow}</small><h4 id={id}>{title}</h4><p>{description}</p></div>
      {badge && <span>{badge}</span>}
    </header>
  )
}

function FormatsAsset() {
  return (
    <section className="image-data-asset image-data-format-asset glass-panel" aria-labelledby="formats-concept-title">
      <div className="image-data-format-introduction">
        <small>Core idea</small>
        <h4 id="formats-concept-title">Values and context</h4>
        <p className="image-data-format-lead">Conceptually, a medical image has two parts: a multidimensional array of stored values and metadata that explains how to interpret that array.</p>
        <div className="image-data-format-principles">
          <section>
            <h5>Header</h5>
            <p>The header describes how those stored numbers become a meaningful image. It records information such as array dimensions, numerical datatype, value scaling, spacing, origin, direction, units, and coordinate convention. DICOM can additionally preserve patient, study, series, acquisition, and modality information. Without this metadata, software may not know how to decode the stored values. Even when the numerical array can be recovered, its physical size, orientation, position, units, and clinical context may remain ambiguous.</p>
          </section>
          <section>
            <h5>Voxel data</h5>
            <p>The numerical samples form the image—similar to the pixel values in a digital photograph. In medical imaging, these values are often produced by the scanner’s reconstruction and processing pipeline rather than being raw detector measurements. A two-dimensional image contains pixels; a three-dimensional volume contains voxels.</p>
          </section>
        </div>
      </div>
      <AssetHeader id="formats-table-title" eyebrow="Comparison table" title="How formats package the same image" description="Each format divides responsibility between metadata and the voxel payload differently." />
      <div className="image-data-table-wrap">
        <table aria-label="Medical image format comparison">
          <thead><tr><th>Format</th><th>Packaging</th><th>Header / metadata</th><th>Voxel payload</th><th>Common use</th></tr></thead>
          <tbody>
            <tr><th>DICOM</th><td>Study → series → instances; an image instance may contain one or multiple frames</td><td>Rich tag dataset covering patient, study, series, acquisition, modality, geometry, value transforms, and display information</td><td>Commonly 8- or 16-bit integer samples; signed or unsigned; native or compressed. Floating-point elements also exist.</td><td>Clinical acquisition, exchange, and PACS (clinical image archives)</td></tr>
            <tr><th>NIfTI</th><td><code>.nii</code>, compressed <code>.nii.gz</code>, or paired <code>.hdr</code> + <code>.img</code></td><td>Compact header containing dimensions, datatype, spacing, units, scaling, intent, and qform/sform transforms</td><td>One declared datatype across the array; integer, floating-point, complex, or RGB values with optional slope/intercept scaling</td><td>Research volumes, especially neuroimaging</td></tr>
            <tr><th>NRRD</th><td>Attached <code>.nrrd</code>, or <code>.nhdr</code> plus separate data</td><td>Human-readable header containing dimensions, axis sizes, type, encoding, units, axis meanings, origin, and directions</td><td>Integer, floating-point, or opaque block data; raw, text, or compressed encoding with explicit byte order</td><td>Scientific imaging, segmentation, and interchange</td></tr>
            <tr><th>MetaImage</th><td>Commonly a single <code>.mha</code>, or an <code>.mhd</code> header referencing external image data</td><td>Key/value header containing dimensions, element type, spacing, origin, transform, byte order, compression, and data location</td><td>One declared <code>ElementType</code>; commonly embedded or external binary data with explicit byte order</td><td>ITK-based processing and simple volume interchange</td></tr>
          </tbody>
        </table>
      </div>
      <p className="image-data-asset-note">Most formats support overlapping numerical types. The useful differences are how they package the payload, describe its interpretation, and preserve surrounding metadata. The next chapter examines header fields and voxel storage in more detail.</p>
    </section>
  )
}

function IndexVoxelDiagram() {
  return (
    <svg className="image-data-index-diagram" viewBox="220 20 380 205" role="img" aria-labelledby="index-voxel-title">
      <title id="index-voxel-title">A three-dimensional voxel array with local index axes i, j, and k</title>
      <defs>
        <marker id="index-axis-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path className="axis-arrowhead" d="M 0 0 L 8 4 L 0 8 z" />
        </marker>
      </defs>

      <g className="voxel-cube-faces">
        <polygon className="voxel-face voxel-face-top" points="300,75 370,35 530,35 460,75" />
        <polygon className="voxel-face voxel-face-side" points="460,75 530,35 530,155 460,195" />
        <polygon className="voxel-face voxel-face-front" points="300,75 460,75 460,195 300,195" />
      </g>
      <g className="voxel-cube-grid">
        <line x1="340" y1="75" x2="340" y2="195" /><line x1="380" y1="75" x2="380" y2="195" /><line x1="420" y1="75" x2="420" y2="195" />
        <line x1="300" y1="115" x2="460" y2="115" /><line x1="300" y1="155" x2="460" y2="155" />
        <line x1="340" y1="75" x2="410" y2="35" /><line x1="380" y1="75" x2="450" y2="35" /><line x1="420" y1="75" x2="490" y2="35" />
        <line x1="335" y1="55" x2="495" y2="55" />
        <line x1="460" y1="115" x2="530" y2="75" /><line x1="460" y1="155" x2="530" y2="115" /><line x1="495" y1="55" x2="495" y2="175" />
      </g>
      <polygon className="voxel-highlight" points="380,115 420,115 420,155 380,155" />

      <g className="index-axes">
        <circle cx="300" cy="195" r="4" />
        <line x1="300" y1="195" x2="488" y2="195" markerEnd="url(#index-axis-arrow)" />
        <line x1="300" y1="195" x2="375" y2="152" markerEnd="url(#index-axis-arrow)" />
        <line x1="300" y1="195" x2="300" y2="48" markerEnd="url(#index-axis-arrow)" />
        <text x="498" y="200">i</text><text x="384" y="153">j</text><text x="290" y="40">k</text>
      </g>
      <text className="voxel-highlight-label" x="400" y="139">value</text>
    </svg>
  )
}

function PhysicalVoxelDiagram() {
  return (
    <svg className="image-data-physical-diagram" viewBox="0 0 760 285" role="img" aria-labelledby="physical-voxel-title">
      <title id="physical-voxel-title">The same voxel grid positioned in physical x, y, z space using header geometry</title>
      <defs>
        <marker id="physical-axis-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path className="axis-arrowhead" d="M 0 0 L 8 4 L 0 8 z" />
        </marker>
      </defs>

      <g className="physical-reference-grid">
        <line x1="85" y1="240" x2="690" y2="240" markerEnd="url(#physical-axis-arrow)" />
        <line x1="85" y1="240" x2="234" y2="158" markerEnd="url(#physical-axis-arrow)" />
        <line x1="85" y1="240" x2="85" y2="35" markerEnd="url(#physical-axis-arrow)" />
        <text x="702" y="246">x</text><text x="244" y="158">y</text><text x="75" y="27">z</text>
        <circle cx="85" cy="240" r="4" />
        <text className="physical-origin-label" x="96" y="261">physical origin (0, 0, 0)</text>
      </g>

      <line className="origin-offset-line" x1="85" y1="240" x2="360" y2="190" />
      <g className="physical-voxel-cube">
        <polygon className="voxel-face voxel-face-top" points="380,100 445,60 605,90 540,130" />
        <polygon className="voxel-face voxel-face-side" points="540,130 605,90 585,180 520,220" />
        <polygon className="voxel-face voxel-face-front" points="380,100 540,130 520,220 360,190" />
        <g className="voxel-cube-grid">
          <line x1="420" y1="107.5" x2="400" y2="197.5" /><line x1="460" y1="115" x2="440" y2="205" /><line x1="500" y1="122.5" x2="480" y2="212.5" />
          <line x1="373.3" y1="130" x2="533.3" y2="160" /><line x1="366.7" y1="160" x2="526.7" y2="190" />
          <line x1="420" y1="107.5" x2="485" y2="67.5" /><line x1="460" y1="115" x2="525" y2="75" /><line x1="500" y1="122.5" x2="565" y2="82.5" />
          <line x1="412.5" y1="80" x2="572.5" y2="110" />
          <line x1="533.3" y1="160" x2="598.3" y2="120" /><line x1="526.7" y1="190" x2="591.7" y2="150" /><line x1="572.5" y1="110" x2="552.5" y2="200" />
        </g>
        <polygon className="voxel-highlight" points="453.3,145 493.3,152.5 486.7,182.5 446.7,175" />
      </g>

      <circle className="image-origin-point" cx="360" cy="190" r="5" />
      <g className="image-origin-annotation">
        <line x1="356" y1="185" x2="336" y2="142" />
        <text x="270" y="120"><tspan x="270">image origin</tspan><tspan x="270" dy="13">(−120, 34, 58) mm</tspan></text>
      </g>
      <g className="same-values-label">
        <rect x="425" y="24" width="155" height="25" rx="12.5" />
        <text x="502.5" y="41">same stored values</text>
      </g>
    </svg>
  )
}

function ContentsAsset() {
  return (
    <section className="image-data-asset glass-panel" aria-labelledby="contents-asset-title">
      <AssetHeader id="contents-asset-title" eyebrow="Core concept" title="From stored samples to a positioned image" description="A medical image couples numerical samples with the instructions needed to decode their array and place it in physical space." />
      <div className="image-data-contents-teaching">
        <section>
          <small>01 · Header</small>
          <h5>Decode the stored array</h5>
          <p>On disk, the voxel payload is a sequence of bytes rather than a self-explanatory image. The dimensions state how many samples belong on each array axis. The numeric type states how each bit pattern should be interpreted—for example, as a signed integer, unsigned integer, or floating-point value.</p>
          <p>Software reads these fields before decoding the payload so that it does not have to guess the array shape or value representation. A header can also contain value scaling, acquisition details, and other format-specific metadata, but those descriptions remain separate from the numerical samples.</p>
        </section>
        <section>
          <small>02 · Voxel data</small>
          <h5>Index space is an address system</h5>
          <p>After decoding, the samples form a multidimensional array. A voxel is addressed by an integer index <code>(i, j, k)</code>. Moving from <code>(i, j, k)</code> to <code>(i + 1, j, k)</code> selects the neighbouring sample along the first array axis.</p>
          <p>That step does not yet mean moving one millimetre, moving right, or moving toward any anatomical direction. The voxel value answers “what number is stored?” while the index answers “where is it inside the array?”</p>
        </section>
        <section>
          <small>03 · Geometry</small>
          <h5>Give indices physical meaning</h5>
          <p>Spacing assigns a physical distance to each index step. Direction describes how the image axes point through the physical coordinate system. Origin gives the physical location of voxel index <code>(0, 0, 0)</code>.</p>
          <p>Together, these fields map an array index to a physical point <code>(x, y, z)</code>, commonly measured in millimetres. The same stored array can therefore be positioned, oriented, or scaled differently by changing its geometry—without rewriting its voxel values.</p>
        </section>
      </div>
      <figure className="image-data-container-figure">
        <div className="image-data-header-block">
          <header><div><strong>Header</strong><small>Metadata</small></div><span>Read first</span></header>
          <div className="image-data-header-fields">
            <span><small>Dimensions</small><code>4 × 3 × 2</code></span>
            <span><small>Numeric type</small><code>int16</code></span>
            <span><small>Spacing</small><code>0.8, 0.8, 2.5 mm</code></span>
            <span><small>Origin</small><code>−120, 34, 58 mm</code></span>
            <span><small>Direction</small><code>3 × 3 matrix</code></span>
          </div>
        </div>
        <section className="image-data-space-card image-data-index-space" aria-labelledby="index-space-title">
          <header><div><strong id="index-space-title">Voxel data</strong><small>Index space</small></div><code>i, j, k</code></header>
          <div className="image-data-voxel-summary">
            <span><small>Stored array</small><strong>4 × 3 × 2 voxels</strong></span>
            <p>Unit index cells · spacing not yet applied</p>
          </div>
          <IndexVoxelDiagram />
        </section>
        <section className="image-data-space-card image-data-physical-space" aria-labelledby="physical-space-title">
          <header><div><strong id="physical-space-title">Physical space</strong><small>Coordinates in a chosen frame</small></div><code>x, y, z</code></header>
          <div className="image-data-concept-flow" aria-label="Voxel index plus header geometry gives physical location">
            <div><small>Array address</small><code>(i, j, k)</code></div>
            <b>+</b>
            <div className="is-geometry"><small>Header geometry</small><span>spacing · direction · origin</span></div>
            <b className="is-next">→</b>
            <div><small>Physical location</small><code>(x, y, z)</code></div>
          </div>
          <PhysicalVoxelDiagram />
        </section>
        <figcaption>The mapping changes the grid’s physical interpretation—not its voxel order or stored values. The complete calculation is introduced later in Putting geometry together.</figcaption>
      </figure>
    </section>
  )
}

function SpacingAsset() {
  const [spacingI, setSpacingI] = useState(1)
  const [spacingJ, setSpacingJ] = useState(1)
  const [locked, setLocked] = useState(false)
  const cells = Array.from({ length: 24 }, (_, index) => <span key={index} />)
  const centreSpanI = 5 * spacingI
  const centreSpanJ = 3 * spacingJ
  const footprintI = 6 * spacingI
  const footprintJ = 4 * spacingJ
  const format = (value: number) => value.toFixed(1)

  const updateSpacing = (axis: 'i' | 'j', value: number) => {
    if (locked) {
      setSpacingI(value)
      setSpacingJ(value)
      return
    }
    if (axis === 'i') setSpacingI(value)
    else setSpacingJ(value)
  }

  const resetSpacing = () => {
    setSpacingI(1)
    setSpacingJ(1)
    setLocked(false)
  }

  return (
    <section className="image-data-asset glass-panel" aria-labelledby="spacing-asset-title">
      <AssetHeader id="spacing-asset-title" eyebrow="Core concept" title="Size counts samples; spacing measures steps" description="Array dimensions and physical sampling describe different properties of the same image grid." />
      <div className="image-data-chapter-teaching">
        <section>
          <small>01 · Size</small>
          <h5>Count samples on each axis</h5>
          <p>An image size of <code>(6, 4)</code> means the array contains six samples along its first axis and four along its second: 24 values in total. Because indices begin at zero, the first index is <code>(0, 0)</code> and the last is <code>(5, 3)</code>.</p>
        </section>
        <section>
          <small>02 · Spacing</small>
          <h5>Measure one index step</h5>
          <p>Spacing gives the physical distance between neighbouring voxel centres along each image axis. The controls below change <code>i</code> and <code>j</code> spacing independently while leaving all 24 stored samples unchanged.</p>
        </section>
        <section>
          <small>03 · Extent</small>
          <h5>Combine count and distance</h5>
          <p>From the centre of the first voxel to the centre of the last, the sampled span is <code>(size − 1) × spacing</code>. Change either spacing value to see the physical span update without changing the array size.</p>
        </section>
      </div>
      <div className="image-data-spacing-lab">
        <section className="spacing-control-panel" aria-label="Image-axis spacing controls">
          <header>
            <div><small>Image-axis spacing</small><strong>Change the physical step</strong></div>
            <button type="button" onClick={resetSpacing} disabled={spacingI === 1 && spacingJ === 1 && !locked}>Reset</button>
          </header>
          <div className="spacing-slider-pair">
            <label className="spacing-vertical-slider">
              <span><strong>i spacing</strong><output>{format(spacingI)} mm</output></span>
              <span className="spacing-slider-track">
                <small>2.5</small>
                <input type="range" min="0.5" max="2.5" step="0.1" value={spacingI} onChange={(event) => updateSpacing('i', Number(event.target.value))} aria-label="i-axis spacing" aria-valuetext={`${format(spacingI)} millimetres`} />
                <small>0.5</small>
              </span>
            </label>
            <label className="spacing-vertical-slider">
              <span><strong>j spacing</strong><output>{format(spacingJ)} mm</output></span>
              <span className="spacing-slider-track">
                <small>2.5</small>
                <input type="range" min="0.5" max="2.5" step="0.1" value={spacingJ} onChange={(event) => updateSpacing('j', Number(event.target.value))} aria-label="j-axis spacing" aria-valuetext={`${format(spacingJ)} millimetres`} />
                <small>0.5</small>
              </span>
            </label>
          </div>
          <label className="spacing-lock-control">
            <input
              type="checkbox"
              checked={locked}
              onChange={(event) => {
                const nextLocked = event.target.checked
                setLocked(nextLocked)
                if (nextLocked) setSpacingJ(spacingI)
              }}
            />
            <span><strong>Lock equal spacing</strong><small>Move both axes together</small></span>
          </label>
        </section>

        <section className="spacing-physical-preview" aria-label="Physical interpretation of a fixed six by four image array">
          <header>
            <div><small>Physical space</small><strong>Same 6 × 4 sample matrix</strong></div>
            <span>24 samples</span>
          </header>
          <div className="spacing-preview-stage">
            <div
              className="spacing-physical-grid"
              style={{ '--spacing-i': spacingI, '--spacing-j': spacingJ } as CSSProperties}
            >
              {cells}
              <svg viewBox="0 0 120 80" preserveAspectRatio="none" aria-hidden="true">
                <path className="spacing-anatomy-body" d="M60 4 C85 4 104 17 108 36 C112 57 94 74 60 76 C26 74 8 57 12 36 C16 17 35 4 60 4 Z" />
                <ellipse className="spacing-anatomy-lung" cx="39" cy="38" rx="17" ry="25" />
                <ellipse className="spacing-anatomy-lung" cx="81" cy="38" rx="17" ry="25" />
                <ellipse className="spacing-anatomy-heart" cx="64" cy="47" rx="11" ry="14" />
                <circle className="spacing-anatomy-spine" cx="60" cy="67" r="5" />
              </svg>
              <b className="spacing-axis-i">i</b>
              <b className="spacing-axis-j">j</b>
            </div>
          </div>
          <dl className="spacing-live-readout">
            <div><dt>Spacing</dt><dd>({format(spacingI)}, {format(spacingJ)}) mm</dd></div>
            <div><dt>Centre span</dt><dd>({format(centreSpanI)}, {format(centreSpanJ)}) mm</dd></div>
            <div><dt>Sample footprint</dt><dd>({format(footprintI)}, {format(footprintJ)}) mm</dd></div>
          </dl>
          <p className="spacing-unchanged-note"><strong>Array unchanged:</strong> indices still run from (0, 0) to (5, 3).</p>
        </section>
      </div>
      <aside className="image-data-definition-note">
        <strong>Changing spacing is not resampling</strong>
        <p>Editing only the spacing field changes how the existing samples are interpreted in physical space; it does not create or remove samples. Resampling calculates a new array on a newly defined grid.</p>
      </aside>
      <figure className="image-data-isotropy-figure">
        <img src="https://simpleitk.readthedocs.io/en/master/_images/nonisotropicVsIsotropic.svg" alt="The same medical image displayed incorrectly with square pixels and correctly using its non-isotropic pixel spacing" />
        <figcaption>
          <span><strong>Same samples, different interpretation.</strong> The array-only view on the left ignores the recorded <code>(0.97656, 2.0) mm</code> spacing and distorts the anatomy. The spacing-aware view on the right preserves its physical proportions.</span>
          <span className="image-data-figure-credit">Figure: <a href="https://simpleitk.readthedocs.io/en/master/fundamentalConcepts.html#lbl-isotropy" target="_blank" rel="noreferrer">SimpleITK documentation <ExternalLink aria-hidden="true" /></a> · <a href="https://github.com/SimpleITK/SimpleITK/blob/main/LICENSE" target="_blank" rel="noreferrer">Apache-2.0 license <ExternalLink aria-hidden="true" /></a></span>
        </figcaption>
      </figure>
      <aside className="image-data-spacing-warning" aria-label="Why spacing metadata matters">
        <strong>Missing spacing is unknown—not isotropic.</strong>
        <p>If a blank or incomplete header is treated as <code>1 × 1 × 1 mm</code>, software assigns a physical scale that was never established. Anatomy can be stretched or compressed, and any distance, area, or volume derived from that geometry can be wrong even though the voxel values still look plausible.</p>
      </aside>
    </section>
  )
}

function OriginAsset() {
  const originalOrigin = [-120, 34, 0] as const
  const exampleOrigin = [-100, 50, 0] as const
  const spacing = [0.8, 0.8, 2.5] as const
  const xRange = [-135, -85] as const
  const yRange = [20, 70] as const
  const [currentOrigin, setCurrentOrigin] = useState<[number, number, number]>([...exampleOrigin])
  const [selectedIndex, setSelectedIndex] = useState<[number, number, number]>([2, 1, 0])
  const [isDragging, setIsDragging] = useState(false)
  const figureRef = useRef<HTMLElement>(null)
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null)
  const suppressCellClick = useRef(false)

  const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))
  const currentLeft = clamp(12 + ((currentOrigin[0] - originalOrigin[0]) * 1.5), 4, 62)
  const currentBottom = clamp(42 + ((currentOrigin[1] - originalOrigin[1]) * 3.8), 18, 166)
  const arrowEndY = 100 - ((currentBottom / 330) * 100)
  const originalPoint = originalOrigin.map((value, axis) => value + (selectedIndex[axis] * spacing[axis]))
  const currentPoint = currentOrigin.map((value, axis) => value + (selectedIndex[axis] * spacing[axis]))
  const delta = currentOrigin.map((value, axis) => value - originalOrigin[axis])
  const formatNumber = (value: number) => {
    const rounded = Number(value.toFixed(1))
    const magnitude = Number.isInteger(rounded) ? Math.abs(rounded).toFixed(0) : Math.abs(rounded).toFixed(1)
    return `${rounded < 0 ? '−' : ''}${magnitude}`
  }
  const formatVector = (values: readonly number[]) => `[${values.map(formatNumber).join(', ')}]`
  const isAtOriginal = currentOrigin.every((value, axis) => value === originalOrigin[axis])
  const isAtExample = currentOrigin.every((value, axis) => value === exampleOrigin[axis])

  const updateOriginFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const figure = figureRef.current
    if (!figure) return
    const bounds = figure.getBoundingClientRect()
    const requestedLeft = ((event.clientX - bounds.left - 90) / Math.max(1, bounds.width)) * 100
    const requestedBottom = bounds.bottom - event.clientY - 60
    const x = clamp(Math.round(originalOrigin[0] + ((requestedLeft - 12) / 1.5)), ...xRange)
    const y = clamp(Math.round(originalOrigin[1] + ((requestedBottom - 42) / 3.8)), ...yRange)
    setCurrentOrigin(([,, z]) => [x, y, z])
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragState.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsDragging(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3) drag.moved = true
    updateOriginFromPointer(event)
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    suppressCellClick.current = drag.moved
    dragState.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
    setIsDragging(false)
    window.setTimeout(() => { suppressCellClick.current = false }, 0)
  }

  const nudgeOrigin = (event: KeyboardEvent<HTMLDivElement>) => {
    const increments: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowDown: [0, -1], ArrowUp: [0, 1],
    }
    const increment = increments[event.key]
    if (!increment) return
    event.preventDefault()
    setCurrentOrigin(([x, y, z]) => [clamp(x + increment[0], ...xRange), clamp(y + increment[1], ...yRange), z])
  }

  const cells = Array.from({ length: 24 }, (_, position) => {
    const i = position % 6
    const j = 3 - Math.floor(position / 6)
    const selected = selectedIndex[0] === i && selectedIndex[1] === j
    return (
      <button
        type="button"
        key={`${i}-${j}`}
        className={selected ? 'is-selected' : undefined}
        aria-label={`Select voxel i ${i}, j ${j}`}
        aria-pressed={selected}
        onClick={() => {
          if (!suppressCellClick.current) setSelectedIndex([i, j, 0])
        }}
      />
    )
  })

  return (
    <section className="image-data-asset glass-panel" aria-labelledby="origin-asset-title">
      <AssetHeader id="origin-asset-title" eyebrow="Core concept" title="Origin translates an unchanged grid" description="Origin anchors voxel index (0, 0, 0) to one location in the physical coordinate system." />
      <div className="image-data-chapter-teaching">
        <section>
          <small>01 · Anchor</small>
          <h5>Locate the zero index</h5>
          <p>Origin is the physical coordinate assigned to the centre of voxel index <code>(0, 0, 0)</code>. Every other voxel location is calculated relative to that anchor.</p>
        </section>
        <section>
          <small>02 · Meaning</small>
          <h5>Not the centre of the patient</h5>
          <p>The image origin is not necessarily an anatomical landmark, the scanner’s global origin, or the centre of the image. It is simply the physical location chosen for the array’s zero index.</p>
        </section>
        <section>
          <small>03 · Translation</small>
          <h5>Move every voxel equally</h5>
          <p>Changing origin adds the same displacement to every voxel coordinate. Size, spacing, direction, indices, and stored values remain unchanged.</p>
        </section>
      </div>
      <div className="image-data-origin-layout">
        <figure className="image-data-origin-figure" ref={figureRef}>
          <div className="physical-axis axis-x">+X</div><div className="physical-axis axis-y">+Y</div>
          <div className="origin-grid original"><span className="origin-grid-label">Original origin</span></div>
          <svg className="origin-translation-arrow" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><marker id="origin-arrowhead" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs>
            <line x1="12" y1="87.3" x2={currentLeft} y2={arrowEndY} markerEnd="url(#origin-arrowhead)" />
          </svg>
          <div
            className={`origin-grid current${isDragging ? ' is-dragging' : ''}`}
            style={{ '--origin-left': `${currentLeft}%`, '--origin-bottom': `${currentBottom}px` } as CSSProperties}
            role="group"
            tabIndex={0}
            aria-label={`Current image grid. Origin ${formatVector(currentOrigin)} millimetres. Drag to change X and Y, or use the arrow keys.`}
            onKeyDown={nudgeOrigin}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            {cells}
            <span className="origin-grid-label">Current origin</span>
          </div>
          <div className="origin-drag-hint">Drag grid in X/Y · arrow keys nudge · select a voxel</div>
          <div className="origin-figure-actions">
            <button type="button" onClick={() => setCurrentOrigin([...originalOrigin])} disabled={isAtOriginal}>Align origins</button>
            <button type="button" onClick={() => setCurrentOrigin([...exampleOrigin])} disabled={isAtExample}>Reset demo</button>
          </div>
          <figcaption>The array shape and values stay fixed; only its physical anchor changes.</figcaption>
        </figure>
        <div className="image-data-origin-readout">
          <div><small>Selected index</small><strong><code>i = {formatVector(selectedIndex)}</code></strong><span>spacing {formatVector(spacing)} mm · identity direction</span></div>
          <div><small>Original geometry</small><strong><code>o = {formatVector(originalOrigin)} mm</code></strong><span>voxel position p = {formatVector(originalPoint)} mm</span></div>
          <div><small>Current geometry</small><strong><code>o′ = {formatVector(currentOrigin)} mm</code></strong><span>voxel position p′ = {formatVector(currentPoint)} mm</span></div>
          <p><strong>o′ − o = {formatVector(delta)} mm</strong><span>Current origin minus original origin. Every voxel moves by this same displacement.</span></p>
        </div>
      </div>
    </section>
  )
}

function DirectionAsset() {
  const [angle, setAngle] = useState(30)
  const [flipI, setFlipI] = useState(false)
  const [animationPlaying, setAnimationPlaying] = useState(true)
  const animationPhase = useRef(Math.asin(30 / 35))

  useEffect(() => {
    if (!animationPlaying) return
    let frame = 0
    let previousTime: number | undefined
    const tick = (time: number) => {
      if (previousTime === undefined) previousTime = time
      const elapsedSeconds = Math.min((time - previousTime) / 1000, 0.05)
      previousTime = time
      animationPhase.current = (animationPhase.current + (elapsedSeconds * Math.PI * 2 / 6)) % (Math.PI * 2)
      setAngle(Math.round(35 * Math.sin(animationPhase.current)))
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [animationPlaying])

  const selectAngle = (nextAngle: number) => {
    setAnimationPlaying(false)
    const normalizedAngle = Math.max(-35, Math.min(35, nextAngle)) / 35
    const matchingPhase = Math.asin(normalizedAngle)
    animationPhase.current = Math.cos(animationPhase.current) >= 0 ? matchingPhase : Math.PI - matchingPhase
    setAngle(nextAngle)
  }

  const toggleAnimation = () => {
    setAnimationPlaying((playing) => !playing)
  }

  const radians = (angle * Math.PI) / 180
  const clean = (value: number) => Math.abs(value) < 0.0005 ? 0 : value
  const cos = clean(Math.cos(radians))
  const sin = clean(Math.sin(radians))
  const iColumn = [clean((flipI ? -1 : 1) * cos), clean((flipI ? -1 : 1) * sin), 0]
  const jColumn = [clean(-sin), cos, 0]
  const kColumn = [0, 0, 1]
  const matrixRows = [
    [iColumn[0], jColumn[0], kColumn[0]],
    [iColumn[1], jColumn[1], kColumn[1]],
    [iColumn[2], jColumn[2], kColumn[2]],
  ]
  const formatValue = (value: number) => {
    const normalized = clean(value)
    if (Number.isInteger(normalized)) return `${normalized < 0 ? '−' : ''}${Math.abs(normalized).toFixed(0)}`
    return `${normalized < 0 ? '−' : ''}${Math.abs(normalized).toFixed(3)}`
  }
  const formatColumn = (column: number[]) => `[${column.map(formatValue).join(', ')}]`
  const formattedAngle = `${angle < 0 ? '−' : ''}${Math.abs(angle)}°`
  const orientationLabel = angle === 0
    ? (flipI ? '0° · i reversed' : 'Identity')
    : `${formattedAngle} about +Z${flipI ? ' · i reversed' : ''}`
  const gridStyle = {
    '--direction-angle': `${-angle}deg`,
    '--direction-counter-angle': `${angle}deg`,
    '--direction-flip-i': flipI ? -1 : 1,
  } as CSSProperties
  const gridCells = (reference = false) => Array.from({ length: 12 }, (_, position) => {
    const i = position % 4
    const j = 2 - Math.floor(position / 4)
    const selected = i === 2 && j === 1
    return <span key={`${reference ? 'reference' : 'current'}-${i}-${j}`} className={`direction-cell${selected ? ' is-selected' : ''}`}><small>{position}</small>{selected && <b>(2, 1)</b>}</span>
  })

  return (
    <section className="image-data-asset glass-panel" aria-labelledby="direction-asset-title">
      <AssetHeader id="direction-asset-title" eyebrow="Core concept" title="Direction tells each image axis where to point" description="The array still uses i, j, and k; the direction matrix relates those axes to physical X, Y, and Z." />
      <div className="image-data-chapter-teaching">
        <section>
          <small>01 · Image axes</small>
          <h5>Give each index axis an orientation</h5>
          <p>Increasing <code>i</code>, <code>j</code>, or <code>k</code> moves through the array. Direction states which way each of those positive steps points in physical space.</p>
        </section>
        <section>
          <small>02 · Matrix columns</small>
          <h5>Read one axis at a time</h5>
          <p>The first column describes the <code>i</code> axis, the second describes <code>j</code>, and the third describes <code>k</code>. Rows show the components along physical X, Y, and Z. These direction-cosine columns are unit length and mutually perpendicular, so they encode orientation without scale or shear.</p>
        </section>
        <section>
          <small>03 · Interpretation</small>
          <h5>Reorient the grid, not its values</h5>
          <p>Changing direction metadata changes the physical interpretation of the grid. The voxel at index <code>(i, j, k)</code> keeps the same stored value and array address.</p>
        </section>
      </div>
      <div className="image-data-direction-layout">
        <figure className="image-data-direction-comparison">
          <header className="direction-lab-toolbar">
            <div><small>Physical XY frame</small><strong>{orientationLabel}</strong></div>
            <div className="direction-toolbar-controls">
              <div className="direction-presets" role="group" aria-label="Angle presets">
                <button type="button" aria-pressed={angle === 0} onClick={() => selectAngle(0)}>0°</button>
                <button type="button" aria-pressed={angle === 30} onClick={() => selectAngle(30)}>30°</button>
              </div>
              <button className="direction-animation-toggle" type="button" aria-pressed={animationPlaying} aria-label={animationPlaying ? 'Pause direction animation' : 'Resume direction animation'} onClick={toggleAnimation}>{animationPlaying ? 'Pause motion' : 'Resume motion'}</button>
              <button className="direction-reverse-toggle" type="button" aria-pressed={flipI} onClick={() => setFlipI((current) => !current)}>Reverse i</button>
            </div>
          </header>
          <div className="direction-stage">
            <span className="direction-physical-axis is-x"><b>+X</b></span>
            <span className="direction-physical-axis is-y"><b>+Y</b></span>
            <div className="direction-grid-stack" style={gridStyle}>
              <div className="direction-reference-grid" aria-hidden="true">{gridCells(true)}<em>Identity reference</em></div>
              <div className={`direction-current-grid${flipI ? ' is-reversed' : ''}`} aria-label={`Current image grid: ${orientationLabel}`}>
                {gridCells()}
                <span className="direction-basis-axis is-i"><b>+i</b></span>
                <span className="direction-basis-axis is-j"><b>+j</b></span>
                <em>Current grid</em>
              </div>
            </div>
          </div>
          <label className="direction-angle-control" htmlFor="direction-angle">
            <span><strong>Angle about +Z</strong><output>{formattedAngle}</output></span>
            <span className="direction-slider-track"><small>−90°</small><input id="direction-angle" type="range" min="-90" max="90" step="1" value={angle} aria-label="Direction angle" onPointerDown={() => setAnimationPlaying(false)} onChange={(event) => selectAngle(Number(event.target.value))} /><small>+90°</small></span>
          </label>
          <figcaption>The numbered cells keep the same array order. Direction changes where that unchanged grid lies in physical space.</figcaption>
        </figure>
        <div className="image-data-direction-readout">
          <header><small>Live direction matrix D</small><strong>Columns are image axes; rows are physical axes</strong></header>
          <table className="direction-matrix" aria-label="Live direction matrix">
            <thead><tr><th scope="col">D</th><th scope="col">+i</th><th scope="col">+j</th><th scope="col">+k</th></tr></thead>
            <tbody>{matrixRows.map((row, rowIndex) => <tr key={['x', 'y', 'z'][rowIndex]}><th scope="row">+{['X', 'Y', 'Z'][rowIndex]}</th>{row.map((value, columnIndex) => <td key={`${rowIndex}-${columnIndex}`} className={`is-${['i', 'j', 'k'][columnIndex]}`}><code>{formatValue(value)}</code></td>)}</tr>)}</tbody>
          </table>
          <dl>
            <div className="is-i"><dt>Column 1 · +i</dt><dd><code>{formatColumn(iColumn)}</code><span>{flipI ? 'reversed relative to the rotated +i axis' : angle === 0 ? 'aligned with physical +X' : 'components along physical X and Y'}</span></dd></div>
            <div className="is-j"><dt>Column 2 · +j</dt><dd><code>{formatColumn(jColumn)}</code><span>{angle === 0 ? 'aligned with physical +Y' : 'components along physical X and Y'}</span></dd></div>
            <div><dt>Column 3 · +k</dt><dd><code>{formatColumn(kColumn)}</code><span>aligned with physical +Z</span></dd></div>
          </dl>
          <p><strong>Direction versus spacing</strong><span>Direction supplies an orthonormal orientation; spacing supplies the physical distance travelled by one index step.</span></p>
          <p><strong>Coordinate convention</strong><span>These components are measured in the chosen physical frame. In a real image, that frame may be LPS or RAS.</span></p>
        </div>
      </div>
    </section>
  )
}

const geometryAnimationStages = [
  {
    title: 'Index grid',
    action: 'Start with stored samples',
    detail: 'The voxel grid begins in index space. Its cells are addressed by integer i, j, and k coordinates, but they do not yet have a physical scale or location.',
    formula: 'i = [2, 1, 0]',
  },
  {
    title: 'Apply spacing',
    action: 'Scale each image axis',
    detail: 'Spacing changes one index step into a physical displacement. The same grid stretches to represent its recorded sampling distances.',
    formula: 's ⊙ i = [1.6, 0.8, 0] mm',
  },
  {
    title: 'Apply direction',
    action: 'Rotate into the physical frame',
    detail: 'The direction matrix sends +i toward −Y, +j toward −Z, and +k toward +X. The voxel values and array order do not change.',
    formula: 'D(s ⊙ i) = [0, −1.6, −0.8] mm',
  },
  {
    title: 'Add origin',
    action: 'Translate the whole grid',
    detail: 'The origin moves the oriented grid from the physical frame’s zero point to its recorded location.',
    formula: 'o = [−120, 34, 58] mm',
  },
  {
    title: 'Physical image',
    action: 'Arrive at the final geometry',
    detail: 'The axes can now disappear: the unchanged samples occupy a defined position, orientation, and scale in physical space.',
    formula: 'p = [−120, 32.4, 57.2] mm',
  },
] as const

function GeometryTransformAnimation() {
  const [stage, setStage] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [resetting, setResetting] = useState(false)
  const finalStage = geometryAnimationStages.length - 1
  const current = geometryAnimationStages[stage]
  const stationX = [110, 305, 500, 695, 890]

  useEffect(() => {
    if (!playing || resetting) return
    if (stage === finalStage) {
      const fadeTimer = window.setTimeout(() => setResetting(true), 2800)
      return () => window.clearTimeout(fadeTimer)
    }
    const nextStage = stage + 1
    const timer = window.setTimeout(() => {
      setStage(nextStage)
    }, stage === 0 ? 1900 : 2400)
    return () => window.clearTimeout(timer)
  }, [finalStage, playing, resetting, stage])

  useEffect(() => {
    if (!resetting) return
    const jumpTimer = window.setTimeout(() => setStage(0), 360)
    const revealTimer = window.setTimeout(() => setResetting(false), 480)
    return () => {
      window.clearTimeout(jumpTimer)
      window.clearTimeout(revealTimer)
    }
  }, [resetting])

  const handlePlayback = () => {
    setPlaying((value) => !value)
  }

  const selectStage = (nextStage: number) => {
    setResetting(false)
    setStage(nextStage)
  }

  const playbackLabel = playing ? 'Pause animation' : 'Continue animation'

  return (
    <section className="geometry-conveyor" aria-labelledby="geometry-conveyor-title">
      <header className="geometry-conveyor-header">
        <div><small>Animated transform</small><h5 id="geometry-conveyor-title">One grid, five stages</h5></div>
        <button type="button" onClick={handlePlayback}>{playbackLabel}</button>
      </header>
      <div className={`geometry-conveyor-viewport is-stage-${stage}${playing ? ' is-playing' : ' is-paused'}${resetting ? ' is-resetting' : ''}`}>
        <svg viewBox="0 0 1000 320" role="img" aria-label={`Geometry animation stage ${stage + 1}: ${current.action}`}>
          <defs>
            <linearGradient id="geometry-voxel-front" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#aeefff" stopOpacity="0.7" /><stop offset="1" stopColor="#50bedb" stopOpacity="0.25" /></linearGradient>
            <linearGradient id="geometry-voxel-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d8f8ff" stopOpacity="0.72" /><stop offset="1" stopColor="#78d5eb" stopOpacity="0.34" /></linearGradient>
            <marker id="geometry-arrowhead" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" /></marker>
          </defs>

          <line className="geometry-conveyor-track" x1="74" y1="267" x2="926" y2="267" />
          {stationX.map((x, index) => <g key={x} className={`geometry-conveyor-station${index === stage ? ' is-current' : ''}${index < stage ? ' is-complete' : ''}`}><circle cx={x} cy="267" r="8" /><text x={x} y="295">{index + 1}</text></g>)}

          <g className="geometry-index-frame">
            <line x1="52" y1="224" x2="170" y2="224" markerEnd="url(#geometry-arrowhead)" /><text x="178" y="229">i</text>
            <line x1="52" y1="224" x2="52" y2="105" markerEnd="url(#geometry-arrowhead)" /><text x="44" y="94">j</text>
            <line x1="52" y1="224" x2="91" y2="193" markerEnd="url(#geometry-arrowhead)" /><text x="98" y="190">k</text>
          </g>

          <g className="geometry-spacing-cue">
            <line x1="238" y1="78" x2="372" y2="78" markerStart="url(#geometry-arrowhead)" markerEnd="url(#geometry-arrowhead)" />
            <text x="305" y="65">spacing scales each step</text>
          </g>

          <g className="geometry-scaled-frame">
            <line x1="238" y1="232" x2="384" y2="232" markerEnd="url(#geometry-arrowhead)" /><text x="397" y="255">i · 0.8 mm</text>
            <line x1="238" y1="232" x2="238" y2="106" markerEnd="url(#geometry-arrowhead)" /><text x="230" y="94">j · 0.8 mm</text>
            <line x1="238" y1="232" x2="286" y2="194" markerEnd="url(#geometry-arrowhead)" /><text x="305" y="190">k · 2.5 mm</text>
          </g>

          <g className="geometry-rotation-cue">
            <path className="geometry-rotation-arc" d="M 450 214 A 72 72 0 0 1 543 105" markerEnd="url(#geometry-arrowhead)" />
            <g className="geometry-direction-matrix" aria-label="Direction matrix: row one 0 0 1, row two negative 1 0 0, row three 0 negative 1 0">
              <text x="462" y="68">D =</text>
              <path d="M 477 38 H 471 V 94 H 477 M 545 38 H 551 V 94 H 545" />
              <text x="490" y="53">0</text><text x="511" y="53">0</text><text x="532" y="53">1</text>
              <text x="490" y="71">−1</text><text x="511" y="71">0</text><text x="532" y="71">0</text>
              <text x="490" y="89">0</text><text x="511" y="89">−1</text><text x="532" y="89">0</text>
            </g>
          </g>

          <g className="geometry-physical-frame">
            <line x1="430" y1="232" x2="574" y2="232" markerEnd="url(#geometry-arrowhead)" /><text x="586" y="237">X</text>
            <line x1="430" y1="232" x2="430" y2="102" markerEnd="url(#geometry-arrowhead)" /><text x="422" y="91">Y</text>
            <line x1="430" y1="232" x2="486" y2="188" markerEnd="url(#geometry-arrowhead)" /><text x="496" y="184">Z</text>
          </g>

          <g className="geometry-world-frame">
            <path className="geometry-world-grid" d="M615 236 L770 236 M625 216 L780 216 M635 196 L790 196 M645 176 L800 176 M655 156 L810 156 M625 236 L655 156 M655 236 L685 156 M685 236 L715 156 M715 236 L745 156 M745 236 L775 156" />
            <line x1="625" y1="236" x2="815" y2="236" markerEnd="url(#geometry-arrowhead)" /><text x="824" y="241">X</text>
            <line x1="625" y1="236" x2="625" y2="104" markerEnd="url(#geometry-arrowhead)" /><text x="617" y="92">Y</text>
            <line x1="625" y1="236" x2="681" y2="191" markerEnd="url(#geometry-arrowhead)" /><text x="690" y="187">Z</text>
            <line className="geometry-origin-vector" x1="625" y1="236" x2="704" y2="88" markerEnd="url(#geometry-arrowhead)" />
            <text className="geometry-origin-label" x="716" y="208" textAnchor="start">add origin o</text>
          </g>

          <circle className="geometry-final-glow" cx="890" cy="92" r="82" />

          <g className="geometry-conveyor-object">
            <polygon className="geometry-voxel-face is-top" points="-72,-54 -26,-82 118,-82 72,-54" />
            <polygon className="geometry-voxel-face is-side" points="72,-54 118,-82 118,26 72,54" />
            <polygon className="geometry-voxel-face is-front" points="-72,-54 72,-54 72,54 -72,54" />
            <g className="geometry-voxel-lines">
              <line x1="-36" y1="-54" x2="-36" y2="54" /><line x1="0" y1="-54" x2="0" y2="54" /><line x1="36" y1="-54" x2="36" y2="54" />
              <line x1="-72" y1="-18" x2="72" y2="-18" /><line x1="-72" y1="18" x2="72" y2="18" />
              <line x1="-36" y1="-54" x2="10" y2="-82" /><line x1="0" y1="-54" x2="46" y2="-82" /><line x1="36" y1="-54" x2="82" y2="-82" />
              <line x1="-49" y1="-68" x2="95" y2="-68" />
              <line x1="72" y1="-18" x2="118" y2="-46" /><line x1="72" y1="18" x2="118" y2="-10" />
              <line x1="95" y1="-68" x2="95" y2="40" />
            </g>
            <rect className="geometry-selected-voxel" x="0" y="-18" width="36" height="36" />
          </g>
        </svg>
        <div className="geometry-conveyor-status" aria-live="polite">
          <small>Stage {stage + 1} of {geometryAnimationStages.length}</small>
          <strong>{current.action}</strong>
          <p>{current.detail}</p>
          <code>{current.formula}</code>
        </div>
      </div>
      <div className="geometry-conveyor-steps" role="tablist" aria-label="Geometry animation stages">
        {geometryAnimationStages.map((item, index) => (
          <button key={item.title} type="button" role="tab" aria-selected={index === stage} className={`${index === stage ? 'is-current' : ''}${index < stage ? ' is-complete' : ''}`} onClick={() => selectStage(index)}>
            <span>{index + 1}</span><strong>{item.title}</strong><code>{item.formula}</code>
          </button>
        ))}
      </div>
    </section>
  )
}

function TransformAsset() {
  return (
    <section className="image-data-asset image-data-transform-asset glass-panel" aria-labelledby="transform-asset-title">
      <AssetHeader id="transform-asset-title" eyebrow="Worked example" title="Follow one index to its physical point" description="Apply spacing, direction, and origin in order to calculate where one voxel lies in physical space." />
      <div className="image-data-coordinate-equation" aria-label="Index to physical coordinate equation">
        <code><var>p</var> = <var>o</var> + <var>D</var>(<var>s</var> ⊙ <var>i</var>)</code>
        <p>Scale the index by spacing, orient that displacement with the direction matrix, then add the image origin. The ⊙ symbol means elementwise multiplication.</p>
        <dl>
          <div><dt><var>i</var></dt><dd>index vector [i, j, k]</dd></div>
          <div><dt><var>s</var></dt><dd>spacing vector</dd></div>
          <div><dt><var>D</var></dt><dd>direction matrix</dd></div>
          <div><dt><var>o</var></dt><dd>image origin</dd></div>
          <div><dt><var>p</var></dt><dd>physical point [x, y, z]</dd></div>
        </dl>
      </div>
      <GeometryTransformAnimation />
      <div className="image-data-transform-notes">
        <section><strong>Why the order matters</strong><p>Origin is added last because it identifies where index <code>(0, 0, 0)</code> lies. It translates the already scaled and oriented displacement into the chosen physical coordinate frame.</p></section>
        <section><strong>What stays unchanged</strong><p>The voxel’s stored intensity is not used in this calculation. Coordinate geometry determines where the voxel is located, not what value it contains.</p></section>
      </div>
    </section>
  )
}

function PlanesAsset() {
  return (
    <section className="image-data-asset image-data-spatial-asset glass-panel" aria-labelledby="planes-asset-title">
      <AssetHeader id="planes-asset-title" eyebrow="Core concept" title="Planes describe anatomy; coordinates describe position" description="Axial, coronal, and sagittal divide the patient. LPS and RAS assign positive directions to physical X, Y, and Z." />
      <div className="image-data-chapter-teaching">
        <section>
          <small>01 · Anatomical planes</small>
          <h5>Name slices by the patient</h5>
          <p>Axial separates superior (toward the head) from inferior (toward the feet). Coronal separates anterior (front) from posterior (back). Sagittal separates left from right. These names describe orientation relative to the patient—not how an array is laid out in memory.</p>
        </section>
        <section>
          <small>02 · Coordinate convention</small>
          <h5>Choose positive anatomical directions</h5>
          <p>LPS and RAS are two valid ways to assign signs to patient coordinates. LPS makes left, posterior, and superior positive; RAS makes right, anterior, and superior positive. Changing convention changes the coordinate signs, not the physical anatomy.</p>
        </section>
        <section>
          <small>03 · Image indices</small>
          <h5>Do not rename IJK as anatomy</h5>
          <p>The voxel at <code>(i, j, k)</code> is an address in the image array. The <code>i</code>, <code>j</code>, and <code>k</code> axes are not inherently left–right, anterior–posterior, or inferior–superior. Header geometry provides that mapping.</p>
        </section>
      </div>
      <div className="image-data-planes-layout">
        <figure className="image-data-plane-model">
          <header><small>Anatomical space</small><strong>Three planes, one patient</strong></header>
          <AnatomicalPlanesScene />
          <figcaption>Plane names remain attached to the patient even if the image is displayed, rotated, or stored differently.</figcaption>
        </figure>
        <div className="image-data-coordinate-panel">
          <section className="coordinate-convention-table" aria-labelledby="coordinate-convention-title">
            <header><div><small>Patient coordinates</small><strong id="coordinate-convention-title">LPS and RAS</strong></div><span>Same anatomy</span></header>
            <p>The convention tells software which anatomical direction is positive on each physical axis.</p>
            <div className="coordinate-table-wrap">
              <table aria-label="Comparison of positive axes in LPS and RAS coordinate conventions">
                <thead><tr><th>Positive axis</th><th>LPS</th><th>RAS</th></tr></thead>
                <tbody>
                  <tr><th><code>+X</code></th><td>Left</td><td>Right</td></tr>
                  <tr><th><code>+Y</code></th><td>Posterior</td><td>Anterior</td></tr>
                  <tr><th><code>+Z</code></th><td>Superior</td><td>Superior</td></tr>
                </tbody>
              </table>
            </div>
            <div className="coordinate-software-examples"><span><strong>LPS</strong>DICOM · ITK</span><span><strong>RAS</strong>3D Slicer internal</span></div>
          </section>
          <section className="coordinate-sign-example" aria-labelledby="coordinate-sign-title">
            <header><small>Sign conversion</small><strong id="coordinate-sign-title">The point does not move</strong></header>
            <div><code>LPS (−42, 18, 76) mm</code><b>→</b><code>RAS (42, −18, 76) mm</code></div>
            <p>Converting LPS to RAS negates X and Y. Z is unchanged because both conventions use superior as the positive direction.</p>
          </section>
          <section className="coordinate-spaces" aria-labelledby="coordinate-spaces-title">
            <header><small>Three spaces</small><strong id="coordinate-spaces-title">Keep address, anatomy, and scene distinct</strong></header>
            <div className="coordinate-spaces-flow">
              <span><small>Image</small><strong>IJK</strong><em>array address</em></span>
              <b><small>header geometry</small><span aria-hidden="true">→</span></b>
              <span><small>Anatomical</small><strong>LPS / RAS</strong><em>patient position</em></span>
              <b><small>placement</small><span aria-hidden="true">→</span></b>
              <span><small>World</small><strong>XYZ</strong><em>shared scene</em></span>
            </div>
            <p>Geometry maps image indices into patient space. An application can then place that image with models, annotations, or other scans in one world coordinate system.</p>
          </section>
        </div>
      </div>
    </section>
  )
}

function ChapterAsset({ chapter }: { chapter: ImageDataChapter }) {
  if (chapter.id === 'formats') return <FormatsAsset />
  if (chapter.id === 'contents') return <ContentsAsset />
  if (chapter.id === 'spacing') return <SpacingAsset />
  if (chapter.id === 'origin') return <OriginAsset />
  if (chapter.id === 'direction') return <DirectionAsset />
  if (chapter.id === 'transform') return <TransformAsset />
  return <PlanesAsset />
}

function LearningPoints({ chapter }: { chapter: ImageDataChapter }) {
  return (
    <section className="image-data-key-points" aria-label={`${chapter.title} learning points`}>
      <p>Keep from this chapter</p>
      <ol>{chapter.learningPoints.map((point) => <li key={point}>{point}</li>)}</ol>
    </section>
  )
}

function ImageDataModule() {
  const [activeChapter, setActiveChapter] = useState(0)
  const chapter = chapters[activeChapter] ?? chapters[0]

  return (
    <article className="image-data-module">
      <header className="image-data-intro">
        <div>
          <p className="section-kicker"><Database aria-hidden="true" /> Medical image data</p>
          <h2>An image is more than an array.</h2>
          <p>Follow an image from file container to voxel grid, physical geometry, anatomical planes, and coordinate conventions.</p>
        </div>
        <div className="image-data-progress-copy"><strong>{activeChapter + 1} / {chapters.length}</strong></div>
        <div className="image-data-progress" role="progressbar" aria-label="Image data chapter progress" aria-valuemin={1} aria-valuemax={chapters.length} aria-valuenow={activeChapter + 1}>
          {chapters.map((item, index) => <span key={item.id} className={index <= activeChapter ? 'is-active' : undefined} />)}
        </div>
      </header>

      <div className="image-data-workspace">
        <label className="image-data-chapter-picker" htmlFor="image-data-chapter-select">
          <span><small>Chapter</small><strong>{activeChapter + 1} of {chapters.length}</strong></span>
          <select id="image-data-chapter-select" aria-label="Select image data chapter" value={activeChapter} onChange={(event) => setActiveChapter(Number(event.target.value))}>
            {chapters.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.navigationLabel}</option>)}
          </select>
        </label>
        <nav className="image-data-chapters" aria-label="Image data chapters">
          <p>Chapters</p>
          {chapters.map((item, index) => {
            const Icon = item.icon
            const selected = index === activeChapter
            return (
              <button key={item.id} type="button" className={selected ? 'is-selected' : undefined} aria-current={selected ? 'step' : undefined} onClick={() => setActiveChapter(index)}>
                <span className="image-data-chapter-number">{index + 1}</span><Icon aria-hidden="true" /><span>{item.navigationLabel}</span>
              </button>
            )
          })}
        </nav>

        <section className="image-data-lesson" aria-labelledby="image-data-lesson-title">
          <div className="image-data-lesson-copy"><div><h3 id="image-data-lesson-title">{chapter.title}</h3><p>{chapter.summary}</p></div></div>
          <ChapterAsset chapter={chapter} />
          <LearningPoints chapter={chapter} />
        </section>
      </div>

      <footer className="image-data-sources">
        <span><Scan aria-hidden="true" /> Reference material</span>
        <a href="https://simpleitk.readthedocs.io/en/master/fundamentalConcepts.html" target="_blank" rel="noreferrer">SimpleITK concepts <ExternalLink /></a>
        <a href="https://slicer.readthedocs.io/en/latest/user_guide/coordinate_systems.html" target="_blank" rel="noreferrer">3D Slicer coordinates <ExternalLink /></a>
        <a href="https://nifti.nimh.nih.gov/nifti-1/" target="_blank" rel="noreferrer">NIfTI-1 specification <ExternalLink /></a>
        <a href="https://teem.sourceforge.net/nrrd/format.html" target="_blank" rel="noreferrer">NRRD specification <ExternalLink /></a>
        <a href="https://docs.itk.org/en/latest/learn/metaio.html" target="_blank" rel="noreferrer">MetaIO documentation <ExternalLink /></a>
        <a href="https://www.dicomstandard.org/current" target="_blank" rel="noreferrer">DICOM standard <ExternalLink /></a>
      </footer>
    </article>
  )
}

export default ImageDataModule
