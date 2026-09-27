"""
Character and person gender / my_rating: what a write accepts, and what a
Sheets Pull restores.

The two strictnesses are deliberate (app/utils/entity_vocab.py): a write
refuses anything outside the vocabulary, a Pull folds what it can and drops
the rest, because a backup taken before the vocabulary existed still carries
free text.
"""

import uuid

import pytest
from pydantic import ValidationError

from app import schemas
from app.utils import formatter as f
from app.utils.entity_vocab import (
    check_gender,
    check_my_rating,
    normalize_gender,
    normalize_my_rating,
)

WRITE_SCHEMAS = [
    schemas.CharacterCreate,
    schemas.CharacterUpdate,
    schemas.PersonCreate,
    schemas.PersonUpdate,
]


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("schema", WRITE_SCHEMAS)
@pytest.mark.parametrize("gender", ["男", "女", "中性/無性", "雙性混和", "其他"])
def test_every_gender_is_accepted(schema, gender):
    assert schema(name_en="A", gender=gender).gender == gender


@pytest.mark.parametrize("schema", WRITE_SCHEMAS)
@pytest.mark.parametrize("gender", ["Male", "female", "F", "男性"])
def test_a_gender_outside_the_vocabulary_is_refused(schema, gender):
    with pytest.raises(ValidationError):
        schema(name_en="A", gender=gender)


@pytest.mark.parametrize("schema", WRITE_SCHEMAS)
@pytest.mark.parametrize("rating", ["S", "A+", "F"])
def test_a_rating_in_the_vocabulary_is_accepted(schema, rating):
    assert schema(name_en="A", my_rating=rating).my_rating == rating


@pytest.mark.parametrize("schema", WRITE_SCHEMAS)
@pytest.mark.parametrize("rating", ["a+", "A++", "10", "Great"])
def test_a_rating_outside_the_vocabulary_is_refused(schema, rating):
    with pytest.raises(ValidationError):
        schema(name_en="A", my_rating=rating)


@pytest.mark.parametrize("schema", WRITE_SCHEMAS)
def test_an_empty_string_is_null_for_both(schema):
    body = schema(name_en="A", gender="", my_rating="  ")
    assert body.gender is None
    assert body.my_rating is None


def test_the_response_schemas_do_not_refuse_what_is_stored():
    """A response reports the row; refusing it would 500 the read."""
    row = {
        "system_id": uuid.uuid4(),
        "public_id": 1,
        "name_en": "A",
        "gender": "legacy",
        "my_rating": "legacy",
    }
    assert schemas.CharacterResponse(**row).gender == "legacy"
    assert schemas.PersonResponse(**row).my_rating == "legacy"


def test_check_helpers_raise_value_error():
    with pytest.raises(ValueError):
        check_gender("Male")
    with pytest.raises(ValueError):
        check_my_rating("a")
    assert check_gender(None) is None
    assert check_my_rating(None) is None


# ---------------------------------------------------------------------------
# Pull
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Male", "男"),
        (" male ", "男"),
        ("FEMALE", "女"),
        ("女", "女"),
        (" 雙性混和 ", "雙性混和"),
        ("F", None),
        ("unknown", None),
        ("", None),
        (None, None),
    ],
)
def test_normalize_gender(raw, expected):
    assert normalize_gender(raw) == expected


@pytest.mark.parametrize(
    "raw, expected",
    [("a+", "A+"), (" s ", "S"), ("F", "F"), ("A++", None), ("", None), (None, None)],
)
def test_normalize_my_rating(raw, expected):
    assert normalize_my_rating(raw) == expected


def _sheet_row(**cells):
    row = {
        "system_id": str(uuid.uuid4()),
        "name_en": "Ichika",
        "gender": "",
        "my_rating": "",
        "photo_file": "",
        "remark": "",
        "created_at": "",
        "updated_at": "",
    }
    row.update(cells)
    return row


@pytest.mark.parametrize(
    "parse", [f.parse_character_from_sheet, f.parse_person_from_sheet]
)
def test_a_pull_folds_old_free_text_onto_the_vocabularies(parse):
    parsed = parse(_sheet_row(gender="Female", my_rating="a+"))
    assert parsed["gender"] == "女"
    assert parsed["my_rating"] == "A+"


@pytest.mark.parametrize(
    "parse", [f.parse_character_from_sheet, f.parse_person_from_sheet]
)
def test_a_pull_drops_what_it_cannot_fold(parse):
    parsed = parse(_sheet_row(gender="F", my_rating="Great"))
    assert parsed["gender"] is None
    assert parsed["my_rating"] is None


@pytest.mark.parametrize(
    "parse", [f.parse_character_from_sheet, f.parse_person_from_sheet]
)
def test_a_pull_restores_the_photo_fallback(parse):
    entry_id = uuid.uuid4()
    assert parse(_sheet_row(photo_fallback_entry_id=str(entry_id)))[
        "photo_fallback_entry_id"
    ] == entry_id
    # An empty or garbled cell restores as NULL, not as a bad UUID.
    assert parse(_sheet_row(photo_fallback_entry_id=""))["photo_fallback_entry_id"] is None
    assert parse(_sheet_row(photo_fallback_entry_id="x"))["photo_fallback_entry_id"] is None


# ---------------------------------------------------------------------------
# character.role
# ---------------------------------------------------------------------------


def test_character_roles_are_in_dropdown_order():
    from app.utils.character_roles import CHARACTER_ROLES

    assert CHARACTER_ROLES == ("Main", "Core", "Supporting", "Other")


@pytest.mark.parametrize("schema", [schemas.CharacterCreate, schemas.CharacterUpdate])
@pytest.mark.parametrize("role", ["Main", "Core", "Supporting", "Other"])
def test_every_character_role_is_accepted(schema, role):
    assert schema(name_en="A", role=role).role == role


@pytest.mark.parametrize("schema", [schemas.CharacterCreate, schemas.CharacterUpdate])
@pytest.mark.parametrize("role", ["main", "Protagonist", "Nonsense"])
def test_a_character_role_outside_the_vocabulary_is_refused(schema, role):
    with pytest.raises(ValidationError):
        schema(name_en="A", role=role)


@pytest.mark.parametrize("schema", [schemas.CharacterCreate, schemas.CharacterUpdate])
@pytest.mark.parametrize("blank", ["", "   ", None])
def test_a_blank_character_role_is_null(schema, blank):
    assert schema(name_en="A", role=blank).role is None


@pytest.mark.parametrize(
    "cell, expected", [("Core", "Core"), (" Other ", "Other"), ("", None), ("Hero", None)]
)
def test_a_pull_restores_the_character_role(cell, expected):
    assert f.parse_character_from_sheet(_sheet_row(role=cell))["role"] == expected


def test_the_person_parser_has_no_role_column():
    """person holds roles in person_role; a `role` cell is not a person column."""
    assert "role" not in f.parse_person_from_sheet(_sheet_row(role="Core"))
