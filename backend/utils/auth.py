"""
Supabase authentication and client utilities for the FastAPI backend.

Provides:
  - A singleton Supabase client (server-side, service_role key).
  - A FastAPI dependency `get_current_user` that validates the JWT sent by the
    frontend and returns the authenticated user_id (the `sub` claim), or None
    when no token is present (WhatsApp webhook, anonymous sessions).

The dependency explicitly sets ``auto_error=False`` on the HTTPBearer scheme so
that the WhatsApp webhook — which is unauthenticated by design — is not blocked.
Every route that injects this dependency MUST handle None gracefully.
"""

import os
from typing import Optional

import jwt
from fastapi import Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

from utils.logger import logger

# ---------------------------------------------------------------------------
# Supabase client (server-side — service_role key, not the anon key)
# ---------------------------------------------------------------------------
_supabase_url = os.getenv("SUPABASE_URL", "")
_supabase_key = os.getenv("SUPABASE_KEY", "")

if not _supabase_url or not _supabase_key:
    logger.warning(
        "SUPABASE_URL and/or SUPABASE_KEY are not set. "
        "Supabase client will be unavailable — medical history persistence is disabled."
    )
    _supabase: Optional[Client] = None
else:
    _supabase = create_client(_supabase_url, _supabase_key)


def get_supabase() -> Optional[Client]:
    """Return the server-side Supabase client, or None if not configured."""
    return _supabase


# ---------------------------------------------------------------------------
# JWT validation dependency
# ---------------------------------------------------------------------------

# The Supabase JWT secret is the symmetric key used for HS256 token signing.
# It is available in the Supabase dashboard under Project Settings > API.
_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

# auto_error=False is THE critical setting. Without it, FastAPI returns 403 on
# every request that lacks an Authorization header — including the WhatsApp
# webhook, which is unauthenticated by design. With auto_error=False the scheme
# returns None instead of raising, and this dependency returns None, which the
# route handler can check.
_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    token: HTTPAuthorizationCredentials = Security(_bearer_scheme),
) -> Optional[str]:
    """
    FastAPI dependency: extract the authenticated user_id from the JWT.

    Returns:
        The Supabase user_id (UUID string) if a valid token is present,
        or None if no token was provided (WhatsApp, anonymous session).

    Does NOT raise HTTPException for missing or invalid tokens — the caller
    decides whether authentication is required for that particular route.
    A route that MUST have a user checks `if user_id is None` and returns
    an appropriate response.
    """
    if token is None:
        return None

    if not _JWT_SECRET:
        logger.error("SUPABASE_JWT_SECRET is not set — cannot validate tokens.")
        return None

    try:
        payload = jwt.decode(
            token.credentials,
            _JWT_SECRET,
            algorithms=["HS256", "RS256"],
            options={"verify_exp": True},
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            logger.warning("JWT is valid but contains no 'sub' claim.")
            return None
        return user_id
    except jwt.ExpiredSignatureError:
        logger.warning("JWT token has expired.")
        return None
    except jwt.InvalidTokenError as exc:
        logger.warning("Invalid JWT token: %s", exc)
        return None