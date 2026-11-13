"""
Personal fields on catalogue note rows: the registry half of note marks.

The row - the item, the enemy, the ending, the song, the mod - is catalogue;
these values on it are each viewer's own, kept in `note_mark`. The registry
says which, where the value sits in a row (a column or `fields[key]`), what an
unmarked viewer reads, which feature gates it, and what the NG reset clears.
"""

import pytest

from app.schemas.note import NoteBase, section_out, validate_note_payload
from app.services.rbac.features import FEATURE_NAMES
from app.utils import note_sections as ns

COLLECTED_SECTIONS = ("weapons_and_gear", "items", "collectibles")
MUSIC_SECTIONS = ("music_status", "op", "ed", "insert_songs", "ost")


def _personal(section_key):
    return {v.key: v for v in ns.personal_values(ns.section_by_key(section_key))}


def test_the_personal_values_per_section():
    expected = {
        **{k: {"collected", "amount_collected"} for k in COLLECTED_SECTIONS},
        "enemies": {"beaten"},
        "endings": {"completion"},
        "stats_and_points": {"my_value"},
        "mods_and_tools": {"status"},
        **{k: {"status"} for k in MUSIC_SECTIONS},
    }
    found = {
        s.key: set(_personal(s.key)) for s in ns.NOTE_SECTIONS if ns.personal_values(s)
    }
    assert found == expected


def test_op_ed_changes_does_not_split():
    section = ns.section_by_key("op_ed_changes")
    assert ns.personal_values(section) == ()
    assert section.personal_status is False


def test_the_sections_themselves_stay_catalogue():
    for key in (*COLLECTED_SECTIONS, "enemies", "endings", "stats_and_points",
                "mods_and_tools", *MUSIC_SECTIONS):
        assert ns.section_by_key(key).scope == ns.SCOPE_CATALOG, key


def test_amount_collected_sits_right_after_amount_total_and_is_free_text():
    for key in COLLECTED_SECTIONS:
        keys = [f.key for f in ns.section_by_key(key).fields]
        assert keys[keys.index("amount_total") + 1] == "amount_collected", key
        field = ns.field_by_key(ns.section_by_key(key), "amount_collected")
        assert (field.label, field.type, field.column) == (
            "Collected amount", ns.FIELD_TEXT, None,
        )
        assert field.personal is True and field.granted is None
        # amount_total is catalogue: a fact about the game.
        assert ns.field_by_key(ns.section_by_key(key), "amount_total").personal is False


def test_where_each_value_lives_and_what_an_unmarked_viewer_reads():
    gear = _personal("items")
    assert (gear["collected"].column, gear["collected"].default) == ("status", "not collected")
    assert (gear["amount_collected"].column, gear["amount_collected"].default) == (None, None)
    assert (_personal("enemies")["beaten"].column, _personal("enemies")["beaten"].default) == (
        "status", "to beat",
    )
    assert _personal("endings")["completion"].default is None
    mine = _personal("stats_and_points")["my_value"]
    assert (mine.column, mine.default) == (None, None)
    # quick_edit stays: the inline stepper is still how it is edited.
    assert ns.field_by_key(ns.section_by_key("stats_and_points"), "my_value").quick_edit
    # The music statuses are the row's `status`, section-level.
    assert _personal("music_status")["status"].default == "Not Done"
    assert _personal("op")["status"].default is None
    assert _personal("op")["status"].options == ns.MUSIC_STATUSES


def test_which_values_are_granted_by_a_feature():
    granted = {
        (s.key, v.key): v.granted
        for s in ns.NOTE_SECTIONS
        for v in ns.personal_values(s)
        if v.granted
    }
    assert granted == {
        **{(k, "status"): "music_status" for k in MUSIC_SECTIONS},
        ("mods_and_tools", "status"): "mod_status",
    }
    assert set(granted.values()) <= set(FEATURE_NAMES)


def test_what_the_ng_reset_clears():
    cleared = {
        (s.key, v.key)
        for s in ns.NOTE_SECTIONS
        for v in ns.personal_values(s)
        if v.ng_resets
    }
    assert cleared == {
        *((k, "collected") for k in COLLECTED_SECTIONS),
        *((k, "amount_collected") for k in COLLECTED_SECTIONS),
        ("enemies", "beaten"),
    }


