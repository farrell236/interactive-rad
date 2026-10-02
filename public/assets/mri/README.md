# MRI visual assets

## `nih-mri-machine.svg`

- Source: [MRI Machine (NIH BioArt 692 - 782415)](https://commons.wikimedia.org/wiki/File:MRI_Machine_(NIH_BioArt_692_-_782415).svg)
- Creator credit: Courtesy of NIAID / Malcolm Houston
- License: Public domain (work of the United States Government)
- Use in the app: unmodified scanner-context illustration

## `mri-scanner-schematic-labelled.svg`

- Source: [Mri scanner schematic labelled.svg](https://commons.wikimedia.org/wiki/File:Mri_scanner_schematic_labelled.svg)
- Creator credit: ChumpusRex / Chiswick Chap and contributors listed in the Wikimedia Commons file history
- License: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- Use in the app: unmodified hardware-reference illustration

## `mri-brain-t1-axial-11.jpg`

- Source: [MRI Brain T1 Axial (11).jpg](https://commons.wikimedia.org/wiki/File:MRI_Brain_T1_Axial_(11).jpg)
- Creator credit: 511KeV
- License: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Use in the app: unmodified reconstructed-image example in the MRI overview

## `cie-template-t1.png`, `cie-template-pd.png`, `cie-template-t2.png`, and `cie-template-t2star.png`

- Source: [Dadar, Camicioli, and Duchesne, Multi-Sequence Average Templates for Aging and Neurodegenerative Disease Populations](https://doi.org/10.5281/zenodo.5018356), cognitively intact elderly (CIE) cohort
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Modification: the same axial plane was selected from the four co-registered 1 mm templates, intensity-windowed per contrast, cropped identically, and resized to 512 × 512 PNG
- Use in the app: spatially matched T1-, proton-density-, T2-, and T2*-weighted population-average templates in the predefined comparison

## `openbrain-white-matter.png`, `openbrain-gray-matter.png`, and `openbrain-csf-matter.png`

- Source: [OpenBrain v1.0](https://huggingface.co/datasets/openbrain-anon/openbrain_v1_0), reviewer sample case `ds000053__sub-004__ses-DEFAULT__sub-004_T1w`
- License: CC0
- Modification: one axial slice from the CC0 T1-weighted image and algorithmic whole-brain segmentation was converted into soft white-matter, gray-matter, and CSF teaching layers using relative T1 intensity; the layer assignment is illustrative rather than a validated tissue segmentation
- Use in the app: anatomical masks for the live custom spin-echo timing simulation
