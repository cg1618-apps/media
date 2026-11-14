"""
A content label and its 標籤 Label tag, kept in step on an entry, both ways
(app/services/domain/label_tags.py).

  label write   PUT /api/content-labels/entry/...  -> the tags follow
  tag write     PUT /api/credits/...               -> the labels follow
  Pull          reconcile_label_tags, the label winning

A tag write changes who can see the entry, so the visibility tests pair the
refusal (`narrow`, in `safe`, sees no label) with its mirror (`owner_client`,
`unrestricted`, sees every label) on the same entry.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models
from app.services.domain.credits import replace_tags, resolve_option, tag_values
from app.services.domain.label_tags import (
    LABEL_FIELD_TYPES,
    reconcile_label_tags,
    write_entry_labels,
)
from app.services.pipelines.pull import LABEL_TAG_RECONCILE_TABS


def _labels(client, entry):
    return client.get(f"/api/content-labels/entry/anime/{entry.system_id}").json()


def _tags(client, entry):
    body = client.get(f"/api/credits/anime/{entry.system_id}").json()
    return body["tags"].get("label", [])


def _put_tags(client, entry, values):
    return client.put(
        f"/api/credits/anime/{entry.system_id}", json={"tags": {"label": values}}
    )


def _put_labels(client, entry, keys):
    return client.put(
        f"/api/content-labels/entry/anime/{entry.system_id}",
        json={"label_keys": keys},
    )


@pytest.fixture
def narrow(catalog_writer):
    return catalog_writer(username="narrowtags", label_keys=())


@pytest.fixture
def sample_hentai(db_session, sample_franchise):
    entry = models.Hentai(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        hentai_name_cn="標籤測試",
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def tagged_anime(db_session, sample_anime):
    """sample_anime carrying an ordinary Label tag, which must survive."""
    replace_tags(db_session, sample_anime.system_id, "label", ["會跳OP"])
    db_session.flush()
    return sample_anime


# ---------------------------------------------------------------------------
# A label write brings its tag
# ---------------------------------------------------------------------------


def test_attaching_a_label_adds_its_tag_and_nsfws(owner_client, tagged_anime):
    assert _put_labels(owner_client, tagged_anime, ["ecchi"]).status_code == 200

    assert _tags(owner_client, tagged_anime) == ["會跳OP", "NSFW", "輕微色情"]


def test_detaching_a_label_removes_its_tag_only(owner_client, tagged_anime):
    _put_labels(owner_client, tagged_anime, ["erotica"])

    assert _put_labels(owner_client, tagged_anime, []).status_code == 200

    assert _tags(owner_client, tagged_anime) == ["會跳OP"]


def test_a_label_without_a_tag_adds_none(db_session, owner_client, sample_hentai):
    """A gated type has no Label field: its label write touches no tag."""
    res = owner_client.put(
        f"/api/content-labels/entry/hentai/{sample_hentai.system_id}",
        json={"label_keys": ["hentai"]},
    )
    assert res.status_code == 200, res.text
    assert tag_values(db_session, sample_hentai.system_id, "label") == []


# ---------------------------------------------------------------------------
# A tag write brings its label - and changes who sees the entry
# ---------------------------------------------------------------------------


def test_adding_a_tag_attaches_its_label_and_nsfw(owner_client, tagged_anime):
    res = _put_tags(owner_client, tagged_anime, ["會跳OP", "輕微色情"])

    assert res.status_code == 200, res.text
    assert _labels(owner_client, tagged_anime) == ["ecchi", "nsfw"]
    # The nsfw rule's label brought its tag back with it.
    assert _tags(owner_client, tagged_anime) == ["會跳OP", "輕微色情", "NSFW"]


def test_a_tag_edit_hides_the_entry(narrow, owner_client, tagged_anime):
    path = f"/api/anime/{tagged_anime.public_id}"
    assert narrow.get(path).status_code == 200

    _put_tags(owner_client, tagged_anime, ["擦邊肉番"])

    assert narrow.get(path).status_code == 404
    # The mirror: a mode showing erotica still sees it.
    assert owner_client.get(path).status_code == 200


def test_removing_a_tag_detaches_its_label(owner_client, tagged_anime):
    _put_labels(owner_client, tagged_anime, ["erotica"])

    res = _put_tags(owner_client, tagged_anime, ["會跳OP", "NSFW"])

    assert res.status_code == 200, res.text
    assert _labels(owner_client, tagged_anime) == ["nsfw"]


def test_removing_the_nsfw_tag_while_another_stays_is_refused(
    owner_client, tagged_anime
):
    _put_labels(owner_client, tagged_anime, ["ecchi"])

    res = _put_tags(owner_client, tagged_anime, ["會跳OP", "輕微色情"])

    assert res.status_code == 422
    assert "NSFW" in res.json()["detail"]
    # Nothing moved.
    assert _labels(owner_client, tagged_anime) == ["ecchi", "nsfw"]
    assert _tags(owner_client, tagged_anime) == ["會跳OP", "NSFW", "輕微色情"]


def test_removing_every_label_tag_clears_the_labels(owner_client, tagged_anime):
    _put_labels(owner_client, tagged_anime, ["ecchi"])

    res = _put_tags(owner_client, tagged_anime, ["會跳OP"])

    assert res.status_code == 200, res.text
    assert _labels(owner_client, tagged_anime) == []


def test_a_narrow_editor_cannot_tag_what_it_cannot_see(
    narrow, owner_client, tagged_anime
):
    """The tag write is gated on the entry like the label write is, or a
    tag edit would be a way round the label's 404."""
    _put_labels(owner_client, tagged_anime, ["erotica"])

    assert _put_tags(narrow, tagged_anime, ["會跳OP"]).status_code == 404
    assert _labels(owner_client, tagged_anime) == ["erotica", "nsfw"]


