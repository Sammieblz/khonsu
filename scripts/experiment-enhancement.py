"""Reproducible display/restoration experiment, never an API science product.

Run in the existing science environment. --download fetches only two exact
manifest-listed source cutouts, capped at 16 MiB each. Source rasters stay intact.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
import urllib.request

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from PIL import Image, ImageDraw
from reproject import reproject_interp
from scipy.ndimage import binary_dilation, convolve, map_coordinates, maximum_filter

ROOT = Path(__file__).resolve().parents[1]
BINOMIAL = np.outer([1, 4, 6, 4, 1], [1, 4, 6, 4, 1]) / 256


def digest(data):
    return hashlib.sha256(data).hexdigest()


def detail_display(values, valid, span, amount=.35):
    """Small, thresholded unsharp display boost; not deconvolution."""
    low = convolve(values, BINOMIAL, mode='nearest')
    residual = values - low
    correction = np.sign(residual) * np.maximum(np.abs(residual) - .025 * span, 0)
    correction = np.clip(correction, -.08 * span, .08 * span)
    safe = ~binary_dilation(~valid, structure=np.ones((5, 5)))
    return np.where(safe & valid, values + amount * correction, values)


def otf(kernel, shape):
    array = np.zeros(shape)
    array[:kernel.shape[0], :kernel.shape[1]] = kernel
    array = np.roll(array, -(kernel.shape[0] // 2), axis=0)
    array = np.roll(array, -(kernel.shape[1] // 2), axis=1)
    return np.fft.fft2(array)


def wiener(values, valid, kernel, balance=.03):
    background = float(np.median(values[valid]))
    # Background fill is only an auxiliary FFT input; masked outputs stay masked.
    residual = np.where(valid, values - background, 0)
    pad = 24
    padded = np.pad(residual, pad, mode='reflect')
    transfer = otf(kernel, padded.shape)
    laplace = otf(np.array([[0., -1, 0], [-1, 4, -1], [0, -1, 0]]), padded.shape)
    inverse = transfer.conj() / np.maximum(np.abs(transfer)**2 + balance * np.abs(laplace)**2, 1e-8)
    restored = np.fft.ifft2(np.fft.fft2(padded) * inverse).real
    return restored[pad:-pad, pad:-pad] + background


def richardson_lucy(values, valid, kernel, iterations):
    # Experimental offset/positivity approximation for calibrated signed values.
    # This does NOT turn MJy/sr data into Poisson counts or a valid noise likelihood.
    offset = max(0., -float(np.min(values[valid]))) + 1e-6
    data = np.where(valid, values + offset, 0)
    estimate = np.full(values.shape, np.median(data[valid]))
    adjoint = kernel[::-1, ::-1]
    support = convolve(valid.astype(float), adjoint, mode='reflect')
    for _ in range(iterations):
        predicted = convolve(estimate, kernel, mode='reflect')
        ratio = np.where(valid, data / np.maximum(predicted, 1e-8), 0)
        estimate *= convolve(ratio, adjoint, mode='reflect') / np.maximum(support, 1e-8)
    return estimate - offset


def fourier_bandpass(values, valid):
    background = float(np.median(values[valid]))
    padded = np.pad(np.where(valid, values - background, 0), 24, mode='reflect')
    fy, fx = np.meshgrid(np.fft.fftfreq(padded.shape[0]), np.fft.fftfreq(padded.shape[1]), indexing='ij')
    radius2 = fx * fx + fy * fy
    band = (1 - np.exp(-radius2 / (2 * .025**2))) * np.exp(-radius2 / (2 * .30**2))
    return np.fft.ifft2(np.fft.fft2(padded) * band).real[24:-24, 24:-24] + background


def select_projected_epsf(path, manifest):
    """Local approximate impulse response including native sampling/reprojection.

    Select the nearest mission ePSF zone, evaluate its already pixel-convolved
    response at native pixel centers, then use the same bilinear spatial
    reprojection as the source. One local kernel is NOT a full spatially varying
    forward model, nor propagated uncertainty for restoration.
    """
    with fits.open(path) as hdus:
        spatial = WCS(hdus['IMAGE'].header, hdus).celestial
        ra, dec = manifest['target']['ra_deg'], manifest['target']['dec_deg']
        px, py = spatial.all_world2pix(ra, dec, 0)
        parent_x = 1 + px - hdus['IMAGE'].header['CRPIX1A']
        parent_y = 1 + py - hdus['IMAGE'].header['CRPIX2A']
        table, header = hdus['EPSF'].data, hdus['EPSF'].header
        zone = int(np.argmin((table['XCENTER'] - parent_x)**2 + (table['YCENTER'] - parent_y)**2))
        sample = np.asarray(table['EPSF'][zone], dtype=float)
        negative_mass = float(-np.minimum(sample, 0).sum() / np.abs(sample).sum())
        # RL requires a nonnegative PSF. Record this model change explicitly.
        positive = np.maximum(sample, 0)
        x0, y0 = int(np.floor(px)) - 8, int(np.floor(py)) - 8
        yy, xx = np.mgrid[:17, :17]
        native = map_coordinates(positive, [
            (yy + y0 - py) * header['OVSMPY'] + (sample.shape[0] - 1) / 2,
            (xx + x0 - px) * header['OVSMPX'] + (sample.shape[1] - 1) / 2,
        ], order=1, mode='constant', cval=0)
        cutout_wcs = spatial.deepcopy()
        cutout_wcs.wcs.crpix -= [x0, y0]
        if cutout_wcs.sip is not None:
            # WCS.slice updates both celestial and SIP reference coordinates.
            cutout_wcs = spatial.slice((slice(y0, y0 + 17), slice(x0, x0 + 17)))
        output = WCS(manifest['grid']['wcs_header'])
        output.wcs.crpix = [11, 11]
        projected, footprint = reproject_interp((native, cutout_wcs), output, shape_out=(21, 21), order='bilinear')
        projected = np.where(np.isfinite(projected) & (footprint > 0), projected, 0)
        projected = np.flipud(projected)
        kernel = projected / projected.sum()
        record = {
            'source_fits_url': manifest['frames'][0]['source_fits_url'],
            'source_sha256': digest(path.read_bytes()), 'source_bytes': path.stat().st_size,
            'fits_version': hdus[0].header.get('VERSION'), 'zone_row': zone,
            'bin': [int(table['BINX'][zone]), int(table['BINY'][zone])],
            'parent_pixel': [float(parent_x), float(parent_y)],
            'oversampling': [int(header['OVSMPX']), int(header['OVSMPY'])],
            'calibration_wavelength_um': float(table['CWAVE'][zone]),
            'negative_psf_mass_fraction_clipped': negative_mass,
            'kernel': kernel.tolist(),
            'limitation': 'One local zone and sampling phase, approximated as shift-invariant; not a validated full-field restoration PSF.',
        }
        return kernel, record


def treatments(values, valid, kernel, span):
    return {
        'Original': values.copy(),
        'Detail 0.35': detail_display(values, valid, span),
        'Wiener 0.03': wiener(values, valid, kernel),
        'RL 5 iterations': richardson_lucy(values, valid, kernel, 5),
        'RL 20 iterations': richardson_lucy(values, valid, kernel, 20),
        'Fourier bandpass': fourier_bandpass(values, valid),
    }


def restoration_sweep(values, valid, kernel):
    return {
        **{f'Wiener {balance}': wiener(values, valid, kernel, balance) for balance in [.003, .03, .3, 3.]},
        **{f'RL {iterations} iterations': richardson_lucy(values, valid, kernel, iterations) for iterations in [2, 5, 10, 20]},
    }


def centroid(image, x, y, radius=5):
    y0, y1 = max(0, y-radius), min(image.shape[0], y+radius+1)
    x0, x1 = max(0, x-radius), min(image.shape[1], x+radius+1)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    patch = image[y0:y1, x0:x1]
    weights = np.maximum(patch - np.median(patch), 0)
    if weights.sum() == 0:
        return [float(x), float(y)]
    return [float((weights * xx).sum()/weights.sum()), float((weights * yy).sum()/weights.sum())]


def render(image, valid, low, high, pixels=False):
    # Display-only interpolation occurs before stretch and excludes invalid values.
    size = 320
    yy, xx = np.mgrid[:size, :size]
    coords = [(yy + .5) * image.shape[0]/size - .5, (xx + .5) * image.shape[1]/size - .5]
    nearest = map_coordinates(valid.astype(float), coords, order=0, mode='nearest') > .5
    weights = map_coordinates(valid.astype(float), coords, order=0 if pixels else 1, mode='nearest')
    values = map_coordinates(np.where(valid, image, 0), coords, order=0 if pixels else 1, mode='nearest') / np.maximum(weights, 1e-8)
    level = np.clip((values - low)/(high-low), 0, 1)
    gray = np.rint(255 * np.arcsinh(level/.3)/np.arcsinh(1/.3)).astype(np.uint8)
    rgb = np.repeat(gray[:, :, None], 3, axis=2)
    rgb[~nearest] = [39, 49, 64]
    return Image.fromarray(rgb)


def figure(path, outputs, valid, low, high, title):
    image = Image.new('RGB', (998, 758), '#070b12')
    draw = ImageDraw.Draw(image)
    draw.text((16, 14), title, fill='#edb85e')
    for index, (name, values) in enumerate(outputs.items()):
        x, y = 12 + (index % 3) * 330, 56 + (index // 3) * 350
        draw.text((x, y-17), name, fill='#f1f0e9')
        image.paste(render(values, valid, low, high), (x, y))
    draw.text((12, 744), 'Identical limits and masks. Restored views are experiments; no new measured detail is established.', fill='#aab5c7')
    image.save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--inputs', type=Path, default=ROOT/'.cache/enhancement')
    parser.add_argument('--output', type=Path, default=ROOT/'docs/evidence/enhancement')
    args = parser.parse_args()
    args.inputs.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    report = {'seed': 49, 'experiment': 'exploratory-display-restoration-v1', 'real': [], 'synthetic': {},
        'tested_at': datetime.now(timezone.utc).isoformat(),
        'script_sha256': digest(Path(__file__).read_bytes()),
        'versions': {name: version(name) for name in ['numpy', 'scipy', 'astropy', 'reproject', 'Pillow']},
        'parameters': {'detail_amount': .35, 'detail_threshold_fraction': .025, 'detail_cap_fraction': .08,
            'wiener_laplacian_balances': [.003, .03, .3, 3.], 'rl_iterations': [2, 5, 10, 20],
            'fft_reflection_pad_px': 24, 'bandpass_sigma_cycles_per_pixel': [.025, .30]},
    }
    kernels = []
    for target in ['real-wise-0855', 'real-epsilon-indi-b']:
        folder = ROOT/'fixtures/real'/target
        manifest = json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
        frame = manifest['frames'][0]
        source = args.inputs/f'{target}-raw.fits'
        if not source.exists():
            if not args.download:
                raise RuntimeError(f'{source} missing; use --download for bounded source retrieval')
            with urllib.request.urlopen(frame['source_fits_url'], timeout=90) as response:
                data = response.read(16*1024*1024+1)
            if len(data) > 16*1024*1024:
                raise ValueError('Source exceeds the 16 MiB bound')
            source.write_bytes(data)
        blob = (folder/f"{frame['frame_id']}.bin").read_bytes()
        assert digest(blob) == frame['raster']['sha256']
        shape = (manifest['grid']['height_px'], manifest['grid']['width_px'])
        count = int(np.prod(shape))
        values = np.frombuffer(blob, dtype='<f4', count=count).reshape(shape).astype(float)
        valid = np.frombuffer(blob, dtype='u1', offset=count*4).reshape(shape).astype(bool)
        kernel, provenance = select_projected_epsf(source, manifest)
        kernels.append({'target': target, **provenance})
        low, high = manifest['display']['vmin'], manifest['display']['vmax']
        outputs = treatments(values, valid, kernel, high-low)
        # Fixed original-sky region for every method; never reselect the quietest result.
        sky = valid & ~binary_dilation(~valid, iterations=4) & (values < np.quantile(values[valid], .65))
        reference_noise = float(np.std(values[sky]))
        safe = valid & ~binary_dilation(~valid, iterations=5)
        safe[:6] = False; safe[-6:] = False; safe[:, :6] = False; safe[:, -6:] = False
        peaks = np.argwhere(safe & (values == maximum_filter(values, size=11)) & (values > np.quantile(values[valid], .98)))
        base_centroids = [centroid(values, int(x), int(y)) for y, x in peaks]
        metrics = {}
        for name, output in {**outputs, **restoration_sweep(values, valid, kernel)}.items():
            shifts = [float(np.linalg.norm(np.array(centroid(output, int(x), int(y))) - baseline)) for (y, x), baseline in zip(peaks, base_centroids)]
            metrics[name] = {
                'original_sky_std_ratio': float(np.std(output[sky]) / reference_noise),
                'valid_negative_fraction': float(np.mean(output[valid] < 0)),
                'max_bright_peak_centroid_shift_grid_px': max(shifts, default=None),
                'checked_bright_peaks': len(peaks),
                'valid_rms_change': float(np.sqrt(np.mean((output[valid] - values[valid])**2))),
            }
        report['real'].append({'target': target, 'frame': frame['observation_id'], 'utc': frame['observed_start_utc'],
            'release': frame['release'], 'raster_sha256': digest(blob), 'metrics': metrics,
            'interpretation': 'No truth image exists here; these are artifact/change diagnostics, not recovered-resolution measurements.'})
        figure(args.output/f'{target}-methods.png', outputs, valid, low, high, f'{target}: authentic exposure; restoration is experimental')
        if target == 'real-wise-0855':
            display = Image.new('RGB', (998, 380), '#070b12')
            draw = ImageDraw.Draw(display)
            for i, (label, data, pixel) in enumerate([('Pixels', values, True), ('Smooth', values, False), ('Smooth + detail 0.35', outputs['Detail 0.35'], False)]):
                display.paste(render(data, valid, low, high, pixel), (12+i*330, 35))
                draw.text((12+i*330, 14), label, fill='#edb85e')
            draw.text((12, 365), 'Same source exposure and mask. Smooth interpolates display only. Detail is an optional unsharp experiment.', fill='#aab5c7')
            display.save(args.output/'display-modes.png')
            reference_kernel = kernel

    rng = np.random.default_rng(49)
    yy, xx = np.mgrid[:128, :128]
    truth = np.full((128, 128), .3)
    for x, y, flux in [(25.3, 28.1, 2.0), (66.2, 42.4, 1.5), (90.6, 93.4, 1.1), (29.1, 98.7, .5)]:
        truth += flux * np.exp(-((xx-x)**2 + (yy-y)**2)/(2*.8**2))
    observed = convolve(truth, reference_kernel, mode='reflect') + rng.normal(0, .012, truth.shape)
    valid = np.ones(truth.shape, dtype=bool)
    valid[60:64, 50:54] = False
    valid[90:92, 92:94] = False
    outputs = treatments(observed, valid, reference_kernel, 1.4)
    blank = valid & (truth < .301) & ~binary_dilation(~valid, iterations=5)
    for name, output in {**outputs, **restoration_sweep(observed, valid, reference_kernel)}.items():
        report['synthetic'][name] = {
            'truth_rmse': float(np.sqrt(np.mean((output[valid]-truth[valid])**2))),
            'blank_rms': float(np.sqrt(np.mean((output[blank]-.3)**2))),
            'negative_fraction': float(np.mean(output[valid] < 0)),
            'interpretation': 'Synthetic known convolution and additive Gaussian noise; not a real-source resolution claim.',
        }
    figure(args.output/'synthetic-methods.png', outputs, valid, .25, 1.2, 'SYNTHETIC stars: known ePSF convolution + Gaussian noise + test masks')
    # Targeted Fourier notch: useful only when a contaminant frequency is known.
    periodic = observed + .045*np.sin(2*np.pi*xx/8)
    frequencies = np.fft.fftfreq(128)
    fy, fx = np.meshgrid(frequencies, frequencies, indexing='ij')
    notch = (1-np.exp(-((fx-.125)**2+fy**2)/(2*.004**2))) * (1-np.exp(-((fx+.125)**2+fy**2)/(2*.004**2)))
    cleaned = np.fft.ifft2(np.fft.fft2(periodic)*notch).real
    report['synthetic_periodic_notch'] = {
        'known_period_px': 8, 'before_rmse_to_uncontaminated_observed': float(np.sqrt(np.mean((periodic-observed)**2))),
        'after_rmse_to_uncontaminated_observed': float(np.sqrt(np.mean((cleaned-observed)**2))),
        'limitation': 'Controlled sinusoid only; no such periodic contaminant has been identified in the real fields.',
    }
    (args.output/'experiment.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    (args.output/'psf-kernels.json').write_text(json.dumps(kernels, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
