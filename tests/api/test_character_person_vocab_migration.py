"""
The data half of c3p4photofb5: character and person gender / my_rating
folded onto their closed vocabularies, and the downgrade's way back.

Runs the shipped revision's own `normalize()` and `restore_english_genders()`
against the test session - the suite has no Alembic harness. Rows are stored
straight through the ORM, because the write schemas would refuse the free
text a row from before the revision holds.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = (
    ROOT
    / "alembic"
    / "versions"
    / "c3p4photofb5_character_person_vocab_and_photo_fallback.py"
)

GENDER_CASES = [
    ("Male", "男"),
    (" male ", "男"),
    ("FEMALE", "女"),
    ("女", "女"),
    ("其他", "其他"),
    ("F", None),
    ("Non-binary", None),
    (None, None),
]
RATING_CASES = [("a+", "A+"), (" s ", "S"), ("B", "B"), ("Great", None), (None, None)]


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_vocab_photo_fallback", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _rows(db_session, model, column, values):
    rows = []
    for i, value in enumerate(values):
        row = model(system_id=uuid.uuid4(), name_en=f"Zvornik {column} {i}", **{column: value})
        db_session.add(row)
        rows.append(row)
    db_session.flush()
    return rows


def _reload(db_session, model, rows, column):
    db_session.expire_all()
    return [getattr(db_session.get(model, row.system_id), column) for row in rows]


@pytest.mark.parametrize("model", [models.Character, models.Person])
def test_gender_is_folded_and_the_rest_dropped(db_session, revision, model):
    rows = _rows(db_session, model, "gender", [raw for raw, _ in GENDER_CASES])
    revision.normalize(db_session)
    assert _reload(db_session, model, rows, "gender") == [e for _, e in GENDER_CASES]


@pytest.mark.parametrize("model", [models.Character, models.Person])
def test_my_rating_is_folded_and_the_rest_dropped(db_session, revision, model):
    rows = _rows(db_session, model, "my_rating", [raw for raw, _ in RATING_CASES])
    revision.normalize(db_session)
    assert _reload(db_session, model, rows, "my_rating") == [e for _, e in RATING_CASES]


def test_normalize_is_idempotent(db_session, revision):
    rows = _rows(db_session, models.Character, "gender", ["Male", "F"])
    revision.normalize(db_session)
    revision.normalize(db_session)
    assert _reload(db_session, models.Character, rows, "gender") == ["男", None]


@pytest.mark.parametrize("model", [models.Character, models.Person])
def test_the_downgrade_gives_back_the_english_spellings_only(db_session, revision, model):
    rows = _rows(db_session, model, "gender", ["男", "女", "其他", None])
    revision.restore_english_genders(db_session)
    assert _reload(db_session, model, rows, "gender") == ["Male", "Female", "其他", None]


def test_the_revision_matches_the_app_vocabularies(revision):
    """
    The revision carries its own copy (it must not import app code); this is
    what keeps the copy honest on the day it ships.
    """
    from app.utils.constants import GENDERS, MY_RATINGS

    assert revision.GENDERS == GENDERS
    assert revision.MY_RATINGS == MY_RATINGS
