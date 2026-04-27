"""Low-level cell-value parsing utilities.

``safe_number`` — coerces one Excel cell into ``(numeric, warning, raw_text)``.
    ``raw_text`` carries the original string when the warning is one of
    ``pending_until`` / ``closed_or_pending`` (deliberate non-numeric values
    that downstream code surfaces verbatim). For ``empty_marker`` /
    ``has_footnote`` / ``unparseable`` it stays None.

``parse_composite_cell`` — handles timber species cells like ``"360,6/2318,7"``
    or ``"360,6(2318,7)"``. Partial cells (one side parseable, the other
    pending or empty) are rejected — better no-show than half-truth.
"""
from __future__ import annotations

import re
from typing import Any

# Empty-marker tokens that appear in numeric columns (Excel "-", "*", "X", etc.)
_EMPTY_MARKERS: frozenset[str] = frozenset({"-", "—", "*", "X", "х", "x"})

# Free-text markers meaning "data deliberately missing / pending"
_CLOSED_MARKERS: tuple[str, ...] = (
    "всі філії закриті",
    "всі працівники звільнені",
    "після осінньої інвентаризації",
)

_PENDING_RE = re.compile(r"^\s*до\s+.*\d")
# Permissive separator match: ``A / B`` or ``A (B)``. Each side is then
# delegated to ``safe_number`` for classification — that's what produces
# the partial / pending / empty / numeric distinction. Keeping the regex
# loose means we can detect ``35 / до 30.04.2026`` as a composite with a
# pending side, instead of mis-classifying the whole cell as unparseable.
_COMPOSITE_RE = re.compile(
    r"^\s*(.+?)\s*[/(]\s*(.+?)\s*\)?\s*(\*+)?\s*$"
)


def safe_number(x: Any) -> tuple[float | None, str | None, str | None]:
    """Coerce an Excel cell value to ``(numeric, warning, raw_text)``.

    See module docstring for warning token vocabulary.
    ``raw_text`` is non-None only for ``pending_until`` and ``closed_or_pending``.
    """
    # None or empty → silent miss
    if x is None:
        return None, None, None
    if isinstance(x, bool):
        # Excel booleans shouldn't end up in numeric columns; treat as parse failure.
        return None, "unparseable", None
    if isinstance(x, (int, float)):
        return float(x), None, None

    s = str(x).strip()
    if not s:
        return None, None, None

    # Collapse inner whitespace (incl. NBSP)
    s_collapsed = re.sub(r"\s+", " ", s)

    # Raw empty markers
    if s_collapsed in _EMPTY_MARKERS:
        return None, "empty_marker", None

    # "до 18.04.2026" — pending value, preserve original text
    if _PENDING_RE.match(s_collapsed):
        return None, "pending_until", s_collapsed

    # Closed / narrative cells — preserve original text
    low = s_collapsed.casefold()
    if any(marker in low for marker in _CLOSED_MARKERS):
        return None, "closed_or_pending", s_collapsed

    # Footnote suffix "**" (e.g. "-0,25**")
    has_footnote = False
    if s_collapsed.endswith("**"):
        has_footnote = True
        s_collapsed = s_collapsed.rstrip("*").strip()
        if not s_collapsed:
            return None, "has_footnote", None

    # Decimal comma handling:
    #   "1 234,56"      → "1234.56"  (comma only)
    #   "1,234.56"      → leave as-is (EN-locale: thousands sep + decimal point)
    has_comma = "," in s_collapsed
    has_dot = "." in s_collapsed
    if has_comma and not has_dot:
        s_collapsed = s_collapsed.replace(",", ".")
    # Remove spaces between digit groups (thousands separator)
    s_collapsed = s_collapsed.replace(" ", "")

    try:
        val = float(s_collapsed)
    except (ValueError, TypeError):
        return None, "has_footnote" if has_footnote else "unparseable", None

    return val, "has_footnote" if has_footnote else None, None


def parse_composite_cell(x: Any) -> tuple[float | None, float | None, str | None]:
    """Parse a ``"volume/price"`` or ``"volume(price)"`` composite cell.

    Returns ``(volume, price, warning)``. Partial cells where only one side
    is parseable are rejected (returns ``(None, None, "partial_*")``) — better
    no-show than half-truth. The warning embeds the raw text of the
    non-numeric side when relevant (``"partial_pending: до 30.04.2026"``).

    Outcomes:
      - ``(None, None, "empty_marker")``                 blank / dash cells
      - ``(v, None, "single_value")``                    one number, no separator
      - ``(v, p, "has_footnote")``                       cell ended with ``**``
      - ``(v, p, None)``                                 happy path
      - ``(None, None, "partial_empty")``                one side numeric, other empty
      - ``(None, None, "partial_pending: <text>")``      one side numeric, other pending
      - ``(None, None, "partial_closed: <text>")``       one side numeric, other closed
      - ``(None, None, "partial_unparseable: <warn>")``  one side numeric, other unparseable
      - ``(None, None, "pending_until: <text>")``        both sides pending/closed (text preserved)
      - ``(None, None, "closed_or_pending: <text>")``    same, narrative variant
    """
    if x is None:
        return None, None, "empty_marker"
    if isinstance(x, (int, float)):
        # Pure scalar — treat as volume only (no price packed).
        return float(x), None, "single_value"

    s = str(x).strip()
    if not s:
        return None, None, "empty_marker"

    s_collapsed = re.sub(r"\s+", " ", s)
    if s_collapsed in _EMPTY_MARKERS:
        return None, None, "empty_marker"

    m = _COMPOSITE_RE.match(s_collapsed)
    if m is None:
        # Not a composite — try plain number (might be just volume).
        v, warn, _raw = safe_number(x)
        if v is not None:
            return v, None, "single_value"
        return None, None, warn or "unparseable"

    vol_raw, price_raw, footnote = m.group(1), m.group(2), m.group(3)

    vol, vol_warn, vol_text = safe_number(vol_raw)
    price, price_warn, price_text = safe_number(price_raw)

    # Footnote suffix overrides — preserve historical behaviour.
    if footnote:
        return vol, price, "has_footnote"

    vol_ok = vol is not None
    price_ok = price is not None

    # Happy path: both numeric. ``safe_number`` never returns
    # warn="unparseable" together with a non-None value, so no
    # ``unparseable_component`` branch is reachable here.
    if vol_ok and price_ok:
        return vol, price, None

    # Partial path — exactly one side parseable. Reject the row.
    if vol_ok ^ price_ok:
        bad_warn = price_warn if vol_ok else vol_warn
        bad_text = price_text if vol_ok else vol_text
        if bad_warn == "pending_until":
            return None, None, f"partial_pending: {bad_text or '?'}"
        if bad_warn == "closed_or_pending":
            return None, None, f"partial_closed: {bad_text or '?'}"
        if bad_warn == "empty_marker":
            return None, None, "partial_empty"
        return None, None, f"partial_unparseable: {bad_warn or '?'}"

    # Both sides non-numeric — collapse to the most informative warning.
    raw_text = vol_text or price_text or s_collapsed
    if vol_warn == "pending_until" or price_warn == "pending_until":
        return None, None, f"pending_until: {raw_text}"
    if vol_warn == "closed_or_pending" or price_warn == "closed_or_pending":
        return None, None, f"closed_or_pending: {raw_text}"
    return None, None, "empty_marker"
