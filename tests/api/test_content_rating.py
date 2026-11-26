"""
A person's, studio's and publisher's content rating, as a visibility gate.

    A record is hidden when its content rating is above the viewer's active
    access mode, OR when the connection rule hides it.

Every refusal here is set up to bite: the record is credited on a plain,
visible anime, so the connection rule alone would SHOW it - the only thing
left to hide it is the rating. And each is mirrored by the same fixture read
in a mode that shows the rating, or by the same record rated `normal`, so a
green proves the rating did the hiding rather than something incidental.

The sessions are the owner's account in each of the four modes
(`mode_client`): the owner holds every permission, so a 404 cannot come from
a missing view.* key - and an owner in a narrow mode is narrowed, since no
role is exempt.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import casting as casting_service
from app.services.domain import credits as credits_service

MODES = ("safe", "normal", "borderline", "unrestricted")

# The modes that show each rating.
SHOWN_IN = {
    "normal": set(MODES),
    "borderline": {"borderline", "unrestricted"},
    "unrestricted": {"unrestricted"},
}

# kind -> (an anime credit role naming it, model, route prefix)
KINDS = {
    "person": ("director", models.Person, "/api/person"),
    "studio": ("studio", models.Studio, "/api/studio"),
    "publisher": ("publisher", models.Publisher, "/api/publisher"),
}

FINDERS = {
    "person": credits_service.find_person,
    "studio": credits_service.find_studio,
    "publisher": credits_service.find_publisher,
}


def _credited(db_session, anime, kind, name, rating):
    """`name`, credited on `anime` under `kind`'s role and rated `rating`."""
    role = KINDS[kind][0]
    credits_service.replace_credits(db_session, "anime", anime.system_id, role, [name])
    entity = FINDERS[kind](db_session, name)
    entity.content_rating = rating
    db_session.commit()
    return entity


def _listed_ids(client, prefix) -> set[str]:
    response = client.get(f"{prefix}/")
    assert response.status_code == 200, response.text
    return {row["system_id"] for row in response.json()}


# ---------------------------------------------------------------------------
# The gate on the record's own routes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kind", sorted(KINDS))
@pytest.mark.parametrize("rating", ["borderline", "unrestricted"])
# `mode_key`, not `mode`: conftest has a `mode` fixture.
@pytest.mark.parametrize("mode_key", MODES)
def test_a_rated_record_on_a_visible_entry_is_seen_only_from_its_mode(
    mode_client, db_session, sample_anime, kind, rating, mode_key
):
    entity = _credited(db_session, sample_anime, kind, f"Rated {kind} {rating}", rating)
    prefix = KINDS[kind][2]
    client = mode_client(mode_key)

    detail = client.get(f"{prefix}/{entity.system_id}")
    listed = str(entity.system_id) in _listed_ids(client, prefix)

    if mode_key in SHOWN_IN[rating]:
        assert detail.status_code == 200, detail.text
        assert detail.json()["content_rating"] == rating
        assert listed
    else:
        assert detail.status_code == 404
        assert not listed
    # The entry it is credited on is visible either way: the rating hides the
    # record, never the entry.
    assert client.get(f"/api/anime/{sample_anime.system_id}").status_code == 200


@pytest.mark.parametrize("kind", sorted(KINDS))
def test_a_normal_record_is_seen_in_safe_mode(
    mode_client, db_session, sample_anime, kind
):
    """The mirror: the same credit, rated normal, is visible in the narrowest mode."""
    entity = _credited(db_session, sample_anime, kind, f"Plain {kind}", "normal")
    prefix = KINDS[kind][2]
    client = mode_client("safe")

    response = client.get(f"{prefix}/{entity.system_id}")
    assert response.status_code == 200
    assert response.json()["content_rating"] == "normal"
    assert str(entity.system_id) in _listed_ids(client, prefix)


def test_a_hidden_persons_photo_is_not_served(
    mode_client, db_session, sample_anime, cover_on_disk
):
    """The cover route reads the same rule, through its cached cover viewer;
    the file exists, so the 404 is the gate's."""
    person = _credited(db_session, sample_anime, "person", "Pictured", "borderline")
    url = cover_on_disk("staff", person.system_id)

    assert mode_client("normal").get(url).status_code == 404
    assert mode_client("borderline").get(url).status_code == 200


def test_the_rating_never_reveals_what_the_connections_hide(
    mode_client, db_session, owner_client
):
    """A `normal` studio credited only on a hentai stays hidden from a mode
    that cannot see hentai: the rating only ever hides."""
    body = owner_client.post("/api/hentai/", json={"hentai_name_cn": "Rated Hentai"}).json()
    hentai_id = uuid.UUID(body["system_id"])
    credits_service.replace_credits(db_session, "hentai", hentai_id, "studio", ["Hentai Only"])
    studio = credits_service.find_studio(db_session, "Hentai Only")
    assert studio.content_rating == "normal"
    db_session.commit()

    assert mode_client("borderline").get(f"/api/studio/{studio.system_id}").status_code == 404
    assert mode_client("unrestricted").get(f"/api/studio/{studio.system_id}").status_code == 200


