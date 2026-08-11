from __future__ import annotations

import os
from urllib.parse import urlsplit

DEFAULT_ALLOWED_ORIGINS = (
    "http://127.0.0.1:3000",
    "http://localhost:3000",
)


def _validate_origin(origin: str) -> str:
    parsed = urlsplit(origin)
    try:
        port = parsed.port
    except ValueError as error:
        raise ValueError(f"ALLOWED_ORIGINS contains an invalid port: {origin}") from error

    if (
        origin == "*"
        or parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path
        or parsed.query
        or parsed.fragment
        or (port is not None and not 1 <= port <= 65535)
    ):
        raise ValueError(f"ALLOWED_ORIGINS must contain exact http(s) origins: {origin}")
    return origin


def parse_allowed_origins(raw: str | None = None) -> tuple[str, ...]:
    value = os.getenv("ALLOWED_ORIGINS") if raw is None else raw
    if value is None or not value.strip():
        return DEFAULT_ALLOWED_ORIGINS

    origins: list[str] = []
    for item in value.split(","):
        origin = item.strip()
        if not origin:
            continue
        validated = _validate_origin(origin)
        if validated not in origins:
            origins.append(validated)

    if not origins:
        return DEFAULT_ALLOWED_ORIGINS
    return tuple(origins)
