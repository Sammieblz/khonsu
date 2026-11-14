"use client";

import { useEffect, useState } from "react";
import type { CandidateAnnotation, ImageSelection } from "@/features/explorer/interfaces";
import { ANNOTATIONS_KEY, parseStoredAnnotations } from "./storage";

export function useAnnotations() {
  const [annotations, setAnnotations] = useState<CandidateAnnotation[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try { setAnnotations(parseStoredAnnotations(window.localStorage.getItem(ANNOTATIONS_KEY))); }
    catch { /* Browser storage may be unavailable. Notes still work for this session. */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(annotations)); }
    catch { /* Keep in-memory notes if storage is full or disabled. */ }
  }, [annotations, loaded]);

  function addAnnotation(selection: ImageSelection, note: string) {
    const trimmedNote = note.trim().slice(0, 500);
    if (!trimmedNote) return;
    setAnnotations(previous => [...previous, {
      id: crypto.randomUUID(), selection, note: trimmedNote, createdAt: new Date().toISOString(),
    }]);
  }
  function removeAnnotation(annotationId: string) {
    setAnnotations(previous => previous.filter(item => item.id !== annotationId));
  }
  return { annotations, addAnnotation, removeAnnotation };
}
