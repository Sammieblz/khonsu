---
name: khonsu-viewer-time
description: Implement, debug or review Khonsu sky-image viewer behavior, time playback, zoom, pan, frame selection, overlays, pixel-to-sky interaction and image comparison. Use for viewer feature work that must preserve observation timestamps, coordinate alignment and spectral context.
---

# Khonsu viewer and time

1. Read [viewer-interactions.md](../../../docs/viewer-interactions.md), [science-integrity.md](../../../docs/science-integrity.md) and [integration.md](../../../docs/integration.md). Confirm the viewer props, event callbacks and shared types before editing.
2. Keep viewer implementation inside its owned feature. Accept manifests and annotations through agreed interfaces; emit selection and playback changes through callbacks. Leave page composition, archive requests and annotation persistence to their owners.
3. Order frames by actual observation time and show the current timestamp. Preserve gaps and repeated timestamps honestly. Keep wavelength selection separate from time selection. Label any mission simulation clock separately.
4. Preserve one stable sky transform for aligned frames. Convert pointer locations through that transform; retain frame and grid identity with pixel fallbacks. Keep markers correctly placed through zoom, resize and frame changes. Never align data by cosmetic resizing alone.
5. Honor valid footprints and quality masks. Distinguish unavailable frames from measured darkness. Apply the recorded stretch consistently for comparisons and identify exploratory difference views.
6. Provide play, pause, step and accessible keyboard controls. Stop timers and release image resources on unmount. Respect reduced motion, bound preloading and handle unavailable frame URLs or expired jobs visibly.
7. Verify the behavior using real provenance-bearing examples and separate synthetic controls. Run the viewer checks in [testing.md](../../../docs/testing.md); report known limits instead of claiming scientific validation from a smooth animation.
