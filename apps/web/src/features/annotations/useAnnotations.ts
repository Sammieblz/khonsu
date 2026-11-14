"use client";

import { useEffect, useState } from "react";
import type { CandidateAnnotation, ImageSelection } from "@/features/explorer/interfaces";
import { captureEvidence, type AnnotationContext } from "./model";
import { ANNOTATIONS_KEY, LEGACY_ANNOTATIONS_KEY, MAX_ANNOTATIONS, canSafelyPersistStoredAnnotations, parseStoredAnnotations, serializeAnnotations } from "./storage";

export function useAnnotations() {
  const [annotations, setAnnotations] = useState<CandidateAnnotation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [canPersist, setCanPersist] = useState(true);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ANNOTATIONS_KEY) ?? window.localStorage.getItem(LEGACY_ANNOTATIONS_KEY);
      const restored = parseStoredAnnotations(raw);
      setAnnotations(restored);
      if (!canSafelyPersistStoredAnnotations(raw, restored)) {
        setCanPersist(false);
        setStorageWarning("Some stored notes could not be restored. Existing browser data was left unchanged. New notes last for this session only. Export them before closing the page.");
      }
    } catch {
      setCanPersist(false);
      setStorageWarning("Browser storage is unavailable. Notes last for this session only. Export them before closing the page.");
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded || !canPersist) return;
    try {
      window.localStorage.setItem(ANNOTATIONS_KEY, serializeAnnotations(annotations));
    } catch {
      setStorageWarning("Notes could not be saved in this browser. They remain in memory for this session. Export them before closing the page.");
    }
  }, [annotations, loaded, canPersist]);

  function addAnnotation(selection: ImageSelection, note: string, context?: AnnotationContext) {
    const trimmedNote = note.trim().slice(0, 500);
    if (!trimmedNote) return;
    if (annotations.length >= MAX_ANNOTATIONS) {
      setStorageWarning("This browser has 100 candidate notes. Export and remove some notes before adding another.");
      return;
    }
    const createdAt = new Date().toISOString();
    let evidence;
    try { evidence = context ? captureEvidence(selection, context, createdAt) : undefined; }
    catch {
      setStorageWarning("The selection no longer matches the loaded sequence. Select a pixel again before saving.");
      return;
    }
    setAnnotations(previous => [...previous, {
      id: crypto.randomUUID(), selection, note: trimmedNote, createdAt, ...(evidence ? { evidence } : {}),
    }]);
  }
  function removeAnnotation(annotationId: string) {
    setAnnotations(previous => previous.filter(item => item.id !== annotationId));
  }
  return { annotations, addAnnotation, removeAnnotation, storageWarning };
}
