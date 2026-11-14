# Khonsu

**Find what time reveals.**

Khonsu is a visual observatory for exploring real SPHEREx infrared observations across time. Drag the sky through observed epochs, blink between registered images, and record candidate changes with their scientific context. ByteBoyz is building it for NASA Space Apps 2026, [Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/).

## Why Khonsu?

Khonsu is an ancient Egyptian lunar deity whose name is commonly translated as "the traveler," referring to the Moon's journey through the night sky. That relationship between the sky and passing time fits an app that reveals change across observations. See the [LACMA collection explanation](https://collections.lacma.org/object/62756).

The creative spark was the night-sky rewind gesture in *Moon Knight*. Our interpretation turns that feeling into an original, accessible observation timeline. We use the spelling **Khonsu**, an independent visual identity, and actual observation dates. We do not recreate Marvel characters, footage, music, or branding.

## MVP and current state

The minimum viable product (MVP) is a working end-to-end SPHEREx image explorer: bounded coordinate search, five validated example targets, registered chronological frames, time scrubbing and blink comparison, pan and zoom, provenance and quality details, and local candidate annotations with evidence export. [MVP acceptance criteria](docs/mvp.md) define completion.

**The backend foundation is implemented.** It supports bounded IRSA queries, temporary jobs, wavelength-aware FITS registration, masks and prepared images. The main frontend remains the team scaffold; viewer integration and the full observation-to-evidence journey still need team implementation. Synthetic fixtures are labelled and must never be presented as NASA observations or a discovery. See the [team handoff](docs/implementation-handoff.md).

## Start locally

Install Docker Desktop and start its Linux container engine. Then run:

```sh
docker compose up --build
```

Open http://localhost:3000. The API runs at http://localhost:8000 with interactive API documentation at http://localhost:8000/docs. The backend accepts a bounded live query and returns a job to poll. The frontend shell still needs the team's job/viewer integration. Use the API documentation to exercise the completed backend independently.

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

SPHEREx data comes from the [NASA/IPAC Infrared Science Archive](https://irsa.ipac.caltech.edu/Missions/spherex.html). The [data-source register](docs/data-sources.md) covers all eight challenge resources, access methods, citations, terms, and the optional Gaia DR3, WISE, CADC, and NEOSSat integrations. The [science rules](docs/science-integrity.md) explain registration, wavelength consistency, masks, dates, and the limits of candidate interpretation.

NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.

Code is MIT licensed. Data, fonts, external media, and third-party models retain their own terms and attribution requirements. NASA names and logos do not imply endorsement.

