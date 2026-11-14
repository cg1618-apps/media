"""
Per-account feature switches: the four `feature_*` columns on users.

Only `quotes_memes` gates anything - the quote and meme reads - and it does
so in place of view.extras. Only a `user` or `super` account may hold one.

Every refusal is paired with its mirror on the same data, and the quote and
meme the reads ask for exist (`quote_and_meme`), so a 401 is the gate and not
an empty table.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.rbac.features import FEATURE_COLUMNS, FEATURE_NAMES
from tests.api.conftest import role_id_for


@pytest.fixture
def quote_and_meme(db_session, owner_client, sample_anime):
    """One quote and one meme, and the URLs that read them. Load-bearing for
    every refusal below: without rows a refused list and an empty one could
    not be told apart."""
    quote = owner_client.post("/api/quote/", json={"text": "名台詞"})
    assert quote.status_code == 200, quote.text
    meme = owner_client.post(
        "/api/meme/",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "text": "迷因",
        },
    )
    assert meme.status_code == 200, meme.text
    quote_id, meme_id = quote.json()["system_id"], meme.json()["system_id"]
    return {
        "quote_id": quote_id,
        "meme_id": meme_id,
        "urls": [
            "/api/quote/",
            "/api/quote/grouped",
            f"/api/quote/{quote_id}",
            "/api/meme/",
            "/api/meme/grouped",
            f"/api/meme/{meme_id}",
        ],
    }


def _switch(db, user, on):
    user.feature_quotes_memes = on
    db.flush()


# ---------------------------------------------------------------------------
# The read gate
# ---------------------------------------------------------------------------


def test_a_member_without_the_switch_is_refused_every_read(
    db_session, user_client, plain_user, quote_and_meme
):
    """plain_user's role holds view.extras, so this is the switch refusing,
    not the permission."""
    _switch(db_session, plain_user, False)
    for url in quote_and_meme["urls"]:
        assert user_client.get(url).status_code == 401, url


def test_a_member_with_the_switch_reads_them(
    db_session, user_client, plain_user, quote_and_meme
):
    """The mirror: the same account and rows, switched on."""
    _switch(db_session, plain_user, True)
    for url in quote_and_meme["urls"]:
        r = user_client.get(url)
        assert r.status_code == 200, (url, r.text)
    listed = user_client.get("/api/quote/").json()
    assert quote_and_meme["quote_id"] in {q["system_id"] for q in listed}
    memes = user_client.get("/api/meme/").json()
    assert quote_and_meme["meme_id"] in {m["system_id"] for m in memes}


def test_an_anonymous_visitor_is_refused(client, quote_and_meme):
    for url in quote_and_meme["urls"]:
        assert client.get(url).status_code == 401, url


def test_the_admin_reads_no_quotes_or_memes(
    db_session, admin_client, owner_client, owner_user, quote_and_meme
):
    """No role holds a feature without its account's switch, and the admin
    account can never be switched on. The quote and the meme are THERE
    (quote_and_meme), so the 401 is the gate's."""
    for url in quote_and_meme["urls"]:
        assert admin_client.get(url).status_code == 401, url

    # The mirror: the same reads open for an account whose switch is on.
    _switch(db_session, owner_user, True)
    for url in quote_and_meme["urls"]:
        assert owner_client.get(url).status_code == 200, url


def test_view_extras_opens_neither_resources_nor_quotes(
    db_session, user_client, plain_user, quote_and_meme
):
    """Resources moved to manage.resources and quotes and memes to the
    switch, so a member holding view.extras reads neither. The refusal of
    /api/resources against a populated tree, with its mirror, is in
    test_admin_page_permissions.py."""
    _switch(db_session, plain_user, False)
    assert user_client.get("/api/resources").status_code == 401
    assert user_client.get("/api/quote/").status_code == 401


# ---------------------------------------------------------------------------
# /me
# ---------------------------------------------------------------------------


def test_me_names_the_features_the_account_holds(db_session, user_client, plain_user):
    assert user_client.get("/api/auth/me").json()["features"] == []
    plain_user.feature_quotes_memes = True
    plain_user.feature_mod_status = True
    db_session.flush()
    assert user_client.get("/api/auth/me").json()["features"] == [
        "quotes_memes",
        "mod_status",
    ]


def test_me_gives_a_guest_no_features(client):
    assert client.get("/api/auth/me").json()["features"] == []


def test_me_gives_the_admin_no_features(admin_client):
    assert admin_client.get("/api/auth/me").json()["features"] == []


# ---------------------------------------------------------------------------
# PATCH /api/users/{id}
# ---------------------------------------------------------------------------


def _shared(db):
    return db.query(models.User).filter(models.User.username == "shared-normal").one()


@pytest.mark.parametrize("column", FEATURE_COLUMNS)
def test_switching_a_feature_on_for_a_shared_account_is_409(
    db_session, admin_client, column
):
    shared = _shared(db_session)
    r = admin_client.patch(f"/api/users/{shared.id}", json={column: True})
    assert r.status_code == 409, r.text
    db_session.refresh(shared)
    assert getattr(shared, column) is False


@pytest.mark.parametrize("column", FEATURE_COLUMNS)
def test_switching_a_feature_on_for_the_admin_account_is_409(
    db_session, admin_client, admin_user, column
):
    r = admin_client.patch(f"/api/users/{admin_user.id}", json={column: True})
    assert r.status_code == 409, r.text
    db_session.refresh(admin_user)
    assert getattr(admin_user, column) is False


