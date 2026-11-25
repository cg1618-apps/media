"""A book's region is named in Chinese

The owner's request: a book's region reads 歐美, 日本, 中國, 韓國 and 台灣
instead of Western, JP, CN, KR and TW - in the data, not only on screen.
Every book row holding one of the five codes takes its Chinese name, and so
do the two stored configs that can hold a book region: the book form's
default (`form_defaults:book`, its `defaults.region`) and the book random
picker's filter (`random_picker_defaults:book`, its `filters.region` list).
A value outside the five codes, and an empty region, are left as they are.

Pull maps a sheet backed up before this revision the same way
(legacy_names.BOOK_REGION_RENAMES), so an older backup restores in the new
spelling.

Reversible: the downgrade maps the five names back to the codes.

Revision ID: b1o2okregion3
Revises: r1e2lcascade3
"""

import json
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b1o2okregion3"
down_revision: Union[str, Sequence[str], None] = "r1e2lcascade3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Kept here rather than imported, so the revision means the same thing
# whatever the vocabulary later becomes.
TO_CHINESE: dict[str, str] = {
    "Western": "歐美",
    "JP": "日本",
    "CN": "中國",
    "KR": "韓國",
    "TW": "台灣",
}
TO_CODES: dict[str, str] = {v: k for k, v in TO_CHINESE.items()}

_FORM_DEFAULTS_KEY = "form_defaults:book"
_PICKER_KEY = "random_picker_defaults:book"


def rename_regions(bind, mapping: dict[str, str]) -> None:
    """Rewrite every book region, and the two book configs, through `mapping`."""
    for old, new in mapping.items():
        bind.execute(
            sa.text("UPDATE book SET region = :new WHERE region = :old"),
            {"old": old, "new": new},
        )

    rows = bind.execute(
        sa.text(
            "SELECT config_key, config_value FROM system_configs "
            "WHERE config_key IN (:form, :picker)"
        ),
        {"form": _FORM_DEFAULTS_KEY, "picker": _PICKER_KEY},
    ).all()
    for key, raw in rows:
        try:
            value = json.loads(raw)
        except (TypeError, ValueError):
            continue
        changed = False
        if key == _FORM_DEFAULTS_KEY:
            defaults = value.get("defaults") if isinstance(value, dict) else None
            region = defaults.get("region") if isinstance(defaults, dict) else None
            if region in mapping:
                defaults["region"] = mapping[region]
                changed = True
        else:
            filters = value.get("filters") if isinstance(value, dict) else None
            regions = filters.get("region") if isinstance(filters, dict) else None
            if isinstance(regions, list) and any(r in mapping for r in regions):
                filters["region"] = [mapping.get(r, r) for r in regions]
                changed = True
        if changed:
            bind.execute(
                sa.text("UPDATE system_configs SET config_value = :v WHERE config_key = :k"),
                {"v": json.dumps(value, ensure_ascii=False), "k": key},
            )


def upgrade() -> None:
    rename_regions(op.get_bind(), TO_CHINESE)


def downgrade() -> None:
    rename_regions(op.get_bind(), TO_CODES)
