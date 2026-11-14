"""Add browser rasters to existing bundles from their preserved aligned FITS.

Usage: python scripts/prepare-browser-examples.py --aligned-root .cache/pass-targets
No archive retrieval or change to the original PNG/manifest evidence occurs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))
from app.processing.alignment import write_prepared_raster
from astropy.io import fits
import numpy as np
from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--aligned-root', type=Path, required=True)
    args = parser.parse_args()
    comparison = []
    for bundle in sorted((ROOT / 'fixtures/real').iterdir()):
        if not bundle.is_dir():
            continue
        manifest = json.loads((bundle / 'manifest.json').read_text())
        lineage = json.loads((bundle / 'lineage.json').read_text())
        prepared = {}
        for frame in manifest['frames']:
            source = args.aligned_root / bundle.name / (frame['frame_id'] + '.fits')
            with fits.open(source) as hdus:
                values = hdus['IMAGE'].data.copy()
                valid = hdus['VALID'].data.astype(bool)
            name = frame['frame_id'] + '.bin'
            record = write_prepared_raster(bundle / name, values, valid)
            frame['raster'] = {**record, 'url': f'/v1/examples/{bundle.name}/frames/{name}'}
            prepared[name] = {'aligned_fits_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                              'transform': 'flip-y; float32 little endian; invalid zero plus separate mask'}
            if bundle.name == 'real-wise-0855' and frame['frame_id'] == 'frame-0001':
                low, high = manifest['display']['vmin'], manifest['display']['vmax']
                norm = np.clip((np.nan_to_num(values, nan=low) - low) / (high-low), 0, 1)
                for a, sampling, label in [(0.1, Image.Resampling.NEAREST, 'Asinh 0.1 / nearest display'),
                                            (0.3, Image.Resampling.NEAREST, 'Asinh 0.3 / nearest display'),
                                            (0.3, Image.Resampling.BILINEAR, 'Asinh 0.3 / bilinear display')]:
                    gray = np.rint(np.arcsinh(norm/a)/np.arcsinh(1/a)*255).astype('uint8')
                    rgb = np.repeat(gray[..., None], 3, axis=2)
                    rgb[~valid] = [39, 49, 64]
                    comparison.append((Image.fromarray(np.flipud(rgb)).resize((354,354),sampling),label))
        manifest['processing']['browser_raster_encoding'] = 'float32-le-mask8-v1'
        (bundle / 'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        lineage['prepared_rasters'] = prepared
        for name in ['manifest.json', *prepared]:
            data = (bundle / name).read_bytes()
            lineage['files'][name] = {'size_bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
        (bundle / 'lineage.json').write_text(json.dumps(lineage,indent=2)+'\n')
    figure = Image.new('RGB',(1102,410),'#070b12')
    draw = ImageDraw.Draw(figure)
    for index,(img,label) in enumerate(comparison):
        x = 10 + index*364
        figure.paste(img,(x,36)); draw.text((x,12),label,fill='#f1f0e9')
    draw.text((10,395),'Same WISE 0855 field exposure, limits, WCS and mask. Display comparison only; no added resolution.',fill='#aab5c7')
    output = ROOT / 'docs/evidence/console'
    output.mkdir(parents=True,exist_ok=True)
    figure.save(output/'display-comparison.png')


if __name__ == '__main__':
    main()
