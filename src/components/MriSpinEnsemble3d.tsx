import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { getMriPulseCyclePhase, isMriRfActive, MRI_PULSE_CYCLE_SECONDS, MRI_RF_END, MRI_RF_START } from './mriPulseCycle'

type SignalStageId = 'hydrogen' | 'random' | 'align' | 'cycle'

interface ParticleDefinition {
  position: [number, number, number]
  randomAxis: THREE.Vector3
  phaseOffset: number
  antiparallel: boolean
}

const UP = new THREE.Vector3(0, 1, 0)
const IDENTITY_QUATERNION = new THREE.Quaternion()
const TEMP_DIRECTION = new THREE.Vector3()
const TEMP_AXIS_QUATERNION = new THREE.Quaternion()
const TEMP_DIPOLE_QUATERNION = new THREE.Quaternion()
const TEMP_NUCLEUS_QUATERNION = new THREE.Quaternion()
const TEMP_SPIN_QUATERNION = new THREE.Quaternion()
function fractional(value: number) {
  return value - Math.floor(value)
}

function smoothstep(value: number) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1)
  return clamped * clamped * (3 - (2 * clamped))
}

function buildParticles(): ParticleDefinition[] {
  return Array.from({ length: 25 }, (_, index) => {
    const column = index % 5
    const row = Math.floor(index / 5)
    const azimuth = fractional(Math.sin((index + 1) * 91.713) * 43758.5453) * Math.PI * 2
    const polar = 0.35 + fractional(Math.sin((index + 7) * 47.191) * 15731.743) * (Math.PI - 0.7)
    return {
      position: [(column - 2) * 2.2, (2 - row) * 1.38, ((index % 4) - 1.5) * 0.13],
      randomAxis: new THREE.Vector3(Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)).normalize(),
      phaseOffset: fractional(Math.sin((index + 3) * 22.417) * 9413.31) * Math.PI * 2,
      antiparallel: index % 2 === 1,
    }
  })
}

function createHydrogenLabelTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'rgba(255, 255, 255, 0.96)'
    context.font = '700 96px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('H', canvas.width / 2, (canvas.height / 2) + 3)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

function stagePolarAngle(stage: SignalStageId, particle: ParticleDefinition, elapsed: number) {
  const equilibrium = particle.antiparallel ? Math.PI - 0.22 : 0.22
  if (stage === 'random') return 0
  if (stage === 'hydrogen') return 0.3
  if (stage === 'align') return equilibrium

  const cycle = (elapsed % MRI_PULSE_CYCLE_SECONDS) / MRI_PULSE_CYCLE_SECONDS
  if (cycle < 0.18) return equilibrium
  if (cycle < 0.32) return THREE.MathUtils.lerp(equilibrium, Math.PI * 0.43, smoothstep((cycle - 0.18) / 0.14))
  if (cycle < 0.42) return Math.PI * 0.43
  if (cycle < 0.82) return THREE.MathUtils.lerp(Math.PI * 0.43, equilibrium, smoothstep((cycle - 0.42) / 0.4))
  return equilibrium
}

function stagePhase(stage: SignalStageId, particle: ParticleDefinition, time: number, elapsed: number) {
  if (stage === 'hydrogen' || stage === 'random') return particle.phaseOffset
  if (stage === 'cycle') {
    const cycle = (elapsed % MRI_PULSE_CYCLE_SECONDS) / MRI_PULSE_CYCLE_SECONDS
    if (cycle < 0.18) return (time * 4.2) + particle.phaseOffset
    if (cycle < 0.32) {
      const coherence = smoothstep((cycle - 0.18) / 0.14)
      return (time * 4.2) + (particle.phaseOffset * (1 - coherence))
    }
    if (cycle < 0.42) return time * 4.2
    if (cycle < 0.82) {
      const dephasing = smoothstep((cycle - 0.42) / 0.4)
      return (time * 4.2) + (particle.phaseOffset * dephasing)
    }
    return (time * 4.2) + particle.phaseOffset
  }
  return particle.phaseOffset + (time * 4.2)
}

