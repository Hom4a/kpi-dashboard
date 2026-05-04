"""Map verbatim Excel species names to ``animal_species.id`` UUIDs.

Mirror of ``branch_resolver.py`` for animal species. Excel uses both
abbreviated forms (``"Олень благор."`` with trailing dot) and full
forms (``"Олень благородний"``). Both resolve to the same canonical
``animal_species.id`` through ``animal_species_aliases``.

DB-side, ``animal_species_aliases.alias_normalized`` is auto-populated
from ``alias_raw`` by trigger ``tr_species_alias_normalize``, which
calls the SAME ``fn_normalize_indicator_name`` function used for
salary branches. Therefore Python-side normalize logic is shared:
this module imports ``_normalize_branch_name`` from ``branch_resolver``
and re-exports it under ``_normalize_species_name`` for clarity at
call sites.

If the DB function ever changes, update ``branch_resolver.py`` — both
resolvers will benefit. The shared 27 + 6 species parametrized
parity tests cover both surface areas.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from .branch_resolver import _normalize_branch_name as _normalize_species_name


def resolve_species_id(cur: Any, species_name: str) -> UUID | None:
    """Look up ``animal_species.id`` for a verbatim Excel species name.

    Normalizes via the shared DB regex mirror from ``branch_resolver``,
    then SELECTs from ``animal_species_aliases`` where
    ``alias_normalized`` matches.

    Returns ``None`` when no alias matches — callers must warn and
    skip the animal row (variant 3 design: closed 6-species set,
    manually extended via SQL when reorganization happens).

    ``cur`` is a psycopg2 cursor (typed as ``Any`` to avoid hard
    import — keeps the resolver testable without a live DB).
    """
    norm = _normalize_species_name(species_name)
    cur.execute(
        "SELECT species_id FROM animal_species_aliases WHERE alias_normalized = %s",
        (norm,),
    )
    row = cur.fetchone()
    return UUID(str(row[0])) if row else None


__all__ = ["_normalize_species_name", "resolve_species_id"]
