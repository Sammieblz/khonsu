"""Real holdouts for bounded visual completion; no recovered-measurement claim."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
from scipy.ndimage import binary_dilation, binary_erosion, find_objects, label

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'apps/api'))
from app.processing.gap_fill import POLICY, estimate_gaps


def holdouts(image, valid, scale):
    sky = float(np.median(image[valid]))
    sigma = float(1.4826*np.median(abs(image[valid]-sky)))
    rng = np.random.default_rng(70)
    candidates = np.argwhere(binary_erosion(valid, structure=np.ones((13, 13))))
    rng.shuffle(candidates)
    regions = []
    for y, x in candidates[:30]:
        regions.append(('interior', (slice(y-5, y+5), slice(x-3, x+4))))
    side = image.shape[0]
    for start in range(5, side-5, 10):
        for region in ((slice(0, 3), slice(start, start+5)), (slice(start, start+5), slice(0, 3)),
                       (slice(side-3, side), slice(start, start+5)), (slice(start, start+5), slice(side-3, side))):
            if valid[region].all():
                regions.append(('edge', region))
    peaks = np.argwhere(binary_erosion(valid, structure=np.ones((7, 7))))
    peaks = sorted(peaks, key=lambda point: float(image[tuple(point)]), reverse=True)
    chosen = []
    for y, x in peaks:
        if image[y, x] < sky+5*sigma or any(abs(y-cy)<7 and abs(x-cx)<7 for cy,cx in chosen):
            continue
        regions.append(('bright', (slice(y-2, y+3), slice(x-2, x+3))))
        chosen.append((y,x))
        if len(chosen)==8:
            break
    groups = {}
    for kind, region in regions:
        controls = valid.copy(); controls[region] = False
        held = valid & ~controls
        values, estimated = estimate_gaps(image, controls, scale)
        tested = held & estimated
        if not tested.any():
            continue
        boundary = binary_dilation(held) & valid
        # Only report this as a low-background holdout when its measured border
        # satisfies the old background criterion. Bright-source errors stay separate.
        category = kind if kind!='interior' or image[boundary].max()>sky+5*sigma else 'background'
        record = groups.setdefault(category, {'regions':0, 'errors':[]})
        record['regions'] += 1
        record['errors'].extend((abs(values[tested]-image[tested])/sigma).tolist())
    result = {}
    for kind, group in groups.items():
        error = np.asarray(group['errors'])
        result[kind] = {'accepted_regions':group['regions'], 'evaluated_pixels':len(error),
                        'median_absolute_error_sky_sigma':float(np.median(error)),
                        'p95_absolute_error_sky_sigma':float(np.percentile(error,95))}
    assert result['background']['evaluated_pixels'] >= 70
    assert result['background']['p95_absolute_error_sky_sigma'] < 3
    return result


def main():
    rows=[]
    historical=json.loads((ROOT/'docs/evidence/clean-view/science.json').read_text())['frames']
    for name in ('real-wise-0855','real-epsilon-indi-b'):
        folder=ROOT/'fixtures/real'/name
        m=json.loads((folder/'manifest.json').read_text()); n=m['grid']['width_px']
        scale=m['processing']['native_pixel_scale_arcsec']/(m['requested_fov_arcmin']*60/n)
        for frame in m['frames']:
            raw=(folder/(frame['frame_id']+'.bin')).read_bytes()
            image=np.frombuffer(raw,'<f4',count=n*n).reshape(n,n)
            valid=np.frombuffer(raw,np.uint8,offset=n*n*4).reshape(n,n)==1
            image_before=image.copy(); mask_before=valid.copy()
            started=time.perf_counter(); values,estimated=estimate_gaps(image,valid,scale); elapsed=time.perf_counter()-started
            fill=(folder/(frame['frame_id']+'-fill.bin')).read_bytes()
            np.testing.assert_allclose(values,np.frombuffer(fill,'<f4',count=n*n).reshape(n,n),atol=1e-6,rtol=0)
            np.testing.assert_array_equal(estimated,np.frombuffer(fill,np.uint8,offset=n*n*4).reshape(n,n))
            np.testing.assert_array_equal(image,image_before); np.testing.assert_array_equal(valid,mask_before)
            assert not (estimated & valid).any()
            labels,_=label(estimated,np.ones((3,3)))
            for identity,bounds in enumerate(find_objects(labels),1):
                component=labels==identity; boundary=binary_dilation(component)&valid
                assert values[component].min()>=image[boundary].min()-1e-6
                assert values[component].max()<=image[boundary].max()+1e-6
            old=next(row for row in historical if row['sequence']==name and row['frame']==frame['frame_id'])
            rows.append({'sequence':name,'frame':frame['frame_id'],'observation_id':frame['observation_id'],
                         'observed_start_utc':frame['observed_start_utc'],'input_raster_sha256':hashlib.sha256(raw).hexdigest(),
                         'previous_filled_pixels':old['estimated_pixels'],'filled_pixels':int(estimated.sum()),
                         'excluded_pixels':int((~valid).sum()),'remaining_pixels':int((~valid&~estimated).sum()),
                         'preparation_ms':elapsed*1000,'originals_unchanged':True,'boundary_bounds_pass':True,
                         'holdouts':holdouts(image,valid,scale)})
    output=ROOT/'docs/evidence/gap-completion'; output.mkdir(parents=True,exist_ok=True)
    report={'tested_at_utc':datetime.now(timezone.utc).isoformat(),'method':POLICY,'frames':rows,
            'limits':'Visual completion only. Edge values are extrapolated. Holdouts hide known samples, not the true missing signal. Bright peaks and unknown sources can be suppressed; no flux recovery, new coverage or detection claim.'}
    (output/'science.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(rows,indent=2))


if __name__=='__main__':
    main()
