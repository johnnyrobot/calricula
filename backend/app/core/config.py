"""
Application configuration using Pydantic Settings.
Loads environment variables and provides typed configuration.
"""

from functools import lru_cache
from typing import List, Optional
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "Calricula API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # Deployment environment. Anything other than "production" is treated as a
    # non-production (dev/test/staging) environment where dev/demo auth bypass
    # flags are permitted. In production these MUST be off (enforced below).
    ENVIRONMENT: str = "development"

    # Logging
    LOG_LEVEL: str = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL
    LOG_JSON_FORMAT: bool = True  # True for JSON logs, False for human-readable

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5433/calricula"

    # Connection Pool Settings
    DB_POOL_SIZE: int = 5  # Number of connections to keep open
    DB_MAX_OVERFLOW: int = 10  # Max connections beyond pool_size
    DB_POOL_TIMEOUT: int = 30  # Seconds to wait for a connection
    DB_POOL_RECYCLE: int = 1800  # Recycle connections after 30 minutes (for Neon)
    DB_POOL_PRE_PING: bool = True  # Health check connections before use
    DB_USE_NULLPOOL: bool = False  # Use NullPool for serverless (no connection reuse)

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",  # Docker-mapped frontend port
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://frontend:3000",
    ]

    # Trusted hosts (defense-in-depth for the Host header; pairs with the
    # Starlette BadHost fix, CVE-2026-48710). Defaults to "*" to avoid breaking
    # availability; PRODUCTION SHOULD set ALLOWED_HOSTS to the real domains,
    # e.g. ALLOWED_HOSTS='["calricula.com","api.calricula.com"]'.
    ALLOWED_HOSTS: List[str] = ["*"]

    # OIDC (Logto) -- ADR-0001. The only authentication provider; tokens are
    # verified in app/core/oidc.py and consumed by app/core/deps.py.
    OIDC_ISSUER: Optional[str] = None  # https://<logto-endpoint>/oidc
    OIDC_AUDIENCE: Optional[str] = None  # Calricula's own API resource indicator
    OIDC_CLIENT_ID: Optional[str] = None  # Calricula web app id; the ID token's `aud`
    OIDC_JWKS_URL: Optional[str] = None  # defaults to OIDC_ISSUER + "/jwks"
    OIDC_ALGORITHMS: List[str] = ["ES384", "RS256"]

    # One-time adoption of a pre-migration user row (auth_issuer IS NULL) by a
    # Logto subject, on a verified email match, at POST /api/auth/login.
    # Deployers should set this to false once every Firebase-era user has
    # signed in at least once: it narrows sign-in to subject matching alone.
    AUTH_LEGACY_RELINK: bool = True

    # Development/Testing
    AUTH_DEV_MODE: bool = False  # Enable dev auth bypass (for automated testing)

    # Demo Mode
    DEMO_MODE: bool = False  # Enable demo mode (public demo with daily resets)

    # Google AI
    GOOGLE_API_KEY: Optional[str] = None
    GEMINI_FILE_SEARCH_STORE_NAME: str = "calricula-knowledge-base"
    # AI model IDs. Bumped to gemini-3.x in WS-2b: the prior gemini-2.5-flash /
    # gemini-2.5-flash-lite shut down 2026-10-16. (Managed File Search Stores
    # migration is the separate second half of WS-2b.)
    FILE_SEARCH_MODEL: str = "gemini-3.5-flash"        # RAG / file-grounded generation
    GEMINI_MODEL: str = "gemini-3.1-flash-lite"        # curriculum assistant

    # RAG document ingestion
    # Server-side directory that the RAG upload endpoint is allowed to read from.
    # Requests must reference a file inside this directory; paths that resolve
    # outside it are rejected to prevent arbitrary local file disclosure.
    RAG_DOCUMENTS_DIR: str = "reference_documents"

    # BLS API (U.S. Bureau of Labor Statistics)
    BLS_API_KEY: Optional[str] = None

    # ApplicationX embedded staff workspace (companion app broker)
    APPLICATIONX_EMBED_ENABLED: bool = False
    APPLICATIONX_API_ORIGIN: Optional[str] = None       # e.g. https://ax.example.edu (no path)
    APPLICATIONX_ORGANIZATION_REF: Optional[str] = None # ApplicationX organization slug for this deployment
    APPLICATIONX_CAMPUS_REF: Optional[str] = None       # e.g. LAMC
    APPLICATIONX_SERVICE_TOKEN: Optional[str] = None    # optional transport credential; never expands user scope
    APPLICATIONX_TIMEOUT_SECONDS: float = 20.0
    APPLICATIONX_STREAM_MAX_SECONDS: float = 600.0  # upper bound on one SSE proxy connection
    APPLICATIONX_STANDALONE_URL: Optional[str] = None

    @property
    def applicationx_ready(self) -> bool:
        return bool(self.APPLICATIONX_EMBED_ENABLED and self.APPLICATIONX_API_ORIGIN
                    and self.APPLICATIONX_ORGANIZATION_REF and self.APPLICATIONX_CAMPUS_REF)

    model_config = SettingsConfigDict(
        env_file="../.env",  # Look in project root
        extra="ignore",  # Ignore extra env vars
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    @model_validator(mode="after")
    def _enforce_production_safety(self) -> "Settings":
        """Fail closed in production: no auth bypass and no wildcard hosts.

        AUTH_DEV_MODE and DEMO_MODE relax authentication for local development
        and public demos. Shipping either in production is an auth bypass, so we
        refuse to boot if they are enabled while ENVIRONMENT == "production".

        ALLOWED_HOSTS defaults to "*" (wildcard) for dev convenience, but a
        wildcard (or empty) trusted-host list in production leaves the app open
        to Host-header attacks, so we likewise refuse to boot until the operator
        sets the real hostnames.
        """
        if self.ENVIRONMENT.strip().lower() == "production":
            offenders = [
                name
                for name, enabled in (
                    ("AUTH_DEV_MODE", self.AUTH_DEV_MODE),
                    ("DEMO_MODE", self.DEMO_MODE),
                )
                if enabled
            ]
            if offenders:
                raise ValueError(
                    "Refusing to start in production with auth bypass flag(s) "
                    f"enabled: {', '.join(offenders)}. Set them to False (or unset "
                    "them) in the production environment."
                )

            if not self.ALLOWED_HOSTS or "*" in self.ALLOWED_HOSTS:
                raise ValueError(
                    "Refusing to start in production with a wildcard or empty "
                    "ALLOWED_HOSTS (current value: "
                    f"{self.ALLOWED_HOSTS!r}). Set the real trusted hostnames to "
                    "defend against Host-header attacks, e.g. "
                    "ALLOWED_HOSTS='[\"calricula.com\",\"api.calricula.com\"]'."
                )

            missing_oidc = [
                name
                for name, value in (
                    ("OIDC_ISSUER", self.OIDC_ISSUER),
                    ("OIDC_AUDIENCE", self.OIDC_AUDIENCE),
                    ("OIDC_CLIENT_ID", self.OIDC_CLIENT_ID),
                )
                if not value
            ]
            if missing_oidc:
                raise ValueError(
                    "Refusing to start in production without OIDC configured: "
                    f"missing {', '.join(missing_oidc)}. Set these to the Logto "
                    "tenant issuer (OIDC_ISSUER), Calricula's own API resource "
                    "indicator (OIDC_AUDIENCE), and Calricula's web application "
                    "id (OIDC_CLIENT_ID)."
                )

            if self.OIDC_AUDIENCE == self.OIDC_CLIENT_ID:
                raise ValueError(
                    "Refusing to start in production with OIDC_AUDIENCE equal to "
                    "OIDC_CLIENT_ID: the API resource indicator must differ from "
                    "the client id. If they are the same value, an ID token "
                    "(minted for the browser) satisfies the access-token "
                    "audience check and would authorize API calls."
                )

            if self.APPLICATIONX_EMBED_ENABLED:
                parts = urlsplit(self.APPLICATIONX_API_ORIGIN or "")
                if (
                    parts.scheme != "https"
                    or not parts.netloc
                    or parts.username is not None
                    or parts.password is not None
                    or parts.path not in ("", "/")
                    or parts.query
                    or parts.fragment
                ):
                    raise ValueError(
                        "APPLICATIONX_API_ORIGIN must be an https origin without a "
                        "path in production."
                    )
        return self


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
