"""
Favourite quotes and memes belong to an account (user_favorite), and are a
granted feature: an account holds them only with its `favourites` switch on.

Every read keeps the old field name, `is_favorite`, filled with the VIEWER'S
own answer - false for a guest, the admin, and any account without the
switch. The `is_favorite` list filter asks the viewer's own favourites. The
one write is PUT /api/me/favorites/{kind}/{id}; the catalogue writes ignore
the key.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app import models
from app.main import app
from app.services.rbac import cache as rbac_cache
from app.services.rbac.seed_modes import MODE_SAFE
from app.services.security import create_access_token, get_password_hash
from tests.api.conftest import (  # noqa: F401
    hidden_anime,
    nsfw_label,
    role_id_for,
    seed_modes_and_grant,
)


def _member(db, username, favourites=True, quotes_memes=True, role="user"):
    user = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, role),
        feature_quotes_memes=quotes_memes,
        feature_favourites=favourites,
    )
    db.add(user)
    db.flush()
    return user


def _login(db, user, role="user", safe=False):
    """A signed-in client. The `client` fixture must be requested too: it
    installs the database override every TestClient here shares."""
    if safe:
        user.mode_ceiling = MODE_SAFE
        user.mode_default = MODE_SAFE
        db.flush()
        mode_id = (
            db.query(models.AccessMode)
            .filter(models.AccessMode.key == MODE_SAFE)
            .one()
            .system_id
        )
        rbac_cache.bump()
    else:
        mode_id = seed_modes_and_grant(db, user)
    token = create_access_token(
        {"sub": user.username, "role": role, "mode": str(mode_id or "")}
    )
    c = TestClient(app)
    c.cookies.set("access_token", f"Bearer {token}")
    return c


@pytest.fixture
def mio(db_session):
    return _member(db_session, "mio_fan")


@pytest.fixture
def kana(db_session):
    return _member(db_session, "kana_fan")


@pytest.fixture
def mio_client(db_session, client, mio):
    return _login(db_session, mio)


@pytest.fixture
def kana_client(db_session, client, kana):
    return _login(db_session, kana)


@pytest.fixture
def quote(db_session, owner_user, sample_anime):
    q = models.Quote(
        system_id=uuid.uuid4(),
        author_id=owner_user.id,
        media_type="anime",
        entry_id=sample_anime.system_id,
        text="A line worth keeping",
    )
    db_session.add(q)
    db_session.flush()
    return q


@pytest.fixture
def other_quote(db_session, owner_user, sample_anime):
    q = models.Quote(
        system_id=uuid.uuid4(),
        author_id=owner_user.id,
        media_type="anime",
        entry_id=sample_anime.system_id,
        text="A line nobody keeps",
    )
    db_session.add(q)
    db_session.flush()
    return q


@pytest.fixture
def meme(db_session, owner_user, sample_anime):
    m = models.Meme(
        system_id=uuid.uuid4(),
        author_id=owner_user.id,
        media_id=sample_anime.system_id,
        text="A running gag",
    )
    db_session.add(m)
    db_session.flush()
    return m


def _fav(db, user, quote=None, meme=None):
    db.add(
        models.UserFavorite(
            user_id=user.id,
            quote_id=quote.system_id if quote else None,
            meme_id=meme.system_id if meme else None,
        )
    )
    db.flush()


def _put(c, kind, item_id, value=True):
    return c.put(f"/api/me/favorites/{kind}/{item_id}", json={"is_favorite": value})


def _quote_flags(c, **params):
    r = c.get("/api/quote/", params=params)
    assert r.status_code == 200, r.text
    return {row["system_id"]: row["is_favorite"] for row in r.json()}


def _meme_flags(c, **params):
    r = c.get("/api/meme/", params=params)
    assert r.status_code == 200, r.text
    return {row["system_id"]: row["is_favorite"] for row in r.json()}


# --- The model -----------------------------------------------------------


def test_the_shared_rows_carry_no_favourite_column():
    assert "is_favorite" not in models.Quote.__table__.c
    assert "is_favorite" not in models.Meme.__table__.c


# --- Each account reads its own -----------------------------------------


def test_two_accounts_each_read_their_own_quote_favourite(
    db_session, mio, mio_client, kana_client, quote
):
    """The refusal bites because a favourite EXISTS - mio's - when kana
    reads; the mirror is mio reading it."""
    _fav(db_session, mio, quote=quote)
    qid = str(quote.system_id)

    assert _quote_flags(mio_client)[qid] is True
    assert _quote_flags(kana_client)[qid] is False
    assert mio_client.get(f"/api/quote/{qid}").json()["is_favorite"] is True
    assert kana_client.get(f"/api/quote/{qid}").json()["is_favorite"] is False
    grouped = mio_client.get("/api/quote/grouped").json()
    flags = {q["system_id"]: q["is_favorite"] for g in grouped for q in g["quotes"]}
    assert flags[qid] is True


def test_two_accounts_each_read_their_own_meme_favourite(
    db_session, mio, mio_client, kana_client, meme
):
    _fav(db_session, mio, meme=meme)
    mid = str(meme.system_id)

    assert _meme_flags(mio_client)[mid] is True
    assert _meme_flags(kana_client)[mid] is False
    assert mio_client.get(f"/api/meme/{mid}").json()["is_favorite"] is True
    grouped = kana_client.get("/api/meme/grouped").json()
    flags = {m["system_id"]: m["is_favorite"] for g in grouped for m in g["memes"]}
    assert flags[mid] is False


def test_an_account_with_the_switch_off_reads_false_even_over_its_own_rows(
    db_session, client, quote
):
    """A stored row of its own, and the switch off: the switch wins. The
    mirror is the same account with the switch on."""
    off = _member(db_session, "switch_off", favourites=False)
    _fav(db_session, off, quote=quote)
    off_client = _login(db_session, off)

    assert _quote_flags(off_client)[str(quote.system_id)] is False

    off.feature_favourites = True
    db_session.flush()
    assert _quote_flags(off_client)[str(quote.system_id)] is True


def test_the_admin_reads_no_quote_and_so_no_favourite(
    db_session, admin_client, mio, mio_client, quote
):
    """The admin holds no feature - not quotes_memes, not favourites - so
    the read itself is refused, with somebody else's favourite present."""
    _fav(db_session, mio, quote=quote)
    assert admin_client.get("/api/quote/").status_code == 401
    # The mirror: the favourite exists and its author reads it.
    assert _quote_flags(mio_client)[str(quote.system_id)] is True


