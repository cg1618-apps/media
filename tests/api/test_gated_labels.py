"""
The gated-type label machinery (app/services/domain/gated_labels.py): a code
label's row found or created by key and kept in step with the code, the
refusals, and the invariant pass Pull and Calculate run.

Every negative assertion here runs with the `h-comic` label present (the
session seeds it, conftest.py) and with at least one row carrying it, so a
"does not carry the label" can fail: the pass had a label to stamp and did
stamp it elsewhere in the same call.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from fastapi import HTTPException

from app import models
from app.services.calculation import run_sync
from app.services.domain import gated_labels
from app.services.domain.content_labels import (
    label_keys_for_entry,
    label_keys_for_franchise,
)
from app.services.pipelines import pull
from app.services.rbac import gated_types
from app.services.rbac.labels import LABEL_KEYS, label_by_key, modes_showing
from app.services.rbac.seed_modes import MODE_UNRESTRICTED

LABEL = "h-comic"


def _label(db, key):
    return db.query(models.ContentLabel).filter_by(key=key).one_or_none()


def _unlabel_entry(db, entry_id):
    db.query(models.MediaContentLabel).filter_by(media_id=entry_id).delete()
    db.flush()


def _unlabel_franchise(db, franchise_id):
    db.query(models.FranchiseContentLabel).filter_by(franchise_id=franchise_id).delete()
    db.flush()


@pytest.fixture
def missing_label(db_session):
    """A code label whose row has been taken out, so ensure_label has
    something to create. `erotica` names no gated type, so no entry the
    session seeded depends on it."""
    key = "erotica"
    db_session.query(models.ContentLabel).filter_by(key=key).delete(
        synchronize_session=False
    )
    db_session.flush()
    assert _label(db_session, key) is None
    return key


# ---------------------------------------------------------------------------
# ensure_label, ensure_labels
# ---------------------------------------------------------------------------


def test_ensure_label_creates_a_missing_code_label(db_session, missing_label):
    label = gated_labels.ensure_label(db_session, missing_label)

    definition = label_by_key(missing_label)
    assert label.key == missing_label
    assert label.label == definition.name
    assert label.description == definition.description
    assert label.sort_order == LABEL_KEYS.index(missing_label)


def test_ensure_label_is_idempotent(db_session, missing_label):
    first = gated_labels.ensure_label(db_session, missing_label)
    second = gated_labels.ensure_label(db_session, missing_label)

    assert first.system_id == second.system_id
    assert db_session.query(models.ContentLabel).filter_by(key=missing_label).count() == 1


def test_ensure_label_adopts_a_row_by_key_and_restores_the_codes_name(db_session):
    """Found by key, so the row - and every assignment citing its uuid - is
    kept; what the row says is the code's, whatever a hand-edit or a Pull
    wrote over it."""
    row = _label(db_session, LABEL)
    row_id = row.system_id
    row.label = "Made by hand"
    row.sort_order = 50
    db_session.flush()

    adopted = gated_labels.ensure_label(db_session, LABEL)

    assert adopted.system_id == row_id
    assert adopted.label == label_by_key(LABEL).name
    assert adopted.sort_order == LABEL_KEYS.index(LABEL)
    assert db_session.query(models.ContentLabel).filter_by(key=LABEL).count() == 1


def test_ensure_label_refuses_a_key_the_code_does_not_name(db_session):
    with pytest.raises(KeyError):
        gated_labels.ensure_label(db_session, "zz-not-a-label")
    assert _label(db_session, "zz-not-a-label") is None


def test_ensure_labels_writes_every_required_label(db_session):
    db_session.query(models.ContentLabel).filter(
        models.ContentLabel.key.in_(tuple(gated_types.required_label_keys()))
    ).delete(synchronize_session=False)
    db_session.flush()

    gated_labels.ensure_labels(db_session)

    for key in gated_types.REQUIRED_LABEL_FOR_TYPE.values():
        assert _label(db_session, key) is not None, key


def test_every_required_label_is_shown_in_unrestricted_alone():
    """A gated type's label is never shown below `unrestricted`: below it, a
    gated entry would be public to a mode that is meant to exclude the type."""
    assert gated_types.REQUIRED_LABEL_FOR_TYPE
    for key in gated_types.REQUIRED_LABEL_FOR_TYPE.values():
        assert modes_showing(key) == (MODE_UNRESTRICTED,), key


# ---------------------------------------------------------------------------
# The refusals
# ---------------------------------------------------------------------------


def test_an_entry_refuses_a_set_without_its_required_label(db_session):
    with pytest.raises(HTTPException) as exc:
        gated_labels.refuse_label_removal_on_entry(db_session, "h-comic", uuid.uuid4(), ["nsfw"])
    assert exc.value.status_code == 422
    assert exc.value.detail == "Every h-comic carries the 'h-comic' label; it cannot be removed."


def test_an_entry_accepts_a_set_that_keeps_its_required_label(db_session):
    gated_labels.refuse_label_removal_on_entry(
        db_session, "h-comic", uuid.uuid4(), [LABEL, "nsfw"]
    )


def test_an_ungated_entry_accepts_any_set(db_session):
    gated_labels.refuse_label_removal_on_entry(db_session, "anime", uuid.uuid4(), [])


def _franchise(db, franchise_type, name):
    franchise = models.Franchise(
        system_id=uuid.uuid4(), franchise_type=franchise_type, franchise_name_en=name
    )
    db.add(franchise)
    db.flush()
    return franchise


def test_a_gated_franchise_refuses_a_set_without_its_label(db_session):
    franchise = _franchise(db_session, "ACG, H-Comic", "Zvornik Gated Franchise")
    with pytest.raises(HTTPException) as exc:
        gated_labels.refuse_label_removal_on_franchise(db_session, franchise.system_id, [])
    assert exc.value.status_code == 422
    assert exc.value.detail == (
        "Every H-Comic franchise carries the 'h-comic' label; it cannot be removed."
    )
    # The mirror: the same franchise, the label kept.
    gated_labels.refuse_label_removal_on_franchise(db_session, franchise.system_id, [LABEL])


def test_an_ungated_franchise_accepts_any_set(db_session):
    franchise = _franchise(db_session, "ACG", "Zvornik Plain Franchise")
    gated_labels.refuse_label_removal_on_franchise(db_session, franchise.system_id, [])


# ---------------------------------------------------------------------------
# The invariant pass
# ---------------------------------------------------------------------------


@pytest.fixture
def unlabelled_rows(db_session, sample_franchise):
    """
    An h-comic and an H-Comic franchise with the label taken off, beside rows
    that must stay unlabelled - and an h-comic that already carries it, so the
    label exists and is attached somewhere before the pass runs.
    """
    gated_franchise = _franchise(db_session, "ACG, H-Comic", "Zvornik Pass Franchise")
    plain_franchise = _franchise(db_session, "ACG", "Zvornik Plain Pass Franchise")
    bare = models.HComic(h_comic_name_cn="Zvornik Bare", region="JP")
    labelled = models.HComic(h_comic_name_cn="Zvornik Labelled", region="JP")
    anime = models.Anime(
        franchise_id=sample_franchise.system_id,
        anime_name_en="Zvornik Plain Anime",
        airing_type="TV",
    )
    db_session.add_all([bare, labelled, anime])
    db_session.flush()
    _unlabel_entry(db_session, bare.system_id)
    _unlabel_franchise(db_session, gated_franchise.system_id)
    gated_labels.ensure_entry_label(db_session, labelled.system_id, LABEL)

    assert label_keys_for_entry(db_session, bare.system_id) == []
    assert label_keys_for_entry(db_session, labelled.system_id) == [LABEL]
    assert label_keys_for_franchise(db_session, gated_franchise.system_id) == []
    return {
        "bare": bare,
        "labelled": labelled,
        "anime": anime,
        "gated_franchise": gated_franchise,
        "plain_franchise": plain_franchise,
    }


def test_the_pass_stamps_the_label_where_it_is_missing_and_nowhere_else(
    db_session, unlabelled_rows
):
    counts = gated_labels.enforce_gated_label_invariants(db_session)

    rows = unlabelled_rows
    assert counts["h-comic"] >= 2
    assert label_keys_for_entry(db_session, rows["bare"].system_id) == [LABEL]
    assert label_keys_for_franchise(db_session, rows["gated_franchise"].system_id) == [LABEL]
    # Idempotent: the entry that carried it still carries it once.
    assert label_keys_for_entry(db_session, rows["labelled"].system_id) == [LABEL]
    # And the rows of no gated type are left alone.
    assert label_keys_for_entry(db_session, rows["anime"].system_id) == []
    assert label_keys_for_franchise(db_session, rows["plain_franchise"].system_id) == []


def test_calculate_runs_the_pass(db_session, unlabelled_rows):
    run_sync(db_session)

    assert label_keys_for_entry(db_session, unlabelled_rows["bare"].system_id) == [LABEL]
    assert label_keys_for_franchise(
        db_session, unlabelled_rows["gated_franchise"].system_id
    ) == [LABEL]


def test_pull_runs_the_pass_after_the_gated_entry_tab_and_the_label_tabs():
    assert "H-Comic" in pull.GATED_LABEL_INVARIANT_TABS
    for tab in ("Franchise", "Content Label", "Media Content Label", "Franchise Content Label"):
        assert tab in pull.GATED_LABEL_INVARIANT_TABS
    assert "Anime" not in pull.GATED_LABEL_INVARIANT_TABS


def test_a_new_gated_type_is_covered_by_its_map_entry_alone(
    db_session, monkeypatch, unlabelled_rows
):
    """What a further gated type relies on: a map entry, and nothing else.
    The entry names an existing code label, because ensure_label writes only
    labels the code defines."""
    new_label = "erotica"
    monkeypatch.setitem(gated_types.REQUIRED_LABEL_FOR_TYPE, "comic", new_label)
    comic = models.Comic(comic_name_en="Zvornik Newly Gated Comic")
    comic_franchise = _franchise(db_session, "Comic", "Zvornik Comic Franchise")
    db_session.add(comic)
    db_session.flush()

    gated_labels.enforce_gated_label_invariants(db_session)

    assert new_label in label_keys_for_entry(db_session, comic.system_id)
    assert new_label in label_keys_for_franchise(db_session, comic_franchise.system_id)
    # The h-comic rows get their own label, not the new one.
    assert label_keys_for_entry(db_session, unlabelled_rows["bare"].system_id) == [LABEL]
