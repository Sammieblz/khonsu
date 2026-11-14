import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { CandidateAnnotation, ImageSelection, SequenceManifest, SequenceRequest } from "../src/features/explorer/interfaces";
import { captureEvidence, createEvidenceBundle, validComparisonIds } from "../src/features/annotations/model.ts";
import { canSafelyPersistStoredAnnotations, parseStoredAnnotations, serializeAnnotations, MAX_STORAGE_CHARACTERS } from "../src/features/annotations/storage.ts";

const fixture = JSON.parse(readFileSync(new URL("../../../fixtures/synthetic/sequence-manifest.json", import.meta.url), "utf8")) as SequenceManifest;
const selection: ImageSelection = {
  sequenceId: fixture.sequence_id,
  frameId: "synthetic-01",
  x: 127, y: 127,
  coordinateSpace: "natural-raster",
  pixelOrigin: "top-left",
};
const query: SequenceRequest = { ra_deg: 0, dec_deg: 0, coordinate_frame: "ICRS", fov_arcmin: 6, max_frames: 24 };
const when = "2026-11-14T10:00:00Z";
const candidate: CandidateAnnotation = {
  id: "candidate-1", selection, note: "Preliminary point for checking.", createdAt: when,
};
function manifestCopy(): SequenceManifest {
  return JSON.parse(JSON.stringify(fixture)) as SequenceManifest;
}

test("capture snapshots query, display settings and source manifest without retaining mutable references", () => {
  const manifest = manifestCopy();
  const request = { ...query };
  const evidence = captureEvidence(selection, { manifest, query: request, comparisonFrameIds: ["synthetic-01", "synthetic-03"] }, when);
  manifest.display.vmax = 99;
  manifest.frames[0]!.label = "changed";
  request.ra_deg = 99;
  assert.equal(evidence.query?.ra_deg, 0);
  assert.equal(evidence.manifest.display.vmax, 1);
  assert.equal(evidence.manifest.frames[0]?.label, "Synthetic frame 1");
  assert.equal(evidence.origin, "human");
  assert.equal(evidence.reviewStatus, "unreviewed");
  assert.equal(evidence.skyPosition, null);
});

test("selection from another sequence or beyond the natural raster cannot acquire false provenance", () => {
  const context = { manifest: fixture, query };
  for (const point of [
    { ...selection, sequenceId: "other" },
    { ...selection, frameId: "missing" },
    { ...selection, x: -1 },
    { ...selection, x: fixture.grid.width_px },
    { ...selection, y: NaN },
  ]) assert.throws(() => captureEvidence(point, context, when), /does not belong/);
});

test("evidence keeps a tested celestial position when an output TAN WCS exists", () => {
  const manifest = manifestCopy();
  manifest.grid.wcs_header = {
    CTYPE1: "RA---TAN", CTYPE2: "DEC--TAN", CRPIX1: 128, CRPIX2: 128,
    CRVAL1: 130, CRVAL2: -7, CDELT1: -.001, CDELT2: .001,
    CUNIT1: "deg", CUNIT2: "deg", RADESYS: "ICRS",
  };
  manifest.grid.raster_to_wcs = "identity";
  const evidence = captureEvidence(selection, { manifest, query }, when);
  assert.ok(evidence.skyPosition);
  assert.ok(Math.abs(evidence.skyPosition.raDeg - 130) < 1e-7);
  assert.ok(Math.abs(evidence.skyPosition.decDeg + 7) < 1e-7);
});

test("comparison export never retains duplicate or unknown frame references", () => {
  assert.deepEqual(validComparisonIds(fixture, ["missing", "synthetic-02", "synthetic-02", "synthetic-01", "synthetic-03"]), ["synthetic-02", "synthetic-01"]);
});

test("one-candidate and all-candidate exports preserve synthetic disclosure and observation metadata", () => {
  const evidence = captureEvidence(selection, { manifest: fixture, query }, when);
  const marked = { ...candidate, evidence };
  const bundle = createEvidenceBundle([marked, { ...candidate, id: "other", selection: { ...selection, sequenceId: "another" } }],
    { manifest: fixture, query, comparisonFrameIds: ["synthetic-02", "synthetic-03"] }, when);
  assert.equal(bundle.candidates.length, 1);
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.dataMode, "synthetic");
  assert.equal(bundle.manifest.disclosure, fixture.disclosure);
  assert.equal(bundle.manifest.grid.pixel_center_convention, "zero-based-integer-centers");
  assert.deepEqual(bundle.query, query);
  assert.deepEqual(bundle.comparisonFrameIds, ["synthetic-02", "synthetic-03"]);
  assert.ok(bundle.disclaimer.includes("preliminary"));
  assert.ok(bundle.limitations.some(line => line.includes("SYNTHETIC DEVELOPMENT DATA")));
});

