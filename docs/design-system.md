# Khonsu design system

Status: implemented console redesign in the Samuel follow-up pass, GitHub #35. The entry uses original illustrative celestial art; the loaded console uses genuine backend observations and their actual metadata.

The name is **Khonsu**, with this spelling. The direction is a lunar observatory: cinematic scale, restrained editorial typography, instrument controls, and a stable scientific image display.

## Reference synthesis

The supplied NASA Eyes screenshots contribute concentric instrument geometry, inspectable SPHEREx context, and a tactile time control. Their dense orbit paths, low contrast labels, and continuous simulation clock should not be copied into the observation viewer.

The ORION reference contributes a strong focal image, a condensed headline, sparse navigation, and one dominant command strip. Khonsu uses the telescope or verified infrared observations instead of unrelated astronaut imagery.

The SPACED references contribute oversized cropped forms, empty space, asymmetric editorial composition, and a limited action color. Booking metaphors become sky selection and observation controls, rather than decorative travel widgets.

The Moon Knight reference inspires the sensation of moving through the sky's history. Scientific frames remain tied to actual available observations. Rotating a decorative sky is not a reconstruction of measured positions or ancient SPHEREx data.

## Brand language

- Primary line: **Find what time reveals.**
- Hero line: **The sky remembers.**
- Supporting line: **One sky. Many moments.**
- Product explanation: Explore the changing infrared sky through observations from NASA's SPHEREx mission.
- Guidance: **Pause. Compare. Notice.**

Use evocative headlines with literal supporting text. Describe a marked change as a candidate to investigate. Do not label it Planet X, a discovery, or a confirmed moving source without appropriate evidence.

## Color tokens

| CSS token | Value | Use |
| --- | --- | --- |
| `--space` | `#070B12` | Main background and image surround |
| `--surface` | `#101A2A` | Instrument surfaces |
| `--surface-raised` | `#152134` | Active layered surfaces |
| `--ivory` | `#F1F0E9` | Primary text |
| `--silver` | `#AAB5C7` | Supporting text and quiet labels |
| `--amber` | `#EDB85E` | Main action, active controls, focus |
| `--cyan` | `#79C7E8` | Optional comparison context |
| `--danger` | `#F4AA98` | Actionable error text |
| `--line` | Ivory at 15% opacity | Fine instrument borders |

Scientific image colors are separate from brand colors. Preserve the documented display stretch and any scientific color legend. Decorative overlays must not obscure potential sources.

## Typography

| Role | Family | Rule |
| --- | --- | --- |
| Large headlines | Barlow Condensed, 500 or 600 | Short editorial phrases; tight line height |
| Interface and explanation | Manrope, 400 to 700 | Normal case, readable line length |
| Coordinates and metadata | IBM Plex Mono, 400 or 500 | Units included; tabular alignment |

The scaffold loads these families through a Google Fonts browser stylesheet and has local system fallbacks. It avoids a build-time remote font download. If offline presentation typography matters, bundle the official font assets and their licenses before submission.

Large type should lead the entry experience. Metadata should remain legible in the scientific workspace. Uppercase tracking is reserved for short labels, not paragraphs.

## Geometry and surfaces

- Use a 4 px spacing base with 16, 24, and 32 px working intervals.
- Controls use sharp rectangular corners (0 px radius). Instrument panels use fine rectangular borders.
- Circular geometry belongs to the time dial, optical reticle, instrument rings, and brand mark.
- Use limited depth and quiet backgrounds. Avoid repeated floating rounded cards.
- Reserve a strong amber fill for the main action. Secondary controls use line and text treatments.
- The primary scientific viewport gets the most space. Context controls should open when needed.

The landing entry panel uses equal side insets and a shared centre line for the
brand, time arc and actions. Group brand and action content explicitly; use
consistent gaps instead of independent paragraph margins. Primary labels are
centred and balance naturally when they wrap. Secondary actions share the same
content width. Decorative diagonal arrows are removed from navigation, target
links, references and the resolution lab. Functional directional controls keep
their meaning, and the crescent logo retains its original time path.
On narrow phones, the hero headline scales down to stay within its content column.

The #87 / BYT-57 cleanup was checked at 320, 390, 768, 1024 and 1440 pixels in
both entry and return states, including keyboard navigation and no-JavaScript
layout. [Desktop panel](evidence/landing-alignment/return-desktop.png) and
[mobile actions](evidence/landing-alignment/return-mobile.png) show the result.

## Logo and custom icons

The original vector mark in `apps/web/public/khonsu-mark.svg` combines a crescent, a diagonal time path, and two observation points. It is project-authored and does not reproduce the Marvel character's mark or a NASA insignia.

The frontend's small original icon set uses a 24 px view box, 1.5 px strokes, consistent endpoints, and explicit accessible labels. Icon-only actions must have tooltips or accessible names. A label must remain available for unfamiliar functions.

## Motion

| Motion | Suggested duration | Behavior |
| --- | --- | --- |
| Hover or focus feedback | 120 to 160 ms | Small color or border change |
| Panel or tool changes | 200 to 280 ms | Short, deliberate transition |
| First Explore entry | 3 seconds | Skippable anticipation, loads begin immediately; reduced motion skips it |
| Time handle release | 250 ms spring | Continuous drag settles on a real date; keyboard is immediate |
| Time cursor | Direct manipulation | Follow the pointer without decorative lag |
| Scientific frame | Discrete observation switch | No fabricated intermediate positions |

Avoid an automatic rotating camera in the scientific workspace. Respect `prefers-reduced-motion`. Motion on a control must not move scientific image pixels after the user releases it.

## Responsive and accessible behavior

- Desktop: observation viewport with a narrow coordinate and evidence panel.
- Tablet: stack the viewer over the supporting controls.
- Mobile: retain the image, actual date, and time control first; advanced panels can become a bottom sheet later.
- Main interactive targets should be at least about 44 px.
- Include visible keyboard focus, real labels, a skip link, and clear empty/error/loading states.
- Support previous/next observation controls without requiring a gesture.
- Marking must gain an accessible keyboard alternative before it is considered complete.
- A disabled control must explain whether data is missing or the feature is still being implemented.

## Weekend priorities

Finish a working real sequence, clear dates and wavelength context, playback, coordinate input, candidate notes, and trustworthy error states first. The curved time control and custom styling are the initial distinctive layer.

An inspectable SPHEREx model, spectral iris, circular epoch comparison lens, and cinematic sky introduction are enhancements. They must not postpone a usable observation explorer.

## Ownership

Robel owns global tokens, shared UI, typography, and page composition. Michael owns viewer motion and transport controls. Aryan owns evidence and annotation interactions. Samuel owns scientific display behavior. Tyrone owns the metadata needed for truthful interface states.


## Implemented entry and mission context

The command strip contains explicit degree/arcminute inputs and a large amber
Explore the sky action. All five presets come from the backend catalog and
populate its documented coordinate values. Saved observations load explicitly
and remain labelled cached-real. The large title collapses once a field opens.

The image, toolbar and time controls share one console width. Display controls
and provenance remain outside science pixels. Main actions retain 44px targets,
keyboard alternatives and visible focus. The optional NASA Eyes section loads
only on request and has its own mission simulation label and close control.
See [assets](assets.md) for original art and the bundled display font license.
