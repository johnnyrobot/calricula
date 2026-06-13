"""
Structured logging configuration for the Calricula API.

Provides:
- JSON-formatted logs for production
- Human-readable logs for development
- Request ID tracking for distributed tracing
- Request/response timing
- Error logging with stack traces
"""

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar
from datetime import datetime
from typing import Any, Dict, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Context variable for request ID - allows access across async tasks
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


def get_request_id() -> Optional[str]:
    """Get the current request ID from context."""
    return request_id_var.get()


class JSONFormatter(logging.Formatter):
    """
    Custom JSON formatter for structured logging.
    Outputs logs as JSON objects for easy parsing by log aggregators.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add request ID if available
        request_id = get_request_id()
        if request_id:
            log_data["request_id"] = request_id

        # Add location info
        if record.pathname:
            log_data["location"] = {
                "file": record.pathname,
                "line": record.lineno,
                "function": record.funcName,
            }

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": self.formatException(record.exc_info),
            }

        # Add any extra fields passed to the log call
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)

        return json.dumps(log_data, default=str)


class DevelopmentFormatter(logging.Formatter):
    """
    Human-readable formatter for development.
    Includes colors and structured output for easier debugging.
    """

    COLORS = {
        "DEBUG": "\033[36m",  # Cyan
        "INFO": "\033[32m",  # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",  # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        request_id = get_request_id()
        rid_str = f"[{request_id[:8]}] " if request_id else ""

        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        message = f"{color}{timestamp} {record.levelname:8}{self.RESET} {rid_str}{record.getMessage()}"

        if record.exc_info:
            message += f"\n{self.formatException(record.exc_info)}"

        return message


class StructuredLogger(logging.Logger):
    """
    Extended logger that supports structured extra fields.
    """

    def _log_with_extra(
        self,
        level: int,
        msg: str,
        args: tuple,
        exc_info: Any = None,
        extra: Optional[Dict] = None,
        **kwargs,
    ) -> None:
        """Log with extra structured fields."""
        if extra is None:
            extra = {}

        # Store extra fields for the formatter
        extra["extra_fields"] = kwargs

        super()._log(level, msg, args, exc_info=exc_info, extra=extra)

    def info_with_fields(self, msg: str, **kwargs) -> None:
        """Log info with extra fields."""
        self._log_with_extra(logging.INFO, msg, (), **kwargs)

    def error_with_fields(self, msg: str, exc_info: bool = False, **kwargs) -> None:
        """Log error with extra fields."""
        self._log_with_extra(logging.ERROR, msg, (), exc_info=exc_info, **kwargs)

    def warning_with_fields(self, msg: str, **kwargs) -> None:
        """Log warning with extra fields."""
        self._log_with_extra(logging.WARNING, msg, (), **kwargs)


def configure_logging(
    log_level: str = "INFO",
    json_format: bool = True,
    service_name: str = "calricula-api",
) -> logging.Logger:
    """
    Configure application logging.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_format: If True, output JSON logs. If False, use human-readable format.
        service_name: Name of the service for log identification

    Returns:
        Configured logger instance
    """
    # Set the custom logger class
    logging.setLoggerClass(StructuredLogger)

    # Get or create the main logger
    logger = logging.getLogger(service_name)
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Remove existing handlers
    logger.handlers.clear()

    # Create handler for stdout (Docker-friendly)
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Set formatter based on environment
    if json_format:
        formatter = JSONFormatter()
    else:
        formatter = DevelopmentFormatter()

    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # Prevent propagation to root logger
    logger.propagate = False

    return logger


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for logging HTTP requests and responses.

    Features:
    - Assigns unique request ID to each request
    - Logs request method, path, and timing
    - Logs response status code and duration
    - Captures errors with stack traces
    """

    def __init__(self, app, logger: logging.Logger, exclude_paths: Optional[list] = None):
        super().__init__(app)
        self.logger = logger
        self.exclude_paths = exclude_paths or ["/health", "/health/db", "/health/pool", "/docs", "/redoc", "/openapi.json"]

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip logging for excluded paths
        if request.url.path in self.exclude_paths:
            return await call_next(request)

        # Generate and set request ID
        request_id = str(uuid.uuid4())
        request_id_var.set(request_id)

        # Record start time
        start_time = time.perf_counter()

        # Get client IP
        client_ip = request.client.host if request.client else "unknown"

        # Log request
        self.logger.info(
            f"Request started: {request.method} {request.url.path}",
        )

        # Process request
        try:
            response = await call_next(request)

            # Calculate duration
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Log response
            log_data = {
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 2),
                "client_ip": client_ip,
                "request_id": request_id,
            }

            # Add query params if present
            if request.query_params:
                log_data["query_params"] = dict(request.query_params)

            # Log at appropriate level based on status code
            if response.status_code >= 500:
                self.logger.error(
                    f"Request completed: {request.method} {request.url.path} - {response.status_code} ({duration_ms:.2f}ms)"
                )
            elif response.status_code >= 400:
                self.logger.warning(
                    f"Request completed: {request.method} {request.url.path} - {response.status_code} ({duration_ms:.2f}ms)"
                )
            else:
                self.logger.info(
                    f"Request completed: {request.method} {request.url.path} - {response.status_code} ({duration_ms:.2f}ms)"
                )

            # Add request ID to response headers for tracing
            response.headers["X-Request-ID"] = request_id

            return response

        except Exception as e:
            # Calculate duration even on error
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Log error with stack trace
            self.logger.error(
                f"Request failed: {request.method} {request.url.path} - {type(e).__name__}: {str(e)} ({duration_ms:.2f}ms)",
                exc_info=True,
            )

            # Re-raise to let FastAPI handle the error response
            raise

        finally:
            # Clean up context
            request_id_var.set(None)


def get_logger(name: str = "calricula-api") -> logging.Logger:
    """
    Get a logger instance by name.

    Args:
        name: Logger name (usually module name)

    Returns:
        Logger instance
    """
    return logging.getLogger(name)
