"""
The admin API for roles, users and content labels.

The guards here are the ones that matter: an unknown permission must be
rejected rather than stored inert, the two system roles must survive, and no
sequence of edits may leave the site with nobody who can administer it.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.rbac.permissions import (
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
    media_type_perm,
)

ROLES = "/api/roles/"
USERS = "/api/users/"
LABELS = "/api/content-labels/"


def _role_id(admin_client, name):
    for role in admin_client.get(ROLES).json():
        if role["name"] == name:
            return role["system_id"]
    raise AssertionError(f"role {name} not found")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("path", [ROLES, USERS, LABELS, "/api/roles/catalog"])
def test_the_admin_api_is_closed_to_a_guest(client, path):
    assert client.get(path).status_code == 401


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------

def test_the_catalog_lists_every_family(admin_client):
    """Five families, and NOT field_group or label.

    Those two are the access-mode axis since Phase B. Offering them in the
    role editor would let an admin grant something no mode could ever take
    away, because permission resolution is a union.
    """
    families = {f["family"] for f in admin_client.get("/api/roles/catalog").json()}
    assert families == {"admin", "manage", "media_type", "self", "view"}


def test_catalog_serves_the_self_family(admin_client):
    """
    The role editor's checkbox grid is built from this response, so a new
    family appears in the UI with no frontend change. That is the point of
    serving the catalog instead of mirroring it.
    """
    r = admin_client.get("/api/roles/catalog")
    assert r.status_code == 200

    families = {block["family"]: block for block in r.json()}
    assert "self" in families

    names = {p["permission"] for p in families["self"]["permissions"]}
    assert names == {
        "self.list",
        "self.personal_notes",
        "self.requests",
        "self.password",
    }


def test_a_self_permission_can_be_granted_to_a_role(admin_client):
    user = next(r for r in admin_client.get(ROLES).json() if r["name"] == "user")
    without = sorted(set(user["permissions"]) - {"self.list"})

    r = admin_client.put(
        f"/api/roles/{user['system_id']}/permissions",
        json={"permissions": without},
    )
    assert r.status_code == 200
    assert "self.list" not in r.json()["permissions"]

    r = admin_client.put(
        f"/api/roles/{user['system_id']}/permissions",
        json={"permissions": without + ["self.list"]},
    )
    assert r.status_code == 200
    assert "self.list" in r.json()["permissions"]


def test_no_label_appears_in_the_role_catalog(admin_client, nsfw_label):
    """A content label scopes which ENTRIES a session reaches, which is the
    access mode's axis. The role editor serving it would be offering a grant
    that cannot be narrowed. `nsfw_label` is what makes this non-vacuous:
    labels exist, and still none reaches the catalog.
    """
    catalog = admin_client.get("/api/roles/catalog").json()
    assert not any(f["family"] == "label" for f in catalog)
    every_permission = {
        p["permission"] for f in catalog for p in f["permissions"]
    }
    assert not any(p.startswith("label.") for p in every_permission)


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------

def test_an_unknown_permission_is_rejected(admin_client):
    """A grant naming nothing would be stored and silently do nothing."""
    guest = _role_id(admin_client, "guest")
    response = admin_client.put(
        f"/api/roles/{guest}/permissions",
        json={"permissions": ["media_type.hologram"]},
    )
    assert response.status_code == 422
    assert "hologram" in response.text


def test_permissions_are_replaced_not_appended(admin_client):
    role_id = _role_id(admin_client, "guest")
    admin_client.put(
        f"/api/roles/{role_id}/permissions",
        json={"permissions": [media_type_perm("anime"), media_type_perm("manga")]},
    )

    response = admin_client.put(
        f"/api/roles/{role_id}/permissions",
        json={"permissions": [media_type_perm("manga")]},
    )
    assert response.status_code == 200
    assert response.json()["permissions"] == [media_type_perm("manga")]


# ---------------------------------------------------------------------------
# A revoked permission takes effect immediately
# ---------------------------------------------------------------------------

def test_revoking_a_permission_is_felt_without_re_login(
    admin_client, client, db_session, sample_anime
):
    """
    The whole reason permissions are resolved per request instead of carried in
    the JWT. If this fails, the cache is not being bumped on write.
    """
    from app.services.security import create_access_token

    role_id = _role_id(admin_client, "user")
    admin_client.post(
        USERS, json={"username": "watcher1", "password": "x", "role_id": role_id}
    )

    token = create_access_token({"sub": "watcher1", "role": "user"})
    client.cookies.set("access_token", f"Bearer {token}")
    assert str(sample_anime.system_id) in client.get("/api/anime/").text

    # Down to what the role must hold, which is no ordinary media type.
    locked_on = admin_client.get(f"/api/roles/{role_id}").json()["locked_on"]
    assert "media_type.anime" not in locked_on
    saved = admin_client.put(
        f"/api/roles/{role_id}/permissions", json={"permissions": locked_on}
    )
    assert saved.status_code == 200, saved.text

    # Same cookie, no re-login.
    assert client.get("/api/anime/").json() == []


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def test_creating_a_user_assigns_the_role(admin_client):
    user = _role_id(admin_client, "user")
    response = admin_client.post(
        USERS, json={"username": "newbie", "password": "pw", "role_id": user}
    )
    assert response.status_code == 201
    assert response.json()["role_name"] == "user"


def test_a_duplicate_username_is_rejected(admin_client):
    user = _role_id(admin_client, "user")
    body = {"username": "twice", "password": "pw", "role_id": user}
    assert admin_client.post(USERS, json=body).status_code == 201
    assert admin_client.post(USERS, json=body).status_code == 409


def test_an_unknown_role_is_rejected(admin_client):
    response = admin_client.post(
        USERS,
        json={"username": "orphan", "password": "pw", "role_id": str(uuid.uuid4())},
    )
    assert response.status_code == 422


def test_you_cannot_delete_yourself(admin_client, db_session):
    me = db_session.query(models.User).filter(
        models.User.username == "aaa_testadmin"
    ).first()
    response = admin_client.delete(f"/api/users/{me.id}")
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# The open-request limit
# ---------------------------------------------------------------------------

def _create(admin_client, username, role_name):
    response = admin_client.post(
        USERS,
        json={
            "username": username,
            "password": "pw",
            "role_id": _role_id(admin_client, role_name),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_a_new_account_takes_its_roles_request_limit(admin_client):
    assert _create(admin_client, "limited", "user")["open_request_limit"] == 15
    assert _create(admin_client, "unlimited", "super")["open_request_limit"] is None


def test_the_limit_can_be_set_and_cleared(admin_client):
    user = _create(admin_client, "tuned", "user")
    path = f"{USERS}{user['id']}"
    set_ = admin_client.patch(path, json={"open_request_limit": 3})
    assert set_.status_code == 200
    assert set_.json()["open_request_limit"] == 3
    # An unrelated edit leaves it alone.
    assert admin_client.patch(path, json={"password": "pw2"}).json()[
        "open_request_limit"
    ] == 3
    cleared = admin_client.patch(path, json={"open_request_limit": None})
    assert cleared.json()["open_request_limit"] is None


def test_a_negative_limit_is_422(admin_client):
    user = _create(admin_client, "negative", "user")
    path = f"{USERS}{user['id']}"
    assert admin_client.patch(path, json={"open_request_limit": -1}).status_code == 422
    assert admin_client.patch(path, json={"open_request_limit": 0}).status_code == 200


def test_a_role_change_resets_the_limit_to_the_new_roles_default(admin_client):
    user = _create(admin_client, "promoted", "user")
    path = f"{USERS}{user['id']}"
    admin_client.patch(path, json={"open_request_limit": 4})

    to_super = admin_client.patch(path, json={"role_id": _role_id(admin_client, "super")})
    assert to_super.json()["open_request_limit"] is None
    back = admin_client.patch(path, json={"role_id": _role_id(admin_client, "user")})
    assert back.json()["open_request_limit"] == 15


def test_a_role_change_keeps_a_limit_set_in_the_same_save(admin_client):
    user = _create(admin_client, "both", "super")
    response = admin_client.patch(
        f"{USERS}{user['id']}",
        json={"role_id": _role_id(admin_client, "user"), "open_request_limit": 7},
    )
    assert response.json()["open_request_limit"] == 7


def test_a_super_account_has_no_editable_limit(admin_client):
    user = _create(admin_client, "boss", "super")
    path = f"{USERS}{user['id']}"
    assert admin_client.patch(path, json={"open_request_limit": 5}).status_code == 422
    # The mirror: clearing it, which is what it already is, is accepted.
    assert admin_client.patch(path, json={"open_request_limit": None}).status_code == 200


# ---------------------------------------------------------------------------
# Content labels
# ---------------------------------------------------------------------------

def test_a_label_key_is_unique(db_session, nsfw_label):
    """The key is the identity a Pull and every assignment translate by, so a
    second row under it is refused by the database itself."""
    savepoint = db_session.begin_nested()
    db_session.add(models.ContentLabel(key=nsfw_label.key, label="Again"))
    with pytest.raises(IntegrityError):
        db_session.flush()
    savepoint.rollback()
    assert db_session.query(models.ContentLabel).filter_by(key=nsfw_label.key).count() == 1


def test_labels_are_assigned_to_an_entry_as_a_whole_set(owner_client, sample_anime):
    url = f"/api/content-labels/entry/anime/{sample_anime.system_id}"
    assert owner_client.put(url, json={"label_keys": ["nsfw", "erotica"]}).json() == [
        "erotica",
        "nsfw",
    ]
    assert owner_client.put(url, json={"label_keys": ["nsfw"]}).json() == ["nsfw"]
    assert owner_client.get(url).json() == ["nsfw"]


def test_an_unknown_label_key_is_rejected(owner_client, sample_anime):
    response = owner_client.put(
        f"/api/content-labels/entry/anime/{sample_anime.system_id}",
        json={"label_keys": ["nope"]},
    )
    assert response.status_code == 422


def test_an_unknown_media_type_is_a_400(owner_client, sample_anime):
    response = owner_client.get(
        f"/api/content-labels/entry/hologram/{sample_anime.system_id}"
    )
    assert response.status_code == 400


def test_labelling_an_entry_hides_it_from_a_guest(owner_client, client, sample_anime):
    """End to end: the admin API and the enforcement path agree."""
    assert str(sample_anime.system_id) in client.get("/api/anime/").text

    owner_client.put(
        f"/api/content-labels/entry/anime/{sample_anime.system_id}",
        json={"label_keys": ["nsfw"]},
    )

    assert str(sample_anime.system_id) not in client.get("/api/anime/").text


def test_the_guest_role_can_never_be_granted_admin(admin_client):
    """An anonymous request resolves to the guest role's grants, so admin.authz
    on guest would make every visitor an administrator with one misclick."""
    guest_id = _role_id(admin_client, "guest")
    response = admin_client.put(
        f"{ROLES}{guest_id}/permissions", json={"permissions": [PERM_ADMIN_AUTHZ]}
    )
    assert response.status_code == 409
    after = admin_client.get(f"{ROLES}{guest_id}").json()
    assert PERM_ADMIN_AUTHZ not in after["permissions"]


def test_the_guest_role_can_never_be_granted_manage_catalog(admin_client):
    """manage.catalog on guest would let any anonymous visitor write the
    collection - the same widened guard as admin.authz, added when the bare
    `admin` permission split into three named ones in Phase A."""
    guest_id = _role_id(admin_client, "guest")
    response = admin_client.put(
        f"{ROLES}{guest_id}/permissions", json={"permissions": [PERM_MANAGE_CATALOG]}
    )
    assert response.status_code == 409
    body = response.json()
    assert "guest" in body["detail"].lower()
    assert PERM_MANAGE_CATALOG in body["detail"]
    after = admin_client.get(f"{ROLES}{guest_id}").json()
    assert PERM_MANAGE_CATALOG not in after["permissions"]


def test_the_guest_role_can_never_be_granted_manage_pipelines(admin_client):
    """manage.pipelines on guest would let any anonymous visitor run Backup,
    Pull, Fill, Replace or Calculate - the worst possible grant for an
    unauthenticated caller, since Pull All overwrites every table."""
    guest_id = _role_id(admin_client, "guest")
    response = admin_client.put(
        f"{ROLES}{guest_id}/permissions", json={"permissions": [PERM_MANAGE_PIPELINES]}
    )
    assert response.status_code == 409
    body = response.json()
    assert "guest" in body["detail"].lower()
    assert PERM_MANAGE_PIPELINES in body["detail"]
    after = admin_client.get(f"{ROLES}{guest_id}").json()
    assert PERM_MANAGE_PIPELINES not in after["permissions"]
