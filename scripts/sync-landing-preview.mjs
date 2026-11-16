// Copy only genuine prepared previews and a small, reproducible provenance index.
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const report=await read('docs/target-coverage.json'),manifest=await read('fixtures/real/real-wise-0855/manifest.json');
const directory=new URL('apps/web/public/art/observations/',root);await mkdir(directory,{recursive:true});
const frames=[];
for(const frame of [manifest.frames[0],manifest.frames.at(-1)]){
 const name=frame.frame_id+'.png',source=new URL('fixtures/real/real-wise-0855/'+name,root);
 await copyFile(source,new URL(name,directory));
 frames.push({frame_id:frame.frame_id,image_url:'/art/observations/'+name,observed_start_utc:frame.observed_start_utc,observation_id:frame.observation_id,release:frame.release,wavelength_um:frame.wavelength_um,source_fits_url:frame.source_fits_url,sha256:createHash('sha256').update(await readFile(source)).digest('hex')});
}
const index={checked_at_utc:report.checked_at_utc,sequence_id:manifest.sequence_id,frame_count:manifest.frames.length,grid:manifest.grid,width:manifest.grid.width_px,height:manifest.grid.height_px,frames,targets:report.targets.map(t=>({preset_id:t.preset_id,label:t.label,object_type:t.object_type,ra_deg:t.ra_deg,dec_deg:t.dec_deg,checked_at_utc:t.checked_at_utc,status:t.status,usable_frame_count:t.usable_frame_count,science_note:t.science_note}))};
await writeFile(new URL('apps/web/src/features/explorer/landing-data.json',root),JSON.stringify(index,null,2)+'\n');
