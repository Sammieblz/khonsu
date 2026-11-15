"""Reproduce real flag/ZODI comparisons and a bounded short-epoch coadd audit.

Offline: uses the recorded resolution acquisition and its cached FITS only.
No archive requests, hidden interpolation across dates or synthetic real stacks.
"""
from dataclasses import replace
from datetime import datetime, timezone
import hashlib
from itertools import combinations
import json
from pathlib import Path
import sys

import astropy.units as u
from astropy import log
from astropy.io import fits
from astropy.wcs import WCS
import numpy as np
from PIL import Image
from reproject import reproject_interp

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'apps/api'))
from app.interfaces import ObservationInput, ProcessingOptions
from app.processing.alignment import auto_grid_size, native_pixel_scale_arcsec, output_wcs, reproject_quality, shared_limits, write_png
from app.processing.composites import EpochPlane, epoch_coadd, epoch_compatibility, subtract_zodi
from app.processing.fits_reader import read_observation

OUTPUT = ROOT/'apps/web/public/experiments/quality'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_input(path, record):
    return ObservationInput(path, record['observation_id'], datetime.fromisoformat(record['observed_start_utc'].replace('Z','+00:00')),
                            datetime.fromisoformat(record['observed_end_utc'].replace('Z','+00:00')), record['detector'], record['release'], record['source_fits_url'])


def zodi_model(path, shape):
    with fits.open(path, memmap=False) as h:
        if 'ZODI' not in h or h['ZODI'].data.shape != shape:
            raise ValueError('Missing or mismatched ZODI model')
        # The release specification defines ZODI in the same MJy/sr as IMAGE.
        scale = u.Unit(h['ZODI'].header.get('BUNIT', h['IMAGE'].header['BUNIT'])).to(u.MJy/u.sr)
        return np.asarray(h['ZODI'].data, dtype=float)*scale


def save(name, image, valid, limits):
    path = OUTPUT/(name+'.png')
    write_png(path, image, valid, *limits)
    return '/experiments/quality/'+path.name


def nearest_plane(row, target, wcs, size):
    path = ROOT/row['local_cache']
    if sha(path) != row['sha256']:
        raise ValueError('Cached acquisition checksum changed')
    loaded = read_observation(source_input(path, row), target['ra_deg'], target['dec_deg'])
    values, valid = subtract_zodi(loaded.science, loaded.valid, zodi_model(path, loaded.science.shape))
    y, x = np.indices(loaded.science.shape)
    with fits.open(path, memmap=False) as h:
        spectral = WCS(h['IMAGE'].header, fobj=h, key='W'); spectral.sip = None
        wavelength, bandwidth = spectral.pixel_to_world(x, y)
        wave, band = wavelength.to_value(u.um), bandwidth.to_value(u.um)
    def project(array):
        return reproject_interp((array, loaded.spatial_wcs), wcs, shape_out=(size,size), order='nearest-neighbor', parallel=False)[0]
    return EpochPlane(project(values), project(loaded.variance), project(valid.astype(float)) > .5, project(wave), project(band))


def audit(acquisition):
    results = []
    for target in acquisition['targets']:
        rows = [r for r in target['candidates'] if r.get('status') == 'inspected']
        rejections, products = {}, []
        size = 64
        grid = output_wcs(ProcessingOptions('quality-coadd', target['ra_deg'], target['dec_deg'], 6), size)
        for pair in combinations(rows, 2):
            reason = epoch_compatibility(pair)
            if reason:
                rejections[reason] = rejections.get(reason, 0)+1
                continue
            planes = [nearest_plane(r, target, grid, size) for r in pair]
            image, valid, variance, weights, coverage, metadata = epoch_coadd(pair, planes)
            if not np.any(coverage >= 2):
                reason = 'No pixel has two spectrally matched strict samples'
                rejections[reason] = rejections.get(reason, 0)+1
                continue
            limits = shared_limits([(None,image,valid)])
            name = target['id']+'-'+str(len(products)+1)
            asset = save(name+'-coadd', image, valid, limits)
            coverage_path = OUTPUT/(name+'-coverage.png')
            Image.fromarray(np.flipud(np.rint(coverage/2*255).astype(np.uint8))).save(coverage_path)
            products.append({**metadata, 'grid_wcs':dict(grid.to_header()), 'asset':asset,
                             'coverage_asset':'/experiments/quality/'+coverage_path.name,
                             'limits_mjy_sr':limits, 'diagonal_variance_median':float(np.median(variance[valid]))})
        results.append({'id':target['id'], 'inspected':len(rows), 'failed_inputs':sum(r.get('status')=='failed' for r in target['candidates']),
                        'pairs_checked':len(rows)*(len(rows)-1)//2, 'rejections':rejections, 'products':products,
                        'status':'quicklook_coadd_available' if products else 'insufficient_compatible_coverage'})
    return results


