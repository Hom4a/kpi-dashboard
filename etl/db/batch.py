"""Builder helpers for ``WriteBatch``."""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from etl.models import (
    AnnualValue,
    MonthlyValue,
    ReferenceText,
    SpeciesAnnual,
    SpeciesMonthly,
)

from .interface import WriteBatch


def build_batch_from_canonical(
    *,
    source_file: str,
    vintage_date: datetime,
    annual: list[AnnualValue] | None = None,
    monthly: list[MonthlyValue] | None = None,
    species_annual: list[SpeciesAnnual] | None = None,
    species_monthly: list[SpeciesMonthly] | None = None,
    reference: list[ReferenceText] | None = None,
) -> WriteBatch:
    """Pack canonical-resolution output into a single ``WriteBatch``.

    Each call gets a unique ``batch_id`` (uuid4) — the caller MUST treat
    one ``WriteBatch`` as one transactional unit and reuse the id across
    retries to keep writes idempotent.
    """
    return WriteBatch(
        batch_id=uuid4(),
        source_file=source_file,
        vintage_date=vintage_date,
        annual=list(annual or []),
        monthly=list(monthly or []),
        species_annual=list(species_annual or []),
        species_monthly=list(species_monthly or []),
        reference=list(reference or []),
    )
