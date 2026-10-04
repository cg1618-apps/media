"""
A character's appearance and trait tags.

Two vocabulary-backed lists on every character, drawn from the system_option
categories "Character Appearance" and "Character Trait" (CHARACTER_TAG_FIELDS
in app/utils/credit_roles.py) and stored in `character_tag`. One vocabulary
each, for every character: no gated distinction and no scopes.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models
from app.services.domain.character_tags import (
    character_tag_values,
    replace_character_tags,
)
from app.services.pipelines import backup, pull
from app.utils.credit_roles import (
    CHARACTER_TAG_FIELDS,
    OPTION_CATEGORIES,
    TAG_FIELDS,
)

# ---------------------------------------------------------------------------
# The vocabulary
# ---------------------------------------------------------------------------


def test_the_two_categories_are_served_and_kept_out_of_the_entry_tag_fields():
    assert CHARACTER_TAG_FIELDS["appearance"].category == "Character Appearance"
    assert CHARACTER_TAG_FIELDS["trait"].category == "Character Trait"
    assert "Character Appearance" in OPTION_CATEGORIES
    assert "Character Trait" in OPTION_CATEGORIES
    # TAG_FIELDS is keyed by entry media types and feeds the gated-category
    # derivation, the scope extraction and the entry sheet columns.
    entry_categories = {f.category for f in TAG_FIELDS.values()}
    assert "Character Appearance" not in entry_categories
    assert "Character Trait" not in entry_categories


def test_the_constants_endpoint_offers_both_categories(client):
    body = client.get("/api/constants").json()
    assert "Character Appearance" in body["option_categories"]
    assert "Character Trait" in body["option_categories"]


# ---------------------------------------------------------------------------
# The API
# ---------------------------------------------------------------------------


def _option(db_session, category, value):
    option = models.SystemOption(category=category, value=value)
    db_session.add(option)
    db_session.flush()
    return option


def test_create_with_tags_returns_them_in_order(admin_client):
    r = admin_client.post(
        "/api/character/",
        json={
            "name_en": "Ichika",
            "appearance": ["Twin Tails", "Red Eyes"],
            "trait": ["Tsundere"],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["appearance"] == ["Twin Tails", "Red Eyes"]
    assert body["trait"] == ["Tsundere"]


def test_a_character_without_tags_answers_empty_lists(admin_client):
    body = admin_client.post("/api/character/", json={"name_en": "Ichika"}).json()
    assert body["appearance"] == []
    assert body["trait"] == []


def test_an_existing_value_is_reused_not_duplicated(admin_client, db_session):
    existing = _option(db_session, "Character Appearance", "Twin Tails")
    db_session.commit()

    body = admin_client.post(
        "/api/character/",
        json={"name_en": "Ichika", "appearance": ["  twin tails "]},
    ).json()

    # Matched on the normalised key, so the stored spelling wins.
    assert body["appearance"] == ["Twin Tails"]
    rows = (
        db_session.query(models.SystemOption)
        .filter_by(category="Character Appearance")
        .all()
    )
    assert [o.system_id for o in rows] == [existing.system_id]


def test_an_unknown_value_creates_the_option(admin_client, db_session):
    admin_client.post(
        "/api/character/", json={"name_en": "Ichika", "trait": ["Kuudere"]}
    )
    assert (
        db_session.query(models.SystemOption)
        .filter_by(category="Character Trait", value="Kuudere")
        .count()
        == 1
    )


def test_values_are_stripped_blanks_dropped_and_duplicates_folded(admin_client):
    body = admin_client.post(
        "/api/character/",
        json={
            "name_en": "Ichika",
            "trait": [" Tsundere ", "", "   ", "tsundere", "Kind", "KIND"],
        },
    ).json()
    assert body["trait"] == ["Tsundere", "Kind"]


def test_put_replaces_a_list_and_leaves_an_absent_one_alone(admin_client):
    created = admin_client.post(
        "/api/character/",
        json={"name_en": "Ichika", "appearance": ["Twin Tails"], "trait": ["Kind"]},
    ).json()

    r = admin_client.put(
        f"/api/character/{created['system_id']}",
        json={"name_en": "Ichika", "appearance": ["Red Eyes", "Twin Tails"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["appearance"] == ["Red Eyes", "Twin Tails"]
    assert r.json()["trait"] == ["Kind"]


def test_put_with_an_empty_list_clears_it(admin_client):
    created = admin_client.post(
        "/api/character/", json={"name_en": "Ichika", "trait": ["Kind"]}
    ).json()
    r = admin_client.put(
        f"/api/character/{created['system_id']}",
        json={"name_en": "Ichika", "trait": []},
    )
    assert r.json()["trait"] == []


def test_patch_writes_tags_and_leaves_the_other_list_alone(admin_client):
    """
    PATCH ignores keys that are not columns (_patching.apply_column_patch),
    and neither tag list is a column - so without handling of its own a
    patched list would be dropped silently and answered with a 200.
    """
    created = admin_client.post(
        "/api/character/",
        json={"name_en": "Ichika", "appearance": ["Twin Tails"], "trait": ["Kind"]},
    ).json()

    r = admin_client.patch(
        f"/api/character/{created['system_id']}", json={"trait": ["Shy", "Kind"]}
    )
    assert r.status_code == 200, r.text
    assert r.json()["trait"] == ["Shy", "Kind"]
    assert r.json()["appearance"] == ["Twin Tails"]

    detail = admin_client.get(f"/api/character/{created['system_id']}").json()
    assert detail["trait"] == ["Shy", "Kind"]


def test_patch_refuses_a_tag_list_that_is_not_a_list(admin_client):
    created = admin_client.post("/api/character/", json={"name_en": "Ichika"}).json()
    r = admin_client.patch(
        f"/api/character/{created['system_id']}", json={"trait": "Kind"}
    )
    assert r.status_code == 422


def test_the_list_returns_every_characters_tags(admin_client):
    admin_client.post(
        "/api/character/", json={"name_en": "Aoi", "appearance": ["Ponytail"]}
    )
    admin_client.post(
        "/api/character/", json={"name_en": "Beni", "trait": ["Kind", "Loud"]}
    )

    rows = {c["name_en"]: c for c in admin_client.get("/api/character/").json()}
    assert rows["Aoi"]["appearance"] == ["Ponytail"]
    assert rows["Aoi"]["trait"] == []
    assert rows["Beni"]["trait"] == ["Kind", "Loud"]


def test_the_list_reads_tags_in_a_fixed_number_of_queries(
    admin_client, db_session
):
    """Batched: one more character must not cost one more query."""
    from sqlalchemy import event

    def count_queries():
        statements = []

        def record(*_args):
            statements.append(1)

        engine = db_session.get_bind()
        event.listen(engine, "before_cursor_execute", record)
        try:
            admin_client.get("/api/character/")
        finally:
            event.remove(engine, "before_cursor_execute", record)
        return len(statements)

    for name in ("Aoi", "Beni"):
        admin_client.post(
            "/api/character/", json={"name_en": name, "trait": ["Kind"]}
        )
    two = count_queries()
    for name in ("Chiyo", "Daiki", "Eri"):
        admin_client.post(
            "/api/character/", json={"name_en": name, "trait": ["Loud"]}
        )
    five = count_queries()
    assert five == two


def test_deleting_a_character_cascades_its_tags(admin_client, db_session):
    created = admin_client.post(
        "/api/character/", json={"name_en": "Ichika", "trait": ["Kind"]}
    ).json()
    assert db_session.query(models.CharacterTag).count() == 1

    r = admin_client.delete(f"/api/character/{created['system_id']}?castings=0")
    assert r.status_code == 200
    assert db_session.query(models.CharacterTag).count() == 0
    # The vocabulary value outlives the character.
    assert (
        db_session.query(models.SystemOption)
        .filter_by(category="Character Trait", value="Kind")
        .count()
        == 1
    )


def test_deleting_an_option_cascades_the_character_tags(admin_client, db_session):
    created = admin_client.post(
        "/api/character/", json={"name_en": "Ichika", "trait": ["Kind", "Shy"]}
    ).json()
    kind = (
        db_session.query(models.SystemOption)
        .filter_by(category="Character Trait", value="Kind")
        .one()
    )

    assert admin_client.delete(f"/api/options/{kind.system_id}").status_code == 200
    detail = admin_client.get(f"/api/character/{created['system_id']}").json()
    assert detail["trait"] == ["Shy"]


def test_merge_keeps_the_union_of_both_characters_tags(admin_client):
    keep = admin_client.post(
        "/api/character/",
        json={"name_en": "Ichika", "appearance": ["Twin Tails"], "trait": ["Kind"]},
    ).json()
    drop = admin_client.post(
        "/api/character/",
        json={
            "name_en": "Ichika (dup)",
            "appearance": ["Red Eyes", "Twin Tails"],
            "trait": [],
        },
    ).json()

    r = admin_client.post(
        f"/api/character/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )
    assert r.status_code == 200, r.text

    merged = admin_client.get(f"/api/character/{keep['system_id']}").json()
    assert merged["appearance"] == ["Twin Tails", "Red Eyes"]
    assert merged["trait"] == ["Kind"]


def test_a_value_only_characters_use_stays_visible_to_a_guest(
    admin_client, client
):
    """
    character_tag is not a connection in shared_visibility.py: a value used
    only by characters has no connection at all, and a record with none
    stays visible.
    """
    admin_client.post(
        "/api/character/", json={"name_en": "Ichika", "trait": ["Kind"]}
    )
    values = [
        o["value"]
        for o in client.get("/api/options/Character Trait").json()
    ]
    assert "Kind" in values


# ---------------------------------------------------------------------------
# The service
# ---------------------------------------------------------------------------


def test_replace_then_read_round_trips(db_session, character):
    replace_character_tags(db_session, character.system_id, "trait", ["Kind", "Shy"])
    assert character_tag_values(db_session, [character.system_id]) == {
        character.system_id: {"appearance": [], "trait": ["Kind", "Shy"]}
    }


# ---------------------------------------------------------------------------
# Sheets
# ---------------------------------------------------------------------------


def test_backup_writes_both_lists_on_the_character_tab(
    db_session, character, monkeypatch
):
    replace_character_tags(
        db_session, character.system_id, "appearance", ["Twin Tails", "Red Eyes"]
    )
    db_session.commit()

    written = {}
    monkeypatch.setattr(
        backup,
        "bulk_overwrite_sheet",
        lambda tab, matrix: written.__setitem__(tab, matrix),
    )
    backup.execute_backup(db_session)

    headers, *rows = written["Character"]
    plain = [c.name for c in models.Character.__table__.columns]
    assert headers == plain + ["appearance", "trait"]
    row = next(
        dict(zip(headers, r)) for r in rows if r[0] == str(character.system_id)
    )
    assert row["appearance"] == "Twin Tails, Red Eyes"
    assert row["trait"] == ""


def test_pull_restores_the_lists_and_creates_missing_values(
    db_session, monkeypatch
):
    sid = str(uuid.uuid4())
    headers = ["system_id", "name_en", "appearance", "trait"]
    rows = [[sid, "Ichika", "Twin Tails, Red Eyes", "Kind"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Character", log_action=False)

    assert result["status"] == "success", result
    # Expected headers, not stale ones.
    assert not any(
        "appearance" in ref or "trait" in ref
        for ref in result.get("unresolved_refs", [])
    )
    fresh = db_session.query(models.Character).filter_by(name_en="Ichika").one()
    assert character_tag_values(db_session, [fresh.system_id])[fresh.system_id] == {
        "appearance": ["Twin Tails", "Red Eyes"],
        "trait": ["Kind"],
    }


def test_pull_with_an_empty_cell_clears_and_without_the_column_leaves_alone(
    db_session, character, monkeypatch
):
    replace_character_tags(db_session, character.system_id, "appearance", ["Ponytail"])
    replace_character_tags(db_session, character.system_id, "trait", ["Kind"])
    db_session.commit()

    # A sheet written before the columns existed carries no `trait` header:
    # that list is left as it is. `appearance` is present and empty: a clear.
    headers = ["system_id", "name_en", "appearance"]
    rows = [[str(character.system_id), "Ichika", ""]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Character", log_action=False)

    assert result["status"] == "success", result
    assert character_tag_values(db_session, [character.system_id])[
        character.system_id
    ] == {"appearance": [], "trait": ["Kind"]}
