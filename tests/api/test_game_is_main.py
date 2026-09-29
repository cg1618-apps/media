"""
`is_main` on game and h-game: its own Main / Remake / Remaster vocabulary.

The other types' `is_main` reads the shared IS_MAIN vocabulary (本傳 / 外傳 /
...). A game's answers a different question - is this the main release, or a
remake or remaster of one - so it has GAME_IS_MAIN instead, and has nothing to
do with the relation system or with game_type.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app.models.game import Game
from app.models.h_game import HGame
from app.services.domain.duplicates import find_duplicate_game, find_duplicate_h_game
from app.utils import constants as c
from app.utils.formatter import parse_game_from_sheet, parse_h_game_from_sheet

ROUTES = {
    "game": ("/api/game", "game_name_cn"),
    "h-game": ("/api/h-game", "h_game_name_cn"),
}


def test_the_vocabulary_is_main_remake_remaster():
    assert c.GAME_IS_MAIN == ("Main", "Remake", "Remaster")
    # The shared vocabulary the other types read is untouched.
    assert "Main" not in c.IS_MAIN


def test_constants_serves_both_vocabularies(client):
    body = client.get("/api/constants").json()
    assert body["game_is_main"] == list(c.GAME_IS_MAIN)
    assert body["is_main"] == list(c.IS_MAIN)


# ---------------------------------------------------------------------------
# Writes through the API
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("media_type", ["game", "h-game"])
@pytest.mark.parametrize("value", ["Main", "Remake", "Remaster"])
def test_each_value_round_trips(admin_client, media_type, value):
    route, name = ROUTES[media_type]
    created = admin_client.post(f"{route}/", json={name: "Title", "is_main": value})
    assert created.status_code == 201, created.text
    assert created.json()["is_main"] == value

    fetched = admin_client.get(f"{route}/{created.json()['public_id']}").json()
    assert fetched["is_main"] == value


@pytest.mark.parametrize("media_type", ["game", "h-game"])
def test_it_is_optional(admin_client, media_type):
    route, name = ROUTES[media_type]
    created = admin_client.post(f"{route}/", json={name: "Title"})
    assert created.status_code == 201, created.text
    assert created.json()["is_main"] is None


@pytest.mark.parametrize("media_type", ["game", "h-game"])
@pytest.mark.parametrize("value", ["本傳", "DLC", "main"])
def test_a_value_outside_the_vocabulary_is_refused_on_create(
    admin_client, media_type, value
):
    # 本傳 is the shared vocabulary's, and DLC is game_type's: neither belongs
    # to this column.
    route, name = ROUTES[media_type]
    response = admin_client.post(f"{route}/", json={name: "Title", "is_main": value})
    assert response.status_code == 422


@pytest.mark.parametrize("media_type", ["game", "h-game"])
def test_a_value_outside_the_vocabulary_is_refused_on_update(admin_client, media_type):
    route, name = ROUTES[media_type]
    created = admin_client.post(f"{route}/", json={name: "Title", "is_main": "Main"})
    assert created.status_code == 201, created.text
    response = admin_client.put(
        f"{route}/{created.json()['system_id']}", json={"is_main": "外傳"}
    )
    assert response.status_code == 422
    # The mirror: a value inside it is accepted on the same route.
    ok = admin_client.put(
        f"{route}/{created.json()['system_id']}", json={"is_main": "Remake"}
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["is_main"] == "Remake"


def test_the_h_game_tracker_patch_checks_it_too(admin_client):
    # PATCH has no request schema; the h-game progress hook checks every
    # h-game vocabulary on it, is_main included.
    route, name = ROUTES["h-game"]
    created = admin_client.post(f"{route}/", json={name: "Title"}).json()
    refused = admin_client.patch(f"{route}/{created['system_id']}", json={"is_main": "外傳"})
    assert refused.status_code == 422
    ok = admin_client.patch(f"{route}/{created['system_id']}", json={"is_main": "Remaster"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["is_main"] == "Remaster"


# ---------------------------------------------------------------------------
# Sheets
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("parse", [parse_game_from_sheet, parse_h_game_from_sheet])
def test_the_sheet_parser_keeps_a_known_value(parse):
    assert parse({"is_main": "Remake"})["is_main"] == "Remake"


@pytest.mark.parametrize("parse", [parse_game_from_sheet, parse_h_game_from_sheet])
def test_the_sheet_parser_drops_an_unknown_value(parse):
    # A restore must not abort a whole tab over one hand-typed cell.
    assert parse({"is_main": "本傳"})["is_main"] is None
    assert parse({})["is_main"] is None


# ---------------------------------------------------------------------------
# Duplicates
# ---------------------------------------------------------------------------


class _StubQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._rows


class _StubSession:
    def __init__(self, rows):
        self._rows = rows

    def query(self, _model):
        return _StubQuery(self._rows)


FRANCHISE = uuid.uuid4()


def test_a_remake_never_collides_with_its_original_game():
    # A remake usually shares its original's name exactly.
    rows = [
        Game(system_id=uuid.uuid4(), franchise_id=FRANCHISE, game_type="Base Game",
             game_name_en="Resident Evil 2", is_main="Main"),
        Game(system_id=uuid.uuid4(), franchise_id=FRANCHISE, game_type="Base Game",
             game_name_en="Resident Evil 2", is_main="Remake"),
    ]
    assert find_duplicate_game(_StubSession(rows)) == []
    # The mirror: the same two with one answer ARE a duplicate.
    rows[1].is_main = "Main"
    assert len(find_duplicate_game(_StubSession(rows))) == 1


def test_a_remaster_never_collides_with_its_original_h_game():
    rows = [
        HGame(system_id=uuid.uuid4(), franchise_id=FRANCHISE, game_type="Base Game",
              h_game_name_en="Title", is_main="Main"),
        HGame(system_id=uuid.uuid4(), franchise_id=FRANCHISE, game_type="Base Game",
              h_game_name_en="Title", is_main="Remaster"),
    ]
    assert find_duplicate_h_game(_StubSession(rows)) == []
    rows[1].is_main = "Main"
    [cluster] = find_duplicate_h_game(_StubSession(rows))
    assert {row["is_main"] for row in cluster} == {"Main"}
