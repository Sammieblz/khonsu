import type {SequenceManifest, ObservationFrame} from '@/features/explorer/interfaces';
import type {GaiaContext} from '@/lib/api/client';
import type {Raster} from '@/features/viewer/display';
import {pixelQuality} from './quality';
import {WiseReference} from './WiseReference';
import styles from './context.module.css';

interface Props {
  sequence:SequenceManifest; active:ObservationFrame; raster?:Raster; cursor:{x:number;y:number}; estimatesShown:boolean;
  gaiaEnabled:boolean; onGaia:(value:boolean)=>void; gaia:{data:GaiaContext|null;error:string;loading:boolean;retry:()=>void};
  selected:string; onSelect:(id:string)=>void; wiseEnabled:boolean; onWise:(value:boolean)=>void;
  qualityEnabled:boolean; onQuality:(value:boolean)=>void; onInspect:()=>void;
  open:boolean; onOpen:(value:boolean)=>void;
}
export function ContextPanel(props:Props) {
  const {sequence,active,raster,cursor,estimatesShown,gaiaEnabled,onGaia,gaia,selected,onSelect,wiseEnabled,onWise,qualityEnabled,onQuality,onInspect}=props;
  const sources=gaia.data?.sources.filter(source=>source.positions.some(point=>point.frame_id===active.frame_id))??[];
  const source=sources.find(item=>item.source_id===selected);
  const point=source?.positions.find(item=>item.frame_id===active.frame_id);
  const quality=pixelQuality(raster,cursor.x,cursor.y,estimatesShown);
  return <details className={styles.panel} open={props.open} onToggle={event=>props.onOpen(event.currentTarget.open)}>
    <summary>LAYERS &amp; SKY CONTEXT <span>{[gaiaEnabled&&'Gaia',wiseEnabled&&'WISE',qualityEnabled&&'Quality'].filter(Boolean).join(' · ')||'Optional reference tools'}</span></summary>
    <div className={styles.switches}>
      <label><input type="checkbox" checked={gaiaEnabled} disabled={sequence.data_mode==='synthetic'} onChange={event=>onGaia(event.target.checked)}/> Known sources / Gaia DR3</label>
      <label><input type="checkbox" checked={wiseEnabled} disabled={sequence.data_mode==='synthetic'} onChange={event=>onWise(event.target.checked)}/> WISE reference pane</label>
      <label><input type="checkbox" checked={qualityEnabled} disabled={!raster} onChange={event=>onQuality(event.target.checked)}/> Quality overlay</label>
    </div>
    {qualityEnabled&&<p>Amber: warning sample. Blue: estimate available. Violet: no usable sample. Accepted samples are uncolored. Turning this layer off does not restore missing measurements.</p>}
    <section className={styles.inspector} aria-label="Pixel quality inspector">
      <div className={styles.actions}><h3>WHAT IS THIS PIXEL?</h3><button onClick={onInspect}>INSPECT PIXEL</button></div>
      <p>Choose Inspect, then select the image, or focus the canvas and use arrow keys. No candidate is created.</p>
      <p data-pixel-quality={quality.kind}><strong>Pixel {cursor.x}, {cursor.y}: {quality.title}.</strong> {quality.detail}</p>
      <p>The prepared mask stores quality classes, not each original contamination bit. For the exact cause, inspect the source FITS FLAGS extension and its MSKN definitions under Observation details &amp; quality.</p>
    </section>
    {gaiaEnabled&&<section aria-label="Gaia catalog sources">
      <h3>KNOWN SOURCES / GAIA DR3</h3>
      {gaia.loading&&<p role="status">Looking up catalog sources for this field...</p>}
      {gaia.error&&<p role="alert">{gaia.error} <button onClick={gaia.retry}>RETRY GAIA</button></p>}
      {gaia.data&&<>
        <p>{sources.length} catalog sources in this observation's field. Solid rings: proper motion applied. Dashed rings: catalog position only. Rings do not establish a match or detection.</p>
        {gaia.data.truncated&&<p role="status">Limited catalog: only the first {gaia.data.row_limit} rows by G magnitude were searched for this grid. Try a smaller field.</p>}
        {sources.length>0?<label className={styles.sourceChoice}>Inspect catalog source<select aria-label="Inspect catalog source" value={source?.source_id??''} onChange={event=>onSelect(event.target.value)}>
          <option value="">Select a ring or choose a source</option>
          {sources.map(item=><option key={item.source_id} value={item.source_id}>{item.source_id}{item.g_magnitude!=null?` / G ${item.g_magnitude.toFixed(2)}`:''}</option>)}
        </select></label>:<p>No catalog sources were returned inside this grid. This does not mean the sky is empty or that an unmarked feature is new.</p>}
        {source&&point&&<dl className={styles.facts}>
          <dt>Gaia DR3 source</dt><dd>{source.source_id}</dd>
          <dt>Catalog position</dt><dd>{source.ra_deg.toFixed(7)}°, {source.dec_deg.toFixed(7)}° / epoch J{source.ref_epoch}</dd>
          <dt>Position shown</dt><dd>{point.ra_deg.toFixed(7)}°, {point.dec_deg.toFixed(7)}° / {source.position_method==='proper-motion'?`proper motion to ${active.observed_start_utc}`:`unchanged catalog epoch J${source.ref_epoch}; motion unavailable`}</dd>
          <dt>G magnitude</dt><dd>{source.g_magnitude?.toFixed(3)??'Unavailable'} (optical, not SPHEREx flux)</dd>
          <dt>Proper motion</dt><dd>RA × cos Dec {source.pmra_mas_yr??'unknown'}, Dec {source.pmdec_mas_yr??'unknown'} mas/year</dd>
        </dl>}
        <details><summary>Catalog provenance &amp; limits</summary><p><a href={gaia.data.catalog_url} target="_blank" rel="noreferrer">ESA Gaia / DPAC, served by {gaia.data.provider}</a>. Retrieved {gaia.data.retrieved_at_utc}.</p><ul>{gaia.data.notes.map(note=><li key={note}>{note}</li>)}</ul><a href={gaia.data.query_url} target="_blank" rel="noreferrer">REPRODUCE CATALOG QUERY</a></details>
      </>}
    </section>}
    {wiseEnabled&&<WiseReference sequence={sequence}/>}
  </details>;
}
