"""Mirror DB-side ``fn_normalize_indicator_name`` for branch names.

Hardcoded ``(input, expected)`` pairs from a 2026-05-04 audit against
on-prem DB ``fn_normalize_indicator_name``. If the DB function changes,
update both this table and the production mirror in
``etl/db/branch_resolver.py`` simultaneously.
"""
from __future__ import annotations

import pytest

from etl.db.branch_resolver import _normalize_branch_name

# 27 unique branch names from raw_data Excel files (yearly + osnovni).
# Expected values verified against fn_normalize_indicator_name on
# on-prem DB 2026-05-04.
_BRANCH_NORMALIZE_PAIRS: list[tuple[str, str]] = [
    # Series A — short bare names
    ("Карпатський лісовий офіс", "карпатський лісовий офіс"),
    ("Південний", "південний"),
    ("Північний", "північний"),
    ("Подільський", "подільський"),
    ("Поліський", "поліський"),
    ("Слобожанський", "слобожанський"),
    ("Столичний", "столичний"),
    ("Східний", "східний"),
    ("Центральний", "центральний"),

    # Series B — full short names with "лісовий офіс"
    ("Південний лісовий офіс", "південний лісовий офіс"),
    ("Північний лісовий офіс", "північний лісовий офіс"),
    ("Подільський лісовий офіс", "подільський лісовий офіс"),
    ("Поліський лісовий офіс", "поліський лісовий офіс"),
    ("Слобожанський лісовий офіс", "слобожанський лісовий офіс"),
    ("Столичний лісовий офіс", "столичний лісовий офіс"),
    ("Центральний лісовий офіс", "центральний лісовий офіс"),

    # Series C — lowercase prefix with quotes
    ('філія "Лісовий навчальний центр"', 'філія "лісовий навчальний центр"'),
    ('філія "Лісові репродуктивні ресурси"', 'філія "лісові репродуктивні ресурси"'),
    ('філія "Східний лісовий офіс"', 'філія "східний лісовий офіс"'),
    ('філія "Південний лісовий офіс"', 'філія "південний лісовий офіс"'),

    # Series D — capitalized prefix with quotes
    ('Філія "Карпатський лісовий офіс"', 'філія "карпатський лісовий офіс"'),
    ('Філія "Подільський лісовий офіс"', 'філія "подільський лісовий офіс"'),
    ('Філія "Північний лісовий офіс"', 'філія "північний лісовий офіс"'),
    ('Філія "Поліський лісовий офіс"', 'філія "поліський лісовий офіс"'),
    ('Філія "Столичний лісовий офіс"', 'філія "столичний лісовий офіс"'),
    ('Філія "Центральний лісовий офіс"', 'філія "центральний лісовий офіс"'),
    ('Філія "Слобожанський лісовий офіс"', 'філія "слобожанський лісовий офіс"'),

    # Series E — footnote-suffixed (THE critical case)
    (
        'філія "Лісовий навчальний центр"**',
        'філія "лісовий навчальний центр"',  # ** suffix stripped
    ),
]


@pytest.mark.parametrize("raw,expected", _BRANCH_NORMALIZE_PAIRS)
def test_normalize_branch_matches_db_function(raw: str, expected: str) -> None:
    """Each (raw, expected) pair was verified against fn_normalize_indicator_name."""
    assert _normalize_branch_name(raw) == expected


def test_normalize_branch_handles_empty() -> None:
    assert _normalize_branch_name("") == ""


def test_normalize_branch_collapses_runs_of_spaces() -> None:
    assert (
        _normalize_branch_name("Карпатський   лісовий    офіс")
        == "карпатський лісовий офіс"
    )


def test_normalize_branch_trims_outer_whitespace() -> None:
    assert (
        _normalize_branch_name("  Карпатський лісовий офіс  ")
        == "карпатський лісовий офіс"
    )


def test_normalize_branch_strips_multiple_trailing_stars() -> None:
    assert _normalize_branch_name("філія X***") == 'філія x'
