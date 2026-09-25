"""
Every gated type's search bucket must be leavable out of the response.

search() gives no key for a gated type the viewer cannot see; SearchBuckets
then has to default that field to None, which _drop_absent removes. A gated
type declared with `= []` like the others would put the key straight back, and
nothing else would notice.
"""

from app.routers.search import SearchBuckets
from app.services.domain.search import SEARCHABLE_BY_KEY
from app.services.rbac.gated_types import gated_types


def test_there_is_a_gated_searchable_type():
    """Load-bearing: without one the guard below checks nothing."""
    assert gated_types() & set(SEARCHABLE_BY_KEY)


def test_every_gated_bucket_defaults_to_absent():
    fields = {
        (field.alias or name): field for name, field in SearchBuckets.model_fields.items()
    }
    for media_type in gated_types() & set(SEARCHABLE_BY_KEY):
        assert fields[media_type].default is None, media_type


def test_an_absent_bucket_is_left_out_and_an_empty_one_is_kept():
    dumped = SearchBuckets(manga=[]).model_dump(by_alias=True)
    for media_type in gated_types() & set(SEARCHABLE_BY_KEY):
        assert media_type not in dumped
    assert dumped["manga"] == []
