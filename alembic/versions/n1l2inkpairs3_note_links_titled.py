"""Every note link becomes a titled pair; seven sections change what a row holds

Every link a note row holds becomes a `{"text": str | null, "url": str}` pair,
whatever its section: the song lists already stored pairs, and every other
section moves from URL strings to pairs with no text. Beside that, the
sections whose rows change what they carry are reshaped so that no row keeps a
value in a column its section no longer draws (`_validate_structured` refuses
such a row on its next edit, on a field nobody can see):

  controls, classes, geography, episode_comments
          lose their links. Each link is appended to the row's description
          (episode_comments: its text), one per line - "title: url" when the
          pair had a title, the URL alone otherwise - and `links` is cleared.
  links   every URL string in `note.links`, on every row, becomes a pair with
          a null text. Pairs, JSON null, SQL NULL and [] are left as they are.
  main_plot, side_plot
          lose their description. A row with a description takes it as its
          chapter, and its old chapter becomes the first link's title - when
          the row has a link and that link has no title. Otherwise the
          description is appended to the chapter after " — ". `content` is
          cleared.
  character_arcs
          becomes titled links and nothing else. A row's description (with
          any locator or title it carried, joined by " — ") becomes the first
          link's title, or is appended to it after " — " when it already has
          one. A row with text and no link has nowhere to keep it, so it moves
          to 其他 Other (story_other) of the same game, at the end, its text
          prefixed "【角色劇情】 ".
  trivia  becomes structured: title, description, links. The description
          stays `content`; a locator (no editor ever offered one) becomes the
          title.

Revision ID: n1l2inkpairs3
Revises: g1c2onsoles3
Create Date: 2026-11-16 00:00:00.000000

"""

import json
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "n1l2inkpairs3"
down_revision: Union[str, Sequence[str], None] = "g1c2onsoles3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Descriptions moved into chapters and link titles, links folded into
# descriptions and character arcs moved into 其他 cannot be told apart from
# text somebody typed there, so a downgrade cannot put them back. It does turn
# the pairs back into URL strings, which is what the older code reads.
irreversible = True

# Frozen copies of the registry as this revision found it - no app imports.
LOSE_LINKS = ("controls", "classes", "geography", "episode_comments")
PLOT = ("main_plot", "side_plot")
ARCS = "character_arcs"
ARCS_FALLBACK = "story_other"
ARCS_PREFIX = "【角色劇情】 "
TRIVIA = "trivia"
SEPARATOR = " — "
# The sections that stored pairs before this revision; the downgrade leaves
# them as pairs.
SONG_LISTS = ("op", "ed", "insert_songs", "ost")


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


def _text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _pair(link):
    """One stored link as a pair: a URL string gains a null text."""
    if isinstance(link, str):
        return {"text": None, "url": link}
    return link


def _line(link) -> str:
    """One link as a line of text: its title before its URL, if it has one."""
    if isinstance(link, dict):
        url, title = _text(link.get("url")), _text(link.get("text"))
        if url and title:
            return f"{title}: {url}"
        return url or title
    return _text(link)


def _set(bind, system_id, **columns) -> None:
    assigns = ", ".join(
        f"{c} = CAST(:{c} AS jsonb)" if c == "links" else f"{c} = :{c}"
        for c in columns
    )
    params = {
        c: (json.dumps(v, ensure_ascii=False) if c == "links" and v is not None else v)
        for c, v in columns.items()
    }
    bind.execute(
        sa.text(f"UPDATE note SET {assigns} WHERE system_id = :id"),
        {**params, "id": system_id},
    )


def fold_links_into_text(bind) -> None:
    """The four sections losing their links keep them as lines of text."""
    rows = bind.execute(
        sa.text(
            "SELECT system_id, content, links FROM note "
            "WHERE section = ANY(CAST(:sections AS text[])) "
            "AND jsonb_typeof(links) = 'array' AND links <> '[]'::jsonb"
        ),
        {"sections": list(LOSE_LINKS)},
    ).fetchall()
    for row in rows:
        lines = [line for line in map(_line, _as_list(row.links)) if line]
        body = _text(row.content)
        text = "\n".join(([body] if body else []) + lines)
        _set(bind, row.system_id, content=text or None, links=None)


def links_to_pairs(bind) -> None:
    """Every URL string in every row's links becomes a pair with no text."""
    bind.execute(
        sa.text(
            """
            UPDATE note SET links = (
                SELECT jsonb_agg(
                    CASE WHEN jsonb_typeof(t.e) = 'string'
                         THEN jsonb_build_object('text', NULL, 'url', t.e)
                         ELSE t.e END
                    ORDER BY t.ord)
                  FROM jsonb_array_elements(note.links) WITH ORDINALITY AS t(e, ord)
            )
            WHERE jsonb_typeof(links) = 'array'
              AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(note.links) AS s(e)
                   WHERE jsonb_typeof(s.e) = 'string'
              )
            """
        )
    )


