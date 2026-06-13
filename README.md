# Calricula - Intelligent Curriculum Management System

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/johnnyphung-laccd/calricula)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg)](LICENSE)

An AI-assisted curriculum management platform that enables faculty to create, modify, and route Course Outlines of Record (CORs) and Programs through approval workflows.

## Features

- **AI-Assisted Authoring**: Google Gemini 2.5 Flash integration for intelligent suggestions
- **Compliance Enforcement**: Community college regulations (PCAH 8th Edition, Title 5) embedded in the interface
- **54-Hour Rule Validation**: Automatic unit calculation and Title 5 § 55002.5 compliance
- **CB Code Wizard**: Natural language questions that translate to 27 compliance codes
- **SLO Editor**: Bloom's Taxonomy verb picker with cognitive level distribution visualization
- **Approval Workflows**: Role-based review process (Faculty → Department → Committee → Articulation → Approved)
- **Program Management**: Degree and certificate program builder with 60-unit limit validation
- **Labor Market Data**: BLS integration with occupational wages, employment projections, and county employment data
- **Dark Mode Support**: Full light/dark theme with system preference detection

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router) + Tailwind CSS + Luminous Design System |
| Backend | Python FastAPI + PostgreSQL + SQLModel ORM |
| AI | Google Gemini 2.5 Flash with File Search API for RAG |
| Auth | Firebase Authentication (Email/Password) |
| Deployment | Docker Compose |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended)
- OR: Python 3.11+, Node.js 18+, PostgreSQL 16+

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/johnnyphung-laccd/calricula.git
cd calricula

# Create environment file from template
cp .env.example .env
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

#### Firebase Authentication

```env
# Get from: Firebase Console > Project Settings > General
FIREBASE_PROJECT_ID=your-project-id

# Path to service account key (download from Firebase Console)
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json

# Frontend config (get from Firebase Console > Your Apps > Web App)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
```

### Optional Variables

#### Development Mode Auth Bypass

For local development without Firebase setup:

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

---

## Firebase Setup

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project" and follow the wizard
3. Enable Google Analytics (optional)

### 2. Enable Email/Password Authentication

1. Navigate to **Authentication** > **Sign-in method**
2. Click **Email/Password** and enable it
3. Click **Save**

### 3. Download Service Account Key

1. Go to **Project Settings** > **Service Accounts**
2. Click **Generate New Private Key**
3. Save as `serviceAccountKey.json` in the project root
4. **Security**: Never commit this file to git (it's in `.gitignore`)

### 4. Get Web App Configuration

1. Go to **Project Settings** > **Your Apps**
2. Click **Add App** > **Web** (</> icon)
3. Register your app with a nickname
4. Copy the `firebaseConfig` values to your `.env`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=<apiKey>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<authDomain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<projectId>
```

### 5. Create Test Users (Optional)

1. Go to **Authentication** > **Users**
2. Click **Add User**
3. Create users matching the test credentials above

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

# Install dependencies
npm install

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
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Run database migrations
docker-compose -f docker-compose.prod.yml exec backend alembic upgrade head

# Seed initial data (first time only)
docker-compose -f docker-compose.prod.yml exec backend python -m seeds.seed_all

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
FIREBASE_PROJECT_ID=<production-project>
```

### Security Checklist

- [ ] Use strong, unique database password
- [ ] Never commit `serviceAccountKey.json` to git
- [ ] Use HTTPS in production (configure nginx reverse proxy)
- [ ] Set `NEXT_PUBLIC_AUTH_DEV_MODE=false` in production
- [ ] Review Firebase security rules
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

### Firebase Authentication Issues

**Error**: `Firebase: Error (auth/api-key-not-valid)`

- Verify `NEXT_PUBLIC_FIREBASE_API_KEY` is correct
- Check the API key is not restricted to wrong domains

**Error**: `Firebase ID token has invalid signature`

- Ensure `FIREBASE_PROJECT_ID` matches your Firebase project
- Verify `serviceAccountKey.json` is from the same project

**Workaround for development without Firebase**:

```env
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
