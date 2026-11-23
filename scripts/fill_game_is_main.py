# -*- coding: utf-8 -*-
"""
Sets every Game entry's `is_main` (Main / Remake / Remaster) to "Main".

By default only rows whose `is_main` is empty - NULL or blank - are filled; a
row already marked Remake or Remaster keeps its value. `--overwrite` sets
every row to "Main" regardless.

Idempotent: a second run finds nothing to fill. Dry run is the default;
nothing changes without --apply.

Usage:

    venv/Scripts/python.exe -m scripts.fill_game_is_main
    venv/Scripts/python.exe -m scripts.fill_game_is_main --apply
    venv/Scripts/python.exe -m scripts.fill_game_is_main --overwrite --apply
"""

import argparse
import sys

from app.database import SessionLocal
from app.models import Game
from app.utils.constants import GAME_IS_MAIN

MAIN = GAME_IS_MAIN[0]


def needs_fill(current: str | None, overwrite: bool) -> bool:
    """Whether a row holding `current` is to be set to MAIN."""
    if current == MAIN:
        return False
    return overwrite or not (current or "").strip()


def fill(db, *, overwrite: bool = False, apply: bool = False) -> list[tuple]:
    """
    Set MAIN on every Game row that needs it. Returns one
    (system_id, game_name_en, previous is_main) per row, read before the write
    so the report survives the commit expiring the rows.
    """
    rows = [g for g in db.query(Game).all() if needs_fill(g.is_main, overwrite)]
    report = [(g.system_id, g.game_name_en, g.is_main) for g in rows]
    if apply and rows:
        for game in rows:
            game.is_main = MAIN
        db.commit()
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0].strip())
    parser.add_argument("--apply", action="store_true", help="write the change")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="also replace Remake / Remaster, not just empty values",
    )
    args = parser.parse_args(argv)

    db = SessionLocal()
    try:
        changed = fill(db, overwrite=args.overwrite, apply=args.apply)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    # Names carry accents and CJK; a Windows console codepage cannot encode
    # them all, and the report must not crash after the write has committed.
    sys.stdout.reconfigure(errors="replace")
    for system_id, name, previous in changed:
        print(f"  {system_id}  {name or '(no name)'}  {previous!r} -> {MAIN!r}")
    verb = "Set" if args.apply else "Would set"
    print(f"{verb} is_main = {MAIN!r} on {len(changed)} game(s).")
    if not args.apply and changed:
        print("Dry run - re-run with --apply to write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
