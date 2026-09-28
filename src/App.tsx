import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent, SVGProps } from 'react'
import { Aperture, Layers3, Magnet, Moon, Radio, ScanLine, Sun } from 'lucide-react'
import { PlaceholderModule } from './components/PlaceholderModule'
import type { Modality } from './types'

const XrayModule = lazy(() => import('./components/XrayModule'))
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const modalities: Array<{ id: Modality; label: string; shortLabel?: string; icon: IconComponent }> = [
  { id: 'xray', label: 'X-ray', icon: Aperture },
  { id: 'ct', label: 'CT', icon: ScanLine },
  { id: 'mri', label: 'MRI', icon: Magnet },
  { id: 'interventional', label: 'Interventional', shortLabel: 'C-arm', icon: Radio },
  { id: 'fundamentals', label: 'Fundamentals', shortLabel: 'Header', icon: Layers3 },
]

function ModalityTabs({ active, onChange }: { active: Modality; onChange: (id: Modality) => void }) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % modalities.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + modalities.length) % modalities.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = modalities.length - 1
    else return

    event.preventDefault()
    const modality = modalities[next]
    if (!modality) return
    onChange(modality.id)
    tabRefs.current[next]?.focus()
  }

  return (
    <nav className="modality-nav" aria-label="Imaging modality">
      <div className="modality-tabs" role="tablist" aria-label="Imaging modalities">
        {modalities.map((modality, index) => {
          const Icon = modality.icon
          const selected = modality.id === active
          return (
            <button
              ref={(element) => { tabRefs.current[index] = element }}
              key={modality.id}
              id={`tab-${modality.id}`}
              className={`modality-tab${selected ? ' is-selected' : ''}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${modality.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(modality.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <Icon aria-hidden="true" />
              <span className={modality.shortLabel ? 'wide-label' : undefined}>{modality.label}</span>
              {modality.shortLabel && <span className="short-label">{modality.shortLabel}</span>}
              <span className="selected-indicator" aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function LoadingModule() {
  return <div className="module-loading glass-panel" role="status"><span className="loading-orbit" aria-hidden="true" />Initializing 3D imaging lab…</div>
}

export default function App() {
  const [active, setActive] = useState<Modality>('xray')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light'
    return 'dark'
  })

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Skip to imaging lab</a>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="app-header glass-panel">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><Aperture /></div>
          <div className="brand-copy">
            <h1>Radiology Imaging Lab</h1>
            <p className="subtitle">Interactive 3D acquisition and image formation</p>
          </div>
        </div>
        <ModalityTabs active={active} onChange={setActive} />
        <div className="header-actions">
          <button className="icon-button" type="button" title={`Use ${theme === 'dark' ? 'light' : 'dark'} appearance`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} appearance`} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main id="main-content" className="app-content">
        {modalities.map((modality) => (
          <section key={modality.id} id={`panel-${modality.id}`} role="tabpanel" aria-labelledby={`tab-${modality.id}`} hidden={active !== modality.id}>
            {modality.id === 'xray' ? <Suspense fallback={<LoadingModule />}><XrayModule /></Suspense> : <PlaceholderModule modality={modality.id} />}
          </section>
        ))}
      </main>

      <footer className="app-footer">
        <span>Educational simulation</span><span aria-hidden="true">•</span><span>Not for clinical acquisition planning or dosimetry</span>
      </footer>
    </div>
  )
}
