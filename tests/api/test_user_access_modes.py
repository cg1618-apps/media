"""PUT /api/users/{id}/access-modes, and what a NEW account starts with.

One endpoint replaces the whole object axis of an account - ceiling, login
default and denials - in a single payload. Same contract as
PUT /roles/{id}/permissions: one write, one bump(), no partial states.

Decision 8 is enforced here and not merely rendered: the ceiling is an upper
bound, so a denial naming something the ceiling does not show is meaningless
and refused. The per-account panel is built so it cannot express one, but a
UI that cannot ask for the invalid thing and a server that would accept it is
one refactor away from a silent no-op. test_mode_ceiling.py has the label
case; this file has the field-group one, and the rest of the payload.
"""

from app import models
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
)
from app.services.security import create_access_token


def _url(user):
    return f"/api/users/{user.id}/access-modes"


def _denials(db, user):
    return (
        db.query(models.UserAccessModeDenial)
        .filter(models.UserAccessModeDenial.user_id == user.id)
        .count()
    )


def test_replacing_sets_the_ceiling_and_the_login_default(
    db_session, admin_client, plain_user, access_modes
):
    response = admin_client.put(
        _url(plain_user), json={"ceiling": MODE_BORDERLINE, "default": MODE_SAFE}
    )

    assert response.status_code == 200
    db_session.refresh(plain_user)
    assert (plain_user.mode_ceiling, plain_user.mode_default) == (
        MODE_BORDERLINE,
        MODE_SAFE,
    )


def test_replacing_replaces_the_denials_wholesale(
    db_session, admin_client, plain_user, nsfw_label, access_modes
):
    admin_client.put(
        _url(plain_user),
        json={
            "ceiling": MODE_BORDERLINE,
            "default": MODE_BORDERLINE,
            "denied_label_keys": [nsfw_label.key],
        },
    )
    assert _denials(db_session, plain_user) == 1

    admin_client.put(
        _url(plain_user),
        json={
            "ceiling": MODE_BORDERLINE,
            "default": MODE_BORDERLINE,
            "denied_field_group_keys": ["sources_restricted"],
        },
    )

    rows = db_session.query(models.UserAccessModeDenial).filter(
        models.UserAccessModeDenial.user_id == plain_user.id
    )
    assert [(r.label_id, r.field_group_key) for r in rows] == [(None, "sources_restricted")]


def test_parking_an_account_clears_its_denials(
    db_session, admin_client, plain_user, nsfw_label, access_modes
):
    admin_client.put(
        _url(plain_user),
        json={
            "ceiling": MODE_BORDERLINE,
            "default": MODE_BORDERLINE,
            "denied_label_keys": [nsfw_label.key],
        },
    )
    assert _denials(db_session, plain_user) == 1

    response = admin_client.put(_url(plain_user), json={"ceiling": None, "default": None})

    assert response.status_code == 200
    assert _denials(db_session, plain_user) == 0


def test_a_denial_narrows_what_that_account_actually_sees(
    db_session, admin_client, plain_user, user_client, hidden_anime, nsfw_label, mode
):
    """Not just stored - felt. Ceiling `borderline`, which carries the label,
    minus that label."""
    admin_client.put(
        _url(plain_user),
        json={
            "ceiling": MODE_BORDERLINE,
            "default": MODE_BORDERLINE,
            "denied_label_keys": [nsfw_label.key],
        },
    )
    token = create_access_token({"sub": plain_user.username, "role": "user"})
    user_client.cookies.set("access_token", f"Bearer {token}")

    assert user_client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_without_the_denial_that_account_sees_it(
    db_session, admin_client, plain_user, user_client, hidden_anime, mode
):
    """The mirror: the same ceiling, no denial."""
    admin_client.put(
        _url(plain_user), json={"ceiling": MODE_BORDERLINE, "default": MODE_BORDERLINE}
    )
    token = create_access_token({"sub": plain_user.username, "role": "user"})
    user_client.cookies.set("access_token", f"Bearer {token}")

    assert user_client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200


def test_a_field_group_denial_the_ceiling_does_not_show_is_422(
    admin_client, plain_user, access_modes
):
    """`safe` does not carry sources_restricted, so denying it is meaningless."""
    response = admin_client.put(
        _url(plain_user),
        json={
            "ceiling": MODE_SAFE,
            "default": MODE_SAFE,
            "denied_field_group_keys": ["sources_restricted"],
        },
    )

    assert response.status_code == 422


def test_a_field_group_denial_the_ceiling_shows_is_accepted(
    admin_client, plain_user, access_modes
):
    """The mirror: `normal` carries sources_restricted."""
    response = admin_client.put(
        _url(plain_user),
        json={
            "ceiling": MODE_NORMAL,
            "default": MODE_SAFE,
            "denied_field_group_keys": ["sources_restricted"],
        },
    )

    assert response.status_code == 200
    assert response.json()["denied_field_group_keys"] == ["sources_restricted"]


def test_unrestricted_shows_every_label_whatever_rows_it_holds(
    admin_client, plain_user, nsfw_label, access_modes
):
    """`unrestricted` is derived (cache.mode_sets), so a denial is checked
    against everything rather than against the rows the mode happens to
    hold."""
    response = admin_client.put(
        _url(plain_user),
        json={
            "ceiling": MODE_UNRESTRICTED,
            "default": MODE_NORMAL,
            "denied_label_keys": ["h-comic", nsfw_label.key],
        },
    )

    assert response.status_code == 200


def test_an_unknown_mode_key_is_422(admin_client, plain_user, access_modes):
    response = admin_client.put(
        _url(plain_user), json={"ceiling": "wizard", "default": MODE_SAFE}
    )
    assert response.status_code == 422


def test_one_half_of_the_pair_is_422(admin_client, plain_user, access_modes):
    response = admin_client.put(
        _url(plain_user), json={"ceiling": MODE_NORMAL, "default": None}
    )
    assert response.status_code == 422


def test_a_super_may_not_assign_modes(super_client, plain_user, access_modes):
    """The authorization surface, so admin.authz."""
    assert (
        super_client.put(
            _url(plain_user), json={"ceiling": None, "default": None}
        ).status_code
        == 401
    )


def test_a_new_account_can_actually_see_something(db_session, admin_client, mode):
    """An account with NO mode resolves the empty object set - correct,
    fail-closed, and a terrible first impression that looks like a broken
    site. So a new account starts in `normal`."""
    from app.services.rbac.modes import default_mode_id, resolve_mode

    role_id = str(
        db_session.query(models.Role).filter(models.Role.name == "user").one().system_id
    )
    admin_client.post(
        "/api/users/",
        json={"username": "invitee2", "password": "hunter2xyz", "role_id": role_id},
    )
    created = (
        db_session.query(models.User)
        .filter(models.User.username == "invitee2")
        .one()
    )

    resolved = resolve_mode(db_session, created, default_mode_id(db_session, created))

    assert resolved.mode_key == MODE_NORMAL
    assert resolved.field_groups