def plot_description_to_chapter(bind) -> None:
    """main_plot / side_plot: the description becomes the chapter."""
    rows = bind.execute(
        sa.text(
            "SELECT system_id, locator, content, links FROM note "
            "WHERE section = ANY(CAST(:sections AS text[])) "
            "AND content IS NOT NULL AND btrim(content) <> ''"
        ),
        {"sections": list(PLOT)},
    ).fetchall()
    for row in rows:
        description = _text(row.content)
        chapter = _text(row.locator)
        links = [_pair(link) for link in _as_list(row.links)]
        first = links[0] if links and isinstance(links[0], dict) else None
        if first is not None and not _text(first.get("text")):
            links[0] = {**first, "text": chapter or None}
            locator = description
        else:
            locator = f"{chapter}{SEPARATOR}{description}" if chapter else description
        _set(
            bind,
            row.system_id,
            locator=locator,
            content=None,
            links=links if row.links is not None else None,
        )


def arcs_to_titled_links(bind) -> None:
    """character_arcs: the row's text becomes its first link's title."""
    rows = bind.execute(
        sa.text(
            "SELECT system_id, media_id, title, locator, content, links FROM note "
            "WHERE section = :section AND ("
            "  (content IS NOT NULL AND btrim(content) <> '')"
            "  OR (locator IS NOT NULL AND btrim(locator) <> '')"
            "  OR (title IS NOT NULL AND btrim(title) <> ''))"
        ),
        {"section": ARCS},
    ).fetchall()
    for row in rows:
        text = SEPARATOR.join(
            part for part in map(_text, (row.title, row.locator, row.content)) if part
        )
        links = [_pair(link) for link in _as_list(row.links)]
        if links and isinstance(links[0], dict):
            existing = _text(links[0].get("text"))
            links[0] = {
                **links[0],
                "text": f"{existing}{SEPARATOR}{text}" if existing else text,
            }
            _set(
                bind, row.system_id, title=None, locator=None, content=None, links=links
            )
            continue
        # Nowhere to keep text without a link: 其他 Other keeps it, at the end.
        last = bind.execute(
            sa.text(
                "SELECT max(sort_index) FROM note "
                "WHERE section = :section AND media_id = :media_id"
            ),
            {"section": ARCS_FALLBACK, "media_id": row.media_id},
        ).scalar()
        _set(
            bind,
            row.system_id,
            section=ARCS_FALLBACK,
            title=None,
            locator=None,
            content=ARCS_PREFIX + text,
            links=None,
            sort_index=(last or 0) + 1,
        )


def trivia_locator_to_title(bind) -> None:
    """trivia: structured now, so an old locator becomes the empty title."""
    bind.execute(
        sa.text(
            "UPDATE note SET title = locator, locator = NULL "
            "WHERE section = :section AND locator IS NOT NULL "
            "AND btrim(locator) <> '' AND (title IS NULL OR btrim(title) = '')"
        ),
        {"section": TRIVIA},
    )


def pairs_to_urls(bind) -> None:
    """The downgrade's half: pairs back to URL strings outside the songs."""
    bind.execute(
        sa.text(
            """
            UPDATE note SET links = COALESCE((
                SELECT jsonb_agg(
                    CASE WHEN jsonb_typeof(t.e) = 'object' THEN t.e -> 'url'
                         ELSE t.e END
                    ORDER BY t.ord)
                  FROM jsonb_array_elements(note.links) WITH ORDINALITY AS t(e, ord)
                 WHERE jsonb_typeof(t.e) <> 'object'
                    OR btrim(COALESCE(t.e ->> 'url', '')) <> ''
            ), '[]'::jsonb)
            WHERE jsonb_typeof(links) = 'array'
              AND NOT (section = ANY(CAST(:songs AS text[])))
              AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(note.links) AS s(e)
                   WHERE jsonb_typeof(s.e) = 'object'
              )
            """
        ),
        {"songs": list(SONG_LISTS)},
    )


def upgrade() -> None:
    bind = op.get_bind()
    fold_links_into_text(bind)
    links_to_pairs(bind)
    plot_description_to_chapter(bind)
    arcs_to_titled_links(bind)
    trivia_locator_to_title(bind)


def downgrade() -> None:
    # See `irreversible` above: only the link shape goes back.
    pairs_to_urls(op.get_bind())
