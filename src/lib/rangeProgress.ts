import type { CSSProperties } from 'react'

export function ctRangeProgressStyle(value: number, minimum: number, maximum: number) {
  const percentage = maximum === minimum ? 0 : ((value - minimum) / (maximum - minimum)) * 100
  return {
    '--accent': 'var(--ct-accent)',
    '--range-progress': `${Math.max(0, Math.min(100, percentage))}%`,
  } as CSSProperties
}
