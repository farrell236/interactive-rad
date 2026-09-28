import type { Projection, XrayDerivedState, XraySettings } from '../types'

export interface ProjectionGeometry {
  label: string
  patientYawRadians: number
  beamPath: string
  positioningNote: string
  sideMarker: 'L' | 'R'
}

// The imported anatomy model faces local +Z. The X-ray beam travels from
// world -X to +X, from the tube toward the detector.
// Keeping these relationships in one table prevents the 3D scene and UI labels
// from drifting into different definitions of AP, PA, and lateral positioning.
export const PROJECTION_GEOMETRY: Record<Projection, ProjectionGeometry> = {
  AP: {
    label: 'AP',
    patientYawRadians: -Math.PI / 2,
    beamPath: 'Anterior → posterior',
    positioningNote: 'Patient faces the source; the back is against the detector.',
    sideMarker: 'R',
  },
  PA: {
    label: 'PA',
    patientYawRadians: Math.PI / 2,
    beamPath: 'Posterior → anterior',
    positioningNote: 'Patient faces the detector; the chest is against the detector.',
    sideMarker: 'R',
  },
  Lateral: {
    label: 'Left lateral',
    patientYawRadians: Math.PI,
    beamPath: 'Right → left',
    positioningNote: 'Left side is against the detector; arms are raised out of the chest field.',
    sideMarker: 'L',
  },
}

export function getProjectionGeometry(projection: Projection) {
  return PROJECTION_GEOMETRY[projection]
}

export const DEFAULT_XRAY_SETTINGS: XraySettings = {
  projection: 'PA',
  kvp: 110,
  mas: 2.5,
  sid: 180,
  rotation: 0,
  collimation: 82,
  thickness: 24,
}

const DETECTOR_FACE_OFFSET = 0.138
const SCENE_DETECTOR_FACE_X = 4.5
// Keep the rendered 180 cm chest SID close to one adult body height. The
// projection camera below retains the exact pinhole geometry independently.
const SCENE_UNITS_PER_CM = 0.025
const PROJECTION_UNITS_PER_CM = 3.52 / (DEFAULT_XRAY_SETTINGS.sid - 13)

export interface SidGeometry {
  sourceX: number
  detectorFaceX: number
  detectorCenterX: number
  sourceToDetector: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function deriveXrayState(settings: XraySettings): XrayDerivedState {
  const penetration = clamp(0.14 + ((settings.kvp - 50) / 90) * 0.76, 0.1, 0.94)
  const fieldRatio = clamp(settings.collimation / 100, 0.35, 1)
  const contrast = clamp(1.42 - penetration * 0.58 + (1 - fieldRatio) * 0.18, 0.72, 1.35)
  const thicknessFactor = Math.pow(settings.thickness / 24, 1.32)
  const photonFactor = Math.sqrt(Math.max(settings.mas, 0.5) / 2.5)
  const energyFactor = Math.pow(settings.kvp / 110, 0.55)
  const distanceRatio = settings.sid / DEFAULT_XRAY_SETTINGS.sid
  const noise = clamp((0.12 * thicknessFactor * distanceRatio) / (photonFactor * energyFactor), 0.025, 0.36)
  const odd = clamp(13 + Math.abs(settings.rotation) * 0.075, 10, 20)
  const magnification = clamp(settings.sid / (settings.sid - odd), 1.03, 1.25)
  const inverseSquareFactor = Math.pow(DEFAULT_XRAY_SETTINGS.sid / settings.sid, 2)
  const exposureIndex = clamp((settings.mas / 2.5) * Math.pow(settings.kvp / 110, 1.75) * inverseSquareFactor / thicknessFactor, 0.18, 3.6)

  return { penetration, contrast, noise, magnification, odd, fieldRatio, exposureIndex }
}

// The room compresses real-world distances to fit the teaching scene. The
// detector stays put while the tube moves, so its visible separation still
// follows SID in the correct direction and proportion.
export function getSceneSidGeometry(sid: number): SidGeometry {
  const sourceToDetector = sid * SCENE_UNITS_PER_CM
  return {
    sourceX: SCENE_DETECTOR_FACE_X - sourceToDetector,
    detectorFaceX: SCENE_DETECTOR_FACE_X,
    detectorCenterX: SCENE_DETECTOR_FACE_X + DETECTOR_FACE_OFFSET,
    sourceToDetector,
  }
}

// Bounds of the imported body after its normalization transform, before the
// projection yaw is applied. Long source-detector distances are compressed in
// the room, so patient contact must use the asset's scene-space surface rather
// than the SID scale. ODD still describes the internal object plane used by the
// projection model; it is not an external air gap.
const PATIENT_BOUNDS = {
  // Full body bounds are used so raised arms and rotated limbs cannot clip
  // through the detector even when the thorax itself remains well positioned.
  minX: -0.852,
  maxX: 0.849,
  minZ: -0.366,
  maxZ: 0.379,
}
const PATIENT_DETECTOR_CLEARANCE = 0.12

export function getScenePatientCenterX(settings: XraySettings) {
  const { detectorFaceX } = getSceneSidGeometry(settings.sid)
  const yaw = getProjectionGeometry(settings.projection).patientYawRadians + settings.rotation * (Math.PI / 180)
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const projectedMaxX =
    cos * (cos >= 0 ? PATIENT_BOUNDS.maxX : PATIENT_BOUNDS.minX) +
    sin * (sin >= 0 ? PATIENT_BOUNDS.maxZ : PATIENT_BOUNDS.minZ)

  return detectorFaceX - projectedMaxX - PATIENT_DETECTOR_CLEARANCE
}

// The detector render uses an internally consistent pinhole geometry. Its
// source-to-object and object-to-detector distances reproduce M = SID / SOD.
export function getProjectionCameraGeometry(settings: XraySettings, detectorHeight = 3.18) {
  const { odd } = deriveXrayState(settings)
  const sourceToObject = (settings.sid - odd) * PROJECTION_UNITS_PER_CM
  const sourceToDetector = settings.sid * PROJECTION_UNITS_PER_CM
  const detectorFaceX = odd * PROJECTION_UNITS_PER_CM
  const verticalFov = 2 * Math.atan(detectorHeight / (2 * sourceToDetector)) * (180 / Math.PI)

  return {
    sourceX: -sourceToObject,
    detectorFaceX,
    sourceToDetector,
    sourceToObject,
    verticalFov,
  }
}

export function rangeProgress(value: number, min: number, max: number) {
  return `${((value - min) / (max - min)) * 100}%`
}
