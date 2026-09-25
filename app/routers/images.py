"""
routers/images.py
Upload an image from your own machine and attach it to something.

Every other image this application holds arrived by download from an external
API. This is the one place bytes come from the user.

Upload and attach are deliberately SEPARATE calls. An image can be uploaded to
the library with no owner in mind, and an existing image can be attached to a
second owner without re-uploading; the picker widget simply makes both calls in
sequence.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import false
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.dependencies import get_db
from app.schemas.image import AttachmentIn, AttachmentOut, ImageListOut, ImageOut
from app.services.integrations import image_library, image_manager
from app.services.rbac.enforcement import entry_visible
from app.services.rbac.resolver import Viewer, require_manage_catalog, viewer_user_id
from app.services.rbac.shared_visibility import (
    ENTITY_OWNER_MODELS,
    shared_record_visible,
)
from app.utils.media_resolver import MEDIA_TABLES

router = APIRouter(prefix="/api/images", tags=["Images"])

MAX_UPLOAD_BYTES = settings.max_image_upload_mb * 1024 * 1024

# Read in 1MB chunks so an oversized body is refused partway through rather
# than after the whole thing is in memory.
CHUNK_SIZE = 1024 * 1024

# Every owner an image may be attached to. The media types come from
# MEDIA_TABLES so the hyphen/underscore split stays in one place; the rest are
# named explicitly. Note this is NOT the same set as image_manager.COVER_OWNERS,
# which has no `quote` - the shape reads uniform and is not.
ATTACHABLE_OWNERS: frozenset[str] = frozenset(MEDIA_TABLES) | frozenset(
    {"staff", "character", "publisher", "studio", "quote", "meme"}
)

# The owner tables that carry a mirror column, and what that column is called.
# Media entries mirror onto the `media` supertable's cover_image_file; the
# entity tables carry their own. Read each definition rather than assuming the
# shape is uniform - staff and character use `photo_file`, publisher and
# studio use `logo_file` (not `cover_image_file`), and `quote` and `meme` both
# use `image_file` and resolve against static/quotes/ rather than
# static/covers/.
MIRROR_COLUMNS = {
    "staff": "photo_file",
    "character": "photo_file",
    "publisher": "logo_file",
    "studio": "logo_file",
    "quote": "image_file",
    "meme": "image_file",
}

# `staff` maps to Person, not a `Staff` class - app/models/staff.py defines
# Person, Studio and Publisher; Character lives in app/models/character.py.
_ENTITY_MODELS = {
    "staff": models.Person,
    "character": models.Character,
    "publisher": models.Publisher,
    "studio": models.Studio,
    "quote": models.Quote,
    "meme": models.Meme,
}

# Owners that attach with a role other than "cover". Everything else only
# ever mirrors a "cover" role - expressed as set membership rather than a
# growing list of `!= "quote"`-style comparisons, so the next non-cover owner
# type does not have to remember to touch this guard too.
NON_COVER_ROLE_OWNERS: frozenset[str] = frozenset({"quote", "meme"})


def mirror_to_owner_column(db, owner_type, owner_id, role, storage_key):
    """
    Write the storage key onto the owner's legacy column.

    Phase 1 of the expand/contract keeps `cover_image_file` and friends
    written-through so that the Sheets formatters, the download pipelines, the
    orphan checks and every getCoverUrl call in the SPA keep working with no
    change at all. Phases 2 and 3 - moving readers, then dropping the columns -
    are deliberately deferred, and this function is what they eventually delete.
    """
    if role != "cover" and owner_type not in NON_COVER_ROLE_OWNERS:
        return

    if owner_type in MEDIA_TABLES:
        model = MEDIA_TABLES[owner_type].model
        row = db.get(model, owner_id)
        if row is not None:
            row.cover_image_file = storage_key
        return

    column = MIRROR_COLUMNS.get(owner_type)
    if column is None:
        return

    model = _ENTITY_MODELS.get(owner_type)
    if model is None:
        return
    row = db.get(model, owner_id)
    if row is not None:
        setattr(row, column, storage_key)


def _require_reachable_owner(db, viewer, owner_type, owner_id) -> None:
    """
    400 on an owner type no image can belong to; 404 on an owner the caller
    cannot see.

    The permission gate is NOT sufficient on its own. manage.catalog says
    nothing about WHICH entries a writer may reach, so a media owner is checked
    against entry_visible and 404s exactly as a missing entry does - writes
    follow reads. An entity owner (staff, character, publisher, studio) is a
    shared record and is checked against shared_record_visible the same way.
    """
    if owner_type not in ATTACHABLE_OWNERS:
        raise HTTPException(
            status_code=400, detail=f"Unknown owner type: {owner_type}"
        )
    if owner_type in MEDIA_TABLES:
        if not entry_visible(db, viewer, owner_type, owner_id):
            raise HTTPException(status_code=404, detail="Entry not found.")
    elif owner_type in ENTITY_OWNER_MODELS:
        model = ENTITY_OWNER_MODELS[owner_type]
        if not shared_record_visible(db, viewer, model, owner_id):
            raise HTTPException(status_code=404, detail="Entry not found.")


def _drop_if_unused_download(db, image) -> Optional[tuple[str, str]]:
    """
    Delete a DOWNLOADED image once nothing is attached to it, returning the
    file keys to remove after the commit.

    An uploaded image stays in the library when its last use goes: that is
    what the library is for. A downloaded one cannot be reused safely - its
    file is `covers/<owner_type>/<id>.jpg`, keyed on the owner it was fetched
    for, so the next download for that owner overwrites it in place. Left in
    the library it becomes an "unused" image that aliases the owner's live
    cover, and deleting it from there deletes that cover.
    """
    if image is None or image.uploaded_by is not None:
        return None
    db.flush()
    still_used = (
        db.query(models.ImageAttachment)
        .filter(models.ImageAttachment.image_id == image.system_id)
        .first()
    )
    if still_used is not None:
        return None
    keys = (image.storage_key, image.thumb_key)
    db.delete(image)
    return keys


def _read_capped(upload: UploadFile) -> bytes:
    """
    Read the body, refusing anything over the cap.

    Content-Length is checked first because it is free, and then ignored: it is
    a claim from the client, so the streaming check below is the one that
    actually holds. `upload.size` is only populated by newer Starlette
    versions, so it is read defensively.
    """
    declared = getattr(upload, "size", None)
    if declared is not None and declared > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds the {settings.max_image_upload_mb}MB limit.",
        )

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = upload.file.read(CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Image exceeds the {settings.max_image_upload_mb}MB limit.",
            )
        chunks.append(chunk)

    return b"".join(chunks)


def _to_out(db: Session, image: models.Image) -> ImageOut:
    """One image, plus the two things only a request can know."""
    out = ImageOut.model_validate(image)
    out.missing = not image_library.file_exists(image.storage_key)
    out.attachments = [
        AttachmentOut.model_validate(row)
        for row in db.query(models.ImageAttachment)
        .filter(models.ImageAttachment.image_id == image.system_id)
        .all()
    ]
    return out


@router.post("", status_code=201, response_model=ImageOut, summary="Upload an image")
def upload_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Validate, normalize and store one image. Attaches it to nothing.

    The re-encode inside normalize_image is the security control: the filename
    extension and the multipart content type are both client-supplied and are
    used for nothing here.
    """
    raw = _read_capped(file)

    try:
        normalized = image_library.normalize_image(raw)
    except image_library.ImageValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    existing = (
        db.query(models.Image)
        .filter(models.Image.checksum == normalized.checksum)
        .first()
    )
    if existing:
        # Same picture, already here. Re-store anyway: the bytes may be missing
        # on this machine even though the row is not.
        image_library.store(normalized)
        return _to_out(db, existing)

    storage_key, thumb_key = image_library.store(normalized)
    image = models.Image(
        storage_key=storage_key,
        thumb_key=thumb_key,
        checksum=normalized.checksum,
        original_filename=file.filename,
        byte_size=len(normalized.jpeg),
        width=normalized.width,
        height=normalized.height,
        uploaded_by=viewer_user_id(admin),
    )
    db.add(image)
    db.commit()
    db.refresh(image)

    return _to_out(db, image)


