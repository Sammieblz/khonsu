"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { PresetTarget } from '@/lib/api/client';
import { Icon } from "@/components/ui/Icon";
import { parseCoordinates, type CoordinateValues } from "./coordinates";
import type { SequenceRequest } from "./interfaces";
import styles from "./explorer.module.css";

/** A search restored from a shared link, or the reason a link could not be restored. */
export interface SharedLinkState { values: CoordinateValues | null; message: string }

export function CoordinateForm({ onSubmit, busy, target, shared = null }: { onSubmit: (request: SequenceRequest) => void; busy: boolean; target:PresetTarget|null; shared?: SharedLinkState | null }) {
  const [ra, setRa] = useState("");
  const [dec, setDec] = useState("");
  const [fov, setFov] = useState("6");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!shared?.values) return;
    setRa(String(shared.values.ra_deg));
    setDec(String(shared.values.dec_deg));
    setFov(String(shared.values.fov_arcmin));
    setError("");
  }, [shared]);
  useEffect(()=>{if(target?.ra_deg!=null&&target.dec_deg!=null){const parsed=parseCoordinates(String(target.ra_deg),String(target.dec_deg),"6");if(parsed.ok){setRa(String(target.ra_deg));setDec(String(target.dec_deg));setError('');}}},[target]);

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
      <p id="coordinate-help" className={styles.muted}>{target?`${target.label}: ${target.coordinate_note}`:shared?shared.message:'Enter ICRS decimal degrees, or choose a target below.'}</p>
      <div className={styles.commandFields}>
      <div>
      <label htmlFor="ra">Right Ascension <span>degrees</span></label>
      <input id="ra" name="ra" inputMode="decimal" type="number" step="any" min="0" max="360" placeholder="0.000000" value={ra} onChange={event => setRa(event.target.value)} required aria-invalid={!!error} />
      </div><div><label htmlFor="dec">Declination <span>degrees</span></label>
      <input id="dec" name="dec" inputMode="decimal" type="number" step="any" min="-90" max="90" placeholder="+0.000000" value={dec} onChange={event => setDec(event.target.value)} required aria-invalid={!!error} />
      </div><div><label htmlFor="fov">Field of view <span>arcminutes</span></label>
      <input id="fov" name="fov" inputMode="decimal" type="number" step="any" min="0.5" max="60" value={fov} onChange={event => setFov(event.target.value)} required aria-invalid={!!error} />
      </div><button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "SEARCHING" : "EXPLORE THE SKY"}<Icon name="arrow" /></button>
      </div>{error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.formNote}>Searches query real SPHEREx observations at NASA/IPAC IRSA and can take a few minutes. Results are temporary; repeat the search if it expires.</p>
    </form>
  );
}
