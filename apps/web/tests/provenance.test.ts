import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SequenceManifest } from "../src/features/explorer/interfaces.ts";
import { dataModeLabel, frameNotes, HIGH_MISSING_DATA, processingSummary, utcSeconds } from "../src/features/annotations/provenance.ts";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`../../../fixtures/${path}`, import.meta.url), "utf8")) as SequenceManifest;
const cached = fixture("real/real-wise-0855/manifest.json");
const synthetic = fixture("synthetic/sequence-manifest.json");

test("live, cached real and synthetic data have distinct labels", () => {
  const live = dataModeLabel({ ...cached, data_mode: "live" });
  const saved = dataModeLabel(cached);
  const fake = dataModeLabel(synthetic);
  assert.equal(new Set([live.title, saved.title, fake.title]).size, 3);
  assert.match(saved.detail, new RegExp(utcSeconds(String(cached.processing!.cache_acquired_at_utc))));
  assert.match(saved.detail, /not a live result/);
  assert.match(fake.detail, /not observations/);
});

test("observation times keep their seconds and say UTC", () => {
  assert.equal(utcSeconds("2025-11-07T20:31:27.206400Z"), "2025-11-07 20:31:27 UTC");
  assert.equal(utcSeconds("2025-11-07T15:31:27-05:00"), "2025-11-07 20:31:27 UTC");
  assert.equal(utcSeconds(null), "Date unavailable");
  assert.equal(utcSeconds("not a date"), "Date unavailable");
});

test("the processing summary repeats the manifest's own record", () => {
  const summary = processingSummary(cached);
  assert.equal(summary.scale, Number(cached.processing!.grid_scale_arcsec).toFixed(2));
  assert.match(summary.display, new RegExp(`${cached.display.stretch} stretch from ${cached.display.vmin.toPrecision(4)}`));
  assert.match(summary.display, /MJy\/sr/);
  assert.match(summary.processing, /PSFs not matched/);
  assert.match(summary.processing, /background not subtracted/);
  assert.match(summary.processing, new RegExp(String(cached.processing!.pipeline_version).replace(/\./g, "\\.")));
  assert.equal(processingSummary({ ...cached, processing: {} }).processing, "No processing record was supplied.");
});

test("every warning is listed in words with its code, and heavy missing data gets its own note", () => {
  const notes = frameNotes(cached);
  for (const warning of cached.warnings ?? []) {
    assert.ok(notes.some(note => note.code === warning.code && note.message === warning.message && note.scope === "All observations"), warning.code);
  }
  const gappy: SequenceManifest = {
    ...cached,
    frames: cached.frames.map((frame, index) => index === 1
      ? { ...frame, masked_fraction: HIGH_MISSING_DATA, warnings: [{ code: "EDGE_OF_COVERAGE", message: "The target is near the detector edge." }] }
      : frame),
  };
  const gappyNotes = frameNotes(gappy);
  assert.ok(gappyNotes.some(note => note.scope === "Observation 2" && note.code === "EDGE_OF_COVERAGE"));
  assert.ok(gappyNotes.some(note => note.scope === "Observation 2" && /10\.0% of its pixels have no valid data/.test(note.message)));
  assert.ok(!gappyNotes.some(note => note.scope === "Observation 1" && /no valid data/.test(note.message)), "a 3% mask is not flagged");
  const clean = frameNotes({ ...cached, warnings: [], frames: cached.frames.map(frame => ({ ...frame, warnings: [], masked_fraction: 0 })) });
  assert.equal(clean.length, 1);
  assert.match(clean[0]!.message, /no quality warnings/);
});
