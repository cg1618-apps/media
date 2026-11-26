"""
routers/publisher.py
CRUD for publishers and distributors credited on media entries, plus merge.

Mirrors app/routers/studio.py endpoint for endpoint, minus the MAL derivation
and autofill: MAL has no record of a games publisher or a Taiwanese
distributor, so there is nothing to enrich a publisher from.

Deleting a publisher cascades its credits away (see MediaCredit.publisher_id
ondelete="CASCADE") - merge is the fix for a duplicate, repointing every
credit before deleting the loser so credit history survives.
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.dependencies import get_db
from app.routers._entity_patch import prepare_patch
from app.routers._patching import apply_column_patch
from app.services.domain.credit_cards import company_credit_groups
from app.services.domain.credits import (
    CreditSummary,
    credit_summaries,
    find_publisher,
)
from app.services.domain.merge_fill import finish_merge
from app.services.domain.peer_relation import COMPANY_RELATIONS
from app.services.domain.user_rating import ratings_by_owner
from app.services.integrations.image_manager import delete_cover_image
from app.services.rbac.resolver import (
    Viewer,
    require_manage_catalog,
    require_view_publisher,
    viewer_user_id,
)
from app.services.rbac.shared_visibility import (
    apply_shared_visibility,
    hidden_scopes,
    require_visible_shared,
    without_hidden_scopes,
)
from app.utils.content_rating import check_content_rating, without_unset_rating
from app.utils.entity_ref import find_entity
from app.utils.name_normalize import names_of

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/publisher", tags=["Publisher Management"])

NOT_FOUND = "Publisher not found."


def _to_response(
    db: Session,
    publisher: models.Publisher,
    viewer=None,
    summary: Optional[CreditSummary] = None,
    hidden: Optional[frozenset[str]] = None,
    ratings: Optional[dict] = None,
    relation_counts: Optional[dict] = None,
) -> schemas.PublisherResponse:
    # Count only credits on entries the viewer may see. A number is a smaller
    # leak than a title, but "published 3 things, you can see 2" is still one.
    # The media types come out of the same visible pairs.
    #
    # `summary` is passed in by the list route, which resolves the whole page
    # in one pass; a single-entity route leaves it None and pays for one.
    if summary is None:
        summary = credit_summaries(
            db, viewer, [publisher.system_id], models.MediaCredit.publisher_id
        )[publisher.system_id]
    # A scope naming a gated type the viewer cannot see is a hidden
    # connection; a visible publisher omits it rather than naming the type.
    if hidden is None:
        hidden = hidden_scopes(db, viewer)
    # `ratings` is the viewer's own user_rating rows, {id: row}: passed in by
    # the list route for the whole page in one query, looked up here
    # otherwise. A guest has none, and reads null.
    if ratings is None:
        ratings = ratings_by_owner(
            db, "publisher", [publisher.system_id], viewer_user_id(viewer)
        )
    own = ratings.get(publisher.system_id)
    # Passed in by the list route for the whole page, counted here otherwise.
    if relation_counts is None:
        relation_counts = COMPANY_RELATIONS.related_counts(
            db, viewer, "publisher", [publisher.system_id]
        )
    display_logo_file, display_logo_focus = summary.display_logo(
        publisher.logo_file, publisher.logo_focus
    )
    return schemas.PublisherResponse(
        system_id=publisher.system_id,
        public_id=publisher.public_id,
        name_en=publisher.name_en,
        name_cn=publisher.name_cn,
        name_jp=publisher.name_jp,
        name_alt=publisher.name_alt,
        display_name_field=publisher.display_name_field,
        display_name=publisher.display_name,
        my_rating=own.my_rating if own is not None else None,
        logo_file=publisher.logo_file,
        logo_focus=publisher.logo_focus,
        display_logo_file=display_logo_file,
        display_logo_focus=display_logo_focus,
        founded_date=publisher.founded_date,
        defunct_date=publisher.defunct_date,
        country=publisher.country,
        website_url=publisher.website_url,
        content_rating=publisher.content_rating,
        scopes=sorted(
            without_hidden_scopes((s.scope for s in publisher.scopes), hidden)
        ),
        credit_count=summary.count,
        media_types=summary.media_types,
        restricted=summary.restricted,
        has_relations=relation_counts.get(publisher.system_id, 0) > 0,
    )


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/", response_model=List[schemas.PublisherResponse], summary="Get All Publishers"
)
def get_all_publishers(
    scope: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_view_publisher),
):
    """
    Retrieves every publisher, sorted by display name.

    `scope` narrows the list to the publishers offered on one media type, so a
    form asks for the suggestions it can actually use. Omitting it returns
    everything, including publishers holding no scope at all - the admin list
    page must be able to see a publisher in order to give it one.

    A publisher hidden from this viewer (shared_visibility.py) is absent, and
    a `scope` naming a gated type the viewer cannot see matches nobody.
    """
    hidden = hidden_scopes(db, viewer)
    if scope and scope in hidden:
        return []
    # scopes is read by _to_response for every row, so it is preloaded rather
    # than lazy-loaded per publisher - the same N+1 credit_summaries exists to
    # remove, one relationship over.
    query = db.query(models.Publisher).options(
        selectinload(models.Publisher.scopes)
    )
    query = apply_shared_visibility(query, models.Publisher, db, viewer)
    if scope:
        query = query.join(models.PublisherScope).filter(
            models.PublisherScope.scope == scope
        )
    publishers = query.all()
    publishers.sort(key=lambda p: p.display_name.casefold())
    summaries = credit_summaries(
        db,
        viewer,
        [publisher.system_id for publisher in publishers],
        models.MediaCredit.publisher_id,
    )
    ratings = ratings_by_owner(
        db,
        "publisher",
        [publisher.system_id for publisher in publishers],
        viewer_user_id(viewer),
    )
    relations = COMPANY_RELATIONS.related_counts(
        db, viewer, "publisher", [publisher.system_id for publisher in publishers]
    )
    return [
        _to_response(
            db,
            publisher,
            viewer,
            summaries[publisher.system_id],
            hidden,
            ratings,
            relations,
        )
        for publisher in publishers
    ]


@router.get(
    "/{system_id}",
    response_model=schemas.PublisherResponse,
    summary="Get Publisher by ID",
)
def get_publisher_by_id(
    system_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_view_publisher),
):
    """Retrieves a single publisher by its public_id or its UUID."""
    publisher = find_entity(db, models.Publisher, system_id)
    if publisher is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(
        db, viewer, models.Publisher, publisher.system_id, NOT_FOUND
    )
    return _to_response(db, publisher, viewer)


# ==========================================
# RELATED COMPANIES
# ==========================================
# The same relation a studio has (company_relation), read and written from
# this end: the other end is a studio or a publisher, each side keeps its own
# remark, and the companies the viewer may not see are left out.


def _visible_publisher_or_404(db: Session, viewer, system_id: str) -> models.Publisher:
    publisher = find_entity(db, models.Publisher, system_id)
    if publisher is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, viewer, models.Publisher, publisher.system_id, NOT_FOUND)
    return publisher


@router.get(
    "/{system_id}/related",
    response_model=List[schemas.PeerRelationRef],
    summary="Companies Related to This Publisher",
)
def get_related_companies(
    system_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_view_publisher),
):
    """The visible related studios and publishers, ordered by name, each
    with its kind and the remark this publisher's side gives the relation."""
    publisher = _visible_publisher_or_404(db, viewer, system_id)
    return COMPANY_RELATIONS.related_of(db, viewer, ("publisher", publisher.system_id))


