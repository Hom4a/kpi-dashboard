"""``etl/db/connection.py`` — load_env validation contract.

The SSH/psycopg2 path itself is integration territory (sub-step 5.3.4);
here we cover only ``load_env`` behaviour because that part is exercised
by every ``--commit`` invocation and must fail loudly on misconfiguration.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from etl.db.connection import _REQUIRED_KEYS, load_env

_GOOD_ENV = """\
SSH_HOST=10.0.18.16
SSH_USER=valeriy
SSH_KEY_PATH=~/.ssh/id_rsa
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=secret
"""


def _write_env(tmp_path: Path, body: str) -> Path:
    p = tmp_path / ".env"
    p.write_text(body, encoding="utf-8")
    return p


def test_load_env_reads_all_required_keys(tmp_path: Path) -> None:
    env = _write_env(tmp_path, _GOOD_ENV)
    cfg = load_env(env)
    assert set(cfg.keys()) == set(_REQUIRED_KEYS)
    assert cfg["SSH_HOST"] == "10.0.18.16"
    assert cfg["DB_PASSWORD"] == "secret"


def test_load_env_raises_filenotfound_on_missing_file(tmp_path: Path) -> None:
    missing = tmp_path / "does_not_exist.env"
    with pytest.raises(FileNotFoundError) as excinfo:
        load_env(missing)
    assert "does_not_exist.env" in str(excinfo.value)


def test_load_env_raises_keyerror_on_missing_required_key(tmp_path: Path) -> None:
    body = _GOOD_ENV.replace("SSH_HOST=10.0.18.16\n", "")
    env = _write_env(tmp_path, body)
    with pytest.raises(KeyError) as excinfo:
        load_env(env)
    assert "SSH_HOST" in str(excinfo.value)


def test_load_env_raises_keyerror_on_empty_value(tmp_path: Path) -> None:
    body = _GOOD_ENV.replace("SSH_HOST=10.0.18.16", "SSH_HOST=")
    env = _write_env(tmp_path, body)
    with pytest.raises(KeyError) as excinfo:
        load_env(env)
    assert "SSH_HOST" in str(excinfo.value)


def test_load_env_default_path_when_none(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    _write_env(tmp_path, _GOOD_ENV)
    cfg = load_env()  # no argument → defaults to Path(".env")
    assert cfg["DB_USER"] == "postgres"


def test_load_env_returns_only_required_keys(tmp_path: Path) -> None:
    body = _GOOD_ENV + "OPTIONAL_VAR=foo\nDEBUG=true\n"
    env = _write_env(tmp_path, body)
    cfg = load_env(env)
    assert "OPTIONAL_VAR" not in cfg
    assert "DEBUG" not in cfg
    assert set(cfg.keys()) == set(_REQUIRED_KEYS)
