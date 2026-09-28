import { describe, expect, it } from 'vitest'
import { DEFAULT_XRAY_SETTINGS, deriveXrayState, getProjectionCameraGeometry, getProjectionGeometry, getScenePatientCenterX, getSceneSidGeometry, rangeProgress } from './xray'

describe('X-ray simulation model', () => {
  it('reduces quantum noise as mAs increases', () => {
    const low = deriveXrayState({ ...DEFAULT_XRAY_SETTINGS, mas: 0.5 })
    const high = deriveXrayState({ ...DEFAULT_XRAY_SETTINGS, mas: 10 })
    expect(high.noise).toBeLessThan(low.noise)
  })

  it('increases penetration and lowers contrast as kVp rises', () => {
    const low = deriveXrayState({ ...DEFAULT_XRAY_SETTINGS, kvp: 50 })
    const high = deriveXrayState({ ...DEFAULT_XRAY_SETTINGS, kvp: 140 })
    expect(high.penetration).toBeGreaterThan(low.penetration)
    expect(high.contrast).toBeLessThan(low.contrast)
  })

  it('keeps outputs within safe display ranges', () => {
    const state = deriveXrayState({ ...DEFAULT_XRAY_SETTINGS, mas: 0.5, kvp: 50, thickness: 38, rotation: 45 })
    expect(state.noise).toBeGreaterThanOrEqual(0.025)
    expect(state.noise).toBeLessThanOrEqual(0.36)
    expect(state.magnification).toBeGreaterThanOrEqual(1.03)
    expect(state.magnification).toBeLessThanOrEqual(1.25)
  })

  it('reduces magnification as SID increases', () => {
    const near = deriveXrayState({ ...DEFAULT_XRAY_SETTINGS, sid: 100 })
    const far = deriveXrayState({ ...DEFAULT_XRAY_SETTINGS, sid: 200 })
    expect(near.magnification).toBeGreaterThan(far.magnification)
    expect(near.exposureIndex).toBeGreaterThan(far.exposureIndex)
    expect(near.noise).toBeLessThan(far.noise)
  })

  it('improves subject contrast when the field is tightly collimated', () => {
    const tight = deriveXrayState({ ...DEFAULT_XRAY_SETTINGS, collimation: 35 })
    const open = deriveXrayState({ ...DEFAULT_XRAY_SETTINGS, collimation: 100 })
    expect(tight.fieldRatio).toBeLessThan(open.fieldRatio)
    expect(tight.contrast).toBeGreaterThan(open.contrast)
  })

  it('moves the source away while keeping the scene detector fixed', () => {
    const near = getSceneSidGeometry(100)
    const far = getSceneSidGeometry(200)
    expect(near.detectorFaceX).toBe(far.detectorFaceX)
    expect(far.sourceX).toBeLessThan(near.sourceX)
    expect(far.sourceToDetector / near.sourceToDetector).toBeCloseTo(2)
    expect(getSceneSidGeometry(180).sourceToDetector).toBeCloseTo(4.5)
  })

  it('places each projected patient body surface against the detector', () => {
    const geometry = getSceneSidGeometry(DEFAULT_XRAY_SETTINGS.sid)
    const paCenterX = getScenePatientCenterX({ ...DEFAULT_XRAY_SETTINGS, projection: 'PA' })
    const apCenterX = getScenePatientCenterX({ ...DEFAULT_XRAY_SETTINGS, projection: 'AP' })
    const lateralCenterX = getScenePatientCenterX({ ...DEFAULT_XRAY_SETTINGS, projection: 'Lateral' })

    expect(geometry.detectorFaceX - paCenterX).toBeCloseTo(0.499, 2)
    expect(geometry.detectorFaceX - apCenterX).toBeCloseTo(0.486, 2)
    expect(geometry.detectorFaceX - lateralCenterX).toBeCloseTo(0.972, 2)
  })

  it('adds clearance for the full body throughout AP and PA rotation', () => {
    const paRotated = getScenePatientCenterX({ ...DEFAULT_XRAY_SETTINGS, projection: 'PA', rotation: 45 })
    const apRotated = getScenePatientCenterX({ ...DEFAULT_XRAY_SETTINGS, projection: 'AP', rotation: -45 })

    expect(paRotated).toBeLessThan(getScenePatientCenterX({ ...DEFAULT_XRAY_SETTINGS, projection: 'PA' }))
    expect(apRotated).toBeLessThan(getScenePatientCenterX({ ...DEFAULT_XRAY_SETTINGS, projection: 'AP' }))
  })

  it('uses the same magnification in the projection camera and readout', () => {
    const settings = { ...DEFAULT_XRAY_SETTINGS, sid: 140 }
    const camera = getProjectionCameraGeometry(settings)
    const state = deriveXrayState(settings)
    expect(camera.sourceToDetector / camera.sourceToObject).toBeCloseTo(state.magnification)
  })

  it('maps range values to CSS percentages', () => { expect(rangeProgress(75, 50, 100)).toBe('50%') })

  it('maps each projection to the correct source-to-detector orientation', () => {
    expect(getProjectionGeometry('AP')).toMatchObject({ patientYawRadians: -Math.PI / 2, beamPath: 'Anterior → posterior' })
    expect(getProjectionGeometry('PA')).toMatchObject({ patientYawRadians: Math.PI / 2, beamPath: 'Posterior → anterior' })
    expect(getProjectionGeometry('Lateral')).toMatchObject({ patientYawRadians: Math.PI, beamPath: 'Right → left', sideMarker: 'L' })
  })
})
