export interface FrameResource<T> { value: T; dispose: () => void; }
interface Entry<T> { id: string; controller: AbortController; status: "loading" | "ready" | "failed"; resource?: FrameResource<T>; }

export function frameWindowIds(frameIds: readonly string[], activeId: string | null, pinned: readonly string[] = [], limit = 5): string[] {
  const activeIndex = Math.max(0, frameIds.indexOf(activeId ?? ""));
  const result: string[] = [];
  const add = (id: string | undefined) => { if (id && frameIds.includes(id) && !result.includes(id) && result.length < Math.min(5, Math.max(1, limit))) result.push(id); };
  add(frameIds[activeIndex]);
  pinned.forEach(add);
  for (let distance = 1; distance <= 2; distance++) { add(frameIds[activeIndex + distance]); add(frameIds[activeIndex - distance]); }
  return result;
}

/** A bounded, abortable resource cache. Late results can never replace a new sequence. */
export class FrameCache<T> {
  private entries = new Map<string, Entry<T>>();
  private desired: string[] = [];
  private active = new Set<Entry<T>>();
  private closed = false;
  private loader: (id: string, signal: AbortSignal) => Promise<FrameResource<T>>;
  private changed: () => void;
  private concurrency: number;
  constructor(loader: (id: string, signal: AbortSignal) => Promise<FrameResource<T>>, changed: () => void, concurrency = 2) {
    this.loader = loader; this.changed = changed; this.concurrency = Math.max(1, Math.min(2, concurrency));
  }

  setWindow(ids: readonly string[]) {
    if (this.closed) return;
    this.desired = [...new Set(ids)].slice(0, 5);
    for (const [id, entry] of this.entries) {
      if (!this.desired.includes(id)) { entry.controller.abort(); entry.resource?.dispose(); this.entries.delete(id); }
    }
    this.changed();
    this.pump();
  }

  snapshot() {
    const images = new Map<string, T>();
    const failedIds: string[] = [];
    for (const [id, entry] of this.entries) {
      if (entry.resource) images.set(id, entry.resource.value);
      if (entry.status === "failed") failedIds.push(id);
    }
    return { images, failedIds, loadingIds: this.desired.filter(id => !images.has(id) && !failedIds.includes(id)) };
  }

  retry(id: string) {
    const entry = this.entries.get(id);
    if (entry?.status === "failed") { this.entries.delete(id); this.pump(); this.changed(); }
  }

  dispose() {
    this.closed = true;
    for (const entry of this.entries.values()) { entry.controller.abort(); entry.resource?.dispose(); }
    this.entries.clear();
    this.desired = [];
  }

  private pump() {
    if (this.closed) return;
    for (const id of this.desired) {
      if (this.active.size >= this.concurrency) break;
      if (this.entries.has(id)) continue;
      const entry: Entry<T> = { id, controller: new AbortController(), status: "loading" };
      this.entries.set(id, entry);
      this.active.add(entry);
      Promise.resolve().then(() => this.loader(id, entry.controller.signal)).then(resource => {
        if (this.closed || entry.controller.signal.aborted || this.entries.get(id) !== entry) { resource.dispose(); return; }
        entry.status = "ready";
        entry.resource = resource;
      }).catch(() => {
        if (!this.closed && !entry.controller.signal.aborted && this.entries.get(id) === entry) entry.status = "failed";
      }).finally(() => {
        this.active.delete(entry);
        if (!this.closed) { this.changed(); this.pump(); }
      });
    }
  }
}
