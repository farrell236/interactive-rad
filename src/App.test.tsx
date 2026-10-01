import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import App from './App'

const mockCtPixels = new Int16Array(512 * 512).fill(-2048)
mockCtPixels[(150 * 512) + 63] = -100
mockCtPixels[(173 * 512) + 219] = -1000
mockCtPixels[(144 * 512) + 192] = -750
mockCtPixels[(200 * 512) + 280] = 187
mockCtPixels[(395 * 512) + 182] = 905

vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => mockCtPixels.buffer.slice(0),
})))

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
  createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
  putImageData: vi.fn(),
} as unknown as CanvasRenderingContext2D)

vi.mock('@react-three/fiber', () => ({
  Canvas: () => <div data-testid="canvas" />,
  useFrame: () => undefined,
  useThree: () => ({ camera: { position: { lerp: vi.fn(), distanceTo: () => 0 }, lookAt: vi.fn() }, invalidate: vi.fn() }),
}))

vi.mock('@react-three/drei', () => {
  const useGLTF = Object.assign(vi.fn(), { preload: vi.fn() })
  return {
    ContactShadows: () => null,
    Environment: () => null,
    Lightformer: () => null,
    MeshReflectorMaterial: () => null,
    OrbitControls: () => null,
    RoundedBox: () => null,
    Line: () => null,
    useGLTF,
  }
})

vi.mock('@react-three/postprocessing', () => ({
  Bloom: () => null,
  DepthOfField: () => null,
  EffectComposer: () => null,
  N8AO: () => null,
  SMAA: () => null,
}))

vi.mock('@react-three/gpu-pathtracer', () => ({
  Pathtracer: () => null,
  usePathtracer: () => ({ pathtracer: { dispose: vi.fn(), reset: vi.fn(), updateCamera: vi.fn(), updateMaterials: vi.fn() }, update: vi.fn() }),
}))

