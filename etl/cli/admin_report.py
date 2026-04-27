"""Administrator data-review report (markdown).

Usage:
    python -m etl.cli.admin_report
    python -m etl.cli.admin_report --out report.md

Scans ``raw_data/`` for supported Excel files, parses them all, then prints:
  1. Revisions — cells whose values changed across source versions
  2. Cross-report divergences — same-priority sources disagreeing (≥1%)
  3. Pending / closed markers — cells that still await entry
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

from etl.canonical import canonical_annual
from etl.derived import compute_derived_annual
from etl.divergence import find_annual_divergence, find_monthly_divergence
from etl.models import AnnualValue, MonthlyValue, ParseResult
from etl.parser_annual_monthly import parse_annual_monthly
from etl.parser_osnovni import parse_osnovni_annual
from etl.revisions import find_annual_revisions, find_monthly_revisions

RAW_DIR = Path("raw_data")


def _dispatch_parser(path: Path) -> ParseResult | None:
    """Choose the parser per filename; return None if not supported."""
    stem = path.stem.lower()
    if "основні" in stem and "показник" in stem:
        return parse_osnovni_annual(path)
    # yearly formats: "2022_рік", "2023_рік", "2024", "2025_рік"
    if any(stem.startswith(str(y)) for y in range(2020, 2031)):
        return parse_annual_monthly(path)
    return None


def _pending_report(
    annual: list[AnnualValue], monthly: list[MonthlyValue]
) -> list[str]:
    """Collect warnings that flag pending/closed cells (needs entry)."""
    # We don't carry raw warnings from parse results here — this list is
    # for future expansion (e.g. surfacing unresolved pending markers).
    return []


def build_report(parsed_files: list[tuple[Path, ParseResult]]) -> str:
    all_annual: list[AnnualValue] = []
    all_monthly: list[MonthlyValue] = []
    pending_lines: list[str] = []

    for path, r in parsed_files:
        all_annual.extend(r.annual)
        all_monthly.extend(r.monthly)
        # Surface warnings that represent pending / closed cells.
        for w in r.warnings:
            if "pending_until" in w or "closed_or_pending" in w:
                pending_lines.append(f"- `{path.name}` :: {w}")

    # Pipeline: raw → canonical → compute_derived. Derived facts join the
    # raw pool before revision/divergence analysis so admin sees them
    # labelled but NOT multi-versioned.
    canon_annual = canonical_annual(all_annual)
    derived_annual = compute_derived_annual(canon_annual)
    all_annual = list(all_annual) + derived_annual

    annual_revs = find_annual_revisions(all_annual)
    monthly_revs = find_monthly_revisions(all_monthly)

    annual_divs = find_annual_divergence(all_annual, rel_threshold=0.01)
    monthly_divs = find_monthly_divergence(all_monthly, rel_threshold=0.01)

    out: list[str] = []
    out.append("# Administrator Data Review Report\n")
    out.append(
        f"Parsed {len(parsed_files)} file(s). "
        f"{len(all_annual)} annual + {len(all_monthly)} monthly facts.\n"
    )

    # ---- 1. Revisions ----
    out.append("\n## 1. Revisions (values that changed between source versions)\n")
    meaningful = [r for r in annual_revs if r.is_meaningful] + [
        r for r in monthly_revs if r.is_meaningful
    ]
    unchanged = [r for r in annual_revs if not r.is_meaningful] + [
        r for r in monthly_revs if not r.is_meaningful
    ]
    if not meaningful and not unchanged:
        out.append("_No multi-source metrics detected._\n")
    else:
        out.append(
            f"_{len(meaningful)} meaningful, {len(unchanged)} identical across versions._\n"
        )
        for rev in meaningful:
            period = f"{rev.year}" if rev.month is None else f"{rev.year}-{rev.month:02d}"
            out.append(f"\n### {rev.metric_code} / {period}")
            for v in rev.versions:
                marker = " ← canonical" if v.value == rev.canonical_value else ""
                val_str = f"{v.value:,.2f}" if v.value is not None else "—"
                out.append(
                    f"- `{val_str}`  @ {v.vintage_date.date()}  "
                    f"({v.report_type}, prio={v.source_priority}, "
                    f"{Path(v.source_file).name}){marker}"
                )
            if rev.delta_from_previous is not None:
                out.append(f"- **Δ = {rev.delta_from_previous:+,.2f}**")

    # ---- 2. Cross-report divergences ----
    out.append("\n\n## 2. Cross-report divergences (same priority, ≥1%)\n")
    all_divs = annual_divs + monthly_divs
    if not all_divs:
        out.append("_None. Will populate when audit / official_annual sources land._\n")
    else:
        for d in all_divs:
            period = f"{d.year}" if d.month is None else f"{d.year}-{d.month:02d}"
            vals = ", ".join(f"{k}={v:,.2f}" for k, v in d.values.items())
            out.append(
                f"- `{d.metric_code}` / {period}: {vals} "
                f"(abs={d.max_abs_diff:,.4f}, rel={d.max_rel_diff:.2%})"
            )

    # ---- 3. Pending / closed cells ----
    out.append("\n\n## 3. Pending / closed cells\n")
    if not pending_lines:
        out.append("_No pending markers in current sources._\n")
    else:
        out.extend(pending_lines)

    return "\n".join(out) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=None, help="Write markdown to file")
    args = ap.parse_args()

    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

    files = sorted(RAW_DIR.glob("*.xlsx"))
    if not files:
        print(f"No .xlsx files in {RAW_DIR}/", file=sys.stderr)
        return 1

    parsed: list[tuple[Path, ParseResult]] = []
    for f in files:
        r = _dispatch_parser(f)
        if r is None:
            print(f"[skip] {f.name} (no parser)", file=sys.stderr)
            continue
        parsed.append((f, r))

    report = build_report(parsed)

    if args.out:
        args.out.write_text(report, encoding="utf-8")
        print(f"Report written to {args.out}")
    else:
        print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
