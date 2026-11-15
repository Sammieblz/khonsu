import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ImageSelection, SequenceContext, SequenceManifest } from "../src/features/explorer/interfaces.ts";
import { createCandidate, sequenceContext } from "../src/features/annotations/records.ts";
import { buildEvidence, EVIDENCE_FORMAT, EVIDENCE_VERSION, evidenceFilename, evidenceJson } from "../src/features/annotations/evidence.ts";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`../../../fixtures/${path}`, import.meta.url), "utf8")) as SequenceManifest;
const cached = fixture("real/real-wise-0855/manifest.json");
const synthetic = fixture("synthetic/sequence-manifest.json");
const CREATED = "2026-11-15T03:00:00.000Z";
const EXPORTED = "2026-11-15T03:30:00.000Z";
const BASE = "https://khonsu.example/";

function mark(manifest: SequenceManifest, x: number, y: number, pixelHasData: boolean | null, frame = 0): ImageSelection {
  return {
    sequenceId: manifest.sequence_id, frameId: manifest.frames[frame]!.frame_id, x, y,
    coordinateSpace: "natural-raster", pixelOrigin: "top-left",
    comparison: { aFrameId: manifest.frames[0]!.frame_id, bFrameId: manifest.frames[manifest.frames.length - 1]!.frame_id }, pixelHasData,
  };
}

// The committed documentation example: the real cached WISE 0855 sequence with
// two clearly labelled marks made only to illustrate the format.
function exampleEvidence() {
  const context = sequenceContext(cached, null, BASE, CREATED);
  const candidates = [
    createCandidate(mark(cached, 59, 59, true), "DOCUMENTATION EXAMPLE: a mark made only to illustrate this format. It is not a reported candidate.", context, "00000000-0000-4000-8000-000000000001", CREATED),
    createCandidate(mark(cached, 4, 0, false), "DOCUMENTATION EXAMPLE: a mark on a masked pixel, showing how a position without valid data is recorded.", context, "00000000-0000-4000-8000-000000000002", CREATED),
  ];
  return { candidates, contexts: { [cached.sequence_id]: context } as Record<string, SequenceContext> };
}

test("the evidence file parses and identifies the exact observations and positions", () => {
  const { candidates, contexts } = exampleEvidence();
  const file = JSON.parse(evidenceJson(buildEvidence(candidates, contexts, EXPORTED)));
  assert.equal(file.format, EVIDENCE_FORMAT);
  assert.equal(file.schema_version, EVIDENCE_VERSION);
  assert.equal(file.exported_at_utc, EXPORTED);
  assert.equal(file.candidate_count, 2);
  assert.equal(file.contains_synthetic_input, false);
  assert.match(file.notice, /not a confirmed detection/);
  assert.match(file.sharing, /never carries notes/);

  const [first, second] = file.candidates;
  assert.equal(first.origin, "human");
  assert.equal(first.review_status, "unreviewed candidate");
  assert.deepEqual(first.position.grid_pixel, { x: 59, y: 59, coordinate_space: "natural-raster", pixel_origin: "top-left", pixel_center_convention: "zero-based-integer-centers" });
  assert.equal(first.position.sky.frame, "ICRS");
  assert.equal(first.position.sky.unit, "deg");
  assert.ok(Math.abs(first.position.sky.ra_deg - 133.75969425462017) < 1e-9);
  assert.ok(Math.abs(first.position.sky.dec_deg - -7.242551669826732) < 1e-9);
  assert.equal(second.position.pixel_has_data, false);

  // The compared epochs are named by frame, observation ID and real start time.
  assert.deepEqual(first.marked_frame, { frame_id: "frame-0001", observation_id: cached.frames[0]!.observation_id, observed_start_utc: cached.frames[0]!.observed_start_utc });
  assert.equal(first.comparison.a.observation_id, cached.frames[0]!.observation_id);
  assert.equal(first.comparison.b.observation_id, cached.frames[2]!.observation_id);
  assert.equal(first.comparison.b.observed_start_utc, cached.frames[2]!.observed_start_utc);
});

test('warning-only marks retain their exclusion and quality state in evidence',()=>{
  const context=sequenceContext(cached,null,BASE,CREATED);
  const point={...mark(cached,4,0,false),pixelQuality:'warning-only' as const};
  const candidate=createCandidate(point,'Quality control, not a detection.',context,'warning-control',CREATED);
  const exported=buildEvidence([candidate],{[cached.sequence_id]:context},EXPORTED);
  assert.equal(exported.candidates[0]!.position.pixel_has_data,false);
  assert.equal(exported.candidates[0]!.position.pixel_quality,'warning-only');
});

