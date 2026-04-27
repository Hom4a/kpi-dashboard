"""Postgres-backed ``Repository`` (psycopg2).

Constructor takes an externally-managed ``psycopg2.connection`` — the
caller controls transactions / pooling / SSH-tunnel lifecycle. ``write_batch``
runs in a single ``with conn:`` transaction; on any exception the
auto-rollback puts the DB back into a consistent state.

This module is **compile-checked only** in sub-step 5.3.2. Live integration
testing is deferred to 5.3.4.
"""
from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from typing import TYPE_CHECKING, Any
from uuid import UUID

from etl.models import (
    AnnualValue,
    MonthlyValue,
    ReferenceText,
    SpeciesAnnual,
    SpeciesMonthly,
)

from .code_mapper import (
    UnknownMetricError,
    db_to_python,
    python_to_db,
    species_db_to_python,
    species_python_to_db,
)
from .interface import Repository, WriteBatch, WriteResult

if TYPE_CHECKING:
    from psycopg2.extensions import (  # type: ignore[import-untyped]  # noqa: N812
        connection as PgConnection,
    )


class PostgresRepository(Repository):
    """Production write path against on-prem Postgres.

    NOTE: psycopg2 is imported lazily — module-level import would force every
    test (including ``FakeRepository`` ones) to require psycopg2 in the
    environment.
    """

    def __init__(self, conn: PgConnection) -> None:
        # Register psycopg2 UUID adapter at module level (idempotent).
        # Without this, execute_values() in _bulk_insert_revisions cannot
        # bind Python uuid.UUID objects to SQL UUID columns (indicator_id,
        # upload_batch_id, etc.) and raises:
        #   ProgrammingError: can't adapt type 'UUID'
        # Note: registration is GLOBAL to psycopg2 — first Repository
        # instantiation suffices for all downstream code.
        from psycopg2.extras import register_uuid  # type: ignore[import-untyped]
        register_uuid()
        self._conn = conn
        # Per-instance cache so tests can spin up a fresh repo without
        # leaking indicator-id resolutions from a prior run.
        self._resolve_indicator_id_cached = lru_cache(maxsize=256)(
            self._resolve_indicator_id_uncached
        )

    # ----------------------------------------------------------------
    # Repository protocol
    # ----------------------------------------------------------------

    def write_batch(self, batch: WriteBatch) -> WriteResult:
        """Insert all raw facts → recompute canonical → upsert into fact tables.

        Single transaction; rollback on exception.
        """
        warnings: list[str] = []
        rows_to_revisions = 0
        rows_to_canonical = 0
        rows_unchanged = 0
        rows_superseded = 0

        affected: list[tuple[str, UUID, int, int | None]] = []
        # Reference rows are keyed by category (TEXT), not UUID — so they
        # need a parallel ``affected`` list with a different shape and a
        # separate canonical dispatcher (variant B from the plan: keep
        # _reapply_canonical UUID-only, add _reapply_canonical_reference).
        affected_ref: list[tuple[str, int, int]] = []

        # ``with conn`` commits on success / rolls back on exception.
        with self._conn, self._conn.cursor() as cur:
            # --- 1. Bulk insert raw facts into fact_revisions ----
            rev_rows: list[tuple[Any, ...]] = []
            for fa in batch.annual:
                ind_id = self._resolve_indicator_id(python_to_db(fa.metric_code))
                rev_rows.append(self._row_for_annual(fa, ind_id, batch))
                affected.append(("annual", ind_id, fa.year, None))
            for fm in batch.monthly:
                ind_id = self._resolve_indicator_id(python_to_db(fm.metric_code))
                rev_rows.append(self._row_for_monthly(fm, ind_id, batch))
                affected.append(("monthly", ind_id, fm.year, fm.month))
            for fsa in batch.species_annual:
                ind_id = self._resolve_indicator_id(
                    species_python_to_db(fsa.species)
                )
                rev_rows.append(self._row_for_species_annual(fsa, ind_id, batch))
                affected.append(("species_annual", ind_id, fsa.year, None))
            for fsm in batch.species_monthly:
                ind_id = self._resolve_indicator_id(
                    species_python_to_db(fsm.species)
                )
                rev_rows.append(self._row_for_species_monthly(fsm, ind_id, batch))
                affected.append(("species_monthly", ind_id, fsm.year, fsm.month))
            for fr in batch.reference:
                rev_rows.append(self._row_for_reference(fr, batch))
                affected_ref.append((fr.category, fr.year, fr.month))

            if rev_rows:
                rows_to_revisions = self._bulk_insert_revisions(cur, rev_rows)

            # --- 2. Recompute canonical winner per (kind, ind_id, year, month) ---
            seen: set[tuple[str, UUID, int, int | None]] = set()
            for entry in affected:
                if entry in seen:
                    continue
                seen.add(entry)
                kind, ind_id, year, month = entry
                applied, superseded = self._reapply_canonical(
                    cur, kind, ind_id, year, month, batch.batch_id
                )
                if applied:
                    rows_to_canonical += 1
                    if superseded:
                        rows_superseded += 1
                else:
                    rows_unchanged += 1

            # --- 2b. Reference canonical (separate dispatcher) ----
            seen_ref: set[tuple[str, int, int]] = set()
            for ref_entry in affected_ref:
                if ref_entry in seen_ref:
                    continue
                seen_ref.add(ref_entry)
                category, year, month = ref_entry
                applied, superseded = self._reapply_canonical_reference(
                    cur, category, year, month, batch.batch_id
                )
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
            warnings=warnings,
        )

    def get_canonical_annual(
        self, metric_code: str, year: int
    ) -> AnnualValue | None:
        sql = """
            SELECT i.code, iv.period_year,
                   iv.value_numeric, iv.value_text,
                   iv.source_file, iv.source_row,
                   iv.updated_at, iv.uploaded_by
              FROM indicator_values iv
              JOIN indicators i ON i.id = iv.indicator_id
             WHERE i.code = %s
               AND iv.period_year = %s
               AND iv.period_month = 0
             LIMIT 1
        """
        with self._conn.cursor() as cur:
            cur.execute(sql, (python_to_db(metric_code), year))
            row = cur.fetchone()
        # NOTE: indicator_values lacks revision metadata (vintage/priority/
        # report_type). Full revision detail must come via fact_revisions;
        # 5.3.4 will wire this up. ``row`` is intentionally unused here.
        del row
        return None

    def get_canonical_monthly(
        self, metric_code: str, year: int, month: int
    ) -> MonthlyValue | None:
        # Implemented in 5.3.4 once read-back semantics are pinned down.
        return None

    def get_canonical_species_annual(
        self, species: str, year: int
    ) -> SpeciesAnnual | None:
        return None

    def get_canonical_species_monthly(
        self, species: str, year: int, month: int
    ) -> SpeciesMonthly | None:
        return None

    def get_canonical_reference(
        self, category: str, year: int, month: int
    ) -> ReferenceText | None:
        # Read-back implementation deferred to 5.3.4 (mirrors the other
        # get_canonical_* stubs above; production write path is exercised
        # via FakeRepository in unit tests for now).
        return None

    def get_revision_history(
        self,
        kind: str,
        entity: str,
        year: int,
        month: int | None = None,
    ) -> list[AnnualValue | MonthlyValue | SpeciesAnnual | SpeciesMonthly | ReferenceText]:
        # 5.3.4 will implement this against fact_revisions table.
        return []

    # ----------------------------------------------------------------
    # SQL building blocks
    # ----------------------------------------------------------------

    @staticmethod
    def _row_for_annual(
        f: AnnualValue, indicator_id: UUID, batch: WriteBatch
    ) -> tuple[Any, ...]:
        """Tuple matching the column order in ``_INSERT_REVISION_COLS``."""
        return (
            "annual",
            indicator_id, None, None, None,            # branch_id/species_id/category
            f.year, 0,                                  # period_month=0 for annual
            f.value, f.value_text,                      # value_numeric, value_text
            None, None, None, None, None, None, None,   # species/salary/animal slots
            f.vintage_date, f.report_type, f.source_priority,
            f.source_file, f.source_row,
            False,                                      # is_canonical (set later)
            None,                                       # superseded_at
            batch.batch_id,
        )

    @staticmethod
    def _row_for_monthly(
        f: MonthlyValue, indicator_id: UUID, batch: WriteBatch
    ) -> tuple[Any, ...]:
        return (
            "monthly",
            indicator_id, None, None, None,
            f.year, f.month,
            f.value, f.value_text,
            None, None, None, None, None, None, None,
            f.vintage_date, f.report_type, f.source_priority,
            f.source_file, f.source_row,
            False,
            None,
            batch.batch_id,
        )

    @staticmethod
    def _row_for_species_annual(
        f: SpeciesAnnual, indicator_id: UUID, batch: WriteBatch
    ) -> tuple[Any, ...]:
        return (
            "species_annual",
            indicator_id, None, None, None,
            f.year, 0,
            None, None,
            f.volume_km3, f.avg_price_grn,
            None, None, None, None, None,
            f.vintage_date, f.report_type, f.source_priority,
            f.source_file, f.source_row,
            False,
            None,
            batch.batch_id,
        )

    @staticmethod
    def _row_for_species_monthly(
        f: SpeciesMonthly, indicator_id: UUID, batch: WriteBatch
    ) -> tuple[Any, ...]:
        return (
            "species_monthly",
            indicator_id, None, None, None,
            f.year, f.month,
            None, None,
            f.volume_km3, f.avg_price_grn,
            None, None, None, None, None,
            f.vintage_date, f.report_type, f.source_priority,
            f.source_file, f.source_row,
            False,
            None,
            batch.batch_id,
        )

    @staticmethod
    def _row_for_reference(
        f: ReferenceText, batch: WriteBatch
    ) -> tuple[Any, ...]:
        """Tuple matching ``_INSERT_REVISION_COLS`` for a reference revision.

        Reference rows are polymorphic: they reference ``category`` (TEXT)
        instead of an UUID entity (indicator/branch/species). The
        ck_fact_ref_exclusive CHECK in fact_revisions allows exactly one
        of the four reference columns to be non-NULL, so we set
        ``category=f.category`` and leave indicator_id/branch_id/species_id
        as NULL. ``content`` lives in ``value_text``.
        """
        return (
            "reference",
            None, None, None, f.category,            # indicator/branch/species NULL; category set
            f.year, f.month,
            None, f.content,                          # value_numeric NULL; value_text = content
            None, None, None, None, None, None, None, # species/salary/animal slots NULL
            f.vintage_date, f.report_type, f.source_priority,
            f.source_file, f.source_row,
            False,                                    # is_canonical (set later)
            None,                                     # superseded_at
            batch.batch_id,
        )

    _INSERT_REVISION_COLS: tuple[str, ...] = (
        "fact_kind",
        "indicator_id", "branch_id", "species_id", "category",
        "period_year", "period_month",
        "value_numeric", "value_text",
        "volume_km3", "avg_price_grn",
        "salary_uah", "region_avg_uah",
        "population", "limit_qty", "raw_text",
        "vintage_date", "report_type", "source_priority",
        "source_file", "source_row",
        "is_canonical",
        "superseded_at",
        "upload_batch_id",
    )

    @classmethod
    def _bulk_insert_revisions(
        cls, cur: Any, rows: list[tuple[Any, ...]]
    ) -> int:
        """``execute_values`` bulk insert with ``ON CONFLICT DO NOTHING``.

        Returns the number of rows actually inserted (``cur.rowcount``); when
        the same WriteBatch is replayed, duplicate revisions collide on the
        partial unique indexes from migration 17 and are silently skipped.
        """
        from psycopg2.extras import execute_values  # lazy import

        cols = ", ".join(cls._INSERT_REVISION_COLS)
        sql = f"INSERT INTO fact_revisions ({cols}) VALUES %s ON CONFLICT DO NOTHING"
        execute_values(cur, sql, rows, page_size=200)
        return int(cur.rowcount)

    def _reapply_canonical(
        self,
        cur: Any,
        kind: str,
        indicator_id: UUID,
        year: int,
        month: int | None,
        upload_batch_id: UUID,
    ) -> tuple[bool, bool]:
        """Pick winner for an entity-period and UPSERT into the fact table.

        Returns ``(applied, superseded_old_canonical)``.

        ``winner_row`` index map (same shape passed to UPSERT helpers):
            [0] id                   UUID of the winning revision row
            [1] value_numeric        scalar numeric (annual / monthly)
            [2] value_text           scalar text   (annual / monthly)
            [3] volume_km3           species
            [4] avg_price_grn        species
            [5] source_file
            [6] source_row
            [7] vintage_date
            [8] source_priority
            [9] is_canonical         (== prev_was_canonical for this winner)
        """
        # Convention: annual rows live at period_month = 0.
        month_value = 0 if month is None else month

        # Find winner inside fact_revisions.
        # ORDER BY priority DESC first — business hierarchy (accounting_ytd >
        # operational) wins over recency. Vintage and ingested_at are
        # tie-breakers only.
        winner_sql = """
            SELECT id, value_numeric, value_text, volume_km3, avg_price_grn,
                   source_file, source_row, vintage_date,
                   source_priority, is_canonical
              FROM fact_revisions
             WHERE fact_kind = %s
               AND indicator_id = %s
               AND period_year = %s
               AND period_month = %s
             ORDER BY source_priority DESC, vintage_date DESC, ingested_at DESC
             LIMIT 1
        """
        cur.execute(winner_sql, (kind, str(indicator_id), year, month_value))
        winner_row = cur.fetchone()
        if winner_row is None:
            return False, False

        winner_id = winner_row[0]
        prev_was_canonical = winner_row[9]

        # Demote previously-canonical sibling (if any) and elevate the winner.
        cur.execute(
            """
            UPDATE fact_revisions
               SET is_canonical = FALSE,
                   superseded_at = NOW()
             WHERE fact_kind = %s
               AND indicator_id = %s
               AND period_year = %s
               AND period_month = %s
               AND is_canonical = TRUE
               AND id <> %s
            """,
            (kind, str(indicator_id), year, month_value, winner_id),
        )
        superseded = cur.rowcount > 0

        cur.execute(
            "UPDATE fact_revisions SET is_canonical = TRUE, superseded_at = NULL "
            "WHERE id = %s",
            (winner_id,),
        )

        # UPSERT into the appropriate fact table.
        if kind in ("annual", "monthly"):
            self._upsert_indicator_value(
                cur, indicator_id, year, month_value, winner_row, upload_batch_id
            )
        else:  # species_annual / species_monthly
            self._upsert_volprice_value(
                cur, indicator_id, year, month_value, winner_row, upload_batch_id
            )

        applied = (not prev_was_canonical) or superseded
        return applied, superseded

    @staticmethod
    def _upsert_indicator_value(
        cur: Any,
        indicator_id: UUID,
        year: int,
        month: int,
        winner_row: tuple[Any, ...],
        upload_batch_id: UUID,
    ) -> None:
        """UPSERT scalar canonical into ``indicator_values``.

        winner_row layout: see ``_reapply_canonical`` docstring.
            [1]=value_numeric, [2]=value_text, [5]=source_file, [6]=source_row.
        """
        value_numeric = winner_row[1]
        value_text = winner_row[2]
        source_file = winner_row[5]
        source_row = winner_row[6]
        cur.execute(
            """
            INSERT INTO indicator_values
                (indicator_id, period_year, period_month,
                 value_numeric, value_text,
                 source_file, source_row, upload_batch_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (indicator_id, period_year, period_month) DO UPDATE
            SET value_numeric    = EXCLUDED.value_numeric,
                value_text       = EXCLUDED.value_text,
                source_file      = EXCLUDED.source_file,
                source_row       = EXCLUDED.source_row,
                upload_batch_id  = EXCLUDED.upload_batch_id,
                updated_at       = NOW()
            """,
            (
                str(indicator_id), year, month,
                value_numeric, value_text,
                source_file, source_row, str(upload_batch_id),
            ),
        )

    def _reapply_canonical_reference(
        self,
        cur: Any,
        category: str,
        year: int,
        month: int,
        upload_batch_id: UUID,
    ) -> tuple[bool, bool]:
        """Pick winner for a reference (category, year, month) and UPSERT
        it into ``reference_text``. Returns ``(applied, superseded_old)``.

        Separate from ``_reapply_canonical`` because the reference branch
        keys on ``category`` (TEXT) instead of ``indicator_id`` (UUID),
        and the SELECT projects different columns. Variant B from the
        plan — keeps the UUID hot path untouched.

        ``winner_row`` index map for **reference** (do NOT confuse with
        the UUID-entity layout in ``_reapply_canonical``):

            [0] id                UUID of the winning revision row
            [1] category          slug (echoed for sanity)
            [2] value_text        the content payload
            [3] source_file
            [4] source_row
            [5] vintage_date
            [6] source_priority
            [7] is_canonical      (== prev_was_canonical for this winner)
        """
        winner_sql = """
            SELECT id, category, value_text,
                   source_file, source_row, vintage_date,
                   source_priority, is_canonical
              FROM fact_revisions
             WHERE fact_kind = 'reference'
               AND category = %s
               AND period_year = %s
               AND period_month = %s
             ORDER BY source_priority DESC, vintage_date DESC, source_row ASC
             LIMIT 1
        """
        cur.execute(winner_sql, (category, year, month))
        winner_row = cur.fetchone()
        if winner_row is None:
            return False, False

        winner_id = winner_row[0]
        prev_was_canonical = winner_row[7]

        # Demote previously-canonical sibling (if any) and elevate the winner.
        cur.execute(
            """
            UPDATE fact_revisions
               SET is_canonical = FALSE,
                   superseded_at = NOW()
             WHERE fact_kind = 'reference'
               AND category = %s
               AND period_year = %s
               AND period_month = %s
               AND is_canonical = TRUE
               AND id <> %s
            """,
            (category, year, month, winner_id),
        )
        superseded = cur.rowcount > 0

        cur.execute(
            "UPDATE fact_revisions SET is_canonical = TRUE, superseded_at = NULL "
            "WHERE id = %s",
            (winner_id,),
        )

        self._upsert_reference_text(
            cur, category, year, month, winner_row, upload_batch_id
        )

        applied = (not prev_was_canonical) or superseded
        return applied, superseded

    @staticmethod
    def _upsert_reference_text(
        cur: Any,
        category: str,
        year: int,
        month: int,
        winner_row: tuple[Any, ...],
        upload_batch_id: UUID,
    ) -> None:
        """UPSERT reference canonical into ``reference_text``.

        winner_row layout: see ``_reapply_canonical_reference`` docstring.
            [2]=value_text (= content).
        Relies on the existing ``idx_ref_unique`` on
        (period_year, period_month, category) for ON CONFLICT.
        """
        content = winner_row[2]
        cur.execute(
            """
            INSERT INTO reference_text
                (period_year, period_month, category, content, upload_batch_id)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (period_year, period_month, category) DO UPDATE
            SET content         = EXCLUDED.content,
                upload_batch_id = EXCLUDED.upload_batch_id
            """,
            (year, month, category, content, str(upload_batch_id)),
        )

    @staticmethod
    def _upsert_volprice_value(
        cur: Any,
        indicator_id: UUID,
        year: int,
        month: int,
        winner_row: tuple[Any, ...],
        upload_batch_id: UUID,
    ) -> None:
        """UPSERT volprice canonical into ``indicator_volprice_values``.

        winner_row layout: see ``_reapply_canonical`` docstring.
            [3]=volume_km3, [4]=avg_price_grn, [5]=source_file.
        ``raw_text`` is regenerated from volume/price as ``"{vol}/{price}"``;
        NULL when either is missing.
        """
        volume = winner_row[3]
        price = winner_row[4]
        source_file = winner_row[5]
        raw_text: str | None = (
            f"{volume}/{price}" if volume is not None and price is not None else None
        )
        cur.execute(
            """
            INSERT INTO indicator_volprice_values
                (indicator_id, period_year, period_month,
                 volume, price, raw_text,
                 source_file, upload_batch_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (indicator_id, period_year, period_month) DO UPDATE
            SET volume          = EXCLUDED.volume,
                price           = EXCLUDED.price,
                raw_text        = EXCLUDED.raw_text,
                source_file     = EXCLUDED.source_file,
                upload_batch_id = EXCLUDED.upload_batch_id
            """,
            (
                str(indicator_id), year, month,
                volume, price, raw_text,
                source_file, str(upload_batch_id),
            ),
        )

    # ----------------------------------------------------------------
    # Indicator-id resolution (with per-instance LRU cache)
    # ----------------------------------------------------------------

    def _resolve_indicator_id(self, db_code: str) -> UUID:
        return self._resolve_indicator_id_cached(db_code)

    def _resolve_indicator_id_uncached(self, db_code: str) -> UUID:
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM indicators WHERE code = %s LIMIT 1",
                (db_code,),
            )
            row = cur.fetchone()
        if row is None:
            raise UnknownMetricError(
                f"No indicators row for code {db_code!r}. "
                f"Add it to the DB or check the code_mapper."
            )
        return UUID(str(row[0]))


__all__ = ["PostgresRepository"]


# Silence ruff "unused import" for the reverse mappers — they are part of
# the module's public API surface even though the current implementation
# doesn't call them yet.
_unused_db_to_python = db_to_python
_unused_species_db_to_python = species_db_to_python
_unused_datetime = datetime
