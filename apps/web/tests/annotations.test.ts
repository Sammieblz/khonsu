import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ImageSelection, SequenceManifest } from "../src/features/explorer/interfaces.ts";
import {
  addCandidate, createCandidate, emptyStore, MAX_CANDIDATES, removeCandidate, sequenceContext, updateCandidateNote,
} from "../src/features/annotations/records.ts";
import { loadStore, serializeStore, STORE_VERSION } from "../src/features/annotations/storage.ts";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`../../../fixtures/${path}`, import.meta.url), "utf8")) as SequenceManifest;
const cached = fixture("real/real-wise-0855/manifest.json");
const synthetic = fixture("synthetic/sequence-manifest.json");
const live: SequenceManifest = { ...cached, sequence_id: "live-job-1", data_mode: "live" };
const NOW = "2026-11-15T03:00:00.000Z";
const BASE = "https://khonsu.example/";

function selection(manifest: SequenceManifest, x = 59, y = 59): ImageSelection {
  return {
    sequenceId: manifest.sequence_id, frameId: manifest.frames[1]!.frame_id, x, y,
    coordinateSpace: "natural-raster", pixelOrigin: "top-left",
    comparison: { aFrameId: manifest.frames[0]!.frame_id, bFrameId: manifest.frames[2]!.frame_id }, pixelHasData: true,
  };
}

test("a mark on a real sequence records ICRS degrees and the observation context", () => {
  const context = sequenceContext(live, { ra_deg: 133.7601213914074, dec_deg: -7.242127941212259, fov_arcmin: 6 }, BASE, NOW);
  const candidate = createCandidate(selection(live), "  Faint source near center  ", context, "c-1", NOW);
  assert.equal(candidate.origin, "human");
  assert.equal(candidate.note, "Faint source near center");
  assert.equal(candidate.sky?.frame, "ICRS");
  assert.equal(candidate.sky?.unit, "deg");
  // Pixel 59,59 on the 118 px flip-y grid, checked against astropy in sky.test.ts.
  assert.ok(Math.abs(candidate.sky!.ra_deg - 133.75969425462017) < 1e-9);
  assert.ok(Math.abs(candidate.sky!.dec_deg - -7.242551669826732) < 1e-9);
  assert.deepEqual(candidate.selection.comparison, { aFrameId: "frame-0001", bFrameId: "frame-0003" });

  // The snapshot copies the displayed manifest rather than deriving new values.
  assert.equal(context.frames.length, cached.frames.length);
  assert.deepEqual(context.frames.map(frame => frame.observed_start_utc), cached.frames.map(frame => frame.observed_start_utc));
  assert.deepEqual(context.frames.map(frame => frame.source_fits_url), cached.frames.map(frame => frame.source_fits_url));
  assert.deepEqual(context.warnings, cached.warnings);
  assert.equal(context.processing.pipeline_version, cached.processing.pipeline_version);
  assert.equal(context.query?.link, `${BASE}?ra_deg=133.7601213914074&dec_deg=-7.242127941212259&fov_arcmin=6&frame=ICRS`);
});

test("the query is labelled by data mode, and synthetic fixtures have none", () => {
  assert.match(sequenceContext(live, null, BASE, NOW).query!.note, /^Repeats the search/);
  assert.match(sequenceContext(cached, null, BASE, NOW).query!.note, /^Runs a new live search/);
  assert.equal(sequenceContext(cached, null, null, NOW).query!.link, null);
  assert.equal(sequenceContext(synthetic, null, BASE, NOW).query, null);
});

test("a grid without a WCS keeps a labelled pixel-only mark", () => {
  const noWcs: SequenceManifest = { ...live, grid: { ...live.grid, wcs_header: null, raster_to_wcs: null } };
  const candidate = createCandidate(selection(noWcs), "note", sequenceContext(noWcs, null, BASE, NOW), "c-2", NOW);
  assert.equal(candidate.sky, null);
  assert.match(candidate.skyUnavailableReason!, /no celestial WCS/);
  assert.equal(createCandidate(selection(live), "note", null, "c-3", NOW).sky, null);
});

