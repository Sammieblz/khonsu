#!/usr/bin/env python3
"""Query five real target fields and optionally preserve one processed example.

Run from the repository: python scripts/probe-spherex.py --output fixtures/real
--report docs/target-coverage.json --max-frames 8. Network failures remain errors,
never synthetic coverage. This is an opt-in live integration check.
"""

from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.interfaces import ProcessingOptions
from app.limits import MAX_CUTOUT_ARCMIN, MAX_DOWNLOAD_BYTES, MAX_FITS_BYTES
from app.retrieval.presets import PRESETS
from app.retrieval.service import IrsaRetriever, RetrievalError
from app.schemas import SequenceRequest


HISTORICAL_VALIDATION = """
# Earlier probe evidence

Verified live probe: November 14, 2026, starting at 09:42:14 UTC. The [GitHub Actions job](https://github.com/Sammieblz/khonsu/actions/runs/43581772359/job/132407826811) completed successfully using commit `b5642120c8baab90701a029176ec6e2023692ba9`. Its `real-observation-probe` artifact contains the report and processed R Draconis field. That historical artifact preserves the earlier machine-readable report. The current [machine-readable report](target-coverage.json) contains the later complete five-target run described above and is not a copy of the earlier artifact.

All five searches returned real archive metadata. One bounded processing attempt produced two comparable real field frames. Both R Draconis target pixels were masked, so this is a field-playback demonstration and does not establish a measurement, detection, motion or variability of R Draconis itself. No Planet X discovery or target-recovery claim follows from these results.

The probe used `--max-frames 8`, a 6-arcminute field and 256-pixel output. Counts below include all returned detector footprints, while each processing attempt selected at most eight exposures from one detector. A failed bounded sample does not establish that the archive lacks usable observations elsewhere in the returned set.

| Target | ICRS search RA, Dec (degrees) | Real metadata rows | Processing outcome |
| --- | --- | --- | --- |
| Barnard's Star | 269.4462685, 4.7682045 | 358, DR1/QR3 | No qualifying two-epoch spectral group in the bounded sample. |
| Epsilon Indi B | 331.0986113, -56.8008041 | 458, DR1/QR3 | Metadata search succeeded; the later retrieval failed with `archive_unavailable`. |
| WISE 0855 | 133.7601214, -7.2421279 | 258, DR1 | No qualifying two-epoch spectral group in the bounded sample. |
| R Draconis | 248.1672331, 66.7550238 | 539, DR1/QR3 | Two comparable field frames rendered; target pixels masked in both. |
| RW Aurigae | 76.9565866, 30.4012913 | 335, DR1/QR3 | Metadata verified; processing not attempted after the example was saved. |

## Verified real field example

Sequence `real-r-draconis` uses detector 1 and a common north-up, east-left ICRS TAN grid with one fixed asinh stretch.

| Exposure start, UTC | Release | Wavelength at target | Masked field pixels | Target quality |
| --- | --- | --- | --- | --- |
| 2025-10-18 21:42:15.753600 | DR1 | 0.75905463 micrometers | 17.69% | `TARGET_MASKED` |
| 2026-07-11 08:58:46.560000 | QR3 | 0.76235266 micrometers | 25.47% | `TARGET_MASKED` |

These masked fractions were measured with display pipeline 0.2.0, which used a field-width cutout and spread each masked pixel into its neighbours. Pipeline 0.3.0 masks far less; see [display rendering](display-rendering.md).

The wavelength-center difference is about 0.00329803 micrometers, below this group's 0.00446936-micrometer tolerance. Matching uses the approximate WCS-WAVE lookup at the requested position, with a maximum center spread of one quarter of the smallest bandwidth. It does not establish identical spectral responses throughout the field.

The processor retained source metadata, quality masks and a shared celestial grid. Backgrounds and point-spread functions were not matched, and resampling uncertainty was not propagated. The emitted manifest explicitly records those limits and both `TARGET_MASKED` warnings. The measured outcome is successful retrieval and rendering of a real field sequence, with target-source validation still open.


"""

