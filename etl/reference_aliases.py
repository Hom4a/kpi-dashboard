"""Alias dictionary for the «Довідково» (reference text) section.

Maps free-text labels from Excel rows to stable slug-categories so that
downstream consumers (UI, dashboards, alerts) can index by category
instead of grepping the original Ukrainian sentence.

Two resolution modes:
    * Top-level — labels that stand on their own (Прожитковий мінімум,
      Мінімальна заробітна плата, Середня заробітна плата по країні).
      They appear directly under the "Довідково:" header without a
      preceding section banner.
    * Section-bullet — labels that are sub-bullets under a section
      header (ЕЛЕКТРОЕНЕРГІЯ:, ГАЗ:, ПММ:, ПРОДУКТИ:). The same prefix
      ("- для населення") means different things in ЕЛЕКТРОЕНЕРГІЯ vs
      ГАЗ, so resolution requires the current section context.

Real-world content text varies year-to-year (numbers change, formatting
drifts: "ЕЛЕКТРОЕНЕРГІЯ" vs "ЕЛЕКТРОЕНЕРГІЯ:"), so we match on
casefolded substrings rather than exact equality.
"""
from __future__ import annotations

import re
from typing import Final, cast


def _norm(text: str) -> str:
    """Casefold + collapse whitespace; mild punctuation cleanup for matching.

    Matching is intentionally permissive — Excel labels swing between
    "ЕЛЕКТРОЕНЕРГІЯ", "ЕЛЕКТРОЕНЕРГІЯ:", "ЕЛЕКТРОЕНЕРГІЯ з ПДВ" across
    years; we want all three to resolve to the same section.
    """
    return re.sub(r"\s+", " ", text.casefold().strip())


# Section-bullet categories (require ``current_section`` context to resolve).
# Top-level categories sit at the top, indexed by header_match only.
REFERENCE_CATEGORIES: Final[dict[str, dict[str, object]]] = {
    # ── Top-level (no section context) ─────────────────────────────────
    "subsistence_minimum": {
        "header_match": ["прожитковий мінімум"],
        "display_name": "Прожитковий мінімум для працездатних осіб",
    },
    "min_wage": {
        "header_match": ["мінімальна заробітна плата"],
        "display_name": "Мінімальна заробітна плата",
    },
    "country_avg_salary": {
        "header_match": [
            "середня заробітна плата в країні",
            "середня заробітна плата країна",
            "середня заробітна плата країні",
            "середня з/п країна",
            "середня з/п в країні",
        ],
        "display_name": "Середня заробітна плата по країні",
    },
    # ── Tariffs (sub-bullets under ЕЛЕКТРОЕНЕРГІЯ / ГАЗ section) ─────
    "electricity_population": {
        "section_header": "електроенергія",
        "bullet_match": ["для населення"],
        "display_name": "Електроенергія — для населення",
    },
    "electricity_business": {
        "section_header": "електроенергія",
        "bullet_match": ["для непобутових споживачів", "непобутових"],
        "display_name": "Електроенергія — для непобутових споживачів",
    },
    "gas_population": {
        "section_header": "газ",
        "bullet_match": ["для населення"],
        "display_name": "Газ — для населення",
    },
    "gas_business": {
        "section_header": "газ",
        "bullet_match": ["для непобутових споживачів", "непобутових"],
        "display_name": "Газ — для непобутових споживачів",
    },
    # ── ПММ (fuel) ────────────────────────────────────────────────────
    "fuel_diesel": {
        "section_header": "пмм",
        "bullet_match": ["дп:", "- дп ", " дп ", "дизельне"],
        "display_name": "Дизельне пальне",
    },
    "fuel_a95": {
        "section_header": "пмм",
        "bullet_match": ["а-95", "а95"],
        "display_name": "Бензин А-95",
    },
    "fuel_a92": {
        "section_header": "пмм",
        "bullet_match": ["а-92", "а92"],
        "display_name": "Бензин А-92",
    },
    # ── Продукти (Держстат) ───────────────────────────────────────────
    "food_bread_rye": {
        "section_header": "продукти",
        "bullet_match": ["хліб житній", "хліб жит"],
        "display_name": "Хліб житній",
    },
    "food_eggs": {
        "section_header": "продукти",
        "bullet_match": ["яйце куряче", "яйц"],
        "display_name": "Яйце куряче",
    },
    "food_pork": {
        "section_header": "продукти",
        "bullet_match": ["м'ясо (свинина)", "м'ясо свинина", "свинина"],
        "display_name": "М'ясо (свинина)",
    },
    "food_lard": {
        "section_header": "продукти",
        "bullet_match": ["сало"],
        "display_name": "Сало",
    },
}


# Section-header normalised keys → list of slugs that live in that section.
# Used by the parser state machine to disambiguate bullets that share a
# prefix (e.g. "- для населення" exists in both ЕЛЕКТРОЕНЕРГІЯ and ГАЗ).
SECTION_HEADERS_MAP: Final[dict[str, list[str]]] = {
    "електроенергія": ["electricity_population", "electricity_business"],
    "газ":            ["gas_population", "gas_business"],
    "пмм":            ["fuel_diesel", "fuel_a95", "fuel_a92"],
    "продукти":       ["food_bread_rye", "food_eggs", "food_pork", "food_lard"],
}


# Top-level slugs (resolved without a section context).
_TOP_LEVEL_SLUGS: Final[tuple[str, ...]] = (
    "subsistence_minimum",
    "min_wage",
    "country_avg_salary",
)


def detect_section_header(label_text: str) -> str | None:
    """Return the normalised section key if ``label_text`` is a section
    header banner (ЕЛЕКТРОЕНЕРГІЯ / ГАЗ / ПММ / ПРОДУКТИ), else None.

    The match is by ``starts-with`` on the normalised text — handles
    trailing colon, "з ПДВ", "(за даними Держстату)" suffixes uniformly.
    """
    norm = _norm(label_text)
    for section_key in SECTION_HEADERS_MAP:
        if norm.startswith(section_key):
            return section_key
    return None


def resolve_reference_category(
    label_text: str, current_section: str | None
) -> str | None:
    """Map an Excel label to a ReferenceText category slug.

    Resolution order:

    1. If ``current_section`` is set, try section-bullet match first —
       look up bullet_match for every slug whose ``section_header`` ==
       current_section, return the first hit.
    2. Try top-level header_match for ``subsistence_minimum`` /
       ``min_wage`` / ``country_avg_salary``.
    3. Return None — the caller emits an "unresolved_reference" warning.
    """
    norm = _norm(label_text)

    if current_section is not None:
        candidate_slugs = SECTION_HEADERS_MAP.get(current_section, [])
        for slug in candidate_slugs:
            entry = REFERENCE_CATEGORIES[slug]
            if entry.get("section_header") != current_section:
                continue
            for needle in cast(list[str], entry.get("bullet_match", [])):
                if needle in norm:
                    return slug

    for slug in _TOP_LEVEL_SLUGS:
        entry = REFERENCE_CATEGORIES[slug]
        for needle in cast(list[str], entry.get("header_match", [])):
            if needle in norm:
                return slug

    return None


__all__ = [
    "REFERENCE_CATEGORIES",
    "SECTION_HEADERS_MAP",
    "detect_section_header",
    "resolve_reference_category",
]