def main():
    log.setLevel('WARNING'); OUTPUT.mkdir(parents=True, exist_ok=True)
    acquisition_path = ROOT/'docs/evidence/resolution/acquisition.json'
    acquisition = json.loads(acquisition_path.read_text())
    fields = []
    for name in ['real-wise-0855', 'real-epsilon-indi-b']:
        manifest = json.loads((ROOT/f'fixtures/real/{name}/manifest.json').read_text())
        overview = next(r for r in acquisition['overviews'] if r['id'] == name)
        path = ROOT/overview['local_cache']
        if sha(path) != overview['sha256']:
            raise ValueError('Overview checksum changed')
        record = {**manifest['frames'][0], 'source_fits_url':overview['source_fits_url']}
        loaded = read_observation(source_input(path, record), manifest['target']['ra_deg'], manifest['target']['dec_deg'])
        options = ProcessingOptions(name, manifest['target']['ra_deg'], manifest['target']['dec_deg'], overview['fov_arcmin'])
        size = auto_grid_size(options.fov_arcmin, native_pixel_scale_arcsec(loaded.spatial_wcs)); grid = output_wcs(options, size)
        original, quality = reproject_quality(loaded, grid, size)
        model = zodi_model(path, loaded.science.shape)
        corrected, strict = subtract_zodi(loaded.science, loaded.valid, model)
        # Retain separate finite warning-only values through the corrected copy.
        corrected[loaded.warning & np.isfinite(model)] = (loaded.science-model)[loaded.warning & np.isfinite(model)]
        corrected_loaded = replace(loaded, science=corrected, valid=strict, warning=loaded.warning & np.isfinite(model))
        zodi, zodi_quality = reproject_quality(corrected_loaded, grid, size)
        limits = shared_limits([(None,original,quality == 1), (None,zodi,zodi_quality == 1)])
        assets = {'original':save(name+'-original',original,quality == 1,limits),
                  'warnings':save(name+'-warnings',original,quality > 0,limits),
                  'zodi':save(name+'-zodi',zodi,zodi_quality == 1,limits),
                  'zodi_warnings':save(name+'-zodi-warnings',zodi,zodi_quality > 0,limits)}
        common = (quality == 1) & (zodi_quality == 1)
        sky = common & (original <= np.percentile(original[common],45))
        sigma = lambda a:float(1.4826*np.median(np.abs(a[sky]-np.median(a[sky]))))
        fields.append({'id':name, 'title':manifest['title'], 'source':{k:record[k] for k in ['observation_id','observed_start_utc','observed_end_utc','release','detector','wavelength_um','bandwidth_um','source_fits_url']},
                       'raw_sha256':sha(path), 'raw_cache':path.relative_to(ROOT).as_posix(), 'assets':assets,
                       'grid_wcs':dict(grid.to_header()), 'grid_size':size, 'fov_arcmin':options.fov_arcmin,
                       'limits_mjy_sr':limits, 'asinh_a':.1,
                       'unavailable_fraction':float(np.mean(quality == 0)), 'warning_fraction':float(np.mean(quality == 2)),
                       'strict_fraction':float(np.mean(quality == 1)),
                       'sky_sigma_original':sigma(original), 'sky_sigma_zodi':sigma(zodi),
                       'median_model_subtracted_mjy_sr':float(np.median((original-zodi)[common]))})
    report = {'schema_version':1, 'generated_at_utc':datetime.now(timezone.utc).isoformat(), 'fields':fields,
              'audit':audit(acquisition), 'acquisition_sha256':sha(acquisition_path),
              'source_hashes':{p:sha(ROOT/p) for p in ['scripts/experiment-quality.py','apps/api/app/processing/composites.py','apps/api/app/processing/fits_reader.py','apps/api/app/processing/alignment.py']},
              'method':'IMAGE versus IMAGE-ZODI; identical common WCS and absolute stretch within each field; warning-only variants separate from strict quality',
              'limits':['No finer optical resolution. ZODI removes a supplied smooth foreground model, not detector noise or all backgrounds.',
                        'OUTLIER/OVERFLOW values are optional warning display, never trusted photometry.',
                        'Coadd audit uses at most 16 inputs per target within 24 hours, same detector/release and wavelength spread <= 0.1 bandwidth at target and each pixel.',
                        'This bounded sample cannot establish that compatible archive data does not exist elsewhere.',
                        'PSF-matched differences are not enabled: no accepted short-epoch coadd pair in this sample, no validated full-field PSF matching or residual significance.']}
    text = json.dumps(report, indent=2, allow_nan=False)+'\n'
    (OUTPUT/'manifest.json').write_text(text)
    evidence = ROOT/'docs/evidence/quality'; evidence.mkdir(parents=True, exist_ok=True)
    (evidence/'experiment.json').write_text(text)
    print(json.dumps({'fields':[{k:f[k] for k in ['id','warning_fraction','unavailable_fraction','sky_sigma_original','sky_sigma_zodi']} for f in fields], 'audit':report['audit']}, indent=2))


if __name__ == '__main__':
    main()
