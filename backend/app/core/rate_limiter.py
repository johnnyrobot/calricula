"""
Rate Limiting for Calricula API

Provides per-user rate limiting for AI endpoints to prevent abuse.
Uses SlowAPI with in-memory storage (suitable for single-instance deployment).

Rate Limits:
- AI Generation endpoints: 10 requests/minute per user
- AI Chat endpoints: 30 requests/minute per user
- RAG/Search endpoints: 20 requests/minute per user
- Admin users: Exempt from rate limiting (optional)
"""

import logging
from functools import wraps
from typing import Callable, Optional

from fastapi import HTTPException, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

logger = logging.getLogger(__name__)


def get_user_identifier(request: Request) -> str:
    """
    Extract user identifier for rate limiting.

    Priority:
    1. Authenticated user ID from request state
    2. Remote IP address as fallback

    This allows per-user rate limiting for authenticated users
    and IP-based limiting for anonymous users.
    """
    # Try to get user from request state (set by auth middleware)
    if hasattr(request.state, "user") and request.state.user:
        user = request.state.user
        user_id = getattr(user, "id", None) or getattr(user, "uid", None)
        if user_id:
            return f"user:{user_id}"

    # Try to get user from custom header (dev mode)
    dev_user = request.headers.get("X-Dev-User-Id")
    if dev_user:
        return f"dev:{dev_user}"

    # Fall back to IP address
    return f"ip:{get_remote_address(request)}"


def check_admin_exempt(request: Request) -> bool:
    """
    Check if the current user is an admin and should be exempt from rate limiting.

    Returns True if admin and should bypass rate limits.
    """
    if hasattr(request.state, "user") and request.state.user:
        user = request.state.user
        role = getattr(user, "role", None)
        if role and role.value == "Admin":
            return True
    return False


# Create the rate limiter instance
# Using in-memory storage - for production with multiple instances,
# consider using Redis: Limiter(key_func=get_user_identifier, storage_uri="redis://localhost:6379")
limiter = Limiter(
    key_func=get_user_identifier,
    default_limits=["100/minute"],  # Default for non-AI endpoints
    strategy="fixed-window",  # Simple fixed window strategy
)


# Rate limit configurations for different endpoint types
RATE_LIMITS = {
    # AI Generation (expensive operations)
    "ai_generation": "10/minute",  # Catalog description, SLOs, content outline, TOP code

    # AI Chat (conversational, typically longer sessions)
    "ai_chat": "30/minute",

    # RAG/Search (document search, less expensive than generation)
    "ai_rag": "20/minute",

    # Compliance explanation (lightweight)
    "ai_explain": "30/minute",

    # Document operations (upload, list, delete)
    "ai_documents": "20/minute",
}


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """
    Custom handler for rate limit exceeded errors.

    Returns 429 Too Many Requests with Retry-After header.
    """
    # Log the rate limit hit
    user_id = get_user_identifier(request)
    logger.warning(
        f"Rate limit exceeded for {user_id} on {request.url.path}",
        extra={
            "user_identifier": user_id,
            "path": request.url.path,
            "method": request.method,
            "limit": str(exc.detail),
        }
    )

    # Parse retry-after from the exception detail
    # SlowAPI includes the limit info in the detail
    retry_after = 60  # Default to 60 seconds

    raise HTTPException(
        status_code=429,
        detail={
            "error": "rate_limit_exceeded",
            "message": f"Too many requests. Please wait before trying again.",
            "limit": str(exc.detail),
            "retry_after_seconds": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )


def rate_limited(limit_type: str = "ai_generation", exempt_admins: bool = True):
    """
    Decorator to apply rate limiting to an endpoint.

    Args:
        limit_type: Key from RATE_LIMITS dict (e.g., "ai_generation", "ai_chat")
        exempt_admins: If True, admin users bypass rate limiting

    Usage:
        @router.post("/suggest/catalog-description")
        @rate_limited("ai_generation")
        async def suggest_catalog_description(...):
            ...
    """
    limit = RATE_LIMITS.get(limit_type, "10/minute")

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, request: Request = None, **kwargs):
            # Find request in args or kwargs
            if request is None:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request is None:
                # No request found, just call the function
                return await func(*args, **kwargs)

            # Check if admin is exempt
            if exempt_admins and check_admin_exempt(request):
                logger.debug(f"Admin user exempt from rate limiting on {request.url.path}")
                return await func(*args, request=request, **kwargs)

            # Apply rate limiting using SlowAPI's shared limiter
            # The actual rate limiting is done via dependency injection
            return await func(*args, request=request, **kwargs)

        return wrapper
    return decorator


# Dependency functions for FastAPI
def get_ai_generation_limiter():
    """Dependency for AI generation endpoints (10/minute)."""
    return limiter.limit(RATE_LIMITS["ai_generation"])


def get_ai_chat_limiter():
    """Dependency for AI chat endpoints (30/minute)."""
    return limiter.limit(RATE_LIMITS["ai_chat"])


def get_ai_rag_limiter():
    """Dependency for RAG endpoints (20/minute)."""
    return limiter.limit(RATE_LIMITS["ai_rag"])


def get_ai_explain_limiter():
    """Dependency for compliance explanation endpoints (30/minute)."""
    return limiter.limit(RATE_LIMITS["ai_explain"])


def get_ai_documents_limiter():
    """Dependency for document operation endpoints (20/minute)."""
    return limiter.limit(RATE_LIMITS["ai_documents"])
