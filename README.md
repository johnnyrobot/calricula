# Calricula - Intelligent Curriculum Management System

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/johnnyrobot/calricula)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg)](LICENSE)

An AI-assisted curriculum management platform that enables faculty to create, modify, and route Course Outlines of Record (CORs) and Programs through approval workflows.

## Screenshots

A traditional academic "catalog of record" interface — parchment ground, a deep‑navy index rail, and a single gold accent for rules and status seals, with Source Serif 4 display type and IBM Plex Mono numerals. Screens were authored in [Paper](https://paper.design) and exported to the live Tailwind theme. (Desktop; the redesign is light‑only.)

### Dashboard

![Registrar's-desk dashboard with status counts, the approvals queue, and recent curriculum activity](docs/images/dashboard.png)

### Courses & Course Outline of Record

<table>
  <tr>
    <td width="50%"><img src="docs/images/courses.png" alt="Course Outlines of Record — ruled data table with codes, units, C-ID, and status seals" /></td>
    <td width="50%"><img src="docs/images/course-outline.png" alt="Course Outline of Record — document view with units, requisites, SLOs, and content" /></td>
  </tr>
</table>

### SLO Editor & CB Code Wizard

<table>
  <tr>
    <td width="50%"><img src="docs/images/slo-editor.png" alt="Student Learning Outcomes editor with Bloom's verb picker and cognitive-level distribution" /></td>
    <td width="50%"><img src="docs/images/cb-code-wizard.png" alt="CB Code Wizard translating plain-language questions into Title 5 / PCAH compliance codes" /></td>
  </tr>
</table>

### Approvals & Sign In

<table>
  <tr>
    <td width="50%"><img src="docs/images/approvals.png" alt="Approvals review queue showing Course Outlines of Record routed through the workflow" /></td>
    <td width="50%"><img src="docs/images/login.png" alt="Sign in" /></td>
  </tr>
</table>

### Design System

![Academic design system — palette, type scale, status seals, and components](docs/images/design-system.png)

## Features

- **AI-Assisted Authoring**: Google Gemini 2.5 Flash integration for intelligent suggestions
- **Compliance Enforcement**: Community college regulations (PCAH 8th Edition, Title 5) embedded in the interface
- **54-Hour Rule Validation**: Automatic unit calculation and Title 5 § 55002.5 compliance
- **CB Code Wizard**: Natural language questions that translate to 27 compliance codes
- **SLO Editor**: Bloom's Taxonomy verb picker with cognitive level distribution visualization
- **Approval Workflows**: Role-based review process (Faculty → Department → Committee → Articulation → Approved)
- **Program Management**: Degree and certificate program builder with 60-unit limit validation
- **Labor Market Data**: BLS integration with occupational wages, employment projections, and county employment data
- **Academic "Catalog of Record" Design**: Traditional collegiate interface — parchment ground, navy crest, gold rules, and ruled data tables (light-only, WCAG 2.2 AA)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router) + Tailwind CSS + Academic Design System |
| Backend | Python FastAPI + PostgreSQL + SQLModel ORM |
| AI | Google Gemini 2.5 Flash with File Search API for RAG |
| Auth | Logto (OIDC) |
| Deployment | Docker Compose |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended)
- OR: Python 3.11+, Node.js 18+, PostgreSQL 16+
- A GitHub token with the `read:packages` scope. The frontend depends on the
  private package `@johnnyrobot/workspace-ui` (GitHub Packages), so building
  it from source needs one even if you never enable the ApplicationX embed.
  The package inherits the `applicationx` repository's permissions: your
  account (or, for CI, the `calricula` repository via "Manage Actions access"
  or the `WORKSPACE_UI_READ_TOKEN` secret) must have been granted read access
  to it. Pull requests from forks cannot build the frontend.
  See [Installing the shared workspace package](docs/APPLICATIONX-EMBED.md#installing-the-shared-workspace-package).

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/johnnyrobot/calricula.git
cd calricula

# Create environment file from template
cp .env.example .env

# GitHub token with read:packages for the frontend image build (gitignored;
# passed to Docker as a BuildKit secret, never stored in the image)
printf '%s' "<your token>" > .npm_token
```

### 2. Configure Environment Variables

Edit `.env` with your credentials (see [Environment Configuration](#environment-configuration) below).

### 3. Start with Docker (Recommended)

```bash
# Development mode (with hot reload)
docker-compose up

# OR Production mode
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Access the Application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3001 (dev) / http://localhost:3000 (prod) |
| Backend API | http://localhost:8001 (dev) / http://localhost:8000 (prod) |
| API Documentation | http://localhost:8001/docs |

### 5. Test Credentials

All test users use password: `Test123!`

| Email | Role | Permissions |
|-------|------|-------------|
| faculty@calricula.com | Faculty | Create/edit own courses |
| chair@calricula.com | Curriculum Chair | Review queue, approve courses |
| articulation@calricula.com | Articulation Officer | C-ID alignment, transfer review |
| admin@calricula.com | Admin | Full system access |

---

## Environment Configuration

### Required Variables

Copy `.env.example` to `.env` and configure these required variables:

#### Database

```env
# Option 1: Local Docker (default - no setup required!)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/calricula

# Option 2: Neon Serverless Postgres
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/calricula?sslmode=require
```

#### Google AI (Gemini)

```env
# Get from: https://makersuite.google.com/app/apikey
GOOGLE_API_KEY=AIzaSy...your-api-key

# File Search store name (auto-created on first use)
GEMINI_FILE_SEARCH_STORE_NAME=calricula-knowledge-base
```

#### Logto / OIDC Authentication

Full tenant setup (application, API resource, redirect URIs) is in
[`docs/AUTH-LOGTO.md`](docs/AUTH-LOGTO.md). Summary of the variables:

```env
# Backend — Logto tenant issuer and Calricula's own API resource
OIDC_ISSUER=https://your-tenant.logto.app/oidc
OIDC_AUDIENCE=https://api.calricula.local
OIDC_CLIENT_ID=your-logto-web-app-id

# Frontend — server-only, never prefixed NEXT_PUBLIC_
LOGTO_ENDPOINT=https://your-tenant.logto.app/
LOGTO_APP_ID=your-logto-web-app-id
LOGTO_APP_SECRET=your-logto-app-secret
LOGTO_COOKIE_SECRET=<openssl rand -base64 32>
LOGTO_API_RESOURCE=https://api.calricula.local

# Frontend — advertises Logto sign-in to the browser
NEXT_PUBLIC_LOGTO_ENABLED=true
```

### Optional Variables

#### Development Mode Auth Bypass

For local development without a Logto tenant:

```env
# Enable dev mode auth bypass (creates mock user sessions)
NEXT_PUBLIC_AUTH_DEV_MODE=true
```

#### Database Connection Pool

```env
DB_POOL_SIZE=5          # Connections to keep in pool
DB_MAX_OVERFLOW=10      # Extra connections for burst traffic
DB_POOL_TIMEOUT=30      # Seconds to wait for connection
DB_POOL_RECYCLE=1800    # Recycle connections after N seconds
DB_POOL_PRE_PING=true   # Health check before use
```

#### Logging

```env
LOG_LEVEL=INFO              # DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_JSON_FORMAT=true        # JSON logs for production
```

#### Production Settings

```env
ENVIRONMENT=production
DB_USER=calricula
DB_PASSWORD=your-secure-password-here
DB_NAME=calricula
```

#### ApplicationX companion (optional)

Calricula can host the staff workspace of ApplicationX, a separate companion
app for employer and career collaboration, inside its own layout. It is off by
default. To enable it, set the `APPLICATIONX_*` variables (see `.env.example`)
and read [docs/APPLICATIONX-EMBED.md](docs/APPLICATIONX-EMBED.md) for the
two-token contract, the allowlisted operations and the local stub upstream.
The embedded chat shell is the shared package `@johnnyrobot/workspace-ui`,
installed from GitHub Packages (a `read:packages` token is needed to build the
frontend; see that document).

---

## Logto Setup

Calricula authenticates through [Logto](https://logto.io), a self-hostable
OIDC provider (decision record: ADR-0001, summarised in
[`docs/AUTH-LOGTO.md`](docs/AUTH-LOGTO.md) §0). The full walkthrough —
creating the tenant, the "Traditional web" application, the API resource,
connector email verification, and demo-mode tenant requirements — is in
**[`docs/AUTH-LOGTO.md`](docs/AUTH-LOGTO.md)**. In short:

1. Create a Logto tenant (self-hosted or Logto Cloud).
2. Create a **"Traditional web" application** for Calricula with redirect URI
   `http://localhost:3001/callback` and post sign-out URI
   `http://localhost:3001/` (adjust for your domain in production).
3. Create an **API resource** whose indicator becomes `OIDC_AUDIENCE` /
   `LOGTO_API_RESOURCE`, e.g. `https://api.calricula.local`.
4. Set the backend (`OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_CLIENT_ID`) and
   frontend (`LOGTO_ENDPOINT`, `LOGTO_APP_ID`, `LOGTO_APP_SECRET`,
   `LOGTO_COOKIE_SECRET`, `LOGTO_API_RESOURCE`) variables from `.env.example`.
5. For local work with no tenant at all, set `AUTH_DEV_MODE=true` and
   `NEXT_PUBLIC_AUTH_DEV_MODE=true` instead — no Logto setup required.

The seeded test users (`faculty@`, `chair@`, `admin@calricula.com`, ...) exist
for dev mode only. They are stamped `auth_issuer = 'dev'`, so a Logto identity
with one of those addresses gets its own fresh account rather than adopting
the seeded one; do not create them in a production tenant, and do not load
the seeds into a production database (`docs/AUTH-LOGTO.md` §6). Real users
sign in through your tenant and are provisioned on first sign-in; assign
roles in Calricula afterwards.

---

## Google AI Setup

### 1. Get API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click **Create API Key**
3. Copy the key to your `.env`:

```env
GOOGLE_API_KEY=AIzaSy...your-key
```

### 2. Enable Required APIs (if using Google Cloud)

If you're using a Google Cloud project instead of AI Studio:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable these APIs:
   - Generative Language API
   - Cloud Storage API (for File Search)

### 3. File Search Store

The File Search store for RAG is created automatically on first document upload. You can also create it manually:

```env
GEMINI_FILE_SEARCH_STORE_NAME=calricula-knowledge-base
```

---

## Development Setup (Without Docker)

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Seed test data
python -m seeds.seed_all

# Start development server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies. @johnnyrobot/workspace-ui comes from GitHub Packages:
# put "//npm.pkg.github.com/:_authToken=<token>" in ~/.npmrc (read:packages),
# or pass it to this one command as shown. Never add it to frontend/.npmrc.
env "npm_config_//npm.pkg.github.com/:_authToken=$(gh auth token)" npm install

# Start development server
npm run dev
```

### Database Setup (Local PostgreSQL)

```bash
# Using Docker (easiest)
docker run -d \
  --name calricula-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=calricula \
  -p 5432:5432 \
  postgres:16-alpine

# Or install PostgreSQL locally and create database
createdb calricula
```

---

## Production Deployment

### Using Docker Compose

```bash
# Build production images. The frontend build needs ./.npm_token (or
# NPM_TOKEN_FILE=<path>): a GitHub read:packages token for an account that has
# been granted access to the private @johnnyrobot/workspace-ui package
# (it inherits the applicationx repository's permissions). See
# docs/APPLICATIONX-EMBED.md "Installing the shared workspace package".
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Run database migrations
docker-compose -f docker-compose.prod.yml exec backend alembic upgrade head

# Load reference data (first time only). Not `seeds.seed_all`: that one also
# creates the dev test users, courses and demo data (docs/AUTH-LOGTO.md §6).
# seed_departments loads a reference division/department list; courses require
# a department, so edit that list for your college first (the entries are in
# backend/seeds/seed_departments.py) or maintain the tables directly afterwards.
docker-compose -f docker-compose.prod.yml exec backend python -m seeds.seed_departments
docker-compose -f docker-compose.prod.yml exec backend python -m seeds.seed_top_codes
docker-compose -f docker-compose.prod.yml exec backend python -m seeds.seed_ccn_standards

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop services
docker-compose -f docker-compose.prod.yml down
```

### Production Environment Variables

Ensure these are set for production:

```env
ENVIRONMENT=production
DB_PASSWORD=<strong-unique-password>
GOOGLE_API_KEY=<production-api-key>
OIDC_ISSUER=<production-logto-tenant-issuer>
OIDC_AUDIENCE=<production-api-resource-indicator>
OIDC_CLIENT_ID=<production-logto-web-app-id>
```

### Security Checklist

- [ ] Use strong, unique database password
- [ ] Never commit `.env` (or any Logto app secret / cookie secret) to git
- [ ] Use HTTPS in production (configure nginx reverse proxy)
- [ ] Set `NEXT_PUBLIC_AUTH_DEV_MODE=false` in production
- [ ] Review the Logto tenant's connectors, MFA policy, and redirect URIs (`docs/AUTH-LOGTO.md`)
- [ ] Enable rate limiting for AI endpoints

---

## Troubleshooting

### Database Connection Issues

**Error**: `connection refused` or `could not connect to server`

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check database URL format
# Docker: postgresql://postgres:postgres@db:5432/calricula
# Local: postgresql://postgres:postgres@localhost:5432/calricula
```

**Error**: `password authentication failed`

- Verify `POSTGRES_PASSWORD` matches in docker-compose and DATABASE_URL
- For Docker, try removing the volume and recreating: `docker-compose down -v && docker-compose up`

### Logto (OIDC) Authentication Issues

See the full troubleshooting table in [`docs/AUTH-LOGTO.md`](docs/AUTH-LOGTO.md). Common cases:

**Error**: API returns `503 authentication not configured` / `authentication temporarily unavailable`

- The backend has no `OIDC_ISSUER`/`OIDC_AUDIENCE` set, or can't reach the
  Logto JWKS endpoint. Inside Docker, set `OIDC_JWKS_URL` to the Logto
  service's internal address rather than relying on `localhost`.

**Error**: API returns `401 invalid or expired token`

- The access token expired, was signed with an algorithm not in
  `OIDC_ALGORITHMS`, or its `aud` doesn't match `OIDC_AUDIENCE`.

**Error**: Backend refuses to boot with `OIDC_AUDIENCE equal to OIDC_CLIENT_ID`

- `OIDC_AUDIENCE` (the API resource) and `OIDC_CLIENT_ID` (the web app id)
  must be different Logto resources; using the same value would let an ID
  token satisfy the access-token audience check.

**Workaround for development without a Logto tenant**:

```env
AUTH_DEV_MODE=true
NEXT_PUBLIC_AUTH_DEV_MODE=true
```

### Frontend Build Issues

**Error**: `Module not found`

```bash
# Clear node_modules and reinstall
cd frontend
rm -rf node_modules .next
npm install
npm run dev
```

**Error**: `npm error 401 Unauthorized` / `E401` for `@johnnyrobot/workspace-ui`

The shared workspace package lives on GitHub Packages and the install had no
usable `read:packages` token. Locally, add the token to `~/.npmrc`; in Docker,
pass it as the `npm_token` BuildKit secret (`./.npm_token` with compose). See
[docs/APPLICATIONX-EMBED.md](docs/APPLICATIONX-EMBED.md#installing-the-shared-workspace-package).

**Docker-specific**: If modules are missing in Docker:

```bash
# Rebuild without cache
docker-compose build --no-cache frontend
```

### AI Features Not Working

**Error**: `API key not valid`

- Verify `GOOGLE_API_KEY` is set correctly
- Check the API key has access to Gemini models

**Error**: `Model not found`

- Ensure you're using `gemini-2.5-flash` (or current model name)
- Check your API key has access to the Generative Language API

### Port Conflicts

```bash
# Check what's using a port
lsof -i :3000
lsof -i :8000

# Kill the process
kill -9 <PID>

# Or use different ports
FRONTEND_PORT=3002 BACKEND_PORT=8002 docker-compose up
```

---

## Project Structure

```
calricula/
├── backend/                 # Python FastAPI backend
│   ├── app/
│   │   ├── api/            # API routes
│   │   ├── core/           # Configuration, security
│   │   ├── models/         # SQLModel database models
│   │   └── services/       # Business logic
│   ├── seeds/              # Database seed scripts
│   ├── tests/              # Backend tests
│   ├── alembic/            # Database migrations
│   └── requirements.txt
├── frontend/               # Next.js React frontend
│   ├── src/
│   │   ├── app/           # Next.js App Router pages
│   │   ├── components/    # React components
│   │   ├── contexts/      # React contexts
│   │   ├── lib/           # Utilities, API client
│   │   └── styles/        # Global styles
│   └── package.json
├── docker-compose.yml      # Development Docker config
├── docker-compose.prod.yml # Production Docker config
├── .env.example           # Environment template
└── init.sh                # Development setup script
```

---

## API Documentation

The API documentation is available at `/docs` when the backend is running:

- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

Key API endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `POST /api/auth/login` | Authenticate user |
| `GET /api/courses` | List courses |
| `POST /api/courses` | Create course |
| `GET /api/programs` | List programs |
| `POST /api/ai/suggest/*` | AI suggestions |
| `GET /api/compliance/audit/{id}` | Compliance audit |
| `GET /api/bls/oes` | Occupational wage data |
| `GET /api/bls/projections/{soc}` | Employment projections |
| `GET /api/qcew/summary/{area}` | County employment data |

---

## BLS Labor Market Data

The `/bls-data` page provides labor market intelligence from the U.S. Bureau of Labor Statistics to help faculty align curriculum with workforce needs.

### Features

| Tab | Data Source | Description |
|-----|-------------|-------------|
| **Occupational Wages** | OES Survey | Searchable wage data for ~450 SOC occupations with percentile breakdowns |
| **Career Outlook** | Employment Projections | 10-year growth forecasts, annual openings, education requirements |
| **Local Employment** | QCEW | County-level employment and wages by industry (LA, Orange, San Diego, etc.) |
| **Unemployment** | LAUS | Unemployment rates for California metros and national |
| **CPI** | Consumer Price Index | Inflation data for cost-of-living context |

### Example Queries

```bash
# Get wage data for Registered Nurses
curl "http://localhost:8001/api/bls/oes?occupation=291141&areas=national,california,los_angeles"

# Get 10-year projection with education requirements
curl "http://localhost:8001/api/bls/projections/291141"

# Get LA County employment by industry
curl "http://localhost:8001/api/qcew/summary/los_angeles"

# Search occupations
curl "http://localhost:8001/api/bls/occupations/search?q=nurse&limit=10"
```

### Optional: BLS API Key

The BLS API works without a key (limited to 25 requests/day). For higher limits, get a free key:

1. Register at [BLS Public Data API](https://www.bls.gov/developers/home.htm)
2. Add to `.env`:

```env
BLS_API_KEY=your-api-key-here
```

---

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run tests: `pytest` (backend), `npm test` (frontend)
4. Submit a pull request

---

## License

This project is licensed under the **BSD 3-Clause License** with additional branding requirements.

### Quick Summary

| You CAN | You CANNOT (without exemption) |
|---------|-------------------------------|
| Use for any purpose | Remove "Calricula" branding from UI |
| Modify the code | Rename to "Calricula" variants |
| Distribute copies | Claim official endorsement |
| Use commercially | Co-brand with equal prominence |

### Branding Exemptions

You may modify branding if ANY of these apply:
- **Small deployment**: ≤50 users in any 30-day period
- **Contributor**: 1+ year of consistent contributions + written permission
- **Enterprise**: Commercial license agreement

See [LICENSE](LICENSE) for full terms.
