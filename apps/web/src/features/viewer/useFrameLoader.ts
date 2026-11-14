"use client";

import { useEffect, useState } from "react";
import type { ObservationFrame } from "@/features/explorer/interfaces";
import { resolveAssetUrl } from "@/lib/api/client";

export function useFrameLoader(frames: ObservationFrame[]) {
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [failedIds, setFailedIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const pending: HTMLImageElement[] = [];
    setImages(new Map());
    setFailedIds([]);
    for (const frame of frames) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (!cancelled) setImages(previous => new Map(previous).set(frame.frame_id, image));
      };
      image.onerror = () => {
        if (!cancelled) setFailedIds(previous => [...previous, frame.frame_id]);
      };
      image.src = resolveAssetUrl(frame.image_url);
      pending.push(image);
    }
    return () => {
      cancelled = true;
      for (const image of pending) { image.onload = null; image.onerror = null; image.src = ""; }
    };
  }, [frames]);
  return { images, failedIds };
}
