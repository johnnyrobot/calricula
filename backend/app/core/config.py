"""
Application configuration using Pydantic Settings.
Loads environment variables and provides typed configuration.
"""

from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "Calricula API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

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

    # Firebase
    FIREBASE_PROJECT_ID: Optional[str] = None
    FIREBASE_SERVICE_ACCOUNT_PATH: Optional[str] = None

    # Development/Testing
    AUTH_DEV_MODE: bool = False  # Enable dev auth bypass (for automated testing)

    # Demo Mode
    DEMO_MODE: bool = False  # Enable demo mode (public demo with daily resets)

    # Google AI
    GOOGLE_API_KEY: Optional[str] = None
    GEMINI_FILE_SEARCH_STORE_NAME: str = "calricula-knowledge-base"

    # BLS API (U.S. Bureau of Labor Statistics)
    BLS_API_KEY: Optional[str] = None

    class Config:
        env_file = "../.env"  # Look in project root
        extra = "ignore"  # Ignore extra env vars
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
