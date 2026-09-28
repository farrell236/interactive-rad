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
