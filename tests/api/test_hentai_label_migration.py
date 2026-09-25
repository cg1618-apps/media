"""
The hentai revision's label steps: adopt a hand-made `hentai` label, keep it
on `unrestricted` alone, and take it off every entry that is not a hentai.

The suite builds its schema with create_all and never runs Alembic, so this
imports the revision by file path and runs its OWN settle_label() against the
test session. Importing it rather than restating the SQL is the point: a test
that restated it would pass while the shipped migration was wrong.

The conftest seeds the label session-wide; each test here first puts the
database into the state the owner's home database was in - the label on an
anime and granted to a second mode - so every removal has something to remove.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models
from app.services.domain.content_labels import label_keys_for_entry

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "h2e3n4t5a6i7_hentai_type.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_hentai_type", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _label(db_session):
    return db_session.query(models.ContentLabel).filter_by(key="hentai").one()


def _attach(db_session, entry, label):
    db_session.add(
        models.MediaContentLabel(media_id=entry.system_id, label_id=label.system_id, position=0)
    )
    db_session.flush()


def test_the_label_leaves_an_anime_and_stays_on_a_hentai(db_session, revision, sample_anime):
    label = _label(db_session)
    hentai = models.Hentai(hentai_name_cn="Zvornik Kept")
    db_session.add(hentai)
    db_session.flush()
    _attach(db_session, sample_anime, label)
    _attach(db_session, hentai, label)
    # Non-empty on both sides before the step runs.
    assert label_keys_for_entry(db_session, sample_anime.system_id) == ["hentai"]
    assert label_keys_for_entry(db_session, hentai.system_id) == ["hentai"]

    revision.settle_label(db_session.connection())
    db_session.expire_all()

    assert label_keys_for_entry(db_session, sample_anime.system_id) == []
    assert label_keys_for_entry(db_session, hentai.system_id) == ["hentai"]


def test_other_labels_on_the_anime_are_left_alone(
    db_session, revision, sample_anime, nsfw_label
):
    _attach(db_session, sample_anime, _label(db_session))
    _attach(db_session, sample_anime, nsfw_label)
    revision.settle_label(db_session.connection())
    db_session.expire_all()
    assert label_keys_for_entry(db_session, sample_anime.system_id) == ["nsfw"]


def test_a_hand_made_label_is_adopted_not_duplicated(db_session, revision):
    before = _label(db_session).system_id
    revision.settle_label(db_session.connection())
    rows = db_session.query(models.ContentLabel).filter_by(key="hentai").all()
    assert [r.system_id for r in rows] == [before]


def test_the_label_is_granted_to_unrestricted_alone(db_session, revision):
    label = _label(db_session)
    borderline = db_session.query(models.AccessMode).filter_by(key="borderline").one()
    db_session.add(
        models.AccessModeLabel(
            system_id=uuid.uuid4(), mode_id=borderline.system_id, label_id=label.system_id
        )
    )
    db_session.flush()

    revision.settle_label(db_session.connection())
    db_session.expire_all()

    granted = {
        mode.key
        for mode, _row in db_session.query(models.AccessMode, models.AccessModeLabel)
        .join(models.AccessModeLabel, models.AccessModeLabel.mode_id == models.AccessMode.system_id)
        .filter(models.AccessModeLabel.label_id == label.system_id)
    }
    assert granted == {"unrestricted"}
