import assert from "node:assert/strict";
import test from "node:test";
import { adjacentFrameIndex, observationLabel } from "../src/features/viewer/time.ts";

test("stepping never invents a frame beyond the available observation range", () => {
  assert.equal(adjacentFrameIndex(0, -1, 3), 0);
  assert.equal(adjacentFrameIndex(2, 1, 3), 2);
  assert.equal(adjacentFrameIndex(1, 1, 3), 2);
  assert.equal(adjacentFrameIndex(0, 1, 0), -1);
});

test("unknown observation times remain unknown instead of becoming a default date", () => {
  assert.equal(observationLabel(null), "Observation date unavailable");
  assert.equal(observationLabel("invalid"), "Observation date unavailable");
  assert.match(observationLabel("2025-05-01T12:00:00Z"), /UTC$/);
});