test("observation values come from the displayed manifest, not the export time", () => {
  const { candidates, contexts } = exampleEvidence();
  const [sequence] = JSON.parse(evidenceJson(buildEvidence(candidates, contexts, EXPORTED))).sequences;
  assert.equal(sequence.sequence_id, cached.sequence_id);
  assert.equal(sequence.data_mode, "cached-real");
  assert.equal(sequence.synthetic_input, false);
  assert.deepEqual(sequence.target, cached.target);
  assert.deepEqual(sequence.grid, cached.grid);
  assert.deepEqual(sequence.warnings, cached.warnings);
  assert.deepEqual(sequence.processing, cached.processing);
  for (const [index, frame] of cached.frames.entries()) {
    const exported = sequence.frames[index];
    for (const key of ["frame_id", "observation_id", "observed_start_utc", "observed_end_utc", "release", "detector", "wavelength_um", "bandwidth_um", "masked_fraction", "source_fits_url"] as const) {
      assert.deepEqual(exported[key], frame[key], `${frame.frame_id} ${key}`);
    }
    assert.deepEqual(exported.warnings, frame.warnings);
  }
  // The search that reproduces the field, labelled for a cached sequence.
  assert.equal(sequence.query.link, `${BASE}?ra_deg=133.7601213914074&dec_deg=-7.242127941212259&fov_arcmin=6&frame=ICRS`);
  assert.match(sequence.query.note, /new live search/);
});

test("synthetic input, missing snapshots and empty sets are stated, not hidden", () => {
  const syntheticContext = sequenceContext(synthetic, null, BASE, CREATED);
  const fake = createCandidate(mark(synthetic, 10, 10, null), "fixture mark", syntheticContext, "s-1", CREATED);
  const syntheticFile = buildEvidence([fake], { [synthetic.sequence_id]: syntheticContext }, EXPORTED);
  assert.equal(syntheticFile.contains_synthetic_input, true);
  assert.equal(syntheticFile.candidates[0]!.synthetic_input, true);
  assert.equal(syntheticFile.sequences[0]!.query, null);
  assert.equal(syntheticFile.candidates[0]!.position.sky, null);

  const orphan = createCandidate(mark(cached, 1, 1, null), "context lost", null, "o-1", CREATED);
  const orphanFile = buildEvidence([orphan], {}, EXPORTED);
  assert.equal(orphanFile.candidates[0]!.sequence_snapshot_available, false);
  assert.equal(orphanFile.candidates[0]!.synthetic_input, null);
  assert.deepEqual(orphanFile.candidates[0]!.marked_frame, { frame_id: "frame-0001", observation_id: null, observed_start_utc: null });
  assert.deepEqual(orphanFile.sequences, []);

  const empty = JSON.parse(evidenceJson(buildEvidence([], {}, EXPORTED)));
  assert.equal(empty.candidate_count, 0);
  assert.deepEqual(empty.candidates, []);
});

test("Unicode notes survive the file round trip", () => {
  const context = sequenceContext(cached, null, BASE, CREATED);
  const note = "Faint smudge 🌒 near 1.41 µm; ζ-shaped, «unclear» 日本語";
  const candidate = createCandidate(mark(cached, 30, 30, true), note, context, "u-1", CREATED);
  const parsed = JSON.parse(evidenceJson(buildEvidence([candidate], { [cached.sequence_id]: context }, EXPORTED)));
  assert.equal(parsed.candidates[0].note, note);
});

test("file names are predictable and safe", () => {
  const { candidates } = exampleEvidence();
  assert.equal(evidenceFilename([candidates[0]!], EXPORTED), "khonsu-evidence-real-wise-0855-00000000.json");
  assert.equal(evidenceFilename(candidates, EXPORTED), "khonsu-evidence-2-candidates-20261115T033000Z.json");
  const odd = { ...candidates[0]!, id: "../../x", selection: { ...candidates[0]!.selection, sequenceId: "a/b c" } };
  assert.equal(evidenceFilename([odd], EXPORTED), "khonsu-evidence-a-b-c-------x.json");
});

test("the committed example matches what the code exports", () => {
  const path = fileURLToPath(new URL("../../../docs/examples/evidence-example.json", import.meta.url));
  const { candidates, contexts } = exampleEvidence();
  const expected = evidenceJson(buildEvidence(candidates, contexts, EXPORTED));
  if (process.env.UPDATE_EVIDENCE_EXAMPLE === "1") {
    mkdirSync(new URL("../../../docs/examples/", import.meta.url), { recursive: true });
    writeFileSync(path, expected);
  }
  assert.equal(readFileSync(path, "utf8").replace(/\r\n/g, "\n"), expected,
    "Regenerate with UPDATE_EVIDENCE_EXAMPLE=1 npm --prefix apps/web run test, then review the diff.");
});
