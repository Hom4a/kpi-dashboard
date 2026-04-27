"""Repository ABC + value objects for the writeback layer.

Concrete implementations: ``FakeRepository`` (tests) and ``PostgresRepository``
(production). Both must honour the same idempotency contract documented on
``Repository.write_batch``.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from etl.models import AnnualValue, MonthlyValue, SpeciesAnnual, SpeciesMonthly


@dataclass(frozen=True)
class WriteBatch:
    """Atomic unit of work — all facts from one source file or one canonical pass.

    A batch may carry any combination of fact kinds; empty lists are allowed
    when a particular kind is not present in the source.
    """

    batch_id: UUID
    source_file: str
    vintage_date: datetime
    annual: list[AnnualValue] = field(default_factory=list)
    monthly: list[MonthlyValue] = field(default_factory=list)
    species_annual: list[SpeciesAnnual] = field(default_factory=list)
    species_monthly: list[SpeciesMonthly] = field(default_factory=list)


@dataclass(frozen=True)
class WriteResult:
    """Outcome after writing a batch."""

    batch_id: UUID
    rows_to_revisions: int
    rows_to_canonical: int
    rows_unchanged: int
    rows_superseded: int
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class Repository(ABC):
    """Abstract write interface for our canonical fact store."""

    @abstractmethod
    def write_batch(self, batch: WriteBatch) -> WriteResult:
        """Persist a batch and update the canonical winner per ``(entity, period)``.

        Behaviour contract (must hold for all implementations):

        1. Append every raw fact in the batch to the revisions ledger
           (``fact_revisions``-equivalent), preserving full history.
        2. For each ``(entity, period)`` touched by the batch, re-evaluate the
           canonical winner across **all** revisions (not just newly inserted)
           by ``(source_priority DESC, vintage_date DESC)``.
        3. UPSERT the new winner into the corresponding fact table
           (``indicator_values`` / ``indicator_volprice_values`` for the
           polymorphic indicator + species cases).
        4. Mark the previously-canonical revision (if displaced) with
           ``is_canonical=False`` and ``superseded_at=now``.

        Idempotency: writing the same ``WriteBatch`` (or any batch carrying
        rows whose value, vintage and priority all match an existing
        canonical) twice MUST result in a no-op for canonical state.
        """

    @abstractmethod
    def get_canonical_annual(
        self, metric_code: str, year: int
    ) -> AnnualValue | None:
        """Read back current canonical annual value (verification helper)."""

    @abstractmethod
    def get_canonical_monthly(
        self, metric_code: str, year: int, month: int
    ) -> MonthlyValue | None:
        """Read back current canonical monthly value."""

    @abstractmethod
    def get_canonical_species_annual(
        self, species: str, year: int
    ) -> SpeciesAnnual | None:
        """Read back current canonical species annual (volume/price)."""

    @abstractmethod
    def get_canonical_species_monthly(
        self, species: str, year: int, month: int
    ) -> SpeciesMonthly | None:
        """Read back current canonical species monthly (volume/price)."""

    @abstractmethod
    def get_revision_history(
        self,
        kind: str,
        entity: str,
        year: int,
        month: int | None = None,
    ) -> list[AnnualValue | MonthlyValue | SpeciesAnnual | SpeciesMonthly]:
        """All historical revisions for an ``(entity, period)``, oldest first.

        ``kind`` is one of: ``annual`` / ``monthly`` / ``species_annual`` /
        ``species_monthly``. ``entity`` is the ``metric_code`` for scalar
        kinds, or the species code for species kinds.
        """
