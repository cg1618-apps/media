"""
The revision that turns the choice graph's edges into branches and links.

Blocks were `start`, `choice`, `scene` or `ending`; `choice` and `scene` both
become `part`. An edge was an arrow with optional `option` text; one with text
becomes a `choice` whose `title` is that text, one without becomes a `link`.

The data half reads the OLD columns, which `create_all` cannot produce, so this
runs the real Alembic chain on a scratch database: up to the parent revision,
plant old-shaped rows, then across the revision under test - the shape of
`test_seasonal_index_drift_repair.py`.

The revision declares `irreversible = True` (choice and scene cannot be told
apart again), so the platform's rollback never runs its downgrade. A human
still can, so the downgrade is exercised here too: it must work on rows that
fit the old shape, and refuse - changing nothing - when a branch leads nowhere.
"""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[2]

REVISION = "g2c3hbranch4"
PARENT_REVISION = "g1c2hgraph3"


def _server_url(database: str) -> str:
    from app.config import settings

    url = sa.engine.url.make_url(settings.sqlalchemy_database_url)
    return url.set(database=database).render_as_string(hide_password=False)


def _alembic(database: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=ROOT,
        env={**os.environ, "POSTGRES_DB": database},
        capture_output=True,
        text=True,
    )


@pytest.fixture
def scratch_database():
    name = f"anime_branch_{uuid.uuid4().hex[:8]}"
    admin = sa.create_engine(_server_url("postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"'))
    except sa.exc.SQLAlchemyError as exc:  # pragma: no cover - environment
        admin.dispose()
        pytest.skip(f"cannot create a scratch database here: {exc}")

    try:
        yield name
    finally:
        with admin.connect() as conn:
            conn.execute(
                text(
                    "select pg_terminate_backend(pid) from pg_stat_activity "
                    "where datname = :n and pid <> pg_backend_pid()"
                ),
                {"n": name},
            )
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
        admin.dispose()


def _version(engine) -> str:
    with engine.connect() as conn:
        return conn.execute(text("select version_num from alembic_version")).scalar()


def _plant_game(conn) -> uuid.UUID:
    game = uuid.uuid4()
    conn.execute(
        text(
            "insert into media (system_id, media_type, public_id, display_name) "
            "values (:id, 'game', 990001, 'Migrated Game')"
        ),
        {"id": game},
    )
    return game


def _node(conn, game, kind, title) -> uuid.UUID:
    node = uuid.uuid4()
    conn.execute(
        text(
            "insert into game_choice_node (system_id, game_id, kind, title) "
            "values (:id, :game, :kind, :title)"
        ),
        {"id": node, "game": game, "kind": kind, "title": title},
    )
    return node


def test_upgrade_maps_the_old_shape_and_downgrade_maps_it_back(scratch_database):
    result = _alembic(scratch_database, "upgrade", PARENT_REVISION)
    assert result.returncode == 0, result.stderr[-2000:]

    engine = sa.create_engine(_server_url(scratch_database))
    try:
        with engine.begin() as conn:
            game = _plant_game(conn)
            start = _node(conn, game, "start", "Prologue")
            fork = _node(conn, game, "choice", "The fork")
            scene = _node(conn, game, "scene", "Rooftop")
            end = _node(conn, game, "ending", "Good End")
            choice_edge, plain_edge = uuid.uuid4(), uuid.uuid4()
            conn.execute(
                text(
                    "insert into game_choice_edge "
                    "(system_id, game_id, from_node_id, to_node_id, option) values "
                    "(:a, :g, :fork, :scene, 'Spare him'), "
                    "(:b, :g, :scene, :end, null)"
                ),
                {
                    "a": choice_edge, "b": plain_edge, "g": game,
                    "fork": fork, "scene": scene, "end": end,
                },
            )

        result = _alembic(scratch_database, "upgrade", REVISION)
        assert result.returncode == 0, result.stderr[-2000:]

        with engine.connect() as conn:
            kinds = dict(
                conn.execute(
                    text("select system_id, kind from game_choice_node")
                ).all()
            )
            edges = {
                row.system_id: row
                for row in conn.execute(
                    text(
                        "select system_id, kind, title, content, to_node_id "
                        "from game_choice_edge"
                    )
                )
            }
        assert kinds == {start: "start", fork: "part", scene: "part", end: "ending"}
        assert (edges[choice_edge].kind, edges[choice_edge].title) == (
            "choice", "Spare him",
        )
        assert edges[choice_edge].to_node_id == scene
        assert edges[choice_edge].content is None
        assert (edges[plain_edge].kind, edges[plain_edge].title) == ("link", None)
        assert edges[plain_edge].to_node_id == end

        # New-shaped rows that still fit the old one: a condition with a
        # description, and a new part.
        with engine.begin() as conn:
            extra_part = _node(conn, game, "part", "Later")
            condition = uuid.uuid4()
            conn.execute(
                text(
                    "insert into game_choice_edge (system_id, game_id, kind, "
                    "from_node_id, to_node_id, title, content) values "
                    "(:c, :g, 'condition', :start, :later, 'Roll a six', 'Dice')"
                ),
                {"c": condition, "g": game, "start": start, "later": extra_part},
            )

        result = _alembic(scratch_database, "downgrade", PARENT_REVISION)
        assert result.returncode == 0, result.stdout[-2000:] + result.stderr[-2000:]
        assert _version(engine) == PARENT_REVISION

        with engine.connect() as conn:
            kinds = dict(
                conn.execute(
                    text("select system_id, kind from game_choice_node")
                ).all()
            )
            options = dict(
                conn.execute(
                    text("select system_id, option from game_choice_edge")
                ).all()
            )
        assert kinds == {
            start: "start", fork: "scene", scene: "scene", end: "ending",
            extra_part: "scene",
        }
        assert options == {
            choice_edge: "Spare him",
            plain_edge: None,
            condition: "Roll a six",
        }

        result = _alembic(scratch_database, "upgrade", "head")
        assert result.returncode == 0, result.stderr[-2000:]
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    "shape, message",
    [("dangling", "lead nowhere"), ("self", "lead back to their own block")],
)
def test_downgrade_refuses_a_branch_the_old_shape_cannot_hold(
    scratch_database, shape, message
):
    """A branch with no next part, or one leading back to its own block, has
    no old-shaped equivalent. The downgrade says so and reverses nothing,
    rather than deleting somebody's branch."""
    result = _alembic(scratch_database, "upgrade", REVISION)
    assert result.returncode == 0, result.stderr[-2000:]

    engine = sa.create_engine(_server_url(scratch_database))
    try:
        with engine.begin() as conn:
            game = _plant_game(conn)
            start = _node(conn, game, "start", "Prologue")
            conn.execute(
                text(
                    "insert into game_choice_edge (system_id, game_id, kind, "
                    "from_node_id, to_node_id, title) "
                    "values (:e, :g, 'choice', :s, :to, 'Ask')"
                ),
                {
                    "e": uuid.uuid4(), "g": game, "s": start,
                    "to": start if shape == "self" else None,
                },
            )

        result = _alembic(scratch_database, "downgrade", PARENT_REVISION)
        assert result.returncode != 0
        assert message in result.stdout + result.stderr
        # Nothing was reversed.
        assert _version(engine) == REVISION
        with engine.connect() as conn:
            assert conn.execute(
                text("select count(*) from game_choice_edge where kind = 'choice'")
            ).scalar() == 1
    finally:
        engine.dispose()
