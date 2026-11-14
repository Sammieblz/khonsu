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
import json
from pathlib import Path
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.interfaces import ProcessingOptions
from app.retrieval.presets import PRESETS
from app.retrieval.service import IrsaRetriever, RetrievalError
from app.schemas import SequenceRequest


def write_report(report: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# Target coverage", "",
        f"Live probe timestamp: {report['checked_at_utc']}. Collections: SPHEREx DR1 and QR3.", "",
        "These results distinguish archive footprints from usable processed epochs. A footprint does not prove a target detection, variability, motion, or Planet X.", "",
        "Search positions are approximate J2026 ICRS field centres, propagated from cited measurements with linear proper motion. Parallax, perspective acceleration and binary orbits are omitted. See each coordinate note in the JSON report.", "",
        "| Target | RA, Dec (degrees) | Metadata result | Processed example |",
        "| --- | --- | --- | --- |",
    ]
    for row in report["targets"]:
        count = row.get("observation_count")
        result = f"{count} centre-covering exposures" if count is not None else row.get("error", "Not queried")
        processing = row.get("processing_status", "Not attempted")
        lines.append(f"| {row['label']} | {row['ra_deg']:.7f}, {row['dec_deg']:.7f} | {result} | {processing} |")
    lines.extend([
        "", "## Retrieval and scientific limits", "",
        "SIA searches a one-arcsecond cone at the centre, then requests a square FITS cutout of the requested full field width. Partial image edges are masked. One detector is selected, and actual exposures are sampled across the available time span. SIA BAND is an image-level overlap filter; the processor independently checks the wavelength at the target using WCS-WAVE and rejects incomparable epochs.", "",
        "Metadata is capped at 5,000 rows and 8 MiB. Downloads are capped at 48 MiB per FITS file and 256 MiB per sequence, with finite timeouts, three attempts and cancellation checks. Only HTTPS IRSA DR1/QR3 level2 FITS paths are accepted, including redirects. Truncated, unsafe, failed or non-FITS responses produce actionable errors.", "",
        "The probe records empty coverage separately from network errors. Processing requires at least two real, distinct exposure start times in a comparable spectral group. No available fixture means no successful real-data demonstration has been established.", "",
        "## Primary sources", "",
        "- [Official SPHEREx introduction and SIA columns](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/)",
        "- [Official cutout tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/)",
        "- [IRSA SIA service parameters](https://irsa.ipac.caltech.edu/ibe/sia.html)",
        "- [Current SPHEREx data access and release compatibility](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/)",
        "- [SPHEREx FITS products and spectral WCS](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/)",
    ])
    for preset in PRESETS.values():
        lines.append(f"- [{preset['label']} coordinate reference]({preset['source_url']}): {preset['coordinate_note']}")
    path.with_suffix(".md").write_text("\n".join(lines) + "\n", encoding="utf-8")


