"""Animals census section parser.

Geometry — yearly format (``raw_data/<year>_рік.xlsx``):

  Row label_row (typically header_row - 1):
      year labels in cols B+ as ``"YYYY рік"`` strings.
  Row header_row:
      col A starts with ``"Чисельність/кількість лімітів"``.
  Rows header_row+1..header_row+6:
      6 species, each cell carries a composite
      ``"<species_alias> <population>/<limit>"`` string.

Cell format: ``<species_alias>\\s+<integer_population>\\s*/\\s*<limit>``
where ``<limit>`` is ``*`` (footnote marker → ``limit_qty=None``) or
an integer. Production data observes only ``*``; the integer branch is
plumbed for future use when state limits become enforceable.

The parser preserves species names verbatim — repository layer
resolves them through ``animal_species_aliases``.

Whitespace tolerance: yearly files contain at least one cell with a
double space between species and count (``"Олень плямистий  650/*"``);
the regex's non-greedy capture for the name plus greedy ``\\s+`` between
groups handles this.

E1. Two consecutive empty rows or a non-empty col A under the section
    header terminates the scan (next section starting).
E2. Cells that don't match the expected pattern emit a warning but
    don't abort — the rest of the row continues.
"""
from __future__ import annotations

import re
from typing import Any

from .models import AnimalValue
from .report_metadata import ReportMetadata

# Header marker — section starts immediately at the row whose A1 begins
# with this phrase (``casefold()``-normalized, trailing whitespace
# already stripped by caller).
_ANIMALS_HEADER_KEYWORD = "чисельність/кількість лімітів"

# Year labels row — typically immediately ABOVE the section header.
# Format: ``"2022 рік"``, ``"2023 рік"``, etc.
# Trailing whitespace observed in production data ("2022 рік ").
_YEAR_LABEL_RE = re.compile(r"^\s*(20\d{2})\s+рік\s*$", re.IGNORECASE)

# Composite animal cell. Whitespace-tolerant non-greedy capture for name,
# greedy split on '/' between population and limit.
# Production-observed: ``"Олень благор. 3787/*"``,
# ``"Олень плямистий  650/*"`` (double space), ``"Кабан 7700/*"``.
_ANIMALS_CELL_RE = re.compile(r"^\s*(.+?)\s+(\d+)\s*/\s*(\*+|\d+)\s*$")

# Hardcoded upper bound on rows scanned below the header. Defensive —
# production has 6 species so 20 leaves headroom for future growth.
_MAX_SPECIES_ROWS = 20


def _find_animals_header_row(ws: Any) -> int | None:
    """Locate the row where col A begins with ``_ANIMALS_HEADER_KEYWORD``.

    Returns row index (1-based) or ``None`` if not found.
    """
    for row_idx in range(1, ws.max_row + 1):
        a = ws.cell(row_idx, 1).value
        if a is None:
            continue
        if str(a).strip().lower().startswith(_ANIMALS_HEADER_KEYWORD):
            return row_idx
    return None


def _parse_year_labels(ws: Any, label_row: int) -> dict[int, int]:
    """Read row above animals header for ``"YYYY рік"`` labels.

    Returns ``{col_idx: year}`` for cells in cols 2..13 that match
    ``_YEAR_LABEL_RE``. Empty or non-matching cells are silently skipped.
    """
    year_map: dict[int, int] = {}
    for col_idx in range(2, 14):
        v = ws.cell(label_row, col_idx).value
        if v is None:
            continue
        m = _YEAR_LABEL_RE.match(str(v))
        if m:
            year_map[col_idx] = int(m.group(1))
    return year_map


