# Viewer interactions and shared seams

Status: implementation guidance for the hackathon. The initial frontend has an honest empty screen, coordinate validation, backend error handling, an isolated viewer, and isolated annotation controls. Real data retrieval, the live job flow, pan/zoom, epoch comparison, and direct sky-drag scrubbing remain follow-up work.

## Module ownership

| Area | Owner |
| --- | --- |
| `apps/web/src/features/explorer/` | Robel |
| `apps/web/src/features/viewer/` | Michael |
| `apps/web/src/features/annotations/` | Aryan |
| `apps/web/src/lib/api/` | Tyrone |

`ExplorerScreen.tsx` composes the modules. It owns the loaded sequence, active frame identifier, and selected point. Annotation collection logic lives in Aryan's hook; it is supplied to both the panel and viewer. Michael owns the frame cache, playback behavior, and eventual viewport transform.

Coordinate changes to `features/explorer/interfaces.ts` before changing component signatures. The public API definitions come from the generated file `lib/api/generated.d.ts`. Generated schemas must not be patched manually by frontend contributors.

## Frontend component contract

`SkyViewer` receives the sequence, active frame identifier, annotation collection, frame-change callback, and selection callback. It does not start archive queries or own the application page.

`AnnotationPanel` receives a selection, annotation collection, add callback, and remove callback. It does not read the image canvas or calculate coordinates from pointer events.

The selection contains:

- Sequence identifier.
- Frame identifier.
- Integer `x` and `y` in the natural output raster.
- `coordinateSpace: "natural-raster"`.
- `pixelOrigin: "top-left"`.

Pixel centers use the backend's zero-based integer convention. A pointer inside the first displayed pixel maps to `(0, 0)`. Sky coordinate conversion must use the output grid's retained World Coordinate System rather than an approximation based on a screenshot.

## Tool modes

| Mode | Primary pointer gesture | Existing alternative |
| --- | --- | --- |
| Time | Planned horizontal scrub through observation ticks | Slider and previous/next buttons |
| Pan | Planned viewport pan; zoom around a stable focal point | To be implemented with labeled reset/zoom controls |
| Mark | Select a pixel location and create a candidate note | Keyboard marking remains required work |

A drag must have one clear meaning. Use an explicit active tool. Do not simultaneously pan and change time in response to the same gesture. On mobile, provide visible controls and support ordinary page scrolling outside the viewer.

## Observation navigation

The initial slider indexes actual manifest frames and never synthesizes intermediate imagery. Its arc is decorative instrument geometry. The initial implementation does not yet communicate irregular time gaps spatially.

The complete timeline should position observation ticks using actual timestamps, clearly mark gaps, and retain a discrete selected frame. The pointer can move continuously; the image changes only when it selects a real frame. Show the actual selected observation date in UTC. For synthetic fixtures, dates remain unknown unless explicitly described as simulated.

Compare compatible wavelength coverage. The detector number alone does not guarantee matched wavelengths. Do not mix releases that the science pipeline marks as incompatible.

Playback and a blink comparison must not silently crossfade or interpolate scientific sources. A decorative star trail or rotation belongs in optional mission context, not in the measured image sequence.

## Frame loading

The initial loader preloads the supplied manifest and reports frame errors. Michael should bound preloading before connecting the maximum-size live sequence. The production viewer needs a small cache around the active frame, cancellation on target changes, and a visible loading state when a selected frame is missing.

Draw grid pixels as crisp blocks and transparent (masked or uncovered) pixels with the documented no-data hatch and key; see [display rendering](display-rendering.md). Never let masked pixels show the page background.

Do not retain images from one sequence under another sequence identifier. Do not display a new date over an old image while loading. Keep the previous complete view visibly labeled or show a loading state.

## Marking and evidence

The initial helper maps the actual displayed canvas rectangle to the natural output raster, excluding surrounding layout. Add the inverse viewport transform when implementing pan and zoom. Scaling the viewer must not change the stored scientific pixel.

Notes are stored in this browser under a versioned key. Malformed entries are ignored. Browser storage is not shared project storage and must not be described as server persistence.

The initial candidate panel supports notes and removal. Export, evidence thumbnails, source metadata, and keyboard selection remain Aryan's implementation work. Candidate evidence should preserve the frame identifier, image location, source provenance, quality warnings, and the observer's uncertainty.

## Backend integration

`NEXT_PUBLIC_API_BASE_URL` defaults to `http://localhost:8000` for local development. It is compiled into a static frontend build. It must point to a publicly reachable backend when deployed.

The initial form calls `POST /v1/sequences`. The current backend explicitly returns `501 LIVE_PROCESSING_NOT_IMPLEMENTED`; the frontend displays that status. It must not silently replace a failed live request with synthetic observations.

The next slice should connect a typed sequence job response, poll the documented status endpoint, fetch the completed manifest, and validate it before replacing the current sequence. Update Python models, exported OpenAPI, generated TypeScript types, and the API client together.

The backend's `/v1/demo/manifest` fixture is synthetic and opt-in. Keep its disclosure visible whenever used. The default scaffold does not load it.

## Acceptance checks for the owners

1. A stationary reference remains in the same output pixel across aligned real frames.
2. Dates match the image actually displayed, including loading and failure states.
3. Unknown dates, wavelengths, and source metadata remain explicitly unknown.
4. Candidate coordinates remain correct after resizing and after the eventual pan/zoom transform.
5. Playback stops at a real boundary and can restart deliberately.
6. The form and backend agree on coordinate and field-size bounds.
7. Empty results and unavailable backend states explain what the user can do next.
8. Every gesture has a keyboard or labeled-button alternative before completion.
9. A narrow screen retains the image, actual date, and usable controls.
10. Reduced motion avoids decorative scene movement without losing functionality.
