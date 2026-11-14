"""
Everything per user is private to its account.

No account reads another's list, ratings or personal notes - the admin
included - so every surface that could only ever show another account's data
is gone rather than hidden: the public profile, the community aggregate,
reading notes by author, the list-visibility flag behind all three, and the
`personal_notes` field group that decided whether a mode could read another
user's notes. `sources_other` went with them: every viewer gets the other
sources, so `sources_restricted` is the only field group left.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull
from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.seed import default_guest_permissions
from tests.api.conftest import make_viewer, role_id_for

# --- The removed routes ----------------------------------------------------


def test_the_profile_route_is_gone(owner_client, owner_user):
    assert owner_client.get(f"/api/profile/{owner_user.username}").status_code == 404


def test_the_community_route_is_gone(owner_client, sample_anime):
    assert owner_client.get(f"/api/community/{sample_anime.system_id}").status_code == 404


def test_account_settings_carry_no_list_visibility(user_client):
    r = user_client.get("/api/account/settings")
    assert r.status_code == 200
    assert "list_is_public" not in r.json()


def test_account_settings_cannot_be_patched(user_client):
    r = user_client.patch("/api/account/settings", json={"list_is_public": True})
    assert r.status_code == 405


def test_the_user_model_has_no_list_visibility():
    assert "list_is_public" not in models.User.__table__.c


# --- Notes by author -------------------------------------------------------


@pytest.fixture
def someone_elses_review(db_session, sample_anime):
    """Load-bearing: a SECOND account's personal note on the same entry. Without
    it, "?author= shows nothing of theirs" passes on an empty table."""
    other = models.User(
        id=uuid.uuid4(),
        username="zz_other_author",
        hashed_password="!",
        role_id=role_id_for(db_session, "user"),
    )
    db_session.add(other)
    db_session.flush()
    db_session.add(
        models.Note(
            author_id=other.id,
            media_id=sample_anime.system_id,
            section="personal_reviews",
            content="somebody else's private review",
            sort_index=0,
        )
    )
    db_session.flush()
    return other


def test_author_is_ignored_and_a_viewer_reads_only_their_own(
    user_client, plain_user, db_session, sample_anime, someone_elses_review
):
    db_session.add(
        models.Note(
            author_id=plain_user.id,
            media_id=sample_anime.system_id,
            section="personal_reviews",
            content="my own review",
            sort_index=0,
        )
    )
    db_session.flush()
    params = {
        "owner_type": "anime",
        "owner_id": str(sample_anime.system_id),
        "author": someone_elses_review.username,
    }

    r = user_client.get("/api/notes", params=params)

    assert r.status_code == 200
    contents = {n["content"] for n in r.json()}
    assert "my own review" in contents
    assert "somebody else's private review" not in contents


# --- Field groups ----------------------------------------------------------


def test_sources_restricted_is_the_only_field_group():
    assert FIELD_GROUP_KEYS == ("sources_restricted",)


@pytest.fixture
def anime_with_both_buckets(db_session, sample_franchise):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Two Buckets",
        airing_type="TV",
    )
    db_session.add(entry)
    db_session.flush()
    for bucket in ("other", "restricted"):
        db_session.add(
            models.MediaSource(
                media_id=entry.system_id,
                kind="access",
                bucket=bucket,
                name=f"{bucket} site",
                url=f"https://example.invalid/{bucket}",
            )
        )
    db_session.flush()
    return entry


def test_a_viewer_holding_no_field_group_still_gets_the_other_sources(
    client, db_session, anime_with_both_buckets
):
    """The narrowest viewer: not one field group. The `restricted` row on the
    same entry is the mirror case - it must still be withheld, so a green
    proves the bucket filter ran, not that nothing was ever filtered."""
    narrow = make_viewer(
        db_session, client, "nogroups", default_guest_permissions(),
        field_groups=set(),
    )

    body = narrow.get(f"/api/anime/{anime_with_both_buckets.system_id}").json()

    assert {s["bucket"] for s in body["sources"]} == {"other"}


# --- Sheets ----------------------------------------------------------------


def test_an_older_users_tab_with_list_is_public_pulls_cleanly(db_session, monkeypatch):
    """A sheet written before the column went still carries the header. It is
    retired, not stale: reporting it would turn every Pull All red until the
    next Backup."""
    monkeypatch.setattr(
        pull,
        "get_all_raw_rows",
        lambda tab: [
            ["id", "username", "list_is_public", "is_installation_owner", "role"],
            [str(uuid.uuid4()), "kana_retired", "TRUE", "FALSE", "user"],
        ],
    )

    result = pull.execute_pull_specific(
        db_session, "Users", log_action=False, may_restore_authz=True
    )

    assert result["status"] == "success"
    assert not any("list_is_public" in r for r in result.get("unresolved_refs", []))
    assert db_session.query(models.User).filter_by(username="kana_retired").one()
