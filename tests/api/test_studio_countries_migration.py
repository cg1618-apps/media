"""
API integration tests for revision s1c2ountries3: a studio's one `country`
becomes a `countries` list, the studio form's saved default follows it, and
a downgrade joins the list back into one value.

Runs the real chain against a private copy of the migrated head: down to the
revision before this one, old-shape rows written, then up and down again. A
revision's own test, deleted once the revision has deployed (docs/testing.md,
"Migration tests").

Requires PostgreSQL. See tests/api/conftest.py.
"""

import json
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

from tests import databases
from tests.api.conftest import run_alembic

ROOT = Path(__file__).resolve().parents[2]
REVISION = "s1c2ountries3"


def _previous() -> str:
    script = ScriptDirectory.from_config(Config(str(ROOT / "alembic.ini")))
    return script.get_revision(REVISION).down_revision


def _run(database, *args):
    result = run_alembic(database, *args)
    assert result.returncode == 0, f"{result.stdout[-2000:]}\n{result.stderr[-2000:]}"


def _execute(database, statements, params=None):
    engine = create_engine(databases.server_url(database))
    try:
        with engine.begin() as conn:
            out = [conn.execute(text(sql), params or {}) for sql in statements]
            return [list(r) if r.returns_rows else None for r in out]
    finally:
        engine.dispose()


def _studio(name, country):
    return (
        "INSERT INTO studio (system_id, name_en, country) "
        f"VALUES (gen_random_uuid(), '{name}', "
        + ("NULL" if country is None else f"'{country}'")
        + ")"
    )


def test_each_country_becomes_a_list_and_comes_back(migrated_head_copy):
    """Blank and unset countries sit beside real ones, so a green says the
    filter turned exactly the real ones into lists."""
    db = migrated_head_copy
    _run(db, "downgrade", _previous())
    _execute(
        db,
        [
            _studio("A", " Japan "),
            _studio("B", "China"),
            _studio("C", ""),
            _studio("D", None),
            "INSERT INTO system_configs (config_key, config_value) VALUES "
            "('form_defaults:studio', :blob)",
        ],
        {
            "blob": json.dumps(
                {"defaults": {"country": "Japan", "remark": "x"}, "autofill": ["country"]}
            )
        },
    )

    _run(db, "upgrade", REVISION)
    rows, (defaults,) = _execute(
        db,
        [
            "SELECT name_en, countries FROM studio ORDER BY name_en",
            "SELECT config_value FROM system_configs WHERE config_key = 'form_defaults:studio'",
        ],
    )
    assert rows == [("A", ["Japan"]), ("B", ["China"]), ("C", None), ("D", None)]
    blob = json.loads(defaults[0])
    assert blob["defaults"] == {"countries": "Japan", "remark": "x"}
    assert blob["autofill"] == ["countries"]

    _execute(db, ["UPDATE studio SET countries = '[\"Japan\", \"China\"]' WHERE name_en = 'A'"])
    _run(db, "downgrade", _previous())
    rows, (defaults,) = _execute(
        db,
        [
            "SELECT name_en, country FROM studio ORDER BY name_en",
            "SELECT config_value FROM system_configs WHERE config_key = 'form_defaults:studio'",
        ],
    )
    assert rows == [("A", "Japan, China"), ("B", "China"), ("C", None), ("D", None)]
    blob = json.loads(defaults[0])
    assert blob["defaults"] == {"country": "Japan", "remark": "x"}
    assert blob["autofill"] == ["country"]
