"""The person router."""

import uuid

from app import models


def _anime_id(db_session, name="測試"):
    """media_credit.media_id is a real FK, so the entry has to exist."""
    a = models.Anime(anime_name_cn=name)
    db_session.add(a)
    db_session.flush()
    return a.system_id


def _create(owner_client, name, roles):
    return owner_client.post(
        "/api/person/", json={"name": name, "roles": roles}
    ).json()


def test_create_and_read_back(owner_client, guest_reader):
    created = _create(owner_client, "新海誠", [{"role": "director", "scope": "anime"}])
    r = guest_reader.get(f"/api/person/{created['system_id']}")
    assert r.json()["display_name"] == "新海誠"


def test_list_filters_by_role_and_scope(owner_client, guest_reader):
    _create(owner_client, "新海誠", [{"role": "director", "scope": "anime"}])
    _create(owner_client, "Nolan", [{"role": "director", "scope": "movie"}])

    names = [
        p["display_name"]
        for p in guest_reader.get("/api/person/?role=director&scope=anime").json()
    ]
    assert names == ["新海誠"]


def test_a_person_scoped_both_ways_appears_in_both_lists(owner_client, guest_reader):
    _create(
        owner_client,
        "宮崎駿",
        [
            {"role": "director", "scope": "anime"},
            {"role": "director", "scope": "movie"},
        ],
    )
    for scope in ("anime", "movie"):
        names = [
            p["display_name"]
            for p in guest_reader.get(f"/api/person/?role=director&scope={scope}").json()
        ]
        assert names == ["宮崎駿"]


def test_unfiltered_list_returns_everyone(owner_client, guest_reader):
    _create(owner_client, "新海誠", [{"role": "director", "scope": "anime"}])
    # A second person under a different role, so the unfiltered list has
    # someone to return besides the director above.
    _create(owner_client, "澤野弘之", [{"role": "composer", "scope": "anime"}])
    assert len(guest_reader.get("/api/person/").json()) == 2


def test_response_carries_a_credit_count(owner_client, guest_reader, db_session):
    created = _create(owner_client, "新海誠", [{"role": "director", "scope": "anime"}])
    db_session.add(
        models.MediaCredit(
            media_id=_anime_id(db_session),
            role="director",
            person_id=created["system_id"],
        )
    )
    db_session.commit()
    assert guest_reader.get(f"/api/person/{created['system_id']}").json()["credit_count"] == 1


def test_delete_cascades_the_credits(owner_client, db_session):
    created = _create(owner_client, "新海誠", [{"role": "director", "scope": "anime"}])
    db_session.add(
        models.MediaCredit(
            media_id=_anime_id(db_session),
            role="director",
            person_id=created["system_id"],
        )
    )
    db_session.commit()

    # The count the admin confirmed rides along; see the delete guard in
    # tests/api/test_person_entries.py for what a stale one does.
    deleted = owner_client.delete(f"/api/person/{created['system_id']}?credits=1")
    assert deleted.status_code == 200
    assert db_session.query(models.MediaCredit).count() == 0


def test_merge_repoints_credits_onto_the_survivor(owner_client, db_session):
    # Two names that do NOT normalize to the same key - POST /api/person now
    # dedupes on that key, so a same-key "duplicate" can no longer be created
    # through the API at all. Merge exists for the duplicates normalization
    # cannot catch: the same human entered under two different spellings.
    keep = _create(owner_client, "新海誠", [{"role": "director", "scope": "anime"}])
    drop = _create(
        owner_client, "Makoto Shinkai", [{"role": "director", "scope": "anime"}]
    )
    entry_id = _anime_id(db_session)
    db_session.add(
        models.MediaCredit(
            media_id=entry_id,
            role="director",
            person_id=drop["system_id"],
        )
    )
    db_session.commit()

    r = owner_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )
    assert r.status_code == 200
    assert db_session.query(models.Person).count() == 1
    credit = db_session.query(models.MediaCredit).one()
    assert str(credit.person_id) == keep["system_id"]


def test_merge_does_not_duplicate_a_credit_both_already_had(
    owner_client, db_session
):
    keep = _create(owner_client, "A", [{"role": "director", "scope": "anime"}])
    drop = _create(owner_client, "B", [{"role": "director", "scope": "anime"}])
    entry_id = _anime_id(db_session)
    for pid in (keep["system_id"], drop["system_id"]):
        db_session.add(
            models.MediaCredit(
                media_id=entry_id,
                role="director",
                person_id=pid,
            )
        )
    db_session.commit()

    owner_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )
    assert db_session.query(models.MediaCredit).count() == 1


def test_merge_unions_the_roles(owner_client, db_session):
    keep = _create(owner_client, "A", [{"role": "director", "scope": "anime"}])
    drop = _create(owner_client, "B", [{"role": "composer", "scope": "anime"}])
    owner_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )
    person = db_session.get(models.Person, uuid.UUID(keep["system_id"]))
    assert {r.role for r in person.roles} == {"director", "composer"}


