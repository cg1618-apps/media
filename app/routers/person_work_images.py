"""
routers/person_work_images.py
A person's gallery of works: list, upload, caption, reorder, remove.

The pictures are library images attached to the person under the role
"work" - see app/services/domain/person_work_images.py for the storage and
the rules. Uploading reuses the library's own path (images.read_upload /
images.save_upload), so the cap, the re-encode and the dedup are the same
ones POST /api/images applies.

Writes answer to manage.images, the key every image upload and attach
already answers to; reads to view.person, like the person page they are
drawn on. Every route resolves the person through the shared-record rule
first, so a person the caller cannot see is a 404 here as everywhere else.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from app import models
from app.dependencies import get_db
from app.routers.images import read_upload, save_upload
from app.schemas.image import WorkImageCaptionIn, WorkImageOut, WorkImagesReorder
from app.services.domain import person_work_images as works
from app.services.integrations import image_library
from app.services.rbac.resolver import Viewer, require_manage_images, require_view_person
from app.services.rbac.shared_visibility import (
    hidden_scopes,
    require_visible_shared,
    without_hidden_scopes,
)
from app.utils.entity_ref import find_entity

router = APIRouter(prefix="/api/person", tags=["Person Management"])

NOT_FOUND = "Person not found."
PICTURE_NOT_FOUND = "Picture not found."
NOT_AN_ARTIST = (
    "Only an author or illustrator has a gallery of works; "
    "this person holds neither role."
)


def _person_or_404(db: Session, viewer, system_id: str) -> models.Person:
    person = find_entity(db, models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, viewer, models.Person, person.system_id, NOT_FOUND)
    return person


def _gallery_out(db: Session, person_id: UUID) -> list[WorkImageOut]:
    return [
        WorkImageOut(
            system_id=attachment.system_id,
            image_id=image.system_id,
            storage_key=image.storage_key,
            thumb_key=image.thumb_key,
            width=image.width,
            height=image.height,
            caption=attachment.caption,
            position=attachment.position,
        )
        for attachment, image in works.gallery(db, person_id)
    ]


@router.get(
    "/{system_id}/work-images",
    response_model=List[WorkImageOut],
    summary="A Person's Gallery of Works",
)
def get_work_images(
    system_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_view_person),
):
    """
    The pictures in display order. Empty unless the viewer can see this
    person hold `author` or `illustrator`: an author whose only such role is
    scoped to a gated type the viewer cannot see shows no works, as the page
    shows no such role.
    """
    person = _person_or_404(db, viewer, system_id)
    visible_roles = without_hidden_scopes(person.roles, hidden_scopes(db, viewer), "scope")
    if not works.holds_gallery_role(visible_roles):
        return []
    return _gallery_out(db, person.system_id)


@router.post(
    "/{system_id}/work-images",
    status_code=201,
    response_model=List[WorkImageOut],
    summary="Add Pictures to a Person's Gallery of Works",
)
def upload_work_images(
    system_id: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_images),
):
    """
    Upload one or more pictures and append them, in the order sent.

    422 when the person holds neither author nor illustrator, checked before
    anything is read. Every file is read and validated before any is stored,
    so one bad file (413 over the cap, 422 not an image) stores none. A
    picture the gallery already holds is not added twice. Returns the whole
    gallery.
    """
    person = _person_or_404(db, admin, system_id)
    if not works.holds_gallery_role(person.roles):
        raise HTTPException(status_code=422, detail=NOT_AN_ARTIST)

    normalized = [(upload.filename, read_upload(upload)) for upload in files]
    for filename, picture in normalized:
        image = save_upload(db, picture, filename, admin)
        works.append(db, person.system_id, image)
    db.commit()
    return _gallery_out(db, person.system_id)


@router.put(
    "/{system_id}/work-images",
    response_model=List[WorkImageOut],
    summary="Reorder a Person's Gallery of Works",
)
def reorder_work_images(
    system_id: str,
    payload: WorkImagesReorder,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_images),
):
    """
    Whole-list order: `attachment_ids` must name every picture in the gallery
    exactly once (422 otherwise). Returns the gallery in its new order.
    """
    person = _person_or_404(db, admin, system_id)
    current = {row.system_id: row for row, _ in works.gallery(db, person.system_id)}
    ids = payload.attachment_ids
    if len(ids) != len(set(ids)) or set(ids) != set(current):
        raise HTTPException(
            status_code=422,
            detail="The order must name every picture in the gallery exactly once.",
        )
    works.renumber(db, [current[attachment_id] for attachment_id in ids])
    db.commit()
    return _gallery_out(db, person.system_id)


@router.patch(
    "/{system_id}/work-images/{attachment_id}",
    response_model=WorkImageOut,
    summary="Caption a Picture in a Person's Gallery of Works",
)
def caption_work_image(
    system_id: str,
    attachment_id: UUID,
    payload: WorkImageCaptionIn,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_images),
):
    """Set or clear one picture's caption; blank clears it."""
    person = _person_or_404(db, admin, system_id)
    attachment = works.find(db, person.system_id, attachment_id)
    if attachment is None:
        raise HTTPException(status_code=404, detail=PICTURE_NOT_FOUND)
    attachment.caption = payload.caption
    db.commit()
    return next(
        row for row in _gallery_out(db, person.system_id) if row.system_id == attachment_id
    )


@router.delete(
    "/{system_id}/work-images/{attachment_id}",
    status_code=204,
    summary="Remove a Picture from a Person's Gallery of Works",
)
def delete_work_image(
    system_id: str,
    attachment_id: UUID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_images),
):
    """
    Take the picture out of the gallery and close the gap. The image and its
    file are deleted too, unless the same bytes are still some other owner's
    image.
    """
    person = _person_or_404(db, admin, system_id)
    attachment = works.find(db, person.system_id, attachment_id)
    if attachment is None:
        raise HTTPException(status_code=404, detail=PICTURE_NOT_FOUND)
    dropped = works.remove(db, person.system_id, attachment)
    db.commit()
    if dropped:
        image_library.delete_file(*dropped)
    return Response(status_code=204)
