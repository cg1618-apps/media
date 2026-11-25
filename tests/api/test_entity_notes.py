"""
Notes on the five entities - studio, publisher, person, character, identity.

An entity owns three sections: the catalogue's 備註 Remark list, each viewer's
個人筆記 Personal Notes, and 資源 Resources, the mixed list of links an entry
also keeps. It answers to its own view gate, as its page
does: a viewer who cannot read the entity cannot read or write its notes, and
is told 404 exactly as for an entity that does not exist. Deleting the entity
takes its notes with it.
"""

import uuid

import pytest

from app import models
from app.services.domain.entity_remarks import (
    add_remark,
    convert_stashed_remarks,
    has_remark,
    stash_legacy_remark,
)


@pytest.fixture
def character(db_session):
    row = models.Character(system_id=uuid.uuid4(), name_en="Yuki Nagato")
    db_session.add(row)
    db_session.commit()
    return row


@pytest.fixture
def studio(db_session):
    row = models.Studio(system_id=uuid.uuid4(), name_en="Kyoto Animation")
    db_session.add(row)
    db_session.commit()
    return row


def _remark(client, owner_type, owner_id, text="A remark"):
    return client.post(
        "/api/notes",
        json={"owner_type": owner_type, "owner_id": str(owner_id), "section": "remark", "content": text},
    )


@pytest.mark.parametrize("owner_type", ["studio", "publisher", "person", "character", "identity"])
def test_an_entity_offers_the_remark_list_personal_notes_and_resources(owner_client, owner_type):
    r = owner_client.get("/api/notes/sections", params={"owner_type": owner_type})
    assert r.status_code == 200
    sections = r.json()
    assert [s["key"] for s in sections] == ["remark", "personal_notes", "resources"]
    # Its own card, as on an entry - only a game folds it into a group.
    resources = sections[-1]
    assert resources["standalone"] is True
    assert resources["group"] is None


@pytest.mark.parametrize("owner_type", ["studio", "publisher", "person", "character", "identity"])
def test_a_resource_is_written_and_read_back_on_every_entity(owner_client, db_session, owner_type):
    owner = {
        "studio": lambda: models.Studio(system_id=uuid.uuid4(), name_en="Kyoto Animation"),
        "publisher": lambda: models.Publisher(system_id=uuid.uuid4(), name_en="Kadokawa"),
        "person": lambda: models.Person(system_id=uuid.uuid4(), name_en="Aya Hirano"),
        "character": lambda: models.Character(system_id=uuid.uuid4(), name_en="Haruhi"),
    }
    if owner_type == "identity":
        character = models.Character(system_id=uuid.uuid4(), name_en="Kirito")
        db_session.add(character)
        db_session.flush()
        row = models.CharacterIdentity(
            system_id=uuid.uuid4(), character_id=character.system_id, name_en="Kirigaya Kazuto"
        )
    else:
        row = owner[owner_type]()
    db_session.add(row)
    db_session.commit()

    r = owner_client.post(
        "/api/notes",
        json={
            "owner_type": owner_type,
            "owner_id": str(row.system_id),
            "section": "resources",
            "kind": "Wikis",
            "title": "Fandom",
            "links": [{"url": "https://example.fandom.com/wiki/X"}],
        },
    )
    assert r.status_code == 201, r.text
    rows = owner_client.get(
        "/api/notes", params={"owner_type": owner_type, "owner_id": str(row.system_id)}
    ).json()
    assert [(n["section"], n["kind"], n["title"]) for n in rows] == [("resources", "Wikis", "Fandom")]
    assert rows[0]["links"] == [{"text": None, "url": "https://example.fandom.com/wiki/X"}]


def test_a_guest_cannot_read_or_write_an_entitys_resources(client, owner_client, studio):
    payload = {
        "owner_type": "studio",
        "owner_id": str(studio.system_id),
        "section": "resources",
        "title": "Official site",
        "links": [{"url": "https://www.kyotoanimation.co.jp/"}],
    }
    # The owner can - the mirror case that makes the guest's refusal the gate's.
    assert owner_client.post("/api/notes", json=payload).status_code == 201
    r = client.get("/api/notes", params={"owner_type": "studio", "owner_id": str(studio.system_id)})
    assert r.status_code == 404
    assert client.post("/api/notes", json=payload).status_code in (401, 404)


def test_a_remark_is_written_and_read_back_on_a_character(owner_client, character):
    assert _remark(owner_client, "character", character.system_id).status_code == 201
    rows = owner_client.get(
        "/api/notes", params={"owner_type": "character", "owner_id": str(character.system_id)}
    ).json()
    assert [(r["section"], r["content"]) for r in rows] == [("remark", "A remark")]
    assert rows[0]["owner_type"] == "character"


