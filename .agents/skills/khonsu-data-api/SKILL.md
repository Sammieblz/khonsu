---
name: khonsu-data-api
description: Implement, debug or review Khonsu FastAPI routes, SPHEREx archive adapters, downloads, job lifecycle, frame manifests, HTTP client integration, schemas and provenance. Use for data acquisition and API changes while keeping scientific array processing in its separate module.
---

# Khonsu data and API

1. Read [data-sources.md](../../../docs/data-sources.md), [architecture.md](../../../docs/architecture.md), [integration.md](../../../docs/integration.md) and [ownership.md](../../../docs/ownership.md). Inspect current schemas and generated-client rules before editing endpoints.
2. Retrieve real SPHEREx spectral images for the core flow. Follow the current DR1 and QR3 collection policy and preserve release, product identity, observation time and spectral metadata. Keep WISE, Gaia Data Release 3 and NEOSSat optional until the SPHEREx flow works.
3. Validate coordinates, field size, time range and requested provider. Bound results, downloads, retries, timeouts and jobs. Use metadata-returned URLs from allowed archive hosts; reject arbitrary user-provided fetch targets.
4. Separate empty coverage, upstream failure, processing failure, cancellation and missing or expired jobs. Keep temporary jobs consistent with one backend instance and one application process. Follow [deployment.md](../../../docs/deployment.md) for restart and cold-start behavior.
5. Pass supplied inputs and explicit options to the processing module. Publish ready frame assets and metadata through the canonical response contract. Do not duplicate calibration, WCS or mask logic in routes.
6. Update authoritative schemas, examples and generated TypeScript together using the documented commands. Coordinate contract and dependency changes before merging. Preserve errors and provenance through the client.
7. Verify a bounded real search plus empty, failed, cancelled and reset paths using [testing.md](../../../docs/testing.md). State which routes return real observations and which remain scaffolding.