# ---------------------------------------------------------------------------
# Readers that name the record on something else's page
# ---------------------------------------------------------------------------


def test_an_entry_does_not_name_a_credit_rated_above_the_mode(
    mode_client, db_session, sample_anime
):
    person = _credited(db_session, sample_anime, "person", "Hidden Director", "borderline")
    studio = _credited(db_session, sample_anime, "studio", "Hidden Studio", "borderline")
    publisher = _credited(db_session, sample_anime, "publisher", "Hidden Publisher", "borderline")
    credits_service.replace_credits(
        db_session, "anime", sample_anime.system_id, "producer", ["Plain Producer"]
    )
    db_session.commit()

    narrow = mode_client("normal").get(f"/api/anime/{sample_anime.system_id}")
    assert narrow.status_code == 200
    body = narrow.json()
    assert "director" not in body["credit_refs"]
    assert [r["display_name"] for r in body["credit_refs"]["producer"]] == ["Plain Producer"]
    assert body["studio_refs"] == []
    assert body["publisher_refs"] == []
    assert not body.get("director")
    assert not body.get("studio")

    wide = mode_client("borderline").get(f"/api/anime/{sample_anime.system_id}").json()
    assert [r["system_id"] for r in wide["credit_refs"]["director"]] == [str(person.system_id)]
    assert [r["system_id"] for r in wide["studio_refs"]] == [str(studio.system_id)]
    assert [r["system_id"] for r in wide["publisher_refs"]] == [str(publisher.system_id)]


def test_the_credits_endpoint_leaves_out_a_hidden_credit(
    mode_client, db_session, sample_anime
):
    _credited(db_session, sample_anime, "person", "Hidden Director", "unrestricted")
    url = f"/api/credits/anime/{sample_anime.system_id}"

    assert "director" not in mode_client("borderline").get(url).json()["credits"]
    assert mode_client("unrestricted").get(url).json()["credits"]["director"] == [
        "Hidden Director"
    ]


def test_saving_credits_keeps_one_the_editor_was_not_shown(
    mode_client, db_session, sample_anime
):
    hidden = _credited(db_session, sample_anime, "person", "Kept Director", "borderline")

    response = mode_client("normal").put(
        f"/api/credits/anime/{sample_anime.system_id}",
        json={"credits": {"director": ["Added Director"]}},
    )
    assert response.status_code == 200, response.text

    rows = (
        db_session.query(models.MediaCredit)
        .filter_by(media_id=sample_anime.system_id, role="director")
        .order_by(models.MediaCredit.position)
        .all()
    )
    added = credits_service.find_person(db_session, "Added Director")
    assert [r.person_id for r in rows] == [hidden.system_id, added.system_id]


def test_an_editor_who_sees_the_credit_can_remove_it(
    mode_client, db_session, sample_anime
):
    """The mirror: in a mode that shows it, leaving it out removes it."""
    _credited(db_session, sample_anime, "person", "Removed Director", "borderline")

    mode_client("borderline").put(
        f"/api/credits/anime/{sample_anime.system_id}",
        json={"credits": {"director": []}},
    )

    assert (
        db_session.query(models.MediaCredit)
        .filter_by(media_id=sample_anime.system_id, role="director")
        .count()
        == 0
    )


def _cast_with_voice(db_session, anime, rating):
    seiyuu = models.Person(name_en=f"Seiyuu {rating}", content_rating=rating)
    character = models.Character(name_en=f"Character {rating}")
    db_session.add_all([seiyuu, character])
    db_session.flush()
    casting_service.replace_casting(
        db_session,
        "anime",
        anime.system_id,
        [{"character_id": character.system_id, "voices": [{"person_id": seiyuu.system_id}]}],
    )
    db_session.commit()
    return seiyuu, character


def test_the_cast_and_the_character_page_leave_out_a_hidden_seiyuu(
    mode_client, db_session, sample_anime
):
    seiyuu, character = _cast_with_voice(db_session, sample_anime, "borderline")
    cast_url = f"/api/casting/anime/{sample_anime.system_id}"
    entries_url = f"/api/character/{character.system_id}/entries"

    narrow = mode_client("normal")
    cast = narrow.get(cast_url).json()["cast"]
    assert [row["character_id"] for row in cast] == [str(character.system_id)]
    assert cast[0]["voices"] == []
    [group] = narrow.get(entries_url).json()["groups"]
    assert group["entries"][0]["seiyuu"] == []
    assert narrow.get(f"/api/person/{seiyuu.system_id}").status_code == 404

    wide = mode_client("borderline")
    assert [v["person_id"] for v in wide.get(cast_url).json()["cast"][0]["voices"]] == [
        str(seiyuu.system_id)
    ]
    [group] = wide.get(entries_url).json()["groups"]
    assert [s["system_id"] for s in group["entries"][0]["seiyuu"]] == [str(seiyuu.system_id)]


