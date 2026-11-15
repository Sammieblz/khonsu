import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SequenceManifest } from "../src/features/explorer/interfaces.ts";
import { COVERAGE_NOTE_DIFFERENCE, COVERAGE_NOTE_FRACTION, describeComparison } from "../src/features/viewer/comparison.ts";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`../../../fixtures/${path}`, import.meta.url), "utf8")) as SequenceManifest;
const wise = fixture("real/real-wise-0855/manifest.json");
const indi = fixture("real/real-epsilon-indi-b/manifest.json");

test("each side names the real observation, date, release, wavelength and missing data", () => {
  const result = describeComparison(wise, 0, 2)!;
  const [a, b] = [wise.frames[0]!, wise.frames[2]!];
  assert.equal(result.sides[0], `A: observation 1, ${a.observed_start_utc!.slice(0, 16).replace("T", " ")} UTC, ${a.observation_id}, ${a.release}, ${a.wavelength_um!.toFixed(4)} µm, ${(a.masked_fraction! * 100).toFixed(1)}% no data`);
  assert.match(result.sides[1], new RegExp(`^B: observation 3, .*${b.observation_id}`));
});

test("the time between the two dates is stated with its direction", () => {
  const forward = describeComparison(wise, 0, 2)!;
  const expected = (Date.parse(wise.frames[2]!.observed_start_utc!) - Date.parse(wise.frames[0]!.observed_start_utc!)) / 86_400_000;
  assert.ok(forward.notes.includes(`B was observed ${expected.toFixed(1)} days after A.`), forward.notes.join(" | "));
  assert.ok(describeComparison(wise, 2, 0)!.notes.includes(`B was observed ${expected.toFixed(1)} days before A.`));
});

test("a DR1 and QR3 pair cites IRSA's statement that they belong together", () => {
  const result = describeComparison(indi, 0, 1)!;
  assert.deepEqual(indi.frames.map(frame => frame.release), ["DR1", "QR3"]);
  assert.ok(result.notes.some(note => note.startsWith("A is DR1 and B is QR3. IRSA states that DR1 and QR3 spectral images are intended to be used together")));
  assert.ok(!describeComparison(wise, 0, 2)!.notes.some(note => /QR3/.test(note)), "no release note when both are DR1");
});

test("wavelength differences and unmatched PSFs are explained", () => {
  const result = describeComparison(indi, 0, 1)!;
  const difference = Math.abs(indi.frames[0]!.wavelength_um! - indi.frames[1]!.wavelength_um!).toFixed(4);
  assert.ok(result.notes.some(note => note.startsWith(`Wavelength at the target differs by ${difference} µm`)));
  assert.ok(result.notes.some(note => /PSF\) and backgrounds are not matched/.test(note)));
});

test("coverage gaps, detector changes and frame warnings limit the comparison in words", () => {
  const altered: SequenceManifest = {
    ...wise,
    frames: wise.frames.map((frame, index) => index === 2
      ? { ...frame, masked_fraction: COVERAGE_NOTE_FRACTION, detector: 3, warnings: [{ code: "NEAR_EDGE", message: "Target is near the image edge." }] }
      : frame),
  };
  const notes = describeComparison(altered, 0, 2)!.notes;
  assert.ok(notes.some(note => note.startsWith("Coverage differs: A has 3.2% and B 10.0%")), notes.join(" | "));
  assert.ok(notes.includes("A uses detector 2 and B detector 3, which have different spectral responses."));
  assert.ok(notes.includes("B: Target is near the image edge."));
  // The real WISE frames differ by well under the coverage thresholds.
  assert.ok(Math.abs(wise.frames[0]!.masked_fraction! - wise.frames[2]!.masked_fraction!) < COVERAGE_NOTE_DIFFERENCE);
  assert.ok(!describeComparison(wise, 0, 2)!.notes.some(note => note.startsWith("Coverage differs")));
});

test("the same observation for A and B is explained, and out-of-range choices give nothing", () => {
  assert.deepEqual(describeComparison(wise, 1, 1)!.notes, ["A and B are the same observation. Choose two different dates to compare."]);
  assert.equal(describeComparison(wise, 0, 9), null);
});
