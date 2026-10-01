"""The shared ImageFocus field type (app/schemas/image_focus.py)."""

import pytest
from pydantic import BaseModel, ValidationError

from app import schemas
from app.schemas.image_focus import ImageFocus


class _Focused(BaseModel):
    focus: ImageFocus = None


@pytest.mark.parametrize("value", ["0% 0%", "100% 100%", "50% 20%", "7% 100%"])
def test_accepts_whole_percentages_from_0_to_100(value):
    assert _Focused(focus=value).focus == value


@pytest.mark.parametrize("value", ["", "   ", None])
def test_blank_or_missing_is_stored_as_null(value):
    assert _Focused(focus=value).focus is None


def test_defaults_to_null():
    assert _Focused().focus is None


@pytest.mark.parametrize(
    "value",
    [
        "101% 0%",
        "0% 101%",
        "50%",
        "left top",
        "50.5% 1%",
        "-1% 0%",
        "05% 5%",
        "50%  20%",
        "50% 20%\n",
        "50 20",
        50,
    ],
)
def test_refuses_anything_else(value):
    with pytest.raises(ValidationError):
        _Focused(focus=value)


@pytest.mark.parametrize(
    "schema, field",
    [
        (schemas.AnimeCreate, "cover_image_focus"),
        (schemas.GameUpdate, "cover_image_focus"),
        (schemas.PersonUpdate, "photo_focus"),
        (schemas.CharacterUpdate, "photo_focus"),
        (schemas.StudioUpdate, "logo_focus"),
        (schemas.PublisherUpdate, "logo_focus"),
    ],
)
def test_every_write_schema_validates_its_focus(schema, field):
    """The field is mounted with the shared type, not a bare Optional[str]."""
    names = {"name_en": "Named"}
    with pytest.raises(ValidationError):
        schema(**names, **{field: "left top"})
    assert getattr(schema(**names, **{field: ""}), field) is None