@router.get("", response_model=ImageListOut, summary="The image library")
def list_images(
    unused: bool = Query(False),
    missing: bool = Query(False),
    duplicates: bool = Query(False),
    owner_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(60, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """The library, filtered by the questions the manager page and picker ask."""
    if owner_type is not None and owner_type not in ATTACHABLE_OWNERS:
        raise HTTPException(
            status_code=400, detail=f"Unknown owner type: {owner_type}"
        )

    query = db.query(models.Image)

    if q:
        query = query.filter(models.Image.original_filename.ilike(f"%{q}%"))

    if unused:
        attached = db.query(models.ImageAttachment.image_id)
        query = query.filter(models.Image.system_id.notin_(attached))

    # `unused` (no attachments at all) and `owner_type` (has an attachment of
    # a given type) are contradictory: no image can satisfy both. Rather than
    # 400 on the combination - a picker wiring both chips together is a UI
    # bug, not a request worth failing loudly for - `unused` wins and the
    # owner_type filter is skipped, which is what already falls out of
    # applying `unused`'s NOT IN first: adding the owner_type filter here
    # would always yield zero rows, silently. Skipping it instead returns the
    # (already well-defined) unused set rather than an empty page that looks
    # like a bug.
    if owner_type is not None and not unused:
        owned = db.query(models.ImageAttachment.image_id).filter(
            models.ImageAttachment.owner_type == owner_type
        )
        query = query.filter(models.Image.system_id.in_(owned))

    if duplicates:
        # Should always be empty: checksum is unique, so this exists to PROVE
        # dedup works rather than to fix anything. `query.filter(False)` is not
        # valid SQLAlchemy - it needs the sql-expression false().
        query = query.filter(false())

    total = query.count()

    # `missing` is computed per row from the filesystem, not from the
    # database, so it cannot be pushed into the SQL query above. Filtering it
    # in Python after LIMIT/OFFSET would give a short page (rows that turn out
    # present are silently dropped) and a `total` that only counts the current
    # page. The honest fix costs a full scan of the filtered set on every
    # `missing` request - this is an admin-only library of ~2000 rows, not a
    # hot path, so trading that scan for a correct page and a correct total is
    # the right side of the tradeoff.
    if missing:
        rows = query.order_by(models.Image.uploaded_at.desc()).all()
        out_all = [_to_out(db, row) for row in rows]
        out_all = [row for row in out_all if row.missing]
        total = len(out_all)
        page = out_all[offset : offset + limit]
        return ImageListOut(images=page, total=total)

    rows = (
        query.order_by(models.Image.uploaded_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    out = [_to_out(db, row) for row in rows]

    return ImageListOut(images=out, total=total)


@router.post(
    "/{image_id}/attach",
    status_code=201,
    response_model=AttachmentOut,
    summary="Attach an image to an owner",
)
def attach_image(
    image_id: UUID,
    payload: AttachmentIn,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Point an owner at this image. Idempotent per (owner, role): re-attaching
    replaces, so "change the cover" is one call and never leaves two rows.
    Who may reach which owner is `_require_reachable_owner`'s question.
    """
    if payload.owner_type not in ATTACHABLE_OWNERS:
        raise HTTPException(
            status_code=400, detail=f"Unknown owner type: {payload.owner_type}"
        )

    image = db.get(models.Image, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")

    _require_reachable_owner(db, admin, payload.owner_type, payload.owner_id)

    existing = (
        db.query(models.ImageAttachment)
        .filter(
            models.ImageAttachment.owner_type == payload.owner_type,
            models.ImageAttachment.owner_id == payload.owner_id,
            models.ImageAttachment.role == payload.role,
            models.ImageAttachment.position == 0,
        )
        .first()
    )
    if existing:
        existing.image_id = image.system_id
        attachment = existing
    else:
        attachment = models.ImageAttachment(
            image_id=image.system_id,
            owner_type=payload.owner_type,
            owner_id=payload.owner_id,
            role=payload.role,
            position=0,
        )
        db.add(attachment)

    mirror_to_owner_column(
        db, payload.owner_type, payload.owner_id, payload.role, image.storage_key
    )

    db.commit()
    db.refresh(attachment)
    return AttachmentOut.model_validate(attachment)


@router.delete(
    "/{image_id}/attach/{attachment_id}",
    status_code=204,
    summary="Detach an image",
)
def detach_image(
    image_id: UUID,
    attachment_id: UUID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Unlink. An uploaded image stays in the library for reuse; a downloaded one
    goes with its last attachment (`_drop_if_unused_download`).
    """
    attachment = db.get(models.ImageAttachment, attachment_id)
    if attachment is None or attachment.image_id != image_id:
        raise HTTPException(status_code=404, detail="Attachment not found.")

    mirror_to_owner_column(
        db, attachment.owner_type, attachment.owner_id, attachment.role, None
    )

    image = db.get(models.Image, image_id)
    db.delete(attachment)
    dropped = _drop_if_unused_download(db, image)
    db.commit()
    if dropped:
        image_library.delete_file(*dropped)
    return Response(status_code=204)


@router.delete(
    "/owners/{owner_type}/{owner_id}/{role}",
    status_code=204,
    summary="Clear an owner's image",
)
def clear_owner_image(
    owner_type: str,
    owner_id: UUID,
    role: str,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Take the owner's image away, so it has none - the Remove button on an
    entry's cover.

    Keyed on the OWNER rather than on an attachment, because an owner's image
    need not have one: a cover downloaded after the library was introduced is
    only a file and the mirror column, with no `image` row at all. All three
    places an owner's image can live are cleared:

      * the attachment, if there is one - an uploaded image stays in the
        library, a downloaded one is deleted (`_drop_if_unused_download`);
      * the mirror column (`cover_image_file` and friends);
      * the file downloaded for this owner, `covers/<owner_type>/<id>.jpg`,
        unless an image row attached somewhere else still points at it.

    The file matters as much as the column. Left on disk, Set Cover Image
    Fields would stamp it straight back onto the cleared column, and it is the
    old title's picture - clearing is what you do before pointing an entry at
    a different external id, and the next Replace downloads that id's cover.

    Idempotent: clearing an owner with no image is a 204 that does nothing.
    """
    _require_reachable_owner(db, admin, owner_type, owner_id)

    to_delete: list[tuple[str, str]] = []

    attachment = (
        db.query(models.ImageAttachment)
        .filter(
            models.ImageAttachment.owner_type == owner_type,
            models.ImageAttachment.owner_id == owner_id,
            models.ImageAttachment.role == role,
            models.ImageAttachment.position == 0,
        )
        .first()
    )
    if attachment is not None:
        image = db.get(models.Image, attachment.image_id)
        db.delete(attachment)
        dropped = _drop_if_unused_download(db, image)
        if dropped:
            to_delete.append(dropped)

    mirror_to_owner_column(db, owner_type, owner_id, role, None)

    delete_own_download = False
    if role == "cover" and owner_type in image_manager.COVER_OWNERS:
        key = image_manager.cover_key(owner_type, str(owner_id))
        db.flush()
        delete_own_download = (
            db.query(models.Image)
            .filter(models.Image.storage_key == f"covers/{key}")
            .first()
            is None
        )

    db.commit()
    for keys in to_delete:
        image_library.delete_file(*keys)
    if delete_own_download:
        image_manager.delete_cover_image(owner_type, str(owner_id))
    return Response(status_code=204)


@router.delete("/{image_id}", status_code=204, summary="Delete an image")
def delete_image(
    image_id: UUID,
    force: bool = Query(False),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Remove the image and its file. Refuses while anything still uses it, unless
    forced - deleting an attached image is a decision, not a tidy-up.
    """
    image = db.get(models.Image, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")

    attachments = (
        db.query(models.ImageAttachment)
        .filter(models.ImageAttachment.image_id == image_id)
        .all()
    )
    if attachments and not force:
        raise HTTPException(
            status_code=409,
            detail=f"Image is still attached to {len(attachments)} owner(s).",
        )

    # A forced delete removes the attachment rows (they cascade with the
    # image below), but the legacy columns those rows were mirroring do not
    # cascade - they are plain string columns, not foreign keys. Left alone
    # they would still point at a file that no longer exists.
    for attachment in attachments:
        mirror_to_owner_column(
            db, attachment.owner_type, attachment.owner_id, attachment.role, None
        )

    storage_key, thumb_key = image.storage_key, image.thumb_key
    db.delete(image)  # attachments cascade
    db.commit()
    image_library.delete_file(storage_key, thumb_key)
    return Response(status_code=204)
