from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings
from app.core.errors import BusinessRuleError


def _fernet() -> Fernet:
    settings = get_settings()
    material = settings.lms_secret_key or settings.jwt_secret
    digest = hashlib.sha256(f"ecap-lms:{material}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.strip().encode()).decode()


def decrypt_token(blob: str) -> str:
    try:
        return _fernet().decrypt(blob.encode()).decode()
    except InvalidToken:
        raise BusinessRuleError(
            "No se pudo descifrar el token guardado. Vuelva a ingresarlo."
        ) from None


def token_hint(token: str) -> str:
    clean = token.strip()
    return f"…{clean[-4:]}" if len(clean) >= 4 else "…"
