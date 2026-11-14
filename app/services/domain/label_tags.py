"""
A content label and its 標籤 Label tag, kept in step on an entry, both ways.

Three labels have a tag (app/services/rbac/labels.py, `tag`): `nsfw` NSFW,
`ecchi` 輕微色情, `erotica` 擦邊肉番. On an entry of a type with the Label field
(TAG_FIELDS["label"].media_types - the nine ungated types), attaching the label
adds the tag in the same write and adding the tag attaches the label; detaching
either removes the other. So a tag edit changes who can see the entry, exactly
as a label edit does - both are `manage.catalog` writes, gated on the entry.

The `nsfw` rule runs through it: adding 輕微色情 attaches `ecchi`, which
attaches `nsfw`, which adds the NSFW tag; removing the NSFW tag while
輕微色情 or 擦邊肉番 stays is refused, as detaching `nsfw` is.

The ENTRY'S OWN labels only - a group has no Label field, and an inherited
label is not the entry's to tag.

Where each direction runs:

  label write  routers/content_labels.replace_entry_labels -> tags_for_labels
  tag write    routers/credits.replace_entry_credits       -> apply_tag_write
  Pull         reconcile_label_tags, the label winning: it is the one that
               decides visibility, and a sheet's tag column is not evidence
               against the label tab
"""

from typing import Iterable, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.services.domain.label_rules import NSFW, with_required_labels
from app.services.rbac.labels import CONTENT_LABELS
from app.utils.credit_roles import TAG_FIELDS

LABEL_FIELD = "label"
LABEL_CATEGORY = TAG_FIELDS[LABEL_FIELD].category
LABEL_FIELD_TYPES: tuple[str, ...] = TAG_FIELDS[LABEL_FIELD].media_types

# {label key: tag value}, in the labels' display order.
TAG_FOR_LABEL: dict[str, str] = {
    label.key: label.tag for label in CONTENT_LABELS if label.tag
}
LABEL_FOR_TAG: dict[str, str] = {tag: key for key, tag in TAG_FOR_LABEL.items()}


def has_label_field(media_type: Optional[str]) -> bool:
    return media_type in LABEL_FIELD_TYPES


def tags_for_labels(tags: Iterable[str], label_keys: Iterable[str]) -> list[str]:
    """
    `tags` with the label tags made to match `label_keys`: a tag whose label
    is absent is dropped, a missing one is appended. Every other tag keeps
    its place.
    """
    wanted = {TAG_FOR_LABEL[key] for key in label_keys if key in TAG_FOR_LABEL}
    out = [tag for tag in tags if tag not in LABEL_FOR_TAG or tag in wanted]
    out += [
        tag for tag in TAG_FOR_LABEL.values() if tag in wanted and tag not in out
    ]
    return out


def labels_for_tags(label_keys: Iterable[str], tags: Iterable[str]) -> set[str]:
    """`label_keys` with the tagged labels made to match `tags`. A label with
    no tag (a gated type's) is left as it is."""
    tags = set(tags)
    implied = {key for key, tag in TAG_FOR_LABEL.items() if tag in tags}
    return (set(label_keys) - set(TAG_FOR_LABEL)) | implied


def refuse_nsfw_tag_removal(old_labels: Iterable[str], new_labels: Iterable[str]):
    """422 when a tag write takes NSFW off while another label stays - the tag
    side of label_rules.refuse_nsfw_removal, worded in tags."""
    old, new = set(old_labels), set(new_labels)
    others = sorted(new - {NSFW})
    if NSFW in old and NSFW not in new and others:
        named = [TAG_FOR_LABEL.get(key, key) for key in others]
        raise HTTPException(
            status_code=422,
            detail=(
                f"'{named[0]}' requires the '{TAG_FOR_LABEL[NSFW]}' tag; remove "
                f"{', '.join(repr(t) for t in named)} first, or keep "
                f"'{TAG_FOR_LABEL[NSFW]}'."
            ),
        )


def entry_label_keys(db: Session, media_id: UUID) -> set[str]:
    return {
        key
        for (key,) in db.query(models.ContentLabel.key)
        .join(
            models.MediaContentLabel,
            models.MediaContentLabel.label_id == models.ContentLabel.system_id,
        )
        .filter(models.MediaContentLabel.media_id == media_id)
    }


