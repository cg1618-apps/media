"""`alone_reviewed_media_id` travels on the Franchise and Series tabs, and a
backup taken before the column existed leaves a local review alone."""

import uuid

import pytest

from app.utils.formatter import parse_franchise_from_sheet, parse_series_from_sheet

PARSERS = (parse_franchise_from_sheet, parse_series_from_sheet)


@pytest.mark.parametrize("parse", PARSERS)
def test_the_reviewed_id_round_trips(parse):
    reviewed = uuid.uuid4()
    parsed = parse({"system_id": str(uuid.uuid4()), "alone_reviewed_media_id": str(reviewed)})
    assert parsed["alone_reviewed_media_id"] == reviewed


@pytest.mark.parametrize("parse", PARSERS)
def test_a_sheet_without_the_column_does_not_clear_it(parse):
    # Absent from the payload, so Pull's update leaves the local value as is.
    parsed = parse({"system_id": str(uuid.uuid4())})
    assert "alone_reviewed_media_id" not in parsed


@pytest.mark.parametrize("parse", PARSERS)
def test_a_cell_that_is_not_a_uuid_restores_blank(parse):
    parsed = parse({"system_id": str(uuid.uuid4()), "alone_reviewed_media_id": "Tokyo Ghoul"})
    assert parsed["alone_reviewed_media_id"] is None
