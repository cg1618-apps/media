"""
Every entry or franchise carrying a label other than `nsfw` also carries
`nsfw` - stored, not merely implied - on every write path.

Each test puts a non-`nsfw` label somewhere, so the rule always has something
to enforce; the refusals are checked against a set that genuinely holds
`nsfw` and another label.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain.gated_labels import (
    enforce_gated_label_invariants,
    ensure_entry_label,
    ensure_label,
)
from app.services.domain.label_rules import (
    NSFW,
    add_missing_nsfw,
    with_required_labels,
)


def _entry_keys(db, media_id):
    return {
        key
        for (key,) in db.query(models.ContentLabel.key)
        .join(
            models.MediaContentLabel,
            models.MediaContentLabel.label_id == models.ContentLabel.system_id,
        )
        .filter(models.MediaContentLabel.media_id == media_id)
    }


def _franchise_keys(db, franchise_id):
    return {
        key
        for (key,) in db.query(models.ContentLabel.key)
        .join(
            models.FranchiseContentLabel,
            models.FranchiseContentLabel.label_id == models.ContentLabel.system_id,
        )
        .filter(models.FranchiseContentLabel.franchise_id == franchise_id)
    }


# --- The rule itself ---------------------------------------------------------


def test_any_other_label_brings_nsfw():
    assert with_required_labels({"erotica"}) == {"erotica", NSFW}
    assert with_required_labels({"ecchi", "hentai"}) == {"ecchi", "hentai", NSFW}


def test_nsfw_alone_and_nothing_stay_as_they_are():
    assert with_required_labels({NSFW}) == {NSFW}
    assert with_required_labels(set()) == set()


# --- The label PUT -----------------------------------------------------------


def _put_entry(client, anime, keys):
    return client.put(
        f"/api/content-labels/entry/anime/{anime.system_id}",
        json={"label_keys": keys},
    )


def test_attaching_a_label_attaches_nsfw_in_the_same_write(
    owner_client, db_session, sample_anime
):
    r = _put_entry(owner_client, sample_anime, ["erotica"])

    assert r.status_code == 200, r.text
    assert _entry_keys(db_session, sample_anime.system_id) == {"erotica", NSFW}


def test_dropping_nsfw_while_another_label_stays_is_refused(
    owner_client, db_session, sample_anime
):
    assert _put_entry(owner_client, sample_anime, ["erotica", NSFW]).status_code == 200

    r = _put_entry(owner_client, sample_anime, ["erotica"])

    assert r.status_code == 422
    assert "erotica" in r.json()["detail"]
    # Refused before anything was deleted.
    assert _entry_keys(db_session, sample_anime.system_id) == {"erotica", NSFW}


def test_dropping_every_label_at_once_is_allowed(owner_client, db_session, sample_anime):
    """The mirror: removing nsfw is refused only while something requires it."""
    _put_entry(owner_client, sample_anime, ["erotica", NSFW])

    r = _put_entry(owner_client, sample_anime, [])

    assert r.status_code == 200
    assert _entry_keys(db_session, sample_anime.system_id) == set()


def test_a_franchise_follows_the_same_rule(owner_client, db_session, sample_franchise):
    url = f"/api/content-labels/franchise/{sample_franchise.system_id}"
    assert owner_client.put(url, json={"label_keys": ["ecchi"]}).status_code == 200
    assert _franchise_keys(db_session, sample_franchise.system_id) == {"ecchi", NSFW}

    assert owner_client.put(url, json={"label_keys": ["ecchi"]}).status_code == 422


# --- The gated auto-label ----------------------------------------------------


def test_a_gated_types_label_brings_nsfw(db_session, sample_franchise):
    entry = models.HComic(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        h_comic_name_en="Gated",
    )
    db_session.add(entry)
    db_session.flush()

    ensure_entry_label(db_session, entry.system_id, "h-comic")

    assert _entry_keys(db_session, entry.system_id) == {"h-comic", NSFW}


# --- Pull and Calculate: the invariant pass ----------------------------------


@pytest.fixture
def erotica_without_nsfw(db_session, sample_anime):
    """A row written straight to the table, the way a Pull writes it."""
    label = ensure_label(db_session, "erotica")
    db_session.add(
        models.MediaContentLabel(
            media_id=sample_anime.system_id, label_id=label.system_id, position=0
        )
    )
    db_session.flush()
    return sample_anime


def test_the_invariant_pass_adds_the_missing_nsfw(db_session, erotica_without_nsfw):
    enforce_gated_label_invariants(db_session)

    assert _entry_keys(db_session, erotica_without_nsfw.system_id) == {"erotica", NSFW}


def test_a_franchise_written_without_nsfw_gets_it_too(db_session, sample_franchise):
    label = ensure_label(db_session, "ecchi")
    db_session.add(
        models.FranchiseContentLabel(
            franchise_id=sample_franchise.system_id,
            label_id=label.system_id,
            position=0,
        )
    )
    db_session.flush()

    added = add_missing_nsfw(db_session)

    assert added["franchise"] >= 1
    assert _franchise_keys(db_session, sample_franchise.system_id) == {"ecchi", NSFW}


def test_the_pass_is_idempotent(db_session, erotica_without_nsfw):
    add_missing_nsfw(db_session)
    again = add_missing_nsfw(db_session)

    assert again == {"media": 0, "collection": 0, "franchise": 0, "series": 0}
    assert _entry_keys(db_session, erotica_without_nsfw.system_id) == {"erotica", NSFW}


# --- The migration's backfill ------------------------------------------------


def test_the_revision_backfills_like_the_rule(db_session, erotica_without_nsfw):
    """Runs the shipped revision's own SQL, which is a frozen copy of
    add_missing_nsfw for the two tables that existed then; the two must
    agree, whitespace aside."""
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[2]
        / "alembic"
        / "versions"
        / "n1s2fwrule34_nsfw_rule_backfill.py"
    )
    spec = importlib.util.spec_from_file_location("_nsfw_backfill", path)
    revision = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(revision)

    from app.services.domain import label_rules

    def words(sql):
        return " ".join(sql.split())

    assert set(revision.ADD_MISSING) == {"media", "franchise"}
    for owner, sql in revision.ADD_MISSING.items():
        assert words(sql) == words(label_rules._ADD_MISSING[owner])
    added = revision.backfill(db_session.connection())
    db_session.expire_all()

    assert added["media"] >= 1
    assert _entry_keys(db_session, erotica_without_nsfw.system_id) == {"erotica", NSFW}
