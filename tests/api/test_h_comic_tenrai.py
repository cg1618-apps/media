"""
H-comic is filled from Tenrai's manga record for the columns it has:
serialization_status, release_date, end_date and the cover, all under
manga's rule (the columns fill-only, the cover only when the entry has none),
and ch_total on a finished KR entry alone.

The Tenrai fetch and the cover download are both patched out; no test here
reaches the network.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_h_comic_from_mal
from app.services.domain.content_labels import label_keys_for_entry
from app.services.pipelines.specs import PIPELINES

MANGA_RESULT = {
    "type": "Manhwa",
    "status": "Finished",
    "published": {
        "from": "2019-03-01T00:00:00+00:00",
        "to": "2021-06-01T00:00:00+00:00",
        "prop": {
            "from": {"day": 1, "month": 3, "year": 2019},
            "to": {"day": 1, "month": 6, "year": 2021},
        },
    },
    "score": 7.4,
    "rank": 4321,
    "chapters": 88,
    "volumes": 3,
    "images": {"jpg": {"image_url": "https://cdn.test/777.jpg"}},
    "titles": [{"type": "Default", "title": "Default Title"}],
}


@pytest.fixture
def tenrai(monkeypatch):
    """Stub the fetch and the download; record what was asked for."""
    calls = {"fetch": [], "download": []}

    def fetch(mal_id):
        calls["fetch"].append(mal_id)
        return MANGA_RESULT

    def download(url, owner_type, system_id):
        calls["download"].append((url, owner_type))
        return f"h-comic/{system_id}.jpg"

    monkeypatch.setattr(autofill_module, "fetch_tenrai_manga_novel_data", fetch)
    monkeypatch.setattr(autofill_module, "download_cover_image", download)
    return calls


def _entry(db_session, region="KR", **fields) -> models.HComic:
    entry = models.HComic(
        h_comic_name_cn="Zvornik Tenrai", region=region, mal_id=777, **fields
    )
    db_session.add(entry)
    db_session.flush()
    return entry


def test_fills_manga_columns_and_a_finished_kr_chapter_total(db_session, tenrai):
    entry = _entry(db_session)
    autofill_h_comic_from_mal(entry, db=db_session)
    assert entry.serialization_status == "完結"
    assert entry.release_date == "2019-03-01"
    assert entry.end_date == "2021-06-01"
    assert entry.ch_total == 88
    assert entry.cover_image_file == f"h-comic/{entry.system_id}.jpg"
    assert tenrai["download"] == [("https://cdn.test/777.jpg", "h-comic")]


def test_a_jp_entry_gets_no_chapter_total(db_session, tenrai):
    """JP counts pages. The mirror of the KR case above, with the same
    finished record, so the region is what refused."""
    entry = _entry(db_session, region="JP")
    autofill_h_comic_from_mal(entry, db=db_session)
    assert entry.serialization_status == "完結"
    assert entry.ch_total is None
    assert entry.page_total is None


def test_a_running_kr_entry_gets_no_chapter_total(db_session, tenrai):
    """Manga's rule: a running series' total stays blank."""
    entry = _entry(db_session, serialization_status="連載中")
    autofill_h_comic_from_mal(entry, db=db_session)
    assert entry.ch_total is None


def test_never_overwrites_what_is_already_there(db_session, tenrai):
    entry = _entry(
        db_session,
        serialization_status="腰斬",
        release_date="2018",
        end_date="2019",
        ch_total=12,
    )
    entry.cover_image_file = "hand/picked.jpg"
    autofill_h_comic_from_mal(entry, db=db_session)
    assert entry.serialization_status == "腰斬"
    assert entry.release_date == "2018"
    assert entry.end_date == "2019"
    assert entry.ch_total == 12
    assert entry.cover_image_file == "hand/picked.jpg"
    assert tenrai["download"] == []


def test_no_mal_id_fetches_nothing(db_session, tenrai):
    entry = models.HComic(h_comic_name_cn="Zvornik Unlinked", region="KR")
    db_session.add(entry)
    db_session.flush()
    autofill_h_comic_from_mal(entry, db=db_session)
    assert tenrai["fetch"] == []
    assert entry.serialization_status is None


def test_the_pipeline_spec_paces_like_manga_and_keys_on_mal():
    spec = PIPELINES["h-comic"]
    manga = PIPELINES["manga"]
    assert spec.fill_sleep == manga.fill_sleep
    assert spec.replace_sleep == manga.replace_sleep
    assert spec.replace_select is not None
    assert spec.in_fill_all and spec.in_replace_all


def test_fill_eligibility_follows_the_filled_columns(db_session):
    eligible = PIPELINES["h-comic"].fill_eligible
    assert eligible(db_session, _entry(db_session))

    complete = _entry(
        db_session,
        serialization_status="完結",
        release_date="2019",
        end_date="2021",
        ch_total=88,
    )
    complete.cover_image_file = "x.jpg"
    assert not eligible(db_session, complete)

    # The chapter total alone keeps a finished KR entry eligible...
    complete.ch_total = None
    assert eligible(db_session, complete)
    # ...and never a JP one, which has no chapters to fill.
    complete.region = "JP"
    assert not eligible(db_session, complete)

    unlinked = models.HComic(h_comic_name_cn="Zvornik No Link", region="KR")
    assert not eligible(db_session, unlinked)


def test_the_write_hook_fetches_from_the_link_and_keeps_the_label(
    admin_client, db_session, tenrai
):
    """Create with only a MAL link: the id is extracted, the columns are
    filled by the single-entry hook, and the sync keeps the label on."""
    response = admin_client.post(
        "/api/h-comic/",
        json={
            "h_comic_name_cn": "Zvornik Hooked",
            "region": "KR",
            "mal_link": "https://myanimelist.net/manga/777/Some_Title",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert tenrai["fetch"] == [777]
    assert body["mal_id"] == 777
    assert body["mal_link"] == "https://myanimelist.net/manga/777/Some_Title"
    assert body["serialization_status"] == "完結"
    assert body["ch_total"] == 88
    entry_id = uuid.UUID(body["system_id"])
    assert label_keys_for_entry(db_session, entry_id) == ["h-comic"]
