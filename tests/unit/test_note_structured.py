"""Unit tests for the `structured` note shape and its field spec."""

import pytest

from app.schemas.note import NoteCreate, section_out, validate_note_payload
from app.utils.note_sections import (
    FIELD_LINKS,
    FIELD_LIST,
    NOTE_SECTIONS,
    SHAPE_STRUCTURED,
    STORED_SHAPES,
    NoteField,
    NoteSection,
    column_field_map,
    field_by_key,
    json_fields,
    section_by_key,
)

OWNER = "00000000-0000-0000-0000-000000000001"


def _payload(section: str = "controls", **kwargs) -> NoteCreate:
    return NoteCreate(owner_type="game", owner_id=OWNER, section=section, **kwargs)


def _structured() -> list[NoteSection]:
    return [s for s in NOTE_SECTIONS if s.shape == SHAPE_STRUCTURED]


# --- The registry contract ------------------------------------------------


def test_structured_is_a_stored_shape():
    assert SHAPE_STRUCTURED in STORED_SHAPES


def test_a_spec_and_the_shape_imply_each_other():
    # Both directions. A structured section with no fields would render an
    # empty form and accept nothing; a spec on any other shape would be
    # declared, served to the page and silently ignored, which is worse than
    # absent because it reads as working.
    for section in NOTE_SECTIONS:
        if section.shape == SHAPE_STRUCTURED:
            assert section.fields, f"{section.key} is structured but declares no fields"
        else:
            assert not section.fields, f"{section.key} declares fields but is not structured"


def test_every_field_key_is_unique_within_its_section():
    for section in _structured():
        keys = [f.key for f in section.fields]
        assert len(keys) == len(set(keys)), section.key


def test_no_two_fields_claim_the_same_column():
    # Two fields on one column would overwrite each other on save, and the
    # loser would be invisible rather than refused.
    for section in _structured():
        claimed = [f.column for f in section.fields if f.column]
        assert len(claimed) == len(set(claimed)), section.key


def test_every_claimed_column_is_a_real_note_column():
    from app import models

    columns = {c.name for c in models.Note.__table__.columns}
    for section in _structured():
        for field in section.fields:
            if field.column:
                assert field.column in columns, f"{section.key}.{field.key}"


def test_only_list_fields_declare_item_fields():
    for section in _structured():
        for field in section.fields:
            if field.type == FIELD_LIST:
                assert field.item_fields, f"{section.key}.{field.key}"
            else:
                assert not field.item_fields, f"{section.key}.{field.key}"


def test_nested_list_fields_are_never_column_backed():
    # No column can hold a list of rows, so a list field that named one would
    # be a registry entry the storage layer cannot honour.
    for section in _structured():
        for field in section.fields:
            if field.type == FIELD_LIST:
                assert field.column is None, f"{section.key}.{field.key}"


def test_require_any_names_declared_fields():
    for section in _structured():
        keys = {f.key for f in section.fields}
        for group in section.require_any:
            assert set(group) <= keys, section.key


def test_only_structured_sections_nest():
    for section in NOTE_SECTIONS:
        if section.hierarchical:
            assert section.shape == SHAPE_STRUCTURED, section.key


def test_field_helpers_split_columns_from_the_blob():
    controls = section_by_key("controls")
    assert set(column_field_map(controls)) == {"title", "content", "links"}
    # controls maps every field onto a column, so it stores no blob at all.
    assert json_fields(controls) == ()
    assert field_by_key(controls, "control").column == "title"
    assert field_by_key(controls, "nope") is None


# --- controls, the first structured section -------------------------------


def test_controls_is_structured_with_an_optional_control():
    section = section_by_key("controls")
    assert section.shape == SHAPE_STRUCTURED
    assert [f.key for f in section.fields] == ["control", "description", "links"]
    assert not any(f.required for f in section.fields)
    assert field_by_key(section, "links").type == FIELD_LINKS


def test_sections_endpoint_serialises_the_spec():
    out = section_out(section_by_key("controls"), "game")
    assert out.shape == SHAPE_STRUCTURED
    assert [(f.key, f.column, f.type) for f in out.fields] == [
        ("control", "title", "text"),
        ("description", "content", "textarea"),
        ("links", "links", "links"),
    ]
    assert out.require_any == []
    assert out.hierarchical is False


def test_a_non_structured_section_serialises_no_spec():
    out = section_out(section_by_key("beginner"), "game")
    assert out.fields == []


# --- Validation -----------------------------------------------------------


def test_a_filled_field_is_enough():
    validate_note_payload(_payload(title="L2 + O"))
    validate_note_payload(_payload(content="Parry on the upswing."))
    validate_note_payload(_payload(links=["https://example.com"]))


def test_an_entirely_empty_row_is_refused():
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(_payload())


