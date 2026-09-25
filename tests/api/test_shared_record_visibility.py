"""
Shared records - people, characters, studios, publishers, vocabulary values -
are hidden when every connection they have is hidden.

A connection is an appearance on an entry (hidden when the entry is
label-hidden) or a scope naming a gated type (hidden when the viewer cannot
see that type). A record with no connections stays visible. See
app/services/rbac/shared_visibility.py and docs/authorization.md, "Shared
records".

Two things make the refusal tests bite, and both look like decoration:

  - `nsfw_label` and the labelled entry. The rule computes over the labels
    the viewer's mode lacks, which is EMPTY in a fresh test database, so a
    refusal without a real label passes vacuously.
  - the mirror. Every refusal is paired with `admin_client` - `unrestricted`,
    which carries every label - asking the same thing and getting the record,
    so a 404 says the gate refused rather than that the row was never there.

The narrow viewer is the anonymous `client`, which resolves to the `safe`
mode; a label created by a test reaches only the wide modes.

The scope-half tests here register a gated type of their own by pointing an
existing type key (`manga`) at `nsfw`, so they stay independent of h-comic;
tests/api/test_h_comic_shared_records.py covers the real gated type.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import os
import uuid

import pytest

from app import models
from app.services.domain import credits as credits_service
from app.services.integrations.image_manager import COVER_DIR, cover_key
from app.services.rbac import gated_types
from app.services.rbac.permissions import media_type_perm
from app.services.rbac.seed import default_guest_permissions
from tests.api.conftest import make_viewer, nsfw_label  # noqa: F401

HIDDEN_TITLE = "Zvornik Shared Hidden Anime"
VISIBLE_TITLE = "Zvornik Shared Visible Manga"
PIXEL = b"\xff\xd8\xff\xe0 bytes on disk"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def labelled_anime(db_session, sample_franchise, nsfw_label):
    """An anime carrying `nsfw` - the connection every refusal hides behind."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en=HIDDEN_TITLE,
        airing_type="TV",
    )
    db_session.add(entry)
    db_session.flush()
    db_session.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(),
            media_id=entry.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    db_session.flush()
    return entry


@pytest.fixture
def visible_manga(db_session, sample_franchise):
    entry = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en=VISIBLE_TITLE,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def hidden_only_director(db_session, labelled_anime):
    """A person whose only credit is on the labelled anime."""
    credits_service.replace_credits(
        db_session, "anime", labelled_anime.system_id, "director", ["Zvornik Director"]
    )
    db_session.flush()
    return credits_service.find_person(db_session, "Zvornik Director")


@pytest.fixture
def cover_on_disk():
    """Write an image for one owner, and take it away again afterwards."""
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
def manga_is_gated(monkeypatch, nsfw_label):
    """Register `manga` as a gated type requiring `nsfw`, for this test only."""
    monkeypatch.setitem(gated_types.REQUIRED_LABEL_FOR_TYPE, "manga", nsfw_label.key)


def _ids(response) -> set[str]:
    assert response.status_code == 200, response.text
    return {row["system_id"] for row in response.json()}


# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------


def test_a_person_credited_only_on_hidden_entries_is_hidden(
    client, admin_client, hidden_only_director
):
    person_id = str(hidden_only_director.system_id)

    for path in (f"/api/person/{person_id}", f"/api/person/{person_id}/entries"):
        assert client.get(path).status_code == 404
    assert person_id not in _ids(client.get("/api/person/"))
    assert person_id not in _ids(client.get("/api/person/?role=director"))
    search = client.get("/api/search/?q=Zvornik Director").json()
    assert search["results"]["person"] == []
    assert client.get("/api/person/role-counts").json()["director"] == 0

    # The mirror: unrestricted carries the label and sees the same person.
    assert admin_client.get(f"/api/person/{person_id}").status_code == 200
    assert HIDDEN_TITLE in admin_client.get(f"/api/person/{person_id}/entries").text
    assert person_id in _ids(admin_client.get("/api/person/"))
    search = admin_client.get("/api/search/?q=Zvornik Director").json()
    assert [p["system_id"] for p in search["results"]["person"]] == [person_id]
    assert admin_client.get("/api/person/role-counts").json()["director"] == 1


