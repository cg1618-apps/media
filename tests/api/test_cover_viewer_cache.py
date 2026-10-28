"""
The cover route resolves its viewer once per session every few seconds.

A library page fires a hundred or more cover requests at once, and the viewer
plus its hiding state are the same answer for every one of them. The route
caches them (app/services/rbac/cover_viewer.py) - and because what it caches
is the content-label gate's input, most of this file is about the cache NOT
serving something it should not:

  - a write that changes an input (a label, a mode, an account) is visible on
    the very next cover request, through cache.bump();
  - a session warming the cache does not lend its answer to another session;
  - an entry expires on its TTL even when nothing bumps it.

`hidden_anime` / `nsfw_label` are what make the refusals bite: the hidden set
has to be non-empty, or a refusal passes because there was nothing to refuse.
Each refusal is mirrored by a session that gets the same file, so a 404 is the
gate and not a missing file.
"""

import os
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import event

from app import models
from app.services.integrations.image_manager import COVER_DIR, cover_key
from app.services.rbac import cache, cover_viewer
from app.services.rbac.resolver import Viewer
from app.services.security import create_access_token

PIXEL = b"\xff\xd8\xff\xe0 not really a jpeg, but bytes on disk"

# Statements that belong to resolving WHO is asking, as opposed to the image.
VIEWER_TABLES = (
    "FROM users",
    "FROM role",
    "FROM user_access_mode",
    "FROM access_mode",
    "FROM content_label ",
    "FROM content_label\n",
)


@pytest.fixture
def cover_on_disk():
    """Write a cover file for one owner, and take it away again afterwards."""
    written = []

    def _write(owner_type, system_id):
        key = cover_key(owner_type, str(system_id))
        path = os.path.join(COVER_DIR, *key.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(PIXEL)
        written.append(path)
        return f"/api/covers/{key}"

    yield _write

    for path in written:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass


@pytest.fixture
def counted(db_session):
    """GET a url and return (response, the SQL statements it executed)."""
    seen = []

    def _count(conn, cursor, statement, parameters, context, executemany):
        seen.append(statement)

    bind = db_session.get_bind()
    event.listen(bind, "before_cursor_execute", _count)

    def _get(session, url):
        seen.clear()
        response = session.get(url)
        return response, list(seen)

    yield _get
    event.remove(bind, "before_cursor_execute", _count)


def _viewer_statements(statements):
    return [s for s in statements if any(t in s for t in VIEWER_TABLES)]


@pytest.fixture
def clock(monkeypatch):
    """Move cover_viewer's monotonic clock by hand."""
    now = [1000.0]
    monkeypatch.setattr(cover_viewer, "_monotonic", lambda: now[0])
    return now


# ---------------------------------------------------------------------------
# The saving
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("who", "warm_count"),
    [
        # media-type lookup + the label probe
        ("anonymous", 2),
        # the same two: a narrowed session's hidden set is non-empty
        ("narrowed", 2),
        # the lookup only: `unrestricted` hides nothing, so there is no probe
        ("admin", 1),
    ],
)
def test_a_warm_cover_request_resolves_no_viewer(
    who,
    warm_count,
    client,
    admin_client,
    catalog_writer,
    sample_anime,
    hidden_anime,
    cover_on_disk,
    counted,
):
    session = {
        "anonymous": lambda: client,
        "narrowed": lambda: catalog_writer(),
        "admin": lambda: admin_client,
    }[who]()
    url = cover_on_disk("anime", sample_anime.system_id)

    cold, cold_statements = counted(session, url)
    assert cold.status_code == 200
    # The cold request really does resolve a viewer, so the warm assertion
    # below is about the cache and not about a viewer that costs nothing.
    assert _viewer_statements(cold_statements)

    warm, warm_statements = counted(session, url)
    assert warm.status_code == 200
    assert warm.content == PIXEL
    assert _viewer_statements(warm_statements) == []
    assert len(warm_statements) == warm_count


def test_a_warm_shared_record_cover_skips_the_gated_type_lookup_too(
    catalog_writer, person, hidden_anime, cover_on_disk, counted
):
    """A staff portrait asks `hidden_gated_types` as well as the labels."""
    url = cover_on_disk("staff", person.system_id)
    session = catalog_writer()

    counted(session, url)
    warm, statements = counted(session, url)

    assert warm.status_code == 200
    assert _viewer_statements(statements) == []
    # media-row lookup (none) + the shared-record probe
    assert len(statements) == 2


# ---------------------------------------------------------------------------
# What the cache must not do
# ---------------------------------------------------------------------------


def test_a_session_warming_the_cache_lends_nothing_to_another(
    client, admin_client, catalog_writer, hidden_anime, cover_on_disk
):
    url = cover_on_disk("anime", hidden_anime.system_id)

    # Warm it with the session that MAY see the entry, twice so the second is
    # a hit.
    assert admin_client.get(url).status_code == 200
    assert admin_client.get(url).status_code == 200

    assert client.get(url).status_code == 404
    narrowed = catalog_writer()
    assert narrowed.get(url).status_code == 404
    assert narrowed.get(url).status_code == 404

    # The mirror: the allowed session is still served after the refusals.
    assert admin_client.get(url).status_code == 200


