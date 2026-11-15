import type { RunOptions, SequenceManifest, SequenceRequest } from "./client";

// Tyrone owns this integration seam. The runner is injected (normally
// runSequenceJob) so the replacement rules can be tested without a browser.
export type SequenceRunner = (request: SequenceRequest, options: RunOptions) => Promise<SequenceManifest>;

interface Run {
  controller: AbortController;
  settled: Promise<void>;
}

/**
 * Keeps at most one live search per screen.
 *
 * Starting a search aborts the previous one and waits until that run has
 * settled, which includes cancelling its server job, before the next job is
 * created. A replaced or stopped search therefore cannot deliver frames, report
 * progress, keep polling, or be merged with the new search by the server's
 * duplicate-request reuse.
 */
export class SequenceSession {
  private readonly runner: SequenceRunner;
  private current: Run | null = null;

  constructor(runner: SequenceRunner) {
    this.runner = runner;
  }

  /** Whether a search is in flight. */
  get active(): boolean {
    return this.current !== null;
  }

  /**
   * Run a search as the only active one. Resolves with its manifest, or with
   * null when it was replaced or stopped before finishing. Rejects only with
   * failures of this search while it is still the active one.
   */
  async start(request: SequenceRequest, options: Omit<RunOptions, "signal"> = {}): Promise<SequenceManifest | null> {
    const previous = this.current;
    const controller = new AbortController();
    let settle = () => {};
    const run: Run = { controller, settled: new Promise(resolve => { settle = resolve; }) };
    this.current = run;
    previous?.controller.abort();
    try {
      await previous?.settled;
      if (controller.signal.aborted) return null;
      const manifest = await this.runner(request, {
        ...options,
        signal: controller.signal,
        onUpdate: job => { if (this.current === run) options.onUpdate?.(job); },
      });
      return this.current === run ? manifest : null;
    } catch (error) {
      if (controller.signal.aborted || this.current !== run) return null;
      throw error;
    } finally {
      if (this.current === run) this.current = null;
      settle();
    }
  }

  /** Abort the active search. Resolves once its server job has been released. */
  stop(): Promise<void> {
    const run = this.current;
    this.current = null;
    run?.controller.abort();
    return run?.settled ?? Promise.resolve();
  }
}
