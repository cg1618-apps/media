"""
The viewer-resolved card fields on characters and people: display_photo_file,
media_types and restricted (app/services/domain/entity_photos.py).

The picture order is walked one step at a time by removing what the step
before it would have used, so each assertion can only pass on the step it
names. The refusal tests make the hidden set non-empty - `hidden_anime`
carries a label the guest's mode lacks, and the h-comic is stamped with its
gated label by the API - and read the SAME record back through `admin_client`,
whose mode carries every label, so a green proves the gate did the hiding.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy import event

from app import models
from app.services.domain import credits as credits_service
from app.services.domain.content_labels import label_keys_for_entry

# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def _set_cover(db_session, entry, cover):
    db_session.query(models.Media).filter_by(system_id=entry.system_id).update(
        {"cover_image_file": cover}
    )
    db_session.flush()
    db_session.expire_all()


def _anime(db_session, franchise, name, released, cover=None):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en=name,
        airing_type="TV",
        release_date=released,
    )
    db_session.add(entry)
    db_session.flush()
    if cover:
        _set_cover(db_session, entry, cover)
    return entry


def _manga(db_session, franchise, name, released, cover=None):
    entry = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        manga_name_en=name,
        release_date=released,
    )
    db_session.add(entry)
    db_session.flush()
    if cover:
        _set_cover(db_session, entry, cover)
    return entry


def _cast(db_session, character, entry, media_type, position, photo=None, person=None):
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type=media_type,
            entry_id=entry.system_id,
            position=position,
            photo_file=photo,
            person_id=person.system_id if person else None,
        )
    )
    db_session.flush()


def _character(db_session, name="Zvornik Portrait", **columns):
    c = models.Character(system_id=uuid.uuid4(), name_en=name, **columns)
    db_session.add(c)
    db_session.flush()
    return c


def _get(client, kind, entity):
    response = client.get(f"/api/{kind}/{entity.system_id}")
    assert response.status_code == 200, response.text
    return response.json()


def _set(db_session, entity, **columns):
    for key, value in columns.items():
        setattr(entity, key, value)
    db_session.flush()


# ---------------------------------------------------------------------------
# Character order
# ---------------------------------------------------------------------------


@pytest.fixture
def cast_character(db_session, sample_franchise):
    """
    Three castings, positioned so that position order, release order and
    "has a cover" all disagree:

      position 0  anime  2020  cover a.jpg   casting photo cast_a.jpg
      position 1  manga  2023  NO cover      casting photo cast_m.jpg
      position 2  anime  2022  cover b.jpg   no casting photo
    """
    older = _anime(db_session, sample_franchise, "Older", "2020-01", cover="a.jpg")
    coverless = _manga(db_session, sample_franchise, "Coverless", "2023-01")
    newer = _anime(db_session, sample_franchise, "Newer", "2022-01", cover="b.jpg")
    character = _character(db_session)
    _cast(db_session, character, older, "anime", 0, photo="cast_a.jpg")
    _cast(db_session, character, coverless, "manga", 1, photo="cast_m.jpg")
    _cast(db_session, character, newer, "anime", 2)
    return {"character": character, "older": older, "coverless": coverless, "newer": newer}


def test_step_1_the_characters_own_photo_wins(admin_client, db_session, cast_character):
    c = cast_character
    _set(
        db_session, c["character"],
        photo_file="own.jpg", photo_fallback_entry_id=c["older"].system_id,
    )
    assert _get(admin_client, "character", c["character"])["display_photo_file"] == "own.jpg"


def test_step_2_the_chosen_entrys_cover_beats_a_newer_one(
    admin_client, db_session, cast_character
):
    c = cast_character
    _set(db_session, c["character"], photo_fallback_entry_id=c["older"].system_id)
    body = _get(admin_client, "character", c["character"])
    assert body["display_photo_file"] == "a.jpg"
    assert body["photo_fallback_entry_id"] == str(c["older"].system_id)


def test_step_3_a_coverless_chosen_entry_gives_its_casting_photo(
    admin_client, db_session, cast_character
):
    c = cast_character
    _set(db_session, c["character"], photo_fallback_entry_id=c["coverless"].system_id)
    assert _get(admin_client, "character", c["character"])["display_photo_file"] == "cast_m.jpg"


def test_step_4_auto_is_the_newest_entry_with_a_cover(admin_client, cast_character):
    # The manga is newer still, but has no cover; the 2020 anime is first by
    # position. Only "newest WITH a cover" gives b.jpg.
    body = _get(admin_client, "character", cast_character["character"])
    assert body["display_photo_file"] == "b.jpg"
    assert body["photo_fallback_entry_id"] is None


def test_step_5_no_cover_anywhere_gives_the_newest_casting_photo(
    admin_client, db_session, cast_character
):
    for key in ("older", "newer"):
        _set_cover(db_session, cast_character[key], None)
    # cast_a.jpg is first by position; cast_m.jpg is on the newest entry.
    body = _get(admin_client, "character", cast_character["character"])
    assert body["display_photo_file"] == "cast_m.jpg"


def test_step_6_nothing_at_all_is_null(admin_client, db_session, sample_franchise):
    entry = _anime(db_session, sample_franchise, "Bare", "2021-01")
    character = _character(db_session)
    _cast(db_session, character, entry, "anime", 0)
    assert _get(admin_client, "character", character)["display_photo_file"] is None


def test_a_stale_choice_falls_through_to_auto(admin_client, db_session, cast_character):
    _set(db_session, cast_character["character"], photo_fallback_entry_id=uuid.uuid4())
    body = _get(admin_client, "character", cast_character["character"])
    assert body["display_photo_file"] == "b.jpg"
    assert body["photo_fallback_entry_id"] is None


def test_the_list_resolves_the_same_picture(admin_client, db_session, cast_character):
    _set(
        db_session, cast_character["character"],
        photo_fallback_entry_id=cast_character["older"].system_id,
    )
    rows = {r["system_id"]: r for r in admin_client.get("/api/character/").json()}
    assert rows[str(cast_character["character"].system_id)]["display_photo_file"] == "a.jpg"


# ---------------------------------------------------------------------------
# A hidden entry's picture is never used
# ---------------------------------------------------------------------------


@pytest.fixture
def half_hidden_character(db_session, sample_franchise, hidden_anime):
    """
    Cast on a visible 2020 anime and on `hidden_anime` - labelled, so the
    guest cannot see it - which is newer and carries its own cover.
    """
    visible = _anime(db_session, sample_franchise, "Visible", "2020-01", cover="v.jpg")
    _set(db_session, hidden_anime, release_date="2024-01")
    _set_cover(db_session, hidden_anime, "hidden.jpg")
    character = _character(db_session)
    _cast(db_session, character, visible, "anime", 0)
    _cast(db_session, character, hidden_anime, "anime", 1, photo="hidden_cast.jpg")
    return {"character": character, "visible": visible, "hidden": hidden_anime}


def test_auto_never_picks_a_hidden_entrys_cover(client, admin_client, half_hidden_character):
    c = half_hidden_character
    assert _get(client, "character", c["character"])["display_photo_file"] == "v.jpg"
    # The mirror, same fixture: the hidden entry IS the auto choice for a
    # viewer who can see it, so the guest's v.jpg was the gate refusing.
    assert _get(admin_client, "character", c["character"])["display_photo_file"] == "hidden.jpg"


def test_a_chosen_hidden_entry_is_neither_used_nor_named(
    client, admin_client, db_session, half_hidden_character
):
    c = half_hidden_character
    _set(db_session, c["character"], photo_fallback_entry_id=c["hidden"].system_id)
    guest = _get(client, "character", c["character"])
    assert guest["display_photo_file"] == "v.jpg"
    assert guest["photo_fallback_entry_id"] is None
    admin = _get(admin_client, "character", c["character"])
    assert admin["display_photo_file"] == "hidden.jpg"
    assert admin["photo_fallback_entry_id"] == str(c["hidden"].system_id)


def test_a_hidden_entrys_casting_photo_is_not_used_either(
    client, admin_client, db_session, half_hidden_character
):
    c = half_hidden_character
    for entry in (c["visible"], c["hidden"]):
        _set_cover(db_session, entry, None)
    assert _get(client, "character", c["character"])["display_photo_file"] is None
    assert (
        _get(admin_client, "character", c["character"])["display_photo_file"]
        == "hidden_cast.jpg"
    )


def test_the_guest_list_does_not_use_the_hidden_cover(
    client, admin_client, half_hidden_character
):
    key = str(half_hidden_character["character"].system_id)
    guest = {r["system_id"]: r for r in client.get("/api/character/").json()}
    admin = {r["system_id"]: r for r in admin_client.get("/api/character/").json()}
    assert guest[key]["display_photo_file"] == "v.jpg"
    assert admin[key]["display_photo_file"] == "hidden.jpg"


# ---------------------------------------------------------------------------
# Person order
# ---------------------------------------------------------------------------


@pytest.fixture
def credited_person(db_session, sample_franchise):
    """
    Credited on a 2019 manga (cover m.jpg) and voicing a character on a 2021
    anime (cover a.jpg) whose casting carries its own photo.
    """
    manga = _manga(db_session, sample_franchise, "Credited Manga", "2019-01", cover="m.jpg")
    credits_service.replace_credits(
        db_session, "manga", manga.system_id, "author", ["Zvornik Author"]
    )
    person = credits_service.find_person(db_session, "Zvornik Author")
    anime = _anime(db_session, sample_franchise, "Voiced Anime", "2021-01", cover="a.jpg")
    _cast(db_session, _character(db_session), anime, "anime", 0, photo="cast.jpg", person=person)
    return {"person": person, "manga": manga, "anime": anime}


def test_person_own_photo_wins(admin_client, db_session, credited_person):
    _set(db_session, credited_person["person"], photo_file="own.jpg")
    assert _get(admin_client, "person", credited_person["person"])["display_photo_file"] == "own.jpg"


def test_person_chosen_entry_beats_a_newer_one(admin_client, db_session, credited_person):
    p = credited_person
    _set(db_session, p["person"], photo_fallback_entry_id=p["manga"].system_id)
    assert _get(admin_client, "person", p["person"])["display_photo_file"] == "m.jpg"


def test_person_auto_counts_a_seiyuu_casting(admin_client, credited_person):
    """The newer entry is reached only through character_casting."""
    assert _get(admin_client, "person", credited_person["person"])["display_photo_file"] == "a.jpg"


def test_person_never_uses_a_casting_photo(admin_client, db_session, credited_person):
    """A casting photo is the character's picture, not the seiyuu's."""
    for key in ("manga", "anime"):
        _set_cover(db_session, credited_person[key], None)
    assert _get(admin_client, "person", credited_person["person"])["display_photo_file"] is None


def test_person_auto_never_picks_a_hidden_entrys_cover(
    client, admin_client, db_session, credited_person, hidden_anime
):
    p = credited_person
    _set(db_session, hidden_anime, release_date="2024-01")
    _set_cover(db_session, hidden_anime, "hidden.jpg")
    db_session.add(
        models.MediaCredit(
            media_id=hidden_anime.system_id, role="director", person_id=p["person"].system_id
        )
    )
    db_session.flush()
    assert _get(client, "person", p["person"])["display_photo_file"] == "a.jpg"
    assert _get(admin_client, "person", p["person"])["display_photo_file"] == "hidden.jpg"


# ---------------------------------------------------------------------------
# media_types and restricted
# ---------------------------------------------------------------------------


def _h_comic(admin_client, db_session):
    body = admin_client.post(
        "/api/h-comic/", json={"h_comic_name_cn": "Zvornik Photo H-Comic", "region": "KR"}
    ).json()
    entry_id = uuid.UUID(body["system_id"])
    assert label_keys_for_entry(db_session, entry_id) == ["h-comic"]
    return entry_id


def test_media_types_are_the_visible_ones_and_restricted_follows_them(
    client, admin_client, db_session, cast_character
):
    character = cast_character["character"]
    h_comic_id = _h_comic(admin_client, db_session)
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id, media_type="h-comic", entry_id=h_comic_id
        )
    )
    db_session.flush()

    admin = _get(admin_client, "character", character)
    assert admin["media_types"] == ["anime", "h-comic", "manga"]
    assert admin["restricted"] is True

    guest = _get(client, "character", character)
    assert guest["media_types"] == ["anime", "manga"]
    assert guest["restricted"] is False


def test_person_media_types_span_credits_and_castings(admin_client, credited_person):
    body = _get(admin_client, "person", credited_person["person"])
    assert body["media_types"] == ["anime", "manga"]
    assert body["restricted"] is False


def test_an_unlinked_record_has_no_media_types(admin_client, db_session):
    character = _character(db_session)
    body = _get(admin_client, "character", character)
    assert body["media_types"] == []
    assert body["restricted"] is False
    assert body["casting_count"] == 0


# ---------------------------------------------------------------------------
# Batched
# ---------------------------------------------------------------------------

_TX_CONTROL = ("SAVEPOINT", "RELEASE", "ROLLBACK", "COMMIT", "BEGIN")


def _count_queries(db_session, client, url):
    seen = []

    def count(_conn, _cursor, statement, *_args, **_kwargs):
        if not statement.lstrip().upper().startswith(_TX_CONTROL):
            seen.append(1)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", count)
    try:
        body = client.get(url).json()
    finally:
        event.remove(engine, "before_cursor_execute", count)
    return len(seen), body


@pytest.mark.parametrize("kind", ["character", "person"])
def test_the_list_query_count_does_not_grow_with_the_row_count(
    admin_client, db_session, sample_franchise, kind
):
    def add(start, stop):
        for i in range(start, stop):
            entry = _anime(
                db_session, sample_franchise, f"Batch {kind} {i}", f"20{10 + i}-01",
                cover=f"{i}.jpg",
            )
            character = _character(db_session, name=f"Batch {kind} {i}")
            person = None
            if kind == "person":
                person = models.Person(system_id=uuid.uuid4(), name_en=f"Batch {i}")
                db_session.add(person)
                db_session.flush()
            _cast(db_session, character, entry, "anime", 0, photo="c.jpg", person=person)
        db_session.commit()

    add(0, 2)
    admin_client.get(f"/api/{kind}/")  # warm the permission cache
    two, body = _count_queries(db_session, admin_client, f"/api/{kind}/")
    assert len(body) >= 2
    add(2, 5)
    five, body = _count_queries(db_session, admin_client, f"/api/{kind}/")
    assert len(body) >= 5
    assert five == two, "query count grew with the number of rows"