function DipoleVector() {
  return (
    <group>
      <mesh position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.026, 0.026, 0.62, 12]} />
        <meshStandardMaterial color="#ff816a" emissive="#b92818" emissiveIntensity={0.24} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0.69, 0]}>
        <coneGeometry args={[0.105, 0.24, 18]} />
        <meshStandardMaterial color="#ff816a" emissive="#b92818" emissiveIntensity={0.28} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.34, 0]}>
        <cylinderGeometry args={[0.024, 0.024, 0.68, 12]} />
        <meshStandardMaterial color="#65ddff" emissive="#147ca5" emissiveIntensity={0.28} roughness={0.3} />
      </mesh>
    </group>
  )
}

function FieldLines({ visible }: { visible: boolean }) {
  const viewport = useThree((state) => state.viewport)
  const spacing = 2.16
  const lineCount = Math.ceil(viewport.width / spacing) + 4
  const lineHeight = viewport.height * 1.28
  const arrowBands = [-0.42, -0.14, 0.14, 0.42]

  return (
    <group visible={visible} position={[0, 0, -1.35]}>
      {Array.from({ length: lineCount }, (_, index) => (index - ((lineCount - 1) / 2)) * spacing).map((x, lineIndex) => {
        return (
          <group key={x} position={[x, 0, 0]}>
            <mesh>
              <cylinderGeometry args={[0.008, 0.008, lineHeight, 8]} />
              <meshBasicMaterial color="#36bddf" transparent opacity={0.28} toneMapped={false} />
            </mesh>
            {arrowBands.map((bandPosition, arrowIndex) => {
              const jitter = (fractional(Math.sin(((lineIndex + 1) * 91.713) + ((arrowIndex + 1) * 47.191)) * 43758.5453) - 0.5) * 0.1
              return (
                <mesh key={arrowIndex} position={[0, (bandPosition + jitter) * lineHeight, 0]}>
                  <coneGeometry args={[0.085, 0.22, 12]} />
                  <meshBasicMaterial color="#36bddf" transparent opacity={0.42} toneMapped={false} />
                </mesh>
              )
            })}
          </group>
        )
      })}
    </group>
  )
}

function RfPulseWave({ visible, cycleStartedAt, reducedMotion }: { visible: boolean; cycleStartedAt: number; reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group | null>(null)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const viewport = useThree((state) => state.viewport)
  const uniforms = useMemo(() => ({ uProgress: { value: 0 } }), [])

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    if (!visible) {
      group.visible = false
      return
    }
    group.visible = true
    if (reducedMotion) {
      if (materialRef.current) materialRef.current.uniforms.uProgress.value = 0.58
      return
    }
    const cycle = getMriPulseCyclePhase(cycleStartedAt)
    if (!isMriRfActive(cycle)) {
      group.visible = false
      return
    }
    const progress = THREE.MathUtils.clamp((cycle - MRI_RF_START) / (MRI_RF_END - MRI_RF_START), 0, 1)
    if (materialRef.current) materialRef.current.uniforms.uProgress.value = smoothstep(progress)
    group.visible = progress < 1
  })

  return (
    <group ref={groupRef} visible={visible} position={[0, 0, -0.72]}>
      <mesh>
        <planeGeometry args={[viewport.width * 1.3, viewport.height * 1.3]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          toneMapped={false}
          vertexShader={`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform float uProgress;
            varying vec2 vUv;
            void main() {
              vec2 fromImpact = vec2((vUv.x - 0.5) * 0.92, (vUv.y - 1.06) * 0.72);
              float radius = length(fromImpact);
              float front = mix(0.015, 0.86, uProgress);
              float wake = front - radius;
              float leadingEdge = smoothstep(-0.025, 0.018, wake);
              float trailingEdge = 1.0 - smoothstep(0.28, 0.48, wake);
              float envelope = leadingEdge * trailingEdge;
              float oscillation = sin(wake * 54.0);
              float highlight = pow(max(oscillation, 0.0), 2.2);
              float shadow = pow(max(-oscillation, 0.0), 2.0);
              float edgeFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, 1.0 - vUv.x);
              float finishFade = 1.0 - smoothstep(0.84, 1.0, uProgress);
              vec3 shadowColor = vec3(0.24, 0.055, 0.5);
              vec3 highlightColor = vec3(0.67, 0.36, 0.98);
              vec3 color = mix(shadowColor, highlightColor, highlight);
              float alpha = envelope * edgeFade * finishFade * (0.055 + (highlight * 0.25) + (shadow * 0.16));
              gl_FragColor = vec4(color, alpha);
            }
          `}
        />
      </mesh>
    </group>
  )
}

