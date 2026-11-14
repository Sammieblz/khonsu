import assert from "node:assert/strict";
import test from "node:test";
import { parseCoordinates } from "../src/features/explorer/coordinates.ts";

test("preserves the celestial coordinate boundaries agreed with the API", () => {
  assert.equal(parseCoordinates("0", "-90", ".5").ok, true);
  assert.equal(parseCoordinates("359.9999999", "+90", "60").ok, true);
  assert.equal(parseCoordinates("360", "0", "6").ok, false);
  assert.equal(parseCoordinates("-0.01", "0", "6").ok, false);
  assert.equal(parseCoordinates("30", "90.01", "6").ok, false);
});

test("does not turn missing, non-decimal, or non-finite input into a valid query", () => {
  for (const input of ["", " ", "Infinity", "NaN", "0xff", "1e999"]) {
    assert.equal(parseCoordinates(input, "20", "6").ok, false, input);
  }
});

test("keeps field sizes inside the backend resource bound", () => {
  assert.equal(parseCoordinates("1", "2", ".49").ok, false);
  assert.equal(parseCoordinates("1", "2", "60.1").ok, false);
});
