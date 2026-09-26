"""
Hentai is filled from Tenrai for airing_status, release_date, the cover, and
the Official site and Twitter reference rows - each under anime's rule (the
two columns and the two rows fill-only, the cover only when the entry has
none).

The Tenrai fetch and the cover download are both patched out; no test here
reaches the network. The payload is the shape Tenrai serves for an Rx title
from the same anime endpoint anime uses.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_hentai_from_mal
from app.services.domain.content_labels import label_keys_for_entry
from app.services.pipelines.specs import PIPELINES
from app.utils.source_fields import OFFICIAL_SITE_VALUE, TWITTER_VALUE

RX_RESULT = {
    "type": "OVA",
    "rating": "Rx - Hentai",
    "status": "Finished Airing",
    "aired": {
        "from": "1998-09-25T00:00:00+00:00",
        "prop": {"from": {"day": 25, "month": 9, "year": 1998}},
        "string": "Sep 25, 1998 to Oct 30, 1998",
    },
    "score": 6.1,
    "rank": 9999,
    "episodes": 2,
    "images": {"jpg": {"image_url": "https://cdn.test/188.jpg"}},
    "studios": [{"name": "Some Studio"}],
    "titles": [{"type": "Default", "title": "Default Title"}],
    "external": [
        {"name": "Official Site", "url": "https://official.test/188"},
        {"name": "X", "url": "https://twitter.com/rx188"},
    ],
}


@pytest.fixture
def tenrai(monkeypatch):
    """Stub the fetch and the download; record what was asked for."""
    calls = {"fetch": [], "download": []}

    def fetch(mal_id):
        calls["fetch"].append(mal_id)
        return RX_RESULT

    def download(url, owner_type, system_id):
        calls["download"].append((url, owner_type))
        return f"hentai/{system_id}.jpg"

    monkeypatch.setattr(autofill_module, "fetch_tenrai_anime_data", fetch)
    monkeypatch.setattr(autofill_module, "download_cover_image", download)
    return calls


def _entry(db_session, **fields) -> models.Hentai:
    entry = models.Hentai(hentai_name_cn="Zvornik Tenrai", mal_id=188, **fields)
    db_session.add(entry)
    db_session.flush()
    return entry


def test_fills_the_three_fields(db_session, tenrai):
    entry = _entry(db_session)
    autofill_hentai_from_mal(entry, db=db_session)
    assert entry.airing_status == "Finished Airing"
    assert entry.release_date == "1998-09-25"
    assert entry.cover_image_file == f"hentai/{entry.system_id}.jpg"
    assert tenrai["download"] == [("https://cdn.test/188.jpg", "hentai")]


def test_never_overwrites_what_is_already_there(db_session, tenrai):
    entry = _entry(
        db_session,
        airing_status="Airing",
        release_date="1998",
    )
    entry.cover_image_file = "hand/picked.jpg"
    autofill_hentai_from_mal(entry, db=db_session)
    assert entry.airing_status == "Airing"
    assert entry.release_date == "1998"
    assert entry.cover_image_file == "hand/picked.jpg"
    assert tenrai["download"] == []


def _reference_urls(db_session, entry) -> dict:
    return {
        option.value: row.url
        for row, option in db_session.query(models.MediaSource, models.SystemOption)
        .join(
            models.SystemOption,
            models.SystemOption.system_id == models.MediaSource.option_id,
        )
        .filter(
            models.MediaSource.media_id == entry.system_id,
            models.MediaSource.kind == "reference",
            models.MediaSource.bucket == "main",
        )
    }


def test_writes_the_official_site_and_twitter_rows(db_session, tenrai):
    entry = _entry(db_session)
    autofill_hentai_from_mal(entry, db=db_session)
    db_session.flush()
    assert _reference_urls(db_session, entry) == {
        OFFICIAL_SITE_VALUE: "https://official.test/188",
        TWITTER_VALUE: "https://twitter.com/rx188",
    }


def test_an_existing_reference_row_is_not_overwritten(db_session, tenrai):
    entry = _entry(db_session)
    option = models.SystemOption(category="Reference Source", value=OFFICIAL_SITE_VALUE)
    db_session.add(option)
    db_session.flush()
    db_session.add(
        models.MediaSource(
            media_id=entry.system_id,
            kind="reference",
            bucket="main",
            option_id=option.system_id,
            url="https://mine.test",
        )
    )
    db_session.flush()

    autofill_hentai_from_mal(entry, db=db_session)
    db_session.flush()

    urls = _reference_urls(db_session, entry)
    assert urls[OFFICIAL_SITE_VALUE] == "https://mine.test"
    # The mirror: the same run did write the row that was missing.
    assert urls[TWITTER_VALUE] == "https://twitter.com/rx188"


def test_writes_nothing_it_was_not_asked_for(db_session, tenrai):
    """No names, studio, scores or AniList: the owner asked for three fields
    and the two reference links."""
    entry = _entry(db_session)
    autofill_hentai_from_mal(entry, db=db_session)
    assert entry.hentai_name_en is None
    assert not hasattr(entry, "mal_rating")
    assert (
        db_session.query(models.MediaCredit)
        .filter_by(media_id=entry.system_id)
        .count()
        == 0
    )


def test_no_mal_id_fetches_nothing(db_session, tenrai):
    entry = models.Hentai(hentai_name_cn="Zvornik Unlinked")
    db_session.add(entry)
    db_session.flush()
    autofill_hentai_from_mal(entry, db=db_session)
    assert tenrai["fetch"] == []
    assert entry.airing_status is None


def test_the_pipeline_spec_paces_like_anime_and_keys_on_mal():
    spec = PIPELINES["hentai"]
    anime = PIPELINES["anime"]
    assert spec.fill_sleep == anime.fill_sleep
    assert spec.replace_sleep == anime.replace_sleep
    assert spec.replace_select is not None
    assert spec.in_fill_all and spec.in_replace_all


def test_fill_eligibility_follows_the_three_fields(db_session):
    eligible = PIPELINES["hentai"].fill_eligible
    missing = _entry(db_session)
    assert eligible(db_session, missing)
    complete = _entry(db_session, airing_status="Airing", release_date="2024")
    complete.cover_image_file = "x.jpg"
    assert not eligible(db_session, complete)
    unlinked = models.Hentai(hentai_name_cn="Zvornik No Link")
    assert not eligible(db_session, unlinked)


def test_the_write_hook_fetches_from_the_link_and_keeps_the_label(
    admin_client, db_session, tenrai
):
    """Create with only a MAL link: the id is extracted, the three fields are
    filled by the single-entry hook, and the sync keeps the label on."""
    response = admin_client.post(
        "/api/hentai/",
        json={
            "hentai_name_cn": "Zvornik Hooked",
            "mal_link": "https://myanimelist.net/anime/188/Some_Title",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert tenrai["fetch"] == [188]
    assert body["mal_id"] == 188
    assert body["airing_status"] == "Finished Airing"
    assert body["release_date"] == "1998-09-25"
    entry_id = uuid.UUID(body["system_id"])
    assert label_keys_for_entry(db_session, entry_id) == ["hentai"]