function SpinField({ stage, cycleStartedAt, reducedMotion }: { stage: SignalStageId; cycleStartedAt: number; reducedMotion: boolean }) {
  const particles = useMemo(() => buildParticles(), [])
  const hydrogenLabel = useMemo(() => createHydrogenLabelTexture(), [])
  const particleRefs = useRef<Array<THREE.Group | null>>([])
  const nucleusRefs = useRef<Array<THREE.Group | null>>([])
  const axisRefs = useRef<Array<THREE.Group | null>>([])
  const precessionRefs = useRef<Array<THREE.Group | null>>([])
  const dipoleRefs = useRef<Array<THREE.Group | null>>([])
  const currentPolar = useRef(particles.map(() => 0.3))
  const enteredAt = useRef(0)

  useEffect(() => {
    enteredAt.current = performance.now() / 1000
  }, [stage])

  useEffect(() => () => hydrogenLabel.dispose(), [hydrogenLabel])

  useFrame(({ clock }, delta) => {
    const time = reducedMotion ? 1.25 : clock.getElapsedTime()
    const stageElapsed = reducedMotion ? 2.6 : Math.max(0, (performance.now() / 1000) - enteredAt.current)
    const elapsed = stage === 'cycle'
      ? Math.max(0, (reducedMotion ? MRI_PULSE_CYCLE_SECONDS * 0.5 : (performance.now() / 1000) - cycleStartedAt))
      : stageElapsed
    const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 4.6)

    particles.forEach((particle, index) => {
      const particleGroup = particleRefs.current[index]
      const nucleusGroup = nucleusRefs.current[index]
      const axisGroup = axisRefs.current[index]
      const precessionGroup = precessionRefs.current[index]
      const dipoleGroup = dipoleRefs.current[index]
      if (!particleGroup || !nucleusGroup || !axisGroup || !precessionGroup || !dipoleGroup) return

      const isHydrogenFocus = stage === 'hydrogen'
      const targetParticleScale = isHydrogenFocus ? (index === 12 ? 1.35 : 0.001) : 1
      const nextParticleScale = THREE.MathUtils.lerp(particleGroup.scale.x, targetParticleScale, blend)
      particleGroup.scale.setScalar(nextParticleScale)

      const targetPrecessionScale = isHydrogenFocus ? 0.001 : 1
      const nextPrecessionScale = THREE.MathUtils.lerp(precessionGroup.scale.x, targetPrecessionScale, blend)
      precessionGroup.scale.setScalar(nextPrecessionScale)

      const targetAxis = stage === 'random' ? particle.randomAxis : UP
      TEMP_AXIS_QUATERNION.setFromUnitVectors(UP, targetAxis)
      axisGroup.quaternion.slerp(TEMP_AXIS_QUATERNION, blend)

      const targetPolar = stagePolarAngle(stage, particle, elapsed)
      currentPolar.current[index] = stage === 'random'
        ? 0
        : THREE.MathUtils.lerp(currentPolar.current[index] ?? targetPolar, targetPolar, blend)
      const phase = stagePhase(stage, particle, time, elapsed)
      const polar = currentPolar.current[index] ?? targetPolar
      TEMP_DIRECTION.set(Math.sin(polar) * Math.cos(phase), Math.cos(polar), Math.sin(polar) * Math.sin(phase)).normalize()
      TEMP_DIPOLE_QUATERNION.setFromUnitVectors(UP, TEMP_DIRECTION)
      if (stage === 'random') dipoleGroup.quaternion.copy(TEMP_DIPOLE_QUATERNION)
      else dipoleGroup.quaternion.slerp(TEMP_DIPOLE_QUATERNION, reducedMotion ? 1 : 1 - Math.exp(-delta * 9.5))

      if (stage === 'hydrogen') {
        nucleusGroup.quaternion.slerp(IDENTITY_QUATERNION, blend)
      } else {
        const spinAngle = particle.phaseOffset + (reducedMotion ? 0 : time * 2.45)
        TEMP_SPIN_QUATERNION.setFromAxisAngle(UP, spinAngle)
        TEMP_NUCLEUS_QUATERNION.copy(dipoleGroup.quaternion).multiply(TEMP_SPIN_QUATERNION)
        nucleusGroup.quaternion.copy(TEMP_NUCLEUS_QUATERNION)
      }
    })
  })

  const fieldVisible = stage === 'align' || stage === 'cycle'

  return (
    <>
      <ambientLight intensity={1.22} />
      <directionalLight position={[-4, 6, 8]} intensity={2.4} color="#e5f8ff" />
      <pointLight position={[4, -2, 5]} intensity={18} distance={16} color="#5fcfff" />
      <FieldLines visible={fieldVisible} />
      <RfPulseWave visible={stage === 'cycle'} cycleStartedAt={cycleStartedAt} reducedMotion={reducedMotion} />
      {particles.map((particle, index) => (
        <group
          key={index}
          ref={(element) => { particleRefs.current[index] = element }}
          position={particle.position}
          scale={index === 12 ? 1.35 : 0.001}
        >
          <group ref={(element) => { axisRefs.current[index] = element }}>
            <group ref={(element) => { nucleusRefs.current[index] = element }}>
              <mesh>
                <sphereGeometry args={[0.34, 32, 24]} />
                <meshPhysicalMaterial color="#2498de" roughness={0.25} metalness={0.04} clearcoat={0.72} clearcoatRoughness={0.2} />
              </mesh>
              <mesh visible={stage !== 'hydrogen'} position={[0, 0, 0.344]}>
                <planeGeometry args={[0.29, 0.29]} />
                <meshBasicMaterial map={hydrogenLabel} transparent alphaTest={0.05} depthTest depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
              </mesh>
            </group>
            <group ref={(element) => { precessionRefs.current[index] = element }} scale={0.001}>
              <group ref={(element) => { dipoleRefs.current[index] = element }}>
                <DipoleVector />
              </group>
            </group>
          </group>
        </group>
      ))}
    </>
  )
}

