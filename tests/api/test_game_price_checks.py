"""
The System page's two game list-price checks.

check/free-games-with-list-price lists every game and h-game the caller holds
a Free copy of whose list price (price_original_us/jp/tw) is not exactly zero
in all three regions, and calculate/zero-free-games-list-price zeroes the
ticked ones. check/bought-copies-without-list-price lists every copy the
caller Bought whose game has no list price anywhere - NULL or zero in all
three, the rule the game spend page's `listPrice` applies.

Both read the CALLER's copies only: a copy is a purchase record and belongs
to its owner. Every scoping test seeds a second account's copy, which is what
gives the filter something to refuse.

Copies are seeded as rows rather than through the entry form: the form writes
a copy only for an account holding `self.list`, which is a question for
test_game_copy_is_personal.py, not this file.

Requires PostgreSQL (media_test DB).
"""

import uuid
from decimal import Decimal

import pytest

from app import models
from app.services.security import get_password_hash
from tests.api.conftest import role_id_for

FREE_SCAN = "/api/data-control/check/free-games-with-list-price"
FREE_ZERO = "/api/data-control/calculate/zero-free-games-list-price"
BOUGHT_SCAN = "/api/data-control/check/bought-copies-without-list-price"


def _game(client, name, **prices):
    response = client.post("/api/game/", json={"game_name_en": name, **prices})
    assert response.status_code == 201, response.text
    return response.json()


def _h_game(client, name, **prices):
    response = client.post("/api/h-game/", json={"h_game_name_en": name, **prices})
    assert response.status_code == 201, response.text
    return response.json()


def _copy(db_session, user, entry, acquisition, storefront="Steam", **fields):
    copy = models.GameCopy(
        system_id=uuid.uuid4(),
        user_id=user.id,
        game_id=uuid.UUID(entry["system_id"]),
        storefront=storefront,
        copy_format="Digital",
        ownership="Owned",
        acquisition=acquisition,
        **fields,
    )
    db_session.add(copy)
    db_session.flush()
    return copy


@pytest.fixture
def other_user(db_session):
    user = models.User(
        id=uuid.uuid4(),
        username="price_check_other",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db_session, "guest"),
    )
    db_session.add(user)
    db_session.flush()
    return user


def _ids(rows):
    return {row["system_id"] for row in rows}


# ---------------------------------------------------------------------------
# Free copies with a list price
# ---------------------------------------------------------------------------


def test_free_scan_lists_a_free_game_whose_prices_are_not_all_zero(
    admin_client, db_session, admin_user
):
    null_prices = _game(admin_client, "Star Rail")
    _copy(db_session, admin_user, null_prices, "Free", "Other")
    priced = _h_game(admin_client, "Priced H", price_original_jp="1200")
    _copy(db_session, admin_user, priced, "Free")
    zeroed = _game(
        admin_client,
        "Already Zero",
        price_original_us="0",
        price_original_jp="0",
        price_original_tw="0",
    )
    _copy(db_session, admin_user, zeroed, "Free")
    bought = _game(admin_client, "Bought One")
    _copy(db_session, admin_user, bought, "Bought")

    body = admin_client.get(FREE_SCAN).json()

    assert _ids(body["entries"]) == {null_prices["system_id"], priced["system_id"]}
    assert body["count"] == 2
    row = next(r for r in body["entries"] if r["system_id"] == null_prices["system_id"])
    assert row == {
        "system_id": null_prices["system_id"],
        "public_id": null_prices["public_id"],
        "media_type": "game",
        "name": "Star Rail",
        "price_original_us": None,
        "price_original_jp": None,
        "price_original_tw": None,
        "storefronts": ["Other"],
    }
    h_row = next(r for r in body["entries"] if r["system_id"] == priced["system_id"])
    assert h_row["media_type"] == "h-game"
    assert Decimal(h_row["price_original_jp"]) == Decimal("1200")


def test_free_scan_ignores_another_accounts_free_copy(
    admin_client, db_session, admin_user, other_user
):
    """The other account's Free copy is what the filter refuses; the
    caller's own Free copy of a second game is the mirror."""
    theirs = _game(admin_client, "Their Free Game")
    _copy(db_session, other_user, theirs, "Free")
    mine = _game(admin_client, "My Free Game")
    _copy(db_session, admin_user, mine, "Free")

    body = admin_client.get(FREE_SCAN).json()

    assert _ids(body["entries"]) == {mine["system_id"]}


