"""
The field-group registry names real columns, real link fields and real
source buckets. Nothing checks that at runtime: a gated column that no longer exists
strips nothing and fails silently, exactly the class of bug that dropping the
26 comma-joined columns produced across 17 files.

Shaped after tests/unit/test_link_fields_schema.py, which is the same tripwire
for the link-field mixins.
"""

import pytest

from app.schemas.link_fields import LINK_FIELD_MIXINS
from app.services.rbac.field_groups import (
    FIELD_GROUP_KEYS,
    FIELD_GROUPS,
    columns_for,
    link_fields_for,
)
from app.utils.media_resolver import MEDIA_TABLES, MEDIA_TYPE_KEYS


def test_keys_tuple_matches_the_registry():
    assert set(FIELD_GROUP_KEYS) == set(FIELD_GROUPS)
    assert len(FIELD_GROUP_KEYS) == len(set(FIELD_GROUP_KEYS))


@pytest.mark.parametrize("key", sorted(FIELD_GROUPS))
def test_dict_key_matches_the_group_key(key):
    assert FIELD_GROUPS[key].key == key


@pytest.mark.parametrize("key", sorted(FIELD_GROUPS))
def test_group_covers_at_least_one_surface(key):
    """A group that gates nothing is a permission nobody can feel."""
    group = FIELD_GROUPS[key]
    covers = (
        any(columns_for(group, mt) for mt in MEDIA_TYPE_KEYS)
        or any(link_fields_for(group, mt) for mt in MEDIA_TYPE_KEYS)
        or group.source_buckets
    )
    assert covers, f"{key} gates nothing"


@pytest.mark.parametrize("key", sorted(FIELD_GROUPS))
def test_declared_media_types_are_real(key):
    group = FIELD_GROUPS[key]
    for mapping in (group.columns, group.link_fields):
        for media_type in mapping:
            assert media_type == "*" or media_type in MEDIA_TABLES, (
                f"{key} names unknown media type {media_type!r}"
            )


@pytest.mark.parametrize("media_type", sorted(MEDIA_TYPE_KEYS))
@pytest.mark.parametrize("key", sorted(FIELD_GROUPS))
def test_every_gated_column_exists_on_the_model(key, media_type):
    """The whole point: a renamed or dropped column must break this test."""
    table = MEDIA_TABLES[media_type].model.__table__.columns
    for column in columns_for(FIELD_GROUPS[key], media_type):
        assert column in table, f"{key} gates {media_type}.{column}, which does not exist"


@pytest.mark.parametrize("media_type", sorted(MEDIA_TYPE_KEYS))
@pytest.mark.parametrize("key", sorted(FIELD_GROUPS))
def test_every_gated_link_field_exists_on_the_mixin(key, media_type):
    fields = LINK_FIELD_MIXINS[media_type].model_fields
    for attr in link_fields_for(FIELD_GROUPS[key], media_type):
        assert attr in fields, f"{key} gates {media_type}.{attr}, not a link field"


def test_sources_restricted_is_the_only_group_and_gates_its_bucket():
    """Everything per user is private and every viewer gets the other
    sources, so the restricted bucket is all a mode can withhold."""
    assert FIELD_GROUP_KEYS == ("sources_restricted",)
    assert FIELD_GROUPS["sources_restricted"].source_buckets == ("restricted",)


def test_a_group_cannot_name_note_sections():
    """Personal-scope sections are filtered by author in routers/note.py, so
    there is no field-group mechanism over note sections to declare."""
    for key, group in FIELD_GROUPS.items():
        assert not hasattr(group, "note_sections"), key


def test_no_group_gates_credits_or_system_info():
    """Both left this axis, for opposite reasons.

    `credits` is ungated entirely - studio and director are what an entry IS,
    and there was never a case for withholding them. `system_info` became the
    role permission `view.system_info`, held by super and admin: who may read
    an entry's timestamps is a property of the account rather than a ceiling
    on what the session may reach.
    """
    assert "credits" not in FIELD_GROUPS
    assert "system_info" not in FIELD_GROUPS

    # No survivor picked them up by accident.
    for key, group in FIELD_GROUPS.items():
        for media_type in MEDIA_TYPE_KEYS:
            assert "studio" not in link_fields_for(group, media_type), key
            assert "created_at" not in columns_for(group, media_type), key


def test_no_group_declares_a_frontend_block():
    """There is no `ui_block` field.

    One named the SPA component a group hides and read as a wiring mechanism
    in the module docstring, but nothing in `app/` ever loaded it: the SPA
    hides those blocks by checking the permission, with the component named in
    JSX. A string documenting a mapping the code does not make is worse than
    no string.
    """
    for key, group in FIELD_GROUPS.items():
        assert not hasattr(group, "ui_block"), key


def test_every_gated_bucket_is_a_real_bucket():
    from app.utils.source_fields import SOURCE_BUCKETS

    for key, group in FIELD_GROUPS.items():
        for bucket in group.source_buckets:
            assert bucket in SOURCE_BUCKETS, f"{key} gates unknown bucket {bucket}"
