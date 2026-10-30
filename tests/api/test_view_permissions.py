"""
The view.* family: what a logged-out visitor does not see.

Four keys, held by `user` and `super` and not by `guest`. Each refusal below is
asserted with the gated thing PRESENT - a row to read, a rating to strip, a
highlight to withhold - and is mirrored by a viewer holding the key reading the
same thing through the same fixture, so a green proves the gate refused and not
that there was nothing to return.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import (
    FAMILY_VIEW,
    PERM_MANAGE_CATALOG,
    PERM_VIEW_ENTITIES,
    PERM_VIEW_EXTRAS,
    PERM_VIEW_PERSONAL,
    PERM_VIEW_SEARCH,
    VIEW_PERMISSION_KEYS,
    VIEW_PERMISSION_LABELS,
    locked_permissions,
    static_catalog,
    view_perm,
)
from app.services.rbac.seed import (
    default_guest_permissions,
    default_super_permissions,
    default_user_permissions,
)
from tests.api.conftest import make_viewer

VIEW_ALL = {
    PERM_VIEW_ENTITIES,
    PERM_VIEW_SEARCH,
    PERM_VIEW_EXTRAS,
    PERM_VIEW_PERSONAL,
}


@pytest.fixture
def db(db_session):
    return db_session


def _held(db, role_name):
    role = db.query(models.Role).filter(models.Role.name == role_name).one()
    return {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == role.system_id
        )
    }


# ---------------------------------------------------------------------------
# The vocabulary and the seed
# ---------------------------------------------------------------------------


def test_the_four_keys_are_in_the_catalog():
    assert VIEW_PERMISSION_KEYS == ("entities", "search", "extras", "personal")
    assert {view_perm(k) for k in VIEW_PERMISSION_KEYS} == VIEW_ALL
    assert VIEW_ALL <= static_catalog()


def test_every_key_has_a_label_and_a_description():
    for key in VIEW_PERMISSION_KEYS:
        label, description = VIEW_PERMISSION_LABELS[key]
        assert label and description, key


def test_the_role_editor_offers_the_family(admin_client):
    families = {f["family"]: f for f in admin_client.get("/api/roles/catalog").json()}
    offered = {p["permission"] for p in families[FAMILY_VIEW]["permissions"]}
    assert offered == VIEW_ALL


def test_user_and_super_defaults_hold_the_family_and_guest_does_not():
    assert VIEW_ALL <= default_user_permissions()
    assert VIEW_ALL <= default_super_permissions()
    assert not VIEW_ALL & default_guest_permissions()


def test_the_seeded_roles_hold_what_the_defaults_say(db, client):
    # `client` runs the lifespan, which seeds and enforces the locks.
    assert VIEW_ALL <= _held(db, "user")
    assert VIEW_ALL <= _held(db, "super")
    assert not VIEW_ALL & _held(db, "guest")


def test_super_holds_the_family_by_lock_and_guest_is_not_locked_off():
    super_on, _ = locked_permissions("super", False)
    assert VIEW_ALL <= super_on
    # Deliberately a free choice for guest: an admin may open search or the
    # entity pages to the public.
    guest_on, guest_off = locked_permissions("guest", False)
    assert not VIEW_ALL & (guest_on | guest_off)


# ---------------------------------------------------------------------------
# Router gates
# ---------------------------------------------------------------------------


@pytest.fixture
def gated_reads(db, admin_client, person, character, anime_with_studio, sample_anime):
    """
    One readable thing behind every gated read, and the URL that reads it.

    Load-bearing for every refusal test in this file: each URL answers 200
    with content for a viewer holding the key, so a 401 for one without it is
    the gate and not an empty table.
    """
    studio = db.query(models.Studio).filter(models.Studio.name_en == "MAPPA").one()
    publisher = models.Publisher(system_id=uuid.uuid4(), name_en="Kodansha")
    identity = models.CharacterIdentity(
        system_id=uuid.uuid4(), character_id=character.system_id, name_en="Masked"
    )
    db.add_all([publisher, identity])
    db.flush()
    quote = admin_client.post("/api/quote/", json={"text": "有名的一句"}).json()
    meme = admin_client.post(
        "/api/meme/",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "text": "迷因",
        },
    )
    assert meme.status_code == 200, meme.text
    meme = meme.json()
    resource = admin_client.post(
        "/api/resources", json={"kind": "group", "title": "Links"}
    )
    assert resource.status_code in (200, 201), resource.text
    owner = models.User(
        id=uuid.uuid4(),
        username="public_owner",
        hashed_password="x",
        role_id=db.query(models.Role.system_id)
        .filter(models.Role.name == "user")
        .scalar(),
        list_is_public=True,
    )
    db.add(owner)
    db.flush()
    return {
        PERM_VIEW_ENTITIES: [
            "/api/studio/",
            f"/api/studio/{studio.system_id}",
            f"/api/studio/{studio.system_id}/entries",
            "/api/publisher/",
            f"/api/publisher/{publisher.system_id}",
            f"/api/publisher/{publisher.system_id}/entries",
            "/api/person/",
            f"/api/person/{person.system_id}",
            f"/api/person/{person.system_id}/entries",
            "/api/character/",
            f"/api/character/{character.system_id}",
            f"/api/character/{character.system_id}/entries",
            f"/api/character-identity/{identity.system_id}",
            f"/api/character-identity/{identity.system_id}/entries",
        ],
        PERM_VIEW_SEARCH: ["/api/search/?q=Test"],
        PERM_VIEW_EXTRAS: [
            "/api/quote/",
            f"/api/quote/{quote['system_id']}",
            "/api/meme/",
            f"/api/meme/{meme['system_id']}",
            "/api/resources",
            "/api/random-picker-defaults/all",
        ],
        PERM_VIEW_PERSONAL: [
            "/api/profile/public_owner",
            f"/api/community/{sample_anime.system_id}",
        ],
    }


def test_a_guest_is_refused_every_gated_read(client, gated_reads):
    for permission, urls in gated_reads.items():
        for url in urls:
            r = client.get(url)
            assert r.status_code == 401, (permission, url, r.status_code)


def test_a_member_reads_every_gated_read(user_client, gated_reads):
    """The mirror: the same URLs, the same rows, a viewer holding the family."""
    for permission, urls in gated_reads.items():
        for url in urls:
            r = user_client.get(url)
            assert r.status_code == 200, (permission, url, r.text)


@pytest.mark.parametrize(
    "permission", [PERM_VIEW_ENTITIES, PERM_VIEW_SEARCH, PERM_VIEW_EXTRAS, PERM_VIEW_PERSONAL]
)
def test_each_key_opens_exactly_its_own_reads(db, client, gated_reads, permission):
    """The keys are independent: holding one opens its reads and no other's."""
    make_viewer(db, client, f"only-{permission}", default_guest_permissions() | {permission})
    for held, urls in gated_reads.items():
        for url in urls:
            r = client.get(url)
            expected = 200 if held == permission else 401
            assert r.status_code == expected, (permission, url, r.status_code)


