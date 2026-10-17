"""
API integration tests for the revision that removes the Quality 品質 tag.

Every media_tag row under `quality` and every `Quality` system_option go; the
tags and options of every other field and category must survive.

Runs the shipped revision's own `remove_quality()` against the test session -
the suite has no Alembic harness.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "q1u2alityrm3_remove_quality_tag.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_remove_quality", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _option(db, category, value, scope="anime"):
    opt = models.SystemOption(category=category, value=value)
    opt.scopes = [models.SystemOptionScope(scope=scope)]
    db.add(opt)
    db.flush()
    return opt


def _tag(db, anime, field, option):
    db.add(models.MediaTag(media_id=anime.system_id, field=field, option_id=option.system_id))
    db.flush()


def test_removes_quality_tags_and_values_and_nothing_else(db_session, revision):
    anime = models.Anime(anime_name_cn="品質")
    db_session.add(anime)
    db_session.flush()

    quality = _option(db_session, "Quality", "作畫崩壞")
    label = _option(db_session, "Label", "會跳OP")
    _tag(db_session, anime, "quality", quality)
    # The mirror case: a tag and an option of another field, which must
    # survive - so an empty result proves the delete was narrow, not total.
    _tag(db_session, anime, "label", label)
    db_session.commit()
    quality_id = quality.system_id

    revision.remove_quality(db_session.connection())
    db_session.commit()
    db_session.expire_all()

    fields = [t.field for t in db_session.query(models.MediaTag).filter_by(media_id=anime.system_id)]
    assert fields == ["label"]
    categories = {o.category for o in db_session.query(models.SystemOption)}
    assert "Quality" not in categories
    assert "Label" in categories
    # The scope row went with its option (ON DELETE CASCADE).
    assert (
        db_session.query(models.SystemOptionScope)
        .filter_by(option_id=quality_id)
        .count()
        == 0
    )


def test_declares_itself_irreversible(revision):
    """deploy/migrations refuses to downgrade past a revision that says so."""
    assert revision.irreversible is True