async def run(args) -> int:
    started = time.monotonic()
    report = {
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "collections": ["spherex_dr1", "spherex_qr3"],
        "position_epoch_jyear": 2026.0,
        "metadata_is_detection": False,
        "targets": [], "example_sequence_id": None,
    }
    candidates = []
    for preset_id, preset in PRESETS.items():
        entry = {"preset_id": preset_id, **preset}
        report["targets"].append(entry)
        request = SequenceRequest(ra_deg=preset["ra_deg"], dec_deg=preset["dec_deg"], fov_arcmin=args.fov_arcmin, max_frames=args.max_frames)
        remaining = args.max_seconds - (time.monotonic() - started)
        if remaining < 5:
            entry["error"] = "Probe time budget exhausted before query"
            continue
        try:
            rows = await IrsaRetriever(timeout_seconds=15, deadline_seconds=min(25, remaining)).search(request)
            entry["observation_count"] = len(rows)
            entry["detector_counts"] = dict(Counter(str(row.detector) for row in rows))
            entry["releases"] = sorted({row.release for row in rows})
            entry["first_exposure_utc"] = rows[0].observed_start_utc.isoformat() if rows else None
            entry["last_exposure_utc"] = rows[-1].observed_start_utc.isoformat() if rows else None
            entry["processing_status"] = "Not attempted" if rows else "No metadata coverage"
            if len(rows) >= 2:
                candidates.append((preset_id, request, entry))
            print(f"{preset_id}: {len(rows)} real metadata rows", flush=True)
        except RetrievalError as exc:
            entry["error_code"] = exc.code
            entry["error"] = exc.message
            print(f"{preset_id}: {exc.code}: {exc.message}", flush=True)
        write_report(report, args.report)
    if args.metadata_only:
        write_report(report, args.report)
        return 0 if all("observation_count" in row for row in report["targets"]) else 1

    from app.processing.service import AstronomyProcessor

    for preset_id, request, entry in candidates:
        remaining = args.max_seconds - (time.monotonic() - started)
        if remaining < 15:
            entry["processing_status"] = "Probe time budget exhausted"
            break
        sequence_id = "real-" + preset_id
        destination = args.output / sequence_id
        try:
            with tempfile.TemporaryDirectory(prefix="khonsu-probe-") as tmp:
                observations = await IrsaRetriever(timeout_seconds=20, deadline_seconds=min(remaining-5, 160)).retrieve(request, Path(tmp))
                options = ProcessingOptions(sequence_id, request.ra_deg, request.dec_deg, request.fov_arcmin, output_size_px=args.output_size)
                manifest = await asyncio.to_thread(AstronomyProcessor().process, observations, options, destination)
                payload = manifest.model_dump(mode="json")
                payload["data_mode"] = "cached-real"
                payload["title"] = f"{entry['label']}: real SPHEREx observations"
                payload["disclosure"] = "Cached real SPHEREx DR1/QR3 cutouts from IRSA, processed with WCS and quality checks. Coverage does not establish target detection, variability, or motion."
                for frame in payload["frames"]:
                    filename = frame["image_url"].rsplit("/", 1)[-1]
                    frame["image_url"] = f"/v1/examples/{sequence_id}/frames/{filename}"
                # Validate the rewritten public contract before saving it.
                from app.schemas import SequenceManifest
                SequenceManifest.model_validate(payload)
                destination.mkdir(parents=True, exist_ok=True)
                (destination / "manifest.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
                entry["processing_status"] = f"Ready: {len(payload['frames'])} comparable frames"
                entry["example_sequence_id"] = sequence_id
                entry["processing_timestamp_utc"] = datetime.now(timezone.utc).isoformat()
                report["example_sequence_id"] = sequence_id
                print(f"Saved genuine example: {destination} ({len(payload['frames'])} frames)", flush=True)
                write_report(report, args.report)
                return 0
        except Exception as exc:
            entry["processing_status"] = f"Failed: {getattr(exc, 'code', type(exc).__name__)}"
            entry["processing_error"] = str(exc)[:500]
            print(f"{preset_id}: processing failed: {entry['processing_status']}: {str(exc)[:300]}", flush=True)
            # Never publish a partially generated scientific manifest.
            (destination / "manifest.json").unlink(missing_ok=True)
            write_report(report, args.report)
    write_report(report, args.report)
    print("No scientifically usable real example was established. See the report.", flush=True)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "fixtures" / "real")
    parser.add_argument("--report", type=Path, default=ROOT / "docs" / "target-coverage.json")
    parser.add_argument("--max-frames", type=int, default=8, choices=range(2, 33), metavar="2..32")
    parser.add_argument("--fov-arcmin", type=float, default=6.0)
    parser.add_argument("--output-size", type=int, default=256, choices=(128, 256, 512))
    parser.add_argument("--max-seconds", type=int, default=240, choices=range(30, 601), metavar="30..600")
    parser.add_argument("--metadata-only", action="store_true")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
