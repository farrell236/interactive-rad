import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import App from './App'

vi.mock('@react-three/fiber', () => ({
  Canvas: () => <div data-testid="canvas" />,
  useFrame: () => undefined,
  useThree: () => ({ camera: { position: { lerp: vi.fn(), distanceTo: () => 0 }, lookAt: vi.fn() }, invalidate: vi.fn() }),
}))

vi.mock('@react-three/drei', () => ({
  ContactShadows: () => null,
  Environment: () => null,
  Lightformer: () => null,
  MeshReflectorMaterial: () => null,
  OrbitControls: () => null,
  RoundedBox: () => null,
  Line: () => null,
}))

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
    expect(await screen.findByRole('heading', { name: 'Chest X-ray acquisition' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take X-ray' })).toBeInTheDocument()
  })

  it('switches to a future modality without reloading', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: 'CT' }))
    expect(screen.getByRole('heading', { name: 'CT acquisition and reconstruction' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'CT' })).toHaveAttribute('aria-selected', 'true')
  })

  it('offers image data and windowing modules in place of the old tabs', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByRole('tab', { name: 'DRR' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Interventional/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Image Data/ }))
    expect(screen.getByRole('heading', { name: 'Medical image data and spatial metadata' })).toBeInTheDocument()
    expect(screen.getByText('Compare array, DICOM, and NIfTI representations')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Windowing/ }))
    expect(await screen.findByRole('heading', { name: 'From stored pixels to visible contrast.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The stored integer is only the first value.' })).toBeInTheDocument()
    expect(screen.getByText(/storage-domain values/)).toBeInTheDocument()
    expect(screen.getByText('VOI (Value of Interest)')).toBeInTheDocument()
    expect(screen.getByText(/DICOM display transform applied/)).toBeInTheDocument()
    expect(screen.getByText(/Rescale Slope 1 and Rescale Intercept/)).toBeInTheDocument()
    expect(screen.queryByText(/Tissue values are representative ranges/)).not.toBeInTheDocument()
    expect(screen.queryByText(/CT is the calibrated case/)).not.toBeInTheDocument()
    expect(screen.queryByText(/without changing the underlying scan/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Windowing learning sections' })).getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /Free play/ })).not.toBeInTheDocument()

    const huScale = screen.getByLabelText('Representative Hounsfield unit scale')
    expect(within(huScale).getAllByRole('button')).toHaveLength(7)
    await user.click(within(huScale).getByRole('button', { name: /Cortical bone/ }))
    expect(within(screen.getByRole('status')).getByText('Cortical bone')).toBeInTheDocument()

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
    expect(screen.getByText('CLIPPED BLACK')).toBeInTheDocument()
    expect(screen.getByText('CLIPPED WHITE')).toBeInTheDocument()
    const width = screen.getByRole('slider', { name: 'Window width' })
    const center = screen.getByRole('slider', { name: 'Window center' })
    fireEvent.change(width, { target: { value: '1500' } })
    fireEvent.change(center, { target: { value: '-600' } })
    expect(screen.getByText(/LINEAR · W 1500 · C -600/)).toBeInTheDocument()
    expect(screen.getByText('-1350 HU → 0')).toBeInTheDocument()
    expect(screen.getByTestId('window-curve-path').getAttribute('d')).not.toBe(initialCurve)

    await user.click(screen.getByRole('button', { name: 'Custom curve' }))
    expect(screen.getByRole('slider', { name: 'Selected curve point output' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Selected curve point output' }), { target: { value: '200' } })
    expect(screen.getByText('-600 HU → 200')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Common windows/ }))
    await user.click(screen.getByRole('button', { name: 'Bone window, width 2000, center 400' }))
    expect(screen.getByText(/LINEAR · W 2000 · C 400/)).toBeInTheDocument()
    expect(screen.getByText('W 2000 · C 400')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Current HU to display mapping' })).toBeInTheDocument()
    expect(screen.queryByText(/representative teaching values/)).not.toBeInTheDocument()
  })

  it('pins the image probe until it is explicitly released', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: /Windowing/ }))
    const image = await screen.findByRole('img', { name: /Stylized axial chest CT/ })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 520, bottom: 420, width: 520, height: 420, toJSON: () => ({}),
    })
    const readout = screen.getByRole('status')

    fireEvent.pointerMove(image, { clientX: 164, clientY: 205 })
    expect(within(readout).getByText('Aerated lung')).toBeInTheDocument()

    fireEvent.pointerDown(image, { clientX: 285, clientY: 255 })
    expect(within(readout).getByText('Heart / soft tissue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unpin selected voxel' })).toBeInTheDocument()
    expect(screen.getByText('Pinned · Click elsewhere to move · Esc to release')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Unpin selected voxel' }))
    expect(screen.queryByRole('button', { name: 'Unpin selected voxel' })).not.toBeInTheDocument()

    fireEvent.pointerDown(image, { clientX: 285, clientY: 255 })
    fireEvent.pointerMove(image, { clientX: 62, clientY: 55 })
    expect(within(readout).getByText('Heart / soft tissue')).toBeInTheDocument()

    fireEvent.pointerDown(image, { clientX: 62, clientY: 55 })
    expect(within(readout).getByText('Air')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Unpin selected voxel' })).not.toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()

    fireEvent.pointerMove(image, { clientX: 164, clientY: 205 })
    expect(within(readout).getByText('Aerated lung')).toBeInTheDocument()
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
