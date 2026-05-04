"""Tests for species_resolver.

Hardcoded ``(input, expected)`` pairs from a 2026-05-04 audit against
on-prem ``fn_normalize_indicator_name``. The DB function is shared with
branch_resolver, so the same Python mirror covers both surfaces — these
tests are an extra parity guard specifically for animal species.
"""
from __future__ import annotations

import pytest

from etl.db.species_resolver import _normalize_species_name

# 6 production species (verbatim з Excel) plus the abbreviated form.
# All 7 ``alias_normalized`` values exist in animal_species_aliases.
_SPECIES_NORMALIZE_PAIRS: list[tuple[str, str]] = [
    ("Олень благор.", "олень благор."),         # abbreviated, trailing dot kept
    ("Олень благородний", "олень благородний"),  # full form
    ("Олень плямистий", "олень плямистий"),
    ("Козуля", "козуля"),
    ("Кабан", "кабан"),
    ("Лань", "лань"),
    ("Муфлон", "муфлон"),
]


@pytest.mark.parametrize("raw,expected", _SPECIES_NORMALIZE_PAIRS)
def test_normalize_species_matches_db_function(raw: str, expected: str) -> None:
    """Each pair was verified against fn_normalize_indicator_name on-prem."""
    assert _normalize_species_name(raw) == expected


def test_normalize_species_handles_double_space() -> None:
    """Whitespace runs collapse — guards against the
    ``"Олень плямистий  650/*"`` double-space variation seen in
    production cells."""
    assert _normalize_species_name("Олень  плямистий") == "олень плямистий"


def test_normalize_species_strips_trailing_stars() -> None:
    """Mirror DB-side strip of ``\\*+`` suffix (defensive — production
    species cells don't carry trailing stars on the species *name*,
    only on the limit slot, but the resolver should still handle it)."""
    assert _normalize_species_name("Кабан**") == "кабан"
