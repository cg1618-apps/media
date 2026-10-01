"""
The shared image focal-point field type, mounted beside every cropped image.

Pages render covers, photos and logos cropped (CSS object-cover), which shows
the centre unless told otherwise. A focus is where to aim the crop instead,
stored as the CSS `object-position` value the SPA applies verbatim: "X% Y%",
each an integer 0-100 ("50% 20%" keeps the top of a portrait in frame).

NULL means centred, the default. A form's empty input arrives as "" and is
stored as NULL, so clearing the field is how a focus is removed.

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
FOCUS_PATTERN = re.compile(rf"{_PERCENT} {_PERCENT}")


def coerce_image_focus(value: Any) -> Optional[str]:
    """
    "X% Y%" unchanged, None or a blank string as None; anything else raises.

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
        "0-100, e.g. \"50% 20%\"."
    )


ImageFocus = Annotated[Optional[str], BeforeValidator(coerce_image_focus)]
