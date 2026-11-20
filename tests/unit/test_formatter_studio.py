"""parse_studio_from_sheet — sheet strings in, typed values out.

Covers the four name columns Task 1 added in place of name_native, plus the
six profile columns (display_name_field, founded_date, defunct_date, countries,
website_url, mal_id, mal_link). Without these, a Google Sheets Backup/Pull
round-trip silently drops them.
"""

import uuid
from datetime import datetime

from app.utils.formatter import parse_studio_from_sheet


class TestParseStudioFromSheet:
    def test_parses_the_four_name_columns(self):
        sid = str(uuid.uuid4())
        parsed = parse_studio_from_sheet(
            {
                "system_id": sid,
                "name_en": "Kyoto Animation",
                "name_cn": "京都動畫",
                "name_jp": "京都アニメーション",
                "name_alt": "KyoAni",
            }
        )
        assert str(parsed["system_id"]) == sid
        assert parsed["name_en"] == "Kyoto Animation"
        assert parsed["name_cn"] == "京都動畫"
        assert parsed["name_jp"] == "京都アニメーション"
        assert parsed["name_alt"] == "KyoAni"
        assert "name_native" not in parsed

    def test_parses_the_profile_columns(self):
        parsed = parse_studio_from_sheet(
            {
                "display_name_field": "alt",
                "founded_date": "1985-11",
                "defunct_date": "",
                "countries": '["Japan", "China"]',
                "website_url": "https://www.kyotoanimation.co.jp/",
                "mal_id": "2",
                "mal_link": "https://myanimelist.net/anime/producer/2",
            }
        )
        assert parsed["display_name_field"] == "alt"
        assert parsed["founded_date"] == "1985-11"
        assert parsed["defunct_date"] is None
        assert parsed["countries"] == ["Japan", "China"]
        assert parsed["website_url"] == "https://www.kyotoanimation.co.jp/"
        assert parsed["mal_id"] == 2
        assert parsed["mal_link"] == "https://myanimelist.net/anime/producer/2"

    def test_a_backup_from_before_countries_restores_its_one_country(self):
        """The old header, one value: what a sheet backed up before a studio
        could name several countries carries."""
        assert parse_studio_from_sheet({"country": " Japan "})["countries"] == ["Japan"]

    def test_a_hand_typed_comma_list_restores_as_several(self):
        parsed = parse_studio_from_sheet({"countries": "Japan, China, , Japan"})
        assert parsed["countries"] == ["Japan", "China"]

    def test_a_blank_cell_restores_as_null(self):
        assert parse_studio_from_sheet({"countries": "", "country": ""})["countries"] is None

    def test_created_at_parses_as_datetime(self):
        parsed = parse_studio_from_sheet(
            {"created_at": "2024-01-01T00:00:00Z"}
        )
        assert isinstance(parsed["created_at"], datetime)
