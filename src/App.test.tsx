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
    expect(await screen.findByRole('heading', { name: 'From Hounsfield units to visible contrast.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'CT stores attenuation as Hounsfield units.' })).toBeInTheDocument()
    expect(screen.queryByText(/without changing the underlying scan/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Windowing learning sections' })).getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /Free play/ })).not.toBeInTheDocument()
  })

  it('updates the CT display mapping from width, center, and window presets', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: /Windowing/ }))
    await screen.findByRole('heading', { name: 'From Hounsfield units to visible contrast.' })
    await user.click(screen.getByRole('button', { name: /How windowing works/ }))

    const width = screen.getByRole('slider', { name: 'Window width' })
    const center = screen.getByRole('slider', { name: 'Window center' })
    fireEvent.change(width, { target: { value: '1500' } })
    fireEvent.change(center, { target: { value: '-600' } })
    expect(screen.getByText(/LINEAR · W 1500 · C -600/)).toBeInTheDocument()
    expect(screen.getByText('-1350 HU → 0')).toBeInTheDocument()

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
