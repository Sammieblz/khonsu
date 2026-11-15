# Observation console interactions

Samuel's user-authorized integration pass extends Michael's viewer and Robel's
composition boundaries through GitHub #37 / Linear BYT-38. The existing
`SkyViewerProps` and natural-raster annotation event remain unchanged. The parent
owns the manifest and selected frame; the console owns temporary interaction
state and resets it when sequence identity changes.

## Controls

- Rewind: horizontal image drag selects the nearest real epoch. The arc and
  slider map actual elapsed UTC time; date buttons and arrow keys also select
  repeated timestamps individually. Earliest/latest refer to available visits.
- Pan: drag, wheel or pinch to zoom; arrow keys pan, + and - zoom, 0 fits.
  Zoom is bounded to 1-8x and panning keeps the field reachable. Fit preserves
  the full aspect ratio; zoomed views explicitly identify cropping.
- Mark: click an image pixel, or focus the observation canvas and move the
  keyboard cursor with arrows, then Enter. The transformed canvas rectangle
  maps back to integer natural-raster coordinates. Pixel origin remains top-left.
- Playback: explicit Play/Pause, Previous/Next and rate. Playback waits for the
  selected image to load. It never starts automatically, including reduced motion.
- Comparison: select A/B, blink crisply or hold to show B. Releasing, cancelling
  or losing focus restores the frame held before comparison. View transforms
  remain shared between epochs. Timers stop on blur and sequence replacement.

The SVG time arc and accessible range input provide the same real-date mapping.
Unknown dates use an index fallback and remain labelled unavailable. The display
does not interpolate sources, crossfade observations or alter a celestial WCS.

## Image resources and geometry

Load the current frame, previous/next and selected A/B, deduplicated to at most
five images. Abort obsolete pending loads and prune images outside this set.
Sequence remounts discard all prior state and resources. Missing frames show a
visible retry state; old science pixels cannot appear under a new date.

The image, toolbar and timeline share one console width. Controls and provenance
sit outside the science raster. Original output dimensions and angular field
remain visible. No-data pixels use a distinct slate fill and legend. Optional
intensity controls consume the prepared arrays described in
[browser display](browser-display.md).

## Verification

Pure tests cover irregular/repeated epochs, bounded loading, transformed pixel
selection and pan limits. Browser checks use the authentic cached WISE 0855
sequence, keyboard marking, step controls, A/B hold restoration, blink and
390px layout. Desktop and narrow screenshots are in
[console evidence](evidence/console/controls-desktop.png) and
[mobile evidence](evidence/console/controls-mobile.png).

Annotation notes still use Aryan's local storage component. A natural-raster
selection is not a sky-coordinate evidence export; the wider #14/#15 acceptance
remains tracked separately. Review source quality, spectral compatibility and
unmatched PSFs/backgrounds before interpreting apparent change.
