import { useEffect, useState, type RefObject } from 'react'

type ViewportOptions = {
  rootMargin?: string
  threshold?: number
  once?: boolean
  initial?: boolean
}

export function useInViewport<T extends Element>(
  ref: RefObject<T | null>,
  { rootMargin = '0px', threshold = 0, once = false, initial = true }: ViewportOptions = {},
) {
  const [visible, setVisible] = useState(initial)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof window.IntersectionObserver !== 'function') {
      setVisible(true)
      return undefined
    }

    const observer = new window.IntersectionObserver(([entry]) => {
      const nextVisible = Boolean(entry?.isIntersecting)
      setVisible(nextVisible)
      if (once && nextVisible) observer.disconnect()
    }, { rootMargin, threshold })

    observer.observe(element)
    return () => observer.disconnect()
  }, [once, ref, rootMargin, threshold])

  return visible
}

export function useDocumentVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  return visible
}
