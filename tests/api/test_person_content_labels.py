"""
Content labels on a person, as a visibility gate.

    A person is hidden when they carry a label the viewer's active mode does
    not, OR when their content rating or the connection rule hides them.

Every refusal here is set up to bite: the person is credited on a plain,
visible anime, so the connection rule alone would SHOW them, and they are
rated `normal`, so the rating alone would show them too - the only thing left
to hide them is the label. The label set is never empty: the person carries
`erotica` (and with it `nsfw`), which `safe` and `normal` do not show. Each
refusal is mirrored by the same fixture read from a mode that carries the
label, or by the same person unlabelled, so a green proves the label did the
hiding.

The label does NOT cascade: the entry the person is credited on stays
visible in every mode, and that is asserted beside each refusal.

The sessions are the owner's account in each of the four modes
(`mode_client`): the owner holds every permission, so a 404 cannot come from a
missing view.* key.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import casting as casting_service
from app.services.domain import credits as credits_service
from app.services.domain.gated_labels import ensure_label
from app.services.pipelines import pull
from app.services.pipelines.tabs import TAB_NAMES

MODES = ("safe", "normal", "borderline", "unrestricted")
# The modes that show `erotica` (labels.py: its lowest mode is borderline).
SHOWN = {"borderline", "unrestricted"}


def _label(db_session, person, *keys):
    """Attach `keys` to `person` directly, as the assignment route stores them."""
    for position, key in enumerate(keys):
        db_session.add(
            models.PersonContentLabel(
                person_id=person.system_id,
                label_id=ensure_label(db_session, key).system_id,
                position=position,
            )
        )
    db_session.commit()


@pytest.fixture
def credited_director(db_session, sample_anime):
    """A `normal`-rated director credited on the visible `sample_anime`."""
    credits_service.replace_credits(
        db_session, "anime", sample_anime.system_id, "director", ["Labelled Director"]
    )
    person = credits_service.find_person(db_session, "Labelled Director")
    assert person.content_rating == "normal"
    db_session.commit()
    return person


@pytest.fixture
def labelled_director(db_session, credited_director):
    """`credited_director`, carrying erotica and nsfw."""
    _label(db_session, credited_director, "nsfw", "erotica")
    return credited_director


def _listed_ids(client) -> set[str]:
    response = client.get("/api/person/")
    assert response.status_code == 200, response.text
    return {row["system_id"] for row in response.json()}


def _searched_ids(client, q) -> set[str]:
    response = client.get("/api/search/", params={"q": q})
    assert response.status_code == 200, response.text
    return {row["system_id"] for row in response.json()["results"].get("person", [])}


# ---------------------------------------------------------------------------
# The person's own routes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("mode_key", MODES)
def test_a_labelled_person_is_seen_only_from_a_mode_carrying_the_label(
    mode_client, sample_anime, labelled_director, mode_key
):
    client = mode_client(mode_key)
    person_id = str(labelled_director.system_id)

    detail = client.get(f"/api/person/{person_id}")
    if mode_key in SHOWN:
        assert detail.status_code == 200, detail.text
        assert [row["key"] for row in detail.json()["content_labels"]] == [
            "nsfw",
            "erotica",
        ]
        assert person_id in _listed_ids(client)
        assert person_id in _searched_ids(client, "Labelled Director")
    else:
        assert detail.status_code == 404
        assert detail.json()["detail"] == "Person not found."
        assert person_id not in _listed_ids(client)
        assert person_id not in _searched_ids(client, "Labelled Director")
    # No cascade: the entry the person is credited on is visible either way.
    assert client.get(f"/api/anime/{sample_anime.system_id}").status_code == 200


def test_the_same_person_unlabelled_is_seen_in_safe_mode(
    mode_client, credited_director
):
    """The mirror: the same credit, no label, in the narrowest mode."""
    client = mode_client("safe")
    response = client.get(f"/api/person/{credited_director.system_id}")
    assert response.status_code == 200, response.text
    assert response.json()["content_labels"] == []
    assert str(credited_director.system_id) in _listed_ids(client)


def test_the_list_carries_each_persons_labels(mode_client, labelled_director):
    rows = {row["system_id"]: row for row in mode_client("unrestricted").get("/api/person/").json()}
    labels = rows[str(labelled_director.system_id)]["content_labels"]
    assert [row["key"] for row in labels] == ["nsfw", "erotica"]
    assert {"key", "label"} <= set(labels[0])


def test_a_labelled_persons_photo_is_not_served(
    mode_client, labelled_director, cover_on_disk
):
    """The cover route reads the same rule through its cached viewer; the file
    exists, so the 404 is the gate's."""
    url = cover_on_disk("staff", labelled_director.system_id)

    assert mode_client("normal").get(url).status_code == 404
    assert mode_client("borderline").get(url).status_code == 200


# ---------------------------------------------------------------------------
# Readers that name the person on something else's page
# ---------------------------------------------------------------------------


