import assert from "node:assert/strict";
import test from "node:test";
import { clientPointToRaster, displayScale } from "../src/features/viewer/viewport.ts";

test("marks the same natural image pixel after a displayed canvas is resized", () => {
  const small = clientPointToRaster(150, 100, { left: 100, top: 50, width: 200, height: 100 }, 800, 400);
  const large = clientPointToRaster(200, 150, { left: 100, top: 50, width: 400, height: 200 }, 800, 400);
  assert.deepEqual(small, { x: 200, y: 200 });
  assert.deepEqual(large, small);
});

test("rejects clicks outside the displayed image and empty viewports", () => {
  const rect = { left: 20, top: 30, width: 100, height: 100 };
  assert.equal(clientPointToRaster(19, 40, rect, 500, 500), null);
  assert.equal(clientPointToRaster(120, 40, rect, 500, 500), null);
  assert.equal(clientPointToRaster(40, 130, rect, 500, 500), null);
  assert.equal(clientPointToRaster(40, 40, { ...rect, width: 0 }, 500, 500), null);
});

test("scales the science grid by a whole number so every pixel is an equal crisp block", () => {
  assert.equal(displayScale(118, 118), 9);
  assert.equal(displayScale(512, 512), 2);
  assert.equal(displayScale(1024, 1024), 1);
  assert.equal(displayScale(2048, 2048), 1);
  assert.equal(displayScale(0, 0), 1);
  assert.ok(Number.isInteger(displayScale(37, 59)));
});
