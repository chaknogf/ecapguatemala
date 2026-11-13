from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

_hasher: PasswordHasher | None = None


def _ph() -> PasswordHasher:
    global _hasher
    if _hasher is None:
        from argon2 import Type

        _hasher = PasswordHasher(
            time_cost=3,
            memory_cost=65536,
            parallelism=2,
            hash_len=32,
            type=Type.ID,
        )
    return _hasher


def hash_password(password: str) -> str:
    return _ph().hash(password)


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        return _ph().verify(stored_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(stored_hash: str) -> bool:
    try:
        return _ph().check_needs_rehash(stored_hash)
    except InvalidHashError:
        return True


def generate_opaque_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_opaque_token(token: str) -> str:
    return hmac.new(
        get_settings().jwt_secret.encode(), token.encode(), hashlib.sha256
    ).hexdigest()


def create_access_token(
    subject: str,
    company_id: str | None,
    permissions: tuple[str, ...],
    extra: dict[str, Any] | None = None,
) -> str:
    now = _utcnow_ts()
    payload: dict[str, Any] = {
        "sub": subject,
        "cid": company_id,
        "perms": list(permissions),
        "typ": "access",
        "iat": now,
        "exp": now + int(timedelta(minutes=get_settings().access_token_ttl_minutes).total_seconds()),
        "iss": get_settings().issuer,
        "aud": get_settings().audience,
        "jti": secrets.token_hex(8),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=get_settings().jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        get_settings().jwt_secret,
        algorithms=[get_settings().jwt_algorithm],
        issuer=get_settings().issuer,
        audience=get_settings().audience,
        options={"require": ["sub", "exp", "iat", "typ"]},
    )


def _utcnow_ts() -> int:
    from datetime import UTC, datetime

    return int(datetime.now(UTC).timestamp())


def password_policy_error(password: str) -> str | None:
    min_len = get_settings().password_min_length
    if len(password) < min_len:
        return f"La contraseña debe tener al menos {min_len} caracteres"
    checks = {
        "mayúsculas": any(c.isupper() for c in password),
        "minúsculas": any(c.islower() for c in password),
        "dígitos": any(c.isdigit() for c in password),
    }
    missing = [k for k, ok in checks.items() if not ok]
    if missing:
        return "La contraseña debe contener: " + ", ".join(missing)
    return None
