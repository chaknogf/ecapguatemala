from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError


class DomainError(Exception):
    code = "domain_error"
    http_status = status.HTTP_400_BAD_REQUEST

    def __init__(self, message: str, details: Any | None = None) -> None:
        self.message = message
        self.details = details
        super().__init__(message)


class NotFoundError(DomainError):
    code = "not_found"
    http_status = status.HTTP_404_NOT_FOUND


class ConflictError(DomainError):
    code = "conflict"
    http_status = status.HTTP_409_CONFLICT


class BusinessRuleError(DomainError):
    code = "business_rule"
    http_status = status.HTTP_422_UNPROCESSABLE_ENTITY


class PermissionDeniedError(DomainError):
    code = "permission_denied"
    http_status = status.HTTP_403_FORBIDDEN


class InsufficientStockError(BusinessRuleError):
    code = "insufficient_stock"
    http_status = status.HTTP_409_CONFLICT


class ExpiredLotError(BusinessRuleError):
    code = "expired_lot"


class AuthenticationError(Exception):
    code = "authentication_failed"
    http_status = status.HTTP_401_UNAUTHORIZED

    def __init__(self, message: str = "Credenciales inválidas") -> None:
        self.message = message
        super().__init__(message)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content={"error": exc.code, "message": exc.message, "details": exc.details},
        )

    @app.exception_handler(AuthenticationError)
    async def _auth_error(_: Request, exc: AuthenticationError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content={"error": exc.code, "message": exc.message},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": "validation_error",
                "message": "Datos de entrada inválidos",
                "details": jsonable_encoder(exc.errors()),
            },
        )

    @app.exception_handler(IntegrityError)
    async def _integrity_error(_: Request, exc: IntegrityError) -> JSONResponse:
        orig = getattr(exc, "orig", None)
        constraint = getattr(orig, "sqlstate", None)
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "error": "integrity_conflict",
                "message": "La operación viola una restricción de integridad de datos",
                "details": str(orig).split("\n")[0] if orig and settings_debug() else None,
            },
        )


def settings_debug() -> bool:
    try:
        from app.core.config import get_settings

        return get_settings().debug
    except Exception:
        return False
