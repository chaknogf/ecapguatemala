from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError, NotFoundError
from app.core.types import now_utc
from app.modules.academic.models import ActivityLog
from app.modules.lms import client
from app.modules.lms.crypto import decrypt_token, encrypt_token, token_hint
from app.modules.lms.models import SINGLETON_KEY, LmsConnection
from app.modules.lms.schemas import LmsConnectionOut, LmsSettingsIn, LmsTestIn, LmsTestOut

DEFAULT_INTERVAL = 15


def get_connection(session: Session) -> LmsConnection | None:
    return session.scalar(
        select(LmsConnection).where(LmsConnection.singleton_key == SINGLETON_KEY)
    )


def _get_or_create(session: Session) -> LmsConnection:
    conn = get_connection(session)
    if conn is not None:
        return conn
    conn = LmsConnection(
        singleton_key=SINGLETON_KEY,
        status="unconfigured",
        deployment_type="other",
        strategy="link_only",
        sync_enabled=False,
        sync_interval_minutes=DEFAULT_INTERVAL,
        capabilities={},
    )
    session.add(conn)
    session.flush()
    return conn


def _audit(session: Session, conn: LmsConnection, user_id, action: str, details: dict) -> None:
    session.add(
        ActivityLog(
            user_id=user_id,
            action=action,
            entity_type="lms_connection",
            entity_id=str(conn.id),
            details=json.dumps(details, ensure_ascii=False),
        )
    )


def _active_token(conn: LmsConnection | None) -> str | None:
    if conn is None or not conn.token_encrypted:
        return None
    return decrypt_token(conn.token_encrypted)


def _draft_token(conn: LmsConnection | None) -> str | None:
    if conn is None or not conn.draft:
        return None
    blob = conn.draft.get("token_encrypted")
    return decrypt_token(blob) if blob else None


def _effective(conn: LmsConnection | None) -> dict:
    if conn is None:
        return {}
    source = conn.draft or {
        "deployment_type": conn.deployment_type,
        "base_url": conn.base_url,
        "strategy": conn.strategy,
        "sync_enabled": conn.sync_enabled,
        "sync_interval_minutes": conn.sync_interval_minutes,
        "token_encrypted": conn.token_encrypted,
        "token_hint": conn.token_hint,
    }
    data = dict(source)
    if not data.get("token_encrypted"):
        data["token_encrypted"] = conn.token_encrypted
        data["token_hint"] = conn.token_hint
    return data


def _has_draft(conn: LmsConnection | None) -> bool:
    return bool(conn and conn.draft)


def to_out(conn: LmsConnection | None) -> LmsConnectionOut:
    if conn is None:
        return LmsConnectionOut(
            configured=False,
            status="unconfigured",
            deployment_type="other",
            token_set=False,
            strategy="link_only",
            sync_enabled=False,
            sync_interval_minutes=DEFAULT_INTERVAL,
            capabilities={},
        )

    draft = None
    if conn.draft:
        draft = {
            "deployment_type": conn.draft.get("deployment_type") or conn.deployment_type,
            "base_url": conn.draft.get("base_url") or conn.base_url or "",
            "strategy": conn.draft.get("strategy") or conn.strategy,
            "sync_enabled": bool(conn.draft.get("sync_enabled", conn.sync_enabled)),
            "sync_interval_minutes": int(
                conn.draft.get("sync_interval_minutes", conn.sync_interval_minutes)
            ),
            "token_set": bool(conn.draft.get("token_encrypted") or conn.token_encrypted),
            "token_hint": conn.draft.get("token_hint") or conn.token_hint,
        }

    caps = conn.capabilities or {}
    return LmsConnectionOut(
        configured=bool(conn.base_url and conn.token_encrypted),
        status=conn.status,
        deployment_type=conn.deployment_type,
        base_url=conn.base_url,
        token_set=bool(conn.token_encrypted),
        token_hint=conn.token_hint,
        strategy=conn.strategy,
        sync_enabled=conn.sync_enabled,
        sync_interval_minutes=conn.sync_interval_minutes,
        site_name=conn.site_name,
        moodle_release=conn.moodle_release,
        moodle_version=conn.moodle_version,
        capabilities=caps,
        capability_warnings=client.capability_warnings(caps) if caps else [],
        last_checked_at=conn.last_checked_at,
        last_error=conn.last_error,
        draft=draft,
        updated_at=conn.updated_at,
    )


def get_settings_out(session: Session) -> LmsConnectionOut:
    return to_out(get_connection(session))


def save_settings(session: Session, payload: LmsSettingsIn, user_id) -> LmsConnectionOut:
    conn = _get_or_create(session)
    base_url = client.normalize_base_url(payload.base_url, verify_host=False)

    token_encrypted = None
    hint = None
    if payload.token and payload.token.strip():
        raw = payload.token.strip()
        token_encrypted = encrypt_token(raw)
        hint = token_hint(raw)
    else:
        token_encrypted = (conn.draft or {}).get("token_encrypted") or conn.token_encrypted
        hint = (conn.draft or {}).get("token_hint") or conn.token_hint

    conn.draft = {
        "deployment_type": payload.deployment_type,
        "base_url": base_url,
        "strategy": payload.strategy,
        "sync_enabled": payload.sync_enabled,
        "sync_interval_minutes": payload.sync_interval_minutes,
        "token_encrypted": token_encrypted,
        "token_hint": hint,
    }
    if conn.status == "unconfigured":
        conn.status = "draft"
    conn.updated_by = user_id
    _audit(
        session,
        conn,
        user_id,
        "lms.settings.save",
        {
            "deployment_type": payload.deployment_type,
            "base_url": base_url,
            "strategy": payload.strategy,
            "token_changed": bool(payload.token and payload.token.strip()),
        },
    )
    session.commit()
    session.refresh(conn)
    return to_out(conn)