def write_entry_labels(db: Session, media_id: UUID, label_keys: Iterable[str]) -> None:
    """Replace an entry's label rows with `label_keys`. No rule is applied
    here - the caller has; flushes, never commits."""
    keys = sorted(set(label_keys))
    ids = dict(
        db.query(models.ContentLabel.key, models.ContentLabel.system_id).filter(
            models.ContentLabel.key.in_(keys)
        )
    ) if keys else {}
    db.query(models.MediaContentLabel).filter(
        models.MediaContentLabel.media_id == media_id
    ).delete(synchronize_session=False)
    for position, key in enumerate(keys):
        db.add(
            models.MediaContentLabel(
                media_id=media_id, label_id=ids[key], position=position
            )
        )
    db.flush()


def apply_tag_write(
    db: Session, media_type: str, media_id: UUID, tags: list[str]
) -> list[str]:
    """
    A write of the entry's Label tags, carried through to its labels.

    Returns the tags to store - `tags` plus any the nsfw rule brought (adding
    輕微色情 alone stores NSFW too) - and writes the label rows. Raises 422,
    before writing anything, when NSFW is removed while 輕微色情 or 擦邊肉番
    stays. A type without the Label field returns `tags` untouched.
    """
    if not has_label_field(media_type):
        return list(tags)
    current = entry_label_keys(db, media_id)
    requested = labels_for_tags(current, tags)
    refuse_nsfw_tag_removal(current, requested)
    labels = with_required_labels(requested)
    if labels != current:
        write_entry_labels(db, media_id, labels)
    return tags_for_labels(tags, labels)


def sync_tags_to_labels(
    db: Session, media_type: str, media_id: UUID, label_keys: Iterable[str]
) -> None:
    """A label write carried through to the entry's Label tags. Flushes,
    never commits; a type without the Label field is left alone."""
    if not has_label_field(media_type):
        return
    from app.services.domain.credits import replace_tags, tag_values

    current = tag_values(db, media_id, LABEL_FIELD)
    wanted = tags_for_labels(current, label_keys)
    if wanted != current:
        replace_tags(db, media_id, LABEL_FIELD, wanted)


def reconcile_label_tags(db: Session) -> dict[str, int]:
    """
    Make every Label-field entry's label tags match its labels, the label
    winning. Run after a Pull restores either side, where no write hook ran.
    Idempotent; returns {"added": n, "removed": n}. Flushes, never commits.
    """
    from app.services.domain.credits import resolve_option

    option_for_label = {
        key: resolve_option(db, LABEL_CATEGORY, tag).system_id
        for key, tag in TAG_FOR_LABEL.items()
    }
    label_for_option = {option: key for key, option in option_for_label.items()}

    entries = {
        media_id
        for (media_id,) in db.query(models.Media.system_id).filter(
            models.Media.media_type.in_(LABEL_FIELD_TYPES)
        )
    }
    labelled: dict[UUID, set[str]] = {}
    for media_id, key in (
        db.query(models.MediaContentLabel.media_id, models.ContentLabel.key)
        .join(
            models.ContentLabel,
            models.ContentLabel.system_id == models.MediaContentLabel.label_id,
        )
        .filter(models.ContentLabel.key.in_(list(TAG_FOR_LABEL)))
    ):
        if media_id in entries:
            labelled.setdefault(media_id, set()).add(key)

    tagged: dict[UUID, set[str]] = {}
    last_position: dict[UUID, int] = {}
    removed = 0
    for row in db.query(models.MediaTag).filter(models.MediaTag.field == LABEL_FIELD):
        if row.media_id not in entries:
            continue
        last_position[row.media_id] = max(
            last_position.get(row.media_id, -1), row.position or 0
        )
        key = label_for_option.get(row.option_id)
        if key is None:
            continue
        if key in labelled.get(row.media_id, set()):
            tagged.setdefault(row.media_id, set()).add(key)
        else:
            db.delete(row)
            removed += 1

    added = 0
    for media_id, keys in labelled.items():
        for key in TAG_FOR_LABEL:
            if key in keys and key not in tagged.get(media_id, set()):
                last_position[media_id] = last_position.get(media_id, -1) + 1
                db.add(
                    models.MediaTag(
                        media_id=media_id,
                        field=LABEL_FIELD,
                        option_id=option_for_label[key],
                        position=last_position[media_id],
                    )
                )
                added += 1
    db.flush()
    return {"added": added, "removed": removed}
