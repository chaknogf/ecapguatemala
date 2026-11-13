from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.modules.academic.router import router as academic_router
from app.modules.cms.router import router as cms_router
from app.modules.identity.router_audit import router as audit_router
from app.modules.identity.router_auth import router as auth_router
from app.modules.identity.router_users import router as users_router

def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=f"{settings.app_name} API",
        version="0.1.0",
        docs_url="/api/v1/docs" if settings.environment != "production" else None,
        redoc_url=None,
        openapi_url="/api/v1/openapi.json" if settings.environment != "production" else None,
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "X-Idempotency-Key"],
        )

    install_error_handlers(app)

    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(audit_router)
    app.include_router(academic_router)
    app.include_router(cms_router)

    @app.get("/api/v1/health")
    def health() -> dict:
        from app.core.db import engine
        from sqlalchemy import text

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True, "service": "ecap-api", "version": app.version}

    return app


app = create_app()