def test_a_seiyuu_cast_only_on_hidden_entries_is_hidden(
    client, admin_client, db_session, labelled_anime, character
):
    """A seiyuu appears through character_casting, not media_credit."""
    person = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Voice")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="anime",
            entry_id=labelled_anime.system_id,
            person_id=person.system_id,
        )
    )
    db_session.flush()

    assert client.get(f"/api/person/{person.system_id}").status_code == 404
    assert admin_client.get(f"/api/person/{person.system_id}").status_code == 200


def test_one_visible_credit_keeps_a_person_visible_and_omits_the_hidden_one(
    client, admin_client, db_session, hidden_only_director, visible_manga
):
    credits_service.replace_credits(
        db_session, "manga", visible_manga.system_id, "author", ["Zvornik Director"]
    )
    db_session.flush()
    person_id = str(hidden_only_director.system_id)

    detail = client.get(f"/api/person/{person_id}")
    assert detail.status_code == 200
    assert detail.json()["credit_count"] == 1
    entries = client.get(f"/api/person/{person_id}/entries")
    assert entries.status_code == 200
    # The hidden credit is omitted whole - no empty anime group naming the
    # hidden work's type.
    assert [(g["media_type"], g["role"]) for g in entries.json()["groups"]] == [
        ("manga", "author")
    ]
    assert HIDDEN_TITLE not in entries.text
    assert person_id in _ids(client.get("/api/person/"))

    # The mirror: unrestricted sees both groups.
    groups = admin_client.get(f"/api/person/{person_id}/entries").json()["groups"]
    assert {(g["media_type"], g["role"]) for g in groups} == {
        ("manga", "author"),
        ("anime", "director"),
    }
    assert admin_client.get(f"/api/person/{person_id}").json()["credit_count"] == 2


def test_a_person_with_no_connections_stays_visible(
    client, person, labelled_anime
):
    """labelled_anime makes the hidden set non-empty; the person has no
    credits, roles or castings at all, and so nothing to be hidden by."""
    assert client.get(f"/api/person/{person.system_id}").status_code == 200
    assert str(person.system_id) in _ids(client.get("/api/person/"))


def test_a_media_type_gap_does_not_hide_a_person(
    client, db_session, sample_franchise, labelled_anime
):
    """
    A viewer lacking media_type.game still sees a person credited only on a
    game: only LABEL-hidden appearances count. The viewer's mode carries no
    labels, so the label half is live too (labelled_anime).
    """
    make_viewer(
        db_session,
        client,
        "nogames",
        default_guest_permissions() - {media_type_perm("game")},
        label_keys=(),
    )
    game = models.Game(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        game_name_en="Zvornik Game",
    )
    db_session.add(game)
    db_session.flush()
    credits_service.replace_credits(
        db_session, "game", game.system_id, "director", ["Zvornik Game Director"]
    )
    db_session.flush()
    person = credits_service.find_person(db_session, "Zvornik Game Director")

    assert client.get(f"/api/person/{person.system_id}").status_code == 200
    groups = client.get(f"/api/person/{person.system_id}/entries").json()["groups"]
    # The type gap withholds the entry, and the group stays, empty.
    assert [(g["media_type"], g["entries"]) for g in groups] == [("game", [])]


def test_a_person_credited_on_an_entry_in_a_hidden_franchise_is_hidden(
    client, admin_client, db_session, nsfw_label
):
    """The franchise half of the label gate counts as well."""
    franchise = models.Franchise(
        system_id=uuid.uuid4(), franchise_type="Anime", franchise_name_en="Zvornik F"
    )
    db_session.add(franchise)
    db_session.flush()
    db_session.add(
        models.FranchiseContentLabel(
            system_id=uuid.uuid4(),
            franchise_id=franchise.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en="Zvornik Franchise Anime",
        airing_type="TV",
    )
    db_session.add(entry)
    db_session.flush()
    credits_service.replace_credits(
        db_session, "anime", entry.system_id, "director", ["Zvornik F Director"]
    )
    db_session.flush()
    person = credits_service.find_person(db_session, "Zvornik F Director")

    assert client.get(f"/api/person/{person.system_id}").status_code == 404
    assert admin_client.get(f"/api/person/{person.system_id}").status_code == 200


def test_a_hidden_person_cannot_be_edited_by_a_narrow_editor(
    admin_client, catalog_writer, hidden_only_director
):
    """Writes follow reads: a narrowed catalogue editor gets the same 404."""
    person_id = hidden_only_director.system_id
    narrow = catalog_writer()
    payload = {"name_en": "Renamed", "roles": []}
    assert narrow.put(f"/api/person/{person_id}", json=payload).status_code == 404
    # The mirror: an editor whose mode carries the label may.
    response = admin_client.put(f"/api/person/{person_id}", json=payload)
    assert response.status_code == 200, response.text


# ---------------------------------------------------------------------------
# Characters, studios, publishers
# ---------------------------------------------------------------------------


def test_a_character_cast_only_on_hidden_entries_is_hidden(
    client, admin_client, db_session, labelled_anime, character
):
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="anime",
            entry_id=labelled_anime.system_id,
        )
    )
    db_session.flush()
    character_id = str(character.system_id)

    for path in (
        f"/api/character/{character_id}",
        f"/api/character/{character_id}/entries",
    ):
        assert client.get(path).status_code == 404
    assert character_id not in _ids(client.get("/api/character/?name=Ichika"))

    assert admin_client.get(f"/api/character/{character_id}").status_code == 200
    assert character_id in _ids(admin_client.get("/api/character/?name=Ichika"))