test("editing and deleting change only the intended record", () => {
  const context = sequenceContext(live, null, BASE, NOW);
  let store = emptyStore();
  store = addCandidate(store, createCandidate(selection(live, 1, 1), "first", context, "a", NOW), context);
  store = addCandidate(store, createCandidate(selection(live, 2, 2), "second", context, "b", NOW), context);
  const later = "2026-11-15T04:00:00.000Z";
  const edited = updateCandidateNote(store, "b", "second, revised", later);
  assert.deepEqual(edited.candidates[0], store.candidates[0]);
  assert.equal(edited.candidates[1]!.note, "second, revised");
  assert.equal(edited.candidates[1]!.updatedAt, later);
  assert.equal(edited.candidates[1]!.createdAt, NOW);
  assert.equal(updateCandidateNote(store, "b", "   ", later), store, "a blank note is not saved");

  const oneLeft = removeCandidate(edited, "a");
  assert.deepEqual(oneLeft.candidates.map(item => item.id), ["b"]);
  assert.ok(oneLeft.sequences[live.sequence_id], "the snapshot stays while a candidate uses it");
  assert.deepEqual(removeCandidate(oneLeft, "b").sequences, {});
});

test("the number of stored candidates is bounded", () => {
  const context = sequenceContext(live, null, BASE, NOW);
  let store = emptyStore();
  for (let i = 0; i < MAX_CANDIDATES + 5; i++) store = addCandidate(store, createCandidate(selection(live, i % 100, 1), `n${i}`, context, `id-${i}`, NOW), context);
  assert.equal(store.candidates.length, MAX_CANDIDATES);
});

test("saved candidates survive a reload, Unicode notes included", () => {
  const context = sequenceContext(live, null, BASE, NOW);
  const store = addCandidate(emptyStore(), createCandidate(selection(live), "Faint smudge 🌒 near 1.4 µm, ζ-like shape", context, "u", NOW), context);
  const loaded = loadStore(serializeStore(store), null);
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.store, store);
});

test("damaged entries are kept unchanged instead of silently dropped", () => {
  const context = sequenceContext(live, null, BASE, NOW);
  const store = addCandidate(emptyStore(), createCandidate(selection(live), "kept", context, "k", NOW), context);
  const saved = JSON.parse(serializeStore(store));
  saved.candidates.push({ id: "broken", note: "x", selection: { x: -1 } });
  const loaded = loadStore(JSON.stringify(saved), null);
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.store.candidates.map(item => item.id), ["k"]);
  assert.deepEqual(loaded.store.unreadable, [{ id: "broken", note: "x", selection: { x: -1 } }]);
  assert.deepEqual(JSON.parse(serializeStore(loaded.store)).unreadable, [{ id: "broken", note: "x", selection: { x: -1 } }]);
});

test("unreadable or incompatible storage is reported, not replaced", () => {
  for (const raw of ["not json", "[]", JSON.stringify({ schema: "other", version: STORE_VERSION }),
    JSON.stringify({ schema: "khonsu-candidates", version: 3, candidates: [], sequences: {} }),
    JSON.stringify({ schema: "khonsu-candidates", version: STORE_VERSION })]) {
    const loaded = loadStore(raw, null);
    assert.equal(loaded.ok, false, raw);
    if (!loaded.ok) assert.ok(loaded.reason.length > 10);
  }
  assert.deepEqual(loadStore(null, null), { ok: true, store: emptyStore(), migrated: false });
});

test("notes saved by the first version are migrated as pixel-only candidates", () => {
  const legacy = [
    { id: "old-1", note: "Possible change", createdAt: "2026-11-14T10:00:00Z", selection: { sequenceId: "field-1", frameId: "frame-1", x: 20, y: 30, coordinateSpace: "natural-raster", pixelOrigin: "top-left" } },
    { note: "incomplete" },
  ];
  const loaded = loadStore(null, JSON.stringify(legacy));
  assert.ok(loaded.ok && loaded.migrated);
  const [migrated] = loaded.store.candidates;
  assert.equal(migrated!.note, "Possible change");
  assert.equal(migrated!.sky, null);
  assert.match(migrated!.skyUnavailableReason!, /earlier version/);
  assert.deepEqual(migrated!.selection.comparison, null);
  assert.deepEqual(loaded.store.unreadable, [{ note: "incomplete" }]);
});
