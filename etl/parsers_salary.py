"""Extract the «Середня з/п по лісових офісах» (per-branch salary) block.

Used by ``parser_annual_monthly`` (yearly Excel — wide-by-month). The
osnovni format has a different geometry (rows by year, region in
column C row 8) and is handled separately in 5.4.3.

Each branch row produces up to 13 ``SalaryValue`` emits:
  * 12 monthly snapshots (cols B..M, ``month=1..12``, ``base_meta``)
  * 1 annual average     (col N,    ``month=0``,    ``ytd_meta``)

``region_avg_uah`` is read once per branch from column O and
propagated to all 13 rows of that branch — repository layer treats
it as a per-period comparator, even though the source workbook
declares it once.

Edge-cases the production data exhibits (verified against
``raw_data/2025_рік.xlsx``):

  E1. Closed/pending branch cell (``"всі філії закриті"``,
      ``"до 18.04.2026"``) → ``safe_number`` returns ``val=None``,
      we skip that period entirely (variant B — no emit, no
      warning, since the branch genuinely had no payroll).
  E2. Empty mid-year cells → skip the period only; the rest of
      the branch row keeps emitting.
  E3. Two consecutive fully-empty rows terminate the section
      (mirrors ``extract_reference_block`` E3).
  E4. Footnote line (``"*тощо"``, ``"** у березні..."``) terminates;
      footnotes always come AFTER the data block in 2022-2025 files.
  E5. Defensive: a stray ``"Довідково:"`` header also terminates
      (should not happen because reference is extracted independently,
      but cheap safety check).
  E6. Workbook without a salary block (e.g. early formats) →
      ``([], ["no_salary_block_found"])`` — info-level warning,
      not a fatal error (consistent with reference E2).
  E7. Branch name verbatim (``'Філія "Карпатський лісовий офіс"'``):
      no trim of quotes, no normalisation, no casefold —
      repository alias-resolver layer maps to canonical
      ``salary_branches.code``.
"""
from __future__ import annotations

from typing import Any, Literal

from .models import SalaryValue
from .report_metadata import ReportMetadata
from .utils import safe_number

# Substring shared by both formats:
#   yearly:   "Середня з/п по лісових офісах одного штатного працівника, грн"
#   osnovni:  "Середня з/п по філіях одного штатного працівника, грн"
# Casefold A-cell substring match.
_SALARY_HEADER_KEYWORD = "середня з/п по"

# Geometry stable since the 2022 file format introduction. If a future
# format moves columns, callers should hardcode-override here rather
# than auto-detect (auto-detect adds opaque failure modes).
_REGION_COL_YEARLY = 15   # yearly format: column O — "Середня з/п в регіоні"
_REGION_COL_OSNOVNI = 8   # osnovni format: column H — "Середня з/п в регіоні (Мінфін)"
_YTD_COL = 14             # yearly format: column N — "Середня за рік" (annual avg)


def _find_salary_header_row(ws: Any) -> int | None:
    """Return the 1-based row index of the salary block header, or None.

    Linear scan from row 1; the keyword is unique enough across both
    yearly and osnovni formats that one match is the answer.
    """
    for row_idx in range(1, ws.max_row + 1):
        a = ws.cell(row_idx, 1).value
        if a is None:
            continue
        if _SALARY_HEADER_KEYWORD in str(a).strip().casefold():
            return row_idx
    return None


