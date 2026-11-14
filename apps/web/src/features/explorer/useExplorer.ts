"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, cancelSequence, getExamples, getManifest, getPresets, getSyntheticDemo, pollSequence, requestSequence } from "@/lib/api/client";
import { parseQueryParameters, queryUrl } from "./query";
import type { ImageSelection, PresetTarget, SequenceJob, SequenceManifest, SequenceRequest, ViewerComparison, ViewerTool } from "./interfaces";

interface Operation { controller: AbortController; serial: number; sequenceId: string | null; }
export interface SearchStatus { state: string; message: string; progress: number | null; error: ApiClientError | null; }
const idle: SearchStatus = { state: "idle", message: "Choose a reference target or enter a sky position.", progress: null, error: null };

function asError(error: unknown): ApiClientError {
  return error instanceof ApiClientError ? error : new ApiClientError("The observation service could not complete this request. You can retry the search.", 0, "SERVICE_UNAVAILABLE");
}
function statusForJob(job: SequenceJob): SearchStatus {
  const value = job as SequenceJob & { message?: string; progress?: number };
  const labels: Record<string, string> = {
    queued: "Your field is queued for processing.", retrieving: "Finding and downloading compatible archive observations.",
    processing: "Aligning observations and preparing comparison frames.", ready: "The observation sequence is ready.",
    failed: "This field could not be prepared.", cancelled: "The search was cancelled.", expired: "This search has expired. Repeat the query to prepare a fresh sequence.",
  };
  return { state: job.status, message: value.message || labels[job.status] || "Preparing this field.", progress: typeof value.progress === "number" ? Math.max(0, Math.min(1, value.progress)) : null, error: null };
}

