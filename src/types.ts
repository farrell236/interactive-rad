export type Modality = 'xray' | 'ct' | 'mri' | 'image-data' | 'windowing'

export type Projection = 'AP' | 'PA' | 'Lateral'

export type CameraPreset = 'Room' | 'Beam' | 'Patient' | 'Detector'

export type ExposurePhase = 'ready' | 'charging' | 'emitting' | 'captured'

export interface XraySettings {
  projection: Projection
  kvp: number
  mas: number
  sid: number
  rotation: number
  collimation: number
  thickness: number
}

export interface XrayDerivedState {
  penetration: number
  contrast: number
  noise: number
  magnification: number
  odd: number
  fieldRatio: number
  exposureIndex: number
}
