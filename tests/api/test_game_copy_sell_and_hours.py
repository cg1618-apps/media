"""
A game copy records what it sold for and how long it was played.

`sell_price` / `sell_currency` mirror `price_paid` / `price_currency`, and
`hours_played` is decimal hours. They are records only: nothing rolls them up
into the game's own `hours_played`, and the spend statistics do not read them.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid
from decimal import Decimal

import pytest

from app import models
from app.services.pipelines import pull
from app.services.pipelines.tabs import SHEET_TABS
from app.utils.formatter import parse_game_copy_from_sheet

COPY = {
    "storefront": "Steam",
    "ownership": "Owned",
    "copy_format": "Digital",
    "acquisition": "Bought",
    "price_paid": "19.99",
    "price_currency": "USD",
    "sell_price": "7.50",
    "sell_currency": "EUR",
    "hours_played": 12.5,
    "position": 1,
}


@pytest.fixture
def game_with_a_sold_copy(owner_client):
    response = owner_client.post(
        "/api/game/",
        json={"game_name_en": "Resold Sentinel", "hours_played": 3, "copies": [COPY]},
    )
    assert response.status_code == 201, response.text
    return response.json()


class TestTheApi:
    def test_the_three_fields_round_trip(self, owner_client, game_with_a_sold_copy):
        body = owner_client.get(f"/api/game/{game_with_a_sold_copy['system_id']}").json()
        (copy,) = body["copies"]
        assert Decimal(str(copy["sell_price"])) == Decimal("7.50")
        assert copy["sell_currency"] == "EUR"
        assert copy["hours_played"] == 12.5

    def test_an_update_changes_them(self, owner_client, game_with_a_sold_copy):
        game_id = game_with_a_sold_copy["system_id"]
        (copy,) = game_with_a_sold_copy["copies"]
        edited = {**COPY, "system_id": copy["system_id"], "hours_played": 40.25,
                  "sell_price": None, "sell_currency": None}
        response = owner_client.put(f"/api/game/{game_id}", json={"copies": [edited]})
        assert response.status_code == 200, response.text
        (copy,) = owner_client.get(f"/api/game/{game_id}").json()["copies"]
        assert copy["hours_played"] == 40.25
        assert copy["sell_price"] is None and copy["sell_currency"] is None

    def test_copy_hours_do_not_roll_up_into_the_game(
        self, owner_client, game_with_a_sold_copy
    ):
        """No business logic: the game keeps its own figure, 3, not 12.5."""
        body = owner_client.get(f"/api/game/{game_with_a_sold_copy['system_id']}").json()
        assert body["hours_played"] == 3


GAME_COPY_TAB = next(t for t in SHEET_TABS if t.name == "Game Copy")


class TestSheets:
    def test_backup_writes_the_new_headers(self):
        headers = [
            c.name
            for c in GAME_COPY_TAB.model.__table__.columns
            if c.name not in GAME_COPY_TAB.drop_columns
        ]
        assert {"sell_price", "sell_currency", "hours_played"} <= set(headers)

    def test_the_parser_reads_them(self):
        parsed = parse_game_copy_from_sheet(
            {"sell_price": "7.5", "sell_currency": "EUR", "hours_played": "12.5"}
        )
        assert parsed["sell_price"] == Decimal("7.5")
        assert parsed["sell_currency"] == "EUR"
        assert parsed["hours_played"] == 12.5

    def test_a_row_without_them_parses_to_none(self):
        parsed = parse_game_copy_from_sheet({"storefront": "Steam"})
        assert (parsed["sell_price"], parsed["sell_currency"], parsed["hours_played"]) == (
            None, None, None,
        )

    @pytest.mark.parametrize("with_new_columns", [False, True])
    def test_pull_restores_an_older_and_a_newer_sheet(
        self, db_session, monkeypatch, owner_user, with_new_columns
    ):
        game = models.Game(system_id=uuid.uuid4(), game_name_en="Sheet Sentinel")
        db_session.add(game)
        db_session.flush()

        # The headers a Backup wrote before these columns existed.
        headers = [
            "system_id", "game_id", "storefront", "ownership", "copy_format",
            "acquisition", "price_paid", "price_currency", "acquired_date",
            "remark", "position",
        ]
        row = [
            str(uuid.uuid4()), str(game.system_id), "Steam", "Owned", "Digital",
            "Bought", "25.49", "USD", "2024-06-12", "", "1",
        ]
        if with_new_columns:
            headers += ["sell_price", "sell_currency", "hours_played"]
            row += ["10", "USD", "8.5"]
        monkeypatch.setattr(
            pull, "get_all_raw_rows", lambda tab: {"Game Copy": [headers, row]}[tab]
        )

        result = pull.execute_pull_specific(db_session, "Game Copy", log_action=False)

        assert result["status"] == "success", result
        (copy,) = db_session.query(models.GameCopy).filter_by(game_id=game.system_id).all()
        assert copy.price_paid == Decimal("25.49")
        if with_new_columns:
            assert (copy.sell_price, copy.sell_currency, copy.hours_played) == (
                Decimal("10"), "USD", 8.5,
            )
        else:
            assert (copy.sell_price, copy.sell_currency, copy.hours_played) == (
                None, None, None,
            )
