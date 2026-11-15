"use client";

import { useEffect, useRef, useState } from "react";
import type { CandidateStorageState, ImageSelection, SequenceContext } from "@/features/explorer/interfaces";
import { addCandidate, createCandidate, emptyStore, MAX_CANDIDATES, removeCandidate, updateCandidateNote, type CandidateStore } from "./records";
import { LEGACY_KEY, loadStore, MAX_STORE_CHARS, serializeStore, STORE_KEY } from "./storage";

export function useAnnotations() {
  const [store, setStore] = useState<CandidateStore>(emptyStore);
  const [storage, setStorage] = useState<CandidateStorageState>({ kind: "loading" });
  // Writes are allowed only after a readable load, or after the visitor chooses
  // to replace unreadable saved data. Candidates always work in memory.
  // Commit write permission with the loaded store. A ref would become writable
  // while the persistence effect still sees the initial empty render.
  const [writable, setWritable] = useState(false);
  const unreadableRaw = useRef<string | null>(null);

  useEffect(() => {
    let raw: string | null, legacy: string | null = null;
    try {
      raw = window.localStorage.getItem(STORE_KEY);
      if (raw === null) legacy = window.localStorage.getItem(LEGACY_KEY);
    } catch {
      setStorage({ kind: "unavailable" });
      return;
    }
    const loaded = loadStore(raw, legacy);
    if (loaded.ok) {
      setStore(loaded.store);
      setWritable(true);
    } else {
      unreadableRaw.current = raw;
      setStorage({ kind: "unreadable", reason: loaded.reason });
    }
  }, []);

  useEffect(() => {
    if (!writable) return;
    const text = serializeStore(store);
    if (text.length > MAX_STORE_CHARS) { setStorage({ kind: "too-large" }); return; }
    try {
      window.localStorage.setItem(STORE_KEY, text);
      setStorage({ kind: "saved", preservedUnreadable: store.unreadable.length });
    } catch {
      setStorage({ kind: "write-failed" });
    }
  }, [store, writable]);

  function add(selection: ImageSelection, note: string, context: SequenceContext | null) {
    const now = new Date().toISOString();
    setStore(previous => addCandidate(previous, createCandidate(selection, note, context, crypto.randomUUID(), now), context));
  }
  function updateNote(id: string, note: string) {
    setStore(previous => updateCandidateNote(previous, id, note, new Date().toISOString()));
  }
  function remove(id: string) {
    setStore(previous => removeCandidate(previous, id));
  }
  /** Replace unreadable saved data with this session's candidates, after the visitor asks. */
  function startFresh() {
    setWritable(true);
    unreadableRaw.current = null;
    setStore(previous => ({ ...previous }));
  }
  return {
    annotations: store.candidates,
    contexts: store.sequences,
    storage,
    atCapacity: store.candidates.length >= MAX_CANDIDATES,
    unreadableData: () => unreadableRaw.current,
    add, updateNote, remove, startFresh,
  };
}
