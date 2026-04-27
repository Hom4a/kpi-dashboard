"""Human-readable diff between parser output and golden YAML.

Usage:
    python -m etl.cli.diff raw_data/Основні_показники_березень_2026_остання.xlsx

Produces lines of the form:
    [OK]   metric_code / period     expected=<e> got=<g>
    [FAIL] metric_code / period     expected=<e> got=<g>
    [MISS] metric_code / period     expected=null got=null (correct!)
    [SURP] metric_code / period     expected=null got=<g> (not in golden)

Exit code: 0 if no FAIL, 1 otherwise.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml

from etl.models import ParseResult
from etl.parser_osnovni import parse_osnovni_annual


def _period_spec(key: str) -> tuple[int, int | None, bool]:
    if key.startswith("y") and key.endswith("_ytd"):
        return int(key[1:5]), None, True
    if key.startswith("y"):
        return int(key[1:5]), None, False
    if key == "march_2026":
        return 2026, 3, False
    raise ValueError(f"unknown period key: {key}")


def _fmt_period(year: int, month: int | None, is_ytd: bool) -> str:
    if month is not None:
        return f"{year}-{month:02d}"
    if is_ytd:
        return f"{year}_ytd"
    return str(year)


def _fmt(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, float):
        s = f"{v:.10g}"
        return s
    return str(v)


def _approx_equal(a: float, b: float, rel: float = 1e-9) -> bool:
    if a == b:
        return True
    return abs(a - b) <= rel * max(abs(a), abs(b))


def _indexes(
    r: ParseResult,
) -> tuple[
    dict[tuple[str, int, bool], float | None],
    dict[tuple[str, int, int], float | None],
    dict[tuple[str, int], tuple[float | None, float | None]],
    dict[tuple[str, int, int], tuple[float | None, float | None]],
]:
    ann = {(a.metric_code, a.year, a.is_ytd): a.value for a in r.annual}
    mon = {(m.metric_code, m.year, m.month): m.value for m in r.monthly}
    sp_ann = {
        (s.species, s.year): (s.volume_km3, s.avg_price_grn) for s in r.species_annual
    }
    sp_mon = {
        (s.species, s.year, s.month): (s.volume_km3, s.avg_price_grn)
        for s in r.species_monthly
    }
    return ann, mon, sp_ann, sp_mon


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", help="Path to Excel file")
    ap.add_argument(
        "--golden",
        default="tests/golden/osnovni_bereznen_2026.yml",
        help="Path to golden YAML",
    )
    args = ap.parse_args()

    xlsx = Path(args.xlsx)
    golden_path = Path(args.golden)

    if sys.stdout.encoding.lower() != "utf-8":
        # Ensure Cyrillic prints cleanly on Windows consoles
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

    with golden_path.open(encoding="utf-8") as f:
        golden = yaml.safe_load(f)

    result = parse_osnovni_annual(xlsx)
    ann, mon, sp_ann, sp_mon = _indexes(result)

    print(f"=== DIFF REPORT: {xlsx.name} ===\n")

    ok = fail = miss_ok = surprise = 0

    def compare(label: str, expected: Any, got: Any) -> None:
        nonlocal ok, fail, miss_ok, surprise
        lhs = f"{label:50}"
        if expected is None:
            if got is None:
                print(f"[MISS] {lhs} expected=null              got=null (correct!)")
                miss_ok += 1
            else:
                print(f"[SURP] {lhs} expected=null              got={_fmt(got):16} (у golden не було)")
                surprise += 1
        elif got is None:
            print(f"[FAIL] {lhs} expected={_fmt(expected):16} got=null")
            fail += 1
        elif _approx_equal(float(expected), float(got)):
            print(f"[OK]   {lhs} expected={_fmt(expected):16} got={_fmt(got)}")
            ok += 1
        else:
            print(f"[FAIL] {lhs} expected={_fmt(expected):16} got={_fmt(got)}")
            fail += 1

    # Operational + taxes
    for section in ("operational", "taxes"):
        for metric_code, periods in golden[section].items():
            for period_key, expected in periods.items():
                year, month, is_ytd = _period_spec(period_key)
                got = (
                    mon.get((metric_code, year, month))
                    if month is not None
                    else ann.get((metric_code, year, is_ytd))
                )
                compare(f"{metric_code} / {_fmt_period(year, month, is_ytd)}", expected, got)

    # Species
    for species_code, periods in golden["species"].items():
        for period_key, expected_pair in periods.items():
            year, month, is_ytd = _period_spec(period_key)
            pair = (
                sp_mon.get((species_code, year, month))
                if month is not None
                else sp_ann.get((species_code, year))
            )
            got_vol, got_price = pair if pair is not None else (None, None)
            compare(
                f"{species_code}.volume_km3 / {_fmt_period(year, month, is_ytd)}",
                expected_pair.get("volume_km3"),
                got_vol,
            )
            compare(
                f"{species_code}.avg_price_grn / {_fmt_period(year, month, is_ytd)}",
                expected_pair.get("avg_price_grn"),
                got_price,
            )

    print()
    print(
        f"Summary: {ok} OK | {fail} FAIL | {miss_ok} MISS-OK | "
        f"{surprise} SURPRISE | {len(result.warnings)} warnings"
    )
    if result.warnings:
        print("\nWarnings:")
        for w in result.warnings[:30]:
            print(f"  {w}")
        if len(result.warnings) > 30:
            print(f"  ... +{len(result.warnings) - 30} more")

    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
