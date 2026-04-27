"""Unit tests for ``etl/utils.py`` — primarily ``parse_composite_cell``.

Focus: the partial-cell branch (only one side parseable) introduced in
Step 3 of the value_text rollout. Conservative behaviour — partial cells
produce ``(None, None, "partial_*")`` and emit no fact downstream.
"""
from __future__ import annotations

import pytest

from etl.utils import parse_composite_cell, safe_number

# ---------------------------------------------------------------------
# safe_number — 3-tuple shape
# ---------------------------------------------------------------------

def test_safe_number_pure_numeric() -> None:
    assert safe_number(42.5) == (42.5, None, None)
    assert safe_number(0) == (0.0, None, None)


def test_safe_number_pending_preserves_text() -> None:
    val, warn, raw = safe_number("до 18.04.2026")
    assert val is None
    assert warn == "pending_until"
    assert raw == "до 18.04.2026"


def test_safe_number_closed_preserves_text() -> None:
    val, warn, raw = safe_number("всі філії закриті")
    assert val is None
    assert warn == "closed_or_pending"
    assert raw == "всі філії закриті"


def test_safe_number_empty_marker_no_text() -> None:
    val, warn, raw = safe_number("-")
    assert (val, warn, raw) == (None, "empty_marker", None)


def test_safe_number_unparseable_no_text() -> None:
    val, warn, raw = safe_number("zzz")
    assert val is None
    assert warn == "unparseable"
    assert raw is None


# ---------------------------------------------------------------------
# parse_composite_cell — happy path (regression)
# ---------------------------------------------------------------------

def test_composite_happy_path_slash() -> None:
    vol, price, warn = parse_composite_cell("102/5552")
    assert vol == 102.0
    assert price == 5552.0
    assert warn is None


def test_composite_happy_path_paren() -> None:
    vol, price, warn = parse_composite_cell("360,6(2318,7)")
    assert vol == 360.6
    assert price == pytest.approx(2318.7)
    assert warn is None


def test_composite_footnote_preserved() -> None:
    vol, price, warn = parse_composite_cell("102/5552**")
    assert vol == 102.0
    assert price == 5552.0
    assert warn == "has_footnote"


# ---------------------------------------------------------------------
# Partial-cell cases — Step 3 КОРЕКЦІЯ
# ---------------------------------------------------------------------

def test_composite_partial_one_empty() -> None:
    """One side numeric, the other an empty marker → reject."""
    vol, price, warn = parse_composite_cell("- / 18600")
    assert (vol, price) == (None, None)
    assert warn == "partial_empty"


def test_composite_partial_other_side_empty() -> None:
    vol, price, warn = parse_composite_cell("35 / -")
    assert (vol, price) == (None, None)
    assert warn == "partial_empty"


def test_composite_partial_pending_preserves_text() -> None:
    """One side numeric, the other a pending marker → reject + log raw."""
    vol, price, warn = parse_composite_cell("35 / до 30.04.2026")
    assert (vol, price) == (None, None)
    assert warn is not None
    assert warn.startswith("partial_pending:")
    assert "до 30.04.2026" in warn


def test_composite_partial_unparseable_logs_warn() -> None:
    vol, price, warn = parse_composite_cell("35 / zzz")
    assert (vol, price) == (None, None)
    assert warn is not None
    assert warn.startswith("partial_unparseable:")


def test_composite_both_pending_preserves_text() -> None:
    """Both sides pending → not a partial — collapses to pending_until."""
    vol, price, warn = parse_composite_cell("до 30.04.2026 / до 30.04.2026")
    assert (vol, price) == (None, None)
    assert warn is not None
    assert warn.startswith("pending_until:")


def test_composite_both_empty() -> None:
    vol, price, warn = parse_composite_cell("- / -")
    assert (vol, price) == (None, None)
    assert warn == "empty_marker"


def test_composite_single_value_falls_back() -> None:
    """No separator at all — fall back to single_value."""
    vol, price, warn = parse_composite_cell("42")
    assert vol == 42.0
    assert price is None
    assert warn == "single_value"
