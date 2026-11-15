"""Offline real-image holdout checks; hidden valid pixels are an evaluation control.

This does not establish truth inside the archive's rejected areas. Uses only the
five reviewed prepared observations and never treats another date as a fill.
"""
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
from scipy.ndimage import binary_erosion

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))
from app.processing.gap_fill import POLICY, estimate_gaps


def main():
    results = []
    for name in ('real-wise-0855', 'real-epsilon-indi-b'):
        folder = ROOT / 'fixtures/real' / name
        manifest = json.loads((folder / 'manifest.json').read_text())
        w, h = manifest['grid']['width_px'], manifest['grid']['height_px']
        scale = manifest['processing']['native_pixel_scale_arcsec'] / (manifest['requested_fov_arcmin'] * 60 / w)
        for frame in manifest['frames']:
            raw = (folder / (frame['frame_id'] + '.bin')).read_bytes()
            image = np.flipud(np.frombuffer(raw, '<f4', count=w*h).reshape(h, w))
            valid = np.flipud(np.frombuffer(raw, np.uint8, offset=w*h*4).reshape(h, w)) == 1
            before = image.copy()
            started = time.perf_counter()
            values, estimated = estimate_gaps(image, valid, scale)
            elapsed = time.perf_counter() - started
            assert not (estimated & valid).any()
            np.testing.assert_array_equal(image, before)
            fill = (folder / (frame['frame_id'] + '-fill.bin')).read_bytes()
            np.testing.assert_array_equal(np.flipud(values), np.frombuffer(fill, '<f4', count=w*h).reshape(h, w))
            np.testing.assert_array_equal(np.flipud(estimated), np.frombuffer(fill, np.uint8, offset=w*h*4).reshape(h, w))
            eligible = binary_erosion(valid, structure=np.ones((9, 9)))
            candidates = np.argwhere(eligible)
            rng = np.random.default_rng(66)
            rng.shuffle(candidates)
            controls = valid.copy()
            occupied = np.zeros_like(valid)
            centers = 0
            for y, x in candidates:
                if occupied[y-4:y+5, x-4:x+5].any():
                    continue
                radius = centers % 3  # One-, three- and five-pixel wide holdouts.
                controls[y-radius:y+radius+1, x-radius:x+radius+1] = False
                occupied[y-4:y+5, x-4:x+5] = True
                centers += 1
                if centers == 30:
                    break
            recovered, mask = estimate_gaps(image, controls, scale)
            held = valid & ~controls
            tested = held & mask
            sigma = float(1.4826 * np.median(np.abs(image[valid] - np.median(image[valid]))))
            error = np.abs(recovered[tested] - image[tested])
            assert tested.sum() > 20, 'Insufficient real holdout coverage'
            assert float(np.median(error)) < 3*sigma, 'Poor real-pixel interpolation'
            assert float(np.percentile(error, 95)) < 3*sigma, 'Bright structure is being filled too aggressively'
            results.append({
                'sequence': name, 'frame': frame['frame_id'], 'observation_id': frame['observation_id'],
                'observed_start_utc': frame['observed_start_utc'], 'release': frame['release'],
                'input_raster_sha256': hashlib.sha256(raw).hexdigest(),
                'estimated_pixels': int(estimated.sum()), 'original_masked_pixels': int((~valid).sum()),
                'masked_pixels_filled_fraction': float(estimated.sum()/(~valid).sum()),
                'preparation_ms': elapsed*1000, 'holdout_regions': centers,
                'held_pixels': int(held.sum()), 'evaluated_pixels': int(tested.sum()),
                'median_absolute_error_sky_sigma': float(np.median(error)/sigma),
                'p95_absolute_error_sky_sigma': float(np.percentile(error, 95)/sigma),
                'original_samples_unchanged': True,
            })
    output = ROOT / 'docs/evidence/clean-view'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'science.json').write_text(json.dumps({
        'method': POLICY, 'frames': results,
        'limits': 'Holdouts hide valid measured pixels, not the true missing signal. Estimates are smooth local guesses; faint sources can be missed. No optical resolution, recovered flux or new coverage is claimed.'
    }, indent=2) + '\n')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
