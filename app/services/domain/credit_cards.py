"""
The card a credited entry is drawn with on a studio, publisher or person page.

A studio's and a publisher's page draw each entry they are credited on as that
type's library card without the tracker, and every one of the three pages
sorts its credits by release date, my rating and the public rating (MAL, or
Metacritic on a game). So each entry carries the few columns those cards and
sorts read, beside the cover and name every credit list has always carried -
not the whole entry, which the page never draws.

The viewer's own rating comes from their list row (attach_list_fields), so a
viewer reads their own rating and never another account's; with nobody
asking it is None. A column the viewer's access mode withholds
(field_gate.gated_columns) is left out, as the entry's own page leaves it out.
"""

from typing import Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.services.domain.user_list import acting_user_id, attach_list_fields
from app.services.rbac.enforcement import filter_visible_pairs
from app.services.rbac.field_gate import gated_columns
from app.utils.media_resolver import MEDIA_TABLES
from app.utils.release_date import primary_release_value

# What the cards read, beyond the name, the cover and the primary release
# value: the anime's airing type and the anime movie's release type (the
# cover's corner label), the anime's season and its JP / TW dates (its
# release line), and the two public ratings. A type without one of these
# columns does not send it.
CARD_COLUMNS: tuple[str, ...] = (
    "airing_type",
    "release_type",
    "release_season",
    "release_date_jp",
    "release_date_tw",
    "mal_rating",
    "metacritic_score",
)


def credit_cards(db: Session, viewer, media_type: str, entries: Iterable) -> dict[UUID, dict]:
    """`entries` (all of `media_type`) as card payloads, keyed by system_id."""
    entries = list(entries)
    if not entries:
        return {}
    attach_list_fields(db, media_type, entries, acting_user_id(db, viewer))
    withheld = set(gated_columns(viewer, media_type))
    model = MEDIA_TABLES[media_type].model
    columns = [c for c in CARD_COLUMNS if c not in withheld and hasattr(model, c)]
    return {
        entry.system_id: {
            "system_id": str(entry.system_id),
            "display_name": entry.display_name,
            "public_id": entry.public_id,
            "cover_image_file": getattr(entry, "cover_image_file", None),
            "cover_image_focus": getattr(entry, "cover_image_focus", None),
            "release_date": primary_release_value(media_type, entry),
            "my_rating": getattr(entry, "my_rating", None),
            **{column: getattr(entry, column) for column in columns},
        }
        for entry in entries
    }


def company_credit_groups(db: Session, viewer, credit_column, company_id: UUID) -> list[dict]:
    """
    The entries a studio or publisher is credited on, as
    [{"media_type", "label", "nav_path", "entries": [card, ...]}], one group
    per media type in MEDIA_TABLES order, each newest first.

    `credit_column` is the media_credit column that names the company
    (MediaCredit.studio_id or MediaCredit.publisher_id). Visibility runs
    through the same filter_visible_pairs call the company's credit_count
    uses, so the number on its card and the list on its page can never
    disagree.
    """
    rows = (
        db.query(models.Media.media_type, models.MediaCredit.media_id)
        .join(models.Media, models.MediaCredit.media_id == models.Media.system_id)
        .filter(credit_column == company_id)
        .all()
    )
    visible = filter_visible_pairs(db, viewer, [(mt, eid) for mt, eid in rows if mt and eid])

    groups = []
    for media_type, ref in MEDIA_TABLES.items():
        ids = [eid for mt, eid in visible if mt == media_type]
        if not ids:
            continue
        entries = db.query(ref.model).filter(ref.model.system_id.in_(ids)).all()
        payload = list(credit_cards(db, viewer, media_type, entries).values())
        # Newest first; an undated entry sorts last, as UNDATED does elsewhere.
        payload.sort(key=lambda e: e["release_date"] or "", reverse=True)
        groups.append(
            {
                "media_type": media_type,
                "label": ref.label,
                "nav_path": ref.nav_path,
                "entries": payload,
            }
        )
    return groups
