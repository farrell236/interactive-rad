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
