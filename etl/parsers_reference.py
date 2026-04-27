"""Extract the «Довідково» (reference text) block from a worksheet.

Used by both ``parser_annual_monthly`` (yearly Excel — annual snapshot,
month=0) and ``parser_osnovni`` (multi-year file — monthly snapshot
attached to the current month). Each parser supplies the year/month +
revision metadata; this module owns the row-by-row extraction.

Edge-cases the production data exhibits:

  E1. Multi-sheet osnovni → caller passes ``ws.worksheets[0]`` only;
      we don't iterate the workbook ourselves.
  E2. 2022 has no Довідково block → returns ``([], ["no_reference_block_found"])``;
      info-level warning, not a fatal error.
  E3. End-of-section is **two consecutive empty rows**. A single empty
      row between bullets (or one with a stray ``*`` / footnote in B
      sandwiched by empties) does not terminate.
  E4. Typos ("залютий" instead of "за лютий") propagate into ``content``
      verbatim — we don't normalise content text.
  E5. Section header with no bullets is harmless: ``current_section``
      simply switches when the next header lands.
  E6. Annotation in column B (e.g. row 81 sheet 2023:
      ``"(17,5 тис. грн)"``) is concatenated into ``content`` after the
      A-cell text, separated by a single space.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from .models import ReferenceText, ReportType
from .reference_aliases import detect_section_header, resolve_reference_category


def _find_reference_header(ws: Any, max_scan: int | None = None) -> int | None:
    """Return the 1-based row index of the «Довідково:» header, or None.

    Only the first occurrence is taken — if the workbook has copies of
    the block (osnovni multi-sheet), the caller has already restricted
    us to one sheet; within that sheet there is at most one block.
    """
    last = ws.max_row if max_scan is None else min(ws.max_row, max_scan)
    for row_idx in range(1, last + 1):
        a = ws.cell(row_idx, 1).value
        if a is None:
            continue
        if str(a).strip().casefold().startswith("довідково"):
            return row_idx
    return None


def extract_reference_block(
    ws: Any,
    *,
    year: int,
    month: int,
    source_file: str,
    vintage_date: datetime,
    report_type: ReportType,
    source_priority: int,
    start_row: int | None = None,
) -> tuple[list[ReferenceText], list[str]]:
    """Walk the «Довідково» section of one worksheet.

    Args:
        ws: openpyxl worksheet (the single sheet to scan; caller
            guarantees we don't roam other sheets — see E1).
        year, month: revision coordinates for emitted ``ReferenceText``
            rows. Yearly files pass ``month=0`` (annual snapshot);
            osnovni files pass the current month (1..12).
        start_row: optional override — the caller may already know where
            the «Довідково:» header is (parser hits it during its main
            loop and breaks). When None, we scan from the top.
    """
    refs: list[ReferenceText] = []
    warnings: list[str] = []

    header_row = start_row if start_row is not None else _find_reference_header(ws)
    if header_row is None:
        warnings.append("no_reference_block_found")
        return refs, warnings

    current_section: str | None = None
    empty_streak = 0

    for row_idx in range(header_row + 1, ws.max_row + 1):
        a = ws.cell(row_idx, 1).value
        b = ws.cell(row_idx, 2).value

        a_str = "" if a is None else str(a).strip()
        b_str = "" if b is None else str(b).strip()
        a_empty = a_str == ""
        b_empty = b_str == ""

        # E3 — only two consecutive fully-empty rows terminate.
        if a_empty and b_empty:
            empty_streak += 1
            if empty_streak >= 2:
                break
            continue
        empty_streak = 0

        if a_empty:
            # Row with no label but stray content in B — skip (no slug to attach).
            continue

        # Section banner? Update state and move on (E5: no bullets is fine).
        section_key = detect_section_header(a_str)
        if section_key is not None:
            current_section = section_key
            continue

        # E6 — concatenate column-B annotation into content if present.
        content = f"{a_str} {b_str}" if not b_empty else a_str

        category = resolve_reference_category(a_str, current_section)
        if category is None:
            # E4 — propagate even garbled labels: warning, no emit.
            warnings.append(
                f"unresolved_reference: row {row_idx} {a_str[:80]!r}"
            )
            continue

        refs.append(
            ReferenceText(
                category=category,
                year=year,
                month=month,
                content=content,
                source_file=source_file,
                source_row=row_idx,
                vintage_date=vintage_date,
                report_type=report_type,
                source_priority=source_priority,
            )
        )

    return refs, warnings


__all__ = ["extract_reference_block"]
