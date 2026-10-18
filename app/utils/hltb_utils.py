"""
hltb_utils.py
Pure helpers for the HowLongToBeat lookup: the game page URL, the comparison
key a title is matched on, and the rule that picks the one search result a
game is. No I/O lives here.
"""

import re
from typing import Any, Dict, Iterable, Optional

from app.utils.name_normalize import normalize_name, split_names

GAME_URL = "https://howlongtobeat.com/game/{game_id}"

# Dropped before NFKC, which would otherwise spell ™ out as "TM" and make
# "Portal™" a different key from "Portal".
_MARKS = str.maketrans("", "", "™®©")
# Everything that is not a letter or a digit, in any script.
_NOT_A_WORD_CHAR = re.compile(r"[\W_]+")


def hltb_link_for(game_id: int) -> str:
    """HowLongToBeat's page for one of its games."""
    return GAME_URL.format(game_id=int(game_id))


def hltb_match_key(name: Optional[str]) -> str:
    """
    The key two titles are compared on: normalize_name's width, case and
    whitespace folding, with punctuation and trademark signs dropped too -
    "The Witcher 3: Wild Hunt" and "the witcher 3 - wild hunt" are one title.
    Comparison only; nothing stores it.
    """
    if not name:
        return ""
    return _NOT_A_WORD_CHAR.sub("", normalize_name(str(name).translate(_MARKS)))


def _keys(names: Iterable[Optional[str]]) -> set[str]:
    return {key for key in (hltb_match_key(n) for n in names) if key}


def pick_hltb_game_id(
    candidates: Iterable[Dict[str, Any]],
    names: Iterable[Optional[str]],
    year: Optional[int],
) -> Optional[int]:
    """
    The HowLongToBeat game_id a game is, out of one search's `data`, or None.

    A wrong link is worse than no link, so only exactly one candidate passes:

    1. A candidate whose own `game_name` equals one of the game's names on
       hltb_match_key. Only when none does is `game_alias` - a
       comma-separated list - consulted the same way, so another entry
       listing our title as an alias cannot make an exact name ambiguous.
    2. More than one candidate left, and the release year known: keep the
       ones whose `release_world` is that year. The year breaks ties and
       nothing else - a lone exact match is kept even when its year
       differs, because HowLongToBeat's worldwide year and this collection's
       release_date disagree often enough (a JP release a year early) that
       refusing on it would lose more right links than wrong ones.
    3. One game_id left is the answer; none, or several, is None.
    """
    wanted = _keys(names)
    if not wanted:
        return None

    candidates = [c for c in candidates if c.get("game_id")]
    pool = [c for c in candidates if hltb_match_key(c.get("game_name")) in wanted]
    if not pool:
        pool = [
            c
            for c in candidates
            if _keys(split_names(c.get("game_alias"))) & wanted
        ]

    ids = {int(c["game_id"]) for c in pool}
    if len(ids) > 1 and year:
        ids = {int(c["game_id"]) for c in pool if c.get("release_world") == year}

    return ids.pop() if len(ids) == 1 else None
