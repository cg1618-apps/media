"""
Characters cast on nothing, found and removed in bulk - the System page's
Remove Uncast Characters.

Import Cast from MAL mints a character for every name on a MAL cast list, and
most of them are not worth keeping. The cast editor unlinks them one entry at
a time, which leaves them as characters with zero castings; this is the sweep
that removes what is left.

Only the CHARACTER is the unit. An identity is never swept on its own - an
identity with no casting of its own still belongs to a character that may be
cast elsewhere - but a removed character's identities go with it, because the
database cascades them (CharacterIdentity.character_id ondelete="CASCADE").

Removing a character also releases every image it and its identities own,
the same three places the images router's Remove button clears:

  * each image attachment - an uploaded image stays in the library, a
    downloaded one is deleted with its file (`drop_if_unused_download`);
  * the owner's mirror column, which goes with the row itself;
  * the file downloaded for the owner, `covers/<owner_type>/<id>.jpg`, unless
    an image row attached somewhere else still points at it.

Files are removed only after the commit, so a failed delete never leaves a
row pointing at a file that is already gone.
"""

from uuid import UUID

from sqlalchemy import exists
from sqlalchemy.orm import Session

from app import models
from app.services.integrations import image_library, image_manager

CHARACTER_OWNER = "character"
IDENTITY_OWNER = "character-identity"


def _uncast_query(db: Session):
    has_casting = exists().where(
        models.CharacterCasting.character_id == models.Character.system_id
    )
    return db.query(models.Character).filter(~has_casting)


def find_uncast_characters(db: Session) -> dict:
    """
    Every character with no casting at all, sorted by display name.

    Read-only. `identity_count` is how many identities would go with each,
    and `has_photo` whether it holds a portrait of its own - the two things
    worth knowing before unticking one to keep.
    """
    characters = _uncast_query(db).all()
    characters.sort(key=lambda c: c.display_name.casefold())
    rows = [
        {
            "system_id": str(c.system_id),
            "public_id": c.public_id,
            "name": c.display_name,
            "identity_count": len(c.identities),
            "has_photo": c.photo_file is not None,
        }
        for c in characters
    ]
    return {"status": "success", "characters": rows, "count": len(rows)}


def _release_images(
    db: Session, owners: list[tuple[str, UUID]]
) -> tuple[list[tuple[str, str]], list[tuple[str, UUID]]]:
    """
    Detach every image these owners hold. Returns the files to delete once
    the commit lands: library files of downloads nothing else uses, and the
    owners whose own downloaded file no other image row points at.
    """
    library_files: list[tuple[str, str]] = []
    for owner_type, owner_id in owners:
        attachments = (
            db.query(models.ImageAttachment)
            .filter(
                models.ImageAttachment.owner_type == owner_type,
                models.ImageAttachment.owner_id == owner_id,
            )
            .all()
        )
        for attachment in attachments:
            image = db.get(models.Image, attachment.image_id)
            db.delete(attachment)
            dropped = image_library.drop_if_unused_download(db, image)
            if dropped:
                library_files.append(dropped)

    db.flush()
    own_downloads = [
        (owner_type, owner_id)
        for owner_type, owner_id in owners
        if db.query(models.Image)
        .filter(
            models.Image.storage_key
            == f"covers/{image_manager.cover_key(owner_type, str(owner_id))}"
        )
        .first()
        is None
    ]
    return library_files, own_downloads


def remove_uncast_characters(db: Session, system_ids: list[UUID]) -> dict:
    """
    Delete the named characters that are STILL uncast, with their identities
    and images.

    The list is what the admin ticked; whether each one still qualifies is
    re-derived here. A character cast since the list was drawn is skipped and
    counted, not deleted - the admin agreed to remove characters with no
    casting history, and that one has some now.
    """
    wanted = set(system_ids)
    characters = (
        _uncast_query(db).filter(models.Character.system_id.in_(wanted)).all()
        if wanted
        else []
    )

    owners: list[tuple[str, UUID]] = []
    for character in characters:
        owners.append((CHARACTER_OWNER, character.system_id))
        owners.extend(
            (IDENTITY_OWNER, identity.system_id) for identity in character.identities
        )

    library_files, own_downloads = _release_images(db, owners)
    for character in characters:
        db.delete(character)
    db.commit()

    for keys in library_files:
        image_library.delete_file(*keys)
    for owner_type, owner_id in own_downloads:
        image_manager.delete_cover_image(owner_type, str(owner_id))

    removed = len(characters)
    skipped = len(wanted) - removed
    message = f"Removed {removed} uncast character{'s' if removed != 1 else ''}."
    if skipped:
        message += f" Skipped {skipped} no longer uncast or already gone."
    return {
        "status": "success",
        "message": message,
        "removed_count": removed,
        "skipped_count": skipped,
    }
