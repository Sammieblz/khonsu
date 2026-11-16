"""Smoke-test the actual API origin without credentials or third-party packages.

The optional cancellation check starts one small archive job then cancels it.
The default checks use existing real cached data and an isolated notebook key.
"""
import argparse
import json
import secrets
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://localhost:8000')
    parser.add_argument('--origin', default='https://khonsulive.earth')
    parser.add_argument('--cancel-job', action='store_true')
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    parsed = urlsplit(base)
    assert parsed.scheme in ('http', 'https') and parsed.netloc
    assert not (parsed.path or parsed.query or parsed.fragment or parsed.username)

    def request(path, method='GET', value=None, headers=None, expected=200):
        assert path.startswith('/') and not path.startswith('//')
        request_headers = {'Origin': args.origin, **(headers or {})}
        data = None if value is None else json.dumps(value).encode()
        if data is not None:
            request_headers['Content-Type'] = 'application/json'
        req = Request(base + path, data=data, headers=request_headers, method=method)
        try:
            response = urlopen(req, timeout=30)
        except HTTPError as error:
            response = error
        with response:
            assert response.status == expected, f'{method} {path}: HTTP {response.status}, expected {expected}'
            content = response.read(8 * 1024 * 1024 + 1)
            assert len(content) <= 8 * 1024 * 1024
            return response.headers, content

    headers, body = request('/health')
    assert json.loads(body)['live_processing_available'] is True
    assert headers.get('Access-Control-Allow-Origin') == args.origin
    headers, _ = request('/health', headers={'Origin': 'https://unconfigured.invalid'})
    assert headers.get('Access-Control-Allow-Origin') is None
    for path, method, names in [
        ('/v1/sequences', 'POST', 'content-type'),
        ('/v1/notebook', 'PUT', 'content-type,x-khonsu-notebook'),
    ]:
        headers, _ = request(path, 'OPTIONS', headers={
            'Access-Control-Request-Method': method,
            'Access-Control-Request-Headers': names,
        })
        assert headers.get('Access-Control-Allow-Origin') == args.origin
        assert method in headers.get('Access-Control-Allow-Methods', '')
        allowed = headers.get('Access-Control-Allow-Headers', '').lower()
        assert all(name in allowed for name in names.split(','))
    _, body = request('/v1/presets')
    assert len(json.loads(body)) == 5
    _, body = request('/v1/examples')
    examples = json.loads(body)
    assert examples and all(example['data_mode'] == 'cached-real' for example in examples)
    image = examples[0]['frames'][0]['image_url']
    _, body = request(image)
    assert body.startswith(b'\x89PNG\r\n\x1a\n')
    _, body = request('/v1/sequences', 'POST', {'ra_deg': 400, 'dec_deg': 0}, expected=422)
    assert json.loads(body)['code'] == 'INVALID_REQUEST'
    _, body = request('/v1/sequences/tunnel-smoke-missing/cancel', 'POST', {}, expected=410)
    assert json.loads(body)['code']
    headers, body = request('/v1/notebook', headers={'X-Khonsu-Notebook': secrets.token_hex(32)})
    assert json.loads(body) == {'revision': 0, 'document': None}
    assert headers.get('Cache-Control') == 'private, no-store'
    if args.cancel_job:
        _, body = request('/v1/sequences', 'POST', {
            'ra_deg': 270.00123, 'dec_deg': 66.5, 'fov_arcmin': 1, 'max_frames': 2,
        }, expected=202)
        sequence = json.loads(body)['sequence_id']
        _, body = request(f'/v1/sequences/{sequence}/cancel', 'POST', {})
        assert json.loads(body)['status'] == 'cancelled'
    print(json.dumps({'base_url': base, 'origin': args.origin, 'health': 'passed',
                      'cors_and_preflight': 'passed', 'real_cached_png': 'passed',
                      'validation_and_cancel_route': 'passed', 'private_notebook': 'passed',
                      'live_job_cancellation': 'passed' if args.cancel_job else 'not run'}))


if __name__ == '__main__':
    main()
