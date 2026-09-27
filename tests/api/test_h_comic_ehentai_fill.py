"""
E-Hentai on an h-comic: the second fill source, after MAL.

E-Hentai fills two things, fill-only: the cover, and the gallery's artist:
tags as the illustrator (繪師) credit. It runs after Tenrai, so it supplies
only what MAL left empty. It never writes a date or a name.

Every fetch and the cover download are patched out - these tests lock down
behaviour, not the network layer.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_h_comic_from_ehentai
from app.services.domain.credits import credit_names, replace_credits
from app.services.domain.post_processing import apply_single_replace_h_comic
from app.services.pipelines.specs import PIPELINES

LINK = "https://e-hentai.org/g/618395/0439fa3666/"
EH_COVER = "https://ehgt.org/w/00/310/49862-ddt1sawg.webp"
MAL_COVER = "https://cdn.test/777.jpg"

GALLERY = {
    "gid": 618395,
    "token": "0439fa3666",
    "title": "(Kouroumu 8) [Handful Happiness! (Fuyuki Nanahara)] TOUHOU GUNMANIA A2",
    "title_jpn": "[Handful Happiness! (七原冬雪)] TOUHOU GUNMANIA A2",
    "thumb": EH_COVER,
    "posted": "1376110208",
    "tags": ["parody:touhou project", "group:handful happiness", "artist:nanahara fuyuki"],
}

MANGA_RESULT = {
    "type": "Manga",
    "status": "Finished",
    "published": {
        "from": "2019-03-01T00:00:00+00:00",
        "to": "2021-06-01T00:00:00+00:00",
        "prop": {
            "from": {"day": 1, "month": 3, "year": 2019},
            "to": {"day": 1, "month": 6, "year": 2021},
        },
    },
    "chapters": 1,
    "images": {"jpg": {"image_url": MAL_COVER}},
    "titles": [{"type": "Default", "title": "Default Title"}],
}


@pytest.fixture
def sources(monkeypatch):
    """
    Both sources answering, with every request and cover download recorded.
    A test switches one off by setting its answer to None.

    The download returns a key naming the URL it fetched, so the stored cover
    says which source won. It is not the owner's own key, so a later source
    never mistakes it for a lost download and re-fetches.
    """
    state = {
        "gallery": dict(GALLERY),
        "mal": dict(MANGA_RESULT),
        "calls": [],
        "downloads": [],
    }

    def fetch_gallery(gid, token):
        state["calls"].append(("ehentai", gid, token))
        return state["gallery"]

    def fetch_mal(mal_id):
        state["calls"].append(("mal", mal_id))
        return state["mal"]

    def download(url, owner_type, sid):
        state["downloads"].append((url, owner_type))
        return f"stored:{url}"

    monkeypatch.setattr(autofill_module, "fetch_ehentai_gallery", fetch_gallery)
    monkeypatch.setattr(autofill_module, "fetch_tenrai_manga_novel_data", fetch_mal)
    monkeypatch.setattr(autofill_module, "download_cover_image", download)
    return state


def _h_comic(db_session, **kwargs):
    defaults = dict(system_id=uuid.uuid4(), h_comic_name_cn="E-Hentai Fill", region="JP")
    defaults.update(kwargs)
    entry = models.HComic(**defaults)
    db_session.add(entry)
    db_session.flush()
    return entry


# ---------------------------------------------------------------------------
# The E-Hentai autofill on its own
# ---------------------------------------------------------------------------


class TestEhentaiAutofill:
    def test_fills_the_cover_and_the_illustrator(self, db_session, sources):
        entry = _h_comic(db_session, ehentai_link=LINK)
        autofill_h_comic_from_ehentai(entry, db_session)
        assert sources["calls"] == [("ehentai", 618395, "0439fa3666")]
        assert entry.cover_image_file == f"stored:{EH_COVER}"
        assert sources["downloads"] == [(EH_COVER, "h-comic")]
        assert credit_names(db_session, entry.system_id, "illustrator") == ["Nanahara Fuyuki"]

    def test_writes_no_date_and_no_name(self, db_session, sources):
        """posted is the upload date; the titles are the uploader's."""
        entry = _h_comic(db_session, ehentai_link=LINK)
        autofill_h_comic_from_ehentai(entry, db_session)
        assert entry.release_date is None
        assert entry.end_date is None
        assert entry.h_comic_name_jp is None
        assert entry.h_comic_name_en is None
        assert entry.h_comic_name_cn == "E-Hentai Fill"

    def test_the_group_tag_is_not_credited(self, db_session, sources):
        entry = _h_comic(db_session, ehentai_link=LINK)
        autofill_h_comic_from_ehentai(entry, db_session)
        assert credit_names(db_session, entry.system_id, "club") == []
        assert credit_names(db_session, entry.system_id, "author") == []

    def test_is_fill_only(self, db_session, sources):
        """Both values set beforehand - the refusal needs something to keep."""
        entry = _h_comic(
            db_session, ehentai_link=LINK, cover_image_file="library/hand-picked.jpg"
        )
        replace_credits(db_session, "h-comic", entry.system_id, "illustrator", ["Hand Artist"])

        autofill_h_comic_from_ehentai(entry, db_session)

        assert entry.cover_image_file == "library/hand-picked.jpg"
        assert credit_names(db_session, entry.system_id, "illustrator") == ["Hand Artist"]
        assert sources["downloads"] == []

    def test_the_artist_resolves_to_an_existing_person_whatever_the_case(
        self, db_session, sources
    ):
        existing = models.Person(name_en="NANAHARA FUYUKI")
        db_session.add(existing)
        db_session.flush()
        entry = _h_comic(db_session, ehentai_link=LINK)

        autofill_h_comic_from_ehentai(entry, db_session)

        credit = (
            db_session.query(models.MediaCredit)
            .filter_by(media_id=entry.system_id, role="illustrator")
            .one()
        )
        assert credit.person_id == existing.system_id

    def test_an_ambiguous_artist_is_skipped_and_the_cover_still_lands(
        self, db_session, sources
    ):
        """Two people answer to the second artist's name. Nothing is credited -
        not even the unambiguous first artist - and the cover is still taken."""
        sources["gallery"] = dict(
            GALLERY, tags=["artist:nanahara fuyuki", "artist:twin name"]
        )
        db_session.add_all([models.Person(name_en="Twin Name"), models.Person(name_jp="twin name")])
        db_session.flush()
        entry = _h_comic(db_session, ehentai_link=LINK)

        autofill_h_comic_from_ehentai(entry, db_session)
        db_session.flush()

        assert credit_names(db_session, entry.system_id, "illustrator") == []
        assert entry.cover_image_file == f"stored:{EH_COVER}"

    def test_no_link_makes_no_request(self, db_session, sources):
        entry = _h_comic(db_session)
        autofill_h_comic_from_ehentai(entry, db_session)
        assert sources["calls"] == []

    def test_a_link_that_is_not_a_gallery_makes_no_request(self, db_session, sources):
        entry = _h_comic(db_session, ehentai_link="https://e-hentai.org/")
        autofill_h_comic_from_ehentai(entry, db_session)
        assert sources["calls"] == []

    def test_a_refused_gallery_writes_nothing(self, db_session, sources):
        sources["gallery"] = None
        entry = _h_comic(db_session, ehentai_link=LINK)
        autofill_h_comic_from_ehentai(entry, db_session)
        assert entry.cover_image_file is None
        assert credit_names(db_session, entry.system_id, "illustrator") == []

    def test_a_failure_is_swallowed(self, db_session, sources, monkeypatch):
        def boom(gid, token):
            raise RuntimeError("E-Hentai is down")

        monkeypatch.setattr(autofill_module, "fetch_ehentai_gallery", boom)
        entry = _h_comic(db_session, ehentai_link=LINK)
        autofill_h_comic_from_ehentai(entry, db_session)
        assert entry.cover_image_file is None