def test_a_column_no_field_claims_is_refused():
    # Without this the value would be stored and then be unreachable: no
    # editor on the page can show a column the spec does not name.
    with pytest.raises(ValueError, match="takes no 'locator'"):
        validate_note_payload(_payload(title="L2", locator="Ch 3"))
    with pytest.raises(ValueError, match="takes no 'entries'"):
        validate_note_payload(
            _payload(title="L2", entries=[{"type": "text", "value": "x"}])
        )


def test_an_undeclared_blob_key_is_refused():
    with pytest.raises(ValueError, match="has no field 'region'"):
        validate_note_payload(_payload(title="L2", fields={"region": "Limgrave"}))


def test_a_flat_section_refuses_a_parent():
    with pytest.raises(ValueError, match="do not nest"):
        validate_note_payload(_payload(title="L2", parent_id=OWNER))


def test_a_non_structured_section_refuses_structured_fields():
    with pytest.raises(ValueError, match="takes no structured fields"):
        validate_note_payload(
            NoteCreate(
                owner_type="game",
                owner_id=OWNER,
                section="beginner",
                content="hi",
                fields={"anything": "x"},
            )
        )


# --- Validation of shapes no section uses yet -----------------------------
#
# The spec machinery is general, and the sections that exercise every branch
# of it land in the guide reshape. These build a spec directly so the rules
# are covered now rather than when the first section happens to need them.


def _spec_section(**kwargs) -> NoteSection:
    return NoteSection(
        key="controls",  # a real key, so section lookups resolve
        shape=SHAPE_STRUCTURED,
        label="test",
        owners=("game",),
        scope="catalog",
        **kwargs,
    )


def _validate_against(section: NoteSection, **payload):
    from app.schemas.note import _validate_structured

    _validate_structured(section, _payload(**payload))


def test_a_select_refuses_a_value_outside_its_options():
    section = _spec_section(
        fields=(
            NoteField(
                key="beaten",
                label="Status",
                type="select",
                column="status",
                options=("to beat", "beaten"),
            ),
        )
    )
    _validate_against(section, status="beaten")
    with pytest.raises(ValueError, match="not a valid status"):
        _validate_against(section, status="cheesed")


def test_a_select_with_no_options_is_free_text():
    # The guide sections' type, group and tier are open vocabularies stored in
    # the same columns a closed dropdown would use.
    section = _spec_section(
        fields=(NoteField(key="tier", label="Tier", type="select", column="kind"),)
    )
    _validate_against(section, kind="anything at all")


def test_a_required_field_must_be_filled():
    section = _spec_section(
        fields=(
            NoteField(key="name", label="Name", column="title", required=True),
            NoteField(key="note", label="Note", type="textarea", column="content"),
        )
    )
    _validate_against(section, title="Malenia")
    with pytest.raises(ValueError, match="Name is required"):
        _validate_against(section, content="only a body")


def test_require_any_bites_when_every_named_field_is_blank():
    # The Story List rule: an entry needs an order number or a name, and may
    # carry both. A fixture with neither is what makes this test bite.
    section = _spec_section(
        fields=(
            NoteField(key="order", label="Order", column="locator"),
            NoteField(key="name", label="Name", column="title"),
            NoteField(key="note", label="Note", type="textarea", column="content"),
        ),
        require_any=(("order", "name"),),
    )
    _validate_against(section, locator="1")
    _validate_against(section, title="The Lake")
    _validate_against(section, locator="1", title="The Lake")
    with pytest.raises(ValueError, match="at least one of: Order, Name"):
        _validate_against(section, content="a body and nothing to call it")


def test_a_nested_list_is_checked_row_by_row():
    section = _spec_section(
        fields=(
            NoteField(
                key="stats",
                label="Stats",
                type=FIELD_LIST,
                item_fields=(
                    NoteField(key="name", label="Name"),
                    NoteField(key="min", label="Min"),
                ),
            ),
        )
    )
    _validate_against(section, fields={"stats": [{"name": "VIG", "min": "40"}]})

    with pytest.raises(ValueError, match="row 1 has no field 'zzz'"):
        _validate_against(section, fields={"stats": [{"zzz": "1"}]})
    with pytest.raises(ValueError, match="row 1 is empty"):
        _validate_against(section, fields={"stats": [{"name": "", "min": ""}]})
    with pytest.raises(ValueError, match="must be a list"):
        _validate_against(section, fields={"stats": "VIG 40"})


def test_a_links_field_must_hold_strings():
    # Only a BLOB-backed links field needs this check: a column-backed one is
    # typed List[str] on NoteBase, so Pydantic refuses a bad value before the
    # spec is consulted. `fields` is an untyped dict, so the spec is the only
    # thing standing between a malformed payload and the column.
    section = _spec_section(
        fields=(NoteField(key="sources", label="Sources", type=FIELD_LINKS),)
    )
    _validate_against(section, fields={"sources": ["https://example.com"]})
    with pytest.raises(ValueError, match="must be a list of URLs"):
        _validate_against(section, fields={"sources": [{"url": "https://x.com"}]})
    with pytest.raises(ValueError, match="must be a list of URLs"):
        _validate_against(section, fields={"sources": "https://example.com"})
