"""
The pure half of the E-Hentai integration: the gallery key read out of a URL,
and the gallery record mapped onto h-comic fields.
"""

from types import SimpleNamespace

import pytest

from app.utils.ehentai_utils import (
    ehentai_gallery_key_for,
    extract_ehentai_gallery_key,
    map_ehentai_to_h_comic_data,
)

# Trimmed from a live gdata answer for gallery 618395.
RECORD = {
    "gid": 618395,
    "token": "0439fa3666",
    "title": "(Kouroumu 8) [Handful☆Happiness! (Fuyuki Nanahara)] TOUHOU GUNMANIA A2",
    "title_jpn": "(紅楼夢8) [Handful☆Happiness! (七原冬雪)]",
    "thumb": "https://ehgt.org/w/00/310/49862-ddt1sawg.webp",
    "posted": "1376110208",
    "tags": [
        "parody:touhou project",
        "character:hong meiling",
        "group:handful happiness",
        "artist:nanahara fuyuki",
        "other:full color",
    ],
}


class TestGalleryKey:
    @pytest.mark.parametrize(
        "url",
        [
            "https://e-hentai.org/g/618395/0439fa3666/",
            "https://e-hentai.org/g/618395/0439fa3666",
            "http://e-hentai.org/g/618395/0439fa3666/?p=2",
            "https://exhentai.org/g/618395/0439fa3666/",
            "https://E-Hentai.org/g/618395/0439FA3666/",
        ],
    )
    def test_reads_the_id_and_token(self, url):
        assert extract_ehentai_gallery_key(url) == (618395, "0439fa3666")

    @pytest.mark.parametrize(
        "url",
        [
            None,
            "",
            "https://e-hentai.org/",
            "https://e-hentai.org/tag/artist:nanahara+fuyuki",
            # A page viewer URL names an image, not a gallery.
            "https://e-hentai.org/s/0a1b2c3d4e/618395-1",
            "https://e-hentai.org/g/618395/",
            "https://myanimelist.net/manga/618395",
        ],
    )
    def test_anything_else_is_no_key(self, url):
        assert extract_ehentai_gallery_key(url) is None

    def test_reads_the_entry_link(self):
        entry = SimpleNamespace(ehentai_link="https://e-hentai.org/g/618395/0439fa3666/")
        assert ehentai_gallery_key_for(entry) == (618395, "0439fa3666")
        assert ehentai_gallery_key_for(SimpleNamespace(ehentai_link=None)) is None


class TestMapping:
    def test_the_cover_is_the_thumb(self):
        data = map_ehentai_to_h_comic_data(RECORD)
        assert data["cover_image_url"] == "https://ehgt.org/w/00/310/49862-ddt1sawg.webp"

    def test_artists_come_from_the_artist_tags_only_title_cased(self):
        """The group: tag is the circle, not an artist, and is not read."""
        assert map_ehentai_to_h_comic_data(RECORD)["artists"] == ["Nanahara Fuyuki"]

    def test_several_artists_keep_the_gallery_order_without_repeats(self):
        record = dict(
            RECORD,
            tags=["artist:b artist", "female:big breasts", "artist:a artist", "artist:B Artist"],
        )
        assert map_ehentai_to_h_comic_data(record)["artists"] == ["B Artist", "A Artist"]

    def test_nothing_else_is_mapped(self):
        """posted is the upload date and the title is the uploader's: neither
        may reach release_date or a name."""
        assert set(map_ehentai_to_h_comic_data(RECORD)) == {"cover_image_url", "artists"}

    def test_a_bare_record_maps_to_nothing(self):
        assert map_ehentai_to_h_comic_data({}) == {"cover_image_url": None, "artists": []}