def test_entity_writes_still_need_manage_catalog(user_client):
    """A member holds view.entities and still may not write a studio."""
    r = user_client.post("/api/studio/", json={"name_en": "Shaft"})
    assert r.status_code == 401


def test_an_entity_write_does_not_also_need_the_read(db, client):
    """
    The view gate sits on the read routes, not on the router, so a role
    holding manage.catalog and not view.entities can still write.
    """
    make_viewer(db, client, "writer-only", default_guest_permissions() | {PERM_MANAGE_CATALOG})
    r = client.post("/api/studio/", json={"name_en": "Shaft"})
    assert r.status_code == 200, r.text
    assert client.get("/api/studio/").status_code == 401


# ---------------------------------------------------------------------------
# Notes: ?author= and the highlight sections
# ---------------------------------------------------------------------------


def _notes(c, anime, **params):
    return c.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(anime.system_id), **params},
    )


@pytest.fixture
def highlight(db, sample_anime, admin_user):
    """A catalogue highlight on the anime - the row a guest must not see."""
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            section="highlights",
            content="第六話",
            author_id=admin_user.id,
        )
    )
    db.flush()


def test_a_guest_does_not_see_highlights(client, sample_anime, highlight):
    r = _notes(client, sample_anime)
    assert r.status_code == 200
    assert not [n for n in r.json() if n["section"] == "highlights"]