def test_saving_the_cast_keeps_a_voice_the_editor_was_not_shown(
    mode_client, db_session, sample_anime
):
    seiyuu, character = _cast_with_voice(db_session, sample_anime, "borderline")
    client = mode_client("normal")
    shown = client.get(f"/api/casting/anime/{sample_anime.system_id}").json()["cast"]
    assert shown[0]["voices"] == []

    response = client.put(
        f"/api/casting/anime/{sample_anime.system_id}",
        json={"cast": [{"character_id": shown[0]["character_id"], "voices": []}]},
    )
    assert response.status_code == 200, response.text

    voices = db_session.query(models.CharacterCastingVoice).all()
    assert [v.person_id for v in voices] == [seiyuu.system_id]


def test_credit_usage_leaves_out_a_hidden_record(mode_client, db_session, sample_anime):
    person = _credited(db_session, sample_anime, "person", "Counted", "borderline")

    def people(client):
        usage = client.get("/api/credits/usage").json()
        return usage.get("anime", {}).get("person", {}).get("director", {})

    assert str(person.system_id) not in people(mode_client("normal"))
    assert str(person.system_id) in people(mode_client("borderline"))


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------


def _create(owner_client, kind, name, **extra):
    response = owner_client.post(f"{KINDS[kind][2]}/", json={"name_en": name, **extra})
    assert response.status_code in (200, 201), response.text
    return response.json()


@pytest.mark.parametrize("kind", sorted(KINDS))
def test_create_defaults_to_normal_and_takes_a_rating(owner_client, kind):
    assert _create(owner_client, kind, f"Default {kind}")["content_rating"] == "normal"
    rated = _create(owner_client, kind, f"Rated {kind}", content_rating="borderline")
    assert rated["content_rating"] == "borderline"


@pytest.mark.parametrize("kind", sorted(KINDS))
def test_a_create_that_finds_an_existing_record_keeps_its_rating(owner_client, kind):
    """POST is find-or-create: the quick-create a form fires for a typed name
    always sends a rating, and must not lower the found record's."""
    created = _create(owner_client, kind, f"Found {kind}", content_rating="unrestricted")

    found = _create(owner_client, kind, f"Found {kind}", content_rating="normal")

    assert found["system_id"] == created["system_id"]
    assert found["content_rating"] == "unrestricted"


@pytest.mark.parametrize("kind", sorted(KINDS))
def test_a_put_without_the_key_keeps_the_rating(owner_client, kind):
    created = _create(owner_client, kind, f"Kept {kind}", content_rating="unrestricted")
    url = f"{KINDS[kind][2]}/{created['system_id']}"

    response = owner_client.put(url, json={"name_en": f"Renamed {kind}"})
    assert response.status_code == 200, response.text
    assert response.json()["content_rating"] == "unrestricted"

    response = owner_client.put(
        url, json={"name_en": f"Renamed {kind}", "content_rating": "normal"}
    )
    assert response.json()["content_rating"] == "normal"


@pytest.mark.parametrize("kind", sorted(KINDS))
def test_patch_sets_the_rating(owner_client, kind):
    created = _create(owner_client, kind, f"Patched {kind}")
    url = f"{KINDS[kind][2]}/{created['system_id']}"

    response = owner_client.patch(url, json={"content_rating": "borderline"})
    assert response.status_code == 200, response.text
    assert response.json()["content_rating"] == "borderline"


@pytest.mark.parametrize("kind", sorted(KINDS))
@pytest.mark.parametrize("bad", ["adult", "", None, "Borderline (15+)"])
def test_an_unknown_rating_is_refused(owner_client, db_session, kind, bad):
    created = _create(owner_client, kind, f"Refused {kind}", content_rating="borderline")
    url = f"{KINDS[kind][2]}/{created['system_id']}"

    assert owner_client.patch(url, json={"content_rating": bad}).status_code == 422
    if bad is not None:
        # A null on PUT means "not sent"; every other bad value is refused.
        put = owner_client.put(url, json={"name_en": f"Refused {kind}", "content_rating": bad})
        assert put.status_code == 422
        assert owner_client.post(
            f"{KINDS[kind][2]}/", json={"name_en": f"New {kind}", "content_rating": bad}
        ).status_code == 422
    stored = db_session.get(KINDS[kind][1], uuid.UUID(created["system_id"]))
    db_session.refresh(stored)
    assert stored.content_rating == "borderline"


# ---------------------------------------------------------------------------
# The vocabulary
# ---------------------------------------------------------------------------


def test_constants_serve_the_ratings_and_their_labels(client):
    body = client.get("/api/constants").json()
    assert body["content_rating"] == ["normal", "borderline", "unrestricted"]
    assert body["content_rating_label"] == [
        "Normal",
        "Borderline (15+)",
        "Unrestricted (18+)",
    ]
