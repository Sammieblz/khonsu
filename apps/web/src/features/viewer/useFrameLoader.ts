"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ObservationFrame } from "@/features/explorer/interfaces";
import { resolveAssetUrl } from "@/lib/api/client";
import { FrameCache, frameWindowIds, type FrameResource } from "./frame-cache";

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const EMPTY_IMAGES = new Map<string, HTMLImageElement>();
interface Snapshot { key: string; images: Map<string, HTMLImageElement>; failedIds: string[]; loadingIds: string[]; }

async function loadImage(url: string, signal: AbortSignal): Promise<FrameResource<HTMLImageElement>> {
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok) throw new Error("Frame request failed (" + response.status + ")");
  if (Number(response.headers.get("Content-Length")) > MAX_IMAGE_BYTES) throw new Error("Frame exceeds the display size limit");
  const reader = response.body?.getReader();
  let blob: Blob;
  if (reader) {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error("Frame exceeds the display size limit"); }
        chunks.push(new Uint8Array(next.value));
      }
    } finally { reader.releaseLock(); }
    blob = new Blob(chunks, { type: response.headers.get("Content-Type") ?? "application/octet-stream" });
  } else {
    blob = await response.blob();
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("Frame exceeds the display size limit");
  }
  if (signal.aborted) throw new DOMException("Frame cancelled", "AbortError");
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    const release = () => { image.onload = null; image.onerror = null; image.src = ""; URL.revokeObjectURL(objectUrl); };
    const abort = () => { release(); reject(new DOMException("Frame cancelled", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted || image.naturalWidth < 1 || image.naturalHeight < 1 || image.naturalWidth > 4096 || image.naturalHeight > 4096) {
        release(); reject(new Error("Invalid or oversized display frame")); return;
      }
      resolve({ value: image, dispose: release });
    };
    image.onerror = () => { signal.removeEventListener("abort", abort); release(); reject(new Error("Frame image could not be decoded")); };
    image.src = objectUrl;
  });
}

export function useFrameLoader(frames: ObservationFrame[], activeId: string | null, sequenceId: string, pinned: string[] = []) {
  const cache = useRef<FrameCache<HTMLImageElement> | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({ key: "", images: EMPTY_IMAGES, failedIds: [], loadingIds: [] });
  const frameMap = useMemo(() => new Map(frames.map(frame => [frame.frame_id, frame])), [frames]);
  const frameIds = useMemo(() => frames.map(frame => frame.frame_id), [frames]);
  const windowKey = JSON.stringify(frameWindowIds(frameIds, activeId, pinned));
  const desiredRef = useRef<string[]>([]);
  desiredRef.current = JSON.parse(windowKey) as string[];
  useEffect(() => {
    const current = new FrameCache<HTMLImageElement>(async (id, signal) => {
      const frame = frameMap.get(id);
      if (!frame) throw new Error("Frame is not part of this sequence");
      return loadImage(resolveAssetUrl(frame.image_url), signal);
    }, () => setSnapshot({ key: sequenceId, ...current.snapshot() }));
    cache.current = current;
    current.setWindow(desiredRef.current);
    return () => { current.dispose(); if (cache.current === current) cache.current = null; };
  }, [frameMap, sequenceId]);
  useEffect(() => { cache.current?.setWindow(desiredRef.current); }, [windowKey]);
  const matching = snapshot.key === sequenceId;
  return {
    images: matching ? snapshot.images : EMPTY_IMAGES,
    failedIds: matching ? snapshot.failedIds : [],
    loadingIds: matching ? snapshot.loadingIds : desiredRef.current,
    retry: (id: string) => cache.current?.retry(id),
  };
}