def test_a_character_with_one_visible_casting_omits_the_hidden_one(
    client, db_session, labelled_anime, visible_manga, character
):
    for media_type, entry in (("anime", labelled_anime), ("manga", visible_manga)):
        db_session.add(
            models.CharacterCasting(
                character_id=character.system_id,
                media_type=media_type,
                entry_id=entry.system_id,
            )
        )
    db_session.flush()

    response = client.get(f"/api/character/{character.system_id}/entries")
    assert response.status_code == 200
    assert [g["media_type"] for g in response.json()["groups"]] == ["manga"]
    assert HIDDEN_TITLE not in response.text


def test_a_studio_credited_only_on_hidden_entries_is_hidden(
    client, admin_client, db_session, labelled_anime
):
    credits_service.replace_credits(
        db_session, "anime", labelled_anime.system_id, "studio", ["Zvornik Studio"]
    )
    db_session.flush()
    studio = credits_service.find_studio(db_session, "Zvornik Studio")
    studio_id = str(studio.system_id)

    for path in (f"/api/studio/{studio_id}", f"/api/studio/{studio_id}/entries"):
        assert client.get(path).status_code == 404
    assert studio_id not in _ids(client.get("/api/studio/"))
    assert client.get("/api/search/?q=Zvornik Studio").json()["results"]["studio"] == []

    assert admin_client.get(f"/api/studio/{studio_id}").status_code == 200
    assert studio_id in _ids(admin_client.get("/api/studio/"))


def test_a_publisher_credited_only_on_hidden_entries_is_hidden(
    client, admin_client, db_session, labelled_anime
):
    credits_service.replace_credits(
        db_session,
        "anime",
        labelled_anime.system_id,
        "publisher",
        ["Zvornik Publisher"],
    )
    db_session.flush()
    publisher = credits_service.find_publisher(db_session, "Zvornik Publisher")
    publisher_id = str(publisher.system_id)

    for path in (
        f"/api/publisher/{publisher_id}",
        f"/api/publisher/{publisher_id}/entries",
    ):
        assert client.get(path).status_code == 404
    assert publisher_id not in _ids(client.get("/api/publisher/?scope=anime"))

    assert admin_client.get(f"/api/publisher/{publisher_id}").status_code == 200
    assert publisher_id in _ids(admin_client.get("/api/publisher/?scope=anime"))


# ---------------------------------------------------------------------------
# Vocabulary values
# ---------------------------------------------------------------------------


def test_a_vocabulary_value_used_only_on_hidden_entries_is_hidden(
    client, admin_client, db_session, labelled_anime
):
    credits_service.replace_tags(
        db_session, labelled_anime.system_id, "genre_main", ["Zvornik Genre"]
    )
    # A second value in the same category, used nowhere: no connections, so
    # it stays visible - the rule's third case, beside the hidden one.
    unused = models.SystemOption(category="Genre Main", value="Zvornik Unused")
    db_session.add(unused)
    db_session.flush()

    def values(c, path):
        response = c.get(path)
        assert response.status_code == 200, response.text
        return {row["value"] for row in response.json()}

    for path in ("/api/options/Genre Main", "/api/options/"):
        narrow = values(client, path)
        assert "Zvornik Genre" not in narrow
        assert "Zvornik Unused" in narrow
        assert {"Zvornik Genre", "Zvornik Unused"} <= values(admin_client, path)


