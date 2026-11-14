---
name: khonsu-scientific-processing
description: Implement, debug or review Khonsu scientific Python processing for SPHEREx FITS, spatial and spectral WCS, alignment, masks, calibration, image rendering, coadds, differences or spectra. Use whenever pixel values or transforms could change scientific interpretation.
---

# Khonsu scientific processing

1. Read [science-integrity.md](../../../docs/science-integrity.md), [data-sources.md](../../../docs/data-sources.md) and [architecture.md](../../../docs/architecture.md). Inspect current processing interfaces and the exact input release before changing array logic.
2. Accept supplied paths or arrays and explicit options. Keep archive fetching, HTTP routing and job orchestration outside processing. Preserve immutable source inputs and return the metadata required by the shared contract.
3. Handle spatial WCS and spectral WCS separately. Respect pixel origins, optical distortion, output-grid identity and valid footprint. Verify pixel-to-sky round trips and known-source registration before comparing visits.
4. Match spectral coverage explicitly. Do not assume the same detector implies the same source wavelength on every visit. Record approximate display wavelength separately from calibrated spectral measurements.
5. Decode flags from the release documentation. Preserve missing, masked and out-of-coverage pixels separately from zeros. Carry variance and processing limitations forward. Use appropriate interpolation for science arrays and masks.
6. Treat background, point spread function, stretch and noise differences as potential false changes. Record performed corrections and do not imply unimplemented photometric calibration, PSF matching or significance estimates.
7. Bound memory, cutout size and frame count. Return renderable assets with time, wavelength, quality and transform provenance. Add scientific regression checks that catch wrong coordinates, mismatched spectra or false motion; follow [testing.md](../../../docs/testing.md).
8. Report actual validation targets and unresolved limits. Keep candidates preliminary and synthetic controls visibly separate from real SPHEREx examples.
