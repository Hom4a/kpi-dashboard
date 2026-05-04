"""Contract tests for ``extract_animals_block`` (yearly format).

Each test builds a synthetic worksheet through ``openpyxl.Workbook`` —
no disk fixtures, deterministic, fast.

Geometry mirrors production yearly file ``raw_data/2025_рік.xlsx``:

  row 1: ignored (banner)
  row 2: ignored
  row 3: year labels — col B='2022 рік', col C='2023 рік'
  row 4: section header — col A='Чисельність/кількість лімітів '
  row 5+: species rows, each cell = '<species_alias> <population>/<limit>'
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from openpyxl import Workbook
from openpyxl.worksheet.worksheet import Worksheet

from etl.models import AnimalValue
from etl.parsers_animals import extract_animals_block
from etl.report_metadata import ReportMetadata


def _meta(
    *,
    report_type: str = "operational",
    priority: int = 10,
    vintage: datetime | None = None,
) -> ReportMetadata:
    return ReportMetadata(
        report_type=report_type,  # type: ignore[arg-type]
        vintage_date=vintage or datetime(2026, 1, 31),
        source_priority=priority,
    )


def _build_ws(
    species_rows: list[list[str | None]],
    *,
    year_labels: list[str | None] | None = None,
    extra_rows_after: list[list[Any]] | None = None,
) -> tuple[Worksheet, int]:
    """Build a synthetic animals sheet.

    species_rows: list of rows, each a list of cell values starting at
                  col B (col A is empty for animals body).
    year_labels:  values for row 3, cols B..N (default
                  ['2022 рік', '2023 рік']).
    extra_rows_after: optional rows injected after species (col A first).

    Returns (ws, header_row) — header_row is always 4.
    """
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = "2025"

    # Year labels at row 3
    labels = year_labels if year_labels is not None else ["2022 рік", "2023 рік"]
    for offset, label in enumerate(labels):
        if label is not None:
            ws.cell(3, 2 + offset).value = label

    # Section header at row 4
    header_row = 4
    ws.cell(header_row, 1).value = "Чисельність/кількість лімітів "

    # Species rows starting at row 5
    next_row = header_row + 1
    for row_cells in species_rows:
        for offset, cell in enumerate(row_cells):
            if cell is not None:
                ws.cell(next_row, 2 + offset).value = cell
        next_row += 1

    for extra in extra_rows_after or []:
        for offset, cell in enumerate(extra):
            if cell is not None:
                ws.cell(next_row, 1 + offset).value = cell
        next_row += 1

    return ws, header_row


def _extract(
    ws: Worksheet,
    header_row: int,
) -> tuple[list[AnimalValue], list[str]]:
    return extract_animals_block(
        ws,
        source_file="synthetic.xlsx",
        base_meta=_meta(),
        header_row=header_row,
    )


# ---------------------------------------------------------------------------
# 1. Happy path — 6 species × 2 years = 12 emits
# ---------------------------------------------------------------------------

def test_happy_path_two_years() -> None:
    """Mirror of the 2025_рік.xlsx animals geometry: 6 species, 2 years."""
    ws, hdr = _build_ws(
        [
            ["Олень благор. 3787/*",   "Олень благор. 3697/*"],
            ["Олень плямистий 1025/*", "Олень плямистий 744/*"],
            ["Козуля 35191/*",         "Козуля 30810/*"],
            ["Кабан 7700/*",           "Кабан 6813/*"],
            ["Лань 362/*",             "Лань 334/*"],
            ["Муфлон 302/*",           "Муфлон 312/*"],
        ],
    )
    animals, warnings = _extract(ws, hdr)

    assert len(animals) == 12
    assert warnings == []
    species_seen = {a.species_name for a in animals}
    years_seen = sorted({a.year for a in animals})
    assert years_seen == [2022, 2023]
    assert species_seen == {
        "Олень благор.", "Олень плямистий", "Козуля",
        "Кабан", "Лань", "Муфлон",
    }
    # Spot-check one emit (Олень благор. 2022)
    deer_2022 = next(
        a for a in animals
        if a.species_name == "Олень благор." and a.year == 2022
    )
    assert deer_2022.population == 3787
    assert deer_2022.limit_qty is None
    assert deer_2022.raw_text == "Олень благор. 3787/*"


# ---------------------------------------------------------------------------
# 2. Limit '*' becomes None
# ---------------------------------------------------------------------------

def test_limit_star_becomes_none() -> None:
    """``"*"`` in the limit slot maps to ``limit_qty=None``."""
    ws, hdr = _build_ws([["Кабан 7700/*", None]])
    animals, _ = _extract(ws, hdr)
    assert len(animals) == 1
    assert animals[0].limit_qty is None
    assert animals[0].population == 7700


# ---------------------------------------------------------------------------
# 3. Numeric limit parsed as int
# ---------------------------------------------------------------------------

def test_limit_numeric_parsed_as_int() -> None:
    """Future-shape: when the limit slot carries a number, it is stored."""
    ws, hdr = _build_ws([["Кабан 7700/250", None]])
    animals, _ = _extract(ws, hdr)
    assert len(animals) == 1
    assert animals[0].limit_qty == 250
    assert animals[0].population == 7700


# ---------------------------------------------------------------------------
# 4. Abbreviated species name preserved
# ---------------------------------------------------------------------------

def test_abbreviated_species_name_preserved() -> None:
    """``"Олень благор."`` (with trailing period) kept verbatim."""
    ws, hdr = _build_ws([["Олень благор. 3787/*", None]])
    animals, _ = _extract(ws, hdr)
    assert len(animals) == 1
    assert animals[0].species_name == "Олень благор."


# ---------------------------------------------------------------------------
# 5. Double space between name and population
# ---------------------------------------------------------------------------

def test_double_space_in_cell() -> None:
    """``"Олень плямистий  650/*"`` (production variant) parses cleanly."""
    ws, hdr = _build_ws([["Олень плямистий  650/*", None]])
    animals, _ = _extract(ws, hdr)
    assert len(animals) == 1
    assert animals[0].species_name == "Олень плямистий"
    assert animals[0].population == 650


# ---------------------------------------------------------------------------
# 6. raw_text preserved verbatim
# ---------------------------------------------------------------------------

def test_raw_text_preserved() -> None:
    """``raw_text`` is the original cell content, no normalization."""
    raw = "Олень плямистий  650/*"  # double space — production variant
    ws, hdr = _build_ws([[raw, None]])
    animals, _ = _extract(ws, hdr)
    assert len(animals) == 1
    assert animals[0].raw_text == raw


# ---------------------------------------------------------------------------
# 7. Section header not found → empty result, no warnings
# ---------------------------------------------------------------------------

def test_section_header_not_found() -> None:
    """Worksheet without the section header → ``([], [])``."""
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.cell(1, 1).value = "Some other content"
    ws.cell(2, 1).value = "Загальна реалізація, млн. грн"

    animals, warnings = extract_animals_block(
        ws,
        source_file="synthetic.xlsx",
        base_meta=_meta(),
    )
    assert animals == []
    assert warnings == []


# ---------------------------------------------------------------------------
# 8. Year labels missing → warning, no emits
# ---------------------------------------------------------------------------

def test_year_labels_missing() -> None:
    """Header found but row above is empty → info-level warning."""
    ws, hdr = _build_ws(
        [["Кабан 7700/*", None]],
        year_labels=[None, None],  # row 3 empty
    )
    animals, warnings = _extract(ws, hdr)

    assert animals == []
    assert len(warnings) == 1
    assert "no year labels found" in warnings[0]