def test_a_member_sees_highlights(user_client, sample_anime, highlight):
    r = _notes(user_client, sample_anime)
    assert [n["content"] for n in r.json() if n["section"] == "highlights"] == ["第六話"]


def test_the_section_listing_omits_highlights_for_a_guest(client, user_client):
    def keys(c, owner_type):
        r = c.get("/api/notes/sections", params={"owner_type": owner_type})
        assert r.status_code == 200
        return {s["key"] for s in r.json()}

    assert "highlights" in keys(user_client, "anime")
    assert "highlight_episodes" in keys(user_client, "tv-show")
    assert "highlights" not in keys(client, "anime")
    assert "highlight_episodes" not in keys(client, "tv-show")
    # Only those two: a guest still gets every other section.
    assert keys(user_client, "anime") - keys(client, "anime") == {"highlights"}


@pytest.fixture
def public_author(db, sample_anime):
    """A user whose list is public and who has a personal note on the anime."""
    author = models.User(
        id=uuid.uuid4(),
        username="open_author",
        hashed_password="x",
        role_id=db.query(models.Role.system_id)
        .filter(models.Role.name == "user")
        .scalar(),
        list_is_public=True,
    )
    db.add(author)
    db.flush()
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            section="advantages",
            content="作者的優點",
            author_id=author.id,
        )
    )
    db.flush()
    return author


def test_author_needs_view_personal(db, client, sample_anime, public_author):
    assert _notes(client, sample_anime, author="open_author").status_code == 401
    # A signed-in viewer holding everything else but the key is refused too,
    # and with the same answer for a username nobody has.
    make_viewer(
        db,
        client,
        "no-personal",
        default_user_permissions() - {PERM_VIEW_PERSONAL},
    )
    assert _notes(client, sample_anime, author="open_author").status_code == 401
    assert _notes(client, sample_anime, author="nobody_here").status_code == 401


def test_author_is_honoured_with_view_personal(user_client, sample_anime, public_author):
    r = _notes(user_client, sample_anime, author="open_author")
    assert r.status_code == 200
    assert [n["content"] for n in r.json() if n["section"] == "advantages"] == [
        "作者的優點"
    ]


# ---------------------------------------------------------------------------
# Stripping personal fields
# ---------------------------------------------------------------------------


@pytest.fixture
def rated_groups(db, sample_collected_franchise, sample_collection):
    """Groups carrying the owner's opinion - the values a guest must not get."""
    franchise = sample_collected_franchise
    franchise.my_rating = "S"
    franchise.franchise_expectation = "High"
    series = models.Series(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        series_name_en="Rated Series",
        my_rating="A",
        series_expectation="High",
    )
    sample_collection.my_rating = "A+"
    sample_collection.collection_expectation = "High"
    db.add(series)
    db.flush()
    return {"franchise": franchise, "series": series, "collection": sample_collection}


GROUP_FIELDS = {
    "franchise": ("my_rating", "franchise_expectation"),
    "series": ("my_rating", "series_expectation"),
    "collection": ("my_rating", "collection_expectation"),
}


def _group_reads(c, groups):
    """Every read that emits a group: its list and its detail."""
    out = []
    for kind, row in groups.items():
        listed = c.get(f"/api/{kind}/").json()
        out.append(next(x for x in listed if x["system_id"] == str(row.system_id)))
        out.append(c.get(f"/api/{kind}/{row.system_id}").json())
    return out


def test_a_guest_gets_group_ratings_and_expectations_as_null(client, rated_groups):
    bodies = _group_reads(client, rated_groups)
    kinds = [k for k in rated_groups for _ in (0, 1)]
    for kind, body in zip(kinds, bodies):
        for field in GROUP_FIELDS[kind]:
            # Present and null, not absent: one shape for every viewer.
            assert field in body, (kind, field)
            assert body[field] is None, (kind, field)


def test_a_member_gets_them(user_client, rated_groups):
    bodies = _group_reads(user_client, rated_groups)
    kinds = [k for k in rated_groups for _ in (0, 1)]
    for kind, body in zip(kinds, bodies):
        for field in GROUP_FIELDS[kind]:
            assert body[field] is not None, (kind, field)