test("legacy notes cannot silently gain capture-time metadata on export", () => {
  const bundle = createEvidenceBundle([candidate], { manifest: fixture, query: null }, when);
  assert.equal(bundle.candidates[0]?.evidence, undefined);
  assert.ok(bundle.limitations.some(line => line.includes("legacy notes")));
  assert.ok(bundle.limitations.some(line => line.includes("original live query is unavailable")));
});

test("versioned storage round-trips provenance and rejects a mismatched snapshot without dropping other notes", () => {
  const marked = { ...candidate, evidence: captureEvidence(selection, { manifest: fixture, query }, when) };
  const corrupted = JSON.parse(JSON.stringify(marked));
  corrupted.id = "candidate-2";
  corrupted.evidence.manifest.sequence_id = "unrelated";
  const raw = JSON.stringify({ schemaVersion: 2, annotations: [marked, corrupted] });
  assert.deepEqual(parseStoredAnnotations(raw), [marked]);
  assert.deepEqual(parseStoredAnnotations(serializeAnnotations([marked])), [marked]);
  assert.deepEqual(parseStoredAnnotations(JSON.stringify({ schemaVersion: 99, annotations: [marked] })), []);
});

test("duplicate identities, nonfinite positions and oversized storage do not restore unsafe notes", () => {
  assert.deepEqual(parseStoredAnnotations(JSON.stringify([candidate, candidate])), [candidate]);
  const corrupted = { ...candidate, evidence: captureEvidence(selection, { manifest: fixture, query }, when) };
  corrupted.evidence.skyPosition = { raDeg: Infinity, decDeg: 0, coordinateFrame: "ICRS" };
  assert.deepEqual(parseStoredAnnotations(JSON.stringify([corrupted])), []);
  assert.deepEqual(parseStoredAnnotations(" ".repeat(MAX_STORAGE_CHARACTERS + 1)), []);
});

test("corrupt or future storage formats are preserved instead of being overwritten with an empty document", () => {
  assert.equal(canSafelyPersistStoredAnnotations(null, []), true);
  assert.equal(canSafelyPersistStoredAnnotations(serializeAnnotations([]), []), true);
  assert.equal(canSafelyPersistStoredAnnotations("bad json", []), false);
  assert.equal(canSafelyPersistStoredAnnotations(JSON.stringify({ schemaVersion: 99, annotations: [] }), []), false);
  const partial = JSON.stringify([candidate, { note: "not recoverable" }]);
  assert.equal(canSafelyPersistStoredAnnotations(partial, parseStoredAnnotations(partial)), false);
});

test("restoring more legacy notes than the new addition limit never silently deletes older notes", () => {
  const notes = Array.from({ length: 101 }, (_, index) => ({ ...candidate, id: "candidate-" + index }));
  assert.equal(parseStoredAnnotations(JSON.stringify(notes)).length, 101);
  assert.equal(canSafelyPersistStoredAnnotations(JSON.stringify(notes), notes), true);
});

test("exporting a live sequence retains source URLs and measured wavelength metadata", () => {
  const manifest = manifestCopy();
  manifest.data_mode = "live";
  manifest.disclosure = "Real archive observations with limitations.";
  manifest.frames = manifest.frames.map((frame, index) => ({
    ...frame, observed_start_utc: "2026-01-0" + (index + 1) + "T00:00:00Z",
    observed_end_utc: "2026-01-0" + (index + 1) + "T00:00:10Z",
    source_fits_url: "https://irsa.ipac.caltech.edu/data/observation-" + index + ".fits",
    wavelength_um: 2.1, bandwidth_um: .04, detector: 3, release: "DR1",
    observation_id: "observation-" + index, masked_fraction: .01,
  }));
  manifest.grid.wcs_header = {
    CTYPE1: "RA---TAN", CTYPE2: "DEC--TAN", CRPIX1: 128, CRPIX2: 128,
    CRVAL1: 130, CRVAL2: -7, CDELT1: -.001, CDELT2: .001,
  };
  manifest.grid.raster_to_wcs = "identity";
  const marked = { ...candidate, evidence: captureEvidence(selection, { manifest, query }, when) };
  assert.equal(parseStoredAnnotations(serializeAnnotations([marked])).length, 1);
  const bundle = createEvidenceBundle([marked], { manifest, query }, when);
  assert.equal(bundle.manifest.frames[0]?.source_fits_url, "https://irsa.ipac.caltech.edu/data/observation-0.fits");
  assert.equal(bundle.manifest.frames[0]?.wavelength_um, 2.1);
  assert.equal(bundle.candidates[0]?.evidence?.skyPosition?.raDeg, 130);
  assert.ok(!bundle.limitations.some(line => line.includes("SYNTHETIC DEVELOPMENT DATA")));
});
