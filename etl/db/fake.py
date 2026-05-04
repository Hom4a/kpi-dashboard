"""In-memory ``Repository`` implementation for unit tests.

All state lives in plain dicts. Canonical resolution duplicates the rule
from ``etl/canonical.py``: ``(source_priority DESC, vintage_date DESC)``
wins per ``(entity, period)`` key.

Idempotency is provided naturally: each fact is identified by
``(entity_kind, entity, period, vintage_date, source_priority,
source_file, source_row, value)`` — re-inserting the exact same row is a
no-op (set-deduplicated).
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, replace
from typing import Literal, TypeVar

from etl.models import (
    AnnualValue,
    MonthlyValue,
    ReferenceText,
    SalaryValue,
    SpeciesAnnual,
    SpeciesMonthly,
)

from .interface import Repository, WriteBatch, WriteResult

FactKind = Literal[
    "annual", "monthly", "species_annual", "species_monthly", "reference",
]

# Type aliases for revision keys per kind. Each key is enough to identify
# a single canonical slot in the underlying fact table.
AnnualKey = tuple[Literal["annual"], str, int]                  # (kind, metric, year)
MonthlyKey = tuple[Literal["monthly"], str, int, int]           # (kind, metric, year, month)
SpAnnualKey = tuple[Literal["species_annual"], str, int]
SpMonthlyKey = tuple[Literal["species_monthly"], str, int, int]
ReferenceKey = tuple[Literal["reference"], str, int, int]       # (kind, category, year, month)
RevisionKey = AnnualKey | MonthlyKey | SpAnnualKey | SpMonthlyKey | ReferenceKey


_FactType = TypeVar(
    "_FactType",
    AnnualValue,
    MonthlyValue,
    SpeciesAnnual,
    SpeciesMonthly,
)


@dataclass
class _Revision:
    """One row in the in-memory revisions ledger.

    Mirrors ``fact_revisions`` in shape; we keep the original pydantic
    object alongside lifecycle flags (``is_canonical``, ``superseded_at``).
    """

    kind: FactKind
    key: RevisionKey
    fact: AnnualValue | MonthlyValue | SpeciesAnnual | SpeciesMonthly | ReferenceText
    is_canonical: bool = False
    superseded_at: float | None = None  # monotonic timestamp; None = current


def _annual_key(f: AnnualValue) -> AnnualKey:
    return ("annual", f.metric_code, f.year)


def _monthly_key(f: MonthlyValue) -> MonthlyKey:
    return ("monthly", f.metric_code, f.year, f.month)


def _species_annual_key(f: SpeciesAnnual) -> SpAnnualKey:
    return ("species_annual", f.species, f.year)


def _species_monthly_key(f: SpeciesMonthly) -> SpMonthlyKey:
    return ("species_monthly", f.species, f.year, f.month)


def _reference_key(f: ReferenceText) -> ReferenceKey:
    return ("reference", f.category, f.year, f.month)


def _is_higher(
    candidate: AnnualValue | MonthlyValue | SpeciesAnnual | SpeciesMonthly | ReferenceText,
    current: AnnualValue | MonthlyValue | SpeciesAnnual | SpeciesMonthly | ReferenceText,
) -> bool:
    """``candidate`` outranks ``current`` for canonical purposes.

    Reference rows extend the comparison with ``source_row ASC`` as a
    final tie-breaker (smaller wins) — mirrors ``canonical_reference``
    in etl/canonical.py. For other kinds the source_row component
    collapses harmlessly because their inputs already differ on
    (priority, vintage).
    """
    return (
        candidate.source_priority,
        candidate.vintage_date,
        -candidate.source_row,
    ) > (
        current.source_priority,
        current.vintage_date,
        -current.source_row,
    )


def _fact_signature(
    f: AnnualValue | MonthlyValue | SpeciesAnnual | SpeciesMonthly | ReferenceText,
) -> tuple[object, ...]:
    """Business-identity tuple — used to dedupe identical re-inserts.

    Mirrors the partial unique indexes in
    ``sql/17-fact-revisions-unique-key.sql`` and
    ``sql/18-reference-revisions-unique.sql``:
    ``source_file`` / ``source_row`` are audit metadata only and NOT part
    of identity; re-uploading the same content from a different filename
    is a no-op. ``value_text`` participates for AnnualValue/MonthlyValue
    (KORREKCJIA 2: species do not carry text values). Reference rows use
    ``content`` as their dedupe payload (mirrors sql/18 unique key).
    """
    if isinstance(f, AnnualValue):
        return (
            "annual", f.metric_code, f.year,
            f.value, f.value_text, f.is_ytd,
            f.vintage_date, f.source_priority, f.report_type,
        )
    if isinstance(f, MonthlyValue):
        return (
            "monthly", f.metric_code, f.year, f.month,
            f.value, f.value_text,
            f.vintage_date, f.source_priority, f.report_type,
        )
    if isinstance(f, SpeciesAnnual):
        return (
            "species_annual", f.species, f.year,
            f.volume_km3, f.avg_price_grn,
            f.vintage_date, f.source_priority, f.report_type,
        )
    if isinstance(f, SpeciesMonthly):
        return (
            "species_monthly", f.species, f.year, f.month,
            f.volume_km3, f.avg_price_grn,
            f.vintage_date, f.source_priority, f.report_type,
        )
    return (
        "reference", f.category, f.year, f.month,
        f.content,
        f.vintage_date, f.source_priority, f.report_type,
    )


class FakeRepository(Repository):
    """In-memory implementation suitable for unit tests."""

    def __init__(self) -> None:
        # Append-only revisions ledger.
        self._revisions: list[_Revision] = []
        # Signature set used for idempotent re-inserts.
        self._seen: set[tuple[object, ...]] = set()
        # Monotonic counter — used as ``superseded_at`` proxy.
        self._tick: int = 0
        # Current canonical lookups (read-back side).
        self._canon_annual: dict[tuple[str, int], AnnualValue] = {}
        self._canon_monthly: dict[tuple[str, int, int], MonthlyValue] = {}
        self._canon_sp_annual: dict[tuple[str, int], SpeciesAnnual] = {}
        self._canon_sp_monthly: dict[tuple[str, int, int], SpeciesMonthly] = {}
        self._canon_reference: dict[tuple[str, int, int], ReferenceText] = {}

    # ---- Repository protocol -----------------------------------------

    def write_batch(self, batch: WriteBatch) -> WriteResult:
        rows_to_revisions = 0
        rows_to_canonical = 0
        rows_unchanged = 0
        rows_superseded = 0

        affected_keys: set[RevisionKey] = set()

        for fa in batch.annual:
            if self._append(_annual_key(fa), "annual", fa):
                rows_to_revisions += 1
                affected_keys.add(_annual_key(fa))
        for fm in batch.monthly:
            if self._append(_monthly_key(fm), "monthly", fm):
                rows_to_revisions += 1
                affected_keys.add(_monthly_key(fm))
        for fsa in batch.species_annual:
            if self._append(_species_annual_key(fsa), "species_annual", fsa):
                rows_to_revisions += 1
                affected_keys.add(_species_annual_key(fsa))
        for fsm in batch.species_monthly:
            if self._append(_species_monthly_key(fsm), "species_monthly", fsm):
                rows_to_revisions += 1
                affected_keys.add(_species_monthly_key(fsm))
        for fr in batch.reference:
            if self._append(_reference_key(fr), "reference", fr):
                rows_to_revisions += 1
                affected_keys.add(_reference_key(fr))

        for key in affected_keys:
            applied, superseded = self._reapply_canonical(key)
            if applied:
                rows_to_canonical += 1
                if superseded:
                    rows_superseded += 1
            else:
                rows_unchanged += 1

        return WriteResult(
            batch_id=batch.batch_id,
            rows_to_revisions=rows_to_revisions,
            rows_to_canonical=rows_to_canonical,
            rows_unchanged=rows_unchanged,
            rows_superseded=rows_superseded,
        )

    def get_canonical_annual(
        self, metric_code: str, year: int
    ) -> AnnualValue | None:
        return self._canon_annual.get((metric_code, year))

    def get_canonical_monthly(
        self, metric_code: str, year: int, month: int
    ) -> MonthlyValue | None:
        return self._canon_monthly.get((metric_code, year, month))

    def get_canonical_species_annual(
        self, species: str, year: int
    ) -> SpeciesAnnual | None:
        return self._canon_sp_annual.get((species, year))

    def get_canonical_species_monthly(
        self, species: str, year: int, month: int
    ) -> SpeciesMonthly | None:
        return self._canon_sp_monthly.get((species, year, month))

    def get_canonical_reference(
        self, category: str, year: int, month: int
    ) -> ReferenceText | None:
        return self._canon_reference.get((category, year, month))

    def get_canonical_salary(
        self, branch_name: str, year: int, month: int
    ) -> SalaryValue | None:
        # Stub — real lookup lands in sub-step 5.4.4.c (FakeRepository
        # gains _canon_salary dict + write-path support).
        return None

    def get_revision_history(
        self,
        kind: str,
        entity: str,
        year: int,
        month: int | None = None,
    ) -> list[
        AnnualValue
        | MonthlyValue
        | SpeciesAnnual
        | SpeciesMonthly
        | ReferenceText
        | SalaryValue
    ]:
        valid = (
            "annual", "monthly", "species_annual", "species_monthly", "reference",
        )
        if kind not in valid:
            raise ValueError(f"Unknown kind: {kind!r}")

        def _matches(rev: _Revision) -> bool:
            if rev.kind != kind:
                return False
            f = rev.fact
            if isinstance(f, ReferenceText):
                if f.category != entity or f.year != year:
                    return False
                return not (month is not None and f.month != month)
            if isinstance(f, (AnnualValue, MonthlyValue)):
                if f.metric_code != entity or f.year != year:
                    return False
            else:
                if f.species != entity or f.year != year:
                    return False
            if month is not None:
                # MonthlyValue and SpeciesMonthly carry a .month attribute.
                f_month = getattr(f, "month", None)
                if f_month != month:
                    return False
            return True

        matches = [rev for rev in self._revisions if _matches(rev)]
        matches.sort(key=lambda r: r.fact.vintage_date)
        return [r.fact for r in matches]

    # ---- Internals ----------------------------------------------------

    def _append(
        self,
        key: RevisionKey,
        kind: FactKind,
        fact: AnnualValue | MonthlyValue | SpeciesAnnual | SpeciesMonthly | ReferenceText,
    ) -> bool:
        """Insert revision unless an identical signature already present."""
        sig = _fact_signature(fact)
        if sig in self._seen:
            return False
        self._seen.add(sig)
        self._revisions.append(_Revision(kind=kind, key=key, fact=fact))
        return True

    def _reapply_canonical(self, key: RevisionKey) -> tuple[bool, bool]:
        """Recompute winner for ``key``. Returns (applied, superseded_old_canonical)."""
        candidates = [r for r in self._revisions if r.key == key]
        if not candidates:
            return False, False

        # Pick winner by (priority DESC, vintage DESC)
        winner_rev = candidates[0]
        for rev in candidates[1:]:
            if _is_higher(rev.fact, winner_rev.fact):
                winner_rev = rev

        # Identify previously-canonical (if any) and update flags
        previously_canonical = next((r for r in candidates if r.is_canonical), None)
        applied = False
        superseded = False

        if previously_canonical is not winner_rev:
            applied = True
            if previously_canonical is not None:
                self._tick += 1
                previously_canonical.is_canonical = False
                previously_canonical.superseded_at = float(self._tick)
                superseded = True
            winner_rev.is_canonical = True
            winner_rev.superseded_at = None
            self._set_canonical(key, winner_rev.fact)
        elif previously_canonical is winner_rev and previously_canonical is not None:
            # Same winner — ensure canonical lookups still point to it.
            # (No-op for already-applied state.)
            self._set_canonical(key, winner_rev.fact)

        return applied, superseded

    def _set_canonical(
        self,
        key: RevisionKey,
        fact: AnnualValue | MonthlyValue | SpeciesAnnual | SpeciesMonthly | ReferenceText,
    ) -> None:
        kind = key[0]
        if kind == "annual":
            assert isinstance(fact, AnnualValue)
            self._canon_annual[(fact.metric_code, fact.year)] = fact
        elif kind == "monthly":
            assert isinstance(fact, MonthlyValue)
            self._canon_monthly[
                (fact.metric_code, fact.year, fact.month)
            ] = fact
        elif kind == "species_annual":
            assert isinstance(fact, SpeciesAnnual)
            self._canon_sp_annual[(fact.species, fact.year)] = fact
        elif kind == "species_monthly":
            assert isinstance(fact, SpeciesMonthly)
            self._canon_sp_monthly[
                (fact.species, fact.year, fact.month)
            ] = fact
        elif kind == "reference":
            assert isinstance(fact, ReferenceText)
            self._canon_reference[
                (fact.category, fact.year, fact.month)
            ] = fact

    # ---- Test helpers (not part of Repository ABC) -------------------

    def all_revisions(self) -> Iterable[_Revision]:
        """Yield ledger contents (read-only convenience for tests)."""
        return list(self._revisions)

    def canonical_count(self) -> int:
        return (
            len(self._canon_annual)
            + len(self._canon_monthly)
            + len(self._canon_sp_annual)
            + len(self._canon_sp_monthly)
        )

    # Re-export ``replace`` so tests can build modified fact copies easily.
    @staticmethod
    def replace_fact(
        fact: _FactType, /, **changes: object
    ) -> _FactType:
        """Return a copy of ``fact`` with ``**changes`` applied (pydantic model_copy)."""
        # pydantic.BaseModel.model_copy supports update= kwargs
        return fact.model_copy(update=changes)


__all__ = ["FakeRepository"]


# Keep ``replace`` reachable for future test helpers that may want
# dataclass-style updates of internal revisions; not used in production.
_ = replace