describe('Radiology Imaging Lab', () => {
  it('renders the X-ray module and all modality tabs', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Radiology Imaging Lab' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(await screen.findByRole('heading', { name: 'Chest X-ray acquisition' }, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take X-ray' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Beam' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('repeatedly increases and decreases interface text within limits', async () => {
    const user = userEvent.setup()
    render(<App />)

    const decreaseText = screen.getByRole('button', { name: 'Decrease text size' })
    const increaseText = screen.getByRole('button', { name: 'Increase text size' })
    expect(document.documentElement.style.fontSize).toBe('16px')

    await user.click(increaseText)
    await user.click(increaseText)
    expect(document.documentElement.style.fontSize).toBe('20px')

    await user.click(increaseText)
    expect(document.documentElement.style.fontSize).toBe('22px')
    expect(increaseText).toBeDisabled()

    await user.click(decreaseText)
    expect(document.documentElement.style.fontSize).toBe('20px')
  })

  it('switches to the interactive CT curriculum without reloading', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: 'CT' }))
    expect(await screen.findByRole('heading', { name: 'From projections to a volume.' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'CT' })).toHaveAttribute('aria-selected', 'true')
    const chapters = screen.getByRole('navigation', { name: 'CT learning chapters' })
    expect(within(chapters).getAllByRole('button')).toHaveLength(6)
    expect(screen.getByRole('heading', { name: 'From one projection to many views' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Chapter explanation' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'A projection collapses depth; tomography reconstructs it.' })).toBeInTheDocument()
    expect(screen.getByText(/Inside the gantry, an X-ray tube faces a detector array/)).toBeInTheDocument()
    expect(document.querySelector('.ct-core-concept')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'CT room camera view' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Watch a chest scan become a volume' })).toBeInTheDocument()
    expect(screen.getByText('Slice acquisition')).toBeInTheDocument()
    expect(screen.getByText('Current reconstruction')).toBeInTheDocument()
    expect(screen.getByText('Accumulated volume')).toBeInTheDocument()
    expect(screen.getByText('Slice reconstruction')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'From sinogram space to image space' })).toBeInTheDocument()
    const volumeProgress = screen.getByRole('slider', { name: 'CT acquisition progress' })
    const rotationTime = screen.getByRole('slider', { name: 'CT rotation time' })
    const acquisitionPitch = screen.getByRole('slider', { name: 'Helical pitch in acquisition animation' })
    const sliceThickness = screen.getByRole('slider', { name: 'Reconstructed slice thickness' })
    expect(Number((volumeProgress as HTMLInputElement).value)).toBeGreaterThanOrEqual(0)
    expect(Number((volumeProgress as HTMLInputElement).value)).toBeLessThanOrEqual(1000)
    expect(rotationTime).toHaveValue('0.7')
    expect(acquisitionPitch).toHaveValue('1')
    expect(sliceThickness).toHaveValue('2.5')
    expect(screen.getByRole('img', { name: /Current LIDC-IDRI axial chest CT slice/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Growing CT volume/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pause CT acquisition' }))
    expect(screen.getByRole('button', { name: 'Play CT acquisition' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.change(volumeProgress, { target: { value: '180' } })
    const stackPlanesAtEighteenPercent = document.querySelectorAll('.ct-volume-stack canvas').length
    fireEvent.change(volumeProgress, { target: { value: '500' } })
    expect(volumeProgress).toHaveValue('500')
    expect(document.querySelectorAll('.ct-volume-stack canvas').length).toBeGreaterThan(stackPlanesAtEighteenPercent)
    fireEvent.change(volumeProgress, { target: { value: '1000' } })
    const defaultThicknessPlanes = Array.from(document.querySelectorAll<HTMLCanvasElement>('.ct-volume-stack canvas'))
    expect(document.querySelector('.ct-current-slice-card header strong')).toHaveTextContent(`Slice ${defaultThicknessPlanes.length} of ${defaultThicknessPlanes.length}`)
    const defaultThicknessExtent = defaultThicknessPlanes.at(-1)?.style.getPropertyValue('--stack-offset')
    fireEvent.change(sliceThickness, { target: { value: '5' } })
    expect(sliceThickness).toHaveValue('5')
    const thickSlicePlanes = Array.from(document.querySelectorAll<HTMLCanvasElement>('.ct-volume-stack canvas'))
    expect(document.querySelector('.ct-current-slice-card header strong')).toHaveTextContent(`Slice ${thickSlicePlanes.length} of ${thickSlicePlanes.length}`)
    expect(screen.getByRole('img', { name: `Current LIDC-IDRI axial chest CT slice ${thickSlicePlanes.length} of ${thickSlicePlanes.length}` })).toBeInTheDocument()
    expect(thickSlicePlanes.length).toBeLessThan(defaultThicknessPlanes.length)
    expect(thickSlicePlanes.at(-1)?.style.getPropertyValue('--stack-offset')).toBe(defaultThicknessExtent)
    fireEvent.change(volumeProgress, { target: { value: '500' } })
    const partialThickSlicePlanes = Array.from(document.querySelectorAll<HTMLCanvasElement>('.ct-volume-stack canvas'))
    const fixedThickSliceExtent = partialThickSlicePlanes.at(-1)?.style.getPropertyValue('--stack-offset')
    fireEvent.change(volumeProgress, { target: { value: '520' } })
    const planesBeforeNextReconstruction = Array.from(document.querySelectorAll<HTMLCanvasElement>('.ct-volume-stack canvas'))
    expect(planesBeforeNextReconstruction).toHaveLength(partialThickSlicePlanes.length)
    expect(planesBeforeNextReconstruction.at(-1)?.style.getPropertyValue('--stack-offset')).toBe(fixedThickSliceExtent)
    expect(screen.getByRole('heading', { name: 'From sinogram space to image space' })).toBeInTheDocument()
    expect(screen.queryByText('Planned asset')).not.toBeInTheDocument()
    const viewsUsed = screen.getByRole('slider', { name: 'Views in a full sweep' })
    const acquisitionProgress = screen.getByRole('slider', { name: 'Acquisition progress' })
    expect(viewsUsed).toHaveValue('60')
    expect(Number((acquisitionProgress as HTMLInputElement).value)).toBeGreaterThanOrEqual(0)
    expect(Number((acquisitionProgress as HTMLInputElement).value)).toBeLessThan(60)
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('img', { name: /Progressive reconstruction using \d+ of 60 views/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Sinogram wipe showing \d+ of 60 views/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sparse' }))
    expect(viewsUsed).toHaveValue('12')
    expect(acquisitionProgress).toHaveValue('0')
    expect(screen.getByRole('img', { name: 'Progressive reconstruction using 1 of 12 views' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Sinogram wipe showing 1 of 12 views' })).toBeInTheDocument()
    fireEvent.change(acquisitionProgress, { target: { value: '6' } })
    expect(screen.getByRole('img', { name: 'Schematic CT source and detector at 90 degrees' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Sinogram wipe showing 7 of 12 views' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Two interiors can cast the same projection.' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'What changes with more views' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(within(chapters).getByRole('button', { name: /Reconstruction/ }))
    expect(screen.getByRole('heading', { name: 'Reconstructing a slice' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Backprojection reverses the ray geometry' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Progressive reconstruction' })).toBeInTheDocument()
    const reconstructionViewCount = screen.getByRole('slider', { name: 'Reconstruction view count' })
    const reconstructionStageControls = document.querySelector('.ct-recon-stages') as HTMLElement
    expect(within(reconstructionStageControls).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['1. Measure', '2. Filter', '3. Backproject', '4. Accumulate', '5. Final slice'])
    expect(reconstructionViewCount).toHaveValue('36')
    expect(screen.getByText('Changes the multi-view accumulation and final reconstruction')).toBeInTheDocument()
    await user.click(within(reconstructionStageControls).getByRole('button', { name: '2. Filter' }))
    expect(screen.getByRole('img', { name: 'Ramp-filtered detector profile' })).toBeInTheDocument()
    await user.click(within(reconstructionStageControls).getByRole('button', { name: '3. Backproject' }))
    expect(screen.getByRole('img', { name: 'Backprojection of one filtered projection' })).toBeInTheDocument()
    fireEvent.change(reconstructionViewCount, { target: { value: '12' } })
    await user.click(within(reconstructionStageControls).getByRole('button', { name: '4. Accumulate' }))
    expect(screen.getByRole('img', { name: 'Accumulation of 6 of 12 filtered views' })).toBeInTheDocument()
    await user.click(within(reconstructionStageControls).getByRole('button', { name: '5. Final slice' }))
    expect(screen.getByRole('img', { name: 'Final filtered-backprojection slice using 12 views' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Compare reconstruction approaches' })).toBeInTheDocument()

    await user.click(within(chapters).getByRole('button', { name: /Scanner geometry/ }))
    expect(screen.getByRole('heading', { name: 'Gantry and table motion' })).toBeInTheDocument()
    const pitch = screen.getByRole('slider', { name: 'Helical pitch' })
    expect(pitch).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Axial' }))
    expect(pitch).toBeDisabled()

    await user.click(within(chapters).getByRole('button', { name: /Measuring a ray/ }))
    expect(screen.getByRole('heading', { name: 'Photon path to line integral' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Attenuation coefficient' }), { target: { value: '0.38' } })
    expect(screen.getByText('p = 4.56')).toBeInTheDocument()

    await user.click(within(chapters).getByRole('button', { name: /Resolution & noise/ }))
    expect(screen.getByRole('heading', { name: 'Protocol trade-off dashboard' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /Poisson-noisy reconstruction of a real LIDC-IDRI chest slice/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Poisson-noisy reconstruction/ }).tagName).toBe('CANVAS')
    expect(screen.getByRole('group', { name: 'Noise simulation pipeline' })).toHaveTextContent('HU → μ→sinogram→Poisson counts→−ln(I / I₀)→FBP')
    const protocolMas = screen.getByRole('slider', { name: 'CT tube current-time' })
    expect(protocolMas).toHaveAttribute('min', '10')
    expect(protocolMas).toHaveAttribute('max', '400')
    fireEvent.change(protocolMas, { target: { value: '20' } })
    expect(screen.getByText('10,923')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sharp' }))
    expect(screen.getByText('sharp kernel')).toBeInTheDocument()

    await user.click(within(chapters).getByRole('button', { name: /Artifacts & output/ }))
    expect(screen.getByRole('heading', { name: 'Cause → projection data → reconstructed image' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Scanner to model input' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'What may vary between CT series' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rings' }))
    expect(screen.getByText(/detector-fixed error/)).toBeInTheDocument()
    expect(screen.queryByText('Planned asset')).not.toBeInTheDocument()
  })

  it('offers the image data learning backbone and the interactive windowing module', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByRole('tab', { name: 'DRR' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Interventional/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Image Data/ }))
    expect(await screen.findByRole('heading', { name: 'An image is more than an array.' })).toBeInTheDocument()
    const imageDataNavigation = screen.getByRole('navigation', { name: 'Image data chapters' })
    expect(within(imageDataNavigation).getAllByRole('button')).toHaveLength(7)
    expect(screen.getByRole('heading', { name: 'Data formats' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Values and context' })).toBeInTheDocument()
    expect(screen.getByText(/often produced by the scanner’s reconstruction and processing pipeline/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How formats package the same image' })).toBeInTheDocument()
    const formatTable = screen.getByRole('table', { name: 'Medical image format comparison' })
    expect(within(formatTable).getByText('Header / metadata')).toBeInTheDocument()
    expect(within(formatTable).getByText('Voxel payload')).toBeInTheDocument()
    expect(within(formatTable).getByText('DICOM')).toBeInTheDocument()
    expect(within(formatTable).getByText('NRRD')).toBeInTheDocument()
    expect(within(formatTable).getByText('MetaImage')).toBeInTheDocument()

    const chapterSelect = screen.getByRole('combobox', { name: 'Select image data chapter' })
    expect(chapterSelect).toHaveValue('0')
    await user.selectOptions(chapterSelect, '1')
    expect(screen.getByRole('heading', { name: 'Header and voxel data' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'From stored samples to a positioned image' })).toBeInTheDocument()
    expect(screen.getByText('Numeric type')).toBeInTheDocument()
    expect(screen.getByText('Voxel data')).toBeInTheDocument()
    expect(screen.getByText('Physical space')).toBeInTheDocument()
    expect(screen.getByText('Coordinates in a chosen frame')).toBeInTheDocument()
    expect(screen.getByText('Array address')).toBeInTheDocument()

    await user.click(within(imageDataNavigation).getByRole('button', { name: /Size & spacing/ }))
    expect(screen.getByRole('heading', { name: 'Size and spacing' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Size counts samples; spacing measures steps' })).toBeInTheDocument()
    expect(screen.getByText(/centre-to-centre span from the first voxel to the last/)).toBeInTheDocument()
    expect(screen.getByText('Missing spacing is unknown—not isotropic.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /same medical image displayed incorrectly/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /SimpleITK documentation/ })).toHaveAttribute('href', expect.stringContaining('#lbl-isotropy'))
    expect(screen.getByText(/physical scale that was never established/)).toBeInTheDocument()
    expect(screen.getByText('Changing spacing is not resampling')).toBeInTheDocument()
    const iSpacing = screen.getByRole('slider', { name: 'i-axis spacing' })
    const jSpacing = screen.getByRole('slider', { name: 'j-axis spacing' })
    fireEvent.change(iSpacing, { target: { value: '1.5' } })
    fireEvent.change(jSpacing, { target: { value: '0.6' } })
    expect(screen.getByText('(1.5, 0.6) mm')).toBeInTheDocument()
    expect(screen.getByText('(7.5, 1.8) mm')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Lock equal spacing/ }))
    expect(jSpacing).toHaveValue('1.5')
    fireEvent.change(iSpacing, { target: { value: '1.4' } })
    expect(jSpacing).toHaveValue('1.4')
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(iSpacing).toHaveValue('1')
    expect(jSpacing).toHaveValue('1')

    await user.click(within(imageDataNavigation).getByRole('button', { name: /Origin/ }))
    expect(screen.getByRole('heading', { name: 'Origin translates an unchanged grid' })).toBeInTheDocument()
    expect(screen.getByText(/physical coordinate assigned to the centre of voxel index/)).toBeInTheDocument()
    expect(screen.getByText('o′ − o = [20, 16, 0] mm')).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Z origin' })).not.toBeInTheDocument()
    expect(screen.getByText('o′ = [−100, 50, 0] mm')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Select voxel i 4, j 2' }))
    expect(screen.getByText('i = [4, 2, 0]')).toBeInTheDocument()
    expect(screen.getByText('voxel position p′ = [−96.8, 51.6, 0] mm')).toBeInTheDocument()
    const currentGrid = screen.getByRole('group', { name: /Current image grid/ })
    currentGrid.focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('o′ − o = [19, 16, 0] mm')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Align origins' }))
    expect(screen.getByText('o′ − o = [0, 0, 0] mm')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Align origins' })).toBeDisabled()
    expect(currentGrid.getAttribute('style')).toContain('--origin-left: 12%')
    expect(currentGrid.getAttribute('style')).toContain('--origin-bottom: 42px')
    await user.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(screen.getByText('o′ − o = [20, 16, 0] mm')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset demo' })).toBeDisabled()
    expect(currentGrid.getAttribute('style')).toContain('--origin-left: 42%')
    expect(currentGrid.getAttribute('style')).toContain('--origin-bottom: 102.8px')
    expect(screen.queryByRole('button', { name: 'Example shift' })).not.toBeInTheDocument()

    await user.click(within(imageDataNavigation).getByRole('button', { name: /Direction/ }))
    expect(screen.getByRole('heading', { name: 'Direction tells each image axis where to point' })).toBeInTheDocument()
    expect(screen.getByText(/first column describes the/)).toBeInTheDocument()
    const pauseDirectionAnimation = screen.getByRole('button', { name: 'Pause direction animation' })
    expect(pauseDirectionAnimation).toHaveAttribute('aria-pressed', 'true')
    await user.click(pauseDirectionAnimation)
    expect(screen.getByRole('button', { name: 'Resume direction animation' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: '30°' }))
    const directionMatrix = screen.getByRole('table', { name: 'Live direction matrix' })
    expect(within(directionMatrix).getByRole('columnheader', { name: '+i' })).toBeInTheDocument()
    expect(within(directionMatrix).getByRole('rowheader', { name: '+X' })).toBeInTheDocument()
    expect(within(directionMatrix).getAllByText('0.866')).toHaveLength(2)
    expect(screen.getByText('[0.866, 0.500, 0]')).toBeInTheDocument()
    const directionAngle = screen.getByRole('slider', { name: 'Direction angle' })
    expect(directionAngle).toHaveValue('30')
    await user.click(screen.getByRole('button', { name: '0°' }))
    expect(directionAngle).toHaveValue('0')
    expect(screen.getByText('[1, 0, 0]')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reverse i' }))
    expect(screen.getByRole('button', { name: 'Reverse i' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('[−1, 0, 0]')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Resume direction animation' }))
    expect(screen.getByRole('button', { name: 'Pause direction animation' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(directionAngle, { target: { value: '-45' } })
    expect(screen.getByRole('button', { name: 'Resume direction animation' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('−45° about +Z · i reversed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reverse i' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('[−0.707, 0.707, 0]')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reverse i' }))
    expect(screen.getByRole('button', { name: 'Reverse i' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('[0.707, −0.707, 0]')).toBeInTheDocument()
    expect(screen.getByText(/Direction supplies an orthonormal orientation; spacing supplies/)).toBeInTheDocument()
    expect(screen.getByText(/frame may be LPS or RAS/)).toBeInTheDocument()

    await user.click(within(imageDataNavigation).getByRole('button', { name: /Geometry together/ }))
    expect(screen.getByRole('heading', { name: 'Putting geometry together' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Follow one index to its physical point' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'One grid, five stages' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Geometry animation stage 1/ })).toBeInTheDocument()
    expect(screen.getByText('p = [−120, 32.4, 57.2] mm')).toBeInTheDocument()
    const geometryStages = screen.getByRole('tablist', { name: 'Geometry animation stages' })
    const directionStage = within(geometryStages).getByRole('tab', { name: /Apply direction/ })
    await user.click(directionStage)
    expect(directionStage).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('img', { name: /Geometry animation stage 3/ })).toBeInTheDocument()
    expect(screen.getByText(/direction matrix sends/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pause animation' }))
    expect(screen.getByRole('button', { name: 'Continue animation' })).toBeInTheDocument()
    expect(screen.getByText(/Voxel intensity is not part of the coordinate transform/)).toBeInTheDocument()

    await user.click(within(imageDataNavigation).getByRole('button', { name: /Planes & coordinates/ }))
    expect(screen.getByRole('heading', { name: 'Planes and coordinate conventions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Planes describe anatomy; coordinates describe position' })).toBeInTheDocument()
    expect(screen.getByText(/Axial separates superior/)).toBeInTheDocument()
    expect(screen.getByText('LPS and RAS')).toBeInTheDocument()
    expect(screen.getByText(/Converting LPS to RAS negates X and Y/)).toBeInTheDocument()
    expect(screen.getByText(/Geometry maps image indices into patient space/)).toBeInTheDocument()
    const conventionControl = screen.getByRole('group', { name: 'Coordinate convention shown on the anatomical model' })
    const lpsButton = within(conventionControl).getByRole('button', { name: 'LPS' })
    const rasButton = within(conventionControl).getByRole('button', { name: 'RAS' })
    expect(lpsButton).toHaveAttribute('aria-pressed', 'true')
    await user.click(rasButton)
    expect(rasButton).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('tab', { name: /Windowing/ }))
    expect(await screen.findByRole('heading', { name: 'From stored pixels to visible contrast.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The stored integer is only the first value.' })).toBeInTheDocument()
    expect(screen.getByText(/storage-domain values/)).toBeInTheDocument()
    expect(screen.getByText('VOI (Value of Interest)')).toBeInTheDocument()
    expect(screen.getByText(/next display stage/)).toBeInTheDocument()
    expect(screen.queryByText(/HU is a measurement, not a tissue identity/)).not.toBeInTheDocument()
    expect(screen.queryByText('Stored encoding')).not.toBeInTheDocument()
    expect(screen.queryByText(/This LIDC-IDRI frame uses/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Padding is not anatomy/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Tissue values are representative ranges/)).not.toBeInTheDocument()
    expect(screen.queryByText(/CT is the calibrated case/)).not.toBeInTheDocument()
    expect(screen.queryByText(/without changing the underlying scan/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Windowing learning sections' })).getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /Free play/ })).not.toBeInTheDocument()

    const huScale = screen.getByLabelText('Representative Hounsfield unit scale')
    expect(within(huScale).getAllByRole('button')).toHaveLength(7)
    await user.click(within(huScale).getByRole('button', { name: /Dense bone/ }))
    await waitFor(() => expect(within(screen.getByRole('status')).getByText('+905 HU')).toBeInTheDocument())
    expect(within(screen.getByRole('status')).getByText('Cortical-bone range')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Model input and reproducibility/ }))
    expect(screen.getByRole('heading', { name: 'Display choices become preprocessing choices.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Multi-window/ }))
    expect(screen.getByText('Lung · Soft · Bone')).toBeInTheDocument()
    expect(screen.getByText(/windowed PNG is a display derivative/)).toBeInTheDocument()
  })

  it('updates the CT display mapping from width, center, and window presets', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: /Windowing/ }))
    await screen.findByRole('heading', { name: 'From stored pixels to visible contrast.' })
    await user.click(screen.getByRole('button', { name: /Clipping and display mapping/ }))

    const initialCurve = screen.getByTestId('window-curve-path').getAttribute('d')
    expect(screen.getByText('CLIPPED ≤ -160 HU')).toBeInTheDocument()
    expect(screen.getByText('CLIPPED > 240 HU')).toBeInTheDocument()
    expect(await screen.findByTestId('ct-histogram')).toHaveAttribute('data-source', 'calibrated-ct-voxels')
    expect(screen.queryByRole('heading', { name: 'Display functions' })).not.toBeInTheDocument()
    expect(screen.getByText('MONOCHROME2')).toBeInTheDocument()
    expect(screen.getByText(/displays lower output values darker/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Auto window from histogram' }))
    expect(screen.queryByText('CLIPPED ≤ -160 HU')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset window' }))
    expect(screen.getByText('CLIPPED ≤ -160 HU')).toBeInTheDocument()
    const width = screen.getByRole('slider', { name: 'Window width' })
    const center = screen.getByRole('slider', { name: 'Window center' })
    fireEvent.change(width, { target: { value: '1500' } })
    fireEvent.change(center, { target: { value: '-600' } })
    expect(screen.getByText(/LINEAR_EXACT · W 1500 · C -600/)).toBeInTheDocument()
    expect(screen.getByText('-1350 HU → 0')).toBeInTheDocument()
    expect(screen.getByTestId('window-curve-path').getAttribute('d')).not.toBe(initialCurve)

    await user.click(screen.getByRole('button', { name: 'Sigmoid' }))
    expect(screen.queryByText(/CLIPPED/)).not.toBeInTheDocument()
    expect(screen.getByText('LOW -1350 HU → 30')).toBeInTheDocument()
    expect(screen.getByText('HIGH 150 HU → 225')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Model input and reproducibility/ }))
    await user.click(screen.getByRole('button', { name: /Single window/ }))
    expect(screen.getByText(/sigmoid compresses values progressively/)).toBeInTheDocument()
    expect(screen.queryByText(/every value below or above the chosen interval has been collapsed/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Clipping and display mapping/ }))

    await user.click(screen.getByRole('button', { name: 'Custom curve' }))
    expect(screen.getByRole('slider', { name: 'Selected curve point output' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Selected curve point output' }), { target: { value: '200' } })
    expect(screen.getByText('-600 HU → 200')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Common windows/ }))
    expect(screen.getByRole('button', { name: 'Vascular window, width 700, center 100' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bone window, width 2000, center 400' }))
    expect(screen.getByText(/LINEAR_EXACT · W 2000 · C 400/)).toBeInTheDocument()
    expect(screen.getByText('W 2000 · C 400')).toBeInTheDocument()
    const mappingTable = screen.getByRole('table', { name: 'Current HU to display mapping' })
    expect(mappingTable).toBeInTheDocument()
    expect(within(mappingTable).getByText('905')).toBeInTheDocument()
    expect(screen.queryByText(/representative teaching values/)).not.toBeInTheDocument()
  })

  it('pins the image probe until it is explicitly released', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: /Windowing/ }))
    const image = await screen.findByRole('img', { name: /De-identified axial chest CT/ })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 512, bottom: 512, width: 512, height: 512, toJSON: () => ({}),
    })
    await waitFor(() => expect(screen.queryByText('Loading calibrated CT data…')).not.toBeInTheDocument())
    const readout = screen.getByRole('status')

    fireEvent.pointerMove(image, { clientX: 63, clientY: 150 })
    expect(within(readout).getByText('Fat-range voxel')).toBeInTheDocument()
    expect(within(readout).getByText('-100 HU')).toBeInTheDocument()

    fireEvent.pointerMove(image, { clientX: 219, clientY: 173 })
    expect(within(readout).getByText('Air-range voxel')).toBeInTheDocument()

    fireEvent.pointerMove(image, { clientX: 192, clientY: 144 })
    expect(within(readout).getByText('Aerated-lung range')).toBeInTheDocument()

    fireEvent.pointerMove(image, { clientX: 182, clientY: 395 })
    expect(within(readout).getByText('Cortical-bone range')).toBeInTheDocument()

    fireEvent.pointerDown(image, { clientX: 280, clientY: 200 })
    expect(within(readout).getByText('High soft-tissue / contrast range')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unpin selected voxel' })).toBeInTheDocument()
    expect(screen.getByText('Pinned · Click elsewhere to move · Esc to release')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Unpin selected voxel' }))
    expect(screen.queryByRole('button', { name: 'Unpin selected voxel' })).not.toBeInTheDocument()

    fireEvent.pointerDown(image, { clientX: 280, clientY: 200 })
    fireEvent.pointerMove(image, { clientX: 219, clientY: 173 })
    expect(within(readout).getByText('High soft-tissue / contrast range')).toBeInTheDocument()

    fireEvent.pointerDown(image, { clientX: 219, clientY: 173 })
    expect(within(readout).getByText('Air-range voxel')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Unpin selected voxel' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Selected voxel follows the pointer')).toHaveTextContent('Live')

    fireEvent.pointerMove(image, { clientX: 192, clientY: 144 })
    expect(within(readout).getByText('Aerated-lung range')).toBeInTheDocument()
  })

  it('keeps cited parameter guidance pinned, updates its value, and closes from the explicit control', async () => {
    const user = userEvent.setup()
    render(<App />)

    const helpButton = await screen.findByRole('button', { name: 'Explain Tube voltage' })
    expect(screen.getByText('Controls photon energy and beam penetration.')).toBeInTheDocument()

    await user.click(helpButton)
    const detail = screen.getByRole('region', { name: 'Tube voltage detailed explanation' })
    expect(within(detail).getByText(/Adult upright chest radiography commonly uses/)).toBeInTheDocument()
    expect(within(detail).getAllByRole('link', { name: /CDC\/NIOSH/ })[0]).toHaveAttribute('href', expect.stringContaining('cdc.gov'))
    expect(helpButton).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(screen.getByRole('region', { name: 'Tube voltage detailed explanation' })).toBeInTheDocument()

    const voltageSlider = screen.getByRole('slider', { name: /Tube voltage/ })
    await user.click(voltageSlider)
    fireEvent.change(voltageSlider, { target: { value: '109' } })
    expect(within(detail).getByText('109 kVp')).toBeInTheDocument()

    await user.click(within(detail).getByRole('button', { name: 'Close parameter explanation' }))
    expect(screen.queryByRole('region', { name: 'Tube voltage detailed explanation' })).not.toBeInTheDocument()
  })

  it('updates the projection teaching panel with the selected view', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('region', { name: 'PA projection at a glance' })).toHaveTextContent('reducing geometric magnification')
    await user.click(screen.getByRole('button', { name: 'Left lateral' }))

    const lateralGuide = screen.getByRole('region', { name: 'Left lateral projection at a glance' })
    expect(lateralGuide).toHaveTextContent('Right → left')
    expect(lateralGuide).toHaveTextContent('raise both arms clear of the chest')
  })
})
