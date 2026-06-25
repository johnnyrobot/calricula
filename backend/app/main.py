"""
Calricula API - FastAPI Application Entry Point

This is the main entry point for the Calricula backend API.
It configures CORS, routes, and provides health check endpoints.
"""

from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session, text
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.database import create_db_and_tables, get_session, engine, get_pool_status, update_schema_for_lmi
from app.core.logging import configure_logging, RequestLoggingMiddleware, get_logger, get_request_id
from app.core.rate_limiter import limiter, rate_limit_exceeded_handler

# Configure logging at module load
logger = configure_logging(
    log_level=settings.LOG_LEVEL,
    json_format=settings.LOG_JSON_FORMAT,
    service_name="calricula-api",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events - startup and shutdown."""
    # Startup
    logger.info(
        f"Starting {settings.APP_NAME} v{settings.APP_VERSION}",
    )
    logger.info(f"Log level: {settings.LOG_LEVEL}, JSON format: {settings.LOG_JSON_FORMAT}")
    # Note: In production, use Alembic migrations instead
    # create_db_and_tables()
    
    # Run manual schema update for LMI
    update_schema_for_lmi()
    
    yield
    # Shutdown
    logger.info("Shutting down...")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
    Calricula API - Intelligent Curriculum Management System

    AI-assisted Course Outline of Record (COR) creation with embedded
    community college compliance (PCAH, Title 5).

    ## Features

    * **Course Management** - Create, edit, and manage Course Outlines of Record
    * **Program Builder** - Build degree and certificate programs
    * **Compliance Engine** - Automatic CB code generation and validation
    * **AI Assistant** - Gemini-powered curriculum suggestions with RAG
    * **Approval Workflow** - Multi-stage review and approval process

    ## Rate Limits

    AI endpoints are rate-limited to prevent abuse:
    * AI Generation (suggestions): 10 requests/minute
    * AI Chat: 30 requests/minute
    * RAG/Search: 20 requests/minute
    * Admin users are exempt from rate limits
    """,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Configure rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Reject requests with an untrusted/forged Host header (defense-in-depth that
# pairs with the Starlette BadHost fix, CVE-2026-48710). Effective only when
# ALLOWED_HOSTS is restricted away from the "*" default — production should set it.
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.ALLOWED_HOSTS,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request logging middleware
# Temporarily disabled due to FastAPI middleware compatibility issue
# app.add_middleware(RequestLoggingMiddleware, logger=logger, exclude_paths=["/health", "/health/db", "/health/pool", "/docs", "/redoc", "/openapi.json"])


# =============================================================================
# Health Check Endpoints
# =============================================================================

def _build_health_response() -> dict:
    """Build the health check response dict."""
    response = {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "timestamp": datetime.utcnow().isoformat(),
    }
    request_id = get_request_id()
    if request_id:
        response["request_id"] = request_id
    return response


@app.get("/health", tags=["Health"])
async def health_check():
    """
    Basic health check endpoint.
    Returns the service status, version, and uptime.
    """
    return _build_health_response()


@app.get("/api/health", tags=["Health"])
async def api_health_check():
    """
    Health check at /api/health path.
    Handles requests from reverse proxies that route /api/* to this backend.
    """
    return _build_health_response()


@app.get("/health/db", tags=["Health"])
async def health_check_db(session: Session = Depends(get_session)):
    """
    Database connectivity health check.
    Returns 200 if database is connected, 503 if unavailable.
    """
    try:
        # Execute a simple query to check database connectivity
        result = session.exec(text("SELECT 1"))
        result.fetchone()
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )


@app.get("/health/pool", tags=["Health"])
async def health_check_pool():
    """
    Database connection pool status.
    Returns current pool metrics for monitoring connection usage.

    Metrics returned:
    - pool_type: QueuePool or NullPool
    - pool_size: Configured pool size (QueuePool only)
    - checked_out: Currently active connections
    - overflow: Connections beyond pool_size
    - checkedin: Available connections in pool
    """
    pool_status = get_pool_status()
    return {
        "status": "healthy",
        "pool": pool_status,
        "timestamp": datetime.utcnow().isoformat(),
    }


# =============================================================================
# API Routes
# =============================================================================

from app.api.routes import auth, courses, departments, approvals, programs, ai, export, reference, compliance, workflow, elumen, documents, notifications, cross_listings, lmi, dashboard, bls, qcew

# Authentication routes
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])

# Course management routes
app.include_router(courses.router, prefix="/api/courses", tags=["Courses"])

# Department routes
app.include_router(departments.router, prefix="/api/departments", tags=["Departments"])

# Approval workflow routes
app.include_router(approvals.router, prefix="/api/approvals", tags=["Approvals"])

# Program management routes
app.include_router(programs.router, prefix="/api/programs", tags=["Programs"])

# AI Assistant routes
app.include_router(ai.router, tags=["AI Assistant"])

# Export routes (PDF, eLumen)
app.include_router(export.router, tags=["Export"])

# Reference data routes (CCN, TOP codes)
app.include_router(reference.router, prefix="/api/reference", tags=["Reference Data"])

# Compliance audit routes
app.include_router(compliance.router, prefix="/api/compliance", tags=["Compliance"])

# Workflow routes (comments, history)
app.include_router(workflow.router, prefix="/api/workflow", tags=["Workflow"])

# eLumen browser routes
app.include_router(elumen.router, tags=["eLumen Browser"])

# Document upload routes
app.include_router(documents.router, tags=["Documents"])

# Notification routes
app.include_router(notifications.router, prefix="/api", tags=["Notifications"])

# Cross-listing routes
app.include_router(cross_listings.router, prefix="/api/courses", tags=["Cross-Listings"])

# LMI routes
app.include_router(lmi.router, prefix="/api/lmi", tags=["Labor Market Information"])

# BLS routes (U.S. Bureau of Labor Statistics)
app.include_router(bls.router, prefix="/api/bls", tags=["BLS Data"])

# QCEW routes (Quarterly Census of Employment and Wages)
app.include_router(qcew.router, prefix="/api/qcew", tags=["QCEW County Data"])

# Dashboard routes
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint - redirects to API documentation."""
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/health",
    }