# --- The filter is the viewer's -------------------------------------------


def test_the_favourite_filter_asks_the_viewers_own(
    db_session, mio, mio_client, kana, kana_client, quote, other_quote, meme
):
    _fav(db_session, mio, quote=quote)
    _fav(db_session, kana, quote=other_quote)
    _fav(db_session, mio, meme=meme)

    assert set(_quote_flags(mio_client, is_favorite=True)) == {str(quote.system_id)}
    assert set(_quote_flags(kana_client, is_favorite=True)) == {
        str(other_quote.system_id)
    }
    assert str(quote.system_id) not in _quote_flags(mio_client, is_favorite=False)
    assert str(quote.system_id) in _quote_flags(kana_client, is_favorite=False)
    assert set(_meme_flags(mio_client, is_favorite=True)) == {str(meme.system_id)}
    assert _meme_flags(kana_client, is_favorite=True) == {}
    grouped = kana_client.get("/api/quote/grouped", params={"is_favorite": True}).json()
    assert [q["system_id"] for g in grouped for q in g["quotes"]] == [
        str(other_quote.system_id)
    ]


def test_without_the_switch_the_filter_finds_nothing(db_session, client, mio, quote):
    """Somebody's favourite exists, so an empty answer is the switch."""
    _fav(db_session, mio, quote=quote)
    off = _member(db_session, "filter_off", favourites=False)
    _fav(db_session, off, quote=quote)
    off_client = _login(db_session, off)

    assert _quote_flags(off_client, is_favorite=True) == {}
    assert str(quote.system_id) in _quote_flags(off_client, is_favorite=False)


# --- The write ---------------------------------------------------------------


def test_put_favours_and_clears_idempotently(db_session, mio, mio_client, quote, meme):
    for _ in range(2):
        r = _put(mio_client, "quote", quote.system_id)
        assert r.status_code == 200, r.text
        assert r.json() == {
            "kind": "quote",
            "item_id": str(quote.system_id),
            "is_favorite": True,
        }
    assert db_session.query(models.UserFavorite).filter_by(user_id=mio.id).count() == 1

    assert _put(mio_client, "meme", meme.system_id).json()["is_favorite"] is True
    assert _meme_flags(mio_client)[str(meme.system_id)] is True

    for _ in range(2):
        r = _put(mio_client, "quote", quote.system_id, False)
        assert r.status_code == 200
        assert r.json()["is_favorite"] is False
    assert (
        db_session.query(models.UserFavorite)
        .filter_by(user_id=mio.id, quote_id=quote.system_id)
        .count()
        == 0
    )


def test_put_writes_only_the_callers_row(
    db_session, mio, mio_client, kana, kana_client, quote
):
    _fav(db_session, kana, quote=quote)
    _put(mio_client, "quote", quote.system_id)
    _put(mio_client, "quote", quote.system_id, False)

    rows = db_session.query(models.UserFavorite).all()
    assert [(r.user_id, r.quote_id) for r in rows] == [(kana.id, quote.system_id)]


def test_put_without_the_favourites_switch_is_401(db_session, client, mio, quote):
    """Another account's favourite of the same quote exists, and the caller
    reads quotes - so the refusal is the switch. Mirror: the switch on."""
    _fav(db_session, mio, quote=quote)
    off = _member(db_session, "put_off", favourites=False)
    off_client = _login(db_session, off)

    assert _put(off_client, "quote", quote.system_id).status_code == 401
    assert db_session.query(models.UserFavorite).filter_by(user_id=off.id).count() == 0

    off.feature_favourites = True
    db_session.flush()
    assert _put(off_client, "quote", quote.system_id).status_code == 200


