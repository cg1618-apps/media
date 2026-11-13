"""
The caller's own plan flags and remarks, under /api/me.

Both used to be writable only through the entry's catalogue endpoint, behind
manage.catalog, so a `user` was shown the controls and refused. These routes
are behind self.list and write the caller's rows only.

Each refusal test asserts the mirror with the same setup: a guest refused
where a member succeeds; a second account's row untouched where the caller's
changes; a viewer without the media type refused where a guest holding it
succeeds.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import PERM_SELF_LIST, media_type_perm
from app.services.rbac.seed import default_guest_permissions
from tests.api.conftest import make_viewer


def flags(client, media_id, **body):
    return client.put(f"/api/me/plan-flags/{media_id}", json=body)


def remark(client, owner_type, owner_id, text):
    return client.put(
        f"/api/me/remarks/{owner_type}/{owner_id}", json={"remark": text}
    )


def _plan_rows(db, user, media_id):
    db.expire_all()
    return {
        row.kind
        for row in db.query(models.PlanNext).filter(
            models.PlanNext.user_id == user.id,
            models.PlanNext.media_id == media_id,
        )
    }


def _remark_of(db, user, owner_id):
    db.expire_all()
    row = (
        db.query(models.Note)
        .filter(
            models.Note.section == "remark",
            models.Note.author_id == user.id,
            models.Note.media_id == owner_id,
        )
        .one_or_none()
    )
    return row.content if row else None


@pytest.fixture
def movie(db_session, sample_franchise):
    entry = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="A Movie",
    )
    db_session.add(entry)
    db_session.flush()
    return entry


# ---------------------------------------------------------------------------
# Plan flags
# ---------------------------------------------------------------------------


def test_a_member_sets_and_clears_its_own_plan_flags(
    user_client, db_session, plain_user, movie
):
    r = flags(user_client, movie.system_id, watch_next=True, to_rewatch=True)
    assert r.status_code == 200, r.text
    assert r.json() == {"watch_next": True, "to_rewatch": True}
    assert _plan_rows(db_session, plain_user, movie.system_id) == {"next", "rewatch"}

    r = flags(user_client, movie.system_id, to_rewatch=False)
    assert r.json() == {"watch_next": True, "to_rewatch": False}
    assert _plan_rows(db_session, plain_user, movie.system_id) == {"next"}


def test_a_guest_cannot_set_plan_flags(client, user_client, movie):
    assert flags(client, movie.system_id, watch_next=True).status_code == 401
    assert flags(user_client, movie.system_id, watch_next=True).status_code == 200


def test_a_flag_the_type_lacks_is_refused(user_client, sample_anime):
    """Anime has watch_next and no rewatch flag at entry level."""
    assert flags(user_client, sample_anime.system_id, to_rewatch=True).status_code == 422
    assert flags(user_client, sample_anime.system_id, watch_next=True).status_code == 200


def test_another_accounts_plan_flags_are_untouched(
    user_client, db_session, super_user, movie
):
    db_session.add(
        models.PlanNext(
            user_id=super_user.id,
            media_type="movie",
            kind="next",
            media_id=movie.system_id,
        )
    )
    db_session.flush()
    flags(user_client, movie.system_id, watch_next=False)
    assert _plan_rows(db_session, super_user, movie.system_id) == {"next"}


def test_an_entry_of_a_type_the_viewer_lacks_is_404(
    client, db_session, sample_anime
):
    grants = (default_guest_permissions() | {PERM_SELF_LIST}) - {
        media_type_perm("anime")
    }
    viewer = make_viewer(db_session, client, "noanime", grants)
    assert flags(viewer, sample_anime.system_id, watch_next=True).status_code == 404

    member = make_viewer(
        db_session, client, "withanime", default_guest_permissions() | {PERM_SELF_LIST}
    )
    assert flags(member, sample_anime.system_id, watch_next=True).status_code == 200


# ---------------------------------------------------------------------------
# Remarks
# ---------------------------------------------------------------------------


def test_a_member_writes_its_own_remark(user_client, db_session, plain_user, movie):
    r = remark(user_client, "movie", movie.system_id, "Worth a rewatch.")
    assert r.status_code == 200, r.text
    assert r.json() == {"remark": "Worth a rewatch."}
    assert _remark_of(db_session, plain_user, movie.system_id) == "Worth a rewatch."

    assert remark(user_client, "movie", movie.system_id, "").json() == {"remark": None}
    assert _remark_of(db_session, plain_user, movie.system_id) is None


def test_a_guest_cannot_write_a_remark(client, user_client, movie):
    assert remark(client, "movie", movie.system_id, "x").status_code == 401
    assert remark(user_client, "movie", movie.system_id, "x").status_code == 200


def test_another_accounts_remark_is_untouched(
    user_client, super_client, db_session, plain_user, super_user, movie
):
    assert remark(super_client, "movie", movie.system_id, "Super's own.").status_code == 200
    assert remark(user_client, "movie", movie.system_id, "Mine.").status_code == 200
    assert _remark_of(db_session, super_user, movie.system_id) == "Super's own."
    assert _remark_of(db_session, plain_user, movie.system_id) == "Mine."


def test_a_remark_on_a_group(user_client, sample_franchise):
    r = remark(user_client, "franchise", sample_franchise.system_id, "Start here.")
    assert r.status_code == 200
    assert r.json() == {"remark": "Start here."}


@pytest.mark.parametrize("owner_type", ["anime", "nonsense", "franchise"])
def test_a_wrong_owner_is_404(user_client, movie, owner_type):
    """The id is a movie's: naming it as another type, as a group, or as an
    unknown type finds nothing. Mirror: the right type writes."""
    assert remark(user_client, owner_type, movie.system_id, "x").status_code == 404
    assert remark(user_client, "movie", movie.system_id, "x").status_code == 200


def test_a_remark_body_is_text_or_null(user_client, movie):
    r = user_client.put(
        f"/api/me/remarks/movie/{movie.system_id}", json={"remark": 3}
    )
    assert r.status_code == 422
    r = user_client.put(
        f"/api/me/remarks/movie/{movie.system_id}", json={"text": "x"}
    )
    assert r.status_code == 422
    assert remark(user_client, "movie", movie.system_id, None).status_code == 200
