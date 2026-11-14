"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { formValuesForRequest, validateSearchForm, type SearchFormValues } from "./query";
import type { SequenceRequest } from "./interfaces";
import styles from "./explorer.module.css";

export function CoordinateForm({ request, onSubmit, busy }: { request: SequenceRequest | null; onSubmit: (request: SequenceRequest) => void; busy: boolean }) {
  const [values, setValues] = useState<SearchFormValues>(() => formValuesForRequest(request));
  const [error, setError] = useState("");
  useEffect(() => { setValues(formValuesForRequest(request)); setError(""); }, [request]);
  function update(key: keyof SearchFormValues, value: string) { setValues(previous => ({ ...previous, [key]: value })); }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateSearchForm(values);
    if (!result.ok) { setError(result.message); return; }
    setError("");
    onSubmit(result.request);
  }

  return (
    <form className={styles.coordinateForm} onSubmit={submit} aria-describedby="coordinate-help">
      <div className={styles.formHeading}><span className={styles.eyebrow}>01 / CHOOSE A FIELD</span><span className={styles.smallLabel}>ICRS</span></div>
      <h2>Your window<br />into the sky.</h2>
      <p id="coordinate-help" className={styles.muted}>Enter Right Ascension and declination in decimal degrees. We will compare available observations of the same field.</p>
      <label htmlFor="ra">Right Ascension <span>degrees</span></label>
      <input id="ra" name="ra" inputMode="decimal" type="number" step="any" min="0" max="360" placeholder="0.000000" value={values.ra} onChange={event => update("ra", event.target.value)} required aria-invalid={!!error} aria-describedby={error ? "coordinate-error" : undefined} />
      <label htmlFor="dec">Declination <span>degrees</span></label>
      <input id="dec" name="dec" inputMode="decimal" type="number" step="any" min="-90" max="90" placeholder="+0.000000" value={values.dec} onChange={event => update("dec", event.target.value)} required aria-invalid={!!error} aria-describedby={error ? "coordinate-error" : undefined} />
      <label htmlFor="fov">Field of view <span>arcminutes</span></label>
      <input id="fov" name="fov" inputMode="decimal" type="number" step="any" min="0.5" max="60" value={values.fov} onChange={event => update("fov", event.target.value)} required aria-invalid={!!error} aria-describedby={error ? "coordinate-error" : undefined} />
      <details className={styles.filters}>
        <summary>Observation filters</summary>
        <label htmlFor="max-frames">Maximum frames <span>2 to 96</span></label>
        <input id="max-frames" type="number" min="2" max="96" step="1" value={values.maxFrames} onChange={event => update("maxFrames", event.target.value)} required />
        <label htmlFor="detector">Detector</label>
        <select id="detector" value={values.detector} onChange={event => update("detector", event.target.value)}><option value="">All available</option>{[1, 2, 3, 4, 5, 6].map(detector => <option key={detector} value={detector}>Detector {detector}</option>)}</select>
        <div className={styles.filterPair}><div><label htmlFor="wave-min">Minimum wavelength</label><input id="wave-min" type="number" step="any" min="0.75" max="5" placeholder="0.75" value={values.wavelengthMin} onChange={event => update("wavelengthMin", event.target.value)} /></div><div><label htmlFor="wave-max">Maximum wavelength</label><input id="wave-max" type="number" step="any" min="0.75" max="5" placeholder="5.0" value={values.wavelengthMax} onChange={event => update("wavelengthMax", event.target.value)} /></div></div>
        <p className={styles.formNote}>Wavelengths are in micrometers. A detector alone does not guarantee matched wavelength samples.</p>
        <label htmlFor="start-date">Start date <span>UTC</span></label><input id="start-date" type="datetime-local" value={values.start} onChange={event => update("start", event.target.value)} />
        <label htmlFor="end-date">End date <span>UTC</span></label><input id="end-date" type="datetime-local" value={values.end} onChange={event => update("end", event.target.value)} />
      </details>
      {error && <p id="coordinate-error" className={styles.error} role="alert">{error}</p>}
      <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "SEARCH IN PROGRESS" : "EXPLORE THIS FIELD"}<Icon name="arrow" /></button>
      <p className={styles.formNote}>Searches use real archive observations. Missing or incompatible coverage is reported without substituting a simulated sky.</p>
    </form>
  );
}
