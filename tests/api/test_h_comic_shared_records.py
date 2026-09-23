"""
Everything connected only to h-comic is hidden from a session that cannot see
the type (D11), and club membership.

The two rules at work, both from app/services/rbac/shared_visibility.py:

  appearance   a credit, casting or tag on an h-comic entry is hidden, because
               every h-comic carries the `h-comic` label
  scope        a person role, publisher scope or option scope naming h-comic
               is hidden, because h-comic is a gated type

Each refusal has the label present - the entries are created through the API,
which stamps it - and is paired with `admin_client`, sitting in
`unrestricted`, reading the same record back.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import credits as credits_service
from app.services.domain.content_labels import label_keys_for_entry


def _h_comic(admin_client, db_session, name="Zvornik Shared H-Comic", region="KR"):
    body = admin_client.post(
        "/api/h-comic/", json={"h_comic_name_cn": name, "region": region}
    ).json()
    entry_id = uuid.UUID(body["system_id"])
    assert label_keys_for_entry(db_session, entry_id) == ["h-comic"]
    return entry_id


def _ids(response) -> set[str]:
    assert response.status_code == 200, response.text
    return {row["system_id"] for row in response.json()}


@pytest.fixture
def h_comic_id(admin_client, db_session):
    return _h_comic(admin_client, db_session)


# ---------------------------------------------------------------------------
# People in every role
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("role", ["illustrator", "author", "club"])
def test_a_person_credited_only_on_h_comic_is_hidden(
    client, admin_client, db_session, h_comic_id, role
):
    credits_service.replace_credits(
        db_session, "h-comic", h_comic_id, role, [f"Zvornik {role}"]
    )
    person = credits_service.find_person(db_session, f"Zvornik {role}")

    assert client.get(f"/api/person/{person.system_id}").status_code == 404
    assert str(person.system_id) not in _ids(client.get("/api/person/"))

    assert admin_client.get(f"/api/person/{person.system_id}").status_code == 200
    assert str(person.system_id) in _ids(admin_client.get("/api/person/"))


def test_an_artist_on_mainstream_manga_too_stays_visible_without_the_h_comic(
    client, db_session, h_comic_id, manga_entry
):
    credits_service.replace_credits(
        db_session, "h-comic", h_comic_id, "illustrator", ["Zvornik Crossover"]
    )
    credits_service.replace_credits(
        db_session, "manga", manga_entry.system_id, "illustrator", ["Zvornik Crossover"]
    )
    person = credits_service.find_person(db_session, "Zvornik Crossover")

    response = client.get(f"/api/person/{person.system_id}")
    assert response.status_code == 200
    # The h-comic role is omitted, and so is the h-comic credit.
    assert {(r["role"], r["scope"]) for r in response.json()["roles"]} == {
        ("illustrator", "manga")
    }
    groups = client.get(f"/api/person/{person.system_id}/entries").json()["groups"]
    assert {g["media_type"] for g in groups} == {"manga"}


def test_a_club_created_before_its_first_credit_is_hidden_by_its_scope(
    client, admin_client, db_session
):
    """No credit at all: the club role's only scope, h-comic, is its one
    connection, and it is hidden."""
    club = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Empty Club")
    db_session.add(club)
    db_session.flush()
    db_session.add(models.PersonRole(person_id=club.system_id, role="club", scope="h-comic"))
    db_session.flush()

    assert client.get(f"/api/person/{club.system_id}").status_code == 404
    assert _ids(client.get("/api/person/?role=club&scope=h-comic")) == set()
    assert admin_client.get(f"/api/person/{club.system_id}").status_code == 200
    assert str(club.system_id) in _ids(
        admin_client.get("/api/person/?role=club&scope=h-comic")
    )


# ---------------------------------------------------------------------------
# Characters, vocabulary
# ---------------------------------------------------------------------------


def test_a_character_cast_only_on_h_comic_is_hidden(
    client, admin_client, db_session, h_comic_id
):
    character = models.Character(system_id=uuid.uuid4(), name_en="Zvornik Heroine")
    db_session.add(character)
    db_session.flush()
    response = admin_client.put(
        f"/api/casting/h-comic/{h_comic_id}",
        json={"cast": [{"character_id": str(character.system_id), "role": "Main"}]},
    )
    assert response.status_code == 200, response.text

    assert client.get(f"/api/character/{character.system_id}").status_code == 404
    assert admin_client.get(f"/api/character/{character.system_id}").status_code == 200


def test_a_seiyuu_on_an_h_comic_casting_is_refused(admin_client, db_session, h_comic_id, person):
    character = models.Character(system_id=uuid.uuid4(), name_en="Zvornik Voiced")
    db_session.add(character)
    db_session.flush()
    response = admin_client.put(
        f"/api/casting/h-comic/{h_comic_id}",
        json={
            "cast": [
                {"character_id": str(character.system_id), "person_id": str(person.system_id)}
            ]
        },
    )
    assert response.status_code == 422


def test_an_official_source_used_only_by_h_comic_is_hidden(
    client, admin_client, db_session, h_comic_id
):
    credits_service.replace_tags(
        db_session, h_comic_id, "original_source", ["Zvornik Platform"]
    )
    db_session.flush()

    def values(c):
        response = c.get("/api/options/")
        assert response.status_code == 200, response.text
        return {row["value"] for row in response.json()}

    assert "Zvornik Platform" not in values(client)
    assert "Zvornik Platform" in values(admin_client)


def test_an_unused_h_genre_value_is_hidden_by_its_scope(client, admin_client, db_session):
    option = models.SystemOption(category="H Genre Plot", value="Zvornik Plot")
    option.scopes = [models.SystemOptionScope(scope="h-comic")]
    db_session.add(option)
    db_session.flush()

    def values(c):
        return {row["value"] for row in c.get("/api/options/H Genre Plot").json()}

    assert "Zvornik Plot" not in values(client)
    assert "Zvornik Plot" in values(admin_client)


# ---------------------------------------------------------------------------
# Club membership
# ---------------------------------------------------------------------------


@pytest.fixture
def club(db_session):
    person = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Club")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="club", scope="h-comic")
    )
    db_session.flush()
    return person


@pytest.fixture
def mainstream_club(db_session, club, manga_entry):
    """A club that is ALSO credited on a mainstream work, so a narrow viewer
    can see it - the case where its member list has to filter."""
    credits_service.replace_credits(
        db_session, "manga", manga_entry.system_id, "author", ["Zvornik Club"]
    )
    db_session.flush()
    return club


def _person(db_session, name):
    person = models.Person(system_id=uuid.uuid4(), name_en=name)
    db_session.add(person)
    db_session.flush()
    return person


def test_members_round_trip_in_order(admin_client, db_session, club):
    a, b = _person(db_session, "Zvornik A"), _person(db_session, "Zvornik B")
    response = admin_client.put(
        f"/api/person/{club.system_id}/members",
        json={"member_ids": [str(b.system_id), str(a.system_id)]},
    )
    assert response.status_code == 200, response.text
    assert [m["display_name"] for m in response.json()] == ["Zvornik B", "Zvornik A"]
    assert [m["position"] for m in response.json()] == [0, 1]

    clubs = admin_client.get(f"/api/person/{a.system_id}/clubs").json()
    assert [c["system_id"] for c in clubs] == [str(club.system_id)]


def test_clubs_round_trip(admin_client, db_session, club):
    artist = _person(db_session, "Zvornik Artist")
    response = admin_client.put(
        f"/api/person/{artist.system_id}/clubs",
        json={"club_ids": [str(club.system_id)]},
    )
    assert response.status_code == 200, response.text
    assert [c["system_id"] for c in response.json()] == [str(club.system_id)]
    members = admin_client.get(f"/api/person/{club.system_id}/members").json()
    assert [m["system_id"] for m in members] == [str(artist.system_id)]

    response = admin_client.put(
        f"/api/person/{artist.system_id}/clubs", json={"club_ids": []}
    )
    assert response.json() == []
    assert db_session.query(models.PersonMembership).count() == 0


def test_a_person_without_the_club_role_cannot_be_a_club(admin_client, db_session):
    not_a_club = _person(db_session, "Zvornik Nobody")
    artist = _person(db_session, "Zvornik Artist")
    response = admin_client.put(
        f"/api/person/{artist.system_id}/clubs",
        json={"club_ids": [str(not_a_club.system_id)]},
    )
    assert response.status_code == 422
    response = admin_client.put(
        f"/api/person/{not_a_club.system_id}/members",
        json={"member_ids": [str(artist.system_id)]},
    )
    assert response.status_code == 422
    assert db_session.query(models.PersonMembership).count() == 0


def test_a_club_cannot_be_its_own_member(admin_client, club):
    response = admin_client.put(
        f"/api/person/{club.system_id}/members",
        json={"member_ids": [str(club.system_id)]},
    )
    assert response.status_code == 422


def test_membership_writes_need_the_catalogue_capability(client, club, db_session):
    artist = _person(db_session, "Zvornik Artist")
    response = client.put(
        f"/api/person/{artist.system_id}/clubs",
        json={"club_ids": [str(club.system_id)]},
    )
    assert response.status_code == 401


def test_a_visible_clubs_member_list_omits_hidden_members(
    client, admin_client, db_session, mainstream_club, h_comic_id
):
    # One member visible through a mainstream credit, one credited only on the
    # h-comic and therefore hidden. Membership reveals neither.
    credits_service.replace_credits(
        db_session, "h-comic", h_comic_id, "illustrator", ["Zvornik Hidden Artist"]
    )
    hidden = credits_service.find_person(db_session, "Zvornik Hidden Artist")
    visible = _person(db_session, "Zvornik Plain Artist")
    response = admin_client.put(
        f"/api/person/{mainstream_club.system_id}/members",
        json={"member_ids": [str(hidden.system_id), str(visible.system_id)]},
    )
    assert response.status_code == 200, response.text

    narrow = client.get(f"/api/person/{mainstream_club.system_id}/members")
    assert narrow.status_code == 200
    assert [m["system_id"] for m in narrow.json()] == [str(visible.system_id)]

    wide = admin_client.get(f"/api/person/{mainstream_club.system_id}/members").json()
    assert [m["system_id"] for m in wide] == [str(hidden.system_id), str(visible.system_id)]

    # Membership is not a connection: the hidden artist stays hidden.
    assert client.get(f"/api/person/{hidden.system_id}").status_code == 404


def test_a_hidden_clubs_members_are_404(client, admin_client, db_session, club):
    artist = _person(db_session, "Zvornik Artist")
    admin_client.put(
        f"/api/person/{club.system_id}/members",
        json={"member_ids": [str(artist.system_id)]},
    )
    assert client.get(f"/api/person/{club.system_id}/members").status_code == 404
    # The artist has no connection at all, so stays visible - and its club
    # list omits the hidden club rather than naming it.
    assert client.get(f"/api/person/{artist.system_id}/clubs").json() == []
    assert len(admin_client.get(f"/api/person/{artist.system_id}/clubs").json()) == 1


def test_a_narrow_editor_keeps_the_memberships_it_cannot_see(
    catalog_writer, admin_client, db_session, club, mainstream_club
):
    """A second, h-comic-only club carries the membership the editor cannot see."""
    hidden_club = _person(db_session, "Zvornik Hidden Club")
    db_session.add(
        models.PersonRole(person_id=hidden_club.system_id, role="club", scope="h-comic")
    )
    db_session.flush()
    artist = _person(db_session, "Zvornik Artist")
    admin_client.put(
        f"/api/person/{artist.system_id}/clubs",
        json={"club_ids": [str(hidden_club.system_id), str(mainstream_club.system_id)]},
    )

    narrow = catalog_writer()
    response = narrow.put(f"/api/person/{artist.system_id}/clubs", json={"club_ids": []})
    assert response.status_code == 200, response.text
    db_session.expire_all()
    remaining = {
        r.club_id
        for r in db_session.query(models.PersonMembership).filter_by(member_id=artist.system_id)
    }
    assert remaining == {hidden_club.system_id}


def test_merging_people_moves_their_memberships(admin_client, db_session, club):
    keep = _person(db_session, "Zvornik Keep")
    drop = _person(db_session, "Zvornik Drop")
    admin_client.put(
        f"/api/person/{drop.system_id}/clubs", json={"club_ids": [str(club.system_id)]}
    )
    response = admin_client.post(
        f"/api/person/{keep.system_id}/merge", json={"source_id": str(drop.system_id)}
    )
    assert response.status_code == 200, response.text
    clubs = admin_client.get(f"/api/person/{keep.system_id}/clubs").json()
    assert [c["system_id"] for c in clubs] == [str(club.system_id)]


# ---------------------------------------------------------------------------
# What a narrow session is told about the type
# ---------------------------------------------------------------------------


def test_the_role_surfaces_omit_club_for_a_narrow_session(client, db_session):
    assert db_session.query(models.ContentLabel).filter_by(key="h-comic").count() == 1
    scopes = client.get("/api/person/role-scopes").json()
    assert "club" not in scopes
    assert "h-comic" not in scopes["illustrator"]
    assert "manga" in scopes["illustrator"]
    assert "club" not in client.get("/api/person/role-counts").json()


def test_the_role_surfaces_name_club_for_unrestricted(admin_client):
    """The mirror."""
    scopes = admin_client.get("/api/person/role-scopes").json()
    assert scopes["club"] == ["h-comic"]
    assert "h-comic" in scopes["illustrator"]
    assert "club" in admin_client.get("/api/person/role-counts").json()


def test_the_note_registry_answers_h_comic_as_unknown_to_a_narrow_session(
    client, admin_client
):
    narrow = client.get("/api/notes/sections", params={"owner_type": "h-comic"})
    assert narrow.status_code == 400
    wide = admin_client.get("/api/notes/sections", params={"owner_type": "h-comic"})
    assert wide.status_code == 200
    assert "h_comic_highlights" in {s["key"] for s in wide.json()}
    # No other owner lists the section, for anybody.
    for owner in ("manga", "anime", "franchise"):
        keys = {
            s["key"]
            for s in admin_client.get(
                "/api/notes/sections", params={"owner_type": owner}
            ).json()
        }
        assert "h_comic_highlights" not in keys, owner


# ---------------------------------------------------------------------------
# A gated-only tag category is itself a connection
# ---------------------------------------------------------------------------


def test_an_unscoped_h_genre_value_is_still_hidden(client, admin_client, db_session):
    """No scope row and no use: the category alone connects it to h-comic."""
    option = models.SystemOption(category="H Genre Relation", value="Zvornik Unscoped")
    db_session.add(option)
    db_session.flush()
    assert option.scopes == []

    def values(c, path):
        response = c.get(path)
        assert response.status_code == 200, response.text
        return {row["value"] for row in response.json()}

    for path in ("/api/options/H Genre Relation", "/api/options/"):
        assert "Zvornik Unscoped" not in values(client, path)
        assert "Zvornik Unscoped" in values(admin_client, path)


def test_an_unscoped_unused_official_source_stays_visible(client, db_session):
    """The shared vocabulary keeps the ordinary rule: no connection, visible."""
    from app.utils.source_fields import PLATFORM_CATEGORY

    option = models.SystemOption(category=PLATFORM_CATEGORY, value="Zvornik Open Platform")
    db_session.add(option)
    db_session.flush()
    values = {row["value"] for row in client.get("/api/options/").json()}
    assert "Zvornik Open Platform" in values
