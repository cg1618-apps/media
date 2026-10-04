"""The 評論 Reviews sections become text plus any number of links

評論 Reviews and Comments, 優點 Advantages, 缺點 Disadvantages and 優缺點
were plain `text`, and 大眾評價 Public Reviews was `text_or_link` - a row held
text or one link, never both. All five are `text_links` now: a body and a list
of URLs, the shape 介紹 Introduction, 各集評論 Episode Comments and 解析
Analysis already have. 我的評價 Personal Reviews stays plain text.

The columns do not change - every shape stores its body in `content` and its
URLs in `links` - so the rows are valid as they stand. What this revision
tidies is what the old shapes forced on them:

- a URL typed into the body, because the section had nowhere else to put it
  (a public review's title with its link pasted after it), moves out of
  `content` and into `links`, where it renders as a link;
- an empty `links` is stored three ways - SQL NULL, JSON null and `[]` - and
  becomes `[]`, which is what the page writes for a row with no links.

Revision ID: r2v3textlink4
Revises: s1e2iyuudrop3
Create Date: 2026-10-04 00:00:00.000000

"""

import json
import re
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r2v3textlink4"
down_revision: Union[str, Sequence[str], None] = "s1e2iyuudrop3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Not `irreversible`, so the platform's automatic rollback stays available.
# No column changes, and the previous code reads these rows as they are: a
# text section keeps the links it does not draw, and a public review with both
# a body and links draws its first link - nothing is lost, only not shown until
# the code comes forward again. What a downgrade cannot do is put a moved
# URL back into the body - nothing tells it from one added as a link - so it
# leaves the rows as they are, and an upgrade after it finds nothing to move.

SECTIONS = (
    "reviews_and_comments",
    "advantages",
    "disadvantages",
    "double_edged",
    "public_reviews",
)

# A URL runs to the next whitespace. Punctuation that closes the sentence
# around it is not part of it.
_URL = re.compile(r"https?://\S+")
_TRAILING = ".,;:!?)]}>\"'。，；：！？）】」』》"


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


def split_urls(content):
    """
    `content` with every URL taken out, and the URLs in the order they appear.

    Each URL goes with the spaces before it, so "see https://x." reads
    "see." and not "see ."; a line that held nothing but URLs goes, and a
    body left with nothing is None.
    """
    if not content:
        return None, []
    urls = []

    def take(match):
        url = match.group(0)
        stripped = url.rstrip(_TRAILING)
        urls.append(stripped)
        # A marker where the URL was, so the spaces before it can go too.
        return "\0" + url[len(stripped) :]

    lines = []
    for line in content.splitlines():
        rest = _URL.sub(take, line)
        rest = re.sub(r"[ \t]*\0", "", rest)
        rest = re.sub(r"[ \t]{2,}", " ", rest).strip()
        if rest or not _URL.search(line):
            lines.append(rest)
    body = "\n".join(lines).strip()
    return body or None, urls


def reshape(bind) -> None:
    """
    The migration, against any bind.

    Split out so tests can run the SHIPPED statements against the test
    session - the suite has no Alembic harness.
    """
    rows = bind.execute(
        sa.text("SELECT system_id, content, links FROM note WHERE section IN :sections").bindparams(
            sa.bindparam("sections", expanding=True)
        ),
        {"sections": list(SECTIONS)},
    ).fetchall()

    for row in rows:
        links = [
            link.strip() for link in _as_list(row.links) if isinstance(link, str) and link.strip()
        ]
        content, moved = split_urls(row.content)
        for url in moved:
            if url not in links:
                links.append(url)
        bind.execute(
            sa.text(
                "UPDATE note SET content = :content, links = CAST(:links AS JSONB) "
                "WHERE system_id = :id"
            ),
            {"id": row.system_id, "content": content, "links": json.dumps(links)},
        )


def upgrade() -> None:
    reshape(op.get_bind())


def downgrade() -> None:
    # See the note above `SECTIONS`: no schema to restore, and the rows are
    # left as the upgrade left them.
    pass