def test_merge_into_itself_is_rejected(owner_client):
    keep = _create(owner_client, "A", [{"role": "director", "scope": "anime"}])
    r = owner_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": keep["system_id"]},
    )
    assert r.status_code == 400


def test_writes_require_admin(client):
    assert client.post("/api/person/", json={"name": "X"}).status_code in (
        401,
        403,
    )


def test_an_unknown_person_role_is_rejected(owner_client):
    """
    The frontend is now a routine writer of role strings (ensureSourceValues
    POSTs one whenever a typed name is missing from a suggestion list), so a
    typo in a fieldMeta.js descriptor would otherwise create a person holding
    a role no dropdown ever queries.
    """
    r = owner_client.post(
        "/api/person/",
        json={"name": "誰か", "roles": [{"role": "drector", "scope": "anime"}]},
    )
    assert r.status_code == 422


def test_a_scope_illegal_for_the_role_is_rejected(owner_client):
    """
    Scope is a hyphenated media-type key, and legality is PER ROLE: `manga` is
    a real media type but a composer is never credited on one. This is the
    check a per-field validator could not make, because it cannot see the role.
    """
    r = owner_client.post(
        "/api/person/",
        json={
            "name": "誰か",
            "roles": [{"role": "composer", "scope": "manga"}],
        },
    )
    assert r.status_code == 422


def test_a_media_type_scope_is_accepted_for_a_role_that_uses_it(owner_client):
    """anime-movie was rejected before the collapse; it is now the point."""
    r = owner_client.post(
        "/api/person/",
        json={
            "name": "誰か",
            "roles": [{"role": "director", "scope": "anime-movie"}],
        },
    )
    assert r.status_code == 200


def test_an_empty_scope_is_rejected(owner_client):
    """An empty string is not "no scope"; only null is."""
    r = owner_client.post(
        "/api/person/",
        json={"name": "澤野弘之", "roles": [{"role": "composer", "scope": ""}]},
    )
    assert r.status_code == 422


def test_a_role_can_be_held_with_no_scope(owner_client, guest_reader):
    created = _create(owner_client, "Unscoped Artist", [{"role": "illustrator"}])
    assert created["roles"] == [{"role": "illustrator", "scope": None}]


def test_an_unscoped_person_is_listed_under_the_role_but_in_no_dropdown(
    owner_client, guest_reader
):
    """
    Both halves, with a scoped neighbour so the scope filter has someone to
    match: a green here proves the filter left the unscoped person out.
    """
    _create(owner_client, "Unscoped Artist", [{"role": "illustrator"}])
    _create(owner_client, "Manga Artist", [{"role": "illustrator", "scope": "manga"}])
    by_role = {
        p["display_name"]
        for p in guest_reader.get("/api/person/?role=illustrator").json()
    }
    assert by_role == {"Unscoped Artist", "Manga Artist"}
    for_manga = {
        p["display_name"]
        for p in guest_reader.get("/api/person/?role=illustrator&scope=manga").json()
    }
    assert for_manga == {"Manga Artist"}


def test_an_unscoped_role_is_counted(owner_client, guest_reader):
    _create(owner_client, "Unscoped Artist", [{"role": "illustrator"}])
    assert guest_reader.get("/api/person/role-counts").json()["illustrator"] == 1


def test_a_club_needs_a_scope(owner_client):
    r = owner_client.post(
        "/api/person/", json={"name": "Circle", "roles": [{"role": "club"}]}
    )
    assert r.status_code == 422


def test_a_scope_drops_the_roles_unscoped_row(owner_client):
    """Sent together, the scoped pair wins: a role is unscoped or scoped, never both."""
    created = _create(
        owner_client,
        "Both Ways",
        [{"role": "illustrator"}, {"role": "illustrator", "scope": "book"}],
    )
    assert created["roles"] == [{"role": "illustrator", "scope": "book"}]


def test_update_can_take_a_role_back_to_no_scope(owner_client, db_session):
    created = _create(owner_client, "Rescoped", [{"role": "illustrator", "scope": "manga"}])
    r = owner_client.put(
        f"/api/person/{created['system_id']}",
        json={"name_en": "Rescoped", "roles": [{"role": "illustrator", "scope": None}]},
    )
    assert r.status_code == 200
    assert r.json()["roles"] == [{"role": "illustrator", "scope": None}]


def test_a_credit_scopes_an_unscoped_person(owner_client, db_session):
    """Auto-scoping on write replaces the unscoped row rather than sitting beside it."""
    from app.services.domain import credits as credits_service

    _create(owner_client, "Later Credited", [{"role": "illustrator"}])
    manga = models.Manga(manga_name_cn="作品")
    db_session.add(manga)
    db_session.flush()
    credits_service.replace_credits(
        db_session, "manga", manga.system_id, "illustrator", ["Later Credited"]
    )
    db_session.flush()
    person = db_session.query(models.Person).filter_by(name_en="Later Credited").one()
    assert [(r.role, r.scope) for r in person.roles] == [("illustrator", "manga")]