REFERENCE_NOTES = f"""
## Coordinate references

| Target | Coordinate reference | Search context |
| --- | --- | --- |
| Barnard's Star | [SIMBAD ICRS J2000 position and Gaia proper motion](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Barnard%27s+Star) | Approximately 10.36 arcseconds/year northward; the reference position is propagated before this search. |
| Epsilon Indi B | [Discovery paper Table 1](https://arxiv.org/pdf/astro-ph/0212487) | J2000 equatorial Ks position measured at epoch 1999.855, propagated with the paper's proper motion. This is the B brown dwarf pair, not primary A. |
| WISE 0855 | [Luhman 2014 Tables 1 and 2](https://arxiv.org/pdf/1404.6501) | J2000 equatorial Spitzer position at MJD 56677.3, propagated with the discovery paper's proper motion. Faintness and blending can prevent detection despite coverage. |
| R Draconis | [SIMBAD ICRS J2000 position](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=R+Dra) | Long-period variable field; masked target pixels prevent a source measurement in this example. |
| RW Aurigae | [SIMBAD ICRS J2000 position](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=RW+Aur) | Young variable-star field; metadata coverage alone does not establish source variability. |

`apps/api/app/retrieval/presets.py` contains the exact source coordinates, measurement epochs, proper motions and approximate J2026 field centres. Linear propagation divides RA proper motion by cosine declination because the catalogue quantity is mu-alpha-star. It omits parallax, perspective acceleration and binary orbital motion, and must not be described as a precision ephemeris.

## Discovery and cutout policy

The [official introductory notebook](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/) queries the IRSA SIA service with `collection=['spherex_dr1','spherex_qr3']`. The [current access guide](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/) confirms those compatible releases. The [SIA service guide](https://irsa.ipac.caltech.edu/ibe/sia.html) defines `POS` in ICRS degrees, `TIME` in MJD, `BAND` in metres and `RESPONSEFORMAT=CSV`.

Khonsu searches a one-arcsecond cone at the supplied field centre, selects the most populated detector when none was requested, and samples actual exposures across the available time span. It appends the documented `center` and `size` parameters to approved IRSA FITS URLs. Size is 1.5 times the square field width in degrees, capped at {MAX_CUTOUT_ARCMIN:g} arcminutes and never below the field width, so the detector-aligned cutout covers the corners of the north-up field (see [display rendering](display-rendering.md)). A detector footprint can cover the centre without covering the whole field; processing masks uncovered pixels.

The returned fields `obs_id`, `t_min`, `t_max`, `energy_bandpassname` and `access_url` supply provenance. FITS processing dates are not exposure dates. SIA image-level wavelength overlap is not proof of a comparable wavelength at the target. The processor checks the target's WCS-WAVE wavelength and bandwidth, flags, finite values and coverage as described by the [official data-products guide](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/).

Metadata is capped at 5,000 rows and 8 MiB. FITS responses are capped at {MAX_FITS_BYTES // 1024**2} MiB each and {MAX_DOWNLOAD_BYTES // 1024**2} MiB per sequence. Requests have finite timeouts, a total retrieval deadline and cancellation checks between reads. Transient failures are retried with capped 1, 2, 4 and 8 second backoff: at most five attempts for the metadata query and three per FITS cutout. IRSA's `Retry-After` header (observed as 5 seconds) is honoured up to 15 seconds, and no wait crosses the deadline. A cutout that stays busy or unusable is skipped; the job continues with the remaining real observations and the manifest carries an `ARCHIVE_DOWNLOADS_SKIPPED` warning with the count. If fewer than two cutouts download, the job reports `archive_busy` (HTTP 429 or 503) or `archive_unavailable` rather than an epoch shortage. The earlier 09:42 UTC probe recorded above ran with the three-attempt, no-skip policy. The current complete five-target run uses the bounded parallel-download and skip policy described here. Downloads and redirects allow only HTTPS `irsa.ipac.caltech.edu/ibe/data/spherex/{{dr1,qr3}}/level2/...fits` paths. An overflow asks the user to narrow the date range; it is not silently reported as complete coverage.

### Download speed (BYT-35)

Cutouts download four at a time (`DOWNLOAD_CONCURRENCY`) instead of one by one. Each cutout's time is dominated by archive latency, not size. Downloads start in widest-gap order across the sampled time span (first, last, middle, then quarters), and results return in chronological order. The 256 MiB sequence cap counts bytes as they stream, so parallel downloads cannot exceed it together, and a failed attempt gives its bytes back. A fatal error (cancellation, deadline or size limit) interrupts the other downloads.

After each file arrives, the job manager applies processing's own target-wavelength lookup and grouping rule. Once four distinct comparable epochs (or `max_frames`, if smaller) are present, no new downloads start. Files already in flight are kept, and the manifest carries an `ARCHIVE_SEARCH_STOPPED_EARLY` warning with the number not fetched. Processing still makes the final selection. The job reports "Downloaded k of n IRSA observations" as files arrive, and the manifest records `archive_busy_responses`.

Measured on November 14, 2026, for the north ecliptic pole (RA 270.0, Dec +66.5607, 6 arcmin, 16 frames):

| Policy | Total | Busy replies |
| --- | --- | --- |
| One at a time | 198 s (191 s downloading, 1.4 s processing) | 4 retry waits |
| Four at a time, three runs | 62.6, 63.5 and 62.6 s | 0, 1 and 4 |

All runs selected the same two exposures. The early stop did not trigger, because this field yields only two comparable epochs out of 16. Through the full app the search was ready in 85 s, down from 210 s.

IRSA's SIA `BAND` filter matches each image's whole detector band, not the wavelength at the target. A 3.919 to 3.923 micrometre filter at this position still returned all 336 detector-5 images. Matching exposures therefore cannot be chosen before download from the SIA query alone. Predicting the target wavelength from image footprints and the fixed per-detector filter layout remains a possible follow-up.

Re-run the complete validation with `python scripts/probe-spherex.py --output .cache/validated-fields --report docs/target-coverage.json --max-frames 16 --max-seconds 900 --target-max-seconds 180`. The global time budget now reaches scientific processing through its cancellation callback, including time already spent querying and downloading. Cancellation is cooperative between processing operations; it does not forcibly terminate a running native-library call. This deadline wiring was added after the recorded probe and does not change its measured results.

No preset promises visible motion, brightness variation, a brown dwarf detection, or a Planet X candidate. Keep WISE, Gaia DR3 and NEOSSat as future contextual integrations unless their real retrieval, registration and provenance have been implemented.

"""


