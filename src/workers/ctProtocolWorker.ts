import { getCtProjectionModel, simulateCtProjectionNoise } from '../lib/ctProjectionNoise'
import type { CtKernel, CtProjectionModel } from '../lib/ctProjectionNoise'

type ProtocolConfig = {
  id: string
  mas: number
  pitch: number
  thickness: number
  kernel: CtKernel
}

let model: CtProjectionModel | null = null

self.onmessage = (event: MessageEvent<{ type: 'init'; pixels: Int16Array } | { type: 'simulate'; requestId: number; configs: ProtocolConfig[] }>) => {
  if (event.data.type === 'init') {
    model = getCtProjectionModel(event.data.pixels)
    self.postMessage({ type: 'ready' })
    return
  }
  if (!model) return
  const results = event.data.configs.map((config) => {
    const simulation = simulateCtProjectionNoise(model!, config.mas, config.pitch, config.thickness, config.kernel)
    return { id: config.id, hu: simulation.hu, incidentPhotons: simulation.incidentPhotons, size: model!.imageSize }
  })
  self.postMessage({ type: 'result', requestId: event.data.requestId, results }, { transfer: results.map((result) => result.hu.buffer) })
}

export {}