# ---------------------------------------------------------------------------
# The h-comic pipeline: MAL first, E-Hentai for what is still empty
# ---------------------------------------------------------------------------


def _fill(db_session, entry):
    PIPELINES["h-comic"].fill(db_session, entry)


class TestOrder:
    def test_mal_runs_first_and_its_cover_wins(self, db_session, sources):
        entry = _h_comic(db_session, mal_id=777, ehentai_link=LINK)
        _fill(db_session, entry)
        assert [c[0] for c in sources["calls"]] == ["mal", "ehentai"]
        assert entry.cover_image_file == f"stored:{MAL_COVER}"
        assert [url for url, _ in sources["downloads"]] == [MAL_COVER]
        # MAL has no illustrator to give, so E-Hentai's is still taken.
        assert credit_names(db_session, entry.system_id, "illustrator") == ["Nanahara Fuyuki"]

    def test_ehentai_supplies_the_cover_mal_lacks(self, db_session, sources):
        sources["mal"] = dict(MANGA_RESULT, images={})
        entry = _h_comic(db_session, mal_id=777, ehentai_link=LINK)
        _fill(db_session, entry)
        assert entry.cover_image_file == f"stored:{EH_COVER}"
        # MAL's columns still came from MAL.
        assert entry.release_date == "2019-03-01"

    def test_an_entry_with_only_an_ehentai_link_is_filled(self, db_session, sources):
        entry = _h_comic(db_session, ehentai_link=LINK)
        _fill(db_session, entry)
        assert [c[0] for c in sources["calls"]] == ["ehentai"]
        assert entry.cover_image_file == f"stored:{EH_COVER}"

    def test_replace_takes_the_same_order_and_stays_fill_only(self, db_session, sources):
        sources["mal"] = dict(MANGA_RESULT, images={})
        entry = _h_comic(db_session, mal_id=777, ehentai_link=LINK, release_date="2015")
        replace_credits(db_session, "h-comic", entry.system_id, "illustrator", ["Hand Artist"])

        apply_single_replace_h_comic(db_session, entry)

        assert [c[0] for c in sources["calls"]] == ["mal", "ehentai"]
        assert entry.release_date == "2015"
        assert entry.cover_image_file == f"stored:{EH_COVER}"
        assert credit_names(db_session, entry.system_id, "illustrator") == ["Hand Artist"]


