"""彩蛋 Easter Eggs becomes text plus any number of URL links

彩蛋 was a `structured` section whose links were text-and-URL pairs,
`{"text": str | None, "url": str}`. It is `text_links` now, like every other
section of 解析: an episode in `locator`, a description in `content` and URL
strings in `links`. The song lists are the only sections left holding pairs.

`locator` and `content` mean the same thing in both shapes and are left as
they are. What this revision rewrites, on 彩蛋 rows only:

- `links` becomes the list of each pair's URL, in order. **A pair's text is
  lost** - text_links has nowhere to keep it. A pair with a blank URL goes, an
  exact repeat goes, and no links at all is stored as `[]`;
- `fields` becomes NULL. The structured editor wrote an empty object there,
  and text_links refuses any `fields` on the merged row a PATCH validates, so
  leaving it would make every old row unsaveable.

Revision ID: e4s5teggurl6
Revises: c1h2artags3
Create Date: 2026-10-04 00:00:00.000000

"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e4s5teggurl6"
down_revision: Union[str, Sequence[str], None] = "c1h2artags3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Not `irreversible`, so the platform's automatic rollback stays available.
# The downgrade turns each URL back into a pair with no text, which the
# previous code's validator accepts; the text the upgrade dropped does not
# come back. A row written after the upgrade with links and no description
# reads back under the previous code but must gain a description before it
# saves again there, since the structured 彩蛋 required one.

SECTION = "easter_eggs"


def _as_list(raw):
    """A JSONB column comes back as a list or, on some drivers, as text."""
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return []
    return raw if isinstance(raw, list) else []


def urls_of(links):
    """Each link's URL, in order, once each; blanks dropped."""
    urls = []
    for link in _as_list(links):
        url = link.get("url") if isinstance(link, dict) else link
        if isinstance(url, str):
            url = url.strip()
            if url and url not in urls:
                urls.append(url)
    return urls


def _rows(bind):
    return bind.execute(
        sa.text("SELECT system_id, links FROM note WHERE section = :section"),
        {"section": SECTION},
    ).fetchall()


def reshape(bind) -> None:
    """
    The upgrade, against any bind.

    Split out so tests can run the SHIPPED statements against the test
    session - the suite has no Alembic harness.
    """
    for row in _rows(bind):
        bind.execute(
            sa.text(
                "UPDATE note SET links = CAST(:links AS JSONB), fields = NULL "
                "WHERE system_id = :id"
            ),
            {"id": row.system_id, "links": json.dumps(urls_of(row.links))},
        )


def unshape(bind) -> None:
    """The downgrade, against any bind: URLs back into pairs with no text."""
    for row in _rows(bind):
        pairs = [{"text": None, "url": url} for url in urls_of(row.links)]
        bind.execute(
            sa.text("UPDATE note SET links = CAST(:links AS JSONB) WHERE system_id = :id"),
            {"id": row.system_id, "links": json.dumps(pairs)},
        )


def upgrade() -> None:
    reshape(op.get_bind())


def downgrade() -> None:
    unshape(op.get_bind())