def test_a_new_label_hides_a_cover_on_the_next_request(
    admin_client, catalog_writer, sample_anime, cover_on_disk
):
    """
    The narrowed session's cached hidden set predates the label. Without the
    bump create_label already sends, it would keep the old set, the probe
    would ask about the wrong labels, and the cover would still be served.
    """
    url = cover_on_disk("anime", sample_anime.system_id)
    narrowed = catalog_writer()
    assert narrowed.get(url).status_code == 200

    created = admin_client.post(
        "/api/content-labels/", json={"key": "spoiler", "label": "Spoiler"}
    )
    assert created.status_code == 201
    assigned = admin_client.put(
        f"/api/content-labels/entry/anime/{sample_anime.system_id}",
        json={"label_keys": ["spoiler"]},
    )
    assert assigned.status_code == 200

    assert narrowed.get(url).status_code == 404
    # The mirror: unrestricted carries every label, so admin still sees it.
    assert admin_client.get(url).status_code == 200


def _user_named(db_session, username):
    return (
        db_session.query(models.User)
        .filter(models.User.username == username)
        .one()
    )


def test_a_new_denial_hides_a_cover_on_the_next_request(
    db_session, admin_client, catalog_writer, hidden_anime, cover_on_disk
):
    url = cover_on_disk("anime", hidden_anime.system_id)
    session = catalog_writer(label_keys=("nsfw",))
    assert session.get(url).status_code == 200

    user = _user_named(db_session, "catwriter")
    grant = (
        db_session.query(models.UserAccessMode)
        .filter(models.UserAccessMode.user_id == user.id)
        .one()
    )
    replaced = admin_client.put(
        f"/api/users/{user.id}/access-modes",
        json={
            "modes": [
                {
                    "mode_id": str(grant.mode_id),
                    "is_default": True,
                    "denied_label_keys": ["nsfw"],
                }
            ]
        },
    )
    assert replaced.status_code == 200

    assert session.get(url).status_code == 404


def test_a_deleted_accounts_cookie_stops_resolving_to_it_at_once(
    db_session, admin_client, catalog_writer, hidden_anime, cover_on_disk
):
    """delete_user bumps: the cookie now names nobody and reads as a guest,
    whose `safe` mode does not carry nsfw."""
    url = cover_on_disk("anime", hidden_anime.system_id)
    session = catalog_writer(label_keys=("nsfw",))
    assert session.get(url).status_code == 200

    user = _user_named(db_session, "catwriter")
    assert admin_client.delete(f"/api/users/{user.id}").status_code == 204

    assert session.get(url).status_code == 404


def test_an_entry_expires_on_its_ttl_when_nothing_bumps(
    db_session, catalog_writer, hidden_anime, cover_on_disk, clock
):
    """
    A change no bump reaches - here a grant deleted straight from the table,
    as psql or another worker process would - is served stale until the TTL
    and not a moment after.
    """
    url = cover_on_disk("anime", hidden_anime.system_id)
    session = catalog_writer(label_keys=("nsfw",))
    assert session.get(url).status_code == 200

    user = _user_named(db_session, "catwriter")
    db_session.query(models.UserAccessMode).filter(
        models.UserAccessMode.user_id == user.id
    ).delete()
    db_session.flush()

    clock[0] += cover_viewer.COVER_VIEWER_TTL_SECONDS - 0.5
    assert session.get(url).status_code == 200

    clock[0] += 1.0
    assert session.get(url).status_code == 404


# ---------------------------------------------------------------------------
# The cache's own edges
# ---------------------------------------------------------------------------


def _viewer(**fields):
    return Viewer(
        username="u",
        role_id=uuid.uuid4(),
        role_name="user",
        is_root=False,
        permissions=frozenset(),
        **fields,
    )


def test_an_entry_never_outlives_the_token_it_was_resolved_from(clock):
    token = create_access_token({"sub": "u"}, expires_delta=timedelta(seconds=2))

    deadline = cover_viewer._deadline(f"Bearer {token}", None, _viewer())

    assert clock[0] < deadline <= clock[0] + 2.5


def test_an_unparseable_cookie_leaves_the_ttl_as_the_only_bound(clock):
    deadline = cover_viewer._deadline("Bearer junk", "junk", _viewer())

    assert deadline == clock[0] + cover_viewer.COVER_VIEWER_TTL_SECONDS


class _AnonymousRequest:
    """All resolve_cover_viewer reads off a request: its cookies."""

    cookies: dict = {}


@pytest.mark.parametrize(("bump_mid_resolve", "resolutions"), [(False, 1), (True, 2)])
def test_an_answer_resolved_across_a_bump_is_served_but_not_kept(
    monkeypatch, db_session, access_modes, bump_mid_resolve, resolutions
):
    """
    A write that commits and bumps while a request is resolving must not leave
    that request's pre-write answer in the cache. The False case is the
    mirror: with no bump the second call is a hit, so the True case's second
    resolution is the generation check and not a cache that never stores.
    """
    calls = []
    real = cover_viewer.resolve_viewer

    def resolve(request, db):
        calls.append(1)
        viewer = real(request, db)
        if bump_mid_resolve:
            cache.bump()
        return viewer

    monkeypatch.setattr(cover_viewer, "resolve_viewer", resolve)

    cover_viewer.resolve_cover_viewer(_AnonymousRequest(), db_session)
    cover_viewer.resolve_cover_viewer(_AnonymousRequest(), db_session)

    assert len(calls) == resolutions
