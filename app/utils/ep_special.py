"""
Anime's `ep_special`: where a special sits among the episodes, as text.

Specials are numbered `0`, `14.5`, `17.5A`, `17.5B`, so the column is a
string. It is a label: shown as written and compared by equality only (the
anime duplicate key). Nothing sorts it or does arithmetic on it.

One rule makes a value canonical wherever it arrives - the API, a Sheets
cell, and the revision that converted the old floats: a plain number is
written in its shortest form (`17.0` -> `17`, `17.50` -> `17.5`, `007` ->
`7`), and anything else is kept as typed, trimmed. A blank is None.
"""

import re
from typing import Any, Optional

_PLAIN_NUMBER = re.compile(r"^(\d+)(?:\.(\d+))?$")


def normalize_ep_special(value: Any) -> Optional[str]:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        # A float arrives from a client or a cell written while the column
        # was one. repr is the shortest form that reads back as the same
        # float, so 14.5 is "14.5" and never "14.500000001".
        value = repr(float(value))
    raw = str(value).strip()
    if not raw:
        return None
    match = _PLAIN_NUMBER.match(raw)
    if match is None:
        return raw
    whole = str(int(match.group(1)))
    fraction = (match.group(2) or "").rstrip("0")
    return f"{whole}.{fraction}" if fraction else whole