def test_an_entry_does_not_name_a_labelled_credit(
    mode_client, db_session, sample_anime, labelled_director
):
    credits_service.replace_credits(
        db_session, "anime", sample_anime.system_id, "producer", ["Plain Producer"]
    )
    db_session.commit()

    narrow = mode_client("normal").get(f"/api/anime/{sample_anime.system_id}")
    assert narrow.status_code == 200
    body = narrow.json()
    assert "director" not in body["credit_refs"]
    assert [r["display_name"] for r in body["credit_refs"]["producer"]] == ["Plain Producer"]

    wide = mode_client("borderline").get(f"/api/anime/{sample_anime.system_id}").json()
    assert [r["system_id"] for r in wide["credit_refs"]["director"]] == [
        str(labelled_director.system_id)
    ]


def test_the_credits_endpoint_leaves_out_a_labelled_credit(
    mode_client, sample_anime, labelled_director
):
    url = f"/api/credits/anime/{sample_anime.system_id}"

    assert "director" not in mode_client("normal").get(url).json()["credits"]
    assert mode_client("borderline").get(url).json()["credits"]["director"] == [
        "Labelled Director"
    ]


def test_saving_credits_keeps_a_labelled_person_the_editor_was_not_shown(
    mode_client, db_session, sample_anime, labelled_director
):
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
    assert [r.person_id for r in rows] == [labelled_director.system_id, added.system_id]


def test_an_editor_who_sees_the_labelled_credit_can_remove_it(
    mode_client, db_session, sample_anime, labelled_director
):
    """The mirror: in a mode carrying the label, leaving it out removes it."""
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


@pytest.fixture
def labelled_seiyuu(db_session, sample_anime):
    """A labelled seiyuu voicing a character on `sample_anime`."""
    seiyuu = models.Person(name_en="Labelled Seiyuu")
    character = models.Character(name_en="Voiced Character")
    db_session.add_all([seiyuu, character])
    db_session.flush()
    casting_service.replace_casting(
        db_session,
        "anime",
        sample_anime.system_id,
        [{"character_id": character.system_id, "voices": [{"person_id": seiyuu.system_id}]}],
    )
    _label(db_session, seiyuu, "nsfw", "erotica")
    return seiyuu, character


def test_the_cast_and_the_character_page_leave_out_a_labelled_seiyuu(
    mode_client, sample_anime, labelled_seiyuu
):
    seiyuu, character = labelled_seiyuu
    cast_url = f"/api/casting/anime/{sample_anime.system_id}"
    entries_url = f"/api/character/{character.system_id}/entries"

    narrow = mode_client("normal")
    cast = narrow.get(cast_url).json()["cast"]
    assert [row["character_id"] for row in cast] == [str(character.system_id)]
    assert cast[0]["voices"] == []
    [group] = narrow.get(entries_url).json()["groups"]
    assert group["entries"][0]["seiyuu"] == []

    wide = mode_client("borderline")
    assert [v["person_id"] for v in wide.get(cast_url).json()["cast"][0]["voices"]] == [
        str(seiyuu.system_id)
    ]
    [group] = wide.get(entries_url).json()["groups"]
    assert [s["system_id"] for s in group["entries"][0]["seiyuu"]] == [str(seiyuu.system_id)]


def test_saving_the_cast_keeps_a_labelled_voice_the_editor_was_not_shown(
    mode_client, db_session, sample_anime, labelled_seiyuu
):
    seiyuu, _character = labelled_seiyuu
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


def test_credit_usage_leaves_out_a_labelled_person(mode_client, labelled_director):
    def people(client):
        usage = client.get("/api/credits/usage").json()
        return usage.get("anime", {}).get("person", {}).get("director", {})

    assert str(labelled_director.system_id) not in people(mode_client("normal"))
    assert str(labelled_director.system_id) in people(mode_client("borderline"))


# ---------------------------------------------------------------------------
# Assignment
# ---------------------------------------------------------------------------


def test_the_owner_sets_a_persons_labels_and_nsfw_comes_with_them(
    owner_client, credited_director
):
    url = f"/api/content-labels/person/{credited_director.system_id}"

    response = owner_client.put(url, json={"label_keys": ["erotica"]})
    assert response.status_code == 200, response.text
    assert response.json() == ["erotica", "nsfw"]
    assert owner_client.get(url).json() == ["erotica", "nsfw"]

    detail = owner_client.get(f"/api/person/{credited_director.system_id}").json()
    assert sorted(row["key"] for row in detail["content_labels"]) == ["erotica", "nsfw"]

    assert owner_client.put(url, json={"label_keys": []}).json() == []
    assert owner_client.get(f"/api/person/{credited_director.system_id}").json()[
        "content_labels"
    ] == []


def test_an_unknown_label_is_refused_before_anything_is_cleared(
    owner_client, labelled_director
):
    url = f"/api/content-labels/person/{labelled_director.system_id}"
    assert owner_client.put(url, json={"label_keys": ["gore"]}).status_code == 422
    assert owner_client.get(url).json() == ["erotica", "nsfw"]


