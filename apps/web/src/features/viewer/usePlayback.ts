"use client";

import { useEffect, useRef, useState } from "react";

export function usePlayback(frameIds: string[], activeFrameId: string | null, onFrameChange: (frameId: string) => void, ready = true) {
  const [requested, setPlaying] = useState(false);
  const callback = useRef(onFrameChange);
  callback.current = onFrameChange;
  const index = frameIds.indexOf(activeFrameId ?? "");
  const atEnd = index >= frameIds.length - 1;
  const playing = requested && frameIds.length > 1 && !atEnd;
  useEffect(() => {
    if (!playing || !ready) return;
    const timer = window.setTimeout(() => { const next = frameIds[index + 1]; if (next) callback.current(next); }, 1000);
    return () => window.clearTimeout(timer);
  }, [playing, ready, frameIds, index]);
  useEffect(() => { if (atEnd) setPlaying(false); }, [atEnd]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  return { playing, setPlaying };
}
