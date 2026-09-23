"""
routers/covers.py
Serve a stored cover image, to the sessions allowed to see what it depicts.

Covers are NOT static files, and that is the whole point of this module. Their
storage key is `<owner_type>/<system_id>.jpg`, so the URL of any entry's cover
is CONSTRUCTIBLE by anyone who learns the id - and a cover is precisely what a
content label exists to hide. Serving the tree from an unauthenticated mount
therefore handed out the labelled artwork to anyone holding an id, whatever the
API said. So `static/covers/` is not mounted at all (see app/main.py) and this
route is the only way bytes leave that folder.

Library uploads (`static/library/`) and quote images (`static/quotes/`) keep
the plain mount. They are content-addressed or legacy-named rather than keyed
on an entry id, so their URLs cannot be constructed from something a viewer
already holds - see the residuals list in docs/authorization.md, which records
that unguessable is not the same as guarded.
"""

import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models
from app.dependencies import get_db
from app.services.integrations.image_manager import COVER_DIR, COVER_OWNERS
from app.services.rbac.enforcement import entry_visible
from app.services.rbac.resolver import Viewer, get_viewer
from app.services.rbac.shared_visibility import (
    ENTITY_OWNER_MODELS,
    shared_record_visible,
)

router = APIRouter(prefix="/api/covers", tags=["Images"])

# Long enough that a list page of forty covers is not forty round trips on
# every navigation, short enough that a re-downloaded cover appears without
# anyone clearing anything. PRIVATE because the response depends on who is
# asking: a shared cache holding one would hand a narrowed session the very
# image this route exists to withhold.
CACHE_CONTROL = "private, max-age=300"

NOT_FOUND = "Cover image not found"


def _owner_hidden(
    db: Session, viewer: Viewer, owner_type: str, owner_id: UUID
) -> bool:
    """
    Whether the gates hide the thing this image depicts.

    For an entry, the media type is resolved from the `media` row, never read
    out of the URL. A caller-supplied type paired with a caller-supplied id
    gates under the WRONG `media_type.<key>` permission - the trap
    `enforcement.require_visible_media` documents for the write side, and it
    is no less live here, where both halves of the pair come from the path.

    An id naming no `media` row belongs to one of the entity owners - staff
    and character portraits, publisher and studio logos - which are shared
    records: hidden when every connection they have is hidden
    (`shared_visibility.py`). Their owner type IS read from the path, and that
    is safe: the file served is `<owner_type>/<id>.jpg`, so the folder named
    is the table whose row the image belongs to, and naming another folder
    names another file.
    """
    row = (
        db.query(models.Media.media_type)
        .filter(models.Media.system_id == owner_id)
        .first()
    )
    if row is not None:
        return not entry_visible(db, viewer, row.media_type, owner_id)
    model = ENTITY_OWNER_MODELS.get(owner_type)
    if model is None:
        return False
    return not shared_record_visible(db, viewer, model, owner_id)


@router.get("/{owner_type}/{filename}", summary="Fetch One Cover Image")
def get_cover_image(
    owner_type: str,
    filename: str,
    request: Request,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    One cover image, or 404.

    404 and never 403, for the same reason every gated router here does it: a
    hidden entry has to be indistinguishable from a missing one, or the status
    code becomes the existence oracle the gate was meant to close. A bad owner
    type, an unparseable id, an absent file and a refusal all answer
    identically.
    """
    if owner_type not in COVER_OWNERS:
        raise HTTPException(status_code=404, detail=NOT_FOUND)

    stem, _, extension = filename.rpartition(".")
    if extension != "jpg":
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    try:
        entry_id = UUID(stem)
    except ValueError:
        # Also what closes path traversal: the only filename this route can
        # build is the canonical form of a parsed UUID, so `..` never reaches
        # os.path.join at all.
        raise HTTPException(status_code=404, detail=NOT_FOUND)

    if _owner_hidden(db, viewer, owner_type, entry_id):
        raise HTTPException(status_code=404, detail=NOT_FOUND)

    path = os.path.join(COVER_DIR, owner_type, f"{entry_id}.jpg")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=NOT_FOUND)

    # Revalidation after max-age expires, so a browser holding a still-current
    # cover pays a 304 rather than the bytes. Derived from the file rather than
    # its content: hashing every cover on every request would cost more than
    # the transfer it saves.
    stat = os.stat(path)
    etag = f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"'
    if request.headers.get("if-none-match") == etag:
        return Response(
            status_code=304, headers={"ETag": etag, "Cache-Control": CACHE_CONTROL}
        )

    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"ETag": etag, "Cache-Control": CACHE_CONTROL},
    )