@pytest.mark.parametrize("column", FEATURE_COLUMNS)
def test_switching_a_feature_on_for_a_member_is_200(
    db_session, admin_client, plain_user, column
):
    """The mirror of both refusals above."""
    r = admin_client.patch(f"/api/users/{plain_user.id}", json={column: True})
    assert r.status_code == 200, r.text
    assert r.json()[column] is True
    db_session.refresh(plain_user)
    assert getattr(plain_user, column) is True


def test_switching_a_feature_on_for_a_super_is_200(
    db_session, admin_client, super_user
):
    r = admin_client.patch(
        f"/api/users/{super_user.id}", json={"feature_quotes_memes": True}
    )
    assert r.status_code == 200, r.text
    assert r.json()["feature_quotes_memes"] is True


def test_switching_off_is_always_allowed(db_session, admin_client):
    shared = _shared(db_session)
    r = admin_client.patch(
        f"/api/users/{shared.id}", json={"feature_quotes_memes": False}
    )
    assert r.status_code == 200, r.text


def test_leaving_a_feature_out_leaves_it_alone(db_session, admin_client, plain_user):
    plain_user.feature_favourites = True
    db_session.flush()
    r = admin_client.patch(f"/api/users/{plain_user.id}", json={"username": "renamed"})
    assert r.status_code == 200, r.text
    db_session.refresh(plain_user)
    assert plain_user.feature_favourites is True


def test_a_role_change_from_user_to_super_keeps_the_switches(
    db_session, admin_client, plain_user
):
    for column in FEATURE_COLUMNS:
        setattr(plain_user, column, True)
    db_session.flush()

    r = admin_client.patch(
        f"/api/users/{plain_user.id}",
        json={"role_id": str(role_id_for(db_session, "super"))},
    )

    assert r.status_code == 200, r.text
    assert r.json()["role_name"] == "super"
    assert all(r.json()[column] is True for column in FEATURE_COLUMNS)


def test_the_user_list_carries_every_switch(admin_client, plain_user):
    rows = {u["username"]: u for u in admin_client.get("/api/users/").json()}
    assert {c: rows["plainuser"][c] for c in FEATURE_COLUMNS} == {
        c: False for c in FEATURE_COLUMNS
    }


def test_the_names_and_columns_agree():
    assert FEATURE_COLUMNS == tuple(f"feature_{n}" for n in FEATURE_NAMES)
    for column in FEATURE_COLUMNS:
        col = models.User.__table__.c[column]
        assert col.nullable is False
        assert str(col.server_default.arg) == "false"


def test_a_stored_switch_on_a_shared_account_opens_nothing(
    db_session, user_client, plain_user, quote_and_meme
):
    """A Pull of a hand-edited sheet can store the column on a shared account;
    PATCH would have refused it. The gate asks the role too, so the stored
    value opens nothing. Mirror: the same stored value on a member does."""
    from tests.api.test_shared_accounts import _client_for

    shared = _shared(db_session)
    _switch(db_session, shared, True)
    _switch(db_session, plain_user, True)

    assert _client_for(db_session, shared).get("/api/quote/").status_code == 401
    assert user_client.get("/api/quote/").status_code == 200


def _viewer(user=None):
    from app.services.rbac.resolver import Viewer

    return Viewer(
        username=user.username if user else None,
        role_id=user.role_id if user else None,
        role_name=user.role if user else "guest",
        permissions=frozenset(),
        user_id=user.id if user else None,
    )


def test_has_feature_answers_for_a_viewer(db_session, plain_user):
    """The one server-side question every later gate asks. Mirror pair on
    the same account: off, then on."""
    from app.services.rbac.features import FEATURE_QUOTES_MEMES, has_feature

    _switch(db_session, plain_user, False)
    assert has_feature(db_session, _viewer(plain_user), FEATURE_QUOTES_MEMES) is False
    _switch(db_session, plain_user, True)
    assert has_feature(db_session, _viewer(plain_user), FEATURE_QUOTES_MEMES) is True


def test_has_feature_gives_a_guest_nothing(db_session):
    from app.services.rbac.features import FEATURE_NAMES, has_feature

    assert not any(has_feature(db_session, _viewer(), name) for name in FEATURE_NAMES)


def test_has_feature_refuses_an_unknown_name(db_session):
    """`favorites` is the spelling a second module once proposed; there is one
    spelling, and a typo must fail loudly rather than answer False."""
    from app.services.rbac.features import has_feature

    with pytest.raises(ValueError):
        has_feature(db_session, _viewer(), "favorites")


def test_a_role_outside_the_five_gets_no_features(db_session, plain_user):
    """The allowlist fails closed: a bespoke or renamed role - a restore, a
    future role, a hand edit - holds no feature even with every switch
    stored. Mirror: the same stored switches on a `user` account count."""
    import uuid

    from app.services.rbac.features import held_features

    stray = models.Role(
        system_id=uuid.uuid4(), name="friend", label="Friend"
    )
    db_session.add(stray)
    db_session.flush()
    for column in FEATURE_COLUMNS:
        setattr(plain_user, column, True)
    db_session.flush()
    assert held_features(plain_user) == list(FEATURE_NAMES)

    plain_user.role_id = stray.system_id
    db_session.flush()
    db_session.refresh(plain_user)
    assert held_features(plain_user) == []