def _parse_animal_cell(text: str) -> tuple[str, int, int | None] | None:
    """Parse ``"<species_alias> <population>/<limit>"`` from one cell.

    Returns ``(species_alias_raw, population, limit_or_None)`` or
    ``None`` when the cell doesn't match the expected shape.

    ``limit_or_None`` is ``None`` when the limit portion is ``*``
    (footnote marker), int otherwise.
    """
    m = _ANIMALS_CELL_RE.match(str(text))
    if not m:
        return None
    name = m.group(1).strip()
    population = int(m.group(2))
    limit_str = m.group(3).strip()
    limit_qty: int | None = None if limit_str.startswith("*") else int(limit_str)
    return name, population, limit_qty


def extract_animals_block(
    ws: Any,
    *,
    source_file: str,
    base_meta: ReportMetadata,
    label_row: int | None = None,
    header_row: int | None = None,
) -> tuple[list[AnimalValue], list[str]]:
    """Walk the animals census section of one worksheet (yearly format).

    Reads year labels from ``label_row`` (typically ``header_row - 1``),
    then scans rows after ``header_row`` for composite animal cells.

    Args:
        ws: openpyxl worksheet (single sheet — caller responsibility).
        source_file: absolute or relative path stored on each emit.
        base_meta: revision metadata applied to all emits. Reused from
            the main parser's ``infer_report_metadata`` output, same
            object handed to ``extract_salary_block`` — keeps the
            ``ReportMetadata`` contract consistent across extractors.
        label_row: row containing ``"YYYY рік"`` labels. Defaults to
            ``header_row - 1`` when ``None``.
        header_row: caller-provided row index of the section header.
            When ``None``, the function scans for it.

    Returns ``(animals, warnings)``. ``animals`` may be empty when the
    section is absent or when year labels failed to parse; in those
    cases ``warnings`` carries one info-level entry.
    """
    warnings: list[str] = []

    if header_row is None:
        header_row = _find_animals_header_row(ws)
        if header_row is None:
            return [], warnings

    if label_row is None:
        label_row = header_row - 1

    year_map = _parse_year_labels(ws, label_row)
    if not year_map:
        warnings.append(
            f"animals_section: no year labels found at row {label_row} "
            f"(expected 'YYYY рік' format above header row {header_row})"
        )
        return [], warnings

    animals: list[AnimalValue] = []

    # Scan starts at the header row itself: in production yearly files
    # the first species (e.g., 'Олень благор. 3787/*') sits in cols B+
    # of header_row, sharing the row with the col-A section header.
    # Subsequent species rows have empty col A.
    for offset in range(0, _MAX_SPECIES_ROWS + 1):
        row_idx = header_row + offset
        if row_idx > ws.max_row:
            break

        # E1 — row entirely empty across the year columns: section ended.
        # Exception: on the header row itself (offset == 0) an empty
        # year-cell payload is allowed — synthetic test geometries place
        # species in header_row+1; we just advance instead of bailing.
        any_cell_present = any(
            ws.cell(row_idx, col).value is not None for col in year_map
        )
        if not any_cell_present:
            if offset == 0:
                continue
            break

        # E1 — col A is non-empty: next section starting (animals body
        # rows have empty col A). Skipped on the header row itself, where
        # col A holds the animals section header phrase.
        if offset > 0:
            a_val = ws.cell(row_idx, 1).value
            if a_val is not None and str(a_val).strip():
                break

        for col_idx, year in year_map.items():
            cell_value = ws.cell(row_idx, col_idx).value
            if cell_value is None:
                continue
            cell_str = str(cell_value).strip()
            if not cell_str:
                continue

            parsed = _parse_animal_cell(cell_str)
            if parsed is None:
                # E2 — unparseable cell: warn but don't abort.
                warnings.append(
                    f"animals_cell_unparseable: row {row_idx} "
                    f"col {col_idx}: {cell_str!r}"
                )
                continue

            species_name, population, limit_qty = parsed
            animals.append(
                AnimalValue(
                    species_name=species_name,
                    year=year,
                    population=population,
                    limit_qty=limit_qty,
                    raw_text=cell_str,
                    source_file=source_file,
                    source_row=row_idx,
                    vintage_date=base_meta.vintage_date,
                    report_type=base_meta.report_type,
                    source_priority=base_meta.source_priority,
                )
            )

    return animals, warnings


