"""Code-mapper round-trip + unknown-code behaviour."""
from __future__ import annotations

import pytest

from etl.db.code_mapper import (
    CODE_MAP_PYTHON_TO_DB,
    SPECIES_CODE_MAP_PYTHON_TO_DB,
    db_to_python,
    python_to_db,
    species_db_to_python,
    species_python_to_db,
)

# ``etl/metrics.py`` predates migration 15 for these three names. The
# code_mapper bridges to the post-mig15 DB vocabulary; the rest of the
# mapping is identity.
_KNOWN_RENAMES: dict[str, str] = {
    "arrears_budget_mln":  "budget_overdue_mln",
    "arrears_pf_mln":      "pf_overdue_mln",
    "avg_wood_price_grn":  "avg_unit_price_grn",
}


def test_python_to_db_resolves_every_entry() -> None:
    """``python_to_db`` returns the value declared in the map for each key."""
    for py_code, db_code in CODE_MAP_PYTHON_TO_DB.items():
        assert python_to_db(py_code) == db_code


def test_python_to_db_identity_outside_known_renames() -> None:
    """All entries not in ``_KNOWN_RENAMES`` are identity."""
    for py_code, db_code in CODE_MAP_PYTHON_TO_DB.items():
        if py_code in _KNOWN_RENAMES:
            continue
        assert py_code == db_code, (
            f"Identity invariant broken for {py_code!r} → {db_code!r}; "
            f"if you intentionally renamed, add to _KNOWN_RENAMES."
        )


def test_known_renames_match_mapping() -> None:
    """The 3 documented mig15 renames resolve to the expected DB codes."""
    for py_code, expected_db in _KNOWN_RENAMES.items():
        assert python_to_db(py_code) == expected_db
        assert db_to_python(expected_db) == py_code


def test_round_trip_preserves_metric_code() -> None:
    for py_code in CODE_MAP_PYTHON_TO_DB:
        assert db_to_python(python_to_db(py_code)) == py_code


def test_unknown_metric_code_raises_keyerror() -> None:
    with pytest.raises(KeyError, match="Unknown Python metric_code"):
        python_to_db("does_not_exist_mln")


def test_unknown_db_code_raises_keyerror() -> None:
    with pytest.raises(KeyError, match="Unknown DB indicator.code"):
        db_to_python("does_not_exist_db")


def test_species_mapping_known_codes() -> None:
    assert species_python_to_db("alder_birch") == "vp_birch"
    assert species_python_to_db("pine") == "vp_pine"
    assert species_python_to_db("oak") == "vp_oak"
    assert species_python_to_db("other") == "vp_other"


def test_species_round_trip() -> None:
    for py in SPECIES_CODE_MAP_PYTHON_TO_DB:
        assert species_db_to_python(species_python_to_db(py)) == py


def test_unknown_species_raises() -> None:
    with pytest.raises(KeyError, match="Unknown Python species code"):
        species_python_to_db("unicorn")
    with pytest.raises(KeyError, match="Unknown DB species indicator.code"):
        species_db_to_python("vp_unicorn")
