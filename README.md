# Khonsu

**Find what time reveals.**

Khonsu is a visual observatory for exploring real SPHEREx infrared observations across time. Enter a sky position, load registered observations, step through their actual dates, and keep local notes about features worth investigating. ByteBoyz is building it for NASA Space Apps 2026, [Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/).

## Why Khonsu?

Khonsu is an ancient Egyptian lunar deity whose name is commonly translated as "the traveler," referring to the Moon's journey through the night sky. That relationship between the sky and passing time fits an app that reveals change across observations. See the [LACMA collection explanation](https://collections.lacma.org/object/62756).

The creative spark was the night-sky rewind gesture in *Moon Knight*. Our interpretation turns that feeling into an original, accessible observation timeline. We use the spelling **Khonsu**, an independent visual identity, and actual observation dates. We do not recreate Marvel characters, footage, music, or branding.

## MVP and current state

The minimum viable product (MVP) targets a complete SPHEREx image explorer: bounded coordinate search, five validated example targets, registered chronological frames, time scrubbing and blink comparison, pan and zoom, provenance and quality details, and local candidate annotations with evidence export. [MVP acceptance criteria](docs/mvp.md) define completion; this list is a delivery goal, not a claim that every feature is finished.

**The live coordinate-to-viewer path works locally.** The frontend submits bounded IRSA searches, displays download progress, and loads prepared real frames. The CPython backend reads FITS, selects comparable approximate wavelengths at the requested position, registers frames on a common celestial grid, preserves quality masks, and applies one recorded display stretch. The viewer supports dated frame selection, stepping, playback and local candidate marks. See the [coverage evidence](docs/target-coverage.md) and [display method and limits](docs/display-rendering.md).

The observation console now supports real-date rewind dragging, pan/zoom/reset, selected A/B blink and hold comparison, keyboard controls and shared black/white, asinh and gamma adjustments. Prepared float intensities use optional WebGL2 acceleration with worker/Canvas recovery; FITS and scientific processing remain in Python. Five catalog presets, an original celestial entry and an optional NASA Eyes mission panel are integrated. See the [console acceptance and hands-on guide](docs/console-acceptance.md) for Chromium/Firefox evidence and screenshots.

Searches can be shared by URL. A candidate mark records its ICRS position, the observations compared and a snapshot of the sequence, and stays in the browser until exported as a versioned evidence file. See [shared search links, candidate marks and evidence export](docs/integration.md#shared-search-links). A public hosted demonstration and the official project submission remain release gates. The [initial backend handoff](docs/implementation-handoff.md) is historical; current tickets and acceptance evidence govern completion.

[Clean View](docs/clean-view.md) fills eligible small gaps for a clearer first look,
with estimated-area labels, an original-view comparison and a remembered on/off
choice. Original measurements stay intact; large holes and bright cores remain
unfilled. Mark mode shows original data. Technical controls are under Advanced.

Cached real observations and synthetic development fixtures are distinct. A cached example is usable only when its verified bundle is present and the interface labels it as previously acquired data. A failed live query must not silently load another field or synthetic imagery. Coverage alone does not prove a target detection, motion, brightness change or Planet X discovery.

## Start locally

Install Docker Desktop and start its Linux container engine. Then run:

```sh
docker compose up --build
```

Open http://localhost:3000. The API runs at http://localhost:8000 with interactive API documentation at http://localhost:8000/docs. The backend accepts a bounded live query and returns a job to poll. The explorer form starts a live search, shows progress, and loads the finished sequence into the viewer; a 16-frame search typically takes about a minute, longer when IRSA is busy. Use the API documentation to exercise the backend directly.

For a reproducible presentation, follow the [demo and rehearsal runbook](docs/demo.md). The [submission handoff](docs/submission.md) contains draft project text, source credits, release gates and the final portal checklist. It is not a submission receipt.

For native development, use Node.js 24 and Python 3.12:

```sh
npm --prefix apps/web ci
npm --prefix apps/web run dev
python -m venv .venv
```

Activate the virtual environment, then:

```sh
python -m pip install -r apps/api/requirements-dev.txt -r apps/api/requirements-science.txt
python -m uvicorn app.main:app --app-dir apps/api --reload --port 8000
```

Copy the relevant `.env.example` files before changing defaults. See [deployment](docs/deployment.md), [integration](docs/integration.md), and [testing](docs/testing.md) for environment variables, science dependencies, contract generation, and verification.

## Stack and ownership

| Area | Choice | Initial owner |
| --- | --- | --- |
| Frontend and brand | Next.js App Router, TypeScript, CSS Modules, static export | Robel Mezgebe |
| Observation viewer | Canvas, real-epoch timeline, blink, pan and zoom | Michael Ameteku |
| Discovery and quality | Candidate annotations, evidence export, guidance, accessibility | Aryan Pai |
| API and data access | FastAPI, bounded jobs, IRSA integration, generated contracts | Tyrone A. Johnson |
| Scientific processing | NumPy, Astropy, reproject, image registration and quality | Samuel Ndubuisi |
| Hosting | Cloudflare Pages frontend; local Docker backend and Cloudflare Containers path | Tyrone with Robel |

The frontend can use Cloudflare Pages' free plan. Cloudflare Containers requires a paid Workers plan plus any usage charges. Local Docker is the zero-cloud-cost backend option. No paid infrastructure is provisioned by this scaffold.

## Repository map

```text
apps/web/          Next.js frontend, isolated feature folders
apps/api/          Python API, retrieval and scientific processing
contracts/         OpenAPI snapshot and integration examples
fixtures/          Clearly labelled development and future real-data fixtures
infra/            Cloudflare deployment configuration
scripts/          Contract export and repository checks
docs/             Product, design, science, architecture, delivery
.agents/skills/   Task-specific instructions for coding agents
.github/          Contribution templates and continuous integration
```

See the [22-ticket MVP roadmap](docs/roadmap.md) and [verified scaffold status](docs/scaffold-status.md).

Start with [CONTRIBUTING.md](CONTRIBUTING.md) and [ownership](docs/ownership.md). Coding agents must read [AGENTS.md](AGENTS.md). Pick a ticket from the [NASA Space Apps board](https://github.com/users/Sammieblz/projects/14), respect folder ownership, and keep pull requests small. Contributors beyond the original five are welcome.

## Data and credits

The optional [astro image refinement](docs/astro-refinement.md) adds gentler
grain and highlights to the console, with original comparison and recorded
scientific limits. Follow its Docker testing steps to compare the same real frame.

SPHEREx data comes from the [NASA/IPAC Infrared Science Archive](https://irsa.ipac.caltech.edu/Missions/spherex.html). The [data-source register](docs/data-sources.md) covers all eight challenge resources, access methods, citations, terms, and the optional Gaia DR3, WISE, CADC, and NEOSSat integrations. The [science rules](docs/science-integrity.md) explain registration, wavelength consistency, masks, dates, and the limits of candidate interpretation.

NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.

Code is MIT licensed. Data, fonts, external media, and third-party models retain their own terms and attribution requirements. NASA names and logos do not imply endorsement.

