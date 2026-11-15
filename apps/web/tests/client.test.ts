import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ApiClientError, describeFailure, knownFailureCodes, recoveryFor, resolveAssetUrl, runSequenceJob,
} from "../src/lib/api/client.ts";

interface Step { status?: number; body?: unknown; reject?: Error }

// Scripted fetch: each request consumes the next step, so an unexpected
// extra request (for example, polling after abort) fails the test.
function scriptFetch(steps: Step[]) {
  const calls: { url: string; method: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    if (init?.signal?.aborted) {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
    const step = steps.shift();
    if (!step) throw new Error(`Unexpected request ${String(input)}`);
    if (step.reject) throw step.reject;
    return new Response(JSON.stringify(step.body ?? null), {
      status: step.status ?? 200, headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore() { globalThis.fetch = original; } };
}

const API = "http://localhost:8000";
const request = { ra_deg: 248.1672331, dec_deg: 66.7550238, fov_arcmin: 6, max_frames: 8 };
const job = (status: string, extra: Record<string, unknown> = {}) => ({ sequence_id: "job-abc", status, progress: 0, ...extra });
const liveManifest = (extra: Record<string, unknown> = {}) => ({
  sequence_id: "job-abc", data_mode: "live",
  target: { ra_deg: request.ra_deg, dec_deg: request.dec_deg, coordinate_frame: "ICRS" }, frames: [], ...extra,
});
const instant = async () => {};
const offline = (): Step => ({ reject: new TypeError("fetch failed") });

test("polls a live job through each state to its manifest", async () => {
  const manifest = liveManifest();
  const fake = scriptFetch([
    { status: 202, body: job("queued") }, { body: job("retrieving") },
    { body: job("processing") }, { body: job("ready", { manifest_url: "/v1/sequences/job-abc/manifest" }) },
    { body: manifest },
  ]);
  try {
    const seen: string[] = [];
    const result = await runSequenceJob(request, { sleep: instant, onUpdate: item => seen.push(item.status) });
    assert.deepEqual(result, manifest);
    assert.deepEqual(seen, ["queued", "retrieving", "processing", "ready"]);
    assert.deepEqual(fake.calls.map(call => `${call.method} ${call.url}`), [
      `POST ${API}/v1/sequences`,
      `GET ${API}/v1/sequences/job-abc`, `GET ${API}/v1/sequences/job-abc`, `GET ${API}/v1/sequences/job-abc`,
      `GET ${API}/v1/sequences/job-abc/manifest`,
    ]);
  } finally { fake.restore(); }
});

test("a failed job surfaces the server's error code and message", async () => {
  const fake = scriptFetch([
    { status: 202, body: job("queued") },
    { body: job("failed", { error: { code: "archive_busy", message: "The IRSA archive is busy.", details: [] } }) },
  ]);
  try {
    await assert.rejects(runSequenceJob(request, { sleep: instant }), (error: unknown) =>
      error instanceof ApiClientError && error.code === "archive_busy" && error.message === "The IRSA archive is busy.");
  } finally { fake.restore(); }
});

test("HTTP errors keep their status, code and details", async () => {
  const fake = scriptFetch([{ status: 429, body: { code: "QUEUE_FULL", message: "The processing queue is full.", details: ["try later"] } }]);
  try {
    await assert.rejects(runSequenceJob(request, { sleep: instant }), (error: unknown) =>
      error instanceof ApiClientError && error.status === 429 && error.code === "QUEUE_FULL" && error.details[0] === "try later");
  } finally { fake.restore(); }
});

test("an expired job or backend restart asks for a new search", async () => {
  const fake = scriptFetch([
    { status: 202, body: job("queued") },
    { status: 410, body: { code: "JOB_EXPIRED", message: "expired", details: [] } },
  ]);
  try {
    await assert.rejects(runSequenceJob(request, { sleep: instant }), (error: unknown) =>
      error instanceof ApiClientError && error.status === 410 && error.code === "JOB_EXPIRED");
  } finally { fake.restore(); }
});

test("an unreachable backend becomes a readable error", async () => {
  const fake = scriptFetch([offline()]);
  try {
    await assert.rejects(runSequenceJob(request, { sleep: instant }), (error: unknown) =>
      error instanceof ApiClientError && error.code === "BACKEND_UNAVAILABLE");
  } finally { fake.restore(); }
});

test("aborting cancels the server job and stops polling", async () => {
  const controller = new AbortController();
  const fake = scriptFetch([{ status: 202, body: job("queued") }, { body: job("cancelled") }]);
  try {
    await assert.rejects(
      runSequenceJob(request, { signal: controller.signal, onUpdate: () => controller.abort() }),
      (error: unknown) => (error as Error).name === "AbortError",
    );
    assert.deepEqual(fake.calls.map(call => `${call.method} ${call.url}`), [
      `POST ${API}/v1/sequences`, `POST ${API}/v1/sequences/job-abc/cancel`,
    ]);
  } finally { fake.restore(); }
});

test("aborting while the job is being created still cancels the job the server made", async () => {
  const controller = new AbortController();
  const fake = scriptFetch([{ status: 202, body: job("queued") }, { body: job("cancelled") }]);
  try {
    const seen: string[] = [];
    const running = runSequenceJob(request, { signal: controller.signal, sleep: instant, onUpdate: item => seen.push(item.status) });
    controller.abort(); // The POST is already in flight.
    await assert.rejects(running, (error: unknown) => (error as Error).name === "AbortError");
    assert.deepEqual(fake.calls.map(call => `${call.method} ${call.url}`), [
      `POST ${API}/v1/sequences`, `POST ${API}/v1/sequences/job-abc/cancel`,
    ]);
    assert.deepEqual(seen, [], "a replaced search reports no progress");
  } finally { fake.restore(); }
});

test("waiting is bounded and the abandoned job is cancelled", async () => {
  let clock = 0;
  const fake = scriptFetch([
    { status: 202, body: job("queued") }, { body: job("retrieving") }, { body: job("cancelled") },
  ]);
  try {
    await assert.rejects(
      runSequenceJob(request, { sleep: instant, maxWaitMs: 3000, now: () => (clock += 2000) - 2000 }),
      (error: unknown) => error instanceof ApiClientError && error.code === "POLL_TIMEOUT",
    );
    assert.deepEqual(fake.calls.at(-1), { url: `${API}/v1/sequences/job-abc/cancel`, method: "POST" });
  } finally { fake.restore(); }
});

test("a brief backend outage during polling is ridden out", async () => {
  const fake = scriptFetch([
    { status: 202, body: job("queued") }, offline(), { body: job("ready") }, { body: liveManifest() },
  ]);
  try {
    const result = await runSequenceJob(request, { sleep: instant });
    assert.equal(result.sequence_id, "job-abc");
  } finally { fake.restore(); }
});

test("a backend restart during polling becomes the expired state", async () => {
  const fake = scriptFetch([
    { status: 202, body: job("retrieving") }, offline(),
    { status: 410, body: { code: "JOB_EXPIRED", message: "expired", details: [] } },
  ]);
  try {
    await assert.rejects(runSequenceJob(request, { sleep: instant }), (error: unknown) =>
      error instanceof ApiClientError && error.code === "JOB_EXPIRED" && describeFailure(error.code).kind === "expired");
  } finally { fake.restore(); }
});

test("losing the backend for several polls stops with a readable error", async () => {
  const fake = scriptFetch([{ status: 202, body: job("retrieving") }, offline(), offline(), offline()]);
  try {
    await assert.rejects(runSequenceJob(request, { sleep: instant }), (error: unknown) =>
      error instanceof ApiClientError && error.code === "BACKEND_UNAVAILABLE" && /Lost contact/.test(error.message));
    assert.equal(fake.calls.length, 4);
  } finally { fake.restore(); }
});

test("a manifest for another field, job or data mode is never returned", async () => {
  for (const wrong of [
    liveManifest({ target: { ra_deg: request.ra_deg + 0.01, dec_deg: request.dec_deg, coordinate_frame: "ICRS" } }),
    liveManifest({ sequence_id: "job-other" }),
    liveManifest({ data_mode: "cached-real" }),
    { sequence_id: "job-abc", data_mode: "live", frames: [] },
  ]) {
    const fake = scriptFetch([{ status: 202, body: job("ready") }, { body: wrong }]);
    try {
      await assert.rejects(runSequenceJob(request, { sleep: instant }), (error: unknown) =>
        error instanceof ApiClientError && error.code === "INVALID_RESPONSE");
    } finally { fake.restore(); }
  }
});

test("recovery guidance separates retryable failures from ones needing a new query", () => {
  assert.equal(recoveryFor("archive_busy"), "retry");
  assert.equal(recoveryFor("JOB_EXPIRED"), "retry");
  assert.equal(recoveryFor("INSUFFICIENT_COMPARABLE_EPOCHS"), "change-query");
  assert.equal(recoveryFor("SCIENCE_UNAVAILABLE"), "none");
});

test("each failure category has its own readable state and a recovery action", () => {
  const categories = {
    INVALID_REQUEST: "invalid-search", NO_USABLE_COVERAGE: "no-coverage", archive_timeout: "timeout",
    archive_unavailable: "archive", QUEUE_FULL: "busy", PROCESSING_FAILED: "processing",
    JOB_EXPIRED: "expired", BACKEND_UNAVAILABLE: "unreachable", archive_size_limit: "too-large",
    INVALID_WCS: "unusable-data", SCIENCE_UNAVAILABLE: "misconfigured", CANCELLED: "cancelled",
  };
  const titles = new Set<string>();
  for (const [code, kind] of Object.entries(categories)) {
    const guide = describeFailure(code);
    assert.equal(guide.kind, kind, code);
    assert.ok(guide.retry || guide.editSearch || guide.cachedExample, `${code} offers an action`);
    assert.ok(guide.hint.length > 20, `${code} explains what to do`);
    titles.add(guide.title);
  }
  assert.equal(titles.size, Object.keys(categories).length, "every category reads differently");
});

test("an archive outage offers the cached real example but a search typo does not", () => {
  assert.equal(describeFailure("archive_busy").cachedExample, true);
  assert.equal(describeFailure("INVALID_REQUEST").cachedExample, false);
  assert.equal(describeFailure("BACKEND_UNAVAILABLE").cachedExample, false, "examples come from the same backend");
  assert.equal(describeFailure("SOMETHING_NEW").kind, "processing", "an unknown code still offers a retry");
});

// Codes the API can return that never end a search, so need no search state.
const NOT_SEARCH_FAILURES = new Set([
  "ASSET_NOT_FOUND", // frame route; the viewer's frame loading reports it
  "CACHED_EXAMPLE_UNAVAILABLE", // example list; the cached example picker reports it
  "EXAMPLE_NOT_FOUND", // cached example frame route
  "DEMO_FIXTURE_UNAVAILABLE", // synthetic demo routes, not used by live search
]);

function pythonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? pythonFiles(join(directory, entry.name))
      : entry.name.endsWith(".py") ? [join(directory, entry.name)] : []);
}

test("every error code the API can raise has an explicit failure state", () => {
  const source = pythonFiles(fileURLToPath(new URL("../../api/app", import.meta.url)))
    .map(path => readFileSync(path, "utf-8")).join("\n");
  const patterns = [
    /JobError\(\s*\d+\s*,\s*"([A-Za-z_]+)"/g,
    /ProcessingError\(\s*"([A-Za-z_]+)"/g,
    /RetrievalError\(\s*"([A-Za-z_]+)"/g,
    /error_response\(\s*\d+\s*,\s*"([A-Za-z_]+)"/g,
    /ApiError\(code="([A-Za-z_]+)"/g,
  ];
  const raised = new Set(patterns.flatMap(pattern => [...source.matchAll(pattern)].map(match => match[1] as string)));
  assert.ok(raised.size > 30, `found only ${raised.size} codes; the source scan is broken`);
  assert.ok(raised.has("INSUFFICIENT_COMPARABLE_EPOCHS"), "multi-line raises are scanned");
  const known = new Set(knownFailureCodes());
  const missing = [...raised].filter(code => !known.has(code) && !NOT_SEARCH_FAILURES.has(code)).sort();
  assert.deepEqual(missing, [], "map these codes in describeFailure");
});

test("manifest frame paths resolve against the configured API origin", () => {
  assert.equal(resolveAssetUrl("/v1/sequences/job-abc/frames/frame-0001.png"), `${API}/v1/sequences/job-abc/frames/frame-0001.png`);
});
