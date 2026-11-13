"""
Requests and reports: what a member files, and the inbox that handles them.

Two gates and nothing else. `self.requests` files a request and reads and
edits your own; `manage.requests` is the inbox. Every refusal below is paired
with the mirror case that must still succeed, so a 401 or 409 proves the gate
or the rule did the refusing rather than something incidental.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app import models
from app.main import app
from app.services.rbac.seed_modes import MODE_NORMAL
from app.services.security import create_access_token, get_password_hash
from tests.api.conftest import role_id_for, seed_modes_and_grant

REQUESTS = "/api/requests"
MINE = "/api/requests/mine"


def _bug(**fields):
    body = {"kind": "bug", "description": "The page does not load."}
    body.update(fields)
    return body


def _file(c, **fields):
    response = c.post(REQUESTS, json=_bug(**fields))
    assert response.status_code == 201, response.text
    return response.json()


def _client_for(db_session, user):
    """A signed-in client for any account, the way user_client builds one.

    The get_db override is already installed by whichever fixture client the
    test also requested.
    """
    mode_id = seed_modes_and_grant(db_session, user)
    token = create_access_token(
        {"sub": user.username, "role": user.role, "mode": str(mode_id or "")}
    )
    c = TestClient(app)
    c.cookies.set("access_token", f"Bearer {token}")
    return c


@pytest.fixture
def second_user(db_session):
    user = models.User(
        id=uuid.uuid4(),
        username="seconduser",
        hashed_password=get_password_hash("testpass"),
        role_id=role_id_for(db_session, "user"),
    )
    db_session.add(user)
    db_session.flush()
    return user


# ---------------------------------------------------------------------------
# Filing, reading and editing your own
# ---------------------------------------------------------------------------


def test_a_user_files_reads_and_edits_their_own(user_client):
    filed = _file(user_client, remark="Chrome on Windows", page_path="/anime")
    assert filed["status"] == "open"
    assert filed["author_username"] == "plainuser"
    assert filed["can_edit"] is True
    assert filed["page_path"] == "/anime"
    assert filed["target"] is None

    mine = user_client.get(MINE).json()
    assert [r["id"] for r in mine] == [filed["id"]]

    edited = user_client.patch(
        f"{REQUESTS}/{filed['id']}",
        json={"description": "It loads now, but slowly.", "remark": None},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["description"] == "It loads now, but slowly."
    assert edited.json()["remark"] is None


def test_a_super_files_reads_and_edits_their_own(super_client):
    filed = _file(super_client)
    assert super_client.get(MINE).json()[0]["id"] == filed["id"]
    edited = super_client.patch(
        f"{REQUESTS}/{filed['id']}", json={"remark": "Still broken."}
    )
    assert edited.status_code == 200
    assert edited.json()["remark"] == "Still broken."


def test_the_edit_touches_only_description_and_remark(user_client):
    filed = _file(user_client)
    response = user_client.patch(f"{REQUESTS}/{filed['id']}", json={"kind": "other"})
    assert response.status_code == 422
    # The mirror: the same call with an editable field is accepted.
    ok = user_client.patch(f"{REQUESTS}/{filed['id']}", json={"remark": "x"})
    assert ok.status_code == 200


def test_mine_filters_by_status(user_client, super_client):
    first = _file(user_client)
    second = _file(user_client)
    super_client.put(f"{REQUESTS}/{first['id']}/status", json={"status": "done"})

    open_ids = [r["id"] for r in user_client.get(MINE, params={"status": "open"}).json()]
    done_ids = [r["id"] for r in user_client.get(MINE, params={"status": "done"}).json()]
    assert open_ids == [second["id"]]
    assert done_ids == [first["id"]]
    # Newest first, both statuses, when no filter is given.
    assert [r["id"] for r in user_client.get(MINE).json()] == [
        second["id"],
        first["id"],
    ]


def test_the_filer_sees_the_handlers_response(user_client, super_client):
    filed = _file(user_client)
    super_client.put(
        f"{REQUESTS}/{filed['id']}/status",
        json={"status": "declined", "response": "Works as intended."},
    )
    row = user_client.get(MINE).json()[0]
    assert row["status"] == "declined"
    assert row["response"] == "Works as intended."
    assert row["handled_by_username"] == "root role"
    assert row["can_edit"] is False


# ---------------------------------------------------------------------------
# Refusals that bite
# ---------------------------------------------------------------------------


def test_a_guest_cannot_file_or_read(client, user_client):
    assert client.post(REQUESTS, json=_bug()).status_code == 401
    assert client.get(MINE).status_code == 401
    # The mirror: the same call from a member is accepted.
    assert user_client.post(REQUESTS, json=_bug()).status_code == 201


def test_the_admin_cannot_file(admin_client, user_client):
    """Root, but self.* is not short-circuited: an admin account holds no
    rows of its own."""
    assert admin_client.post(REQUESTS, json=_bug()).status_code == 401
    assert admin_client.get(MINE).status_code == 401
    assert user_client.post(REQUESTS, json=_bug()).status_code == 201


def test_a_user_is_refused_every_inbox_route(user_client, super_client):
    filed = _file(user_client)
    rid = filed["id"]
    calls = (
        ("get", REQUESTS, None),
        ("get", f"{REQUESTS}/summary", None),
        ("put", f"{REQUESTS}/{rid}/status", {"status": "done"}),
        ("delete", f"{REQUESTS}/{rid}", None),
    )
    for method, path, body in calls:
        kwargs = {"json": body} if body is not None else {}
        assert getattr(user_client, method)(path, **kwargs).status_code == 401, path

    # The mirror, in the same order: super reaches every one.
    assert super_client.get(REQUESTS).status_code == 200
    assert super_client.get(f"{REQUESTS}/summary").status_code == 200
    assert (
        super_client.put(f"{REQUESTS}/{rid}/status", json={"status": "done"}).status_code
        == 200
    )
    assert super_client.delete(f"{REQUESTS}/{rid}").status_code == 204


def test_admin_handles_requests(admin_client, user_client):
    """Passes through root today. It is the test that fails if the admin's
    fixed permission set ever forgets manage.requests."""
    filed = _file(user_client)
    inbox = admin_client.get(REQUESTS)
    assert inbox.status_code == 200
    assert [r["id"] for r in inbox.json()] == [filed["id"]]
    handled = admin_client.put(
        f"{REQUESTS}/{filed['id']}/status", json={"status": "done"}
    )
    assert handled.status_code == 200
    assert handled.json()["handled_by_username"] == "aaa_testadmin"


# ---------------------------------------------------------------------------
# Another account's request
# ---------------------------------------------------------------------------


def test_another_users_request_is_invisible_and_unwritable(
    db_session, user_client, second_user
):
    other = _client_for(db_session, second_user)
    theirs = _file(other)
    mine = _file(user_client)

    assert [r["id"] for r in user_client.get(MINE).json()] == [mine["id"]]
    response = user_client.patch(f"{REQUESTS}/{theirs['id']}", json={"remark": "x"})
    assert response.status_code == 404
    # The mirror: the owner's own PATCH of that same request is accepted.
    assert other.patch(f"{REQUESTS}/{theirs['id']}", json={"remark": "x"}).status_code == 200


# ---------------------------------------------------------------------------
# The edit lock, and reopening
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("closed", ["done", "declined"])
def test_a_closed_request_cannot_be_edited_until_reopened(
    user_client, super_client, closed
):
    filed = _file(user_client)
    path = f"{REQUESTS}/{filed['id']}"
    super_client.put(f"{path}/status", json={"status": closed})

    assert user_client.patch(path, json={"remark": "late"}).status_code == 409

    reopened = super_client.put(f"{path}/status", json={"status": "open"})
    assert reopened.status_code == 200
    assert reopened.json()["handled_by_username"] is None
    assert reopened.json()["handled_at"] is None
    assert user_client.patch(path, json={"remark": "late"}).status_code == 200


def test_handling_records_who_and_when(user_client, super_client):
    filed = _file(user_client)
    handled = super_client.put(
        f"{REQUESTS}/{filed['id']}/status",
        json={"status": "done", "response": "Fixed."},
    ).json()
    assert handled["status"] == "done"
    assert handled["response"] == "Fixed."
    assert handled["handled_by_username"] == "root role"
    assert handled["handled_at"] is not None


def test_an_unknown_status_is_422(user_client, super_client):
    filed = _file(user_client)
    response = super_client.put(
        f"{REQUESTS}/{filed['id']}/status", json={"status": "closed"}
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# The open-request limit
# ---------------------------------------------------------------------------


def test_the_limit_counts_open_requests_only(db_session, plain_user, user_client, super_client):
    plain_user.open_request_limit = 2
    db_session.flush()

    first = _file(user_client)
    _file(user_client)
    over = user_client.post(REQUESTS, json=_bug())
    assert over.status_code == 409
    assert "2" in over.json()["detail"]

    # Handling one frees its slot, so the 409 above was the count and not
    # something about the request or the account.
    super_client.put(f"{REQUESTS}/{first['id']}/status", json={"status": "done"})
    assert user_client.post(REQUESTS, json=_bug()).status_code == 201


def test_no_limit_files_past_fifteen(super_client, super_user):
    assert super_user.open_request_limit is None
    for _ in range(16):
        _file(super_client)
    assert len(super_client.get(MINE).json()) == 16


def test_a_stored_limit_is_never_enforced_on_super(db_session, super_user, super_client):
    super_user.open_request_limit = 1
    db_session.flush()
    _file(super_client)
    assert super_client.post(REQUESTS, json=_bug()).status_code == 201


# ---------------------------------------------------------------------------
# Kind and target
# ---------------------------------------------------------------------------


def test_an_unknown_kind_is_422(user_client):
    assert user_client.post(REQUESTS, json=_bug(kind="praise")).status_code == 422


def test_an_unknown_target_is_422(user_client, sample_anime):
    missing = user_client.post(
        REQUESTS,
        json=_bug(kind="data_error", target_type="anime", target_id=str(uuid.uuid4())),
    )
    assert missing.status_code == 422
    bad_type = user_client.post(
        REQUESTS,
        json=_bug(kind="data_error", target_type="planet", target_id=str(sample_anime.system_id)),
    )
    assert bad_type.status_code == 422
    half = user_client.post(REQUESTS, json=_bug(target_type="anime"))
    assert half.status_code == 422
    # The mirror: the same anime, named by its real id, is accepted.
    ok = user_client.post(
        REQUESTS,
        json=_bug(kind="data_error", target_type="anime", target_id=str(sample_anime.system_id)),
    )
    assert ok.status_code == 201


def test_a_target_is_resolved_and_its_name_kept(db_session, user_client, sample_anime):
    filed = _file(
        user_client,
        kind="data_error",
        target_type="anime",
        target_id=str(sample_anime.system_id),
        page_path=f"/anime/{sample_anime.system_id}",
    )
    target = filed["target"]
    assert target["type"] == "anime"
    assert target["id"] == str(sample_anime.system_id)
    assert target["label"] == sample_anime.display_name
    assert target["nav_path"] == f"/anime/{sample_anime.system_id}"
    assert target["missing"] is False

    # The entry goes; the request still says what it was about.
    db_session.delete(sample_anime)
    db_session.flush()
    target = user_client.get(MINE).json()[0]["target"]
    assert target["missing"] is True
    assert target["label"] == filed["target"]["label"]
    assert target["nav_path"] is None


def test_an_entity_can_be_a_target(user_client, person):
    filed = _file(
        user_client,
        kind="incomplete_data",
        target_type="person",
        target_id=str(person.system_id),
    )
    assert filed["target"]["nav_path"] == f"/person/{person.system_id}"
    assert filed["target"]["label"] == person.display_name


def test_a_target_the_filers_mode_hides_is_accepted(mode_client, plain_user, hidden_anime):
    """Requesting something your mode hides is allowed. The GET proves the
    entry IS hidden from this session, so the 201 is not vacuous."""
    c = mode_client(MODE_NORMAL, user=plain_user)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404
    response = c.post(
        REQUESTS,
        json=_bug(
            kind="data_error",
            target_type="anime",
            target_id=str(hidden_anime.system_id),
        ),
    )
    assert response.status_code == 201, response.text


# ---------------------------------------------------------------------------
# The inbox
# ---------------------------------------------------------------------------


def test_the_inbox_filters_by_status_and_opens_on_open(user_client, super_client):
    first = _file(user_client)
    second = _file(user_client)
    super_client.put(f"{REQUESTS}/{first['id']}/status", json={"status": "declined"})

    assert [r["id"] for r in super_client.get(REQUESTS).json()] == [second["id"]]
    declined = super_client.get(REQUESTS, params={"status": "declined"}).json()
    assert [r["id"] for r in declined] == [first["id"]]
    every = super_client.get(REQUESTS, params={"status": "all"}).json()
    assert {r["id"] for r in every} == {first["id"], second["id"]}
    assert super_client.get(REQUESTS, params={"status": "nope"}).status_code == 422


def test_the_summary_counts_open_requests(user_client, super_client):
    assert super_client.get(f"{REQUESTS}/summary").json() == {"open": 0}
    first = _file(user_client)
    _file(user_client)
    super_client.put(f"{REQUESTS}/{first['id']}/status", json={"status": "done"})
    assert super_client.get(f"{REQUESTS}/summary").json() == {"open": 1}


def test_a_deleted_request_is_gone_from_the_authors_list(user_client, super_client):
    filed = _file(user_client)
    assert super_client.delete(f"{REQUESTS}/{filed['id']}").status_code == 204
    assert user_client.get(MINE).json() == []
    assert super_client.delete(f"{REQUESTS}/{filed['id']}").status_code == 404


def test_a_deleted_account_leaves_its_requests_in_the_inbox(
    admin_client, db_session, user_client, plain_user
):
    filed = _file(user_client)
    assert admin_client.delete(f"/api/users/{plain_user.id}").status_code == 204
    rows = admin_client.get(REQUESTS).json()
    assert [r["id"] for r in rows] == [filed["id"]]
    assert rows[0]["author_username"] is None


def test_the_kinds_are_served_as_constants(client):
    body = client.get("/api/constants").json()
    assert body["request_kind"] == [
        "new_entry",
        "data_error",
        "incomplete_data",
        "bug",
        "other",
    ]
    assert body["request_status"] == ["open", "done", "declined"]
