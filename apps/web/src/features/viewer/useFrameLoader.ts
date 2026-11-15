"use client";
import { useEffect, useRef, useState } from "react";
import type { ObservationFrame } from "@/features/explorer/interfaces";
import { resolveAssetUrl } from "@/lib/api/client";
import { frameWindow } from "./time";
export function useFrameLoader(frames: ObservationFrame[], index = 0, pinned: number[] = []) {
  const cache = useRef(new Map<string, HTMLImageElement>());
  const identity = useRef(frames);
  const [images, setImages] = useState(new Map<string, HTMLImageElement>());
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const wanted = frameWindow(frames.length, index, pinned).map(i => frames[i]!.frame_id).join(",");
  useEffect(() => {
    let cancelled = false;
    if (identity.current !== frames) { cache.current.clear(); identity.current = frames; }
    const ids = new Set(wanted.split(","));
    for (const [id, image] of cache.current) if (!ids.has(id)) { image.src = ""; cache.current.delete(id); }
    setImages(new Map(cache.current)); setFailedIds([]);
    const pending: HTMLImageElement[] = [];
    for (const frame of frames.filter(frame => ids.has(frame.frame_id))) {
      if (cache.current.has(frame.frame_id)) continue;
      const image = new Image(); image.crossOrigin = "anonymous";
      image.onload = () => { if (!cancelled) { cache.current.set(frame.frame_id, image); setImages(new Map(cache.current)); } };
      image.onerror = () => { if (!cancelled) setFailedIds(previous => [...previous, frame.frame_id]); };
      image.src = resolveAssetUrl(frame.image_url); pending.push(image);
    }
    return () => { cancelled = true; for (const image of pending) { image.onload = null; image.onerror = null; if (!image.complete) image.src = ""; } };
  }, [frames, wanted, attempt]);
  useEffect(() => () => { for (const image of cache.current.values()) image.src = ""; cache.current.clear(); }, []);
  return { images: identity.current === frames ? images : new Map<string, HTMLImageElement>(), failedIds, retry: () => setAttempt(value => value + 1) };
}
