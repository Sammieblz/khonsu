"use client";

import { useEffect, useState } from "react";

export function usePlayback(frameIds: string[], activeFrameId: string | null, onFrameChange: (frameId: string) => void) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || frameIds.length < 2) return;
    const index = frameIds.indexOf(activeFrameId ?? "");
    if (index >= frameIds.length - 1) return;
    const timer = window.setTimeout(() => {
      const next = frameIds[index + 1];
      if (next) onFrameChange(next);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [playing, frameIds, activeFrameId, onFrameChange]);
  const atEnd = frameIds.length > 0 && activeFrameId === frameIds[frameIds.length - 1];
  return { playing: playing && !atEnd && frameIds.length > 1, setPlaying };
}
