"""DLsite pure helpers: the product id in a work URL, and the record mapper."""

from types import SimpleNamespace

from app.utils.dlsite_utils import (
    dlsite_product_id_for,
    extract_dlsite_product_id,
    map_dlsite_to_h_game_data,
)

JP_LINK = "https://www.dlsite.com/maniax/work/=/product_id/RJ173356.html"
# DLsite's Traditional Chinese storefront is the same page with a locale.
TW_LINK = "https://www.dlsite.com/maniax/work/=/product_id/RJ173356.html/?locale=zh_TW"

# The shape product.json answers, trimmed to what the mapper reads.
RECORD = {
    "workno": "RJ173356",
    "work_name": "ダークエルフのヒストリア",
    "regist_date": "2016-03-17 00:00:00",
    "maker_name": "ONEONE1",
    "image_main": {
        "url": "//img.dlsite.jp/modpub/images2/work/doujin/RJ174000/RJ173356_img_main.jpg",
    },
}


class TestProductId:
    def test_a_jp_doujin_link(self):
        assert extract_dlsite_product_id(JP_LINK) == "RJ173356"

    def test_a_tw_link_names_the_same_product(self):
        assert extract_dlsite_product_id(TW_LINK) == "RJ173356"

    def test_a_commercial_link(self):
        url = "https://www.dlsite.com/pro/work/=/product_id/VJ013799.html"
        assert extract_dlsite_product_id(url) == "VJ013799"

    def test_an_eight_digit_id(self):
        url = "https://www.dlsite.com/maniax/work/=/product_id/RJ01014447.html"
        assert extract_dlsite_product_id(url) == "RJ01014447"

    def test_a_lower_case_id_is_returned_as_dlsite_spells_it(self):
        url = "https://www.dlsite.com/maniax/work/=/product_id/rj173356.html"
        assert extract_dlsite_product_id(url) == "RJ173356"

    def test_no_id_is_none(self):
        assert extract_dlsite_product_id("https://www.dlsite.com/maniax/") is None
        assert extract_dlsite_product_id(None) is None
        assert extract_dlsite_product_id("") is None


class TestWhichLink:
    def test_jp_wins_when_both_are_set(self):
        entry = SimpleNamespace(
            dlsite_link_jp=JP_LINK,
            dlsite_link_tw="https://www.dlsite.com/maniax/work/=/product_id/RJ999999.html",
        )
        assert dlsite_product_id_for(entry) == "RJ173356"

    def test_tw_is_the_fallback(self):
        entry = SimpleNamespace(dlsite_link_jp=None, dlsite_link_tw=TW_LINK)
        assert dlsite_product_id_for(entry) == "RJ173356"

    def test_a_jp_link_without_an_id_does_not_hide_the_tw_one(self):
        entry = SimpleNamespace(
            dlsite_link_jp="https://www.dlsite.com/maniax/", dlsite_link_tw=TW_LINK
        )
        assert dlsite_product_id_for(entry) == "RJ173356"

    def test_neither_is_none(self):
        entry = SimpleNamespace(dlsite_link_jp=None, dlsite_link_tw=None)
        assert dlsite_product_id_for(entry) is None


class TestMapper:
    def test_the_three_fields(self):
        mapped = map_dlsite_to_h_game_data(RECORD)
        assert mapped == {
            "release_date": "2016-03-17",
            "maker_name": "ONEONE1",
            "cover_image_url": (
                "https://img.dlsite.jp/modpub/images2/work/doujin/RJ174000/"
                "RJ173356_img_main.jpg"
            ),
        }

    def test_an_absolute_image_url_is_kept(self):
        raw = dict(RECORD, image_main={"url": "https://img.dlsite.jp/x.jpg"})
        assert map_dlsite_to_h_game_data(raw)["cover_image_url"] == "https://img.dlsite.jp/x.jpg"

    def test_missing_fields_map_to_none(self):
        assert map_dlsite_to_h_game_data({}) == {
            "release_date": None,
            "maker_name": None,
            "cover_image_url": None,
        }
        assert map_dlsite_to_h_game_data(None)["release_date"] is None

    def test_a_blank_maker_is_none(self):
        assert map_dlsite_to_h_game_data(dict(RECORD, maker_name="  "))["maker_name"] is None

    def test_a_malformed_date_is_none(self):
        assert map_dlsite_to_h_game_data(dict(RECORD, regist_date="soon"))["release_date"] is None
