import assert from "node:assert/strict";
import test from "node:test";
import { parseStoredAnnotations } from "../src/features/annotations/storage.ts";

const valid = {
  id: "candidate-1",
  note: "Possible change; inspect source quality.",
  createdAt: "2026-11-14T10:00:00Z",
  selection: { sequenceId: "field-1", frameId: "frame-1", x: 20, y: 30, coordinateSpace: "natural-raster", pixelOrigin: "top-left" },
};

test("a malformed stored note does not prevent valid notes from loading", () => {
  const raw = JSON.stringify([valid, { ...valid, selection: { ...valid.selection, x: -1 } }, { note: "incomplete" }]);
  assert.deepEqual(parseStoredAnnotations(raw), [valid]);
});

test("invalid browser storage is treated as empty", () => {
  assert.deepEqual(parseStoredAnnotations("not json"), []);
  assert.deepEqual(parseStoredAnnotations("{}"), []);
  assert.deepEqual(parseStoredAnnotations(null), []);
});
