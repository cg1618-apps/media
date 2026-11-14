"""
The o1r2iginal35 revision: originality 原創 becomes 原版 on h_comic and hentai,
and in the two types' stored Add-form defaults; the stored auto-fill lists
gain the links that became auto-fillable. The downgrade reverses both.

The suite builds its schema with create_all and never runs Alembic, so this
imports the revision by file path and runs its OWN functions against the test
session. `pre_revision` writes the state from before the revision - entries
holding 原創, defaults naming it, stored auto-fill lists without the links -
so each step has something to do. The 同人 rows are what prove the rename is
of one value and not of the column.
"""

import importlib.util
import json
from pathlib import Path

import pytest

from app import models
from app.utils import constants as c

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "o1r2iginal35_originality_yuanban.py"
HCOMIC_KEY = "form_defaults:h-comic"
HENTAI_KEY = "form_defaults:hentai"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_originality_rename", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _blob(db, key):
    row = db.query(models.SystemConfigs).filter_by(config_key=key).one()
    db.refresh(row)
    return json.loads(row.config_value)


def _originalities(db, model):
    db.expire_all()
    return sorted(e.originality for e in db.query(model).all())


@pytest.fixture
def pre_revision(db_session):
    db = db_session
    db.add_all(
        [
            models.HComic(h_comic_name_cn="原創 comic", region="JP", originality="原創"),
            models.HComic(h_comic_name_cn="同人 comic", region="JP", originality="同人"),
            models.Hentai(hentai_name_cn="原創 hentai", originality="原創"),
            models.Hentai(hentai_name_cn="同人 hentai", originality="同人"),
            models.SystemConfigs(
                config_key=HCOMIC_KEY,
                config_value=json.dumps(
                    {"defaults": {"originality": "原創"}, "autofill": ["region"]},
                    ensure_ascii=False,
                ),
            ),
            # A stored list that already names one link: it is not duplicated.
            models.SystemConfigs(
                config_key=HENTAI_KEY,
                config_value=json.dumps(
                    {
                        "defaults": {"originality": "原創"},
                        "autofill": ["studio", "mal_link"],
                    },
                    ensure_ascii=False,
                ),
            ),
        ]
    )
    db.flush()
    return db


def test_the_frozen_values_match_the_vocabulary(revision):
    assert revision.NEW in c.H_COMIC_ORIGINALITY
    assert revision.OLD not in c.H_COMIC_ORIGINALITY


def test_upgrade_renames_the_value_in_both_tables_and_leaves_the_other(
    revision, pre_revision
):
    db = pre_revision
    assert _originalities(db, models.HComic) == ["原創", "同人"]
    revision.apply_upgrade(db.connection())
    assert _originalities(db, models.HComic) == ["原版", "同人"]
    assert _originalities(db, models.Hentai) == ["原版", "同人"]


def test_upgrade_rewrites_the_stored_defaults_and_adds_the_links(revision, pre_revision):
    db = pre_revision
    revision.apply_upgrade(db.connection())
    hcomic = _blob(db, HCOMIC_KEY)
    hentai = _blob(db, HENTAI_KEY)
    assert hcomic["defaults"]["originality"] == "原版"
    assert hcomic["autofill"] == ["region", "mal_link"]
    assert hentai["defaults"]["originality"] == "原版"
    assert hentai["autofill"] == ["studio", "mal_link", "anidb_link"]


def test_upgrade_leaves_an_unconfigured_autofill_list_unconfigured(revision, db_session):
    """Null means the built-in set, which already carries the links."""
    db_session.add(
        models.SystemConfigs(
            config_key=HENTAI_KEY,
            config_value=json.dumps({"defaults": {}, "autofill": None}),
        )
    )
    db_session.flush()
    revision.apply_upgrade(db_session.connection())
    assert _blob(db_session, HENTAI_KEY)["autofill"] is None


def test_upgrade_is_idempotent(revision, pre_revision):
    db = pre_revision
    revision.apply_upgrade(db.connection())
    revision.apply_upgrade(db.connection())
    assert _blob(db, HENTAI_KEY)["autofill"] == ["studio", "mal_link", "anidb_link"]
    assert _originalities(db, models.Hentai) == ["原版", "同人"]


def test_downgrade_restores_the_old_value_and_drops_the_links(revision, pre_revision):
    db = pre_revision
    revision.apply_upgrade(db.connection())
    revision.apply_downgrade(db.connection())
    assert _originalities(db, models.HComic) == ["原創", "同人"]
    assert _originalities(db, models.Hentai) == ["原創", "同人"]
    hcomic = _blob(db, HCOMIC_KEY)
    hentai = _blob(db, HENTAI_KEY)
    assert hcomic == {"defaults": {"originality": "原創"}, "autofill": ["region"]}
    assert hentai == {"defaults": {"originality": "原創"}, "autofill": ["studio"]}
