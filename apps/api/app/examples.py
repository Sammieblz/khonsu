"""Validate small cached-real bundles without making archive requests."""

from datetime import datetime
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import warnings

from .retrieval.service import validate_irsa_url
from .schemas import SequenceManifest

MAX_BUNDLE_BYTES = 8 * 1024 * 1024
MAX_RECORD_BYTES = 1024 * 1024
MAX_EXAMPLES = 10


class CachedExampleError(ValueError):
    """A configured example must not be presented as verified."""


def read_bounded(path: Path, limit: int) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise CachedExampleError("A required cached asset is missing or unsafe.")
    with path.open('rb') as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise CachedExampleError("A cached asset exceeds the bundle size limit.")
    return data


def validate_bundle(directory: Path) -> SequenceManifest:
    """Check lineage, the original manifest and exact PNG bytes before serving."""
    try:
        if directory.is_symlink():
            raise CachedExampleError("A cached directory must be local.")
        payload = read_bounded(directory / 'manifest.json', MAX_RECORD_BYTES)
        manifest = SequenceManifest.model_validate_json(payload)
        if manifest.data_mode != 'cached-real' or directory.name != manifest.sequence_id:
            raise CachedExampleError("The cached sequence identity or data mode is invalid.")
        source_bytes = read_bounded(directory / 'source-manifest.json', MAX_RECORD_BYTES)
        source = SequenceManifest.model_validate_json(source_bytes)
        acquisition = json.loads(read_bounded(directory / 'acquisition-record.json', MAX_RECORD_BYTES))
        lineage = json.loads(read_bounded(directory / 'lineage.json', MAX_RECORD_BYTES))
        if source.data_mode == 'synthetic':
            raise CachedExampleError("Synthetic fixtures cannot become cached-real data.")
        if lineage.get('schema_version') != '1.0' or lineage.get('sequence_id') != manifest.sequence_id:
            raise CachedExampleError("Cached lineage identity is invalid.")
        if lineage.get('source_manifest_sha256') != hashlib.sha256(source_bytes).hexdigest():
            raise CachedExampleError("The source manifest and lineage disagree.")
        acquired = datetime.fromisoformat(lineage['acquired_at_utc'].replace('Z', '+00:00'))
        if acquired.utcoffset() is None or not lineage.get('acquisition_reference'):
            raise CachedExampleError("Cached lineage needs a dated acquisition reference.")
        if acquired != datetime.fromisoformat(acquisition['processing_timestamp_utc'].replace('Z', '+00:00')):
            raise CachedExampleError("The acquisition timestamp and recorded probe disagree.")
        if lineage.get('source_observations') != [frame.model_dump(mode='json', exclude={'image_url', 'raster'}) for frame in manifest.frames]:
            raise CachedExampleError("The lineage and observation metadata disagree.")
        if source.target != manifest.target or source.grid != manifest.grid or source.display != manifest.display:
            raise CachedExampleError("The cached grid, target or stretch differs from its source.")
        if source.requested_fov_arcmin != manifest.requested_fov_arcmin or source.warnings != manifest.warnings:
            raise CachedExampleError("The cached field or quality warnings differ from their source.")
        if [frame.model_dump(exclude={'image_url', 'raster'}) for frame in source.frames] != [frame.model_dump(exclude={'image_url', 'raster'}) for frame in manifest.frames]:
            raise CachedExampleError("The cached observations differ from their source.")
        if any(manifest.processing.get(key) != value for key, value in source.processing.items()):
            raise CachedExampleError("The cached processing record differs from its source.")
        expected = {'manifest.json', 'source-manifest.json', 'acquisition-record.json'}
        images = {}
        for frame in manifest.frames:
            validate_irsa_url(str(frame.source_fits_url))
            matches = [entry for entry in acquisition['downloaded_sources']
                       if entry['source_fits_url'] == str(frame.source_fits_url)
                       and entry['observation_id'] == frame.observation_id
                       and entry['detector'] == frame.detector and entry['release'] == frame.release]
            if len(matches) != 1 or not re.fullmatch(r'[a-f0-9]{64}', matches[0]['sha256']) or not 0 < matches[0]['bytes'] <= 48 * 1024 * 1024:
                raise CachedExampleError("The acquired FITS checksum record is incomplete.")
            name = frame.frame_id + '.png'
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}\.png', name):
                raise CachedExampleError("A cached frame name is invalid.")
            if frame.image_url != f'/v1/examples/{manifest.sequence_id}/frames/{name}':
                raise CachedExampleError("A cached frame URL must identify its bundled local asset.")
            images[name] = frame
            expected.add(name)
            if frame.raster:
                raster_name = frame.frame_id + '.bin'
                if frame.raster.url != f'/v1/examples/{manifest.sequence_id}/frames/{raster_name}':
                    raise CachedExampleError("A prepared raster must identify its bundled local asset.")
                expected.add(raster_name)
                raw = read_bounded(directory / raster_name, 5 * 1024 * 1024)
                if len(raw) != frame.raster.size_bytes or hashlib.sha256(raw).hexdigest() != frame.raster.sha256:
                    raise CachedExampleError("A prepared raster failed its checksum or size check.")
                import numpy as np
                count = manifest.grid.width_px * manifest.grid.height_px
                values = np.frombuffer(raw[:count * 4], dtype='<f4')
                valid = np.frombuffer(raw[count * 4:], dtype=np.uint8)
                if not np.isfinite(values).all() or not np.isin(valid, [0, 1]).all():
                    raise CachedExampleError("Prepared values or mask disagree with the image grid.")
        entries = lineage.get('files')
        if not isinstance(entries, dict) or set(entries) != expected:
            raise CachedExampleError("The cached file inventory is incomplete.")
        total = 0
        for name in sorted(expected):
            data = read_bounded(directory / name, MAX_BUNDLE_BYTES)
            total += len(data)
            record = entries[name]
            if record.get('size_bytes') != len(data) or record.get('sha256') != hashlib.sha256(data).hexdigest():
                raise CachedExampleError("A cached file failed its size or checksum check.")
            if total > MAX_BUNDLE_BYTES:
                raise CachedExampleError("The cached bundle exceeds its size limit.")
            if name in images:
                from PIL import Image
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter('error', Image.DecompressionBombWarning)
                        with Image.open(BytesIO(data)) as image:
                            if image.format != 'PNG' or image.mode != 'RGBA' or image.size != (manifest.grid.width_px, manifest.grid.height_px):
                                raise CachedExampleError("A cached PNG does not match the manifest grid.")
                            image.verify()
                        with Image.open(BytesIO(data)) as image:
                            image.load()
                            alpha = image.getchannel('A').histogram()
                            fraction = alpha[0] / (image.width * image.height)
                            if any(alpha[1:255]) or images[name].masked_fraction is None or abs(fraction - images[name].masked_fraction) > 1e-12:
                                raise CachedExampleError("A cached PNG mask does not match the recorded quality metadata.")
                            if images[name].raster:
                                count = image.width * image.height
                                raw = read_bounded(directory / (images[name].frame_id + '.bin'), 5 * 1024 * 1024)
                                if not np.array_equal(np.frombuffer(raw[count * 4:], dtype=np.uint8) > 0, np.asarray(image.getchannel('A')).ravel() > 0):
                                    raise CachedExampleError("Prepared raster and PNG validity disagree.")
                except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
                    raise CachedExampleError("A cached PNG has unsafe dimensions.") from exc
        return manifest
    except CachedExampleError:
        raise
    except (OSError, ValueError, KeyError, TypeError, AttributeError, ImportError) as exc:
        raise CachedExampleError("A cached bundle is missing, corrupt or inconsistent.") from exc


def load_examples(fixtures: Path) -> list[SequenceManifest]:
    real = fixtures / 'real'
    paths = sorted(path for path in real.iterdir() if path.is_dir() and not path.name.startswith('.')) if real.is_dir() else []
    if len(paths) > MAX_EXAMPLES:
        raise CachedExampleError("Too many cached bundles are configured.")
    examples = [validate_bundle(path) for path in paths]
    return sorted(examples, key=lambda item: ({'primary': 0, 'backup': 1}.get(item.processing.get('cache_role'), 2), item.sequence_id))
