"""
A person's gallery of works: the pictures an author or illustrator is shown
by on their page.

Stored in the image library, not beside it. Each picture is an `image` row
(uploaded through the same normalize-and-store path as every other upload)
and an `image_attachment` on the person - owner_type "staff", role "work" -
whose `position` orders the gallery from 0 with no gaps and whose `caption`
says what it shows. So the library's manager page lists these pictures as in
use, its dedup applies, and a forced delete there takes a picture out of the
gallery like any other attachment.

Only a person holding the `author` or `illustrator` role, in any scope, may
gain a picture. Losing the role later does not empty the gallery: what is
there can still be captioned, reordered and removed.

Unlike a cover, a gallery picture is the person's own rather than library
stock: removing it from the gallery deletes the image and its file, unless
something else still uses the same bytes (`image_library.drop_if_unused`).
"""

from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.services.integrations import image_library

OWNER_TYPE = "staff"
WORK_ROLE = "work"

# The person roles that have works to show.
GALLERY_PERSON_ROLES: frozenset[str] = frozenset({"author", "illustrator"})


def holds_gallery_role(roles: Iterable) -> bool:
    """Whether any of `roles` (person_role rows or PersonRoleIn) is author or
    illustrator."""
    return any(role.role in GALLERY_PERSON_ROLES for role in roles)


def _query(db: Session, person_id: UUID):
    return db.query(models.ImageAttachment).filter(
        models.ImageAttachment.owner_type == OWNER_TYPE,
        models.ImageAttachment.owner_id == person_id,
        models.ImageAttachment.role == WORK_ROLE,
    )


def gallery(db: Session, person_id: UUID) -> list[tuple[models.ImageAttachment, models.Image]]:
    """The person's pictures with their images, in display order."""
    return (
        db.query(models.ImageAttachment, models.Image)
        .join(models.Image, models.ImageAttachment.image_id == models.Image.system_id)
        .filter(
            models.ImageAttachment.owner_type == OWNER_TYPE,
            models.ImageAttachment.owner_id == person_id,
            models.ImageAttachment.role == WORK_ROLE,
        )
        .order_by(models.ImageAttachment.position)
        .all()
    )


def find(db: Session, person_id: UUID, attachment_id: UUID) -> Optional[models.ImageAttachment]:
    """One of this person's pictures, or None - an attachment of another
    owner, or of another role, is not found here."""
    return _query(db, person_id).filter(
        models.ImageAttachment.system_id == attachment_id
    ).first()


def renumber(db: Session, attachments: list[models.ImageAttachment]) -> None:
    """
    Give `attachments` the positions 0, 1, 2 ... in list order.

    In two passes, because (owner_type, owner_id, role, position) is unique
    and the unit of work does not update rows in list order: moving every row
    to a negative position first means no row ever lands on a position
    another still holds.
    """
    for index, attachment in enumerate(attachments):
        attachment.position = -(index + 1)
    db.flush()
    for index, attachment in enumerate(attachments):
        attachment.position = index
    db.flush()


def append(db: Session, person_id: UUID, image: models.Image) -> Optional[models.ImageAttachment]:
    """
    Add `image` to the end of the gallery. A picture the gallery already
    holds is not added twice; None then.
    """
    rows = _query(db, person_id).all()
    if any(row.image_id == image.system_id for row in rows):
        return None
    attachment = models.ImageAttachment(
        image_id=image.system_id,
        owner_type=OWNER_TYPE,
        owner_id=person_id,
        role=WORK_ROLE,
        position=max((row.position for row in rows), default=-1) + 1,
    )
    db.add(attachment)
    db.flush()
    return attachment


def remove(db: Session, person_id: UUID, attachment: models.ImageAttachment) -> Optional[tuple[str, str]]:
    """
    Take one picture out of the gallery and close the gap. Returns the file
    keys to delete once the caller commits, or None when the image is still
    used elsewhere.
    """
    image = db.get(models.Image, attachment.image_id)
    db.delete(attachment)
    db.flush()
    renumber(db, _query(db, person_id).order_by(models.ImageAttachment.position).all())
    return image_library.drop_if_unused(db, image)


def remove_all(db: Session, person_id: UUID) -> list[tuple[str, str]]:
    """
    Empty the gallery - a person being deleted. `image_attachment.owner_id`
    is not a foreign key, so nothing cascades to it. Returns the file keys to
    delete once the caller commits.
    """
    to_delete = []
    for attachment in _query(db, person_id).all():
        image = db.get(models.Image, attachment.image_id)
        db.delete(attachment)
        dropped = image_library.drop_if_unused(db, image)
        if dropped:
            to_delete.append(dropped)
    return to_delete


def merge(db: Session, keep_id: UUID, drop_id: UUID) -> None:
    """
    Move the loser's pictures onto the survivor, after its own and in their
    order. A picture the survivor already shows is dropped from the loser
    rather than repeated; the image itself stays, since the survivor uses it.
    """
    kept = _query(db, keep_id).order_by(models.ImageAttachment.position).all()
    held = {row.image_id for row in kept}
    moving = []
    for attachment in _query(db, drop_id).order_by(models.ImageAttachment.position).all():
        if attachment.image_id in held:
            db.delete(attachment)
            continue
        held.add(attachment.image_id)
        moving.append(attachment)
    db.flush()
    # Off the survivor's positions before the owner changes, so the two
    # galleries' 0, 1, 2 ... never meet on the unique constraint - and below
    # the -1 ... -n that renumber's first pass is about to use.
    total = len(kept) + len(moving)
    for index, attachment in enumerate(moving):
        attachment.position = -(total + 1 + index)
    db.flush()
    for attachment in moving:
        attachment.owner_id = keep_id
    db.flush()
    renumber(db, kept + moving)
