"""An account's access modes are a CEILING and a DEFAULT, not a set it holds.

The four modes are ordered (seed_modes.MODE_ORDER). An account reaches every
mode ranked at or below its ceiling and lands in its default on login; its
denials subtract from whichever of those it is sitting in. set_mode_ceiling is
the one setter, and the users router's PUT .../access-modes is its HTTP face.

Every refusal below is paired with the mirror case on the same fixture, so a
green proves the gate refused rather than that nothing was there to refuse.
"""

import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app import models
from app.dependencies import get_db
from app.main import app
from app.services.rbac import cache
from app.services.rbac.modes import (
    EMPTY_MODE,
    held_modes,
    resolve_mode,
    set_mode_ceiling,
)
from app.services.rbac.resolver import MODE_OVERRIDE_COOKIE
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
)
from app.services.security import create_access_token, get_password_hash
from tests.api.conftest import role_id_for

SWITCH = "/api/auth/access-mode"


@pytest.fixture
def member(db_session, access_modes):
    """A `user`-role account at ceiling `normal`, default `normal`."""
    user = models.User(
        id=uuid.uuid4(),
        username="ceilinged",
        hashed_password=get_password_hash("testpass"),
        role_id=role_id_for(db_session, "user"),
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture
def signed_in(db_session):
    """A client logged in as `user`, optionally sitting in an override mode."""

    def _make(user, override_mode=None):
        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        c = TestClient(app)
        token = create_access_token({"sub": user.username, "role": "user"})
        c.cookies.set(
            "access_token", f"Bearer {token}", domain="testserver.local"
        )
        if override_mode is not None:
            override = create_access_token(
                {"sub": user.username, "mode": str(override_mode.system_id)},
                expires_delta=timedelta(minutes=60),
            )
            c.cookies.set(MODE_OVERRIDE_COOKIE, override, domain="testserver.local")
        return c

    yield _make
    app.dependency_overrides.clear()


def _denials(db, user):
    return {
        (row.label_id, row.field_group_key)
        for row in db.query(models.UserAccessModeDenial).filter(
            models.UserAccessModeDenial.user_id == user.id
        )
    }


# ---------------------------------------------------------------------------
# set_mode_ceiling
# ---------------------------------------------------------------------------


def test_a_new_account_starts_at_normal_normal(member):
    assert member.mode_ceiling == MODE_NORMAL
    assert member.mode_default == MODE_NORMAL


def test_a_default_above_the_ceiling_is_refused(db_session, member):
    with pytest.raises(ValueError):
        set_mode_ceiling(db_session, member, MODE_NORMAL, MODE_BORDERLINE)
    assert (member.mode_ceiling, member.mode_default) == (MODE_NORMAL, MODE_NORMAL)


def test_a_default_at_or_below_the_ceiling_is_accepted(db_session, member):
    """The mirror: the same account, the same ceiling, a legal default."""
    set_mode_ceiling(db_session, member, MODE_BORDERLINE, MODE_BORDERLINE)
    assert (member.mode_ceiling, member.mode_default) == (
        MODE_BORDERLINE,
        MODE_BORDERLINE,
    )
    set_mode_ceiling(db_session, member, MODE_BORDERLINE, MODE_SAFE)
    assert (member.mode_ceiling, member.mode_default) == (MODE_BORDERLINE, MODE_SAFE)


def test_unrestricted_is_a_ceiling_the_setter_accepts(db_session, member):
    set_mode_ceiling(db_session, member, MODE_UNRESTRICTED, MODE_NORMAL)
    assert member.mode_ceiling == MODE_UNRESTRICTED


@pytest.mark.parametrize(
    "ceiling, default",
    [("wizard", MODE_SAFE), (MODE_NORMAL, "wizard"), (MODE_NORMAL, None), (None, MODE_SAFE)],
)
def test_an_unknown_key_or_one_none_is_refused(db_session, member, ceiling, default):
    with pytest.raises(ValueError):
        set_mode_ceiling(db_session, member, ceiling, default)
    assert (member.mode_ceiling, member.mode_default) == (MODE_NORMAL, MODE_NORMAL)


def test_both_none_is_no_mode(db_session, member):
    set_mode_ceiling(db_session, member, None, None)
    assert member.mode_ceiling is None and member.mode_default is None


def test_lowering_the_ceiling_prunes_denials_it_no_longer_shows(
    db_session, member, nsfw_label
):
    """`borderline` shows nsfw and every field group; `safe` shows neither
    nsfw nor sources_restricted. Lowering to safe drops both denials and
    keeps the one on a group safe still shows."""
    set_mode_ceiling(db_session, member, MODE_BORDERLINE, MODE_BORDERLINE)
    for row in (
        models.UserAccessModeDenial(user_id=member.id, label_id=nsfw_label.system_id),
        models.UserAccessModeDenial(
            user_id=member.id, field_group_key="sources_restricted"
        ),
        models.UserAccessModeDenial(user_id=member.id, field_group_key="sources_other"),
    ):
        db_session.add(row)
    db_session.flush()
    assert len(_denials(db_session, member)) == 3

    set_mode_ceiling(db_session, member, MODE_SAFE, MODE_SAFE)

    assert _denials(db_session, member) == {(None, "sources_other")}


# ---------------------------------------------------------------------------
# Resolution and switching
# ---------------------------------------------------------------------------


def _mode(db, key):
    return db.query(models.AccessMode).filter(models.AccessMode.key == key).one()


def test_switching_above_the_ceiling_is_404(db_session, member, signed_in):
    """All four access_mode rows exist; the account's ceiling is `normal`."""
    assert db_session.query(models.AccessMode).count() >= 4
    c = signed_in(member)

    for key in (MODE_BORDERLINE, MODE_UNRESTRICTED):
        response = c.post(
            SWITCH,
            json={"mode_id": str(_mode(db_session, key).system_id), "password": "testpass"},
        )
        assert response.status_code == 404, key


def test_switching_at_or_below_the_ceiling_works(db_session, member, signed_in):
    """The mirror, on the same account."""
    c = signed_in(member)

    safe = c.post(SWITCH, json={"mode_id": str(_mode(db_session, MODE_SAFE).system_id)})
    assert safe.status_code == 200
    assert safe.json()["mode"]["key"] == MODE_SAFE

    back = c.post(
        SWITCH,
        json={
            "mode_id": str(_mode(db_session, MODE_NORMAL).system_id),
            "password": "testpass",
        },
    )
    assert back.status_code == 200
    assert back.json()["mode"]["key"] == MODE_NORMAL


def test_a_live_override_above_a_lowered_ceiling_resolves_nothing(
    db_session, member, signed_in
):
    set_mode_ceiling(db_session, member, MODE_BORDERLINE, MODE_NORMAL)
    db_session.flush()
    c = signed_in(member, override_mode=_mode(db_session, MODE_BORDERLINE))
    assert c.get("/api/auth/me").json()["mode"]["key"] == MODE_BORDERLINE

    set_mode_ceiling(db_session, member, MODE_NORMAL, MODE_NORMAL)
    db_session.flush()

    me = c.get("/api/auth/me").json()
    assert me["mode"]["key"] is None
    assert resolve_mode(
        db_session, member, _mode(db_session, MODE_BORDERLINE).system_id
    ) == EMPTY_MODE


def test_me_lists_exactly_the_modes_up_to_the_ceiling(db_session, member, signed_in):
    set_mode_ceiling(db_session, member, MODE_BORDERLINE, MODE_NORMAL)
    db_session.flush()

    keys = [m["key"] for m in signed_in(member).get("/api/auth/me").json()["modes"]]

    assert keys == [MODE_SAFE, MODE_NORMAL, MODE_BORDERLINE]


def test_an_account_with_no_mode_holds_nothing(db_session, member):
    set_mode_ceiling(db_session, member, None, None)
    assert held_modes(db_session, member, EMPTY_MODE) == []


# ---------------------------------------------------------------------------
# A denial applies in every mode
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("key", [MODE_BORDERLINE, MODE_UNRESTRICTED])
def test_a_denial_hides_the_label_in_every_mode_that_shows_it(
    db_session, member, signed_in, hidden_anime, nsfw_label, key
):
    set_mode_ceiling(db_session, member, MODE_UNRESTRICTED, MODE_UNRESTRICTED)
    db_session.add(
        models.UserAccessModeDenial(user_id=member.id, label_id=nsfw_label.system_id)
    )
    db_session.flush()
    cache.bump()

    c = signed_in(member, override_mode=_mode(db_session, key))

    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


@pytest.mark.parametrize("key", [MODE_BORDERLINE, MODE_UNRESTRICTED])
def test_an_undenied_account_sees_the_label_in_those_modes(
    db_session, member, signed_in, hidden_anime, key
):
    """The mirror: same entry, same modes, no denial."""
    set_mode_ceiling(db_session, member, MODE_UNRESTRICTED, MODE_UNRESTRICTED)
    db_session.flush()

    c = signed_in(member, override_mode=_mode(db_session, key))

    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200


# ---------------------------------------------------------------------------
# PUT /api/users/{id}/access-modes
# ---------------------------------------------------------------------------


def _url(user):
    return f"/api/users/{user.id}/access-modes"


def test_a_denial_the_ceiling_does_not_show_is_422(
    db_session, admin_client, member, nsfw_label
):
    """`normal` carries no labels, so denying nsfw subtracts nothing."""
    response = admin_client.put(
        _url(member),
        json={
            "ceiling": MODE_NORMAL,
            "default": MODE_NORMAL,
            "denied_label_keys": [nsfw_label.key],
        },
    )

    assert response.status_code == 422
    assert "nsfw" in response.json()["detail"]
    assert _denials(db_session, member) == set()


def test_a_denial_the_ceiling_shows_is_accepted(
    db_session, admin_client, member, nsfw_label
):
    """The mirror: the same label under a ceiling that shows it."""
    response = admin_client.put(
        _url(member),
        json={
            "ceiling": MODE_BORDERLINE,
            "default": MODE_NORMAL,
            "denied_label_keys": [nsfw_label.key],
            "denied_field_group_keys": ["sources_other"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["mode_ceiling"] == MODE_BORDERLINE
    assert body["mode_default"] == MODE_NORMAL
    assert body["denied_label_keys"] == [nsfw_label.key]
    assert body["denied_field_group_keys"] == ["sources_other"]
    assert _denials(db_session, member) == {
        (nsfw_label.system_id, None),
        (None, "sources_other"),
    }


def test_a_default_above_the_ceiling_is_422(admin_client, member):
    response = admin_client.put(
        _url(member), json={"ceiling": MODE_SAFE, "default": MODE_NORMAL}
    )
    assert response.status_code == 422


def test_both_null_parks_the_account(db_session, admin_client, member):
    response = admin_client.put(_url(member), json={"ceiling": None, "default": None})

    assert response.status_code == 200
    db_session.refresh(member)
    assert member.mode_ceiling is None and member.mode_default is None


def test_a_new_account_from_the_users_page_lands_in_normal(db_session, admin_client):
    response = admin_client.post(
        "/api/users/",
        json={
            "username": "invitee",
            "password": "hunter2xyz",
            "role_id": str(role_id_for(db_session, "user")),
        },
    )

    assert response.status_code == 201
    assert response.json()["mode_ceiling"] == MODE_NORMAL
    assert response.json()["mode_default"] == MODE_NORMAL


# ---------------------------------------------------------------------------
# The constraints, against a hand-written row
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "ceiling, default",
    [
        (MODE_SAFE, MODE_NORMAL),  # default above the ceiling
        (MODE_NORMAL, None),  # one without the other
        ("wizard", "wizard"),  # not a mode key
    ],
)
def test_the_constraints_reject_a_bad_pair(db_session, member, ceiling, default):
    savepoint = db_session.begin_nested()
    member.mode_ceiling = ceiling
    member.mode_default = default
    with pytest.raises(IntegrityError):
        db_session.flush()
    savepoint.rollback()


def test_the_constraints_accept_a_good_pair(db_session, member):
    """The mirror: the same row, legal values, including no mode at all."""
    for ceiling, default in (
        (MODE_UNRESTRICTED, MODE_SAFE),
        (MODE_SAFE, MODE_SAFE),
        (None, None),
    ):
        member.mode_ceiling = ceiling
        member.mode_default = default
        db_session.flush()
