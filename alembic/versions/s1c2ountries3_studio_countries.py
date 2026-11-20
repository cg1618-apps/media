"""A studio may name several countries

`studio.country` (one free-text value) becomes `studio.countries`, a JSONB
list of names in the order they were given, NULL when none is known. Each
existing non-blank country becomes a one-element list, trimmed.

The studio form's saved defaults (system_configs `form_defaults:studio`) carry
the same field under its old name, so a stored `country` default is renamed
`countries` - its value unchanged: the form holds the list as comma-separated
text, as every tags field does, so one country is already a valid list - and
an autofill list naming `country` names `countries`.

Downgrade joins the list back into one comma-separated value, so nothing a
studio holds is lost on the way down.

Revision ID: s1c2ountries3
Revises: f1r2elation3
Create Date: 2026-11-20 00:00:00.000000

"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "s1c2ountries3"
down_revision: Union[str, Sequence[str], None] = "f1r2elation3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULTS_KEY = "form_defaults:studio"


def _rename_default(bind, old: str, new: str) -> None:
    """Rename the studio form's stored `old` default to `new`, value unchanged."""
    row = bind.execute(
        sa.text("SELECT config_value FROM system_configs WHERE config_key = :key"),
        {"key": DEFAULTS_KEY},
    ).first()
    if row is None:
        return
    try:
        blob = json.loads(row[0])
    except (TypeError, ValueError):
        return
    if not isinstance(blob, dict):
        return
    changed = False
    defaults = blob.get("defaults")
    if isinstance(defaults, dict) and old in defaults:
        defaults[new] = defaults.pop(old)
        changed = True
    autofill = blob.get("autofill")
    if isinstance(autofill, list) and old in autofill:
        blob["autofill"] = [new if field == old else field for field in autofill]
        changed = True
    if changed:
        bind.execute(
            sa.text(
                "UPDATE system_configs SET config_value = :value WHERE config_key = :key"
            ),
            {"value": json.dumps(blob, ensure_ascii=False), "key": DEFAULTS_KEY},
        )


def upgrade() -> None:
    op.add_column(
        "studio",
        sa.Column("countries", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.execute(
        "UPDATE studio SET countries = jsonb_build_array(btrim(country)) "
        "WHERE country IS NOT NULL AND btrim(country) <> ''"
    )
    op.drop_column("studio", "country")
    _rename_default(op.get_bind(), "country", "countries")


def downgrade() -> None:
    op.add_column("studio", sa.Column("country", sa.String(), nullable=True))
    op.execute(
        "UPDATE studio SET country = ("
        "SELECT string_agg(value, ', ' ORDER BY ordinality) "
        "FROM jsonb_array_elements_text(countries) WITH ORDINALITY AS t(value, ordinality)"
        ") WHERE countries IS NOT NULL AND jsonb_array_length(countries) > 0"
    )
    op.drop_column("studio", "countries")
    _rename_default(op.get_bind(), "countries", "country")