def test_any_other_section_is_refused_on_an_entity(owner_client, studio):
    r = owner_client.post(
        "/api/notes",
        json={"owner_type": "studio", "owner_id": str(studio.system_id), "section": "trivia", "content": "x"},
    )
    assert r.status_code in (400, 422)


def test_a_guest_cannot_read_or_write_an_entitys_notes(client, owner_client, character):
    # The owner can - the mirror case that makes the guest's 404 the gate's.
    assert _remark(owner_client, "character", character.system_id).status_code == 201
    r = client.get("/api/notes", params={"owner_type": "character", "owner_id": str(character.system_id)})
    assert r.status_code == 404
    assert _remark(client, "character", character.system_id).status_code in (401, 404)


def test_a_note_on_a_missing_entity_is_refused(owner_client):
    assert _remark(owner_client, "studio", uuid.uuid4()).status_code == 404


def test_deleting_the_entity_deletes_its_notes(owner_client, db_session, studio):
    assert _remark(owner_client, "studio", studio.system_id).status_code == 201
    db_session.delete(db_session.get(models.Studio, studio.system_id))
    db_session.commit()
    assert db_session.query(models.Note).filter_by(studio_id=studio.system_id).count() == 0


def test_add_remark_appends_and_never_repeats(db_session, owner_user, character):
    assert not has_remark(db_session, "character", character.system_id)
    assert add_remark(db_session, "character", character.system_id, " First ", owner_user.id)
    assert not add_remark(db_session, "character", character.system_id, "First", owner_user.id)
    assert add_remark(db_session, "character", character.system_id, "Second", owner_user.id)
    rows = (
        db_session.query(models.Note)
        .filter_by(character_id=character.system_id)
        .order_by(models.Note.sort_index)
        .all()
    )
    assert [r.content for r in rows] == ["First", "Second"]


def test_an_older_sheets_remark_becomes_a_remark_once(db_session, owner_user, character, studio):
    # The author is whoever writes the catalogue's remarks.
    add_remark(db_session, "studio", studio.system_id, "Already listed", owner_user.id)
    stash_legacy_remark(db_session, "Character", {"system_id": character.system_id, "remark": "From the sheet"})
    stash_legacy_remark(db_session, "Studio", {"system_id": studio.system_id, "remark": "Not added - list not empty"})
    stash_legacy_remark(db_session, "Studio", {"system_id": uuid.uuid4(), "remark": "No such studio"})
    assert convert_stashed_remarks(db_session) == 1
    assert [n.content for n in db_session.query(models.Note).filter_by(character_id=character.system_id)] == [
        "From the sheet"
    ]
    assert db_session.query(models.Note).filter_by(studio_id=studio.system_id).count() == 1
    assert convert_stashed_remarks(db_session) == 0


def test_a_merge_moves_the_losers_notes_after_the_survivors(owner_client, db_session, owner_user, character):
    loser = models.Character(system_id=uuid.uuid4(), name_en="Yuki N.")
    db_session.add(loser)
    db_session.commit()
    add_remark(db_session, "character", character.system_id, "Keeper's", owner_user.id)
    add_remark(db_session, "character", loser.system_id, "Loser's", owner_user.id)
    db_session.commit()

    r = owner_client.post(
        f"/api/character/{character.system_id}/merge", json={"source_id": str(loser.system_id)}
    )
    assert r.status_code == 200
    rows = (
        db_session.query(models.Note)
        .filter_by(character_id=character.system_id)
        .order_by(models.Note.sort_index)
        .all()
    )
    assert [n.content for n in rows] == ["Keeper's", "Loser's"]


def test_sync_from_cast_adds_the_rows_remark_to_the_list(owner_client, db_session, character, sample_anime):
    casting = models.CharacterCasting(
        system_id=uuid.uuid4(),
        character_id=character.system_id,
        media_type="anime",
        entry_id=sample_anime.system_id,
        remark="From the cast row",
    )
    db_session.add(casting)
    db_session.commit()
    for _ in range(2):  # a second sync adds nothing
        r = owner_client.post(
            f"/api/character/{character.system_id}/sync-from-cast",
            json={"casting_id": str(casting.system_id)},
        )
        assert r.status_code == 200, r.text
    assert [n.content for n in db_session.query(models.Note).filter_by(character_id=character.system_id)] == [
        "From the cast row"
    ]
