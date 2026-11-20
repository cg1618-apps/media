"""
The shared image focal-point field type, mounted beside every cropped image.

Pages render covers, photos and logos cropped (CSS object-cover), which shows
the centre unless told otherwise. A focus says how to frame the image instead,
in one of three forms, X and Y each an integer 0-100:

- "X% Y%"     fill the frame, aimed at X% Y% ("50% 20%" keeps the top of a
              portrait in frame). The SPA applies it as object-position.
- "X% Y% Z"   the same, zoomed in by Z: above 1 and at most 4, at most two
              decimals, no trailing zeros ("1.5", "2.25", "3"). Zoom 1 is
              written by leaving Z out, so "50% 20% 1" is refused.
- "X% Y% fit" the whole image, letterboxed, placed at X% Y% between the bars.

The SPA turns the value into CSS in one place, lib/covers.js focusStyle().

NULL means centred at zoom 1, the default; a fit focus is never NULL. A form's
empty input arrives as "" and is stored as NULL, so clearing the field is how a
focus is removed.

The field is named after the image column it qualifies, `_file` becoming
`_focus` (cover_image_file -> cover_image_focus, photo_file -> photo_focus,
logo_file -> logo_focus). "position" is avoided on purpose:
image_attachment.position already means ordering.
"""

import re
from typing import Annotated, Any, Optional

from pydantic import BeforeValidator

# One integer 0-100, no leading zeros, no decimals.
_PERCENT = r"(100|[1-9]?[0-9])%"
# A zoom above 1 and at most 4, at most two decimals, no trailing zeros.
_ZOOM = r"1\.(?:[1-9]|[0-9][1-9])|[23](?:\.(?:[1-9]|[0-9][1-9]))?|4"
FOCUS_PATTERN = re.compile(rf"{_PERCENT} {_PERCENT}(?: (?:{_ZOOM}|fit))?")


def coerce_image_focus(value: Any) -> Optional[str]:
    """
    A well-formed focus unchanged, None or a blank string as None; anything
    else raises.

    Exposed for callers outside a schema (the Sheets Pull parsers) so a bad
    cell is judged by the same rule as a bad form value.
    """
    if value is None:
        return None
    if isinstance(value, str):
        if not value.strip():
            return None
        if FOCUS_PATTERN.fullmatch(value):
            return value
    raise ValueError(
        f"{value!r} is not an image focus. Use \"X% Y%\" with whole numbers "
        "0-100, optionally followed by a zoom above 1 and at most 4 with at "
        "most two decimals or by \"fit\", e.g. \"50% 20%\", \"50% 20% 1.5\" "
        "or \"50% 50% fit\"."
    )


ImageFocus = Annotated[Optional[str], BeforeValidator(coerce_image_focus)]
