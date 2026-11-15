import assert from "node:assert/strict";
import test from "node:test";
import { parseCoordinates, readSharedSearch, sharedSearchQuery, type SharedSearchResult } from "../src/features/explorer/coordinates.ts";

function restored(result: SharedSearchResult) {
  assert.equal(result.kind, "ok", JSON.stringify(result));
  return result.kind === "ok" ? result.search : null;
}

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
  assert.equal(parseCoordinates("1", "2", "120").ok, true);
  assert.equal(parseCoordinates("1", "2", "120.1").ok, false);
});

test("a shared link reproduces the exact search and selected observation", () => {
  const values = { ra_deg: 248.1672331, dec_deg: -66.7550238, fov_arcmin: 4.5 };
  const query = sharedSearchQuery(values, "2025W19_2B_0431_1");
  assert.equal(query, "?ra_deg=248.1672331&dec_deg=-66.7550238&fov_arcmin=4.5&frame=ICRS&obs=2025W19_2B_0431_1");
  const search = restored(readSharedSearch(query));
  assert.deepEqual(search?.values, values, "no rounding or reformatting of the sky position");
  assert.equal(search?.observationId, "2025W19_2B_0431_1");
  assert.deepEqual(search?.notes, []);
});

test("a page without search parameters restores nothing", () => {
  assert.deepEqual(readSharedSearch(""), { kind: "none" });
  assert.deepEqual(readSharedSearch("?utm_source=chat"), { kind: "none" });
});

test("out-of-range positions are rejected, never wrapped or clamped", () => {
  assert.equal(restored(readSharedSearch("?ra_deg=0&dec_deg=-90"))?.values.ra_deg, 0);
  assert.equal(restored(readSharedSearch("?ra_deg=359.9999999&dec_deg=90"))?.values.dec_deg, 90);
  for (const query of ["?ra_deg=360&dec_deg=0", "?ra_deg=-0.01&dec_deg=0", "?ra_deg=10&dec_deg=90.01", "?ra_deg=10&dec_deg=-91"]) {
    assert.equal(readSharedSearch(query).kind, "invalid", query);
  }
});

test("blank, missing, non-numeric and oversized coordinates restore nothing", () => {
  for (const query of [
    "?ra_deg=&dec_deg=10", "?ra_deg=10", "?dec_deg=10", "?ra_deg=abc&dec_deg=10", "?ra_deg=0xff&dec_deg=10",
    "?ra_deg=Infinity&dec_deg=10", "?ra_deg=NaN&dec_deg=10", "?ra_deg=1e999&dec_deg=10",
    `?ra_deg=${"1".repeat(40)}&dec_deg=10`, `?ra_deg=10&dec_deg=10&pad=${"x".repeat(3000)}`,
  ]) {
    const result = readSharedSearch(query);
    assert.equal(result.kind, "invalid", query.slice(0, 60));
    assert.ok(result.kind === "invalid" && /nothing was restored/i.test(result.message));
  }
});

test("an invalid or missing field of view falls back to the default with a note", () => {
  assert.deepEqual(restored(readSharedSearch("?ra_deg=10&dec_deg=20"))?.values, { ra_deg: 10, dec_deg: 20, fov_arcmin: 6 });
  for (const fov of ["600", "0.1", "wide", ""]) {
    const search = restored(readSharedSearch(`?ra_deg=10&dec_deg=20&fov_arcmin=${fov}`));
    assert.equal(search?.values.fov_arcmin, 6, fov);
    assert.equal(search?.notes.length, 1, fov);
  }
});

test("other coordinate frames are refused instead of being read as ICRS", () => {
  assert.equal(readSharedSearch("?ra_deg=10&dec_deg=20&frame=galactic").kind, "invalid");
  assert.equal(readSharedSearch("?ra_deg=10&dec_deg=20&frame=icrs").kind, "ok");
});

test("links cannot carry URLs, frame counts or other unknown values into a search", () => {
  const search = restored(readSharedSearch(
    "?ra_deg=10&dec_deg=20&max_frames=96&image_url=https://evil.example/a.png&obs=javascript:alert(1)",
  ));
  assert.deepEqual(Object.keys(search?.values ?? {}).sort(), ["dec_deg", "fov_arcmin", "ra_deg"]);
  assert.equal(search?.observationId, null, "a non-identifier observation value is dropped");
  assert.equal(restored(readSharedSearch("?ra_deg=10&dec_deg=20&obs=https://evil.example/x"))?.observationId, null);
});

test("malformed encoding and repeated parameters are handled without throwing", () => {
  assert.equal(readSharedSearch("?ra_deg=%E0%A4%A&dec_deg=10").kind, "invalid");
  assert.equal(restored(readSharedSearch("?ra_deg=10&ra_deg=200&dec_deg=20"))?.values.ra_deg, 10, "the first value wins");
  assert.equal(restored(readSharedSearch("?ra_deg=%2010%20&dec_deg=20"))?.values.ra_deg, 10, "surrounding spaces are trimmed");
});