def test_stripping_does_not_write_the_null_back(db, client, rated_groups):
    client.get(f"/api/franchise/{rated_groups['franchise'].system_id}")
    db.flush()
    db.refresh(rated_groups["franchise"])
    assert rated_groups["franchise"].my_rating == "S"
    assert rated_groups["franchise"].franchise_expectation == "High"


def test_a_catalogue_manager_without_view_personal_still_gets_them(
    db, client, rated_groups
):
    """
    The edit forms load a group with a GET and send it back whole, so a
    manager handed a null would write it over the stored value.
    """
    make_viewer(
        db,
        client,
        "manager-no-personal",
        default_guest_permissions() | {PERM_MANAGE_CATALOG},
    )
    body = client.get(f"/api/franchise/{rated_groups['franchise'].system_id}").json()
    assert body["my_rating"] == "S"


def test_search_strips_for_a_searcher_without_view_personal(db, client, rated_groups):
    make_viewer(
        db,
        client,
        "searcher",
        default_guest_permissions() | {PERM_VIEW_SEARCH},
    )
    body = client.get("/api/search/", params={"q": "Collected Franchise"}).json()
    franchise = next(
        f
        for f in body["results"]["franchise"]
        if f["system_id"] == str(rated_groups["franchise"].system_id)
    )
    assert franchise["my_rating"] is None
    assert franchise["franchise_expectation"] is None


def test_search_keeps_them_for_a_member(user_client, rated_groups):
    body = user_client.get("/api/search/", params={"q": "Collected Franchise"}).json()
    franchise = next(
        f
        for f in body["results"]["franchise"]
        if f["system_id"] == str(rated_groups["franchise"].system_id)
    )
    assert franchise["my_rating"] == "S"


@pytest.fixture
def rated_entities(db, person, character):
    studio = models.Studio(system_id=uuid.uuid4(), name_en="Rated Studio", my_rating="S")
    publisher = models.Publisher(
        system_id=uuid.uuid4(), name_en="Rated Publisher", my_rating="S"
    )
    person.my_rating = "S"
    character.my_rating = "S"
    db.add_all([studio, publisher])
    db.flush()
    return {
        "studio": studio,
        "publisher": publisher,
        "person": person,
        "character": character,
    }


def test_entities_strip_my_rating_without_view_personal(db, client, rated_entities):
    make_viewer(
        db,
        client,
        "entities-only",
        default_guest_permissions() | {PERM_VIEW_ENTITIES},
    )
    for kind, row in rated_entities.items():
        body = client.get(f"/api/{kind}/{row.system_id}").json()
        assert body["my_rating"] is None, kind
        listed = client.get(f"/api/{kind}/").json()
        assert next(x for x in listed if x["system_id"] == str(row.system_id))[
            "my_rating"
        ] is None, kind


def test_entities_keep_my_rating_for_a_member(user_client, rated_entities):
    for kind, row in rated_entities.items():
        body = user_client.get(f"/api/{kind}/{row.system_id}").json()
        assert body["my_rating"] == "S", kind


@pytest.fixture
def novel_with_remark(db, sample_franchise):
    novel = models.Novel(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        novel_name_cn="測試小說",
        type="Web",
    )
    db.add(novel)
    db.flush()
    db.add(
        models.NovelUnit(
            system_id=uuid.uuid4(),
            novel_id=novel.system_id,
            unit_kind="arc",
            position=1,
            ch_count=10,
            remark="這卷最好看",
        )
    )
    db.flush()
    db.expire(novel)
    return novel


def _units(c, novel):
    detail = c.get(f"/api/novel/{novel.system_id}").json()
    listed = c.get("/api/novel/").json()
    row = next(x for x in listed if x["system_id"] == str(novel.system_id))
    return detail["units"] + row["units"]


def test_a_guest_gets_novel_unit_remarks_as_null(db, client, novel_with_remark):
    units = _units(client, novel_with_remark)
    assert units, "the novel must carry a unit for this to bite"
    assert all(u["remark"] is None for u in units)
    unit = db.query(models.NovelUnit).filter_by(novel_id=novel_with_remark.system_id).one()
    assert unit.remark == "這卷最好看"


def test_a_member_gets_novel_unit_remarks(user_client, novel_with_remark):
    units = _units(user_client, novel_with_remark)
    assert units
    assert all(u["remark"] == "這卷最好看" for u in units)
