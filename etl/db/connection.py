"""SSH-tunnelled Postgres connection helper.

Operators run the writeback CLI from a developer laptop; the on-prem
Postgres only listens on the in-Docker network of the on-prem server
(``10.0.18.16``). To reach it without exposing the port we open an SSH
tunnel into the server and bind the remote 127.0.0.1:5432 to a local
ephemeral port, then connect psycopg2 through that local port.

Credentials live in a ``.env`` file at the repo root (gitignored). The
template is ``.env.example``. ``load_env`` reads/validates; ``open_connection``
is the single context manager the CLI uses.

Real SSH connectivity is exercised in 5.3.4 (integration). Unit tests in
5.3.3 cover only ``load_env`` validation — the network layer is not
mockable in a meaningful way without integration infrastructure.
"""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import TYPE_CHECKING

from dotenv import dotenv_values

if TYPE_CHECKING:
    from psycopg2.extensions import (  # type: ignore[import-untyped]  # noqa: N812
        connection as PgConnection,
    )

# Required keys; missing any of them is a configuration error, not a runtime
# fallback (we'd rather fail loudly than silently connect to the wrong host).
_REQUIRED_KEYS: tuple[str, ...] = (
    "SSH_HOST",
    "SSH_USER",
    "SSH_KEY_PATH",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
)

DEFAULT_ENV_PATH = Path(".env")


def load_env(path: str | Path | None = None) -> dict[str, str]:
    """Read ``.env`` and return all required keys as a plain dict.

    Raises ``FileNotFoundError`` if the file is missing and ``KeyError`` if
    any required key is absent or empty.
    """
    env_path = Path(path) if path is not None else DEFAULT_ENV_PATH
    if not env_path.is_file():
        raise FileNotFoundError(
            f"Environment file not found: {env_path}. "
            f"Copy .env.example to .env and fill in credentials."
        )

    raw = dotenv_values(env_path)
    out: dict[str, str] = {}
    missing: list[str] = []
    for key in _REQUIRED_KEYS:
        value = raw.get(key)
        if value is None or value == "":
            missing.append(key)
            continue
        out[key] = value

    if missing:
        raise KeyError(
            f"Missing or empty required keys in {env_path}: {', '.join(missing)}"
        )
    return out


@contextmanager
def open_connection(
    env_path: str | Path | None = None,
) -> Iterator[PgConnection]:
    """Yield a ``psycopg2.connection`` tunnelled through SSH.

    The SSH tunnel and the connection are both closed on exit, regardless
    of exception. Caller is responsible for transaction control inside the
    yielded connection (``with conn:`` for a single transactional block).

    Lazy imports of ``sshtunnel`` and ``psycopg2`` keep the module light
    when only ``load_env`` is needed (e.g. in unit tests).
    """
    import psycopg2  # type: ignore[import-untyped]
    from sshtunnel import SSHTunnelForwarder  # type: ignore[import-untyped]

    cfg = load_env(env_path)
    ssh_key = str(Path(cfg["SSH_KEY_PATH"]).expanduser())

    tunnel = SSHTunnelForwarder(
        (cfg["SSH_HOST"], 22),
        ssh_username=cfg["SSH_USER"],
        ssh_pkey=ssh_key,
        remote_bind_address=(cfg["DB_HOST"], int(cfg["DB_PORT"])),
        # local_bind_port omitted → sshtunnel picks a free port.
    )
    tunnel.start()
    try:
        conn = psycopg2.connect(
            host="127.0.0.1",
            port=tunnel.local_bind_port,
            dbname=cfg["DB_NAME"],
            user=cfg["DB_USER"],
            password=cfg["DB_PASSWORD"],
        )
        try:
            yield conn
        finally:
            conn.close()
    finally:
        tunnel.stop()


__all__ = ["DEFAULT_ENV_PATH", "load_env", "open_connection"]
