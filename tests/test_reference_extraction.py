"""Unit tests for ``etl.parsers_reference.extract_reference_block``.

Each test builds a synthetic openpyxl Workbook in-memory, populates only
the cells under test, and feeds the active worksheet into the extractor.
No real Excel fixtures are touched — that surface is covered by the
golden tests in ``tests/test_golden_year.py`` and
``tests/test_golden_osnovni.py``.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from openpyxl import Workbook

from etl.parsers_reference import extract_reference_block

# Common metadata fed to extract_reference_block. Tests assert on category /
# content / month — these fields are passthrough so any plausible value works.
META = {
    "year": 2025,
    "month": 0,
    "source_file": "synthetic.xlsx",
    "vintage_date": datetime(2026, 1, 31),
    "report_type": "operational",
    "source_priority": 10,
}


def _make_ws(rows: list[str]) -> Any:
    """Build a one-sheet workbook with the given column-A labels.

    Each ``rows`` entry becomes the value of cell A{i+1}; columns B..N are
    left empty (which mirrors the production layout where Довідково rows
    rarely populate other cells).
    """
    wb = Workbook()
    ws = wb.active
    for idx, label in enumerate(rows, start=1):
        if label:
            ws.cell(row=idx, column=1).value = label
    return ws


# ---------------------------------------------------------------------------
# 1. Top-level value (no preceding section header)
# ---------------------------------------------------------------------------

def test_extract_reference_top_level_value() -> None:
    ws = _make_ws([
        "Довідково:",
        "Прожитковий мінімум для працездатних осіб (грн): 3209",
    ])
    refs, warnings = extract_reference_block(ws, **META)

    assert len(refs) == 1
    assert refs[0].category == "subsistence_minimum"
    assert "3209" in refs[0].content
    assert warnings == []


# ---------------------------------------------------------------------------
# 2. Section-bullet under ЕЛЕКТРОЕНЕРГІЯ
# ---------------------------------------------------------------------------

def test_extract_reference_section_bullet() -> None:
    ws = _make_ws([
        "Довідково:",
        "ЕЛЕКТРОЕНЕРГІЯ:",
        "- для населення: 7,96 грн з ПДВ за 1 кВт год.",
    ])
    refs, warnings = extract_reference_block(ws, **META)

    assert len(refs) == 1
    assert refs[0].category == "electricity_population"
    assert "7,96" in refs[0].content
    assert warnings == []


# ---------------------------------------------------------------------------
# 3. Same prefix, different sections — disambiguation by current_section
# ---------------------------------------------------------------------------

def test_extract_reference_disambiguates_by_section() -> None:
    ws = _make_ws([
        "Довідково:",
        "ЕЛЕКТРОЕНЕРГІЯ:",
        "- для населення: 4,32 грн з ПДВ за 1 кВт год.",
        "ГАЗ:",
        "- для населення: 7,96 грн за 1 м3 з ПДВ.",
    ])
    refs, warnings = extract_reference_block(ws, **META)

    assert warnings == []
    cats = sorted(r.category for r in refs)
    assert cats == ["electricity_population", "gas_population"]
    # Sanity: the GAZ row's content carries 7,96 (gas), the ЕЛЕКТРО row carries 4,32.
    by_cat = {r.category: r for r in refs}
    assert "4,32" in by_cat["electricity_population"].content
    assert "7,96" in by_cat["gas_population"].content


# ---------------------------------------------------------------------------
# 4. Missing «Довідково:» header
# ---------------------------------------------------------------------------

def test_extract_reference_handles_missing_block() -> None:
    # No Довідково anywhere — extractor must return cleanly.
    ws = _make_ws([
        "Some other label",
        "Yet another non-reference row",
    ])
    refs, warnings = extract_reference_block(ws, **META)

    assert refs == []
    assert warnings == ["no_reference_block_found"]


# ---------------------------------------------------------------------------
# 5. Header without trailing colon (real 2024 file uses this)
# ---------------------------------------------------------------------------

def test_extract_reference_minor_header_variation() -> None:
    ws = _make_ws([
        "Довідково:",
        "ЕЛЕКТРОЕНЕРГІЯ",  # no colon — older file format
        "- для населення: 4,32 грн.",
    ])
    refs, warnings = extract_reference_block(ws, **META)

    assert len(refs) == 1
    assert refs[0].category == "electricity_population"
    assert warnings == []


# ---------------------------------------------------------------------------
# 6. Unknown / garbled label — warn, don't crash
# ---------------------------------------------------------------------------

def test_extract_reference_typo_tolerance() -> None:
    ws = _make_ws([
        "Довідково:",
        "Якась залютий мутація без category-mapping",
        "Прожитковий мінімум: 3209 грн.",
    ])
    refs, warnings = extract_reference_block(ws, **META)

    # The good row still emits.
    assert len(refs) == 1
    assert refs[0].category == "subsistence_minimum"
    # The unknown row produces an unresolved_reference warning.
    assert any(w.startswith("unresolved_reference:") for w in warnings)


# ---------------------------------------------------------------------------
# 7. Two consecutive empty rows terminate the block
# ---------------------------------------------------------------------------

def test_extract_reference_stops_on_two_empty_rows() -> None:
    ws = _make_ws([
        "Довідково:",
        "Прожитковий мінімум: 3209 грн.",
        "",  # empty row 3
        "",  # empty row 4 → terminate
        "Мінімальна заробітна плата: 8647 грн.",  # row 5 — should be ignored
    ])
    refs, warnings = extract_reference_block(ws, **META)

    cats = [r.category for r in refs]
    assert cats == ["subsistence_minimum"]
    # min_wage NOT picked up — extraction stopped at the double-empty.
    assert "min_wage" not in cats
    assert warnings == []
