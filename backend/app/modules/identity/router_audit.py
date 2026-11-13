from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


@router.get("")
def list_audit():
    return []