export function MriSpinEnsemble3d({ stage, cycleStartedAt }: { stage: SignalStageId; cycleStartedAt: number }) {
  const fieldVisible = stage === 'align' || stage === 'cycle'
  const [rfVisible, setRfVisible] = useState(false)
  const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (stage !== 'cycle' || reducedMotion) return undefined
    let frame = 0
    const update = () => {
      setRfVisible(isMriRfActive(getMriPulseCyclePhase(cycleStartedAt)))
      frame = window.requestAnimationFrame(update)
    }
    update()
    return () => window.cancelAnimationFrame(frame)
  }, [cycleStartedAt, reducedMotion, stage])
  const caption = stage === 'hydrogen'
    ? 'One hydrogen nucleus'
    : stage === 'random'
      ? 'Surface H shows individual spin · no common axis'
      : stage === 'align'
        ? 'Parallel field lines show the shared B₀ direction'
        : 'RF pulse → coherent signal → decay → recovery'

  return (
    <figure className={`mri-spin-ensemble is-${stage}`}>
      <figcaption><span>Hydrogen ensemble</span><small>{caption}</small></figcaption>
      <div className="mri-spin-ensemble-canvas" role="img" aria-label={`Three-dimensional hydrogen magnetic-moment ensemble during the ${stage} stage`}>
        <Canvas camera={{ position: [0, 0, 12], fov: 36, near: 0.1, far: 40 }} dpr={[1, 1.5]} frameloop={reducedMotion ? 'demand' : 'always'} gl={{ alpha: true, antialias: true }}>
          <SpinField stage={stage} cycleStartedAt={cycleStartedAt} reducedMotion={reducedMotion} />
        </Canvas>
        <div className="mri-spin-3d-key" aria-hidden="true">
          <span className={fieldVisible ? 'is-active is-b0' : 'is-b0'}>B₀</span>
          <span className={stage === 'cycle' && (reducedMotion || rfVisible) ? 'is-active is-rf' : 'is-rf'}>RF · B₁</span>
        </div>
      </div>
    </figure>
  )
}
