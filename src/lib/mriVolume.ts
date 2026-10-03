const textureNameForPosition = (positionMm: number) => `cie-t2-z-${positionMm >= 0 ? 'p' : 'm'}${Math.abs(positionMm).toString().padStart(3, '0')}.png`

export const mriVolumeSliceUrl = (positionMm: number) => `${import.meta.env.BASE_URL}assets/mri/cie-t2-volume/${textureNameForPosition(positionMm)}`
