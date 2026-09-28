export type RtBackend = 'webgpu' | 'webgl2'

export interface RtCapabilities {
  webgpu: boolean
  webgl2: boolean
}

export interface RtBackendSelection {
  backend: RtBackend | null
  capabilities: RtCapabilities
  probing: boolean
}

// The WebGL tracer is the production backend. Add `webgpu` here only when the
// WebGPU tracer reaches feature parity for this scene's lights and transmission.
export const IMPLEMENTED_RT_BACKENDS: readonly RtBackend[] = ['webgl2']

export function detectWebGl2Support(): boolean {
  if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined') return false
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'))
  } catch {
    return false
  }
}

export async function detectRtCapabilities(webgl2 = detectWebGl2Support()): Promise<RtCapabilities> {
  if (typeof navigator === 'undefined') return { webgpu: false, webgl2 }

  const gpu = navigator.gpu
  if (!gpu) return { webgpu: false, webgl2 }

  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' })
    return { webgpu: Boolean(adapter), webgl2 }
  } catch {
    return { webgpu: false, webgl2 }
  }
}

export function selectRtBackend(
  capabilities: RtCapabilities,
  implementedBackends: readonly RtBackend[] = IMPLEMENTED_RT_BACKENDS,
): RtBackend | null {
  const implemented = new Set(implementedBackends)
  if (capabilities.webgpu && implemented.has('webgpu')) return 'webgpu'
  if (capabilities.webgl2 && implemented.has('webgl2')) return 'webgl2'
  return null
}

export function describeRtSelection(selection: RtBackendSelection): string {
  if (!selection.backend) {
    return selection.probing ? 'Detecting compatible RT hardware' : 'Ray tracing requires WebGPU or WebGL 2'
  }
  if (selection.backend === 'webgpu') return 'Hardware-accelerated WebGPU path tracing'
  if (selection.capabilities.webgpu) return 'WebGPU detected; using the stable WebGL 2 RT fallback'
  return selection.probing ? 'WebGL 2 RT available; checking for WebGPU' : 'Progressive WebGL 2 path tracing'
}
