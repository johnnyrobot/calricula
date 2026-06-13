"""
API Routes Package

Contains all API route modules.
"""

from app.api.routes import auth, courses, departments, approvals, programs, ai, export, reference, compliance, workflow, elumen, documents, notifications, dashboard

__all__ = [
    "auth",
    "courses",
    "departments",
    "approvals",
    "programs",
    "ai",
    "export",
    "reference",
    "compliance",
    "workflow",
    "elumen",
    "documents",
    "notifications",
    "dashboard",
]