def _should_stop_at_row(
    a_str: str, empty_streak: int
) -> tuple[Literal["stop", "skip", "process"], int]:
    """Classify the current row's column-A string for the salary-block walker.

    Returns ``(action, new_empty_streak)``:

      * ``"stop"`` — caller breaks the loop (footnote, two consecutive
        empty rows, or stray «Довідково:» header).
      * ``"skip"`` — caller advances; current row carries no data
        (a single empty row mid-section).
      * ``"process"`` — caller treats ``a_str`` as a branch name and
        emits SalaryValues from the row's numeric cells.

    Stop reasons (matches reference parser):

      E1. Two consecutive fully-empty rows.
      E2. Footnote line — ``a_str`` starts with ``*``. Branch names that
          end with ``**`` (e.g. ``'філія "Лісовий навчальний центр"**'``)
          do NOT match — we check ``startswith``, not ``endswith``.
      E3. Stray «Довідково:» header (defensive — reference is extracted
          independently, but cheap safety check).
    """
    if a_str == "":
        new_streak = empty_streak + 1
        if new_streak >= 2:
            return "stop", new_streak
        return "skip", new_streak
    if a_str.startswith("*"):
        return "stop", 0
    if a_str.casefold().startswith("довідково"):
        return "stop", 0
    return "process", 0


def extract_salary_block(
    ws: Any,
    *,
    month_map: dict[int, tuple[int, int]],
    ytd_year: int,
    source_file: str,
    base_meta: ReportMetadata,
    ytd_meta: ReportMetadata,
    start_row: int | None = None,
) -> tuple[list[SalaryValue], list[str]]:
    """Walk the salary-by-branch section of one worksheet.

    Args:
        ws: openpyxl worksheet (the single sheet to scan).
        month_map: ``{col_idx: (year, month)}`` from the main parser's
            ``_build_month_map``. We assume the salary section's date
            sub-header (row 69 in 2025 file) matches the main header —
            verified true in production data; if that ever breaks the
            caller should pass a separately-built map.
        ytd_year: year to attach to ``month=0`` (annual avg) emits.
        source_file: absolute or relative path stored on each emit for audit.
        base_meta: metadata for monthly emits (operational/priority=10
            in production yearly files).
        ytd_meta: metadata for the ``month=0`` annual-avg emit
            (accounting_ytd/priority=20 via ``ytd_override``).
        start_row: caller-provided header row index. When None we scan
            (E6: returns warning if not found).
    """
    rows: list[SalaryValue] = []
    warnings: list[str] = []

    header_row = (
        start_row if start_row is not None else _find_salary_header_row(ws)
    )
    if header_row is None:
        warnings.append("no_salary_block_found")
        return rows, warnings

    empty_streak = 0

    for row_idx in range(header_row + 1, ws.max_row + 1):
        a = ws.cell(row_idx, 1).value
        a_str = "" if a is None else str(a).strip()

        action, empty_streak = _should_stop_at_row(a_str, empty_streak)
        if action == "stop":
            break
        if action == "skip":
            continue

        branch_name = a_str  # E7 — verbatim, no normalise

        # Region is per-branch; propagated to all 13 emits. Empty in
        # 2025_рік.xlsx; older files / other formats may populate it.
        region_val, _, _ = safe_number(
            ws.cell(row_idx, _REGION_COL_YEARLY).value
        )

        for col, (year, month) in month_map.items():
            val, _warn, _raw = safe_number(ws.cell(row_idx, col).value)
            if val is None:
                # E1/E2 — closed branch, pending cell, or genuinely empty.
                # Variant B: skip period entirely, no warning (closed
                # branches are a real business state, not a parser fault).
                continue
            rows.append(
                SalaryValue(
                    branch_name=branch_name,
                    year=year,
                    month=month,
                    salary_uah=val,
                    region_avg_uah=region_val,
                    source_file=source_file,
                    source_row=row_idx,
                    vintage_date=base_meta.vintage_date,
                    report_type=base_meta.report_type,
                    source_priority=base_meta.source_priority,
                )
            )

        ytd_val, _warn, _raw = safe_number(ws.cell(row_idx, _YTD_COL).value)
        if ytd_val is not None:
            rows.append(
                SalaryValue(
                    branch_name=branch_name,
                    year=ytd_year,
                    month=0,
                    salary_uah=ytd_val,
                    region_avg_uah=region_val,
                    source_file=source_file,
                    source_row=row_idx,
                    vintage_date=ytd_meta.vintage_date,
                    report_type=ytd_meta.report_type,
                    source_priority=ytd_meta.source_priority,
                )
            )

    return rows, warnings