def test_a_person_create_or_update_does_not_take_labels(owner_client, credited_director):
    """The only writer is the assignment route, as for a franchise: the person
    write schemas ignore the key rather than storing it."""
    response = owner_client.put(
        f"/api/person/{credited_director.system_id}",
        json={"name_en": "Labelled Director", "content_labels": [{"key": "nsfw"}]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["content_labels"] == []


def test_a_plain_user_may_not_assign_a_persons_labels(
    user_client, credited_director, nsfw_label
):
    """manage.catalog is a real gate; the vocabulary is not empty."""
    response = user_client.put(
        f"/api/content-labels/person/{credited_director.system_id}",
        json={"label_keys": ["nsfw"]},
    )
    assert response.status_code == 401


def test_a_narrow_editor_cannot_relabel_a_person_it_cannot_see(
    catalog_writer, owner_client, labelled_director
):
    """The write binds to the read: one empty PUT would otherwise clear the
    label hiding the person from the editor making it."""
    narrow = catalog_writer(username="narrowpersonwriter", label_keys=())
    url = f"/api/content-labels/person/{labelled_director.system_id}"

    assert narrow.get(url).status_code == 404
    assert narrow.put(url, json={"label_keys": []}).status_code == 404
    # The mirror, from a mode carrying the labels.
    assert owner_client.put(url, json={"label_keys": []}).status_code == 200


def test_the_label_reference_counts_people(owner_client, labelled_director):
    rows = {row["key"]: row for row in owner_client.get("/api/content-labels/").json()}
    assert rows["erotica"]["person_count"] == 1
    assert rows["nsfw"]["person_count"] == 1
    assert rows["ecchi"]["person_count"] == 0


def test_merging_two_people_keeps_both_label_sets(owner_client, db_session):
    keep = owner_client.post("/api/person/", json={"name_en": "Keep Person"}).json()
    drop = owner_client.post("/api/person/", json={"name_en": "Drop Person"}).json()
    owner_client.put(
        f"/api/content-labels/person/{keep['system_id']}", json={"label_keys": ["ecchi"]}
    )
    owner_client.put(
        f"/api/content-labels/person/{drop['system_id']}", json={"label_keys": ["erotica"]}
    )

    response = owner_client.post(
        f"/api/person/{keep['system_id']}/merge", json={"source_id": drop["system_id"]}
    )
    assert response.status_code == 200, response.text

    assert owner_client.get(f"/api/content-labels/person/{keep['system_id']}").json() == [
        "ecchi",
        "erotica",
        "nsfw",
    ]


# ---------------------------------------------------------------------------
# The Google Sheets round trip
# ---------------------------------------------------------------------------

LABEL_HEADERS = [
    "system_id",
    "key",
    "label",
    "description",
    "sort_order",
    "created_at",
    "updated_at",
]
PERSON_HEADERS = ["system_id", "name_en", "name_cn", "name_jp", "name_alt"]
PERSON_LABEL_HEADERS = ["system_id", "person_id", "label_id", "position", "created_at"]


def test_the_person_label_tab_restores_after_its_label_and_its_person():
    assert TAB_NAMES.index("Content Label") < TAB_NAMES.index("Person Content Label")
    assert TAB_NAMES.index("Person") < TAB_NAMES.index("Person Content Label")


def test_a_person_labelling_translates_the_foreign_person_and_label_uuids(
    db_session, monkeypatch
):
    """
    Both ids the row cites are minted per database. Stored untranslated,
    either is a dangling FK, the violation rolls the whole tab back, and every
    labelled person comes back visible.
    """
    local_label = ensure_label(db_session, "nsfw")
    person = models.Person(name_en="Sheet Person")
    db_session.add(person)
    db_session.flush()

    foreign_label = str(uuid.uuid4())
    foreign_person = str(uuid.uuid4())
    tabs = {
        "Content Label": [
            LABEL_HEADERS,
            [foreign_label, "nsfw", "NSFW", "", "0", "", ""],
        ],
        "Person": [PERSON_HEADERS, [foreign_person, "Sheet Person", "", "", ""]],
        "Person Content Label": [
            PERSON_LABEL_HEADERS,
            [str(uuid.uuid4()), foreign_person, foreign_label, "0", ""],
        ],
    }
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    result = pull.execute_pull_specific(
        db_session, "Person Content Label", log_action=False, may_restore_authz=True
    )

    assert result["status"] == "success", result
    rows = db_session.query(models.PersonContentLabel).all()
    assert [(r.person_id, r.label_id) for r in rows] == [
        (person.system_id, local_label.system_id)
    ]


def test_the_person_label_tab_needs_admin_authz(db_session, monkeypatch):
    """A caller without admin.authz skips the tab, as every label tab."""
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [PERSON_LABEL_HEADERS])

    result = pull.execute_pull_specific(
        db_session, "Person Content Label", log_action=False, may_restore_authz=False
    )

    assert result["status"] == "skipped"
