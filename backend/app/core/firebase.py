"""
Firebase Admin SDK Configuration

Provides Firebase authentication token verification for the API.
"""

import os
from typing import Optional

import firebase_admin
from firebase_admin import auth, credentials
from fastapi import HTTPException, status

from app.core.config import settings


# Initialize Firebase Admin SDK
_firebase_app: Optional[firebase_admin.App] = None


def initialize_firebase() -> Optional[firebase_admin.App]:
    """
    Initialize Firebase Admin SDK with service account credentials.

    Returns None if credentials are not configured (for development without Firebase).
    """
    global _firebase_app

    if _firebase_app is not None:
        return _firebase_app

    # Check if Firebase is configured
    if not settings.FIREBASE_SERVICE_ACCOUNT_PATH:
        print("Warning: Firebase not configured. Authentication will be disabled.")
        return None

    # Check if service account file exists and is a file (not a directory)
    if not os.path.isfile(settings.FIREBASE_SERVICE_ACCOUNT_PATH):
        print(f"Warning: Firebase service account file not found at {settings.FIREBASE_SERVICE_ACCOUNT_PATH}")
        return None

    try:
        cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_PATH)
        _firebase_app = firebase_admin.initialize_app(cred)
        print("Firebase Admin SDK initialized successfully")
        return _firebase_app
    except Exception as e:
        print(f"Error initializing Firebase: {e}")
        return None


def verify_firebase_token(id_token: str) -> dict:
    """
    Verify a Firebase ID token and return the decoded claims.

    Args:
        id_token: The Firebase ID token from the client

    Returns:
        The decoded token claims (uid, email, etc.)

    Raises:
        HTTPException: If token is invalid or expired
    """
    # Map dev mode tokens to test user firebase_uids from seed data
    dev_user_map = {
        "dev-demo-001": {"uid": "test_demo_001", "email": "demo@calricula.com"},
        "dev-faculty-001": {"uid": "test_faculty_001", "email": "faculty@calricula.com"},
        "dev-faculty-002": {"uid": "test_faculty_002", "email": "faculty2@calricula.com"},
        "dev-faculty-003": {"uid": "test_faculty_003", "email": "faculty3@calricula.com"},
        "dev-chair-001": {"uid": "test_chair_001", "email": "chair@calricula.com"},
        "dev-articulation-001": {"uid": "test_articulation_001", "email": "articulation@calricula.com"},
        "dev-admin-001": {"uid": "test_admin_001", "email": "admin@calricula.com"},
    }

    # Check for demo mode - allows any Firebase token for demo users
    # Demo mode is a simplified auth mode for public demonstrations
    if settings.DEMO_MODE:
        # In demo mode, we accept Firebase tokens and only check if the email contains "demo"
        try:
            if _firebase_app is None:
                initialize_firebase()

            if _firebase_app is not None:
                decoded_token = auth.verify_id_token(id_token)
                email = decoded_token.get("email", "").lower()

                # Only allow users with "demo" in their email for demo mode
                if "demo" in email:
                    print(f"[DEMO MODE] Access granted to demo user: {email}")
                    return decoded_token
                else:
                    print(f"[DEMO MODE] Access denied for non-demo user: {email}")
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Demo mode only allows access to users with 'demo' in their email address",
                    )
        except Exception as e:
            print(f"[DEMO MODE] Auth error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Demo mode authentication failed",
            )

    # Check for dev mode tokens FIRST (before Firebase verification)
    # This allows dev bypass even when Firebase is configured
    if settings.AUTH_DEV_MODE and id_token in dev_user_map:
        user_data = dev_user_map[id_token]
        return {
            "uid": user_data["uid"],
            "email": user_data["email"],
            "email_verified": True,
        }

    # Initialize Firebase if not already done
    if _firebase_app is None:
        initialize_firebase()

    # If Firebase is not configured, return a mock user for development
    # Support dev-* tokens from frontend AuthContext
    if _firebase_app is None:
        # Check if token is a dev user ID
        if id_token in dev_user_map:
            user_data = dev_user_map[id_token]
            return {
                "uid": user_data["uid"],
                "email": user_data["email"],
                "email_verified": True,
            }
        # Default fallback for any dev token
        return {
            "uid": "test_faculty_001",
            "email": "faculty@calricula.com",
            "name": "Development User",
            "email_verified": True,
        }

    try:
        # Verify the token
        print(f"[AUTH] Verifying token (first 20 chars): {id_token[:20]}...")
        decoded_token = auth.verify_id_token(id_token)
        print(f"[AUTH] Token verified successfully for uid: {decoded_token.get('uid')}, email: {decoded_token.get('email')}")
        return decoded_token
    except auth.InvalidIdTokenError as e:
        print(f"[AUTH] Invalid token error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except auth.ExpiredIdTokenError as e:
        print(f"[AUTH] Expired token error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except auth.RevokedIdTokenError as e:
        print(f"[AUTH] Revoked token error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        print(f"[AUTH] Unexpected auth error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication error: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_user_by_email(email: str) -> Optional[auth.UserRecord]:
    """
    Get a Firebase user by email address.

    Args:
        email: The user's email address

    Returns:
        The UserRecord if found, None otherwise
    """
    if _firebase_app is None:
        initialize_firebase()

    if _firebase_app is None:
        return None

    try:
        return auth.get_user_by_email(email)
    except auth.UserNotFoundError:
        return None
    except Exception:
        return None


def create_firebase_user(email: str, password: str, display_name: str = None) -> Optional[auth.UserRecord]:
    """
    Create a new Firebase user.

    Args:
        email: The user's email address
        password: The user's password
        display_name: Optional display name

    Returns:
        The created UserRecord, or None if creation fails
    """
    if _firebase_app is None:
        initialize_firebase()

    if _firebase_app is None:
        return None

    try:
        user = auth.create_user(
            email=email,
            password=password,
            display_name=display_name,
            email_verified=False,
        )
        return user
    except Exception as e:
        print(f"Error creating Firebase user: {e}")
        return None
