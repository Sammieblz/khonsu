import assert from "node:assert/strict";
import test from "node:test";
import { runSequenceJob, type RunOptions, type SequenceJob, type SequenceManifest, type SequenceRequest } from "../src/lib/api/client.ts";
import { SequenceSession } from "../src/lib/api/session.ts";

const field = (ra: number): SequenceRequest => ({ ra_deg: ra, dec_deg: 66.56, coordinate_frame: "ICRS", fov_arcmin: 6, max_frames: 16 });
const manifestFor = (request: SequenceRequest, id = `job-${request.ra_deg}`) => ({
  sequence_id: id, data_mode: "live", target: { ra_deg: request.ra_deg, dec_deg: request.dec_deg, coordinate_frame: "ICRS" }, frames: [],
}) as unknown as SequenceManifest;

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Fake runner with the real runner's abort contract: it settles only after
 * its "server cancel" completes. Each call is recorded and controllable.
 */
function controllableRunner() {
  const calls: { request: SequenceRequest; options: RunOptions; finish: (manifest: SequenceManifest) => void; fail: (error: unknown) => void; cancelled: ReturnType<typeof deferred> }[] = [];
  const runner = (request: SequenceRequest, options: RunOptions) => {
    const result = deferred<SequenceManifest>();
    const cancelled = deferred();
    options.signal?.addEventListener("abort", () => {
      cancelled.promise.then(() => {
        const error = new Error("aborted");
        error.name = "AbortError";
        result.reject(error);
      });
    });
    calls.push({ request, options, finish: result.resolve, fail: result.reject, cancelled });
    return result.promise;
  };
  return { calls, runner };
}

test("a replaced search never delivers its frames or progress", async () => {
  const { calls, runner } = controllableRunner();
  const session = new SequenceSession(runner);
  const progress: string[] = [];
  const first = session.start(field(10), { onUpdate: job => progress.push(`first:${job.status}`) });
  await tick();
  const second = session.start(field(20), { onUpdate: job => progress.push(`second:${job.status}`) });

  // The first run reports late and even finishes, but it was replaced.
  calls[0]?.options.onUpdate?.({ sequence_id: "job-10", status: "retrieving", progress: 0.2 } as SequenceJob);
  calls[0]?.finish(manifestFor(field(10)));
  assert.equal(await first, null);

  await tick();
  calls[1]?.options.onUpdate?.({ sequence_id: "job-20", status: "processing", progress: 0.6 } as SequenceJob);
  calls[1]?.finish(manifestFor(field(20)));
  assert.equal((await second)?.target.ra_deg, 20);
  assert.deepEqual(progress, ["second:processing"]);
  assert.equal(session.active, false);
});

test("the next job is created only after the previous job is cancelled", async () => {
  const { calls, runner } = controllableRunner();
  const session = new SequenceSession(runner);
  void session.start(field(10));
  await tick();
  const second = session.start(field(20));
  await tick();
  assert.equal(calls.length, 1, "the new job waits for the old cancel");
  calls[0]?.cancelled.resolve();
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.request.ra_deg, 20);
  calls[1]?.finish(manifestFor(field(20)));
  assert.equal((await second)?.sequence_id, "job-20");
});

test("rapid repeated searches run only the first and the last", async () => {
  const { calls, runner } = controllableRunner();
  const session = new SequenceSession(runner);
  const results = [session.start(field(10))];
  await tick();
  // Two more searches in the same moment, while the first is running.
  results.push(session.start(field(20)), session.start(field(30)));
  await tick();
  calls[0]?.cancelled.resolve();
  await tick();
  assert.deepEqual(calls.map(call => call.request.ra_deg), [10, 30], "the middle search never reached the server");
  calls[1]?.finish(manifestFor(field(30)));
  const [a, b, c] = await Promise.all(results);
  assert.equal(a, null);
  assert.equal(b, null);
  assert.equal(c?.target.ra_deg, 30);
});