export function useExplorer() {
  const [sequence, setSequence] = useState<SequenceManifest | null>(null);
  const [request, setRequest] = useState<SequenceRequest | null>(null);
  const [displayedRequest, setDisplayedRequest] = useState<SequenceRequest | null>(null);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [selection, setSelection] = useState<ImageSelection | null>(null);
  const [comparison, setComparison] = useState<ViewerComparison>({ aFrameId: null, bFrameId: null });
  const [tool, setTool] = useState<ViewerTool>("time");
  const [status, setStatus] = useState<SearchStatus>(idle);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<PresetTarget[]>([]);
  const [examples, setExamples] = useState<SequenceManifest[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [presetError, setPresetError] = useState("");
  const [exampleError, setExampleError] = useState("");
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [notices, setNotices] = useState<string[]>([]);
  const [shareLink, setShareLink] = useState("");
  const [pendingExampleId, setPendingExampleId] = useState<string | null>(null);
  const operation = useRef<Operation | null>(null);
  const serial = useRef(0);

  const writeUrl = useCallback((query: SequenceRequest | null, options: { synthetic?: boolean; exampleId?: string } = {}) => {
    const link = queryUrl(window.location.href, query, options);
    window.history.replaceState(null, "", link);
    setShareLink(link);
  }, []);

  const stopPrevious = useCallback(() => {
    const previous = operation.current;
    operation.current = null;
    previous?.controller.abort();
    if (previous?.sequenceId) void cancelSequence(previous.sequenceId).catch(() => undefined);
  }, []);

  const begin = useCallback((): Operation => {
    stopPrevious();
    const next = { controller: new AbortController(), serial: ++serial.current, sequenceId: null };
    operation.current = next;
    setBusy(true);
    setPendingExampleId(null);
    return next;
  }, [stopPrevious]);

  const commit = useCallback((manifest: SequenceManifest, query: SequenceRequest | null) => {
    setSequence(manifest);
    setDisplayedRequest(query);
    setActiveFrameId(manifest.frames[0]?.frame_id ?? null);
    setComparison({ aFrameId: manifest.frames[0]?.frame_id ?? null, bFrameId: manifest.frames[manifest.frames.length - 1]?.frame_id ?? null });
    setSelection(null);
    setTool("time");
  }, []);

  const runQuery = useCallback(async (query: SequenceRequest, updateUrl = true) => {
    const current = begin();
    setRequest(query);
    setStatus({ state: "submitting", message: "Requesting observations for this field.", progress: null, error: null });
    if (updateUrl) writeUrl(query);
    try {
      const submitted = await requestSequence(query, current.controller.signal);
      if (operation.current !== current) return;
      current.sequenceId = submitted.sequence_id;
      const final = await pollSequence(submitted, job => {
        if (operation.current === current) setStatus(statusForJob(job));
      }, current.controller.signal);
      if (operation.current !== current) return;
      if (final.status !== "ready") {
        const error = final.error;
        if (error) throw new ApiClientError(error.message, 422, error.code, error.details ?? []);
        if (String(final.status) === "cancelled" || String(final.status) === "expired") { setStatus(statusForJob(final)); return; }
        throw new ApiClientError("The field could not be prepared. Try a different date, wavelength range, or reference target.", 422, "PROCESSING_FAILED");
      }
      setStatus({ state: "loading", message: "Loading the prepared sequence and its source metadata.", progress: 1, error: null });
      const manifest = await getManifest(final.sequence_id, final.manifest_url, current.controller.signal);
      if (operation.current !== current) return;
      if (manifest.data_mode === "synthetic") throw new ApiClientError("A live query returned simulated data. It was not substituted into the observation viewer.", 502, "UNEXPECTED_SYNTHETIC_DATA");
      commit(manifest, query);
      setStatus({ state: "ready", message: `${manifest.frames.length} dated frames are ready to inspect.`, progress: 1, error: null });
    } catch (error) {
      if (current.controller.signal.aborted || operation.current !== current) return;
      const failure = asError(error);
      setStatus({ state: failure.code.includes("EXPIRED") ? "expired" : "failed", message: failure.message, progress: null, error: failure });
    } finally {
      if (operation.current === current) { operation.current = null; setBusy(false); }
    }
  }, [begin, commit, writeUrl]);

  const loadExample = useCallback((manifest: SequenceManifest, updateUrl = true) => {
    stopPrevious();
    ++serial.current;
    setPendingExampleId(null);
    setBusy(false);
    const query: SequenceRequest = { ...manifest.target, fov_arcmin: manifest.requested_fov_arcmin, max_frames: manifest.frames.length };
    setRequest(query);
    commit(manifest, null);
    setStatus({ state: "ready", message: "Showing a previously acquired real sequence. Its dates and original source references are preserved.", progress: 1, error: null });
    if (updateUrl) writeUrl(query, { exampleId: manifest.sequence_id });
  }, [commit, stopPrevious, writeUrl]);

  const loadSynthetic = useCallback(async () => {
    const current = begin();
    setStatus({ state: "loading", message: "Loading the explicitly simulated interaction example.", progress: null, error: null });
    try {
      const manifest = await getSyntheticDemo(current.controller.signal);
      if (operation.current !== current) return;
      commit(manifest, null);
      setRequest(null);
      writeUrl(null, { synthetic: true });
      setStatus({ state: "ready", message: "Simulation mode. These are generated test images, not SPHEREx observations.", progress: 1, error: null });
    } catch (error) {
      if (current.controller.signal.aborted || operation.current !== current) return;
      const failure = asError(error);
      setStatus({ state: "failed", message: failure.message, progress: null, error: failure });
    } finally {
      if (operation.current === current) { operation.current = null; setBusy(false); }
    }
  }, [begin, commit, writeUrl]);

  const cancelCurrent = useCallback(async () => {
    const current = operation.current;
    if (!current) return;
    current.controller.abort();
    operation.current = null;
    const cancellationSerial = ++serial.current;
    setBusy(false);
    setStatus({ state: "cancelled", message: "Stopped waiting for this search.", progress: null, error: null });
    if (current.sequenceId) {
      try {
        const result = await cancelSequence(current.sequenceId);
        if (serial.current === cancellationSerial) setStatus(statusForJob(result));
      } catch {
        if (serial.current === cancellationSerial) setStatus({ state: "cancelled", message: "Stopped waiting. The service could not confirm cancellation of its processing job.", progress: null, error: null });
      }
    } else {
      setStatus({ state: "cancelled", message: "Stopped waiting before a job identifier was returned. An already accepted server request may still finish.", progress: null, error: null });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setPresetError("");
    setExampleError("");
    void Promise.allSettled([getPresets(controller.signal), getExamples(controller.signal)]).then(([targets, cached]) => {
      if (controller.signal.aborted) return;
      if (targets.status === "fulfilled") setPresets(targets.value);
      else setPresetError(asError(targets.reason).message);
      if (cached.status === "fulfilled") setExamples(cached.value);
      else setExampleError(asError(cached.reason).message);
      setCatalogLoading(false);
    });
    return () => controller.abort();
  }, [catalogVersion]);

  useEffect(() => {
    const parsed = parseQueryParameters(window.location.search);
    setNotices(parsed.notices);
    setShareLink(window.location.href);
    setRequest(parsed.request);
    if (parsed.syntheticRequested) {
      setNotices(previous => [...previous, "This link requests a simulation. Choose Open simulation explicitly below to display generated test images."]);
    } else if (parsed.exampleId) {
      setPendingExampleId(parsed.exampleId);
    } else if (parsed.request) {
      void runQuery(parsed.request, false);
    }
    return () => stopPrevious();
  }, [runQuery, stopPrevious]);

  useEffect(() => {
    if (!pendingExampleId || catalogLoading) return;
    const example = examples.find(item => item.sequence_id === pendingExampleId);
    if (example) loadExample(example, false);
    else {
      setNotices(previous => [...previous, "That real example is no longer available. Repeat the restored search or choose another field."]);
      setPendingExampleId(null);
    }
  }, [pendingExampleId, catalogLoading, examples, loadExample]);

  return {
    sequence, request, displayedRequest, activeFrameId, setActiveFrameId, selection, setSelection,
    comparison, setComparison, tool, setTool, status, busy, presets, examples, catalogLoading,
    presetError, exampleError, notices, shareLink,
    runQuery, loadExample, loadSynthetic, cancelCurrent,
    refreshCatalog: () => setCatalogVersion(value => value + 1),
  };
}