# ---------------------------------------------------------------------------
# Pull: the label wins
# ---------------------------------------------------------------------------


def test_reconcile_adds_a_missing_tag_and_drops_an_unbacked_one(
    db_session, tagged_anime
):
    write_entry_labels(db_session, tagged_anime.system_id, ["erotica", "nsfw"])
    replace_tags(
        db_session, tagged_anime.system_id, "label", ["會跳OP", "輕微色情"]
    )
    db_session.flush()

    counts = reconcile_label_tags(db_session)

    assert counts["removed"] >= 1 and counts["added"] >= 2
    assert set(tag_values(db_session, tagged_anime.system_id, "label")) == {
        "會跳OP",
        "NSFW",
        "擦邊肉番",
    }
    # Idempotent.
    assert reconcile_label_tags(db_session) == {"added": 0, "removed": 0}


def test_pull_reconciles_after_the_tabs_that_restore_either_side():
    assert "Media Content Label" in LABEL_TAG_RECONCILE_TABS
    assert "Anime" in LABEL_TAG_RECONCILE_TABS
    # The mirror: a gated type's tab has no Label field to reconcile.
    assert "Hentai" not in LABEL_TAG_RECONCILE_TABS
    assert "hentai" not in LABEL_FIELD_TYPES


# ---------------------------------------------------------------------------
# The migration
# ---------------------------------------------------------------------------

REVISION = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "t1a2gsync345_label_tags_in_step.py"
)


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_label_tags_rev", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_frozen_copy_matches_the_code(revision):
    from app.services.domain.label_tags import TAG_FOR_LABEL

    assert dict(revision.TAGS) == TAG_FOR_LABEL
    assert revision.LABEL_FIELD_TYPES == LABEL_FIELD_TYPES


def test_the_old_tag_is_renamed(db_session, revision):
    db_session.query(models.SystemOption).filter(
        models.SystemOption.category == "Label",
        models.SystemOption.value == "擦邊肉番",
    ).delete()
    db_session.add(
        models.SystemOption(system_id=uuid.uuid4(), category="Label", value="肉番")
    )
    db_session.flush()

    revision.rename_old_tag(db_session.connection())
    db_session.expire_all()

    values = {
        v for (v,) in db_session.query(models.SystemOption.value).filter(
            models.SystemOption.category == "Label"
        )
    }
    assert "擦邊肉番" in values
    assert "肉番" not in values


def test_the_backfill_keeps_both_sides(db_session, revision, sample_anime, sample_manga):
    """The union: a tag brings its label, a label brings its tag."""
    options = revision.ensure_options(db_session.connection())
    # sample_anime: the tag alone. sample_manga: the label alone.
    replace_tags(db_session, sample_anime.system_id, "label", ["擦邊肉番"])
    write_entry_labels(db_session, sample_manga.system_id, ["ecchi", "nsfw"])
    db_session.flush()

    revision.backfill(db_session.connection(), options)
    db_session.expire_all()

    anime_labels = {
        key
        for (key,) in db_session.query(models.ContentLabel.key)
        .join(models.MediaContentLabel)
        .filter(models.MediaContentLabel.media_id == sample_anime.system_id)
    }
    assert anime_labels == {"erotica", "nsfw"}
    assert set(tag_values(db_session, sample_manga.system_id, "label")) == {
        "NSFW",
        "輕微色情",
    }


def test_the_three_tags_are_scoped_to_every_label_field_type(db_session, revision):
    revision.ensure_options(db_session.connection())
    for value in ("NSFW", "輕微色情", "擦邊肉番"):
        option = resolve_option(db_session, "Label", value)
        db_session.refresh(option)
        assert {s.scope for s in option.scopes} >= set(LABEL_FIELD_TYPES), value
