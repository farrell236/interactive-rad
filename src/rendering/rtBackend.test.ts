import { describe, expect, it } from 'vitest'
import { describeRtSelection, selectRtBackend } from './rtBackend'

describe('RT backend selection', () => {
  it('prefers WebGPU when both capability and implementation are available', () => {
    expect(selectRtBackend(
      { webgpu: true, webgl2: true },
      ['webgpu', 'webgl2'],
    )).toBe('webgpu')
  })

  it('uses the implemented WebGL 2 tracer when WebGPU RT is not production-ready', () => {
    expect(selectRtBackend(
      { webgpu: true, webgl2: true },
      ['webgl2'],
    )).toBe('webgl2')
  })

  it('reports no backend when no supported implementation is available', () => {
    expect(selectRtBackend(
      { webgpu: true, webgl2: false },
      ['webgl2'],
    )).toBeNull()
  })

  it('explains when WebGPU is available but the safe fallback is selected', () => {
    expect(describeRtSelection({
      backend: 'webgl2',
      capabilities: { webgpu: true, webgl2: true },
      probing: false,
    })).toContain('stable WebGL 2 RT fallback')
  })
})
