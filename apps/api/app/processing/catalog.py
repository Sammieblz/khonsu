"""Project catalog context with Astropy; never modify observation arrays."""
import math
import warnings

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.io.fits import Header
from astropy.time import Time
from astropy.wcs import WCS
from erfa import ErfaWarning
import numpy as np

from ..schemas import CatalogPosition, GaiaSource


def grid_wcs(manifest):
    header = Header()
    for key, value in (manifest.grid.wcs_header or {}).items():
        header[key] = value
    return WCS(header).celestial


def query_radius(manifest):
    """Cover actual grid corners, plus 6 arcmin for catalog-epoch motion."""
    wcs = grid_wcs(manifest)
    grid = manifest.grid
    ra, dec = wcs.all_pix2world(
        [-.5, grid.width_px-.5, -.5, grid.width_px-.5],
        [-.5, -.5, grid.height_px-.5, grid.height_px-.5], 0,
    )
    center = SkyCoord(manifest.target.ra_deg*u.deg, manifest.target.dec_deg*u.deg)
    radius = float(np.max(center.separation(SkyCoord(ra*u.deg, dec*u.deg)).deg)) + .1
    if not math.isfinite(radius) or not 0 < radius <= 2:
        raise ValueError("Catalog context supports sky grids within a 2 degree cone.")
    return radius


def project_sources(manifest, rows):
    """Use catalog proper motion, without claiming parallax/apparent positions."""
    if not rows:
        return []
    wcs, grid = grid_wcs(manifest), manifest.grid
    moving = [row['pmra'] is not None and row['pmdec'] is not None for row in rows]
    coords = SkyCoord(
        ra=[row['ra'] for row in rows]*u.deg,
        dec=[row['dec'] for row in rows]*u.deg,
        pm_ra_cosdec=[row['pmra'] if move else 0 for row, move in zip(rows, moving)]*u.mas/u.yr,
        pm_dec=[row['pmdec'] if move else 0 for row, move in zip(rows, moving)]*u.mas/u.yr,
        obstime=Time([row['ref_epoch'] for row in rows], format='jyear'),
    )
    positions = [[] for _ in rows]
    for frame in manifest.frames:
        if frame.observed_start_utc is None:
            continue
        # No distance/radial velocity is assumed. ERFA warns about that deliberate
        # unit-sphere approximation; the response explicitly discloses it.
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', ErfaWarning)
            epoch = coords.apply_space_motion(new_obstime=Time(frame.observed_start_utc))
        ra, dec = epoch.ra.deg, epoch.dec.deg
        x, y = wcs.all_world2pix(ra, dec, 0)
        if grid.raster_to_wcs == 'flip-y':
            y = grid.height_px - 1 - y
        for i in range(len(rows)):
            if np.isfinite(x[i]) and np.isfinite(y[i]) and -.5 <= x[i] < grid.width_px-.5 and -.5 <= y[i] < grid.height_px-.5:
                positions[i].append(CatalogPosition(
                    frame_id=frame.frame_id, x=float(x[i]), y=float(y[i]),
                    ra_deg=float(ra[i]), dec_deg=float(dec[i]),
                ))
    return [GaiaSource(
        source_id=row['source_id'], ra_deg=row['ra'], dec_deg=row['dec'], ref_epoch=row['ref_epoch'],
        pmra_mas_yr=row['pmra'], pmdec_mas_yr=row['pmdec'], g_magnitude=row['phot_g_mean_mag'],
        position_method='proper-motion' if move else 'catalog-position', positions=points,
    ) for row, move, points in zip(rows, moving, positions) if points]
