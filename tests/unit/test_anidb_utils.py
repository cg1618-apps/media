"""
The pure half of the AniDB integration: reading an aid out of an AniDB URL,
and mapping AniDB's anime XML onto hentai fields. No I/O.
"""

from datetime import date
from xml.etree import ElementTree

import pytest

from app.utils.anidb_utils import (
    ANIDB_IMAGE_BASE_URL,
    derive_airing_status,
    extract_anidb_aid,
    map_anidb_to_hentai_data,
)

TODAY = date(2026, 9, 27)

# The documented shape of a request=anime answer, trimmed. The character and
# the resource each carry a <picture> / <url> of their own, which must never
# be mistaken for the anime's.
ANIME_XML = """<?xml version="1.0" encoding="UTF-8"?>
<anime id="4521" restricted="true">
  <type>OVA</type>
  <episodecount>2</episodecount>
  <startdate>2003-01-24</startdate>
  <enddate>2003-05-23</enddate>
  <titles>
    <title xml:lang="x-jat" type="main">Romaji Title</title>
    <title xml:lang="ja" type="official">日本語</title>
  </titles>
  <url>http://official.example/ova</url>
  <creators><name id="1" type="Animation Work">Studio X</name></creators>
  <description>Synopsis.</description>
  <picture>12345.jpg</picture>
  <resources>
    <resource type="2"><externalentity><identifier>999</identifier>
      <url>https://myanimelist.net/anime/999</url></externalentity></resource>
  </resources>
  <characters>
    <character id="7" type="main character in">
      <name>Heroine</name><picture>77777.jpg</picture>
    </character>
  </characters>
</anime>
"""


def _root(xml: str = ANIME_XML):
    return ElementTree.fromstring(xml)


class TestExtractAid:
    @pytest.mark.parametrize(
        "url, aid",
        [
            ("https://anidb.net/anime/4521", 4521),
            ("https://anidb.net/anime/4521/", 4521),
            ("http://anidb.net/anime/4521?lang=en#main", 4521),
            ("https://anidb.net/a4521", 4521),
            ("anidb.net/anime/4521", 4521),
            ("https://anidb.net/perl-bin/animedb.pl?show=anime&aid=4521", 4521),
            ("http://anidb.net/perl-bin/animedb.pl?aid=4521&show=anime", 4521),
            ("https://ANIDB.net/Anime/4521", 4521),
        ],
    )
    def test_reads_the_aid_from_both_url_forms(self, url, aid):
        assert extract_anidb_aid(url) == aid

    @pytest.mark.parametrize(
        "url",
        [
            None,
            "",
            "https://anidb.net/",
            "https://anidb.net/episode/12345",
            "https://anidb.net/creator/4521",
            "https://anidb.net/perl-bin/animedb.pl?show=ep&eid=12345",
            "https://myanimelist.net/anime/4521",
            "https://anidb.net/anime/0",
        ],
    )
    def test_a_url_naming_no_anime_is_none(self, url):
        assert extract_anidb_aid(url) is None


class TestMapping:
    def test_maps_the_anime_record(self):
        data = map_anidb_to_hentai_data(_root(), today=TODAY)
        assert data == {
            "release_date": "2003-01-24",
            "airing_status": "Finished Airing",
            "official_link": "http://official.example/ova",
            "cover_image_url": f"{ANIDB_IMAGE_BASE_URL}12345.jpg",
        }

    def test_the_cover_is_the_anime_picture_not_a_character_one(self):
        url = map_anidb_to_hentai_data(_root(), today=TODAY)["cover_image_url"]
        assert url == "https://cdn-eu.anidb.net/images/main/12345.jpg"
        assert "77777" not in url

    def test_the_official_link_is_not_a_resource_url(self):
        xml = ANIME_XML.replace("<url>http://official.example/ova</url>", "")
        data = map_anidb_to_hentai_data(_root(xml), today=TODAY)
        assert data["official_link"] is None

    def test_no_titles_are_mapped(self):
        data = map_anidb_to_hentai_data(_root(), today=TODAY)
        assert not any("name" in key or "title" in key for key in data)

    def test_a_record_without_picture_or_dates_maps_to_nones(self):
        data = map_anidb_to_hentai_data(_root('<anime id="1"><type>OVA</type></anime>'))
        assert data == {
            "release_date": None,
            "airing_status": None,
            "official_link": None,
            "cover_image_url": None,
        }

    def test_a_coarse_startdate_keeps_its_precision(self):
        xml = ANIME_XML.replace("2003-01-24", "2003-01")
        assert map_anidb_to_hentai_data(_root(xml), today=TODAY)["release_date"] == "2003-01"

    def test_none_maps_to_nones(self):
        assert map_anidb_to_hentai_data(None)["cover_image_url"] is None


class TestAiringStatus:
    @pytest.mark.parametrize(
        "start, end, episodes, expected",
        [
            ("2003-01-24", "2003-05-23", 2, "Finished Airing"),
            ("2027-01-01", None, 2, "Not Yet Aired"),
            ("2026-09-01", None, 2, "Airing"),
            ("2026-09-01", "2026-12-01", 2, "Airing"),
            # One episode that has come out is finished, end date or not.
            ("2026-09-01", None, 1, "Finished Airing"),
            ("2026-09-27", "2026-09-27", 2, "Finished Airing"),
            # A coarse date that contains today cannot say which side it is on.
            ("2026", None, 2, None),
            ("2025", None, 2, "Airing"),
            (None, None, 1, None),
        ],
    )
    def test_derived_from_the_dates(self, start, end, episodes, expected):
        assert derive_airing_status(start, end, episodes, TODAY) == expected