# ---------------------------------------------------------------------------
# Series, covers, notes
# ---------------------------------------------------------------------------


@pytest.fixture
def hidden_series(db_session, nsfw_label):
    franchise = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_type="Anime",
        franchise_name_en="Zvornik Hidden Franchise",
    )
    db_session.add(franchise)
    db_session.flush()
    db_session.add(
        models.FranchiseContentLabel(
            system_id=uuid.uuid4(),
            franchise_id=franchise.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    series = models.Series(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        series_name_en="Zvornik Hidden Series",
    )
    db_session.add(series)
    db_session.flush()
    return series


def test_a_series_under_a_hidden_franchise_is_hidden(
    client, admin_client, hidden_series
):
    series_id = str(hidden_series.system_id)

    assert client.get(f"/api/series/{series_id}").status_code == 404
    assert series_id not in _ids(client.get("/api/series/"))
    assert client.get("/api/search/?q=Zvornik Hidden Series").json()["results"][
        "series"
    ] == []

    assert admin_client.get(f"/api/series/{series_id}").status_code == 200
    assert series_id in _ids(admin_client.get("/api/series/"))
    assert [
        s["system_id"]
        for s in admin_client.get("/api/search/?q=Zvornik Hidden Series").json()[
            "results"
        ]["series"]
    ] == [series_id]


def test_a_hidden_persons_photo_is_not_served(
    client, admin_client, hidden_only_director, cover_on_disk
):
    url = cover_on_disk("staff", hidden_only_director.system_id)
    # The mirror first: the file is really there and really served.
    allowed = admin_client.get(url)
    assert allowed.status_code == 200
    assert allowed.content == PIXEL
    assert client.get(url).status_code == 404


def test_a_visible_persons_photo_is_served_to_the_same_narrow_viewer(
    client, person, labelled_anime, cover_on_disk
):
    url = cover_on_disk("staff", person.system_id)
    assert client.get(url).status_code == 200


def test_notes_on_a_hidden_series_are_404(client, admin_client, hidden_series):
    path = f"/api/notes?owner_type=series&owner_id={hidden_series.system_id}"
    assert client.get(path).status_code == 404
    assert admin_client.get(path).status_code == 200


def test_a_narrow_editor_cannot_write_a_note_on_a_hidden_series(
    admin_client, catalog_writer, hidden_series
):
    payload = {
        "owner_type": "series",
        "owner_id": str(hidden_series.system_id),
        "section": "public_reviews",
        "content": "Zvornik note",
    }
    narrow = catalog_writer()
    assert narrow.post("/api/notes", json=payload).status_code == 404
    response = admin_client.post("/api/notes", json=payload)
    assert response.status_code == 201, response.text


def test_a_meme_on_a_hidden_series_is_dropped(
    client, admin_client, catalog_writer, hidden_series
):
    payload = {
        "owner_type": "series",
        "owner_id": str(hidden_series.system_id),
        "text": "Zvornik meme",
    }
    created = admin_client.post("/api/meme/", json=payload)
    assert created.status_code in (200, 201), created.text
    meme_id = created.json()["system_id"]
    path = f"/api/meme/?owner_type=series&owner_id={hidden_series.system_id}"

    assert client.get(path).json() == []
    assert client.get(f"/api/meme/{meme_id}").status_code == 404
    assert catalog_writer().post("/api/meme/", json=payload).status_code == 404

    assert [m["system_id"] for m in admin_client.get(path).json()] == [meme_id]


# ---------------------------------------------------------------------------
# Scope connections - a gated type registered for the test
# ---------------------------------------------------------------------------


def test_a_person_whose_only_role_names_a_hidden_gated_type_is_hidden(
    client, admin_client, db_session, manga_is_gated
):
    """A club minted before its first credit: roles, and nothing else."""
    person = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Club")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="author", scope="manga")
    )
    db_session.flush()

    assert client.get(f"/api/person/{person.system_id}").status_code == 404
    assert client.get("/api/person/?role=author&scope=manga").json() == []
    assert "manga" not in client.get("/api/person/role-scopes").json()["author"]

    assert admin_client.get(f"/api/person/{person.system_id}").status_code == 200
    assert str(person.system_id) in _ids(
        admin_client.get("/api/person/?role=author&scope=manga")
    )
    assert "manga" in admin_client.get("/api/person/role-scopes").json()["author"]


def test_an_ungated_scope_is_not_a_connection(
    client, db_session, hidden_only_director, labelled_anime
):
    """
    hidden_only_director holds (director, anime), written by replace_credits.
    anime is not gated, so that role is not a connection and cannot keep the
    person visible - only the hidden credit counts, and it hides them.
    """
    roles = db_session.query(models.PersonRole).filter_by(
        person_id=hidden_only_director.system_id
    )
    assert [(r.role, r.scope) for r in roles] == [("director", "anime")]
    assert client.get(f"/api/person/{hidden_only_director.system_id}").status_code == 404


def test_a_visible_person_omits_a_role_scoped_to_a_hidden_gated_type(
    client, admin_client, db_session, sample_anime, manga_is_gated
):
    credits_service.replace_credits(
        db_session, "anime", sample_anime.system_id, "director", ["Zvornik Both"]
    )
    person = credits_service.find_person(db_session, "Zvornik Both")
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="author", scope="manga")
    )
    db_session.flush()

    narrow = client.get(f"/api/person/{person.system_id}")
    assert narrow.status_code == 200
    assert {(r["role"], r["scope"]) for r in narrow.json()["roles"]} == {
        ("director", "anime")
    }
    wide = admin_client.get(f"/api/person/{person.system_id}").json()
    assert {(r["role"], r["scope"]) for r in wide["roles"]} == {
        ("director", "anime"),
        ("author", "manga"),
    }


