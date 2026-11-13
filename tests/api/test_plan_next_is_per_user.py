"""
A plan row belongs to the account that made it, so an ordinary member may
write their own.

The three write routes carried Depends(get_current_admin) from when the admin
was the only account, while already taking get_current_user_id on the next
line - so the row was always the caller's, and the gate only decided whether
the caller was allowed to have one.
"""

import uuid

import pytest

from app import models
from app.services.domain.gated_labels import ensure_label
from app.services.rbac import cache as rbac_cache
from app.services.rbac.seed import ensure_rbac_seed
from app.services.security import create_access_token, get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def member_client(db, client):
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == "user").one()
    db.add(
        models.User(
            id=uuid.uuid4(),
            username="planner",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()
    token = create_access_token({"sub": "planner", "role": "user"})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


def test_a_member_can_create_their_own_plan_row(member_client, sample_anime):
    response = member_client.post(
        "/api/plan-next/",
        json={
            "kind": "next",
            "media_type": "anime",
            "target_id": str(sample_anime.system_id),
            "scope": "entry",
        },
    )
    assert response.status_code in (200, 201), response.text


def test_the_row_belongs_to_the_caller(member_client, db, sample_anime):
    member_client.post(
        "/api/plan-next/",
        json={
            "kind": "next",
            "media_type": "anime",
            "target_id": str(sample_anime.system_id),
            "scope": "entry",
        },
    )
    planner = db.query(models.User).filter(
        models.User.username == "planner"
    ).one()
    rows = db.query(models.PlanNext).filter(
        models.PlanNext.user_id == planner.id
    ).count()
    assert rows == 1


def test_an_anonymous_caller_is_still_refused(client, sample_anime):
    response = client.post(
        "/api/plan-next/",
        json={
            "kind": "next",
            "media_type": "anime",
            "target_id": str(sample_anime.system_id),
            "scope": "entry",
        },
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Object-level check: validate_plan_target only confirmed the target exists,
# not that this caller may see it - so a member could name a content-labelled
# entry it lacks the label for and get 201 plus that entry's display_name,
# cover_image_file and expectation back. Fixed the way me_list.py's
# _media_or_404 does it: 404, never 403, so a hidden entry is
# indistinguishable from a missing one.
# ---------------------------------------------------------------------------


@pytest.fixture
def erotica_label(db):
    """The code's `erotica` label. A member lands in `normal`, which shows
    `nsfw` but not `erotica`, so this is the label that hides from it."""
    return ensure_label(db, "erotica")


@pytest.fixture
def hidden_anime(db, sample_franchise, erotica_label):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Zvornik Hidden Sentinel",
        airing_type="TV",
        airing_status="Finished Airing",
    )
    db.add(entry)
    db.flush()
    db.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(),
            media_id=entry.system_id,
            label_id=erotica_label.system_id,
        )
    )
    db.flush()
    return entry


def test_a_member_cannot_plan_an_entry_it_cannot_see(member_client, hidden_anime):
    response = member_client.post(
        "/api/plan-next/",
        json={
            "kind": "next",
            "media_type": "anime",
            "target_id": str(hidden_anime.system_id),
            "scope": "entry",
        },
    )
    assert response.status_code == 404
    assert "Zvornik Hidden Sentinel" not in response.text


def test_a_member_can_still_plan_a_visible_entry(member_client, sample_anime):
    response = member_client.post(
        "/api/plan-next/",
        json={
            "kind": "next",
            "media_type": "anime",
            "target_id": str(sample_anime.system_id),
            "scope": "entry",
        },
    )
    assert response.status_code in (200, 201), response.text


def test_the_same_entry_plans_once_the_mode_shows_its_label(
    member_client, db, hidden_anime
):
    """The mirror, with the same fixture: the member at `borderline`, which
    shows `erotica`, plans the very entry the refusal above hides - so that
    404 came from the label, not from anything else about the entry."""
    member = db.query(models.User).filter(models.User.username == "planner").one()
    member.mode_ceiling = "borderline"
    member.mode_default = "borderline"
    db.flush()
    rbac_cache.bump()

    response = member_client.post(
        "/api/plan-next/",
        json={
            "kind": "next",
            "media_type": "anime",
            "target_id": str(hidden_anime.system_id),
            "scope": "entry",
        },
    )
    assert response.status_code in (200, 201), response.text
