"""
routers/credits.py
Read and replace one media entry's credits and tags in a single call.

Mirrors how the Add/Modify forms already submit: the whole set for a field at
once, not incremental adds. GET returns only the roles/fields that actually
have rows - a bare entry returns two empty maps. PUT touches only the roles
and fields named in the payload; a role absent from the body is left alone,
one present with an empty list is cleared.

A game's developer (studio) and publisher are pick-only: every name must
already be a row, or the whole PUT is refused with a 422 naming each one.
Every other credit is find-or-create.
"""

from typing import Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.services.domain import credits as credits_service
from app.services.domain.label_tags import LABEL_FIELD, apply_tag_write
from app.services.domain.sources import (
    EXCLUSIVE_SOURCE_FIELD,
    EXCLUSIVE_SOURCE_TYPES,
    exclusive_source_problem,
)
from app.services.rbac.enforcement import entry_visible
from app.services.rbac.resolver import Viewer, get_viewer, require_manage_catalog
from app.services.rbac.shared_visibility import own_hiding
from app.utils.credit_roles import CREDIT_ROLES, credit_roles_for, tag_fields_for
from app.utils.media_resolver import MEDIA_TABLES

router = APIRouter(prefix="/api/credits", tags=["Credits"])


class CreditsAndTags(BaseModel):
    credits: Dict[str, List[str]] = {}
    tags: Dict[str, List[str]] = {}


def _resolve_entry(db: Session, media_type: str, entry_id: UUID, viewer):
    """
    Validate media_type first, so an unknown type is a 400 not a KeyError.

    `viewer` is required and the visibility test is not optional: the GET above
    has asked since the content-label work and the PUT below never did, so a
    holder of manage.catalog lacking the label could rewrite an entry it cannot
    read. Writes follow reads (decision 9), and the 404 message is the one a
    genuinely missing entry gets.
    """
    if media_type not in MEDIA_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown media type: {media_type}")

    model = MEDIA_TABLES[media_type].model
    entry = db.get(model, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    if not entry_visible(db, viewer, media_type, entry_id):
        raise HTTPException(status_code=404, detail="Entry not found.")
    return entry


def _pick_only_refusal(picked: dict) -> str | None:
    """
    The 422 message for pick-only credits naming no row, or several; None
    when every name matched exactly one. Names every offending value, so one
    refusal is enough to fix the whole form.
    """
    problems = []
    for role, match in picked.items():
        target = CREDIT_ROLES[role].target
        problems += [f'no {target} is named "{name}"' for name in match.unknown]
        problems += [
            f'"{e.name}" matches {len(e.matches)} {target} rows'
            for e in match.ambiguous
        ]
    if not problems:
        return None
    return (
        "Not saved: "
        + "; ".join(problems)
        + ". A developer or publisher is picked, never created here: add it "
        "from its own Add tab first (or merge the duplicate), then pick it."
    )


@router.get("/usage", summary="How many entries of each type use each value")
def get_credit_usage(
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    `{media_type: {studio, publisher, person: {role}, option}}`, each a map
    of id to the number of visible entries of that type using it. The Add
    and Modify forms fetch it once, beside their suggestion lists, and order
    those lists by it; the library and search pages never read it. See
    credits_service.credit_usage.
    """
    return credits_service.credit_usage(db, viewer)


@router.get("/{media_type}/{entry_id}", summary="Get an entry's credits and tags")
def get_credits(
    media_type: str,
    entry_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Returns only the roles and fields that actually have rows. A person,
    studio or publisher rated above the viewer's access mode, and a person
    carrying a label it lacks, is left out (shared_visibility.own_hiding);
    the entry itself stays visible.
    """
    _resolve_entry(db, media_type, entry_id, viewer)

    hidden = own_hiding(db, viewer)
    credits_out: Dict[str, List[str]] = {}
    for role_spec in credit_roles_for(media_type):
        names = credits_service.credit_names(db, entry_id, role_spec.key, hidden)
        if names:
            credits_out[role_spec.key] = names

    tags_out: Dict[str, List[str]] = {}
    for field_spec in tag_fields_for(media_type):
        values = credits_service.tag_values(db, entry_id, field_spec.key)
        if values:
            tags_out[field_spec.key] = values

    return {"credits": credits_out, "tags": tags_out}


@router.put("/{media_type}/{entry_id}", summary="Replace an entry's credits and tags")
def replace_credits(
    media_type: str,
    entry_id: UUID,
    payload: CreditsAndTags,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Replaces only the roles and fields named in the payload.

    A credit naming a person, studio or publisher the editor's access mode
    hides (its rating, or a person's labels) is kept where it is: GET never
    showed it, so leaving it out of the payload is not a removal.
    """
    _resolve_entry(db, media_type, entry_id, admin)
    kept = own_hiding(db, admin)

    allowed_roles = {r.key for r in credit_roles_for(media_type)}
    allowed_fields = {f.key for f in tag_fields_for(media_type)}

    for role in payload.credits:
        if role not in allowed_roles:
            raise HTTPException(
                status_code=400,
                detail=f"'{role}' is not a valid credit role for {media_type}.",
            )
    for field in payload.tags:
        if field not in allowed_fields:
            raise HTTPException(
                status_code=400,
                detail=f"'{field}' is not a valid tag field for {media_type}.",
            )

    SINGLE_VALUED = {"exclusive_source"}
    for field, values in payload.tags.items():
        if field in SINGLE_VALUED and len(values) > 1:
            raise HTTPException(
                status_code=400,
                detail=f"{field} takes at most one value, got {len(values)}",
            )

    # A pick-only credit (a game's developer and publisher) names companies
    # that already exist. Every name is checked before anything is written,
    # so a refusal leaves the entry exactly as it was.
    picked = {
        role: credits_service.match_existing_credits(db, role, names)
        for role, names in payload.credits.items()
        if credits_service.is_pick_only(media_type, role)
    }
    refusal = _pick_only_refusal(picked)
    if refusal:
        raise HTTPException(status_code=422, detail=refusal)

    # The Label tags carry through to the entry's content labels (and the nsfw
    # rule back), so a tag edit changes who can see it. Resolved before any
    # write: a refused NSFW removal must leave everything as it was.
    tags = dict(payload.tags)
    if LABEL_FIELD in tags:
        tags[LABEL_FIELD] = apply_tag_write(
            db, media_type, entry_id, list(tags[LABEL_FIELD])
        )

    for role, names in payload.credits.items():
        if role in picked:
            credits_service.credit_existing(
                db, media_type, entry_id, role, picked[role], kept
            )
        else:
            credits_service.replace_credits(
                db, media_type, entry_id, role, names, kept
            )
    for field, values in tags.items():
        credits_service.replace_tags(db, entry_id, field, values)

    # The exclusive source is checked against the sources already stored: the
    # forms save the entry, and its sources, before they PUT the tags. Only a
    # PUT that names the field is checked, so a row stored before the rule
    # does not block an edit of its genres.
    if media_type in EXCLUSIVE_SOURCE_TYPES and EXCLUSIVE_SOURCE_FIELD in tags:
        problem = exclusive_source_problem(db, entry_id)
        if problem:
            db.rollback()
            raise HTTPException(status_code=422, detail=problem)

    db.commit()
    return {"status": "success"}