def test_a_narrow_editor_saving_a_person_keeps_the_roles_it_cannot_see(
    catalog_writer, db_session, sample_anime, manga_is_gated
):
    credits_service.replace_credits(
        db_session, "anime", sample_anime.system_id, "director", ["Zvornik Kept"]
    )
    person = credits_service.find_person(db_session, "Zvornik Kept")
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="author", scope="manga")
    )
    db_session.flush()

    narrow = catalog_writer()
    response = narrow.put(
        f"/api/person/{person.system_id}",
        json={
            "name_en": "Zvornik Kept",
            "roles": [{"role": "director", "scope": "anime"}],
        },
    )
    assert response.status_code == 200, response.text
    db_session.expire_all()
    stored = {
        (r.role, r.scope)
        for r in db_session.query(models.PersonRole).filter_by(
            person_id=person.system_id
        )
    }
    assert stored == {("director", "anime"), ("author", "manga")}


def test_a_value_scoped_only_to_a_hidden_gated_type_is_hidden(
    client, admin_client, db_session, manga_is_gated
):
    option = models.SystemOption(category="Genre Main", value="Zvornik Gated Genre")
    option.scopes = [models.SystemOptionScope(scope="manga")]
    db_session.add(option)
    db_session.flush()

    def values(c, path):
        return {row["value"] for row in c.get(path).json()}

    assert "Zvornik Gated Genre" not in values(client, "/api/options/Genre Main")
    assert values(client, "/api/options/Genre Main?scope=manga") == set()
    assert "Zvornik Gated Genre" in values(admin_client, "/api/options/Genre Main")


def test_a_publisher_scoped_only_to_a_hidden_gated_type_is_hidden(
    client, admin_client, db_session, manga_is_gated
):
    publisher = models.Publisher(name_en="Zvornik Gated Publisher")
    db_session.add(publisher)
    db_session.flush()
    db_session.add(
        models.PublisherScope(publisher_id=publisher.system_id, scope="manga")
    )
    db_session.flush()

    assert client.get(f"/api/publisher/{publisher.system_id}").status_code == 404
    assert admin_client.get(f"/api/publisher/{publisher.system_id}").status_code == 200


def test_the_registry_names_exactly_h_comic_and_hentai():
    """h-comic and hentai are the gated types, and each requires the label its
    own domain module stamps - the spellings are pinned together here."""
    from app.services.domain import h_comic

    assert gated_types.REQUIRED_LABEL_FOR_TYPE == {"h-comic": "h-comic", "hentai": "hentai"}
    assert gated_types.REQUIRED_LABEL_FOR_TYPE[h_comic.MEDIA_TYPE] == h_comic.LABEL_KEY