def extract_animals_block_osnovni(
    ws: Any,
    *,
    annual_columns: tuple[tuple[int, int, bool], ...],
    source_file: str,
    base_meta: ReportMetadata,
    header_row: int | None = None,
) -> tuple[list[AnimalValue], list[str]]:
    """Walk the animals census section of an osnovni workbook.

    Geometry differs from the yearly format: years live in fixed
    columns (``ANNUAL_COLUMNS`` from ``parser_osnovni``) rather than
    in dynamic ``"YYYY рік"`` labels above the section header.

    ``annual_columns`` is the parser_osnovni ``ANNUAL_COLUMNS`` list of
    ``(col_idx, year, is_ytd)`` triples. ``is_ytd=True`` columns are
    skipped — animal census reflects closed years only, not partial YTD
    figures (production data confirms: 2026 column is empty for
    animal rows even when other metrics carry YTD values).

    The current-month column (col 7 in osnovni) is intentionally
    NOT a parameter — animals have no monthly snapshot.

    Composite cell format identical to yearly:
    ``"<species_alias> <pop>/<limit>"`` parsed by ``_ANIMALS_CELL_RE``.

    ``base_meta`` is the osnovni-derived ``ReportMetadata`` (single
    metadata for all emits — osnovni doesn't split into report_type
    sub-bands the way yearly's ``ytd_meta`` does).

    Returns ``(animals, warnings)``. Empty list when section header
    not found, or when every column is marked YTD.
    """
    warnings: list[str] = []

    if header_row is None:
        header_row = _find_animals_header_row(ws)
        if header_row is None:
            return [], warnings

    closed_year_cols: list[tuple[int, int]] = [
        (col, year) for (col, year, is_ytd) in annual_columns if not is_ytd
    ]
    if not closed_year_cols:
        warnings.append(
            "animals_section: no closed-year columns in annual_columns "
            "(all marked is_ytd)"
        )
        return [], warnings

    animals: list[AnimalValue] = []

    # Scan from header_row inclusive — production yearly files (and
    # likely osnovni too) put first species data on the same row as the
    # col-A section header. Synthetic test geometry tolerated via the
    # offset==0 special case.
    for offset in range(0, _MAX_SPECIES_ROWS + 1):
        row_idx = header_row + offset
        if row_idx > ws.max_row:
            break

        any_cell = any(
            ws.cell(row_idx, col).value is not None
            for col, _ in closed_year_cols
        )
        if not any_cell:
            if offset == 0:
                continue
            break

        if offset > 0:
            a_val = ws.cell(row_idx, 1).value
            if a_val is not None and str(a_val).strip():
                break

        for col_idx, year in closed_year_cols:
            cell_value = ws.cell(row_idx, col_idx).value
            if cell_value is None:
                continue
            cell_str = str(cell_value).strip()
            if not cell_str:
                continue

            parsed = _parse_animal_cell(cell_str)
            if parsed is None:
                warnings.append(
                    f"animals_cell_unparseable: row {row_idx} "
                    f"col {col_idx}: {cell_str!r}"
                )
                continue

            species_name, population, limit_qty = parsed
            animals.append(
                AnimalValue(
                    species_name=species_name,
                    year=year,
                    population=population,
                    limit_qty=limit_qty,
                    raw_text=cell_str,
                    source_file=source_file,
                    source_row=row_idx,
                    vintage_date=base_meta.vintage_date,
                    report_type=base_meta.report_type,
                    source_priority=base_meta.source_priority,
                )
            )

    return animals, warnings


__all__ = [
    "_ANIMALS_HEADER_KEYWORD",
    "_ANIMALS_CELL_RE",
    "_YEAR_LABEL_RE",
    "extract_animals_block",
    "extract_animals_block_osnovni",
]
