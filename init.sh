#!/bin/bash
# =============================================================================
# Calricula - Intelligent Curriculum Management System
# Setup Script for Development Environment
# =============================================================================

set -e

echo "========================================"
echo "  Calricula Development Setup"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo "Creating .env from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}Created .env file. Please update with your credentials.${NC}"
    else
        echo -e "${RED}Error: .env.example not found. Please create .env manually.${NC}"
        exit 1
    fi
fi

# Source environment variables
export $(grep -v '^#' .env | xargs)

echo ""
echo "Step 1: Setting up Backend..."
echo "----------------------------------------------"
cd backend

# Create Python virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install Python dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Run database migrations
echo "Running database migrations..."
alembic upgrade head

# Run seed data
echo "Seeding database with test data..."
python -m seeds.seed_all

cd ..

echo ""
echo "Step 2: Setting up Frontend..."
echo "----------------------------------------------"
cd frontend

# Install Node dependencies
echo "Installing Node.js dependencies..."
npm install

cd ..

echo ""
echo "Step 3: Setting up Docker services..."
echo "----------------------------------------------"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}Warning: Docker is not running. Please start Docker to use local PostgreSQL.${NC}"
else
    echo "Starting Docker services (PostgreSQL)..."
    docker-compose up -d db

    # Wait for PostgreSQL to be ready
    echo "Waiting for PostgreSQL to be ready..."
    sleep 5
fi

echo ""
echo "========================================"
echo -e "${GREEN}  Setup Complete!${NC}"
echo "========================================"
echo ""
echo "To start the development servers:"
echo ""
echo "  Backend (API):    cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000"
echo "  Frontend (Web):   cd frontend && npm run dev"
echo ""
echo "Or use Docker Compose:"
echo "  docker-compose up"
echo ""
echo "Access the application at:"
echo "  Frontend: http://localhost:3000"
echo "  Backend API: http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Test Users (password: Test123!):"
echo "  faculty@calricula.com      - Faculty"
echo "  chair@calricula.com        - Curriculum Chair"
echo "  articulation@calricula.com - Articulation Officer"
echo "  admin@calricula.com        - Admin"
echo ""