def write_report(report: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# Target coverage", "",
        f"Live probe started: {report['checked_at_utc']}. Finished: {report.get('finished_at_utc', 'in progress')}. Collections: SPHEREx DR1 and QR3.", "",
        "Every named challenge field receives a bounded attempt. An upstream failure is not a statement that the archive lacks coverage. A successful field sequence is not a recovered target detection, motion measurement, variability measurement or Planet X discovery.", "",
        "Search positions are approximate J2026 ICRS field centres propagated from cited measurements. Parallax, perspective acceleration and binary orbits are omitted. Reference coordinates, measurement epochs, proper motions and query parameters are preserved in the JSON report.", "",
        "| Target | ICRS RA, Dec (degrees) | Archive footprints | Outcome | Usable field frames |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in report["targets"]:
        count = row.get("observation_count", "Query failed")
        lines.append(f"| {row['label']} | {row['ra_deg']:.7f}, {row['dec_deg']:.7f} | {count} | {row['processing_status']} | {row['usable_frame_count']} |")
    lines.extend(["", "## Demonstration selection", "",
        f"Primary field: `{report.get('primary_preset_id')}`. Backup field: `{report.get('backup_preset_id')}`. Cached example sequence: `{report.get('example_sequence_id')}`.", "",
        "Selection prefers sequences with no TARGET_MASKED warning, then a larger number of comparable real epochs, with preset ID as a deterministic tie break. An unmasked nearest target pixel still does not establish source identification or detection, particularly for faint WISE 0855 or unresolved Epsilon Indi Ba/Bb.", "",
        "The report's complete canonical manifests preserve output WCS, original dates, source URLs, release, detector, approximate target wavelength and bandwidth, fixed stretch, masks and processing versions. Each downloaded cutout also has its SHA-256 and byte size recorded. Large original FITS files are temporary; small reproducible cached bundles are delivered separately by issue #9.", ""])
    for row in report["targets"]:
        lines.extend([f"## {row['label']}", "",
                      f"Checked: {row['checked_at_utc']}. Status: `{row['status']}`. {row['science_note']}", ""])
        if row.get("diagnostic_counts"):
            lines.extend([f"Astropy diagnostic counts: {row['diagnostic_counts']}. See processing limits below.", ""])
        if row.get("error"):
            lines.extend([f"Recorded failure: `{row.get('error_code')}`. {row['error']}", ""])
        if row.get("manifest"):
            manifest = row["manifest"]
            lines.extend([f"Sequence `{manifest['sequence_id']}`, pipeline `{manifest['processing'].get('pipeline_version')}`, common {manifest['grid']['width_px']} x {manifest['grid']['height_px']} north-up/east-left ICRS grid, {manifest['requested_fov_arcmin']} arcminute field.", "",
                          "| Observation ID | Exposure start UTC | Release | Wavelength at target (micrometers) | Masked field | Target quality |",
                          "| --- | --- | --- | --- | --- | --- |"])
            for frame in manifest["frames"]:
                quality = ", ".join(w["code"] for w in frame["warnings"]) or "No target-pixel warning; not a detection claim"
                lines.append(f"| `{frame['observation_id']}` | {frame['observed_start_utc']} | {frame['release']} | {frame['wavelength_um']:.8f} | {100 * frame['masked_fraction']:.3f}% | {quality} |")
            lines.append("")
    lines.extend(["## Processing and interpretation limits", "",
        "One detector is selected per bounded sample. The full comparison group must have target-wavelength center spread no larger than one quarter of its smallest bandwidth. SIA BAND overlaps a whole image and cannot replace this target-position check. WCS-WAVE wavelengths are approximate visualization values, not calibrated spectrophotometry.", "",
        f"The retrieval cutout is 1.5 times the displayed field width, capped at {MAX_CUTOUT_ARCMIN:g} arcminutes and never narrower than the requested field. Validity-weighted reprojection preserves bad-pixel locations and coverage masks. A common sky-referenced asinh stretch is used across a sequence. No PSF/background matching, resampling uncertainty propagation, inpainting, stacked epochs or interpolated observation times are claimed.", "",
        "SIP convention diagnostics, when emitted, are recorded in the JSON report. The existing reader explicitly clears SIP on its alternate spectral WCS before wavelength lookup, while retaining the supplied celestial WCS. No header correction or precision astrometric validation is claimed here; stationary-source and external-catalog validation remain separate from field playback.", "",
        "The global probe budget is shared fairly across remaining targets, with an additional per-target cap. Metadata, per-file downloads, combined bytes, retry waits and processing cancellation remain bounded. A missing second comparable epoch is distinct from an archive timeout or malformed response.", "",
        "## Reproduction", "",
        "```sh", "python scripts/probe-spherex.py --output .cache/validated-fields --report docs/target-coverage.json --max-frames 16 --max-seconds 900 --target-max-seconds 180", "```", "",
        "Exact API request parameters and acquisition UTC timestamps for each target are in the JSON report. Repeating a bounded sample later can return different archive data; compare source IDs and hashes before interpreting differences.", "",
        "## Diagnostic record", "",
        json.dumps(report.get("diagnostics", []), indent=2), "",
        "## Independent reproduction", "",
        json.dumps(report.get("independent_reproduction", {}), indent=2), "",
        f"Processing provenance: `{report.get('processing_source_revision', 'not recorded')}`. {report.get('source_revision_scope', 'No immutable processing revision recorded.')} {report.get('probe_execution_context', '')}", "",
        HISTORICAL_VALIDATION, "", REFERENCE_NOTES,
    ])
    path.with_suffix(".md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


async def run(args) -> int:
    """Give every target a bounded attempt; a first success never ends the survey."""
    from app.processing.errors import ProcessingError
    from app.processing.service import AstronomyProcessor
    from app.schemas import SequenceManifest

    started = time.monotonic()
    deadline = started + args.max_seconds
    report = {
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "collections": ["spherex_dr1", "spherex_qr3"],
        "position_epoch_jyear": 2026.0,
        "metadata_is_detection": False,
        "probe": {"max_seconds": args.max_seconds, "target_max_seconds": args.target_max_seconds,
                  "max_frames": args.max_frames, "fov_arcmin": args.fov_arcmin,
                  "output_size_px": args.output_size},
        "targets": [], "example_sequence_id": None, "diagnostics": [],
    }
    class CaptureDiagnostics(logging.Handler):
        def emit(self, record):
            if "inconsistent sip distortion" in record.getMessage().lower():
                count = entry.setdefault("diagnostic_counts", {})
                count["ASTROPY_SIP_CONVENTION"] = count.get("ASTROPY_SIP_CONVENTION", 0) + 1

    diagnostic_handler = CaptureDiagnostics()
    logging.getLogger("astropy").addHandler(diagnostic_handler)
    presets = list(PRESETS.items())
    for index, (preset_id, preset) in enumerate(presets):
        target_started = time.monotonic()
        # Reserve an equal opportunity for targets that have not been attempted.
        allowance = min(args.target_max_seconds, max(0, deadline - target_started) / (len(presets) - index))
        target_deadline = target_started + allowance
        entry = {"preset_id": preset_id, **preset,
                 "checked_at_utc": datetime.now(timezone.utc).isoformat(),
                 "status": "failure", "processing_status": "Not started",
                 "usable_frame_count": 0, "time_budget_seconds": allowance}
        report["targets"].append(entry)
        request = SequenceRequest(ra_deg=preset["ra_deg"], dec_deg=preset["dec_deg"],
                                  fov_arcmin=args.fov_arcmin, max_frames=args.max_frames)
        entry["query"] = request.model_dump(mode="json")
        sequence_id = "real-" + preset_id
        destination = args.output / sequence_id

        def cancelled():
            return time.monotonic() >= target_deadline

        try:
            if allowance < 5:
                raise TimeoutError("Global probe budget exhausted before this target could be queried")
            rows = await IrsaRetriever(timeout_seconds=15, deadline_seconds=min(25, allowance)).search(request)
            entry.update({"observation_count": len(rows),
                          "detector_counts": dict(Counter(str(row.detector) for row in rows)),
                          "releases": sorted({row.release for row in rows}),
                          "first_exposure_utc": rows[0].observed_start_utc.isoformat() if rows else None,
                          "last_exposure_utc": rows[-1].observed_start_utc.isoformat() if rows else None})
            print(f"{preset_id}: {len(rows)} real metadata rows", flush=True)
            if len(rows) < 2:
                entry.update(status="insufficient_coverage", processing_status="Fewer than two archive exposures")
            elif args.metadata_only:
                entry.update(status="metadata_only", processing_status="Metadata only; no science validation claimed")
            else:
                remaining = target_deadline - time.monotonic()
                if remaining < 5:
                    raise TimeoutError("Target budget exhausted after metadata query")
                with tempfile.TemporaryDirectory(prefix="khonsu-probe-") as tmp:
                    retriever = IrsaRetriever(timeout_seconds=20, deadline_seconds=remaining, cancelled=cancelled)
                    observations = await retriever.retrieve(request, Path(tmp))
                    entry["downloaded_sources"] = [{
                        "observation_id": item.observation_id, "detector": item.detector,
                        "release": item.release, "observed_start_utc": item.observed_start_utc.isoformat(),
                        "observed_end_utc": item.observed_end_utc.isoformat(),
                        "source_fits_url": item.source_fits_url,
                        "sha256": hashlib.sha256(item.fits_path.read_bytes()).hexdigest(),
                        "bytes": item.fits_path.stat().st_size,
                    } for item in observations]
                    options = ProcessingOptions(sequence_id, request.ra_deg, request.dec_deg,
                                                request.fov_arcmin, output_size_px=args.output_size)
                    manifest = await asyncio.to_thread(AstronomyProcessor().process, observations,
                                                       options, destination, cancelled=cancelled)
                payload = manifest.model_dump(mode="json")
                payload.update(data_mode="cached-real", title=f"{entry['label']}: real SPHEREx field observations",
                               disclosure="Cached real SPHEREx observations from IRSA. Original epochs, common WCS, masks and approximate wavelength matching are preserved. Field playback does not establish target detection, motion or variability.")
                for frame in payload["frames"]:
                    filename = frame["image_url"].rsplit("/", 1)[-1]
                    frame["image_url"] = f"/v1/examples/{sequence_id}/frames/{filename}"
                SequenceManifest.model_validate(payload)
                (destination / "manifest.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
                entry.update(status="success", processing_status=f"Ready: {len(payload['frames'])} comparable field frames",
                             usable_frame_count=len(payload["frames"]), example_sequence_id=sequence_id,
                             processing_timestamp_utc=datetime.now(timezone.utc).isoformat(), manifest=payload)
                print(f"Saved genuine example: {destination} ({len(payload['frames'])} frames)", flush=True)
        except Exception as exc:
            code = getattr(exc, "code", type(exc).__name__)
            insufficient = isinstance(exc, ProcessingError) and code in {
                "INSUFFICIENT_COMPARABLE_EPOCHS", "INSUFFICIENT_EPOCHS", "NO_USABLE_COVERAGE"}
            entry.update(status="insufficient_coverage" if insufficient else "failure",
                         error_code=code, error=str(exc)[:500],
                         processing_status=f"{'Insufficient bounded sample' if insufficient else 'Failed'}: {code}")
            (destination / "manifest.json").unlink(missing_ok=True)
            print(f"{preset_id}: {entry['processing_status']}: {str(exc)[:300]}", flush=True)
        entry["elapsed_seconds"] = round(time.monotonic() - target_started, 3)
        # All partial results are checkpointed, including upstream errors.
        successes = [row for row in report["targets"] if row["status"] == "success"]
        successes.sort(key=lambda row: (
            any(warning["code"] == "TARGET_MASKED" for frame in row["manifest"]["frames"] for warning in frame["warnings"]),
            -row["usable_frame_count"], row["preset_id"]))
        report["example_sequence_id"] = successes[0]["example_sequence_id"] if successes else None
        report["primary_preset_id"] = successes[0]["preset_id"] if successes else None
        report["backup_preset_id"] = successes[1]["preset_id"] if len(successes) > 1 else None
        write_report(report, args.report)
    logging.getLogger("astropy").removeHandler(diagnostic_handler)
    report["elapsed_seconds"] = round(time.monotonic() - started, 3)
    report["finished_at_utc"] = datetime.now(timezone.utc).isoformat()
    write_report(report, args.report)
    if args.metadata_only:
        return 0 if all("observation_count" in row for row in report["targets"]) else 1
    return 0 if report["example_sequence_id"] else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "fixtures" / "real")
    parser.add_argument("--report", type=Path, default=ROOT / "docs" / "target-coverage.json")
    parser.add_argument("--max-frames", type=int, default=8, choices=range(2, 33), metavar="2..32")
    parser.add_argument("--fov-arcmin", type=float, default=6.0)
    parser.add_argument("--output-size", type=int, default=None, choices=(128, 256, 512), help="Omit to use the native-scale automatic grid")
    parser.add_argument("--max-seconds", type=int, default=480, choices=range(30, 1801), metavar="30..1800", help="Global probe time budget")
    parser.add_argument("--target-max-seconds", type=int, default=240, choices=range(10, 241), metavar="10..240", help="Maximum time per target, shared fairly with remaining targets")
    parser.add_argument("--metadata-only", action="store_true")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
