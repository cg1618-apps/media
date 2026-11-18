"""
Every progress count and total is a float.

`ep_fin`, `ep_total`, `ep_previous`, `issue_fin`, `issue_total`, `page_fin`,
`page_total`, and manga's and H-Comic's `ch_total` and manga's `vol_total`
hold a fraction - 2.5 episodes, 17.5 chapters - as `vol_fin`, `ch_fin` and the
book counters always have. Every way a value arrives keeps it: the API, the
viewer's own list row, a Sheets cell, and the Fill/Replace sanity clamp.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest
from pydantic import ValidationError

from app import models
from app.schemas.anime import AnimeCreate, AnimeResponse, AnimeUpdate
from app.schemas.cartoon import CartoonCreate
from app.schemas.comic import ComicCreate
from app.schemas.h_comic import HComicCreate
from app.schemas.hentai import HentaiCreate
from app.schemas.manga import MangaCreate
from app.schemas.tv_show import TVShowCreate
from app.services.rbac.permissions import PERM_SELF_LIST
from app.services.rbac.seed import default_guest_permissions
from app.utils.formatter import (
    parse_anime_from_sheet,
    parse_cartoon_from_sheet,
    parse_comic_from_sheet,
    parse_h_comic_from_sheet,
    parse_hentai_from_sheet,
    parse_manga_from_sheet,
    parse_tv_show_from_sheet,
    parse_user_media_list_from_sheet,
)
from tests.api.conftest import make_viewer

# Every (schema, field) the change covers. Manga's vol_fin / ch_fin and
# H-Comic's ch_fin were float columns already and int in the schema.
SCHEMA_FIELDS = [
    (AnimeCreate, "ep_previous"),
    (AnimeCreate, "ep_total"),
    (AnimeCreate, "ep_fin"),
    (TVShowCreate, "ep_total"),
    (TVShowCreate, "ep_fin"),
    (CartoonCreate, "ep_total"),
    (CartoonCreate, "ep_fin"),
    (HentaiCreate, "ep_total"),
    (HentaiCreate, "ep_fin"),
    (ComicCreate, "issue_total"),
    (ComicCreate, "issue_fin"),
    (MangaCreate, "vol_total"),
    (MangaCreate, "vol_fin"),
    (MangaCreate, "ch_total"),
    (MangaCreate, "ch_fin"),
    (HComicCreate, "page_total"),
    (HComicCreate, "page_fin"),
    (HComicCreate, "ch_total"),
    (HComicCreate, "ch_fin"),
]

SHEET_FIELDS = [
    (parse_anime_from_sheet, "ep_previous"),
    (parse_anime_from_sheet, "ep_total"),
    (parse_tv_show_from_sheet, "ep_total"),
    (parse_cartoon_from_sheet, "ep_total"),
    (parse_hentai_from_sheet, "ep_total"),
    (parse_comic_from_sheet, "issue_total"),
    (parse_manga_from_sheet, "vol_total"),
    (parse_manga_from_sheet, "ch_total"),
    (parse_h_comic_from_sheet, "page_total"),
    (parse_h_comic_from_sheet, "ch_total"),
]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


# What a write needs besides the field under test: H-Comic requires its region.
REQUIRED = {HComicCreate: {"region": "JP"}}


@pytest.mark.parametrize("schema, field", SCHEMA_FIELDS)
def test_a_schema_keeps_a_fraction(schema, field):
    body = schema(**REQUIRED.get(schema, {}), **{field: 2.5})
    assert getattr(body, field) == 2.5


@pytest.mark.parametrize("schema, field", SCHEMA_FIELDS)
def test_a_schema_still_refuses_what_is_not_a_number(schema, field):
    """Mirror of the above: the field is still validated, so the acceptance
    is the type's doing and not an untyped field letting anything through.
    The error must be the field's own - a write refused for a missing region
    would pass this without the field being checked at all."""
    with pytest.raises(ValidationError) as refused:
        schema(**REQUIRED.get(schema, {}), **{field: "two and a half"})
    assert [error["loc"] for error in refused.value.errors()] == [(field,)]


def test_the_cumulative_episodes_add_fractions():
    body = AnimeResponse.model_construct(ep_previous=12.5, ep_total=13.5, ep_fin=2.5)
    assert body.cum_ep_fin == 15.0
    assert body.cum_ep_total == 26.0


def test_an_update_takes_a_fractional_total():
    assert AnimeUpdate(ep_total=24.5).ep_total == 24.5


# ---------------------------------------------------------------------------
# The API
# ---------------------------------------------------------------------------


def test_an_anime_stores_fractional_totals(owner_client):
    created = owner_client.post(
        "/api/anime/",
        json={"anime_name_cn": "半集", "ep_previous": 12.5, "ep_total": 13.5},
    )
    assert created.status_code == 201, created.text
    fetched = owner_client.get(f"/api/anime/{created.json()['public_id']}").json()
    assert fetched["ep_previous"] == 12.5
    assert fetched["ep_total"] == 13.5
    assert fetched["cum_ep_total"] == 26.0


@pytest.fixture
def half_season(db_session, sample_franchise):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Half Season",
        airing_type="TV",
        airing_status="Currently Airing",
        ep_total=12.5,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def member(db_session, client):
    return make_viewer(
        db_session, client, "float-member", default_guest_permissions() | {PERM_SELF_LIST}
    )


def _put(client, entry, **payload):
    response = client.put(f"/api/me/list/{entry.system_id}", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_the_viewers_row_keeps_a_fractional_episode(client, member, half_season):
    body = _put(client, half_season, watching_status="Watching", ep_fin=2.5)
    assert body["ep_fin"] == 2.5
    assert body["watching_status"] == "Watching"


def test_reaching_a_fractional_total_finishes_the_row(client, member, half_season):
    _put(client, half_season, watching_status="Watching", ep_fin=12)
    body = _put(client, half_season, ep_fin=12.5)
    assert body["watching_status"] == "Completed"


def test_half_an_episode_short_of_the_total_does_not_finish(client, member, half_season):
    """Mirror: 12 of 12.5 is not the total, which an integer total of 12
    would have made it."""
    body = _put(client, half_season, watching_status="Watching", ep_fin=12)
    assert body["watching_status"] == "Watching"


# ---------------------------------------------------------------------------
# Sheets
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("parser, field", SHEET_FIELDS)
def test_pull_reads_a_fractional_cell(parser, field):
    assert parser({field: "2.5"})[field] == 2.5


@pytest.mark.parametrize("parser, field", SHEET_FIELDS)
def test_pull_reads_an_old_whole_cell(parser, field):
    # A Backup taken while the column was an integer wrote 12.
    assert parser({field: "12"})[field] == 12.0


@pytest.mark.parametrize("field", ["ep_fin", "issue_fin", "page_fin"])
def test_pull_reads_a_fractional_list_cell(field):
    raw = {"media_type": "anime", "public_id": "1", "username": "someone", field: "2.5"}
    assert parse_user_media_list_from_sheet(raw)[field] == 2.5


def test_vol_fin_page_stays_a_whole_page():
    """Mirror: the one counter beside these that is not a float."""
    raw = {"media_type": "manga", "public_id": "1", "username": "someone", "vol_fin_page": "12.7"}
    assert parse_user_media_list_from_sheet(raw)["vol_fin_page"] == 12