def _test_config(
    base_url: str,
    token: str,
    *,
    deployment_type: str = "other",
) -> LmsTestOut:
    try:
        site_info = client.fetch_site_info(base_url, token)
    except client.MoodleConnectionError as exc:
        return LmsTestOut(
            ok=False,
            message=exc.message,
            checked_at=now_utc(),
        )

    capabilities = client.detect_capabilities(site_info)
    warnings = client.capability_warnings(capabilities)
    if deployment_type == "moodlecloud":
        warnings.append(
            "MoodleCloud no permite instalar plugins: el acceso se resolverá con enlace o LTI."
        )
    return LmsTestOut(
        ok=True,
        message=f"Conexión correcta con {site_info.get('sitename') or 'Moodle'}.",
        site_name=site_info.get("sitename"),
        username=site_info.get("username"),
        release=site_info.get("release"),
        version=str(site_info.get("version")) if site_info.get("version") else None,
        capabilities=capabilities,
        warnings=warnings,
        checked_at=now_utc(),
    )


def test_connection(session: Session, payload: LmsTestIn) -> LmsTestOut:
    conn = get_connection(session)
    config = _effective(conn)

    base_url_raw = (payload.base_url or config.get("base_url") or "").strip()
    if not base_url_raw:
        raise BusinessRuleError("Primero ingrese la URL de Moodle.")
    try:
        base_url = client.normalize_base_url(base_url_raw)
    except client.MoodleConnectionError as exc:
        return LmsTestOut(ok=False, message=exc.message, checked_at=now_utc())

    token = (payload.token or "").strip() or _draft_token(conn) or _active_token(conn)
    if not token:
        raise BusinessRuleError("Ingrese el token del servicio externo de Moodle.")

    result = _test_config(
        base_url,
        token,
        deployment_type=str(config.get("deployment_type") or "other"),
    )

    # Si se está probando la configuración activa (sin borrador), refrescamos su estado.
    if conn is not None and not _has_draft(conn):
        conn.last_checked_at = result.checked_at
        if result.ok:
            conn.status = "connected"
            conn.last_error = None
            conn.site_name = result.site_name
            conn.moodle_release = result.release
            conn.moodle_version = result.version
            conn.capabilities = result.capabilities
        else:
            conn.status = "error"
            conn.last_error = result.message
        session.commit()

    return result


def activate(session: Session, user_id) -> tuple[bool, str, LmsConnectionOut]:
    conn = get_connection(session)
    if conn is None or not (conn.draft or conn.base_url):
        raise NotFoundError("No hay una configuración de Moodle para activar.")

    config = _effective(conn)
    base_url = config.get("base_url")
    token = _draft_token(conn) or _active_token(conn)
    if not base_url:
        raise BusinessRuleError("Primero ingrese la URL de Moodle.")
    if not token:
        raise BusinessRuleError("Ingrese el token del servicio externo de Moodle.")

    try:
        base_url = client.normalize_base_url(str(base_url))
    except client.MoodleConnectionError as exc:
        conn.last_error = exc.message
        if not (conn.base_url and conn.token_encrypted):
            conn.status = "draft"
        session.commit()
        return False, exc.message, to_out(conn)

    result = _test_config(
        base_url,
        token,
        deployment_type=str(config.get("deployment_type") or "other"),
    )
    conn.last_checked_at = result.checked_at

    if not result.ok:
        conn.last_error = result.message
        if not (conn.base_url and conn.token_encrypted):
            conn.status = "draft"
        session.commit()
        return False, result.message, to_out(conn)

    token_encrypted = config.get("token_encrypted") or conn.token_encrypted
    conn.deployment_type = str(config.get("deployment_type") or conn.deployment_type)
    conn.base_url = base_url
    conn.token_encrypted = token_encrypted
    conn.token_hint = config.get("token_hint") or conn.token_hint
    conn.strategy = str(config.get("strategy") or conn.strategy)
    conn.sync_enabled = bool(config.get("sync_enabled", conn.sync_enabled))
    conn.sync_interval_minutes = int(
        config.get("sync_interval_minutes", conn.sync_interval_minutes)
    )
    conn.status = "connected"
    conn.site_name = result.site_name
    conn.moodle_release = result.release
    conn.moodle_version = result.version
    conn.capabilities = result.capabilities
    conn.last_error = None
    conn.draft = None
    conn.updated_by = user_id
    _audit(
        session,
        conn,
        user_id,
        "lms.activate",
        {
            "deployment_type": conn.deployment_type,
            "base_url": conn.base_url,
            "strategy": conn.strategy,
            "site_name": conn.site_name,
            "release": conn.moodle_release,
        },
    )
    session.commit()
    session.refresh(conn)
    return True, result.message, to_out(conn)


def disconnect(session: Session, user_id) -> LmsConnectionOut:
    conn = get_connection(session)
    if conn is None:
        raise NotFoundError("No hay una configuración de Moodle.")
    conn.status = "unconfigured"
    conn.token_encrypted = None
    conn.token_hint = None
    conn.draft = None
    conn.site_name = None
    conn.moodle_release = None
    conn.moodle_version = None
    conn.capabilities = {}
    conn.last_error = None
    conn.last_checked_at = None
    conn.sync_enabled = False
    conn.updated_by = user_id
    _audit(session, conn, user_id, "lms.disconnect", {"base_url": conn.base_url})
    session.commit()
    session.refresh(conn)
    return to_out(conn)