# ---------------------------------------------------------------------------
# Eligibility and selection
# ---------------------------------------------------------------------------


class TestSelection:
    def test_an_entry_with_only_an_ehentai_link_is_eligible(self, db_session):
        entry = _h_comic(db_session, ehentai_link=LINK)
        assert PIPELINES["h-comic"].fill_eligible(db_session, entry) is True

    def test_a_link_that_is_not_a_gallery_is_not(self, db_session):
        entry = _h_comic(db_session, ehentai_link="https://e-hentai.org/")
        assert PIPELINES["h-comic"].fill_eligible(db_session, entry) is False

    def test_an_ehentai_complete_entry_is_not_eligible(self, db_session):
        """The mirror of the first test: eligible while the illustrator is
        missing, and not once it is there."""
        entry = _h_comic(
            db_session, ehentai_link=LINK, cover_image_file="library/hand-picked.jpg"
        )
        assert PIPELINES["h-comic"].fill_eligible(db_session, entry) is True
        replace_credits(db_session, "h-comic", entry.system_id, "illustrator", ["Hand Artist"])
        assert PIPELINES["h-comic"].fill_eligible(db_session, entry) is False

    def test_replace_selects_an_entry_linked_only_to_ehentai(self, db_session):
        entry = _h_comic(db_session, ehentai_link=LINK)
        selected = PIPELINES["h-comic"].replace_select(db_session)
        assert entry in selected
