---
name: khonsu-discovery-quality
description: Implement or review Khonsu annotations, candidate records, quality indicators, known-source context, validation examples and discovery-related wording. Use for marking features, exporting evidence, evaluating apparent motion or variability, and preventing unsupported scientific claims.
---

# Khonsu discovery and quality

1. Read [science-integrity.md](../../../docs/science-integrity.md), [viewer-interactions.md](../../../docs/viewer-interactions.md) and [integration.md](../../../docs/integration.md). Inspect the current annotation contract and ownership boundary.
2. Receive selections through the viewer's agreed callback. Keep annotation UI and records in their owned feature. Leave pointer-to-sky conversion to the viewer and API persistence to the API owner.
3. Retain source coordinates or qualified pixel positions, frame identity, observation time, provenance, notes and review status. Distinguish human marks from algorithm suggestions and preserve that distinction on export.
4. Label changes and candidates as preliminary. Never promote a visual feature to Planet X, a confirmed planet, an orbit or a calibrated discovery probability without independent supporting validation.
5. Inspect alignment, spectral match, coverage, flags, background and point spread function before interpreting motion or brightness. Distinguish stationary variability from moving sources and account for catalog epoch where relevant.
6. Track the five challenge reference targets with usable bands and epochs, actual results and limitations. Keep real fixtures, synthetic controls and unavailable cases separate. Avoid claiming a pass based only on returned search metadata.
7. Make quality and candidate states readable without relying on color alone. Check annotation stability through zoom, frame changes, missing data and export. Follow [testing.md](../../../docs/testing.md), and keep optional other-mission integrations outside the MVP critical path.
