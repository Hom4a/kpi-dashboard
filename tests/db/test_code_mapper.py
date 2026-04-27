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


def test_python_to_db_identity_for_all_known_codes() -> None:
    """Post-migration-15 mapping is identity for every Python code."""
    for py_code, db_code in CODE_MAP_PYTHON_TO_DB.items():
        assert python_to_db(py_code) == db_code
        assert py_code == db_code, (
            f"Identity invariant broken for {py_code!r} → {db_code!r}; "
            f"if you changed the DB schema, sync the mapping."
        )


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