test("only the active search reports failures", async () => {
  const { calls, runner } = controllableRunner();
  const session = new SequenceSession(runner);
  const failing = session.start(field(10));
  await tick();
  calls[0]?.fail(new Error("archive busy"));
  await assert.rejects(failing, /archive busy/);

  const replaced = session.start(field(20));
  await tick();
  const current = session.start(field(30));
  calls[1]?.fail(new Error("late failure of a replaced search"));
  assert.equal(await replaced, null);
  await tick();
  calls[2]?.finish(manifestFor(field(30)));
  assert.equal((await current)?.target.ra_deg, 30);
});

test("stop resolves once the job is released and the search yields nothing", async () => {
  const { calls, runner } = controllableRunner();
  const session = new SequenceSession(runner);
  const running = session.start(field(10));
  await tick();
  let stopped = false;
  const stopping = session.stop().then(() => { stopped = true; });
  await tick();
  assert.equal(stopped, false, "stop waits for the server cancel");
  calls[0]?.cancelled.resolve();
  await stopping;
  assert.equal(await running, null);
  assert.equal(session.active, false);
});

// End to end through the real client: two searches in quick succession.
test("a quick second search cancels the first job before creating its own, and polls only its own job", async () => {
  const requests: string[] = [];
  const original = globalThis.fetch;
  const statuses: Record<string, string[]> = { "job-a": ["retrieving", "retrieving"], "job-b": ["processing", "ready"] };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input).replace("http://localhost:8000", "");
    const method = init?.method ?? "GET";
    requests.push(`${method} ${url}`);
    if (init?.signal?.aborted) { const error = new Error("aborted"); error.name = "AbortError"; throw error; }
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (method === "POST" && url === "/v1/sequences") {
      const body = JSON.parse(String(init?.body)) as SequenceRequest;
      return reply({ sequence_id: body.ra_deg === 10 ? "job-a" : "job-b", status: "queued", progress: 0 }, 202);
    }
    const cancel = url.match(/^\/v1\/sequences\/(job-[ab])\/cancel$/);
    if (cancel) return reply({ sequence_id: cancel[1], status: "cancelled", progress: 0 });
    const manifest = url.match(/^\/v1\/sequences\/(job-[ab])\/manifest$/);
    if (manifest) return reply(manifestFor(field(manifest[1] === "job-a" ? 10 : 20), manifest[1]));
    const poll = url.match(/^\/v1\/sequences\/(job-[ab])$/);
    if (poll) return reply({ sequence_id: poll[1], status: statuses[poll[1] as string]?.shift() ?? "ready", progress: 0.5 });
    throw new Error(`Unexpected ${method} ${url}`);
  }) as typeof fetch;
  try {
    const session = new SequenceSession((request, options) => runSequenceJob(request, { ...options, sleep: async (_ms, signal) => {
      await tick();
      if (signal?.aborted) { const error = new Error("aborted"); error.name = "AbortError"; throw error; }
    } }));
    const shown: string[] = [];
    const first = session.start(field(10), { onUpdate: job => shown.push(job.sequence_id) });
    await tick(); await tick();
    const second = session.start(field(20), { onUpdate: job => shown.push(job.sequence_id) });
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a, null);
    assert.equal(b?.target.ra_deg, 20);
    const cancelAt = requests.indexOf("POST /v1/sequences/job-a/cancel");
    const createB = requests.lastIndexOf("POST /v1/sequences");
    assert.ok(cancelAt >= 0 && cancelAt < createB, `job-a is cancelled before job-b is created: ${requests.join(", ")}`);
    assert.ok(!requests.slice(cancelAt).some(item => item.startsWith("GET /v1/sequences/job-a")), "no polling of job-a after its cancel");
    assert.ok(shown.indexOf("job-b") > -1 && shown.lastIndexOf("job-a") < shown.indexOf("job-b"), "progress switches cleanly to job-b");
  } finally { globalThis.fetch = original; }
});
