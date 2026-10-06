"""
Merging fills the survivor's blanks from the record merged into it.

Every merge (character, person, studio, publisher) repoints the loser's links
onto the survivor and then deletes the loser. Without this module the loser's
own columns went with it: a survivor with no English name stayed without one
even when the duplicate had it. So before the delete, every column the
survivor leaves blank is filled from the loser, and a column the survivor
already holds is never overwritten - the survivor is the record the admin
chose to keep, so where the two disagree it wins.

The picture is the one column that is not a plain copy. A downloaded photo or
logo is stored under the LOSER's id (`<owner_type>/<loser_id>.jpg`), and
/api/covers/ resolves an image's visibility through the owner that id names -
which is about to be deleted. So a downloaded picture is renamed to the
survivor's own key rather than shared, while an uploaded one (a `library/`
key, content-addressed and owned by nobody) is simply shared.
"""

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.services.integrations import image_manager

# Never copied: identity and bookkeeping, not facts about the thing.
_NEVER_FILLED = frozenset({"system_id", "public_id", "created_at", "updated_at"})

# Each owner's picture column and the focal point that belongs to it. The
# focus describes one picture, so it travels with that picture or not at all.
IMAGE_COLUMNS: dict[str, tuple[str, str]] = {
    "character": ("photo_file", "photo_focus"),
    "staff": ("photo_file", "photo_focus"),
    "studio": ("logo_file", "logo_focus"),
    "publisher": ("logo_file", "logo_focus"),
}

# A casting's own photo, filled the same way when both characters are cast in
# one entry.
CASTING_IMAGE_COLUMNS = ("photo_file", "photo_focus")


def is_blank(value) -> bool:
    """None, or a string holding nothing but whitespace."""
    return value is None or (isinstance(value, str) and not value.strip())


def fill_blank_columns(keep, drop, skip: tuple[str, ...] = ()) -> None:
    """
    Copy every column `keep` leaves blank from `drop`, except `skip` and the
    identity columns. Both rows are the same model.
    """
    for column in keep.__table__.columns:
        name = column.key
        if name in _NEVER_FILLED or name in skip:
            continue
        if is_blank(getattr(keep, name)) and not is_blank(getattr(drop, name)):
            setattr(keep, name, getattr(drop, name))


def fill_blank_casting(keep, drop) -> None:
    """
    One entry's casting of the survivor, filled from the loser's casting of
    the same entry: role, remark, and the photo with its focus.
    """
    fill_blank_columns(
        keep,
        drop,
        skip=(
            "character_id", "identity_id", "media_type", "entry_id", "position",
            *CASTING_IMAGE_COLUMNS,
        ),
    )
    file_column, focus_column = CASTING_IMAGE_COLUMNS
    if is_blank(getattr(keep, file_column)) and not is_blank(getattr(drop, file_column)):
        setattr(keep, file_column, getattr(drop, file_column))
        setattr(keep, focus_column, getattr(drop, focus_column))


def absorb_casting(keep, drop) -> None:
    """
    One appearance folded into another of the same entry: `keep`'s blanks
    filled from `drop`'s (fill_blank_casting), and every seiyuu `drop` has
    that `keep` lacks appended after `keep`'s own. The caller deletes `drop`.
    """
    fill_blank_casting(keep, drop)
    voiced = {v.person_id for v in keep.voices}
    for voice in list(drop.voices):
        if voice.person_id not in voiced:
            keep.voices.append(
                models.CharacterCastingVoice(
                    media_type=keep.media_type,
                    entry_id=keep.entry_id,
                    person_id=voice.person_id,
                    position=len(keep.voices),
                    remark=voice.remark,
                )
            )


def merge_fill(db: Session, owner_type: str, keep, drop) -> Optional[tuple[str, str]]:
    """
    Fill `keep`'s blanks from `drop`, the picture included.

    Returns the (from, to) cover keys of a file that has to be renamed on disk
    once the merge commits, or None. The rename waits for the commit because
    a file move cannot be rolled back with the transaction: renaming first
    and then failing to commit would leave the loser - still in the database -
    pointing at a file that is gone.
    """
    file_column, focus_column = IMAGE_COLUMNS[owner_type]
    fill_blank_columns(keep, drop, skip=(file_column, focus_column))

    key = getattr(drop, file_column)
    if not is_blank(getattr(keep, file_column)) or is_blank(key):
        return None

    rename = None
    if image_manager.is_own_download(key, owner_type, str(drop.system_id)):
        old = image_manager.cover_key(owner_type, str(drop.system_id))
        new = image_manager.cover_key(owner_type, str(keep.system_id))
        # A backfilled `image` row names the file by its static/-relative
        # key, so it follows the rename too.
        for image in db.query(models.Image).filter(
            models.Image.storage_key == f"covers/{old}"
        ):
            image.storage_key = f"covers/{new}"
        key = new
        rename = (old, new)

    setattr(keep, file_column, key)
    setattr(keep, focus_column, getattr(drop, focus_column))

    # The library's record of which image is whose picture moves with it.
    held = {
        (a.role, a.position)
        for a in db.query(models.ImageAttachment).filter_by(
            owner_type=owner_type, owner_id=keep.system_id
        )
    }
    for attachment in db.query(models.ImageAttachment).filter_by(
        owner_type=owner_type, owner_id=drop.system_id
    ):
        if (attachment.role, attachment.position) in held:
            continue
        attachment.owner_id = keep.system_id
    return rename


def rename_cover_file(rename: Optional[tuple[str, str]]) -> None:
    """
    Carry out the rename `merge_fill` asked for, after the commit.

    A failure leaves the survivor naming a file that is not there yet - a
    missing picture, which the cover download pipeline already repairs - so
    it is logged rather than raised: the merge itself succeeded.
    """
    if rename is not None:
        image_manager.move_cover_image(*rename)


def finish_merge(db: Session, owner_type: str, keep, drop) -> None:
    """
    The end of every merge, once the links are repointed: delete the loser,
    fill the survivor's blanks from it, commit, and rename a carried picture.

    The loser is deleted and FLUSHED before the fill. Person, studio and
    publisher are unique on their four names together, and filling the
    survivor can give it exactly the loser's names - keep "A", drop "A" and
    "B" - which collides while the loser still exists, because the unit of
    work runs updates before deletes. Its columns stay readable on the
    deleted instance until the commit.

    A fill that gives the survivor the names of some THIRD record is a real
    clash, and a 409 naming it, with nothing changed.
    """
    db.delete(drop)
    db.flush()
    rename = merge_fill(db, owner_type, keep, drop)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "Merging would give this record the same names as another "
                "one. Merge that one too, or change a name first."
            ),
        )
    rename_cover_file(rename)
