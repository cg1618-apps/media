"""
A studio's countries: free text, any number, in the order given.

One rule for every way a list arrives - the API's write schemas and a Sheets
Pull - so a studio reads the same whichever wrote it.
"""

import json
from typing import Any, Optional


def clean_countries(value: Any) -> Optional[list[str]]:
    """
    The stored form of `value`: each name trimmed, blanks and repeats dropped
    (the first spelling of a name kept, compared case-insensitively), and None
    when nothing is left - never [].

    Accepts a list, or a string: a JSON list (what Backup writes) or a
    comma-separated list (one value, as a backup taken before a studio could
    hold several carries it, or a hand edit).
    """
    if value is None:
        return None
    if isinstance(value, str):
        raw = value.strip()
        if raw.startswith("["):
            try:
                value = json.loads(raw)
            except ValueError:
                value = raw.strip("[]").split(",")
        else:
            value = raw.split(",")
    if not isinstance(value, (list, tuple)):
        value = [value]
    seen: set[str] = set()
    out: list[str] = []
    for item in value:
        if item is None:
            continue
        name = str(item).strip()
        key = name.casefold()
        if name and key not in seen:
            seen.add(key)
            out.append(name)
    return out or None