def test_a_granted_field_must_be_personal():
    with pytest.raises(ValueError, match="granted"):
        ns._check_personal(
            ns.NoteSection(
                key="x", shape=ns.SHAPE_STRUCTURED, label="x", owners=("game",),
                scope=ns.SCOPE_CATALOG,
                fields=(ns.NoteField(key="a", label="A", granted="mod_status"),),
            )
        )


def test_a_personal_field_cannot_be_required():
    with pytest.raises(ValueError, match="required"):
        ns._check_personal(
            ns.NoteSection(
                key="x", shape=ns.SHAPE_STRUCTURED, label="x", owners=("game",),
                scope=ns.SCOPE_CATALOG,
                fields=(ns.NoteField(key="a", label="A", personal=True, required=True),),
            )
        )


def test_a_personal_status_needs_a_status_vocabulary():
    with pytest.raises(ValueError, match="status"):
        ns._check_personal(
            ns.NoteSection(
                key="x", shape=ns.SHAPE_TEXT, label="x", owners=("game",),
                scope=ns.SCOPE_CATALOG, personal_status=True,
            )
        )


# --- The sections listing ---------------------------------------------------


def test_the_listing_marks_personal_fields_and_the_personal_status():
    items = section_out(ns.section_by_key("items"), "game", frozenset())
    by_key = {f.key: f for f in items.fields}
    assert by_key["collected"].personal is True and by_key["collected"].granted is None
    assert by_key["amount_collected"].personal is True
    assert by_key["name"].personal is False
    assert items.personal_status is False and items.status_granted is None

    op = section_out(ns.section_by_key("op"), "anime", frozenset({"music_status"}))
    assert op.personal_status is True and op.status_granted == "music_status"
    assert op.statuses == list(ns.MUSIC_STATUSES)
    assert op.type_status_section == "music_status"
    assert op.type_status_default == "Not Done"


def test_a_granted_value_is_absent_from_the_listing_without_its_feature():
    mods_with = section_out(ns.section_by_key("mods_and_tools"), "game", frozenset({"mod_status"}))
    mods_without = section_out(ns.section_by_key("mods_and_tools"), "game", frozenset())
    assert "status" in {f.key for f in mods_with.fields}
    assert "status" not in {f.key for f in mods_without.fields}
    assert "type" in {f.key for f in mods_without.fields}

    op = section_out(ns.section_by_key("op"), "anime", frozenset())
    assert op.statuses == [] and op.default_status is None
    assert op.type_status_section is None
    assert op.type_statuses == [] and op.type_status_default is None
    # The flags still describe the registry, so the page knows why.
    assert op.personal_status is True and op.status_granted == "music_status"
    status = section_out(ns.section_by_key("music_status"), "anime", frozenset())
    assert status.statuses == [] and status.default_status is None


# --- Catalogue writes carry no personal value -------------------------------


def _payload(**kw):
    base = dict(owner_type="game", content=None)
    base.update(kw)
    return NoteBase(**base)


def test_a_catalogue_payload_loses_its_personal_values():
    payload = _payload(
        section="items", title="Flask", status="collected",
        fields={"amount_total": "12", "amount_collected": "3"},
    )
    validate_note_payload(payload)
    assert payload.status is None
    assert payload.fields == {"amount_total": "12"}


def test_a_bad_option_on_a_personal_value_is_ignored_not_refused():
    """Ignored, because it is not stored; the mark endpoint validates it."""
    payload = _payload(section="enemies", title="Malenia", status="not a status")
    validate_note_payload(payload)
    assert payload.status is None


def test_a_row_carrying_only_personal_values_is_empty():
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(_payload(section="stats_and_points", fields={"my_value": "40"}))
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(_payload(section="endings", status="reached"))


def test_a_song_with_only_a_status_is_empty():
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(
            NoteBase(owner_type="anime", section="op", kind="normal", status="Need")
        )


def test_a_music_status_row_needs_only_its_list():
    payload = NoteBase(owner_type="anime", section="music_status", kind="op", status="Need")
    validate_note_payload(payload)
    assert payload.status is None
    validate_note_payload(NoteBase(owner_type="anime", section="music_status", kind="ed"))