def test_merge_keeps_one_row_when_one_side_is_unscoped(owner_client, db_session):
    keep = _create(owner_client, "Keep", [{"role": "illustrator", "scope": "manga"}])
    drop = _create(owner_client, "Drop", [{"role": "illustrator"}])
    r = owner_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )
    assert r.status_code == 200, r.text
    db_session.expire_all()
    person = db_session.get(models.Person, uuid.UUID(keep["system_id"]))
    assert [(x.role, x.scope) for x in person.roles] == [("illustrator", "manga")]


def test_an_extra_scope_is_accepted(owner_client):
    for role, scope in (
        ("composer", "movie"),
        ("composer", "cartoon"),
        ("director", "tv-show"),
        ("producer", "anime-movie"),
    ):
        created = _create(owner_client, f"{role} {scope}", [{"role": role, "scope": scope}])
        assert created["roles"] == [{"role": role, "scope": scope}], (role, scope)


def test_the_social_links_round_trip(owner_client):
    created = owner_client.post(
        "/api/person/",
        json={
            "name": "Linked Artist",
            "twitter_link": "https://x.com/artist",
            "ig_link": "https://www.instagram.com/artist",
            "pixiv_link": "https://www.pixiv.net/users/1",
        },
    ).json()
    assert created["twitter_link"] == "https://x.com/artist"
    assert created["ig_link"] == "https://www.instagram.com/artist"
    assert created["pixiv_link"] == "https://www.pixiv.net/users/1"


# ---------------------------------------------------------------------------
# GET /api/person/role-counts - the Tier 3 summary the read-only System
# Options page renders. It exists so that page can show "Director: 88"
# without downloading every person row just to read a list length.
# ---------------------------------------------------------------------------


def test_role_counts_covers_every_person_role_including_the_empty_ones(owner_client):
    """`unrestricted` sees every role; a session that cannot see h-comic is
    not told `club` exists (tests/api/test_h_comic_shared_records.py)."""
    from app.utils.credit_roles import PERSON_ROLES

    counts = owner_client.get("/api/person/role-counts").json()
    assert set(counts) == set(PERSON_ROLES)
    assert all(v == 0 for v in counts.values())


def test_role_counts_tallies_people_per_role(owner_client, guest_reader):
    _create(owner_client, "新海誠", [{"role": "director", "scope": "anime"}])
    _create(owner_client, "Nolan", [{"role": "director", "scope": "movie"}])
    _create(owner_client, "澤野弘之", [{"role": "composer", "scope": "anime"}])

    counts = guest_reader.get("/api/person/role-counts").json()
    assert counts["director"] == 2
    assert counts["composer"] == 1
    assert counts["producer"] == 0


def test_role_counts_counts_a_doubly_scoped_person_once(owner_client, guest_reader):
    """A director scoped both ways has two person_role rows, but is one person."""
    _create(
        owner_client,
        "宮崎駿",
        [
            {"role": "director", "scope": "anime"},
            {"role": "director", "scope": "movie"},
        ],
    )
    assert guest_reader.get("/api/person/role-counts").json()["director"] == 1


def test_role_counts_is_not_swallowed_by_the_uuid_detail_route(guest_reader):
    """'role-counts' must not be parsed as a person system_id."""
    assert guest_reader.get("/api/person/role-counts").status_code == 200


def test_credit_count_includes_castings(guest_reader, seiyuu_with_one_casting):
    """
    A seiyuu with fifty castings and no other credits would otherwise read
    "0 credits" on their card, because credit_count only ever walked
    media_credit and a seiyuu has no rows there. See Decision A.
    """
    r = guest_reader.get(f"/api/person/{seiyuu_with_one_casting.system_id}")
    assert r.json()["credit_count"] == 1


def test_person_delete_guard_counts_castings(owner_client, seiyuu_with_one_casting):
    stale = owner_client.delete(
        f"/api/person/{seiyuu_with_one_casting.system_id}?credits=0"
    )
    assert stale.status_code == 409
    ok = owner_client.delete(
        f"/api/person/{seiyuu_with_one_casting.system_id}?credits=1"
    )
    assert ok.status_code == 200


def test_the_response_carries_every_role_the_person_holds(owner_client):
    """
    The admin form edits the whole role set at once and PUT replaces it, so
    the set has to arrive in one response. Reconstructing it by asking each
    role list who is in it would be a query per legal pair, and would still
    miss a pair the caller forgot to ask about.
    """
    created = _create(
        owner_client,
        "宮崎駿",
        [
            {"role": "director", "scope": "anime"},
            {"role": "director", "scope": "movie"},
            {"role": "producer", "scope": "anime"},
        ],
    )
    held = {
        (r["role"], r["scope"])
        for r in owner_client.get(f"/api/person/{created['system_id']}").json()[
            "roles"
        ]
    }
    assert held == {
        ("director", "anime"),
        ("director", "movie"),
        ("producer", "anime"),
    }
