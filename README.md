# Radiology Imaging Lab

A cinematic browser-based teaching application for exploring how radiological images are acquired, represented, and displayed. The first working module is an interactive chest X-ray laboratory; CT, MRI, medical image data, and intensity/windowing are structured as future modules.

## Run locally

Requires Node.js 20.19 or newer and pnpm 11.

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## What is implemented

- Responsive glass application shell with light and dark appearances
- Accessible five-tab modality navigation
- Procedural Three.js radiography room with detailed equipment, a proportioned patient and anatomical cutaway, source, detector, beam cone, central ray, orbit/zoom controls, and camera presets
- AP, PA, and lateral positioning presets
- Source-to-image distance, patient rotation, and collimation geometry
- Stylized live detector image responding to projection, kVp, mAs, SID, patient thickness, rotation, and collimation
- Animated exposure sequence and capture state
- Polished CT, MRI, medical image data, and intensity/windowing roadmaps
- Unit tests for qualitative simulation behavior

## Architecture

- `src/App.tsx` — application shell, modality navigation, theme, and lazy module loading
- `src/components/XrayModule.tsx` — X-ray state and exposure orchestration
- `src/components/XrayScene.tsx` — procedural 3D acquisition room
- `src/components/DetectorImage.tsx` — reactive synthetic radiograph
- `src/components/AcquisitionControls.tsx` — geometry and exposure controls
- `src/components/PlaceholderModule.tsx` — reusable future-modality presentation
- `src/simulation/xray.ts` — presentation-independent qualitative physics model

Modality physics is kept separate from presentation components so a future CT/CBCT volume ray-caster can replace the procedural anatomy without restructuring the application shell.

## Scientific scope and limitations

The detector view is an educational, stylized projection. Parameter behavior is internally consistent with a simplified Beer–Lambert attenuation model:

- Higher kVp increases penetration and reduces subject contrast.
- Higher mAs increases photon statistics and reduces displayed quantum noise.
- SID and object-to-detector distance change qualitative magnification.
- Collimation changes the beam and captured detector field.
- Patient projection and rotation change anatomical overlap.

It is not a diagnostic image, dose calculator, radiographic technique chart, or clinical acquisition-planning tool. It does not model a full polyenergetic spectrum, scatter, grids, automatic exposure control, vendor processing, or patient-specific anatomy.

## Future extension points

- Replace procedural anatomy with a reviewed anatomical mesh.
- Add CT/CBCT volume loading and HU-to-attenuation conversion.
- Add sinogram and reconstruction views for CT.
- Add sequence timing and k-space views for MRI.
- Add interactive DICOM and NIfTI header lessons for spacing, origin, direction, orientation, coordinate systems, transforms, and resampling.
- Add CT Hounsfield-unit windowing, relative MR signal, clipping, type conversion, and normalization demonstrations.
