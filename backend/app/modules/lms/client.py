from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

import httpx

from app.core.config import get_settings
from app.core.errors import BusinessRuleError

MAX_RESPONSE_BYTES = 1_000_000

# Función de Moodle que se usa como sonda de conectividad y para descubrir
# qué capacidades expone realmente el sitio (autoalojado o MoodleCloud).
SITE_INFO_FUNCTION = "core_webservice_get_site_info"

CAPABILITY_FUNCTIONS: dict[str, str] = {
    "users_create": "core_user_create_users",
    "users_update": "core_user_update_users",
    "courses_create": "core_course_create_courses",
    "courses_update": "core_course_update_courses",
    "cohorts": "core_cohort_add_cohort_members",
    "enrol": "enrol_manual_enrol_users",
    "grades_read": "gradereport_user_get_grade_items",
    "grades_write": "core_grades_update_grades",
    "completion": "core_completion_get_course_completion_status",
    "contents": "core_course_get_contents",
}

MOODLE_ERRORS: dict[str, str] = {
    "invalidtoken": "El token no es válido o fue revocado.",
    "accessexception": "El token no tiene permiso para usar los servicios web.",
    "webservicesnotenabled": "Los servicios web están deshabilitados en Moodle.",
    "servicerequireslogin": "El servicio externo exige un usuario autenticado.",
    "invalidlogin": "El usuario del token no puede iniciar sesión en Moodle.",
    "norequiredcapability": "El usuario del token no tiene las capacidades necesarias.",
    "webservicesdisabled": "El sitio tiene los servicios web apagados.",
}


class MoodleConnectionError(BusinessRuleError):
    code = "lms_connection_error"


def _dev_mode() -> bool:
    return get_settings().environment != "production"


def _assert_safe_host(host: str) -> None:
    """Evita SSRF: rechaza destinos internos cuando el CRM corre en producción."""
    allowed = [h.strip().lower() for h in get_settings().lms_allowed_hosts if h.strip()]
    if allowed and host.lower() not in allowed:
        raise MoodleConnectionError(
            "El dominio de Moodle no está en la lista de hosts permitidos."
        )

    try:
        literal = ipaddress.ip_address(host)
        addresses = {literal}
    except ValueError:
        try:
            infos = socket.getaddrinfo(host, None)
        except socket.gaierror:
            raise MoodleConnectionError(
                "No se pudo resolver el dominio de Moodle. Verifique la URL."
            ) from None
        addresses = {ipaddress.ip_address(info[4][0]) for info in infos}

    for ip in addresses:
        if ip.is_link_local or ip.is_multicast or ip.is_unspecified:
            raise MoodleConnectionError("La URL de Moodle apunta a una dirección no permitida.")
        if not _dev_mode() and (ip.is_private or ip.is_loopback or ip.is_reserved):
            raise MoodleConnectionError(
                "La URL de Moodle apunta a una red interna. Use un dominio público."
            )


def normalize_base_url(raw: str, *, verify_host: bool = True) -> str:
    value = (raw or "").strip()
    if not value:
        raise MoodleConnectionError("La URL de Moodle es obligatoria.")

    parsed = urlsplit(value)
    schemes = {"https"} | ({"http"} if _dev_mode() else set())
    if parsed.scheme not in schemes:
        raise MoodleConnectionError("La URL debe comenzar con https://.")
    if parsed.username or parsed.password:
        raise MoodleConnectionError("La URL no debe incluir usuario ni contraseña.")
    if parsed.query or parsed.fragment:
        raise MoodleConnectionError("La URL no debe incluir parámetros ni fragmentos.")
    if not parsed.hostname:
        raise MoodleConnectionError("La URL no tiene un dominio válido.")

    if verify_host:
        _assert_safe_host(parsed.hostname)

    host = parsed.hostname
    if ":" in host:  # IPv6
        host = f"[{host}]"
    netloc = host if parsed.port is None else f"{host}:{parsed.port}"
    path = (parsed.path or "").rstrip("/")
    return f"{parsed.scheme}://{netloc}{path}"


def _friendly_error(data: dict) -> str:
    code = str(data.get("errorcode") or "")
    if code in MOODLE_ERRORS:
        return MOODLE_ERRORS[code]
    message = data.get("message")
    if message:
        return f"Moodle rechazó la petición: {message}"
    return "Moodle rechazó la petición."


def call(base_url: str, token: str, function: str, params: dict | None = None) -> dict:
    settings = get_settings()
    endpoint = f"{base_url}/webservice/rest/server.php"
    payload: dict[str, str] = {
        "wstoken": token,
        "wsfunction": function,
        "moodlewsrestformat": "json",
    }
    if params:
        payload.update(params)

    try:
        with httpx.Client(
            timeout=settings.lms_http_timeout_seconds,
            follow_redirects=False,
        ) as client:
            response = client.post(endpoint, data=payload)
    except httpx.TimeoutException:
        raise MoodleConnectionError(
            "Moodle tardó demasiado en responder. Verifique la URL y su conexión."
        ) from None
    except httpx.HTTPError:
        raise MoodleConnectionError(
            "No se pudo conectar con Moodle. Verifique la URL y que el sitio esté activo."
        ) from None

    if response.status_code >= 400:
        raise MoodleConnectionError(
            f"Moodle respondió HTTP {response.status_code}. Verifique la URL del sitio."
        )
    if len(response.content) > MAX_RESPONSE_BYTES:
        raise MoodleConnectionError("La respuesta de Moodle es demasiado grande.")

    try:
        data = response.json()
    except ValueError:
        raise MoodleConnectionError(
            "Moodle devolvió una respuesta inesperada. "
            "Verifique que la URL apunte a la raíz del sitio."
        ) from None

    if isinstance(data, dict) and data.get("exception"):
        raise MoodleConnectionError(_friendly_error(data))
    if not isinstance(data, dict):
        raise MoodleConnectionError("Moodle devolvió una respuesta inesperada.")
    return data


def fetch_site_info(base_url: str, token: str) -> dict:
    return call(base_url, token, SITE_INFO_FUNCTION)


def detect_capabilities(site_info: dict) -> dict[str, bool]:
    names = {
        str(item.get("name"))
        for item in (site_info.get("functions") or [])
        if isinstance(item, dict) and item.get("name")
    }
    return {key: function in names for key, function in CAPABILITY_FUNCTIONS.items()}


def capability_warnings(capabilities: dict[str, bool]) -> list[str]:
    warnings: list[str] = []
    if not capabilities.get("enrol"):
        warnings.append(
            "Sin matrícula automática: las inscripciones de este Moodle se hacen manualmente."
        )
    if not capabilities.get("grades_read"):
        warnings.append("Este Moodle no expone lectura de calificaciones.")
    if not capabilities.get("completion"):
        warnings.append("Este Moodle no expone el estado de finalización de actividades.")
    if not capabilities.get("users_create"):
        warnings.append("No se podrán crear usuarios desde el CRM; se sincronizarán solo los existentes.")
    return warnings
