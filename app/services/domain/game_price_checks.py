"""
Two list-price checks over the caller's game copies - the System page's
Free Games With a List Price and Bought Copies Without a List Price.

A game's list price is its three `price_original_*` columns (US, JP, TW), the
undiscounted storefront price Steam fills. Both checks read those and nothing
else: the current-price columns say what a game costs today, which is no part
of either question.

Zero and NULL mean different things to the two checks, deliberately:

  * A FREE copy's game should read exactly 0 in all three regions - recorded
    as costing nothing. NULL there is "never filled in", so it is listed.
  * A BOUGHT copy's game has no list price when every region is NULL or 0.
    That is the game spend page's rule (`listPrice` in
    frontend/src/pages/statistics/gameSpend.js): a zero list price on a
    bought game is a column nobody filled, not a free game, and the copy has
    no "should spend" figure.

Both read the CALLER's copies only. A copy is a purchase record and belongs
to its owner (`attach_own_copies`), and the spend page these checks feed
counts the acting user's copies. The zero fix still writes the shared
catalogue columns - a list price is a fact about the game - but only on an
entry the caller holds a Free copy of.

Games and h-games both carry copies (`game_copy.game_id` is `media.system_id`
for either) and both carry the three columns, so each check runs over both
tables. An h-game row comes back like any other; the page shows it only to a
session that may see the type.
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, exists, func, or_
from sqlalchemy.orm import Session

from app.models import Game, GameCopy, HGame

LIST_PRICE_COLUMNS = ("price_original_us", "price_original_jp", "price_original_tw")

# (media type key, model) for every table a copy can hang off.
_COPY_OWNERS: tuple[tuple[str, type], ...] = (("game", Game), ("h-game", HGame))

_ZERO = Decimal("0")


def _money(value) -> str | None:
    """A Numeric as the string the entry API sends, or None."""
    return None if value is None else str(value)


def _not_all_zero(model):
    """True unless all three list prices are exactly 0; NULL is not 0."""
    return or_(
        *(
            or_(getattr(model, c).is_(None), getattr(model, c) != 0)
            for c in LIST_PRICE_COLUMNS
        )
    )


def _no_list_price(model):
    """True when every region's list price is NULL or 0."""
    return and_(
        *(func.coalesce(getattr(model, c), 0) == 0 for c in LIST_PRICE_COLUMNS)
    )


def _free_copy(model, user_id):
    return and_(
        GameCopy.game_id == model.system_id,
        GameCopy.user_id == user_id,
        GameCopy.acquisition == "Free",
    )


def _free_with_list_price(db: Session, model, user_id):
    return db.query(model).filter(
        exists().where(_free_copy(model, user_id)), _not_all_zero(model)
    )


def find_free_games_with_list_price(db: Session, user_id) -> dict:
    """
    Every game and h-game the caller holds a Free copy of whose list price is
    not exactly 0 in all three regions, sorted by name.

    Read-only. One row per entry; `storefronts` names where the Free copies
    are, since one game can be free on two stores. A caller with no account
    (`user_id` None) holds no copies, so the list is empty.
    """
    rows = []
    if user_id is not None:
        for media_type, model in _COPY_OWNERS:
            entries = _free_with_list_price(db, model, user_id).all()
            storefronts: dict = {}
            if entries:
                for game_id, storefront in (
                    db.query(GameCopy.game_id, GameCopy.storefront)
                    .filter(
                        GameCopy.game_id.in_([e.system_id for e in entries]),
                        GameCopy.user_id == user_id,
                        GameCopy.acquisition == "Free",
                    )
                    .order_by(GameCopy.position)
                ):
                    storefronts.setdefault(game_id, []).append(storefront)
            rows.extend(
                {
                    "system_id": str(entry.system_id),
                    "public_id": entry.public_id,
                    "media_type": media_type,
                    "name": entry.display_name,
                    **{c: _money(getattr(entry, c)) for c in LIST_PRICE_COLUMNS},
                    "storefronts": storefronts.get(entry.system_id, []),
                }
                for entry in entries
            )
    rows.sort(key=lambda r: (r["name"].casefold(), r["media_type"]))
    return {"status": "success", "entries": rows, "count": len(rows)}


def zero_free_games_list_price(db: Session, user_id, system_ids: list[UUID]) -> dict:
    """
    Set all three list prices to 0 on the named entries that STILL qualify.

    The list is what the admin ticked; whether each one still qualifies - a
    Free copy held by the caller, a list price not already all zero - is
    re-derived here. One that no longer does is skipped and counted.
    """
    wanted = set(system_ids)
    updated = 0
    if wanted and user_id is not None:
        for _, model in _COPY_OWNERS:
            entries = (
                _free_with_list_price(db, model, user_id)
                .filter(model.system_id.in_(wanted))
                .all()
            )
            for entry in entries:
                for column in LIST_PRICE_COLUMNS:
                    setattr(entry, column, _ZERO)
            updated += len(entries)
        db.commit()

    skipped = len(wanted) - updated
    message = f"Set the list price to 0 on {updated} free game{'s' if updated != 1 else ''}."
    if skipped:
        message += f" Skipped {skipped} no longer qualifying or already gone."
    return {
        "status": "success",
        "message": message,
        "updated_count": updated,
        "skipped_count": skipped,
    }


def find_bought_copies_without_list_price(db: Session, user_id) -> dict:
    """
    Every copy the caller Bought whose game has no list price in any region,
    sorted by name and then storefront.

    Read-only, one row per COPY rather than per game: it is the copy that
    goes unpriced on the spend page. That page counts only copies with a
    price paid; this lists every bought copy, so one with no price paid yet
    shows up here too, with `price_paid` None.
    """
    rows = []
    if user_id is not None:
        for media_type, model in _COPY_OWNERS:
            found = (
                db.query(GameCopy, model)
                .join(model, model.system_id == GameCopy.game_id)
                .filter(
                    GameCopy.user_id == user_id,
                    GameCopy.acquisition == "Bought",
                    _no_list_price(model),
                )
                .all()
            )
            rows.extend(
                {
                    "copy_id": str(copy.system_id),
                    "system_id": str(entry.system_id),
                    "public_id": entry.public_id,
                    "media_type": media_type,
                    "name": entry.display_name,
                    "storefront": copy.storefront,
                    "copy_format": copy.copy_format,
                    "price_paid": _money(copy.price_paid),
                    "price_currency": copy.price_currency,
                }
                for copy, entry in found
            )
    rows.sort(
        key=lambda r: (r["name"].casefold(), r["media_type"], r["storefront"] or "")
    )
    return {"status": "success", "copies": rows, "count": len(rows)}
