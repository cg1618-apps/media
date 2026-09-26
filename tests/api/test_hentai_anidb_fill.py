"""
AniDB on a hentai, after MAL.

MAL (Tenrai) fills first; AniDB then fills whichever of the airing status,
release date and cover MAL left blank, plus the Official site reference row -
all fill-only, so MAL's value wins wherever both have one. AniDB is off while
ANIDB_CLIENT / ANIDB_CLIENTVER are unset, and an error answer (a ban above
all) stops the run.

Tenrai, AniDB and the cover download are all patched out - no test here
reaches the network.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import dataclasses
import gzip
import json
import uuid
from xml.etree import ElementTree

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_hentai_from_anidb
from app.services.domain.post_processing import apply_single_replace_hentai
from app.services.domain.sources import find_main_source
from app.services.integrations import anidb
from app.services.pipelines.runner import run_fill
from app.services.pipelines.specs import PIPELINES
from app.utils.source_fields import OFFICIAL_SITE_VALUE

ANIDB_LINK = "https://anidb.net/anime/4521"
OLD_ANIDB_LINK = "https://anidb.net/perl-bin/animedb.pl?show=anime&aid=4521"
MAL_LINK = "https://myanimelist.net/anime/188"

ANIDB_XML = """<?xml version="1.0" encoding="UTF-8"?>
<anime id="4521" restricted="true">
  <type>OVA</type>
  <episodecount>1</episodecount>
  <startdate>2003-01-24</startdate>
  <enddate>2003-01-24</enddate>
  <titles><title xml:lang="x-jat" type="main">AniDB Title</title></titles>
  <url>http://official.example/ova</url>
  <picture>12345.jpg</picture>
