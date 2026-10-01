# LIDC-IDRI teaching slice

`lidc-idri-0001-i060-hu16le.bin` contains one 512 × 512 axial CT frame from the de-identified LIDC-IDRI collection. It is stored as little-endian signed 16-bit Hounsfield unit values after applying the DICOM Rescale Slope and Rescale Intercept. The DICOM header itself is not distributed with the app.

- Collection: LIDC-IDRI, subject `LIDC-IDRI-0001`
- Series Instance UID: `1.3.6.1.4.1.14519.5.2.1.6279.6001.179049373636438705059720603192`
- SOP Instance UID: `1.3.6.1.4.1.14519.5.2.1.6279.6001.135156800731029909386852815043`
- DICOM Instance Number: 60
- Pixel spacing: 0.703125 × 0.703125 mm
- Slice thickness: 2.5 mm
- Source: [The Cancer Imaging Archive — LIDC-IDRI](https://www.cancerimagingarchive.net/collection/lidc-idri/)
- License: [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/)

Data citation:

> Armato III, S. G., et al. (2015). Data From LIDC-IDRI. The Cancer Imaging Archive. https://doi.org/10.7937/K9/TCIA.2015.LO9QL9SX

Transformation performed for this app: Pixel Data was decoded, converted with `HU = stored value × Rescale Slope + Rescale Intercept`, rounded to integer HU, and exported row-major as signed 16-bit little-endian values. No anatomical pixels were altered.

## LIDC-IDRI teaching volume

`lidc-idri-0001-chest-192x192x133-hu16le.bin` contains all 133 axial images from the same series, ordered superior to inferior. The complete source volume was converted to Hounsfield units and resized in-plane from 512 × 512 to 192 × 192 with bilinear interpolation. Its source 2.5 mm slice positions were preserved; the derived in-plane pixel spacing is 1.875 × 1.875 mm. The companion `lidc-idri-0001-chest-volume.json` records the dimensions, geometry, identifiers, ordering, and storage representation.

The compact volume is used only by the CT acquisition lesson. The animation traverses the 81-slice thoracic range recorded in the metadata while retaining the full series in the asset. It is displayed with a lung window while the app synchronizes the current axial level with the gantry animation and growing slice stack. The 5.0 and 7.5 mm teaching settings average neighboring source images; they do not create additional resolution.

To reproduce the asset after downloading the source DICOM series:

```sh
python3 scripts/prepare_lidc_volume.py DICOM_DIRECTORY \
  src/assets/ct/lidc-idri-0001-chest-192x192x133-hu16le.bin \
  src/assets/ct/lidc-idri-0001-chest-volume.json
```
