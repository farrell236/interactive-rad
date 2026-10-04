import { LandingCtScannerCanvas } from './CtScannerScene'

export default function LandingCtScanner3d({ scanProgress, gantryAngle }: { scanProgress: number; gantryAngle: number }) {
  return <LandingCtScannerCanvas scanProgress={scanProgress} gantryAngle={gantryAngle} />
}
