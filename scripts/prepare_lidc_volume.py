#!/usr/bin/env python3
"""Build the compact browser volume used by the CT acquisition lesson.

The input directory must contain one DICOM series. Slices are sorted from
superior to inferior, converted to Hounsfield units, resized in-plane, and
written as little-endian signed 16-bit samples in z-major order.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pydicom
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("dicom_dir", type=Path)
    parser.add_argument("output_bin", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--size", type=int, default=192)
    parser.add_argument("--teaching-start", type=int, default=16)
    parser.add_argument("--teaching-end", type=int, default=96)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dicom_paths = sorted(args.dicom_dir.rglob("*.dcm"))
    if not dicom_paths:
        raise SystemExit(f"No DICOM files found below {args.dicom_dir}")

    slices: list[tuple[float, int, np.ndarray, pydicom.Dataset]] = []
    for path in dicom_paths:
        dataset = pydicom.dcmread(path)
        position = float(dataset.ImagePositionPatient[2])
        instance = int(dataset.InstanceNumber)
        pixels = dataset.pixel_array.astype(np.float32)
        hu = pixels * float(dataset.RescaleSlope) + float(dataset.RescaleIntercept)
        slices.append((position, instance, hu, dataset))

    slices.sort(key=lambda item: item[0], reverse=True)
    first = slices[0][3]
    source_rows = int(first.Rows)
    source_columns = int(first.Columns)
    source_spacing = [float(value) for value in first.PixelSpacing]
    z_positions = [item[0] for item in slices]
    slice_spacing = abs(z_positions[1] - z_positions[0]) if len(z_positions) > 1 else float(first.SliceThickness)

    volume = np.empty((len(slices), args.size, args.size), dtype="<i2")
    for index, (_, _, hu, _) in enumerate(slices):
        resized = Image.fromarray(hu, mode="F").resize((args.size, args.size), Image.Resampling.BILINEAR)
        volume[index] = np.rint(np.asarray(resized)).clip(-32768, 32767).astype("<i2")

    args.output_bin.parent.mkdir(parents=True, exist_ok=True)
    volume.tofile(args.output_bin)

    metadata = {
        "width": args.size,
        "height": args.size,
        "depth": len(slices),
        "pixelSpacingMm": [
            source_spacing[0] * source_rows / args.size,
            source_spacing[1] * source_columns / args.size,
        ],
        "sliceSpacingMm": slice_spacing,
        "sourceDimensions": [source_columns, source_rows, len(slices)],
        "sourcePixelSpacingMm": source_spacing,
        "sourceSliceThicknessMm": float(first.SliceThickness),
        "teachingRangeIndices": [
            max(0, min(args.teaching_start, len(slices) - 1)),
            max(0, min(args.teaching_end, len(slices) - 1)),
        ],
        "zRangeMm": [z_positions[0], z_positions[-1]],
        "patientId": str(first.PatientID),
        "studyInstanceUid": str(first.StudyInstanceUID),
        "seriesInstanceUid": str(first.SeriesInstanceUID),
        "sortOrder": "superior-to-inferior",
        "storage": "signed-16-bit-little-endian-hu",
    }
    args.output_json.write_text(json.dumps(metadata, indent=2) + "\n")

    print(f"Wrote {volume.shape} to {args.output_bin} ({args.output_bin.stat().st_size / 1_000_000:.2f} MB)")


if __name__ == "__main__":
    main()
