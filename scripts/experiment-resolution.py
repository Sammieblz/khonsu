"""Build the isolated, static resolution comparison from native FITS inputs.

No network access. Run probe-resolution.py --download first for the bounded
compatibility audit. Existing enhancement raw inputs supply the two real views.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import itertools
from importlib.metadata import version
import json
from pathlib import Path
import sys

import numpy as np
from astropy import log
from astropy.io import fits
from astropy.wcs import WCS
from PIL import Image
from scipy.ndimage import binary_erosion, maximum_filter
from scipy.special import erf

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))
from app.interfaces import ObservationInput, ProcessingOptions
from app.processing.alignment import output_wcs, auto_grid_size, reproject_observation
from app.processing.fits_reader import read_observation
from app.processing.resolution import DropPlane, compatibility, drizzle, reduce_grain, sample_masked, tone

OUTPUT = ROOT / 'apps/web/public/experiments/resolution'
EVIDENCE = ROOT / 'docs/evidence/resolution'
DISPLAY_SIZE = 768


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')


def source_input(path, frame):
    return ObservationInput(path, frame['observation_id'], datetime.fromisoformat(frame['observed_start_utc'].replace('Z', '+00:00')),
                            datetime.fromisoformat(frame['observed_end_utc'].replace('Z', '+00:00')), frame['detector'], frame['release'], frame['source_fits_url'])


def on_grid(values, valid, source_wcs, target_wcs, size, cubic=False):
    # Chunk rows to bound intermediate WCS and interpolation memory.
    image, mask = np.full((size, size), np.nan), np.zeros((size, size), dtype=bool)
    for start in range(0, size, 96):
        y, x = np.mgrid[start:min(size, start+96), :size]
        ra, dec = target_wcs.all_pix2world(x, y, 0)
        sx, sy = source_wcs.all_world2pix(ra, dec, 0)
        image[start:start+len(y)], mask[start:start+len(y)] = sample_masked(values, valid, sx, sy, cubic=cubic)
    return image, mask


def enlarge(values, valid, size):
    y, x = np.mgrid[:size, :size]
    return sample_masked(values, valid, (x+.5)*values.shape[1]/size-.5, (y+.5)*values.shape[0]/size-.5)


def save_view(name, values, valid, limits):
    assets = {}
    for shoulder in [False, True]:
        mapped = tone(values, *limits, shoulder=shoulder, softness=.3)
        gray = np.rint(mapped*255).astype(np.uint8)
        rgb = np.repeat(gray[..., None], 3, axis=2)
        rgb[~valid] = 0
        rgba = np.dstack((rgb, np.where(valid, 255, 0).astype(np.uint8)))
        filename = f'{name}-{"shoulder" if shoulder else "standard"}.png'
        Image.fromarray(np.flipud(rgba)).save(OUTPUT / filename)
        assets['shoulder' if shoulder else 'standard'] = '/experiments/resolution/' + filename
    return assets


def diagnostics(baseline, trial, valid, arcsec):
    """Comparative diagnostics, never true-source photometry or error bars."""
    common = valid & np.isfinite(baseline) & np.isfinite(trial)
    sky = common & (baseline < np.percentile(baseline[common], 45))
    def sigma(data):
        a = data[sky]
        return float(1.4826*np.median(abs(a-np.median(a))))
    # A square exclusion includes diagonal neighbours in every 7x7 peak patch.
    safe = binary_erosion(common, structure=np.ones((3, 3)), iterations=4)
    peaks = safe & (baseline == maximum_filter(np.nan_to_num(baseline, nan=-1e10), size=7))
    peaks &= baseline > np.percentile(baseline[common], 98)
    coordinates = sorted(np.argwhere(peaks), key=lambda p: -baseline[tuple(p)])[:15]
    shifts, width_a, width_b = [], [], []
    for cy, cx in coordinates:
        patch = np.s_[cy-3:cy+4, cx-3:cx+4]
        y, x = np.mgrid[-3:4, -3:4]
        moments = []
        for image in [baseline, trial]:
            weights = np.maximum(0, image[patch]-np.median(image[sky]))
            if weights.sum() <= 0:
                break
            mx, my = np.sum(x*weights)/weights.sum(), np.sum(y*weights)/weights.sum()
            width = 2.355*np.sqrt(np.sum(((x-mx)**2+(y-my)**2)*weights)/(2*weights.sum()))*arcsec
            moments.append((mx, my, width))
        if len(moments) == 2:
            a, b = moments
            shifts.append(float(np.hypot(a[0]-b[0], a[1]-b[1])*arcsec))
            width_a.append(float(a[2])); width_b.append(float(b[2]))
    return {'background_mad_original': sigma(baseline), 'background_mad_trial': sigma(trial),
            'reference_peaks': len(shifts), 'max_centroid_change_arcsec': max(shifts, default=None),
            'median_moment_width_original_arcsec': float(np.median(width_a)) if width_a else None,
            'median_moment_width_trial_arcsec': float(np.median(width_b)) if width_b else None,
            'note': 'Same fixed sky pixels and peak patches. Width is a moment diagnostic, not a fitted PSF FWHM or validated resolution.'}


def audit_groups(acquisition):
    results = []
    for target in acquisition['targets']:
        rows = [r for r in target['candidates'] if r.get('status') == 'inspected']
        reasons, accepted = {}, []
        for group in itertools.combinations(rows, 3):
            reason = compatibility(group)
            if reason:
                reasons[reason] = reasons.get(reason, 0)+1
            else:
                accepted.append(group)
        results.append({'id': target['id'], 'title': target['title'], 'inspected': len(rows),
                        'failed': sum(r.get('status') == 'failed' for r in target['candidates']),
                        'triples_checked': sum(reasons.values())+len(accepted), 'rejections': reasons,
                        'candidate_groups': [[r['observation_id'] for r in group] for group in accepted],
                        'status': 'requires_full_field_spectral_and_registration_validation' if accepted else 'insufficient_compatible_coverage',
                        'note': 'Bounded sample only; this does not establish absence of suitable coverage elsewhere in the archive.'})
    return results


def real_field(name, audit, overview=None):
    manifest = json.loads((ROOT / f'fixtures/real/{name}/manifest.json').read_text())
    frame = manifest['frames'][0]
    path = ROOT / overview['local_cache'] if overview else ROOT / f'.cache/enhancement/{name}-raw.fits'
    if overview:
        frame = {**frame, 'source_fits_url': overview['source_fits_url']}
        manifest['requested_fov_arcmin'] = overview['fov_arcmin']
    loaded = read_observation(source_input(path, frame), manifest['target']['ra_deg'], manifest['target']['dec_deg'])
    options = ProcessingOptions(name, manifest['target']['ra_deg'], manifest['target']['dec_deg'], manifest['requested_fov_arcmin'])
    size = manifest['grid']['width_px']
    if overview:
        size = auto_grid_size(options.fov_arcmin, manifest['processing']['native_pixel_scale_arcsec'])
        grid_wcs = output_wcs(options, size)
        current, current_mask = reproject_observation(loaded, grid_wcs, size)
    else:
        raw = (ROOT / f'fixtures/real/{name}/frame-0001.bin').read_bytes()
        if hashlib.sha256(raw).hexdigest() != frame['raster']['sha256']:
            raise ValueError('Cached original raster checksum mismatch')
        current = np.flipud(np.frombuffer(raw, dtype='<f4', count=size*size).reshape(size, size)).copy()
        current_mask = np.flipud(np.frombuffer(raw, dtype=np.uint8, offset=4*size*size).reshape(size, size)).astype(bool)
        grid_wcs = WCS(manifest['grid']['wcs_header'])
    display_wcs = output_wcs(options, DISPLAY_SIZE)
    baseline, baseline_valid = on_grid(current, current_mask, grid_wcs, display_wcs, DISPLAY_SIZE)
    native, native_valid = on_grid(loaded.science, loaded.valid, loaded.spatial_wcs, display_wcs, DISPLAY_SIZE, cubic=True)
    small, small_valid = on_grid(loaded.science, loaded.valid, loaded.spatial_wcs, grid_wcs, size, cubic=True)
    filtered, noise_settings = reduce_grain(loaded.science, loaded.valid, loaded.variance)
    denoised, denoised_valid = on_grid(filtered, loaded.valid, loaded.spatial_wcs, display_wcs, DISPLAY_SIZE, cubic=True)
    filtered_small, filtered_small_valid = on_grid(filtered, loaded.valid, loaded.spatial_wcs, grid_wcs, size, cubic=True)
    # Keep both treatments on the original prepared footprint. Native sampling
    # cannot quietly fill a pixel rejected by the recorded comparison product.
    native_valid &= baseline_valid
    small_valid &= current_mask
    denoised_valid &= baseline_valid
    if not np.array_equal(denoised_valid, native_valid) or not np.array_equal(filtered_small_valid & current_mask, small_valid):
        raise ValueError('Denoising changed the validity footprint')
    limits = (manifest['display']['vmin'], manifest['display']['vmax'])
    identity = name+'-overview' if overview else name
    assets = {'current': save_view(identity+'-current', baseline, baseline_valid, limits),
              'native': save_view(identity+'-native', native, native_valid, limits),
              'denoised': save_view(identity+'-denoised', denoised, denoised_valid, limits)}
    measured = diagnostics(current, small, current_mask & small_valid, manifest['requested_fov_arcmin']*60/size)
    noise_settings['diagnostics'] = diagnostics(small, filtered_small, small_valid, manifest['requested_fov_arcmin']*60/size)
    measured['display_valid_fraction_current'] = float(np.mean(baseline_valid))
    measured['display_valid_fraction_native'] = float(np.mean(native_valid))
    measured['display_white_fraction_standard'] = float(np.mean(tone(native[native_valid], *limits, softness=.3) >= 254.5/255))
    measured['display_white_fraction_shoulder'] = float(np.mean(tone(native[native_valid], *limits, shoulder=True, softness=.3) >= 254.5/255))
    with fits.open(path) as hdus:
        psf_zones = len(hdus['EPSF'].data)
        flags = np.asarray(hdus['FLAGS'].data, dtype=np.uint32)
        flag_counts = {name: int(np.sum((flags & (1 << bit)) != 0))
                       for bit, name in loaded.flag_definitions.items()
                       if name not in {'SOURCE', 'FULLSAMPLE'} and np.any(flags & (1 << bit))}
    result = {'id': identity, 'title': manifest['title'].replace(' (primary)', '').replace(' (backup)', '') + (' / 20 arcmin overview' if overview else ' / 6 arcmin close-up'), 'kind': 'real', 'fov_arcmin': manifest['requested_fov_arcmin'],
              'native_scale_arcsec': manifest['processing']['native_pixel_scale_arcsec'], 'prepared_side': size,
              'display_side': DISPLAY_SIZE, 'target': manifest['target'], 'grid_wcs': dict(display_wcs.to_header()),
              'limits_mjy_sr': list(limits), 'asinh_softness': .3, 'source': {**{k: frame[k] for k in ['observation_id', 'observed_start_utc', 'observed_end_utc', 'release', 'detector', 'wavelength_um', 'bandwidth_um', 'source_fits_url']}, 'raw_sha256': sha(path), 'raw_bytes': path.stat().st_size,
              'raw_shape': list(loaded.science.shape), 'epsf_zone_count': psf_zones}, 'assets': assets,
              'metrics': measured, 'noise_reduction': noise_settings,
              'quality_flags': {'scope': 'Entire padded source FITS cutout; flags can overlap', 'counts': flag_counts},
              'coverage': audit, 'stack_available': False,
              'note': ('A wider crop of the same authentic exposure. More measured sky pixels, at the same native angular sampling. ' if overview else 'One authentic exposure. ') + 'Native resampling can emphasize square detector footprints; compare both views. No recovered resolution is claimed.'}
    return result


def synthetic_field():
    # An analytic pixel-convolved scene, measured at four phases twice. This
    # tests sampling reconstruction, not optical deconvolution or real coverage.
    rng = np.random.default_rng(57)
    shape = (32, 32)
    stars = [(8.2, 9.1, 2.), (20.7, 7.3, 1.6), (13.4, 22.6, 2.4), (25.2, 24.8, 1.9)]
    def scene(x, y):
        result = np.full(x.shape, .04)
        sigma = .65
        for cx, cy, amplitude in stars:
            px = .5*(erf((x+.5-cx)/(np.sqrt(2)*sigma))-erf((x-.5-cx)/(np.sqrt(2)*sigma)))
            py = .5*(erf((y+.5-cy)/(np.sqrt(2)*sigma))-erf((y-.5-cy)/(np.sqrt(2)*sigma)))
            result += amplitude*px*py
        return result
    planes = []
    y, x = np.indices(shape, dtype=float)
    offsets = np.array([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]])
    for dx, dy in [(0, 0), (.5, 0), (0, .5), (.5, .5)]*2:
        values = scene(x+dx, y+dy) + rng.normal(0, .012, shape)
        good = rng.random(shape) > .035
        geometry = (np.stack((x+dx, y+dy), axis=-1)[..., None, :] + offsets)*2
        planes.append(DropPlane(values, np.full(shape, .012**2), good, geometry))
    stack, stack_valid, variance, weight, count = drizzle(planes, (64, 64), pixfrac=.6)
    yy, xx = np.indices((64, 64), dtype=float)
    truth = scene(xx/2, yy/2)
    baseline, baseline_valid = sample_masked(planes[0].values, planes[0].valid, xx/2, yy/2)
    native, native_valid = sample_masked(planes[0].values, planes[0].valid, xx/2, yy/2, cubic=True)
    filtered, noise_settings = reduce_grain(planes[0].values, planes[0].valid, planes[0].variance)
    denoised, denoised_valid = sample_masked(filtered, planes[0].valid, xx/2, yy/2, cubic=True)
    assert np.array_equal(denoised_valid, native_valid)
    valid = baseline_valid & native_valid & stack_valid
    valid[[0, -1], :] = False; valid[:, [0, -1]] = False
    metrics = {name+'_rmse': float(np.sqrt(np.mean((data[valid]-truth[valid])**2)))
               for name, data in [('current', baseline), ('native', native), ('denoised', denoised), ('stack', stack)]}
    metrics.update(coverage_fraction=float(np.mean(stack_valid)), median_contributors=float(np.median(count[stack_valid])),
                   variance_note='Diagonal propagated variance assumes independent input noise; adjacent output pixels are correlated.')
    assets = {}
    for name, values, good in [('current', baseline, baseline_valid), ('native', native, native_valid),
                               ('denoised', denoised, denoised_valid), ('stack', stack, stack_valid), ('truth', truth, np.ones_like(stack_valid))]:
        image, mask = enlarge(values, good, DISPLAY_SIZE)
        assets[name] = save_view('synthetic-'+name, image, mask, (0, .75))
    # Exact contributor coverage is separately inspectable, without smoothing.
    coverage_rgb = np.zeros((64, 64, 3), dtype=np.uint8)
    coverage_rgb[..., 0] = np.rint(count/8*237).astype(np.uint8)
    coverage_rgb[..., 1] = np.rint(count/8*184).astype(np.uint8)
    coverage_rgb[..., 2] = np.rint(count/8*94).astype(np.uint8)
    Image.fromarray(np.flipud(coverage_rgb)).resize((DISPLAY_SIZE, DISPLAY_SIZE), Image.Resampling.NEAREST).save(OUTPUT / 'synthetic-coverage.png')
    np.savez_compressed(EVIDENCE / 'synthetic-reconstruction.npz', truth=truth, reconstructed=stack, valid=stack_valid,
                        variance=variance, weight=weight, contributors=count)
    return {'id': 'synthetic', 'title': 'Synthetic sampling control', 'kind': 'synthetic', 'display_side': DISPLAY_SIZE,
            'native_scale_arcsec': None, 'prepared_side': 64, 'fov_arcmin': None, 'source': None,
            'assets': assets, 'coverage_asset': '/experiments/resolution/synthetic-coverage.png', 'metrics': metrics,
            'noise_reduction': noise_settings,
            'stack_available': True, 'exposure_count': 8, 'seed': 57, 'pixfrac': .6,
            'note': 'SIMULATED DATA: eight noisy measurements of one analytic scene. No real observation dates or discoveries.'}


def main():
    log.setLevel('WARNING')
    OUTPUT.mkdir(parents=True, exist_ok=True); EVIDENCE.mkdir(parents=True, exist_ok=True)
    acquisition = json.loads((EVIDENCE / 'acquisition.json').read_text())
    audit = audit_groups(acquisition)
    fields = [real_field(item['id'], next(a for a in audit if a['id'] == item['id']), item)
              for item in acquisition.get('overviews', []) if item['status'] == 'downloaded']
    fields += [real_field(name, next(a for a in audit if a['id'] == name))
              for name in ['real-wise-0855', 'real-epsilon-indi-b']]
    fields.append(synthetic_field())
    report = {'schema_version': 2, 'generated_at_utc': datetime.now(timezone.utc).isoformat(),
              'versions': {name: version(name) for name in ['numpy', 'scipy', 'astropy', 'reproject', 'Pillow']},
              'source_hashes': {p: sha(ROOT / p) for p in ['scripts/experiment-resolution.py', 'scripts/probe-resolution.py',
              'apps/api/app/processing/resolution.py']}, 'acquisition_sha256': sha(EVIDENCE / 'acquisition.json'),
              'audit': audit, 'fields': fields,
              'method': 'Native bounded Catmull-Rom resampling; optional native-grid local Wiener noise reduction and asinh highlight shoulder; synthetic pixel-drop reconstruction.',
              'gap_display': {'encoding': 'RGBA with binary alpha; no-data RGB is zero but alpha is zero',
                              'default': 'Dark navy #070b12', 'inspect': 'Slate #273140',
                              'note': 'Gap styling changes no measured pixel or validity; original hold uses the prior slate display.'},
              'limits': ['Research comparison only; production data and measurements are unchanged.',
                         'Real stacks require full-field spectral compatibility and registration verification, beyond the target gate.',
                         'A synthetic sampling improvement does not establish recovered resolution in SPHEREx.',
                         'Original source data stay immutable. Missing measurements remain masked.']}
    save_json(EVIDENCE / 'experiment.json', report)
    save_json(OUTPUT / 'manifest.json', report)
    for field in fields:
        print(field['id'], json.dumps(field['metrics']), flush=True)
    print('Compatibility audit:', json.dumps(audit), flush=True)


if __name__ == '__main__':
    main()
