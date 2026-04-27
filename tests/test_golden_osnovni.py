"""Golden fixture test: parser output must exactly match ``osnovni_bereznen_2026.yml``.

Each golden key is a parametrized test case. Tolerance is ``rel=1e-9`` —
values must match to full float64 precision.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml

from etl.canonical import (
    canonical_annual,
    canonical_monthly,
    canonical_species_annual,
    canonical_species_monthly,
)
from etl.models import ParseResult
from etl.parser_osnovni import parse_osnovni_annual

XLSX = Path("raw_data/Основні_показники_березень_2026_остання.xlsx")
GOLDEN = Path("tests/golden/osnovni_bereznen_2026.yml")


# ---------------------------------------------------------------------------
# Helpers (module-level — called during collection to parametrize)
# ---------------------------------------------------------------------------

def _period_spec(key: str) -> tuple[int, int | None, bool]:
    """Map golden-period key to (year, month, is_ytd)."""
    if key.startswith("y") and key.endswith("_ytd"):
        return int(key[1:5]), None, True
    if key.startswith("y"):
        return int(key[1:5]), None, False
    if key == "march_2026":
        return 2026, 3, False
    raise ValueError(f"unknown period key: {key}")


def _load_golden() -> dict[str, Any]:
    with GOLDEN.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def _build_indexes(r: ParseResult) -> tuple[
    dict[tuple[str, int, bool], float],
    dict[tuple[str, int, int], float],
    dict[tuple[str, int], tuple[float | None, float | None]],
    dict[tuple[str, int, int], tuple[float | None, float | None]],
]:
    # Canonical views: one fact per (metric, period) — highest priority wins.
    # is_ytd is preserved in the canonical AnnualValue.
    ann = {(a.metric_code, a.year, a.is_ytd): a.value for a in canonical_annual(r.annual)}
    mon = {
        (m.metric_code, m.year, m.month): m.value
        for m in canonical_monthly(r.monthly)
    }
    sp_ann = {
        (s.species, s.year): (s.volume_km3, s.avg_price_grn)
        for s in canonical_species_annual(r.species_annual)
    }
    sp_mon = {
        (s.species, s.year, s.month): (s.volume_km3, s.avg_price_grn)
        for s in canonical_species_monthly(r.species_monthly)
    }
    return ann, mon, sp_ann, sp_mon


_golden = _load_golden()


def _gather_scalar_cases() -> list[tuple[str, str, int, int | None, bool, Any]]:
    out: list[tuple[str, str, int, int | None, bool, Any]] = []
    for section in ("operational", "taxes"):
        for metric_code, periods in _golden[section].items():
            for period_key, expected in periods.items():
                year, month, is_ytd = _period_spec(period_key)
                out.append((section, metric_code, year, month, is_ytd, expected))
    return out


def _gather_species_cases() -> list[
    tuple[str, str, int, int | None, bool, str, Any]
]:
    out: list[tuple[str, str, int, int | None, bool, str, Any]] = []
    for species_code, periods in _golden["species"].items():
        for period_key, expected_pair in periods.items():
            year, month, is_ytd = _period_spec(period_key)
            for subfield in ("volume_km3", "avg_price_grn"):
                out.append(
                    (
                        species_code,
                        period_key,
                        year,
                        month,
                        is_ytd,
                        subfield,
                        expected_pair.get(subfield),
                    )
                )
    return out


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def parsed() -> ParseResult:
    return parse_osnovni_annual(XLSX)


@pytest.fixture(scope="module")
def indexes(parsed: ParseResult) -> tuple[
    dict[tuple[str, int, bool], float],
    dict[tuple[str, int, int], float],
    dict[tuple[str, int], tuple[float | None, float | None]],
    dict[tuple[str, int, int], tuple[float | None, float | None]],
]:
    return _build_indexes(parsed)


# ---------------------------------------------------------------------------
# Scalar metric tests (operational + taxes)
# ---------------------------------------------------------------------------

_SCALAR_CASES = _gather_scalar_cases()


@pytest.mark.parametrize(
    "section,metric_code,year,month,is_ytd,expected",
    _SCALAR_CASES,
    ids=[
        f"{c[0]}/{c[1]}/{c[2]}"
        f"{'_ytd' if c[4] else ('_m' + str(c[3])) if c[3] else ''}"
        for c in _SCALAR_CASES
    ],
)
def test_scalar_matches_golden(
    section: str,
    metric_code: str,
    year: int,
    month: int | None,
    is_ytd: bool,
    expected: Any,
    indexes: tuple[Any, Any, Any, Any],
) -> None:
    ann, mon, _, _ = indexes
    got = (
        mon.get((metric_code, year, month))
        if month is not None
        else ann.get((metric_code, year, is_ytd))
    )

    if expected is None:
        assert got is None, (
            f"golden has null for {metric_code}/{year}/m={month}/ytd={is_ytd} "
            f"but parser produced {got}"
        )
    else:
        assert got is not None, (
            f"parser missing {metric_code}/{year}/m={month}/ytd={is_ytd} "
            f"(expected {expected})"
        )
        assert got == pytest.approx(float(expected), rel=1e-9), (
            f"{metric_code}/{year}/m={month}/ytd={is_ytd}: "
            f"expected {expected}, got {got}"
        )


# ---------------------------------------------------------------------------
# Species composite tests
# ---------------------------------------------------------------------------

_SPECIES_CASES = _gather_species_cases()


@pytest.mark.parametrize(
    "species_code,period_key,year,month,is_ytd,subfield,expected",
    _SPECIES_CASES,
    ids=[f"{c[0]}.{c[5]}/{c[1]}" for c in _SPECIES_CASES],
)
def test_species_matches_golden(
    species_code: str,
    period_key: str,
    year: int,
    month: int | None,
    is_ytd: bool,
    subfield: str,
    expected: Any,
    indexes: tuple[Any, Any, Any, Any],
) -> None:
    _, _, sp_ann, sp_mon = indexes
    pair = (
        sp_mon.get((species_code, year, month))
        if month is not None
        else sp_ann.get((species_code, year))
    )
    got = None if pair is None else (pair[0] if subfield == "volume_km3" else pair[1])

    if expected is None:
        assert got is None, (
            f"golden has null for {species_code}.{subfield}/{period_key} "
            f"but parser produced {got}"
        )
    else:
        assert got is not None, (
            f"parser missing {species_code}.{subfield}/{period_key} "
            f"(expected {expected})"
        )
        assert got == pytest.approx(float(expected), rel=1e-9), (
            f"{species_code}.{subfield}/{period_key}: expected {expected}, got {got}"
        )


# ---------------------------------------------------------------------------
# Health invariants
# ---------------------------------------------------------------------------

def test_no_errors(parsed: ParseResult) -> None:
    assert parsed.errors == [], f"parser reported errors: {parsed.errors}"


def test_no_unparseable_warnings(parsed: ParseResult) -> None:
    bad = [w for w in parsed.warnings if "unparseable" in w]
    assert bad == [], f"parser had unparseable warnings: {bad}"


# ---------------------------------------------------------------------------
# Reference («Довідково») rows — substring assertion (osnovni → month 1..12)
# ---------------------------------------------------------------------------

def _gather_reference_cases() -> list[tuple[str, int, str]]:
    items = _golden.get("reference", [])
    return [(it["category"], it["month"], it["content_contains"]) for it in items]


_REFERENCE_CASES = _gather_reference_cases()


@pytest.mark.parametrize(
    "category,month,content_contains",
    _REFERENCE_CASES,
    ids=[f"{c[0]}/m{c[1]}" for c in _REFERENCE_CASES],
)
def test_reference_matches_golden(
    category: str,
    month: int,
    content_contains: str,
    parsed: ParseResult,
) -> None:
    """Each reference golden entry must surface as a ParseResult.reference
    row whose ``content`` contains the expected substring."""
    match = next(
        (
            r for r in parsed.reference
            if r.category == category and r.month == month
        ),
        None,
    )
    assert match is not None, (
        f"parser missing reference fact for {category}/m{month}"
    )
    assert content_contains in match.content, (
        f"content for {category}/m{month} does not contain "
        f"{content_contains!r}; got {match.content!r}"
    )


# ---------------------------------------------------------------------------
# E2E text-only emission (Step 3 КОРЕКЦІЯ — value_text round-trip)
# ---------------------------------------------------------------------------

def _gather_text_only_cases() -> list[tuple[str, int, int | None, bool, str]]:
    section = _golden.get("text_only", {})
    out: list[tuple[str, int, int | None, bool, str]] = []
    for metric_code, periods in section.items():
        for period_key, expected in periods.items():
            year, month, is_ytd = _period_spec(period_key)
            assert expected.get("value") is None, (
                f"text_only entries are expected to carry value=null "
                f"({metric_code}/{period_key})"
            )
            out.append((metric_code, year, month, is_ytd, expected["value_text"]))
    return out


_TEXT_ONLY_CASES = _gather_text_only_cases()


@pytest.mark.parametrize(
    "metric_code,year,month,is_ytd,expected_text",
    _TEXT_ONLY_CASES,
    ids=[
        f"{c[0]}/{c[1]}{'_ytd' if c[3] else ('_m' + str(c[2])) if c[2] else ''}"
        for c in _TEXT_ONLY_CASES
    ],
)
def test_text_only_matches_golden(
    metric_code: str,
    year: int,
    month: int | None,
    is_ytd: bool,
    expected_text: str,
    parsed: ParseResult,
) -> None:
    """Parser emits AnnualValue/MonthlyValue with ``value_text`` for pending
    cells. Golden YAML pins the exact text — drift will fail this test."""
    if month is None:
        match = next(
            (
                a for a in parsed.annual
                if a.metric_code == metric_code
                and a.year == year
                and a.is_ytd == is_ytd
            ),
            None,
        )
    else:
        match = next(
            (
                m for m in parsed.monthly
                if m.metric_code == metric_code
                and m.year == year
                and m.month == month
            ),
            None,
        )
    assert match is not None, (
        f"parser missing text-only fact {metric_code}/{year}/m={month}/ytd={is_ytd}"
    )
    assert match.value is None, (
        f"text-only fact must carry value=None, got {match.value}"
    )
    assert match.value_text == expected_text, (
        f"value_text mismatch for {metric_code}/{year}/m={month}/ytd={is_ytd}: "
        f"expected {expected_text!r}, got {match.value_text!r}"
    )
