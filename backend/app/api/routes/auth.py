"""
Authentication API Routes

Provides endpoints for:
- POST /api/auth/login - Verify token and return user profile
- GET /api/auth/me - Get current user's profile
- POST /api/auth/logout - Logout (client-side only, for logging purposes)
"""

from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.firebase import verify_firebase_token
from app.core.deps import get_current_user
from app.models.user import User, UserRole
from app.models.department import Department

router = APIRouter()
security = HTTPBearer(auto_error=False)


# =============================================================================
# Response Schemas
# =============================================================================

class DepartmentInfo(BaseModel):
    """Department information in user profile."""
    id: uuid.UUID
    name: str
    code: str


class UserProfileResponse(BaseModel):
    """User profile response schema."""
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    firebase_uid: str
    department_id: Optional[uuid.UUID] = None
    department: Optional[DepartmentInfo] = None

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    """Login response with user profile."""
    message: str
    user: UserProfileResponse


class LogoutResponse(BaseModel):
    """Logout response."""
    message: str


# =============================================================================
# Helper Functions
# =============================================================================

def get_user_profile(user: User, session: Session) -> UserProfileResponse:
    """
    Build a UserProfileResponse from a User object,
    including department information if available.
    """
    department_info = None

    if user.department_id:
        statement = select(Department).where(Department.id == user.department_id)
        department = session.exec(statement).first()
        if department:
            department_info = DepartmentInfo(
                id=department.id,
                name=department.name,
                code=department.code,
            )

    return UserProfileResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        firebase_uid=user.firebase_uid,
        department_id=user.department_id,
        department=department_info,
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/login", response_model=LoginResponse)
async def login(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    session: Session = Depends(get_session),
):
    """
    Verify Firebase ID token and return user profile.

    This endpoint:
    1. Accepts a Firebase ID token in the Authorization header
    2. Verifies the token with Firebase Admin SDK
    3. Looks up the user in the database by firebase_uid
    4. Returns the user's profile with role and department info

    The frontend should call this after successful Firebase authentication
    to get the user's app-specific profile data.

    **Authorization:** Bearer token (Firebase ID token)

    **Returns:**
    - 200: User profile on successful authentication
    - 401: Invalid or missing token
    - 404: User not found in database (not registered)
    """
    # Check if credentials were provided
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract and verify the token
    token = credentials.credentials
    decoded_token = verify_firebase_token(token)
    firebase_uid = decoded_token.get("uid")

    if not firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Look up user in database
    statement = select(User).where(User.firebase_uid == firebase_uid)
    user = session.exec(statement).first()

    if not user:
        # Auto-provision: Create new user with default FACULTY role
        # Get email from Firebase token
        email = decoded_token.get("email")
        name = decoded_token.get("name") or email.split("@")[0] if email else "New User"

        user = User(
            email=email,
            full_name=name,
            role=UserRole.FACULTY,  # Default role
            firebase_uid=firebase_uid,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        print(f"Auto-provisioned new user: {email} with role FACULTY")

    # Build and return user profile
    profile = get_user_profile(user, session)

    return LoginResponse(
        message="Login successful",
        user=profile,
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get the current authenticated user's profile.

    This endpoint is used by the frontend to:
    - Check if the user is authenticated
    - Get the user's current profile data
    - Determine UI based on user role

    **Authorization:** Bearer token (Firebase ID token)

    **Returns:**
    - 200: User profile
    - 401: Not authenticated
    """
    return get_user_profile(current_user, session)


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    current_user: User = Depends(get_current_user),
):
    """
    Logout endpoint for logging purposes.

    Note: Actual logout happens client-side with Firebase.
    This endpoint is provided for:
    - Logging logout events
    - Server-side session cleanup (if implemented)
    - Future token blacklisting (if needed)

    **Authorization:** Bearer token (Firebase ID token)

    **Returns:**
    - 200: Logout acknowledged
    - 401: Not authenticated
    """
    # Log the logout event (in production, you might log to analytics)
    print(f"User logged out: {current_user.email}")

    return LogoutResponse(
        message="Logout successful",
    )


@router.get("/check")
async def check_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """
    Quick auth check endpoint.

    Returns whether the provided token is valid without looking up
    the user profile. Useful for lightweight auth checks.

    **Authorization:** Optional Bearer token

    **Returns:**
    - authenticated: true/false
    - uid: Firebase UID (if authenticated)
    """
    if credentials is None:
        return {"authenticated": False}

    try:
        decoded_token = verify_firebase_token(credentials.credentials)
        return {
            "authenticated": True,
            "uid": decoded_token.get("uid"),
            "email": decoded_token.get("email"),
        }
    except HTTPException:
        return {"authenticated": False}
