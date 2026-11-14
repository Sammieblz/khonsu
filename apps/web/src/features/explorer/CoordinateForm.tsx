"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { parseCoordinates } from "./coordinates";
import type { SequenceRequest } from "./interfaces";
import styles from "./explorer.module.css";

export function CoordinateForm({ onSubmit, busy }: { onSubmit: (request: SequenceRequest) => void; busy: boolean }) {
  const [ra, setRa] = useState("");
  const [dec, setDec] = useState("");
  const [fov, setFov] = useState("6");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parseCoordinates(ra, dec, fov);
    if (!result.ok) { setError(result.message); return; }
    setError("");
    // 16 frames completed a live IRSA search in about 214 s on 2026-11-14,
    // inside the API's 240 s job budget; 24 risked JOB_TIMEOUT under load.
    onSubmit({ ...result.value, coordinate_frame: "ICRS", max_frames: 16 });
  }

  return (
    <form className={styles.coordinateForm} onSubmit={submit} aria-describedby="coordinate-help">
      <div className={styles.formHeading}><span className={styles.eyebrow}>01 / CHOOSE A FIELD</span><span className={styles.smallLabel}>ICRS</span></div>
      <h2>Your window<br />into the sky.</h2>
      <p id="coordinate-help" className={styles.muted}>Enter Right Ascension and declination in decimal degrees. We will compare available observations of the same field.</p>
      <label htmlFor="ra">Right Ascension <span>degrees</span></label>
      <input id="ra" name="ra" inputMode="decimal" type="number" step="any" min="0" max="360" placeholder="0.000000" value={ra} onChange={event => setRa(event.target.value)} required aria-invalid={!!error} />
      <label htmlFor="dec">Declination <span>degrees</span></label>
      <input id="dec" name="dec" inputMode="decimal" type="number" step="any" min="-90" max="90" placeholder="+0.000000" value={dec} onChange={event => setDec(event.target.value)} required aria-invalid={!!error} />
      <label htmlFor="fov">Field of view <span>arcminutes</span></label>
      <input id="fov" name="fov" inputMode="decimal" type="number" step="any" min="0.5" max="60" value={fov} onChange={event => setFov(event.target.value)} required aria-invalid={!!error} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "CONTACTING ARCHIVE" : "EXPLORE THIS FIELD"}<Icon name="arrow" /></button>
      <p className={styles.formNote}>Searches query real SPHEREx observations at NASA/IPAC IRSA and can take a few minutes. Results are temporary; repeat the search if it expires.</p>
    </form>
  );
}