@router.put(
    "/{system_id}/related",
    response_model=List[schemas.PeerRelationRef],
    summary="Replace the Companies Related to This Publisher",
)
def put_related_companies(
    system_id: str,
    payload: schemas.PeerRelationsReplace,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Whole-list replace of this side, as for a studio. Each item names a
    visible studio or publisher - `kind`, default publisher - other than this
    publisher (422 otherwise). An item's `also_related_to` relates it to
    other companies on the list as well. Relations to companies the writer
    cannot see are kept.
    """
    publisher = _visible_publisher_or_404(db, admin, system_id)
    COMPANY_RELATIONS.replace_from_payload(
        db, admin, ("publisher", publisher.system_id), payload.relations
    )
    db.commit()
    return COMPANY_RELATIONS.related_of(db, admin, ("publisher", publisher.system_id))


@router.get("/{system_id}/entries", summary="Entries Credited to This Publisher")
def get_publisher_entries(
    system_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_view_publisher),
):
    """
    The entries this publisher is credited on, grouped by media type.
    Each entry is the card the page draws - the type's library card
    without the tracker - built by services/domain/credit_cards.py.

    A publisher hidden from this viewer - every connection hidden, see
    shared_visibility.py - answers 404, as its own page does; a visible
    publisher omits its hidden credits. Visibility runs through the same
    filter_visible_pairs call _to_response uses for credit_count, so the
    number on the card and the list on the page can never disagree.
    """
    publisher = db.get(models.Publisher, system_id)
    if publisher is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, viewer, models.Publisher, system_id, NOT_FOUND)

    return {"groups": company_credit_groups(db, viewer, models.MediaCredit.publisher_id, system_id)}


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", response_model=schemas.PublisherResponse, summary="Create Publisher")
def create_publisher(
    payload: schemas.PublisherCreate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Creates a publisher, or returns the existing one under that name.

    Find-or-create for the same reason as POST /api/studio: the Add and Modify
    forms POST here through ensureSourceValues.js whenever a typed name is not
    in the suggestion list, so a "create" for a publisher that already exists
    is routine, and a second row would split its credits. Matching is on the
    normalized name, the key resolve_publisher uses.

    Metadata on an existing publisher is left untouched - use PUT to edit it.
    """
    # name_alt is a comma-separated list, so its first name is looked up,
    # never the whole value.
    first_name = next(
        iter(names_of(payload, ("name_en", "name_cn", "name_jp", "name_alt"))), ""
    )
    data = without_unset_rating(payload.model_dump())
    wanted = data.pop("scopes", [])
    publisher = find_publisher(db, first_name)
    if publisher is None:
        publisher = models.Publisher(**data)
        db.add(publisher)
        db.flush()

    # Additive, like POST /api/person: a create for a publisher that already
    # exists is routine (ensureSourceValues posts every typed name), and it
    # must not narrow the scopes the existing row holds.
    held = {s.scope for s in publisher.scopes}
    for scope in wanted:
        if scope not in held:
            held.add(scope)
            db.add(
                models.PublisherScope(
                    publisher_id=publisher.system_id, scope=scope
                )
            )
    db.commit()
    db.refresh(publisher)
    return _to_response(db, publisher, admin)


@router.put(
    "/{system_id}",
    response_model=schemas.PublisherResponse,
    summary="Update Publisher",
)
def update_publisher(
    system_id: UUID,
    payload: schemas.PublisherUpdate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Fully updates a publisher's metadata and the set of scopes it holds. Since
    every media_credit points at the publisher row by id, renaming here changes
    what every credited entry shows - no separate propagation step is needed.

    The scopes are a full replace, like PUT /api/person's roles: this is the
    one path an admin uses to take a scope away, so unlike POST it must be able
    to narrow. A scope naming a gated type this editor cannot see is kept: the
    form never showed it, so its absence from the payload is not a removal.
    """
    publisher = db.get(models.Publisher, system_id)
    if publisher is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, admin, models.Publisher, system_id, NOT_FOUND)

    data = without_unset_rating(payload.model_dump())
    wanted = list(dict.fromkeys(data.pop("scopes", [])))
    for key, value in data.items():
        setattr(publisher, key, value)

    hidden = hidden_scopes(db, admin)
    replaced = db.query(models.PublisherScope).filter_by(publisher_id=system_id)
    if hidden:
        replaced = replaced.filter(models.PublisherScope.scope.notin_(hidden))
    replaced.delete(synchronize_session=False)
    for scope in wanted:
        if scope in hidden:
            continue
        db.add(models.PublisherScope(publisher_id=system_id, scope=scope))

    db.commit()
    db.refresh(publisher)
    return _to_response(db, publisher, admin)


@router.patch(
    "/{system_id}",
    response_model=schemas.PublisherResponse,
    summary="Patch Publisher",
)
def patch_publisher(
    system_id: UUID,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Partially updates a publisher's own columns - the detail page's inline
    inline edit. Only the keys sent change; scopes are not a column and are
    edited through PUT. The viewer's rating is written through
    PUT /api/me/ratings/publisher/{id}.

    The same rules as PUT, checked before anything is written:
    display_name_field is en / cn / jp / alt, and
    at least one name survives the patch. Server columns (system_id,
    public_id, timestamps) are a 422; keys that are not columns are ignored
    (_patching.apply_column_patch).
    """
    publisher = db.get(models.Publisher, system_id)
    if publisher is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, admin, models.Publisher, system_id, NOT_FOUND)

    apply_column_patch(
        publisher,
        prepare_patch(
            publisher, payload, "publisher", {"content_rating": check_content_rating}
        ),
    )

    db.commit()
    db.refresh(publisher)
    return _to_response(db, publisher, admin)


@router.delete("/{system_id}", summary="Delete Publisher")
def delete_publisher(
    system_id: UUID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Permanently deletes a publisher. Its credits cascade away with it - see
    the merge endpoint for the correct fix when this publisher is a duplicate.
    """
    publisher = db.get(models.Publisher, system_id)
    if publisher is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, admin, models.Publisher, system_id, NOT_FOUND)

    db.delete(publisher)
    db.commit()

    # Studio's delete path never does this, so a deleted studio leaks its logo
    # (cleanup exists only for media entries: _factory.py:31,
    # calculation.py:278). Publisher does not inherit that gap.
    delete_cover_image("publisher", str(system_id))

    return {"status": "success", "message": "Publisher deleted successfully."}


@router.post("/{system_id}/merge", summary="Merge Another Publisher Into This One")
def merge_publisher(
    system_id: UUID,
    payload: schemas.MergeRequest,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Repoint every credit from `source_id` onto this publisher, then delete the
    source. This - not delete - is the fix for a duplicate: deleting cascades
    the credits away, so merging is the only way to keep them. Every column
    this publisher leaves blank is filled from the source's (`merge_fill`).
    """
    if system_id == payload.source_id:
        raise HTTPException(
            status_code=400, detail="Cannot merge a publisher into itself."
        )

    keep = db.get(models.Publisher, system_id)
    drop = db.get(models.Publisher, payload.source_id)
    if keep is None or drop is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    for publisher_id in (system_id, payload.source_id):
        require_visible_shared(db, admin, models.Publisher, publisher_id, NOT_FOUND)

    # media_id alone identifies the entry - it is globally unique across the
    # nine media tables, which is what the supertable bought.
    held = {
        (c.media_id, c.role)
        for c in db.query(models.MediaCredit).filter_by(publisher_id=system_id).all()
    }
    moved = 0
    for credit in (
        db.query(models.MediaCredit).filter_by(publisher_id=payload.source_id).all()
    ):
        if (credit.media_id, credit.role) in held:
            db.delete(credit)
            continue
        credit.publisher_id = system_id
        moved += 1

    # A merge must never narrow: the survivor is offered everywhere either row
    # was, or a form that used to suggest the loser would silently stop
    # suggesting anyone.
    held_scopes = {s.scope for s in keep.scopes}
    for scope_row in drop.scopes:
        if scope_row.scope not in held_scopes:
            held_scopes.add(scope_row.scope)
            db.add(
                models.PublisherScope(
                    publisher_id=system_id, scope=scope_row.scope
                )
            )

    # Before finish_merge deletes the source, whose relations would cascade.
    COMPANY_RELATIONS.merge_relations(db, "publisher", system_id, payload.source_id)
    finish_merge(db, "publisher", keep, drop)
    return {"status": "success", "credits_moved": moved}
