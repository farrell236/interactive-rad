# Third-party assets

## Male human with separated anatomical systems

- Creator: ogbog
- Source: https://blendswap.com/blend/26915
- License: CC BY-SA
- Original anatomical data: BodyParts3D, https://lifesciencedb.jp/bp3d/

The application uses web-optimized exports of the `integumentary`, `skeletal`,
`respiratory`, `digestive`, and `renal` collections, together with the heart
components from the supplied Blender file. Materials and scene integration were
adapted for the interactive radiography simulation.

## Hospital Wards and Clinic Operations

- Creator: 3D Assets
- Pack: https://3dassets.dev/packs/hospital-wards-and-clinic-operations
- CT scanner: https://3dassets.dev/assets/hospital-wards-and-clinic-operations-ct-scanner-f8d327b3
- License: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/

The CT lesson bundles the pack's scanner, corridor floor tile, ceiling light
panel, solid and glazed partitions, preparation counter, patient monitor,
oxygen outlet panel, and medicine fridge. The meshes are used at their shared
real-world scale to assemble the interactive CT suite. The source marks the
pack as AI-generated; all included files are distributed as CC0 assets.

## LIDC-IDRI chest CT

- Collection: LIDC-IDRI
- Subject: LIDC-IDRI-0001
- Source: https://www.cancerimagingarchive.net/collection/lidc-idri/
- Data citation: Armato III, S. G., et al. (2015). Data From LIDC-IDRI. The Cancer Imaging Archive. https://doi.org/10.7937/K9/TCIA.2015.LO9QL9SX
- License: CC BY 3.0, https://creativecommons.org/licenses/by/3.0/

The CT acquisition lesson uses a compact, browser-oriented derivative of one
complete 133-image DICOM series. Source pixels were converted to Hounsfield
units, resized in-plane, and stored as signed 16-bit values. Series identifiers
and geometry are retained in `src/assets/ct/lidc-idri-0001-chest-volume.json`.