def extract_salary_block_osnovni(
    ws: Any,
    *,
    annual_columns: tuple[tuple[int, int, bool], ...],
    current_month_col: int,
    current_year: int | None,
    current_month: int | None,
    source_file: str,
    base_meta: ReportMetadata,
    start_row: int | None = None,
) -> tuple[list[SalaryValue], list[str]]:
    """Walk the salary-by-branch section of an osnovni («Основні показники»)
    workbook (format B — wide-by-year).

    Geometry differs from yearly format:

      * Columns C2..C6 each carry a per-year average (``2022 рік`` …
        ``2026 рік``); the last (``is_ytd=True``) is a partial YTD when
        the file's current month < 12, but we emit it with the same
        shape — canonical resolution by ``priority``/``vintage_date``
        will pick a fully-closed yearly file's value over an osnovni
        partial when both exist.
      * Column C7 carries the current-month snapshot
        (e.g. ``"березень 2026"``); we emit only when the parser
        successfully decoded both year and month from the header.
      * Column C8 is a Minfin region salary with a 2-month lag
        (``"за січень 2026"`` in a March file). Per design decision
        Q1.D in 5.4.3 we do NOT parse it here — ``region_avg_uah``
        is always ``None`` for osnovni emits. Frontend's region
        comparator can read yearly files instead.

    Per design decision Q2.B in 5.4.3, all C2..C6 emits use ``month=0``
    (annual-snapshot semantics) regardless of ``is_ytd``. The
    distinction is preserved in canonical revisions through
    ``vintage_date``, not the month coordinate.

    Per design decision Q1.D, ``base_meta`` is applied to all emits
    (no ``ytd_meta`` split). Osnovni files have a single revision
    profile (``operational``/priority=10 in production).
    """
    rows: list[SalaryValue] = []
    warnings: list[str] = []

    header_row = (
        start_row if start_row is not None else _find_salary_header_row(ws)
    )
    if header_row is None:
        warnings.append("no_salary_block_found")
        return rows, warnings

    empty_streak = 0

    for row_idx in range(header_row + 1, ws.max_row + 1):
        a = ws.cell(row_idx, 1).value
        a_str = "" if a is None else str(a).strip()

        action, empty_streak = _should_stop_at_row(a_str, empty_streak)
        if action == "stop":
            break
        if action == "skip":
            continue

        branch_name = a_str  # verbatim — '**' suffix kept intact

        for col_idx, year, _is_ytd in annual_columns:
            val, _warn, _raw = safe_number(ws.cell(row_idx, col_idx).value)
            if val is None:
                continue   # closed/pending/empty — variant B skip
            rows.append(
                SalaryValue(
                    branch_name=branch_name,
                    year=year,
                    month=0,
                    salary_uah=val,
                    region_avg_uah=None,
                    source_file=source_file,
                    source_row=row_idx,
                    vintage_date=base_meta.vintage_date,
                    report_type=base_meta.report_type,
                    source_priority=base_meta.source_priority,
                )
            )

        if current_year is not None and current_month is not None:
            val, _warn, _raw = safe_number(
                ws.cell(row_idx, current_month_col).value
            )
            if val is not None:
                rows.append(
                    SalaryValue(
                        branch_name=branch_name,
                        year=current_year,
                        month=current_month,
                        salary_uah=val,
                        region_avg_uah=None,
                        source_file=source_file,
                        source_row=row_idx,
                        vintage_date=base_meta.vintage_date,
                        report_type=base_meta.report_type,
                        source_priority=base_meta.source_priority,
                    )
                )

    return rows, warnings


__all__ = ["extract_salary_block", "extract_salary_block_osnovni"]
