"""Reproduce real display diagnostics and explicitly synthetic faint-source controls."""
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time

import numpy as np
from astropy import log
from astropy.wcs import WCS
from scipy.ndimage import binary_erosion, maximum_filter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'apps/api'))
from app.processing.refinement import STRENGTH, prepare_refinement
from app.processing.resolution import reduce_grain, tone

spec = importlib.util.spec_from_file_location('prepare_refined', ROOT/'scripts/prepare-refined-examples.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def mad(values):
    return float(1.4826*np.median(abs(values-np.median(values))))


def centroid(values):
    y, x = np.indices(values.shape)
    total = values.sum()
    return np.array([(x*values).sum()/total, (y*values).sum()/total])


def synthetic():
    rows = []
    y, x = np.indices((64, 64))
    valid = np.ones(x.shape, bool)
    variance = np.ones(x.shape)
    for width in (.7, 1.2):
        for amplitude in (3., 5., 10., 50.):
            flux, peaks, shifts = [], [], []
            for seed in range(16):
                rng = np.random.default_rng(6800+seed)
                noise = rng.normal(0, 1, x.shape)
                center = (31.2+(seed % 4)*.15, 31.3)
                signal = amplitude*np.exp(-((x-center[0])**2+(y-center[1])**2)/(2*width**2))
                before = noise.copy()
                filtered = reduce_grain(noise+signal, valid, variance, strength=STRENGTH)[0]
                baseline = reduce_grain(noise, valid, variance, strength=STRENGTH)[0]
                difference = filtered-baseline
                region = np.s_[24:40, 24:40]
                flux.append(float(difference[region].sum()/signal[region].sum()))
                peaks.append(float(difference.max()/signal.max()))
                shifts.append(float(np.linalg.norm(centroid(difference[region])-centroid(signal[region]))))
                np.testing.assert_array_equal(noise, before)
            assert min(peaks) > .75 and max(shifts) < .12, 'Faint-source display distortion exceeds the tested bound'
            assert min(flux) > .95 and max(flux) < 1.15, 'Unexpected aperture redistribution in the synthetic control'
            rows.append({'kind':'synthetic injections, not real detections', 'peak_to_noise_sigma':amplitude,
                         'gaussian_width_native_px':width, 'noise_realizations':16,
                         'aperture_flux_ratio_min':min(flux), 'aperture_flux_ratio_max':max(flux),
                         'peak_ratio_min':min(peaks), 'max_centroid_change_native_px':max(shifts)})
    return rows


def main():
    log.setLevel('WARNING')
    frames = []
    for name in ('real-wise-0855','real-epsilon-indi-b'):
        folder = ROOT/'fixtures/real'/name
        manifest=json.loads((folder/'manifest.json').read_text()); lineage=json.loads((folder/'lineage.json').read_text())
        side=manifest['grid']['width_px']; wcs=WCS(manifest['grid']['wcs_header'])
        for frame in manifest['frames']:
            loaded=prepare.load_source(folder,manifest,frame,lineage)
            before=loaded.science.copy(); flags=loaded.valid.copy()
            raw=(folder/(frame['frame_id']+'.bin')).read_bytes()
            original=np.flipud(np.frombuffer(raw,'<f4',count=side*side).reshape(side,side))
            valid=np.flipud(np.frombuffer(raw,np.uint8,offset=side*side*4).reshape(side,side))==1
            start=time.perf_counter(); trial,_=prepare_refinement(loaded,wcs,side,valid); elapsed=time.perf_counter()-start
            np.testing.assert_array_equal(loaded.science,before); np.testing.assert_array_equal(loaded.valid,flags)
            saved=(folder/(frame['frame_id']+'-refined.bin')).read_bytes()
            np.testing.assert_array_equal(np.flipud(trial).astype('<f4').ravel()[np.flipud(valid).ravel()],np.frombuffer(saved,'<f4',count=side*side)[np.flipud(valid).ravel()])
            sky=valid&(original < np.percentile(original[valid],45))
            safe=binary_erosion(valid,structure=np.ones((7,7)))
            peaks=safe&(original==maximum_filter(original,size=7))&(original>np.percentile(original[valid],97))
            shifts=[]; flux=[]
            background=float(np.median(original[sky]))
            for cy,cx in np.argwhere(peaks):
                region=np.s_[cy-3:cy+4,cx-3:cx+4]
                a=np.maximum(0,original[region]-background); b=np.maximum(0,trial[region]-background)
                if a.sum()>0 and b.sum()>0:
                    shifts.append(float(np.linalg.norm(centroid(a)-centroid(b))))
                    flux.append(float(b.sum()/a.sum()))
            low,high=manifest['display']['vmin'],manifest['display']['vmax']
            standard=tone(original[valid],low,high,softness=.3); shoulder=tone(original[valid],low,high,softness=.3,shoulder=True)
            ratio=mad(trial[sky])/mad(original[sky])
            assert .65 < ratio < 1.02, 'Unexpected background-texture change'
            assert max(shifts,default=0) < .15, 'Bright peak moved too far on the prepared grid'
            frames.append({'sequence':name,'observation_id':frame['observation_id'],'observed_start_utc':frame['observed_start_utc'],
                'input_raster_sha256':hashlib.sha256(raw).hexdigest(),'native_fits_sha256':lineage['quality_revision'][frame['frame_id']]['raw_sha256'],
                'settings':{k:v for k,v in frame['refinement'].items() if k!='raster'},'preparation_ms':elapsed*1000,
                'fixed_sky_mad_ratio':ratio,'reference_peaks':len(shifts),'max_centroid_change_grid_px':max(shifts,default=None),
                'bright_aperture_ratio_min':min(flux,default=None),'bright_aperture_ratio_max':max(flux,default=None),
                'near_white_fraction_standard':float(np.mean(standard>=254.5/255)),
                'near_white_fraction_soft_highlights':float(np.mean(shoulder>=254.5/255)),
                'original_and_validity_unchanged':True})
    report={'tested_at_utc':datetime.now(timezone.utc).isoformat(),'strength':STRENGTH,'real_frames':frames,'synthetic_controls':synthetic(),
            'limits':'Display diagnostics only. Fixed sky scatter includes structure and correlated resampling, not isolated detector noise. Synthetic injections quantify attenuation, not completeness. No stacking, PSF recovery or new resolution is claimed.'}
    directory=ROOT/'docs/evidence/refinement'; directory.mkdir(parents=True,exist_ok=True)
    (directory/'science.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
