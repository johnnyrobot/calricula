"""
Database connection and session management using SQLModel.

Configures connection pooling optimized for:
- Local Docker PostgreSQL (default settings)
- Neon serverless PostgreSQL (with connection recycling)
- High-concurrency production workloads
"""

from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy.pool import QueuePool, NullPool
from sqlalchemy import event, text
from typing import Generator
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def create_db_engine():
    """
    Create database engine with configurable connection pooling.

    Supports two modes:
    1. QueuePool (default): Maintains a pool of connections for reuse
       - Good for local development and persistent server deployments
       - Settings: pool_size, max_overflow, pool_timeout, pool_recycle

    2. NullPool: No connection pooling, new connection per request
       - Good for serverless/edge deployments
       - Set DB_USE_NULLPOOL=true to enable
    """

    # Common engine arguments
    engine_args = {
        "echo": settings.DEBUG,
    }

    if settings.DB_USE_NULLPOOL:
        # NullPool mode for serverless environments
        # Each request gets a fresh connection, no pooling
        logger.info("Database: Using NullPool (no connection pooling)")
        engine_args["poolclass"] = NullPool
    else:
        # QueuePool mode for persistent server deployments
        logger.info(
            f"Database: Using QueuePool (size={settings.DB_POOL_SIZE}, "
            f"max_overflow={settings.DB_MAX_OVERFLOW}, "
            f"recycle={settings.DB_POOL_RECYCLE}s)"
        )
        engine_args.update({
            "poolclass": QueuePool,
            "pool_size": settings.DB_POOL_SIZE,
            "max_overflow": settings.DB_MAX_OVERFLOW,
            "pool_timeout": settings.DB_POOL_TIMEOUT,
            "pool_recycle": settings.DB_POOL_RECYCLE,
            "pool_pre_ping": settings.DB_POOL_PRE_PING,
        })

    engine = create_engine(settings.DATABASE_URL, **engine_args)

    # Add connection event listeners for debugging/monitoring
    if settings.DEBUG:
        @event.listens_for(engine, "connect")
        def on_connect(dbapi_conn, connection_record):
            logger.debug(f"Database: New connection established")

        @event.listens_for(engine, "checkout")
        def on_checkout(dbapi_conn, connection_record, connection_proxy):
            logger.debug(f"Database: Connection checked out from pool")

        @event.listens_for(engine, "checkin")
        def on_checkin(dbapi_conn, connection_record):
            logger.debug(f"Database: Connection returned to pool")

    return engine


# Create the engine instance
engine = create_db_engine()


def create_db_and_tables():
    """Create all database tables from SQLModel metadata."""
    SQLModel.metadata.create_all(engine)


def update_schema_for_lmi():
    """
    Manually add lmi_data column if it doesn't exist.
    This is a temporary migration helper.
    """
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE courses ADD COLUMN IF NOT EXISTS lmi_data JSONB DEFAULT '{}'"))
            conn.execute(text("ALTER TABLE programs ADD COLUMN IF NOT EXISTS lmi_data JSONB DEFAULT '{}'"))
            conn.commit()
            logger.info("Database: Schema updated with lmi_data columns.")
        except Exception as e:
            logger.error(f"Database: Schema update failed: {e}")


def get_session() -> Generator[Session, None, None]:
    """
    Get a database session for dependency injection.

    Usage in FastAPI endpoints:
        @app.get("/items")
        def read_items(session: Session = Depends(get_session)):
            return session.exec(select(Item)).all()
    """
    with Session(engine) as session:
        yield session


def get_pool_status() -> dict:
    """
    Get current connection pool status for monitoring.

    Returns dict with:
    - pool_size: Configured pool size
    - checked_out: Currently active connections
    - overflow: Connections beyond pool_size
    - checkedin: Available connections in pool
    """
    pool = engine.pool

    if settings.DB_USE_NULLPOOL:
        return {
            "pool_type": "NullPool",
            "message": "No connection pooling - each request uses fresh connection"
        }

    return {
        "pool_type": "QueuePool",
        "pool_size": pool.size(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "checkedin": pool.checkedin(),
        "invalidated": pool.invalidatedcount if hasattr(pool, 'invalidatedcount') else 0,
    }
