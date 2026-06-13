"""
Common Pydantic schemas used across the API.

Contains shared response types, error schemas, and pagination models.
"""

from typing import Any, Dict, Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar('T')


# =============================================================================
# Pagination
# =============================================================================

class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper."""
    items: List[T]
    total: int = Field(description="Total number of items")
    page: int = Field(ge=1, description="Current page number")
    limit: int = Field(ge=1, description="Items per page")
    pages: int = Field(ge=0, description="Total number of pages")


# =============================================================================
# Error Responses
# =============================================================================

class ErrorDetail(BaseModel):
    """Details about a single error."""
    loc: List[str] = Field(description="Error location (field path)")
    msg: str = Field(description="Error message")
    type: str = Field(description="Error type code")


class ValidationErrorResponse(BaseModel):
    """Standard 422 validation error response format."""
    detail: List[ErrorDetail] = Field(description="List of validation errors")

    class Config:
        json_schema_extra = {
            "example": {
                "detail": [
                    {
                        "loc": ["body", "title"],
                        "msg": "field required",
                        "type": "value_error.missing"
                    }
                ]
            }
        }


class HTTPErrorResponse(BaseModel):
    """Standard HTTP error response format."""
    detail: str = Field(description="Error message")

    class Config:
        json_schema_extra = {
            "example": {
                "detail": "Resource not found"
            }
        }


# =============================================================================
# Success Responses
# =============================================================================

class MessageResponse(BaseModel):
    """Simple message response."""
    message: str = Field(description="Status message")

    class Config:
        json_schema_extra = {
            "example": {
                "message": "Operation completed successfully"
            }
        }


class DeleteResponse(BaseModel):
    """Response for delete operations."""
    success: bool = Field(description="Whether deletion was successful")
    message: str = Field(description="Status message")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "message": "Resource deleted successfully"
            }
        }


# =============================================================================
# Health Check
# =============================================================================

class HealthCheckResponse(BaseModel):
    """Health check response."""
    status: str = Field(description="Service status")
    version: str = Field(description="API version")
    database: Optional[str] = Field(None, description="Database connection status")

    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "version": "1.0.0",
                "database": "connected"
            }
        }