def test_put_without_the_quotes_and_memes_switch_is_401(db_session, client, quote):
    """Favourites on, but the reads it would favour are off: the same 401
    the quote GET gives."""
    off = _member(db_session, "no_quotes", quotes_memes=False)
    off_client = _login(db_session, off)

    assert off_client.get("/api/quote/").status_code == 401
    assert _put(off_client, "quote", quote.system_id).status_code == 401


def test_a_guest_and_the_admin_cannot_write(client, admin_client, quote):
    assert _put(client, "quote", quote.system_id).status_code == 401
    assert _put(admin_client, "quote", quote.system_id).status_code == 401


def test_put_on_a_hidden_quote_or_meme_is_404(
    db_session, client, owner_user, hidden_anime, quote
):
    """A safe-mode account cannot see an nsfw entry, so it may not favour
    its quote or meme - the same 404 the GET gives. Mirror: a visible quote
    through the same account."""
    hidden_q = models.Quote(
        system_id=uuid.uuid4(),
        author_id=owner_user.id,
        media_type="anime",
        entry_id=hidden_anime.system_id,
        text="hidden line",
    )
    hidden_m = models.Meme(
        system_id=uuid.uuid4(),
        author_id=owner_user.id,
        media_id=hidden_anime.system_id,
        text="hidden gag",
    )
    db_session.add_all([hidden_q, hidden_m])
    db_session.flush()
    safe = _member(db_session, "safe_fan")
    safe_client = _login(db_session, safe, safe=True)

    assert safe_client.get(f"/api/quote/{hidden_q.system_id}").status_code == 404
    r = _put(safe_client, "quote", hidden_q.system_id)
    assert (r.status_code, r.json()["detail"]) == (404, "Quote not found.")
    r = _put(safe_client, "meme", hidden_m.system_id)
    assert (r.status_code, r.json()["detail"]) == (404, "Meme not found.")
    assert db_session.query(models.UserFavorite).filter_by(user_id=safe.id).count() == 0

    assert _put(safe_client, "quote", quote.system_id).status_code == 200


def test_put_on_a_missing_item_or_kind_is_404(mio_client, quote):
    assert _put(mio_client, "quote", uuid.uuid4()).status_code == 404
    assert _put(mio_client, "note", quote.system_id).status_code == 404


def test_put_refuses_a_body_without_the_flag(mio_client, quote):
    r = mio_client.put(f"/api/me/favorites/quote/{quote.system_id}", json={})
    assert r.status_code == 422


# --- The catalogue writes ignore it ------------------------------------------


def test_catalogue_writes_ignore_is_favorite(
    db_session, client, super_user, sample_anime, quote, meme
):
    """An old SPA bundle still sends the key; nothing is stored for anyone.
    The writer holds the favourites switch, so storing it would be possible."""
    super_user.feature_favourites = True
    super_user.feature_quotes_memes = True
    db_session.flush()
    writer = _login(db_session, super_user, role="super")

    r = writer.post(
        "/api/quote/",
        json={
            "media_type": "anime",
            "entry_id": str(sample_anime.system_id),
            "text": "new line",
            "is_favorite": True,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["is_favorite"] is False
    assert writer.patch(
        f"/api/quote/{quote.system_id}", json={"is_favorite": True}
    ).status_code == 200
    assert writer.patch(
        f"/api/meme/{meme.system_id}", json={"is_favorite": True}
    ).status_code == 200
    r = writer.post(
        "/api/meme/",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "text": "new gag",
            "is_favorite": True,
        },
    )
    assert r.status_code == 200, r.text
    assert db_session.query(models.UserFavorite).count() == 0


# --- Cascades ----------------------------------------------------------------


def test_deleting_the_quote_the_meme_or_the_account_takes_the_favourite(
    db_session, mio, kana, quote, meme
):
    _fav(db_session, mio, quote=quote)
    _fav(db_session, mio, meme=meme)
    _fav(db_session, kana, quote=quote)

    db_session.delete(meme)
    db_session.flush()
    db_session.expire_all()
    assert db_session.query(models.UserFavorite).filter_by(user_id=mio.id).count() == 1

    db_session.delete(quote)
    db_session.flush()
    db_session.expire_all()
    assert db_session.query(models.UserFavorite).count() == 0

    other = models.Quote(
        system_id=uuid.uuid4(), author_id=kana.id, text="kana's own"
    )
    db_session.add(other)
    db_session.flush()
    _fav(db_session, mio, quote=other)
    db_session.delete(mio)
    db_session.flush()
    db_session.expire_all()
    assert db_session.query(models.UserFavorite).count() == 0


def test_one_row_holds_exactly_one_item(db_session, mio, quote, meme):
    from sqlalchemy.exc import IntegrityError

    db_session.add(
        models.UserFavorite(user_id=mio.id, quote_id=quote.system_id, meme_id=meme.system_id)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
