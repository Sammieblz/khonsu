"""Controlled catalog fixtures test registration and failure behavior, not discoveries."""
import math

import pytest
from fastapi.testclient import TestClient

from app.main import app, real_examples
from app.retrieval import gaia
from app.jobs import JobError

HEADER = '#Name: I/355/gaiadr3\n#Coosys\tH_2016.000:\tICRS\nSource\tRA_ICRS\tDE_ICRS\tpmRA\tpmDE\tGmag\n \tdeg\tdeg\tmas/yr\tmas/yr\tmag\n---\t---\t---\t---\t---\t---\n'


def test_parse_preserves_large_identifiers_missing_motion_and_limits():
    data = HEADER + '6000000000000000123\t359.9\t-2\t\t\t17.3\n' + 'bad\t0\t0\t0\t0\t10\n'
    rows, truncated, skipped = gaia.parse_catalog(data.encode())
    assert rows[0]['source_id'] == '6000000000000000123'
    assert rows[0]['pmra'] is None
    assert not truncated and skipped == 1
    data = HEADER + ''.join(f'{i}\t0\t0\t0\t0\t10\n' for i in range(501))
    rows, truncated, skipped = gaia.parse_catalog(data.encode())
    assert len(rows) == 500 and truncated
    with pytest.raises(ValueError):
        gaia.parse_catalog(b'<html>upstream failed</html>')
    with pytest.raises(ValueError):
        gaia.parse_catalog(b'x' * (gaia.MAX_BYTES + 1))


@pytest.mark.parametrize('ra,dec,flip', [(0.00001,0,False),(359.9999,80,True),(10,-89.5,True)])
def test_catalog_epoch_projection_and_grid_origin(ra,dec,flip):
    pytest.importorskip('astropy')
    from astropy.coordinates import SkyCoord
    from astropy.time import Time
    from astropy.wcs import WCS
    import astropy.units as u
    from app.processing.catalog import project_sources, query_radius
    manifest = real_examples()[0].model_copy(deep=True)
    manifest.target.ra_deg=ra; manifest.target.dec_deg=dec
    grid=manifest.grid
    wcs=WCS(naxis=2)
    wcs.wcs.ctype=['RA---TAN','DEC--TAN'];wcs.wcs.crval=[ra,dec]
    wcs.wcs.crpix=[(grid.width_px+1)/2,(grid.height_px+1)/2]
    wcs.wcs.cdelt=[-.001,.001]
    grid.wcs_header=dict(wcs.to_header());grid.raster_to_wcs='flip-y' if flip else 'identity'
    rows=[dict(source_id='6000000000000000123',ra=ra,dec=dec,ref_epoch=2016.,pmra=1000.,pmdec=-2000.,phot_g_mean_mag=15.),
          dict(source_id='6000000000000000124',ra=ra,dec=dec,ref_epoch=2016.,pmra=None,pmdec=None,phot_g_mean_mag=None)]
    original=manifest.model_dump_json()
    sources=project_sources(manifest,rows)
    assert len(sources)==2
    fixed=sources[1].positions[0]
    assert abs(fixed.x-(grid.width_px-1)/2)<1e-7
    assert abs(fixed.y-(grid.height_px-1)/2)<1e-7
    assert sources[1].position_method=='catalog-position'
    for position in sources[0].positions:
        frame=next(f for f in manifest.frames if f.frame_id==position.frame_id)
        years=Time(frame.observed_start_utc).jyear-2016
        separation=SkyCoord(ra*u.deg,dec*u.deg).separation(SkyCoord(position.ra_deg*u.deg,position.dec_deg*u.deg)).arcsec
        assert abs(separation-math.hypot(1,2)*years)<.002
        y=grid.height_px-1-position.y if flip else position.y
        sky=wcs.pixel_to_world(position.x,y)
        assert sky.separation(SkyCoord(position.ra_deg*u.deg,position.dec_deg*u.deg)).arcsec<1e-6
    assert .1<query_radius(manifest)<2
    assert manifest.model_dump_json()==original


def test_cached_route_provenance_cache_outage_and_no_client_sql(monkeypatch):
    pytest.importorskip('astropy')
    manifest=real_examples()[0]
    calls=[]
    def fetch(query):
        calls.append(query)
        return (HEADER+f'6000000000000000123\t{manifest.target.ra_deg}\t{manifest.target.dec_deg}\t0\t0\t15\n').encode()
    monkeypatch.setattr(gaia,'fetch_catalog',fetch)
    gaia._cache.clear()
    with TestClient(app) as client:
        path=f'/v1/examples/{manifest.sequence_id}/context/gaia'
        response=client.get(path)
        assert response.status_code==200,response.text
        body=response.json()
        assert body['sources'][0]['source_id']=='6000000000000000123'
        assert body['catalog']=='Gaia DR3' and body['sequence_id']==manifest.sequence_id
        assert body['query_radius_deg']>.1
        assert client.get(path).status_code==200 and len(calls)==1
        assert '-out.max=501' in calls[0] and 'I%2F355%2Fgaiadr3' in calls[0]
        assert client.get('/v1/examples/missing/context/gaia').status_code==404
        gaia._cache.clear()
        monkeypatch.setattr(gaia,'fetch_catalog',lambda query:(_ for _ in ()).throw(TimeoutError('private upstream details')))
        failed=client.get(path)
        assert failed.status_code==503 and 'private' not in failed.text
        assert client.get('/v1/examples').status_code==200


def test_catalog_requests_are_concurrency_bounded():
    gaia._cache.clear()
    gaia._slots.acquire();gaia._slots.acquire()
    try:
        with pytest.raises(JobError) as error:
            gaia.gaia_context(real_examples()[0])
        assert error.value.status==429
    finally:
        gaia._slots.release();gaia._slots.release()
