# Third-party notices

This file records material distributed with or represented in Interactive Radiology that is not owned solely by Benjamin Hou. Each item remains governed by its stated license. Nothing in the project-level AGPL or CC BY-NC-SA notice replaces these terms.

## Clinical images, datasets, and reference figures

| Material | Creator or source | License | Use and modifications |
| --- | --- | --- | --- |
| LIDC-IDRI CT frame and teaching volume | Armato III et al.; The Cancer Imaging Archive, subject `LIDC-IDRI-0001` ([collection](https://www.cancerimagingarchive.net/collection/lidc-idri/), [DOI](https://doi.org/10.7937/K9/TCIA.2015.LO9QL9SX)) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Pixel values converted to HU. The teaching volume was resized in-plane and exported as signed 16-bit data. Full derivation is documented in `src/assets/ct/README.md`. |
| Normal PA chest radiograph | Mikael Häggström, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Normal_posteroanterior_%28PA%29_chest_radiograph_%28X-ray%29.jpg) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Wikimedia-generated 960 px derivative; anatomy otherwise unchanged. |
| CT of abscess and transient hepatic attenuation difference | Khaladkar, Bakshi, Bhargava, and Kulkarni, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:CT_of_abscess_and_THAD.jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Cropped for the CT contrast-phase lesson; source arrows remain baked into the image. |
| MRI brain T1 axial image | 511KeV, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:MRI_Brain_T1_Axial_(11).jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Used unchanged as a reconstructed-image example. |
| CIE T1, PD, T2, and T2* templates and CIE T2 slice volume | Dadar, Camicioli, and Duchesne, [Multi-Sequence Average Templates](https://doi.org/10.5281/zenodo.5018356) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Matched planes were windowed, cropped, resized, and exported for teaching comparisons; 31 T2 planes were exported for slice selection. |
| OpenBrain teaching layers | [OpenBrain v1.0](https://huggingface.co/datasets/openbrain-anon/openbrain_v1_0), sample `ds000053__sub-004__ses-DEFAULT__sub-004_T1w` | CC0 | An axial image was converted into illustrative white-matter, gray-matter, and CSF layers; these are not validated segmentations. |
| Image geometry reference | [SimpleITK documentation](https://simpleitk.readthedocs.io/en/master/fundamentalConcepts.html#lbl-isotropy) | [Apache-2.0](https://github.com/SimpleITK/SimpleITK/blob/main/LICENSE) | Referenced by the image-data geometry lesson. |

## Illustrations and 3D assets

| Material | Creator or source | License | Use and modifications |
| --- | --- | --- | --- |
| MRI machine illustration | NIAID / Malcolm Houston, NIH BioArt, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:MRI_Machine_(NIH_BioArt_692_-_782415).svg) | Public domain, United States Government work | Used as scanner-context illustration. |
| Labelled MRI scanner schematic | ChumpusRex / Chiswick Chap and Wikimedia contributors, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Mri_scanner_schematic_labelled.svg) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | Used as a hardware-reference illustration. |
| Hospital scanner and room meshes | [3D Assets, “Hospital Wards and Clinic Operations”](https://3dassets.dev/packs/hospital-wards-and-clinic-operations) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Meshes are composed, recolored, and animated in the X-ray, CT, and MRI scenes. |
| BodyParts3D anatomical meshes | BodyParts3D and ogbog’s [Blender adaptation](https://blendswap.com/blend/26915BodyParts3D) | CC BY-SA, as identified by the source record | Mesh groups were separated, converted, recolored, posed, cropped, and projected for anatomical teaching views. Derivative anatomical mesh files retain the source ShareAlike terms. |
| `public/models/FinalBaseMesh.obj` | Legacy imported patient-surface mesh | Source license not recorded | This file is excluded from the project’s AGPL and CC BY-NC-SA grants pending confirmation of its provenance. |

## Runtime software dependencies

The application bundles open-source dependencies that retain their own licenses. The package lock and installed package metadata are authoritative for exact versions and transitive dependencies.

| Package family | License |
| --- | --- |
| React and React DOM | MIT |
| Three.js | MIT |
| React Three Fiber, Drei, React Three GPU Pathtracer, and React Three Postprocessing | MIT |
| three-gpu-pathtracer | MIT |
| Lucide | ISC |
| postprocessing | zlib |

Development dependencies—including TypeScript, Vite, Vitest, Playwright, ESLint, Testing Library, and jsdom—also retain the licenses declared by their respective packages.

## Attribution placement

Concise attribution appears beside the relevant lessons where practical. This consolidated notice preserves the fuller source, license, and modification record. If an attribution here conflicts with a source license, the original source license controls.
