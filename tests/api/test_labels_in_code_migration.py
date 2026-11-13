"""
Revision l1a2belcode3's data steps: a label the code does not name is deleted
when nothing cites it, and stops the upgrade - naming itself - when something
does. A mode the code does not name is deleted outright, because no account
can be using one.

Runs the shipped revision's own functions against the test session; the suite
has no Alembic harness. Dropping the two tables is the schema half, proved
from zero by tests/api/test_migrations_build_the_schema.py.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "l1a2belcode3_labels_and_modes_in_code.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_labels_in_code", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_frozen_copy_matches_the_code(revision):
    """The revision carries its own copy rather than importing; this keeps the
    two from drifting while the code is the same age as the revision."""
    from app.services.rbac.labels import CONTENT_LABELS
    from app.services.rbac.seed_modes import MODE_ORDER

    assert revision.LABELS == tuple(
        (label.key, label.name, label.description, label.lowest_mode)
        for label in CONTENT_LABELS
    )
    assert revision.MODE_ORDER == MODE_ORDER


def _label(db, key):
    row = models.ContentLabel(system_id=uuid.uuid4(), key=key, label=key)
    db.add(row)
    db.flush()
    return row


def test_an_unknown_label_nothing_cites_is_deleted(db_session, revision):
    _label(db_session, "spoiler")

    revision.remove_unknown_labels(db_session.connection())

    keys = {row.key for row in db_session.query(models.ContentLabel)}
    assert "spoiler" not in keys
    # The mirror: the code's labels are untouched.
    assert "nsfw" in keys


def test_an_unknown_label_still_on_an_entry_stops_the_upgrade(
    db_session, revision, sample_anime
):
    label = _label(db_session, "spoiler")
    db_session.add(
        models.MediaContentLabel(
            media_id=sample_anime.system_id, label_id=label.system_id, position=0
        )
    )
    db_session.flush()

    with pytest.raises(RuntimeError, match="spoiler"):
        revision.remove_unknown_labels(db_session.connection())


def test_an_unknown_mode_nobody_holds_is_deleted(db_session, revision, access_modes):
    db_session.add(models.AccessMode(key="curated", label="Curated", sort_order=5))
    db_session.flush()

    revision.remove_unknown_modes(db_session.connection())

    keys = {row.key for row in db_session.query(models.AccessMode)}
    assert "curated" not in keys
    assert {"safe", "normal", "borderline", "unrestricted"} <= keys


def test_no_account_can_use_an_unknown_mode(db_session, access_modes, admin_user):
    """Why step 3 deletes without checking for holders: the database refuses
    an account whose ceiling names a mode outside the four."""
    db_session.add(models.AccessMode(key="curated", label="Curated", sort_order=5))
    db_session.flush()

    admin_user.mode_ceiling = "curated"
    admin_user.mode_default = "curated"
    with pytest.raises(IntegrityError, match="ck_users_mode_keys"):
        db_session.flush()


def test_write_labels_inserts_a_missing_one_and_rewrites_the_rest(db_session, revision):
    db_session.query(models.ContentLabel).filter(
        models.ContentLabel.key == "ecchi"
    ).delete()
    nsfw = (
        db_session.query(models.ContentLabel)
        .filter(models.ContentLabel.key == "nsfw")
        .one()
    )
    nsfw.label = "renamed"
    db_session.flush()

    revision.write_labels(db_session.connection())
    db_session.expire_all()

    rows = {row.key: row.label for row in db_session.query(models.ContentLabel)}
    assert rows["ecchi"] == "輕微色情"
    assert rows["nsfw"] == "NSFW"
