"""Evaluate display estimates on preserved real Draconis inputs, never photometry."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
from scipy.ndimage import binary_dilation, binary_erosion, label

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'apps/api'))
from app.processing.gap_fill import POLICY, estimate_gaps


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'.cache/draconis-fill/evaluation')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    folder = ROOT/'fixtures/validation/r-draconis-gap'
    manifest = json.loads((folder/'source-manifest.json').read_text())
    side = manifest['grid']['width_px']
    scale = manifest['processing']['native_pixel_scale_arcsec']/(manifest['requested_fov_arcmin']*60/side)
    rows = []
    for frame in manifest['frames']:
        raw = (folder/(frame['frame_id']+'.bin')).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == frame['raster']['sha256']
        image = np.frombuffer(raw, '<f4', count=side*side).reshape(side, side)
        valid = np.frombuffer(raw, np.uint8, offset=side*side*4).reshape(side, side) == 1
        started = time.perf_counter()
        values, estimated = estimate_gaps(image, valid, scale)
        elapsed = (time.perf_counter()-started)*1000
        labels, _ = label(~valid, structure=np.ones((3, 3)))
        core = labels == labels[side//2, side//2]
        boundary = binary_dilation(core) & valid
        assert estimated[core].all() and not estimated[valid].any()
        assert values[core].min() >= image[boundary].min()
        assert values[core].max() <= image[boundary].max()
        fill = values.astype('<f4').tobytes()+estimated.astype(np.uint8).tobytes()
        (args.output/(frame['frame_id']+'-fill.bin')).write_bytes(fill)
        sky = np.median(image[valid])
        sigma = 1.4826*np.median(abs(image[valid]-sky))
        candidates = np.argwhere(binary_erosion(valid, structure=np.ones((19, 19))))
        candidates = sorted(candidates, key=lambda point: float(image[tuple(point)]), reverse=True)
        selected, holdouts = [], []
        for y, x in candidates:
            if any(abs(y-cy)<19 and abs(x-cx)<19 for cy, cx in selected):
                continue
            controls = valid.copy(); controls[y-8:y+9, x-8:x+9] = False
            hidden = valid & ~controls
            prediction, mask = estimate_gaps(image, controls, scale)
            assert mask[hidden].all()
            error = abs(prediction[hidden]-image[hidden])
            holdouts.append({'center_xy': [int(x), int(y)], 'pixels': int(hidden.sum()),
                             'median_absolute_error_mjy_sr': float(np.median(error)),
                             'p95_absolute_error_sky_sigma': float(np.percentile(error, 95)/sigma)})
            selected.append((y, x))
            if len(selected) == 8:
                break
        assert holdouts
        rows.append({'frame': frame['frame_id'], 'observation_id': frame['observation_id'],
                     'release': frame['release'], 'observed_start_utc': frame['observed_start_utc'],
                     'input_raster_sha256': frame['raster']['sha256'],
                     'fill_sha256': hashlib.sha256(fill).hexdigest(),
                     'central_mask_pixels': int(core.sum()), 'estimated_pixels': int(estimated.sum()),
                     'remaining_unfilled_pixels': int((~valid & ~estimated).sum()),
                     'central_estimate_range_mjy_sr': [float(values[core].min()), float(values[core].max())],
                     'boundary_range_mjy_sr': [float(image[boundary].min()), float(image[boundary].max())],
                     'preparation_ms': elapsed, 'holdouts': holdouts})
    report = {'tested_at_utc': datetime.now(timezone.utc).isoformat(), 'policy': POLICY,
              'frames': rows,
              'limits': 'Boundary-based display estimates only. Real masked core truth is unknown. Holdouts hide measured pixels elsewhere and do not validate target flux, a hidden peak or variability.'}
    (args.output/'science.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'frames': [{k: row[k] for k in ('frame', 'central_mask_pixels', 'estimated_pixels', 'remaining_unfilled_pixels', 'preparation_ms')} for row in rows]}))


if __name__ == '__main__':
    main()
