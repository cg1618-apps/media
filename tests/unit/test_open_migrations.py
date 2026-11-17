"""
scripts/open_migrations.py: reading a revision file's ids, and reporting two
open pull requests that claim one parent.

The GitHub half is not tested here - it is one `gh` call per file - but the
part that decides what counts as a collision is, because a false "no
collision" is the failure that matters.
"""

import importlib.util
from pathlib import Path

_PATH = Path(__file__).resolve().parents[2] / "scripts" / "open_migrations.py"
_spec = importlib.util.spec_from_file_location("open_migrations", _PATH)
om = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(om)


def test_parses_typed_and_untyped_declarations():
    typed = (
        'revision: str = "r1e2mcatalog3"\n'
        'down_revision: Union[str, Sequence[str], None] = "n1l2inkpairs3"\n'
    )
    untyped = "revision = 'abc'\ndown_revision = 'def'\n"
    assert om.parse_revision(typed) == ("r1e2mcatalog3", "n1l2inkpairs3")
    assert om.parse_revision(untyped) == ("abc", "def")


def test_a_docstring_mention_is_not_the_declaration():
    source = (
        '"""Revises: stale_parent\n\ndown_revision was once "stale_parent"."""\n'
        'revision: str = "new"\n'
        'down_revision: str = "real_parent"\n'
    )
    assert om.parse_revision(source) == ("new", "real_parent")


def _rev(pr, rev, down):
    return om.OpenRevision(pr, f"feat/{pr}", f"alembic/versions/{rev}.py", rev, down)


def test_two_pull_requests_on_one_parent_collide():
    a = _rev(395, "a1n2imanga4", "n1l2inkpairs3")
    b = _rev(396, "r1e2mcatalog3", "n1l2inkpairs3")
    assert om.collisions([a, b]) == {"n1l2inkpairs3": [a, b]}


def test_a_chain_does_not_collide():
    # The mirror of the case above with the same two pull requests: once the
    # second is reparented onto the first, nothing is reported.
    a = _rev(395, "a1n2imanga4", "n1l2inkpairs3")
    b = _rev(396, "r1e2mcatalog3", "a1n2imanga4")
    assert om.collisions([a, b]) == {}


def test_one_pull_request_sharing_a_parent_with_itself_is_not_reported():
    a = _rev(400, "x1", "p")
    b = _rev(400, "x2", "p")
    assert om.collisions([a, b]) == {}
