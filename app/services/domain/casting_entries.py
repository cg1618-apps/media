"""
The entries a set of cast rows appears in, grouped by media type, for one viewer.

What a character page and an identity page list under "appears in": the
reverse of an entry's cast table. Both callers choose their rows - every cast
row of a character, or only the ones naming one identity - and hand them here,
so the visibility rule and the card shape cannot drift apart between them.
"""

from typing import Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.services.rbac.enforcement import (
    filter_visible_pairs,
    label_hidden_entry_ids,
)
from app.utils.media_resolver import MEDIA_TABLES
from app.utils.release_date import primary_release_value


def casting_entry_groups(
    db: Session, viewer, rows: Iterable[models.CharacterCasting]
) -> list[dict]:
    """
    `rows`' entries as [{"media_type", "nav_path", "entries": [...]}], each
    group newest first.

    A cast row on a label-hidden entry is omitted whole, group and all; a row
    withheld only by a media-type permission gap keeps its group, empty,
    because that gap does not hide the connection. Visibility runs through the
    same filter_visible_pairs call the character's casting_count uses, so the
    number on the card and the list on the page can never disagree.
    """
    rows = list(rows)
    visible = set(
        filter_visible_pairs(
            db,
            viewer,
            [(r.media_type, r.entry_id) for r in rows if r.media_type and r.entry_id],
        )
    )
    label_hidden = label_hidden_entry_ids(db, viewer, [r.entry_id for r in rows])
    rows = [r for r in rows if r.entry_id not in label_hidden]

    # One query per media type that appears, not one per casting row.
    wanted: dict[str, set[UUID]] = {}
    for row in rows:
        if (row.media_type, row.entry_id) in visible:
            wanted.setdefault(row.media_type, set()).add(row.entry_id)
    loaded: dict[str, dict[UUID, object]] = {}
    for media_type, ids in wanted.items():
        ref = MEDIA_TABLES.get(media_type)
        if ref is None:
            continue
        loaded[media_type] = {
            entry.system_id: entry
            for entry in db.query(ref.model)
            .filter(ref.model.system_id.in_(ids))
            .all()
        }

    # person_id -> Person, for the seiyuu display_name/system_id on each entry.
    person_ids = {v.person_id for r in rows for v in r.voices}
    people = {
        p.system_id: p
        for p in db.query(models.Person).filter(models.Person.system_id.in_(person_ids))
    } if person_ids else {}

    identity_ids = {r.identity_id for r in rows if r.identity_id}
    identities = {
        i.system_id: i
        for i in db.query(models.CharacterIdentity).filter(
            models.CharacterIdentity.system_id.in_(identity_ids)
        )
    } if identity_ids else {}

    groups: dict[str, list] = {}
    for row in rows:
        if row.media_type not in MEDIA_TABLES:
            continue
        # setdefault before the visibility check on purpose: a group whose
        # entries are withheld only by a media-type gap still exists, empty.
        # Label-hidden rows were dropped above and make no group at all.
        payload = groups.setdefault(row.media_type, [])
        entry = loaded.get(row.media_type, {}).get(row.entry_id)
        if entry is None:
            continue
        identity = identities.get(row.identity_id) if row.identity_id else None
        seiyuu = [
            (people[v.person_id], v.remark)
            for v in row.voices
            if v.person_id in people
        ]
        payload.append(
            {
                "system_id": str(entry.system_id),
                # One entry appears once per identity cast in it, so the
                # casting - not the entry - is what tells two cards apart.
                "casting_id": str(row.system_id),
                "identity_id": str(row.identity_id) if row.identity_id else None,
                "identity_name": identity.display_name if identity else None,
                "identity_public_id": identity.public_id if identity else None,
                "display_name": entry.display_name,
                "public_id": entry.public_id,
                "cover_image_file": getattr(entry, "cover_image_file", None),
                "cover_image_focus": getattr(entry, "cover_image_focus", None),
                "release_date": primary_release_value(row.media_type, entry),
                "seiyuu": [
                    {
                        "display_name": person.display_name,
                        "system_id": str(person.system_id),
                        "public_id": person.public_id,
                        "remark": remark,
                    }
                    for person, remark in seiyuu
                ],
            }
        )

    out = []
    for media_type, entries in groups.items():
        # Newest first; an undated entry sorts last, as UNDATED does elsewhere.
        entries.sort(key=lambda e: e["release_date"] or "", reverse=True)
        out.append(
            {
                "media_type": media_type,
                "nav_path": MEDIA_TABLES[media_type].nav_path,
                "entries": entries,
            }
        )
    return out
