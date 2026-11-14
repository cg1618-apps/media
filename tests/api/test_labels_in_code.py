"""
Content labels and access modes are defined in code.

Six labels, each with the lowest mode that shows it; four modes in a fixed
order, safe < normal < borderline < unrestricted. What a mode shows is derived
from that order and never stored, so an admin's edit cannot make `normal` show
something `borderline` hides, and every database shows the same thing.

Every refusal below has a labelled entry to refuse, and every boundary is
asserted from both sides: the mode that hides a label and the next one up that
shows it.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain.gated_labels import ensure_labels
from app.services.rbac.labels import CONTENT_LABELS, LABEL_KEYS, labels_shown_in
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_ORDER,
    MODE_SAFE,
    MODE_UNRESTRICTED,
    field_groups_shown_in,
    mode_rank,
)

# --- The vocabulary, from the code alone ------------------------------------


def test_six_labels_with_their_lowest_modes():
    assert {label.key: label.lowest_mode for label in CONTENT_LABELS} == {
        "nsfw": MODE_NORMAL,
        "ecchi": MODE_NORMAL,
        "erotica": MODE_BORDERLINE,
        "hentai": MODE_UNRESTRICTED,
        "h-game": MODE_UNRESTRICTED,
        "h-comic": MODE_UNRESTRICTED,
    }


def test_display_names_are_the_owners():
    names = {label.key: label.name for label in CONTENT_LABELS}
    assert names["nsfw"] == "NSFW"
    assert names["ecchi"] == "輕微色情"
    assert names["erotica"] == "擦邊肉番"


def test_the_order_is_fixed():
    assert MODE_ORDER == (MODE_SAFE, MODE_NORMAL, MODE_BORDERLINE, MODE_UNRESTRICTED)
    assert [mode_rank(key) for key in MODE_ORDER] == [0, 1, 2, 3]


def test_each_mode_shows_everything_the_mode_below_shows():
    """The rule a stored set could not keep: a ceiling only means something if
    every mode contains the one below it."""
    for lower, upper in zip(MODE_ORDER, MODE_ORDER[1:]):
        assert set(labels_shown_in(lower)) <= set(labels_shown_in(upper)), upper
        assert set(field_groups_shown_in(lower)) <= set(
            field_groups_shown_in(upper)
        ), upper


def test_what_each_mode_shows():
    assert labels_shown_in(MODE_SAFE) == ()
    assert set(labels_shown_in(MODE_NORMAL)) == {"nsfw", "ecchi"}
    assert set(labels_shown_in(MODE_BORDERLINE)) == {"nsfw", "ecchi", "erotica"}
    assert set(labels_shown_in(MODE_UNRESTRICTED)) == set(LABEL_KEYS)
    assert field_groups_shown_in(MODE_SAFE) == ()
    for key in (MODE_NORMAL, MODE_BORDERLINE, MODE_UNRESTRICTED):
        assert field_groups_shown_in(key) == ("sources_restricted",)


def test_every_field_group_has_a_lowest_mode():
    """A group with no entry would be withheld everywhere but unrestricted.
    That is safe, but it is never what adding a group means."""
    from app.services.rbac.field_groups import FIELD_GROUP_KEYS
    from app.services.rbac.seed_modes import FIELD_GROUP_LOWEST_MODE

    assert set(FIELD_GROUP_LOWEST_MODE) == set(FIELD_GROUP_KEYS)
    assert set(FIELD_GROUP_LOWEST_MODE.values()) <= set(MODE_ORDER)


def test_unrestricted_shows_every_declared_field_group():
    from app.services.rbac.field_groups import FIELD_GROUP_KEYS

    assert set(field_groups_shown_in(MODE_UNRESTRICTED)) == set(FIELD_GROUP_KEYS)


# --- The ladder, through real sessions --------------------------------------


@pytest.fixture
def labelled(db_session, sample_franchise, access_modes):
    """One anime per label, each carrying only that label - so every mode has
    something to hide and something to show."""
    ensure_labels(db_session)
    out = {}
    for key in LABEL_KEYS:
        entry = models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en=f"Labelled {key}",
            airing_type="TV",
        )
        db_session.add(entry)
        db_session.flush()
        label = (
            db_session.query(models.ContentLabel)
            .filter(models.ContentLabel.key == key)
            .one()
        )
        db_session.add(
            models.MediaContentLabel(
                media_id=entry.system_id, label_id=label.system_id, position=0
            )
        )
        out[key] = entry
    db_session.flush()
    return out


def _sees(client, entry) -> bool:
    return client.get(f"/api/anime/{entry.system_id}").status_code == 200


@pytest.mark.parametrize("mode_key", MODE_ORDER)
def test_a_session_sees_exactly_its_modes_labels(mode_client, labelled, mode_key):
    client = mode_client(mode_key)
    shown = set(labels_shown_in(mode_key))
    for key, entry in labelled.items():
        assert _sees(client, entry) == (key in shown), (mode_key, key)


def test_normal_refuses_erotica_and_borderline_shows_it(mode_client, labelled):
    assert not _sees(mode_client(MODE_NORMAL), labelled["erotica"])
    assert _sees(mode_client(MODE_BORDERLINE), labelled["erotica"])


def test_borderline_refuses_hentai_and_unrestricted_shows_it(mode_client, labelled):
    assert not _sees(mode_client(MODE_BORDERLINE), labelled["hentai"])
    assert _sees(mode_client(MODE_UNRESTRICTED), labelled["hentai"])


def test_safe_refuses_nsfw_and_normal_shows_it(mode_client, labelled):
    assert not _sees(mode_client(MODE_SAFE), labelled["nsfw"])
    assert _sees(mode_client(MODE_NORMAL), labelled["nsfw"])


@pytest.fixture
def restricted_source(db_session, sample_anime):
    db_session.add(
        models.MediaSource(
            media_id=sample_anime.system_id,
            kind="access",
            bucket="restricted",
            name="restricted site",
        )
    )
    db_session.flush()
    return sample_anime


def test_restricted_sources_are_withheld_in_safe_and_shown_in_normal(
    mode_client, restricted_source
):
    def buckets(client):
        body = client.get(f"/api/anime/{restricted_source.system_id}").json()
        return {s["bucket"] for s in body["sources"]}

    assert "restricted" not in buckets(mode_client(MODE_SAFE))
    assert "restricted" in buckets(mode_client(MODE_NORMAL))


# --- The removed routes ------------------------------------------------------


def test_modes_cannot_be_created_deleted_or_regranted(owner_client, mode):
    normal = mode(MODE_NORMAL)
    assert owner_client.post(
        "/api/access-modes/", json={"key": "x", "label": "X"}
    ).status_code in (404, 405)
    assert owner_client.delete(
        f"/api/access-modes/{normal.system_id}"
    ).status_code in (404, 405)
    assert owner_client.put(
        f"/api/access-modes/{normal.system_id}/grants",
        json={"label_keys": [], "field_group_keys": []},
    ).status_code in (404, 405)


def test_labels_cannot_be_created_renamed_or_deleted(owner_client, db_session):
    ensure_labels(db_session)
    nsfw = (
        db_session.query(models.ContentLabel)
        .filter(models.ContentLabel.key == "nsfw")
        .one()
    )
    assert owner_client.post(
        "/api/content-labels/", json={"key": "spoiler", "label": "Spoiler"}
    ).status_code in (404, 405)
    assert owner_client.patch(
        f"/api/content-labels/{nsfw.system_id}", json={"label": "x"}
    ).status_code in (404, 405)
    assert owner_client.delete(
        f"/api/content-labels/{nsfw.system_id}"
    ).status_code in (404, 405)


def test_a_modes_name_and_description_stay_adjustable(admin_client, mode):
    normal = mode(MODE_NORMAL)
    r = admin_client.patch(
        f"/api/access-modes/{normal.system_id}",
        json={"label": "一般", "description": "日常"},
    )
    assert r.status_code == 200
    assert (r.json()["label"], r.json()["description"]) == ("一般", "日常")


# --- The reference -----------------------------------------------------------


@pytest.mark.parametrize("who", ["owner_client", "super_client"])
def test_the_reference_lists_every_label_with_its_modes(request, labelled, who):
    client = request.getfixturevalue(who)
    r = client.get("/api/content-labels/")
    assert r.status_code == 200
    rows = {row["key"]: row for row in r.json()}
    assert set(rows) == set(LABEL_KEYS)
    assert rows["erotica"]["lowest_mode"] == MODE_BORDERLINE
    assert rows["erotica"]["modes"] == [MODE_BORDERLINE, MODE_UNRESTRICTED]
    assert rows["erotica"]["entry_count"] == 1
    assert rows["erotica"]["also_carries"] == ["nsfw"]
    assert rows["nsfw"]["also_carries"] == []


def test_a_member_cannot_read_the_reference(user_client):
    assert user_client.get("/api/content-labels/").status_code == 401


# --- The lifespan keeps the rows a mirror of the code -----------------------


def test_ensure_labels_creates_missing_labels_and_restores_names(db_session):
    ensure_labels(db_session)
    nsfw = (
        db_session.query(models.ContentLabel)
        .filter(models.ContentLabel.key == "nsfw")
        .one()
    )
    nsfw.label = "renamed by hand"
    db_session.query(models.ContentLabel).filter(
        models.ContentLabel.key == "ecchi"
    ).delete()
    db_session.flush()

    ensure_labels(db_session)

    rows = {
        row.key: row.label for row in db_session.query(models.ContentLabel)
    }
    assert rows["nsfw"] == "NSFW"
    assert rows["ecchi"] == "輕微色情"
