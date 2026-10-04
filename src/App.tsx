import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent, SVGProps } from 'react'
import { Aperture, Contrast, Database, Magnet, Moon, ScanLine, Sun } from 'lucide-react'
import LandingPage from './components/LandingPage'
import type { Modality } from './types'

const XrayModule = lazy(() => import('./components/XrayModule'))
const CtModule = lazy(() => import('./components/CtModule'))
const MriModule = lazy(() => import('./components/MriModule'))
const WindowingModule = lazy(() => import('./components/WindowingModule'))
const ImageDataModule = lazy(() => import('./components/ImageDataModule'))
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const modalities: Array<{ id: Modality; label: string; shortLabel?: string; icon: IconComponent }> = [
  { id: 'xray', label: 'X-ray', icon: Aperture },
  { id: 'ct', label: 'CT', icon: ScanLine },
  { id: 'windowing', label: 'CT Windowing', shortLabel: 'Window', icon: Contrast },
  { id: 'mri', label: 'MRI', icon: Magnet },
  { id: 'image-data', label: 'Image Data', shortLabel: 'Data', icon: Database },
]

function ModalityTabs({ active, onChange }: { active: Modality | null; onChange: (id: Modality) => void }) {
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
    <nav className="modality-nav" aria-label="Imaging learning modules">
      <div className="modality-tabs" role="tablist" aria-label="Imaging learning modules">
        {modalities.map((modality, index) => {
          const Icon = modality.icon
          const selected = modality.id === active
          return (
            <button
              ref={(element) => { tabRefs.current[index] = element }}
              key={modality.id}
              id={`tab-${modality.id}`}
              className={`modality-tab modality-tab-${modality.id}${selected ? ' is-selected' : ''}`}
              type="button"
              role="tab"
              aria-label={modality.label}
              aria-selected={selected}
              aria-controls={`panel-${modality.id}`}
              tabIndex={selected || (!active && index === 0) ? 0 : -1}
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
  const [page, setPage] = useState<'home' | Modality>('home')
  const [landingActive, setLandingActive] = useState<Modality | null>(null)
  const [textSize, setTextSize] = useState(16)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light'
    return 'dark'
  })

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    document.documentElement.style.fontSize = `${textSize}px`
    return () => { document.documentElement.style.removeProperty('font-size') }
  }, [textSize])

  const returnHome = useCallback(() => {
    setPage('home')
    setLandingActive(null)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  const openModule = useCallback((modality: Modality) => {
    setPage(modality)
    setLandingActive(null)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  const activeModality = page === 'home' ? landingActive : page

  const activeModule = page === 'xray'
    ? <XrayModule />
    : page === 'ct'
      ? <CtModule />
      : page === 'mri'
        ? <MriModule />
        : page === 'image-data'
          ? <ImageDataModule />
          : page === 'windowing'
            ? <WindowingModule />
            : null

  return (
    <div className={`app-frame${page === 'home' ? ' is-home' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to imaging lab</a>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="app-header glass-panel">
        <div className="brand-block">
          <button className="brand-home-button" type="button" aria-label="Open Interactive Radiology home" aria-current={page === 'home' ? 'page' : undefined} onClick={returnHome}>
            <span className="brand-mark" aria-hidden="true"><Aperture /></span>
            <span className="brand-copy">
              <span className="brand-title">Interactive Radiology</span>
              <span className="subtitle">Interactive 3D acquisition and image formation</span>
            </span>
          </button>
        </div>
        <ModalityTabs active={activeModality} onChange={openModule} />
        <div className="header-actions">
          <div className="text-size-control" role="group" aria-label="Text size">
            <button className="text-size-button is-decrease" type="button" title={`Decrease text size · ${textSize}px`} aria-label="Decrease text size" disabled={textSize <= 14} onClick={() => setTextSize((current) => Math.max(14, current - 2))}>A−</button>
            <button className="text-size-button is-increase" type="button" title={`Increase text size · ${textSize}px`} aria-label="Increase text size" disabled={textSize >= 22} onClick={() => setTextSize((current) => Math.min(22, current + 2))}>A+</button>
            <span className="sr-only" aria-live="polite" aria-atomic="true">Text size {textSize}px</span>
          </div>
          <button className="icon-button" type="button" title={`Use ${theme === 'dark' ? 'light' : 'dark'} appearance`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} appearance`} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main id="main-content" className={`app-content${page === 'home' ? ' is-landing' : ''}`}>
        {page === 'home'
          ? <LandingPage onActiveChange={setLandingActive} onOpenModule={openModule} />
          : (
            <section id={`panel-${page}`} role="tabpanel" aria-labelledby={`tab-${page}`}>
              <h1 className="sr-only">Interactive Radiology — {modalities.find((modality) => modality.id === page)?.label}</h1>
              <Suspense fallback={<LoadingModule />}>{activeModule}</Suspense>
            </section>
          )}
      </main>

      <footer className="app-footer">
        <span>Educational simulation</span><span aria-hidden="true">•</span><span>Not for clinical acquisition planning or dosimetry</span>
      </footer>
    </div>
  )
}
