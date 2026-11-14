"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/ui/Brand";
import { AnnotationPanel } from "@/features/annotations/AnnotationPanel";
import { useAnnotations } from "@/features/annotations/useAnnotations";
import { SkyViewer } from "@/features/viewer/SkyViewer";
import { ApiClientError, requestSequence } from "@/lib/api/client";
import { CoordinateForm } from "./CoordinateForm";
import { TargetPresets } from "./TargetPresets";
import type { ImageSelection, SequenceManifest, SequenceRequest } from "./interfaces";
import styles from "./explorer.module.css";

export function ExplorerScreen() {
  const [sequence] = useState<SequenceManifest | null>(null);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [selection, setSelection] = useState<ImageSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [serviceMessage, setServiceMessage] = useState("");
  const pendingRequest = useRef<AbortController | null>(null);
  const { annotations, addAnnotation, removeAnnotation } = useAnnotations();

  useEffect(() => () => pendingRequest.current?.abort(), []);

  async function submit(request: SequenceRequest) {
    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;
    setBusy(true);
    setServiceMessage("");
    try {
      await requestSequence(request, controller.signal);
      setServiceMessage("The service accepted a response. The job-to-viewer integration is reserved for the next implementation slice.");
    } catch (error) {
      if (controller.signal.aborted) return;
      setServiceMessage(error instanceof ApiClientError
        ? `${error.code}: ${error.message}`
        : "The local observation service is unavailable. Start the backend container or configure its public address.");
    } finally {
      if (pendingRequest.current === controller) setBusy(false);
    }
  }

  return (
    <div id="top" className={styles.site}>
      <a className="skip-link" href="#explorer">Skip to the explorer</a>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Main navigation"><a href="#explorer">EXPLORER</a><a href="#guide">HOW TO LOOK</a><a href="https://spherex.caltech.edu/" target="_blank" rel="noreferrer">THE MISSION <span aria-hidden="true">↗</span></a></nav>
        <span className={styles.buildLabel}>DEVELOPMENT SCAFFOLD</span>
      </header>

      <main>
        <section className={styles.introduction} aria-labelledby="hero-title">
          <div><span className={styles.eyebrow}>A DIFFERENT WAY TO LOOK BACK</span><h1 id="hero-title">REWIND THE SKY.<br /><span>REVEAL THE CHANGE.</span></h1></div>
          <p>One sky. Many moments.<br />Explore the changing infrared sky through observations from NASA's SPHEREx mission.</p>
        </section>

        <section id="explorer" className={styles.workspace} aria-label="Sky observation explorer">
          <div className={styles.mainInstrument}>
            <SkyViewer sequence={sequence} activeFrameId={activeFrameId} annotations={annotations} onFrameChange={setActiveFrameId} onSelect={setSelection} />
            <TargetPresets />
          </div>
          <aside className={styles.sidePanel} aria-label="Field selection and candidate notes">
            <CoordinateForm onSubmit={submit} busy={busy} />
            {serviceMessage && <p className={styles.serviceMessage} role="status">{serviceMessage}</p>}
            <AnnotationPanel selection={selection} annotations={annotations.filter(item => item.selection.sequenceId === sequence?.sequence_id)} onAdd={addAnnotation} onRemove={removeAnnotation} />
          </aside>
        </section>

        <section id="guide" className={styles.guide} aria-labelledby="guide-title">
          <div><span className={styles.eyebrow}>THE OBSERVER'S FIELD GUIDE</span><h2 id="guide-title">Pause. Compare. Notice.</h2></div>
          <ol><li><span>01</span><h3>Choose your field</h3><p>Search a sky position, then review the observations that actually cover it.</p></li><li><span>02</span><h3>Move through time</h3><p>Compare dated frames with matching coordinates and compatible wavelength coverage.</p></li><li><span>03</span><h3>Keep the evidence</h3><p>Mark a candidate and record its frame, position, and quality information. A change still needs verification.</p></li></ol>
        </section>
      </main>

      <footer className={styles.footer}><span>KHONSU / BYTEBOYZ</span><p>NASA Space Apps Challenge 2026. Independent participant project.</p><a href="https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/" target="_blank" rel="noreferrer">CHALLENGE BRIEF ↗</a></footer>
    </div>
  );
}