def test_zero_sets_all_three_list_prices_and_skips_what_no_longer_qualifies(
    admin_client, db_session, admin_user
):
    """The refusal needs a ticked entry that does NOT qualify - a game with
    only a Bought copy - to bite; the Free one beside it is the mirror."""
    free = _game(admin_client, "Free To Play", price_original_us="19.99")
    _copy(db_session, admin_user, free, "Free")
    bought = _game(admin_client, "Paid For", price_original_us="29.99")
    _copy(db_session, admin_user, bought, "Bought")

    r = admin_client.post(
        FREE_ZERO, json={"system_ids": [free["system_id"], bought["system_id"]]}
    )

    assert r.status_code == 200, r.text
    assert r.json()["updated_count"] == 1
    assert r.json()["skipped_count"] == 1
    db_session.expire_all()
    zeroed = db_session.get(models.Game, uuid.UUID(free["system_id"]))
    assert (
        zeroed.price_original_us,
        zeroed.price_original_jp,
        zeroed.price_original_tw,
    ) == (0, 0, 0)
    untouched = db_session.get(models.Game, uuid.UUID(bought["system_id"]))
    assert untouched.price_original_us == Decimal("29.99")

    log = (
        db_session.query(models.DataControlLog)
        .filter(models.DataControlLog.action_specific == "Zero Free Games' List Price")
        .one()
    )
    assert log.status == "Success"
    assert log.rows_updated == 1


def test_zero_reaches_an_h_game(admin_client, db_session, admin_user):
    free = _h_game(admin_client, "Free H")
    _copy(db_session, admin_user, free, "Free")

    r = admin_client.post(FREE_ZERO, json={"system_ids": [free["system_id"]]})

    assert r.json()["updated_count"] == 1
    db_session.expire_all()
    entry = db_session.get(models.HGame, uuid.UUID(free["system_id"]))
    assert entry.price_original_tw == 0


def test_zero_skips_an_entry_only_another_account_holds_free(
    admin_client, db_session, other_user
):
    theirs = _game(admin_client, "Their Free", price_original_us="5.00")
    _copy(db_session, other_user, theirs, "Free")

    r = admin_client.post(FREE_ZERO, json={"system_ids": [theirs["system_id"]]})

    assert r.json()["updated_count"] == 0
    db_session.expire_all()
    entry = db_session.get(models.Game, uuid.UUID(theirs["system_id"]))
    assert entry.price_original_us == Decimal("5.00")


# ---------------------------------------------------------------------------
# Bought copies with no list price
# ---------------------------------------------------------------------------


def test_bought_scan_lists_copies_whose_game_has_no_list_price_anywhere(
    admin_client, db_session, admin_user
):
    unpriced = _game(admin_client, "Switch Exclusive")
    copy = _copy(
        db_session,
        admin_user,
        unpriced,
        "Bought",
        "Nintendo eShop",
        price_paid=Decimal("59.99"),
        price_currency="USD",
    )
    zero_priced = _h_game(
        admin_client, "Zero Priced H", price_original_us="0", price_original_jp="0"
    )
    _copy(db_session, admin_user, zero_priced, "Bought", "Other")
    one_region = _game(admin_client, "Has JP Price", price_original_jp="6800")
    _copy(db_session, admin_user, one_region, "Bought")
    free = _game(admin_client, "Free Unpriced")
    _copy(db_session, admin_user, free, "Free")

    body = admin_client.get(BOUGHT_SCAN).json()

    assert _ids(body["copies"]) == {unpriced["system_id"], zero_priced["system_id"]}
    assert body["count"] == 2
    row = next(r for r in body["copies"] if r["system_id"] == unpriced["system_id"])
    assert row == {
        "copy_id": str(copy.system_id),
        "system_id": unpriced["system_id"],
        "public_id": unpriced["public_id"],
        "media_type": "game",
        "name": "Switch Exclusive",
        "storefront": "Nintendo eShop",
        "copy_format": "Digital",
        "price_paid": "59.99",
        "price_currency": "USD",
    }
    h_row = next(r for r in body["copies"] if r["system_id"] == zero_priced["system_id"])
    assert h_row["media_type"] == "h-game"
    assert h_row["price_paid"] is None


def test_bought_scan_ignores_another_accounts_copy(
    admin_client, db_session, admin_user, other_user
):
    theirs = _game(admin_client, "Their Purchase")
    _copy(db_session, other_user, theirs, "Bought")
    mine = _game(admin_client, "My Purchase")
    _copy(db_session, admin_user, mine, "Bought")

    body = admin_client.get(BOUGHT_SCAN).json()

    assert _ids(body["copies"]) == {mine["system_id"]}