</anime>
"""
ANIDB_COVER = "https://cdn-eu.anidb.net/images/main/12345.jpg"
MAL_COVER = "https://cdn.test/188.jpg"

TENRAI_RESULT = {
    "type": "OVA",
    "rating": "Rx - Hentai",
    "status": "Finished Airing",
    "aired": {
        "from": "1998-09-25T00:00:00+00:00",
        "prop": {"from": {"day": 25, "month": 9, "year": 1998}},
        "string": "Sep 25, 1998",
    },
    "episodes": 1,
    "images": {"jpg": {"image_url": MAL_COVER}},
    "titles": [{"type": "Default", "title": "Default Title"}],
    "external": [],
}


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def enabled(monkeypatch):
    """A registered AniDB client, no pacing, and no answer left from before."""
    monkeypatch.setattr(anidb.settings, "anidb_client", "testclient")
    monkeypatch.setattr(anidb.settings, "anidb_clientver", "1")
    monkeypatch.setattr(anidb, "_pause", lambda: None)
    anidb.reset_cache()
    anidb.start_run()
    yield
    anidb.reset_cache()
    anidb.start_run()


@pytest.fixture
def sources(monkeypatch, enabled):
    """
    Tenrai and AniDB both answering, every request and download recorded. A
    test switches Tenrai's cover off, or either source off, through `state`.

    AniDB is stubbed at requests.get, so the real client - its cache and its
    halt - runs. The download returns a key naming the URL it fetched, so the
    stored cover says which source won; it is not the owner's own key, so a
    later source never mistakes it for a lost download.
    """
    state = {
        "tenrai": dict(TENRAI_RESULT),
        "anidb": ANIDB_XML,
        "calls": [],
        "downloads": [],
    }

    def fetch_tenrai(mal_id):
        state["calls"].append(("tenrai", mal_id))
        return state["tenrai"]

    class Answer:
        status_code = 200

        def __init__(self, body):
            self.content = gzip.compress(body.encode("utf-8"))

    def fake_get(url, **kwargs):
        state["calls"].append(("anidb", kwargs["params"]["aid"]))
        return Answer(state["anidb"])

    def download(url, owner_type, sid):
        state["downloads"].append((url, owner_type))
        return f"stored:{url}"

    monkeypatch.setattr(autofill_module, "fetch_tenrai_anime_data", fetch_tenrai)
    monkeypatch.setattr(anidb.requests, "get", fake_get)
    monkeypatch.setattr(autofill_module, "download_cover_image", download)
    return state


def _hentai(db_session, **kwargs):
    defaults = dict(system_id=uuid.uuid4(), hentai_name_cn="Zvornik AniDB")
    defaults.update(kwargs)
    entry = models.Hentai(**defaults)
    db_session.add(entry)
    db_session.flush()
    return entry


def _fill(db_session, entry):
    PIPELINES["hentai"].extract_id(entry)
    PIPELINES["hentai"].fill(db_session, entry)


# ---------------------------------------------------------------------------
# The AniDB autofill on its own
# ---------------------------------------------------------------------------


class TestAnidbAutofill:
    def test_fills_date_status_cover_and_official_site(self, db_session, sources):
        entry = _hentai(db_session, anidb_id=4521)
        autofill_hentai_from_anidb(entry, db=db_session)
        assert entry.release_date == "2003-01-24"
        assert entry.airing_status == "Finished Airing"
        assert entry.cover_image_file == f"stored:{ANIDB_COVER}"
        assert sources["downloads"] == [(ANIDB_COVER, "hentai")]
        row = find_main_source(db_session, entry.system_id, "reference", OFFICIAL_SITE_VALUE)
        assert row is not None and row.url == "http://official.example/ova"

    def test_writes_no_name(self, db_session, sources):
        entry = _hentai(db_session, anidb_id=4521)
        autofill_hentai_from_anidb(entry, db=db_session)
        assert entry.hentai_name_cn == "Zvornik AniDB"
        assert entry.hentai_name_en is None
        assert entry.hentai_name_roman is None
        assert entry.hentai_name_jp is None

    def test_is_fill_only(self, db_session, sources):
        """Every value set beforehand, and different from AniDB's - the
        refusal needs something to keep."""
        entry = _hentai(
            db_session,
            anidb_id=4521,
            release_date="2010-05",
            airing_status="Not Yet Aired",
            cover_image_file="library/hand-picked.jpg",
        )
        autofill_hentai_from_anidb(entry, db=db_session)
        assert entry.release_date == "2010-05"
        assert entry.airing_status == "Not Yet Aired"
        assert entry.cover_image_file == "library/hand-picked.jpg"
        assert sources["downloads"] == []
        # Nothing was blank, so nothing was asked.
        assert sources["calls"] == []

    def test_fills_only_the_blank_one(self, db_session, sources):
        entry = _hentai(
            db_session,
            anidb_id=4521,
            release_date="2010-05",
            airing_status="Not Yet Aired",
        )
        autofill_hentai_from_anidb(entry, db=db_session)
        assert entry.release_date == "2010-05"
        assert entry.airing_status == "Not Yet Aired"
        assert entry.cover_image_file == f"stored:{ANIDB_COVER}"

    def test_no_anidb_id_makes_no_request(self, db_session, sources):
        entry = _hentai(db_session)
        autofill_hentai_from_anidb(entry, db=db_session)
        assert sources["calls"] == []

    def test_an_unknown_anime_writes_nothing(self, db_session, sources):
        sources["anidb"] = "<error>Anime not found</error>"
        entry = _hentai(db_session, anidb_id=4521)
        autofill_hentai_from_anidb(entry, db=db_session)
        assert entry.release_date is None
        assert entry.cover_image_file is None
        assert anidb.has_capacity() is True


# ---------------------------------------------------------------------------
# MAL first, AniDB second
# ---------------------------------------------------------------------------


class TestOrder:
    def test_mal_cover_wins_over_anidb(self, db_session, sources):
        entry = _hentai(db_session, mal_link=MAL_LINK, anidb_link=ANIDB_LINK)
        _fill(db_session, entry)
        assert entry.cover_image_file == f"stored:{MAL_COVER}"
        assert [url for url, _ in sources["downloads"]] == [MAL_COVER]
        # MAL's date and status win too.
        assert entry.release_date == "1998-09-25"
        # MAL filled all three, so AniDB was never asked.
        assert [c[0] for c in sources["calls"]] == ["tenrai"]

    def test_anidb_supplies_the_cover_mal_lacks(self, db_session, sources):
        sources["tenrai"] = dict(TENRAI_RESULT, images={})
        entry = _hentai(db_session, mal_link=MAL_LINK, anidb_link=ANIDB_LINK)
        _fill(db_session, entry)
        assert entry.cover_image_file == f"stored:{ANIDB_COVER}"
        # MAL's date is kept; AniDB only filled the gap.
        assert entry.release_date == "1998-09-25"
        assert [c[0] for c in sources["calls"]] == ["tenrai", "anidb"]

    def test_an_entry_with_only_an_anidb_link_is_filled(self, db_session, sources):
        entry = _hentai(db_session, anidb_link=OLD_ANIDB_LINK)
        _fill(db_session, entry)
        assert entry.anidb_id == 4521
        assert entry.cover_image_file == f"stored:{ANIDB_COVER}"
        assert [c[0] for c in sources["calls"]] == ["anidb"]

    def test_replace_takes_the_same_order_and_stays_fill_only(self, db_session, sources):
        sources["tenrai"] = dict(TENRAI_RESULT, images={})
        entry = _hentai(
            db_session,
            mal_link=MAL_LINK,
            anidb_link=ANIDB_LINK,
            airing_status="Airing",
        )
        apply_single_replace_hentai(db_session, entry)
        assert entry.anidb_id == 4521
        assert entry.airing_status == "Airing"
        assert entry.cover_image_file == f"stored:{ANIDB_COVER}"


# ---------------------------------------------------------------------------
# Enabled or not: one fixture, both directions
# ---------------------------------------------------------------------------


class TestDisabled:
    def test_enabled_it_fills_and_queues(self, db_session, sources):
        entry = _hentai(db_session, anidb_link=ANIDB_LINK)
        PIPELINES["hentai"].extract_id(entry)
        assert PIPELINES["hentai"].fill_eligible(db_session, entry) is True
        PIPELINES["hentai"].fill(db_session, entry)
        assert entry.cover_image_file == f"stored:{ANIDB_COVER}"

    def test_disabled_it_neither_fills_nor_queues(self, db_session, sources, monkeypatch):
        monkeypatch.setattr(anidb.settings, "anidb_client", None)
        monkeypatch.setattr(anidb.settings, "anidb_clientver", None)
        entry = _hentai(db_session, anidb_link=ANIDB_LINK)
        PIPELINES["hentai"].extract_id(entry)
        # The link still yields its id; nothing is fetched from it.
        assert entry.anidb_id == 4521
        assert PIPELINES["hentai"].fill_eligible(db_session, entry) is False
        PIPELINES["hentai"].fill(db_session, entry)
        assert entry.cover_image_file is None
        assert sources["calls"] == []
        # Disabled is not an error: the run is not stopped.
        assert PIPELINES["hentai"].budget() is True


# ---------------------------------------------------------------------------
# Eligibility and selection
# ---------------------------------------------------------------------------


class TestSelection:
    def test_an_anidb_complete_entry_is_not_eligible(self, db_session, enabled):
        """The mirror of the enabled test above, with every field filled."""
        entry = _hentai(
            db_session,
            anidb_id=4521,
            release_date="2003-01-24",
            airing_status="Finished Airing",
        )
        assert PIPELINES["hentai"].fill_eligible(db_session, entry) is True
        entry.cover_image_file = "library/hand-picked.jpg"
        assert PIPELINES["hentai"].fill_eligible(db_session, entry) is False

    def test_mal_eligibility_is_unchanged(self, db_session, monkeypatch):
        monkeypatch.setattr(anidb.settings, "anidb_client", None)
        entry = _hentai(db_session, mal_id=188)
        assert PIPELINES["hentai"].fill_eligible(db_session, entry) is True

    def test_replace_selects_an_entry_linked_only_to_anidb(self, db_session):
        entry = _hentai(db_session, anidb_link=ANIDB_LINK)
        assert entry in PIPELINES["hentai"].replace_select(db_session)


# ---------------------------------------------------------------------------
# A ban stops the run
# ---------------------------------------------------------------------------


class FakeRequest:
    async def is_disconnected(self):
        return False


async def _events(gen):
    return [json.loads(m[6:]) async for m in gen]


class TestBan:
    @pytest.mark.anyio
    async def test_a_ban_stops_the_run_and_says_how_many_are_left(
        self, db_session, sources
    ):
        sources["anidb"] = '<?xml version="1.0"?><error>Banned</error>'
        for n in range(3):
            _hentai(db_session, hentai_name_cn=f"Zvornik Ban {n}", anidb_link=f"https://anidb.net/anime/{4521 + n}")
        spec = dataclasses.replace(PIPELINES["hentai"], fill_sleep=0, fill_after=())

        out = await _events(run_fill(spec, db_session, FakeRequest(), log_action=False))

        # One request, the ban, and nothing after it.
        assert [c[0] for c in sources["calls"]] == ["anidb"]
        assert out[-1]["status"] == "success"
        assert out[-1]["processed"] == 1
        assert "2 entries skipped" in out[-1]["message"]

    @pytest.mark.anyio
    async def test_the_next_run_asks_again(self, db_session, sources):
        """The halt lasts one run: pre_run lifts it."""
        anidb._halt("Banned")
        assert PIPELINES["hentai"].budget() is False
        _hentai(db_session, anidb_link=ANIDB_LINK)
        spec = dataclasses.replace(PIPELINES["hentai"], fill_sleep=0, fill_after=())

        out = await _events(run_fill(spec, db_session, FakeRequest(), log_action=False))

        assert ("anidb", 4521) in sources["calls"]
        assert "skipped" not in out[-1]["message"]


def test_the_xml_fixture_is_the_documented_shape():
    root = ElementTree.fromstring(ANIDB_XML)
    assert root.tag == "anime"
    assert root.find("picture").text == "12345.jpg"


# ---------------------------------------------------------------------------
# The Calculate page's missing-cover tool
# ---------------------------------------------------------------------------


class TestMissingCovers:
    """One fixture, both directions: an AniDB-only hentai is re-fetched while
    AniDB is enabled, and counted as skipped while it is not."""

    def _run(self, db_session, monkeypatch):
        from app.services import calculation
        from app.services.integrations.image_manager import cover_key

        sid = uuid.uuid4()
        _hentai(
            db_session,
            system_id=sid,
            anidb_id=4521,
            cover_image_file=cover_key("hentai", str(sid)),
        )
        monkeypatch.setattr(calculation, "cover_image_exists", lambda owner_type, s: False)
        monkeypatch.setattr(db_session, "commit", lambda: None)
        return calculation.bulk_download_missing_covers(db_session, system_ids=[str(sid)])

    def test_enabled_an_anidb_only_hentai_is_refetched(self, db_session, sources, monkeypatch):
        result = self._run(db_session, monkeypatch)
        assert "Downloaded 1 of 1" in result["message"]
        assert sources["downloads"] == [(ANIDB_COVER, "hentai")]

    def test_disabled_it_is_skipped(self, db_session, sources, monkeypatch):
        monkeypatch.setattr(anidb.settings, "anidb_client", None)
        result = self._run(db_session, monkeypatch)
        assert "Downloaded 0 of 1" in result["message"]
        assert "1 skipped" in result["message"]
        assert sources["calls"] == []
