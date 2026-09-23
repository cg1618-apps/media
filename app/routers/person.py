"""
routers/person.py
CRUD for people credited on media entries, plus scoped role filtering and merge.

Deleting a person cascades their media_credit rows away (see
MediaCredit.person_id ondelete="CASCADE") - that is the chosen design for a
genuine removal. Their character_casting rows do not cascade: person_id there
is ON DELETE SET NULL (Decision H), because a casting is the character's link
to the work, not the person's - deleting a seiyuu only un-casts them. Merge
exists because deleting is the WRONG fix for a duplicate: it repoints every
credit and unions the person_role rows onto the survivor before deleting the
loser, so no credit history is lost.
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.dependencies import get_db
from app.services.domain.credits import credit_counts, find_person
from app.services.domain.membership import (
    clubs_of,
    members_of,
    merge_memberships,
    replace_clubs,
    replace_members,
)
from app.services.rbac.enforcement import (
    filter_visible_pairs,
    label_hidden_entry_ids,
)
from app.services.rbac.resolver import Viewer, get_viewer, require_manage_catalog
from app.services.rbac.shared_visibility import (
    apply_shared_visibility,
    hidden_scopes,
    require_visible_shared,
    without_hidden_scopes,
)
from app.utils.credit_roles import PERSON_ROLES, credit_label, legal_scopes
from app.utils.entity_ref import find_entity
from app.utils.media_resolver import MEDIA_TABLES
from app.utils.name_normalize import name_slot_for
from app.utils.release_date import primary_release_value

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/person", tags=["Person Management"])

NOT_FOUND = "Person not found."


def _to_response(
    db: Session,
    person: models.Person,
    viewer=None,
    credit_count: Optional[int] = None,
    hidden: Optional[frozenset[str]] = None,
) -> schemas.PersonResponse:
    # Count credits on entries the viewer may see, from BOTH stores: a seiyuu
    # has no media_credit rows at all (see credit_roles.CreditRole.credited_via)
    # and would otherwise read "0 credits" despite fifty castings. Both stores
    # go through ONE filter_visible_pairs call so the card's number and the
    # /entries list can never disagree about which pairs are visible.
    #
    # `credit_count` is passed in by the list route, which resolves the whole
    # page in one pass; a single-entity route leaves it None and pays for one.
    if credit_count is None:
        credit_count = credit_counts(
            db,
            viewer,
            [person.system_id],
            models.MediaCredit.person_id,
            include_castings=True,
        ).get(person.system_id, 0)
    # A role scoped to a gated type the viewer cannot see is a hidden
    # connection, and a visible person omits it rather than naming the type.
    if hidden is None:
        hidden = hidden_scopes(db, viewer)
    return schemas.PersonResponse(
        system_id=person.system_id,
        public_id=person.public_id,
        name_en=person.name_en,
        name_cn=person.name_cn,
        name_jp=person.name_jp,
        name_alt=person.name_alt,
        display_name_field=person.display_name_field,
        display_name=person.display_name,
        gender=person.gender,
        my_rating=person.my_rating,
        photo_file=person.photo_file,
        remark=person.remark,
        roles=[
            schemas.PersonRoleIn(role=r.role, scope=r.scope)
            for r in without_hidden_scopes(person.roles, hidden, "scope")
        ],
        credit_count=credit_count,
    )


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get("/", response_model=List[schemas.PersonResponse], summary="Get All People")
def get_all_people(
    role: Optional[str] = Query(default=None),
    scope: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Retrieves people, optionally filtered to those who hold a given role, and
    to one media-type scope of it.

    Both filters are exact. Every person_role row carries a scope, so a query
    WITHOUT `scope` means "holds this role in any media type" - the admin list
    wants that, and no dropdown asks for it.

    A person hidden from this viewer (shared_visibility.py) is absent, and a
    `scope` naming a gated type the viewer cannot see matches nobody, so the
    answer cannot confirm the type has people.
    """
    hidden = hidden_scopes(db, viewer)
    if scope and scope in hidden:
        return []
    # roles is read by _to_response for every row, so it is preloaded rather
    # than lazy-loaded per person - the same N+1 credit_counts exists to
    # remove, one relationship over.
    query = db.query(models.Person).options(selectinload(models.Person.roles))
    query = apply_shared_visibility(query, models.Person, db, viewer)
    if role:
        query = query.join(models.PersonRole)
        query = query.filter(models.PersonRole.role == role)
        if scope:
            query = query.filter(models.PersonRole.scope == scope)
        elif hidden:
            query = query.filter(models.PersonRole.scope.notin_(hidden))
    people = query.distinct().all()
    # Sorted in Python, not SQL: display_name is a property over four columns
    # with a per-row choice, so no single ORDER BY column can express it.
    people.sort(key=lambda p: p.display_name.casefold())
    counts = credit_counts(
        db,
        viewer,
        [person.system_id for person in people],
        models.MediaCredit.person_id,
        include_castings=True,
    )
    return [
        _to_response(db, person, viewer, counts.get(person.system_id, 0), hidden)
        for person in people
    ]


@router.get(
    "/role-counts",
    response_model=dict[str, int],
    summary="Count People per Role",
)
def get_role_counts(
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    How many distinct people hold each person_role, zeros included.

    Declared BEFORE /{system_id} on purpose: that route parses its path as a
    UUID, so "role-counts" would 422 there if this came second.

    Counts people, not person_role rows - a director scoped for
    all three of their media types has three rows but is one person. Counts
    only the people and role scopes this viewer may see, so the tally agrees
    with the list it heads.
    """
    hidden = hidden_scopes(db, viewer)
    query = db.query(
        models.PersonRole.role,
        func.count(func.distinct(models.PersonRole.person_id)),
    ).join(models.Person, models.PersonRole.person_id == models.Person.system_id)
    query = apply_shared_visibility(query, models.Person, db, viewer)
    if hidden:
        query = query.filter(models.PersonRole.scope.notin_(hidden))
    tallied = dict(query.group_by(models.PersonRole.role).all())
    return {role: tallied.get(role, 0) for role in PERSON_ROLES}


@router.get(
    "/role-scopes",
    response_model=dict[str, list[str]],
    summary="Legal Scopes per Person Role",
)
def get_role_scopes(
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Which media types each person role may be scoped to.

    The person form offers exactly these, so an admin cannot give a role a
    scope naming a credit that does not exist - (composer, manga), say. Derived
    from the same CreditRole.media_types that PersonRoleIn validates against,
    so the form and the validator cannot drift.

    Not on /api/constants: that endpoint serves one flat list per key, and this
    is a map of lists. Declared BEFORE /{system_id} for the same reason
    role-counts is - that route parses its path as a UUID.

    A gated type the viewer cannot see is left out, as it is everywhere else.
    """
    hidden = hidden_scopes(db, viewer)
    return {
        role: without_hidden_scopes(legal_scopes(role), hidden)
        for role in PERSON_ROLES
    }


@router.get("/{system_id}/entries", summary="Entries This Person Is Credited On")
def get_person_entries(
    system_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    The entries this person is credited on, grouped by media type AND role.

    The reverse of GET /api/credits/{media_type}/{entry_id}, and the mirror of
    the studio endpoint - except that a person can hold several roles, so the
    group key is the pair and each group carries the label that credit has on
    that media type (原作 on a manga, Author on a novel).

    A person hidden from this viewer - every connection hidden, see
    shared_visibility.py - answers 404, as the person's own page does. A
    visible person's credits on label-hidden entries are omitted whole, group
    and all: a group left behind empty would still name the hidden work's
    media type. A credit withheld only by a media-type permission gap keeps
    its group, empty, because that gap does not hide the connection.

    Visibility runs through the same filter_visible_pairs call _to_response
    uses for credit_count, so the number on the card and the list on the page
    can never disagree.
    """
    person = db.get(models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, viewer, models.Person, system_id, NOT_FOUND)

    # Joined to media for the row's type: media_credit no longer carries its
    # own copy, and one join answers for every media table at once.
    rows = (
        db.query(models.MediaCredit, models.Media.media_type)
        .join(models.Media, models.MediaCredit.media_id == models.Media.system_id)
        .filter(models.MediaCredit.person_id == system_id)
        .order_by(models.MediaCredit.position)
        .all()
    )
    # A seiyuu's work lives in character_casting, not media_credit - see
    # credit_roles.CreditRole.credited_via - so it is walked and grouped
    # alongside the credit rows, through the same visibility pass, rather
    # than as a separate endpoint.
    casting_rows = (
        db.query(models.CharacterCasting)
        .filter(models.CharacterCasting.person_id == system_id)
        .order_by(models.CharacterCasting.position)
        .all()
    )
    visible = set(
        filter_visible_pairs(
            db,
            viewer,
            [(media_type, r.media_id) for r, media_type in rows]
            + [
                (r.media_type, r.entry_id)
                for r in casting_rows
                if r.media_type and r.entry_id
            ],
        )
    )
    label_hidden = label_hidden_entry_ids(
        db,
        viewer,
        [r.media_id for r, _ in rows] + [r.entry_id for r in casting_rows],
    )
    rows = [(r, mt) for r, mt in rows if r.media_id not in label_hidden]
    casting_rows = [r for r in casting_rows if r.entry_id not in label_hidden]

    # One query per media type that appears, not one per credit/casting row.
    wanted: dict[str, set[UUID]] = {}
    for row, media_type in rows:
        if (media_type, row.media_id) in visible:
            wanted.setdefault(media_type, set()).add(row.media_id)
    for row in casting_rows:
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

    # character_id -> Character, for character_name/character_id on each
    # seiyuu entry. One bulk query, not one per casting row.
    character_ids = {r.character_id for r in casting_rows}
    characters = (
        {
            c.system_id: c
            for c in db.query(models.Character).filter(
                models.Character.system_id.in_(character_ids)
            )
        }
        if character_ids
        else {}
    )

    groups: dict[tuple[str, str], list] = {}
    for row, media_type in rows:
        if media_type not in MEDIA_TABLES:
            continue
        # setdefault before the visibility check on purpose: a group whose
        # entries are withheld only by a media-type gap still exists, empty.
        # Label-hidden rows were dropped above and make no group at all.
        payload = groups.setdefault((media_type, row.role), [])
        entry = loaded.get(media_type, {}).get(row.media_id)
        if entry is None:
            continue
        payload.append(
            {
                "system_id": str(entry.system_id),
                "display_name": entry.display_name,
                "public_id": entry.public_id,
                "cover_image_file": getattr(entry, "cover_image_file", None),
                "release_date": primary_release_value(media_type, entry),
            }
        )

    for row in casting_rows:
        if row.media_type not in MEDIA_TABLES:
            continue
        # Same "group exists even when empty" rule as the media_credit loop.
        payload = groups.setdefault((row.media_type, "seiyuu"), [])
        entry = loaded.get(row.media_type, {}).get(row.entry_id)
        if entry is None:
            continue
        character = characters.get(row.character_id)
        payload.append(
            {
                "system_id": str(entry.system_id),
                "display_name": entry.display_name,
                "public_id": entry.public_id,
                "cover_image_file": getattr(entry, "cover_image_file", None),
                "release_date": primary_release_value(row.media_type, entry),
                "character_name": character.display_name if character else None,
                "character_id": str(character.system_id) if character else None,
            }
        )

    out = []
    for (media_type, role), entries in groups.items():
        # Newest first; an undated entry sorts last, as UNDATED does elsewhere.
        entries.sort(key=lambda e: e["release_date"] or "", reverse=True)
        ref = MEDIA_TABLES[media_type]
        out.append(
            {
                "media_type": media_type,
                "role": role,
                "label": credit_label(role, media_type),
                "nav_path": ref.nav_path,
                "entries": entries,
            }
        )
    return {"groups": out}


# ==========================================
# CLUB MEMBERSHIP
# ==========================================
# A club is a person holding the `club` role; its members are artists. Both
# lists are read through the shared-record rule: the person asked about must
# be visible (404 otherwise), and the other ends the viewer may not see are
# simply left out. Membership is not a connection, so it reveals nobody.


def _visible_person_or_404(db: Session, viewer, system_id: str) -> models.Person:
    person = find_entity(db, models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, viewer, models.Person, person.system_id, NOT_FOUND)
    return person


@router.get(
    "/{system_id}/clubs",
    response_model=List[schemas.MembershipRef],
    summary="Clubs This Person Belongs To",
)
def get_person_clubs(
    system_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """The visible clubs this artist belongs to, ordered by name."""
    person = _visible_person_or_404(db, viewer, system_id)
    return clubs_of(db, viewer, person.system_id)


@router.put(
    "/{system_id}/clubs",
    response_model=List[schemas.MembershipRef],
    summary="Replace the Clubs This Person Belongs To",
)
def put_person_clubs(
    system_id: str,
    payload: schemas.ClubsReplace,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Whole-list replace. Every id must be a visible person holding the `club`
    role (422 otherwise); memberships of clubs the writer cannot see are kept.
    """
    person = _visible_person_or_404(db, admin, system_id)
    replace_clubs(db, admin, person.system_id, payload.club_ids)
    db.commit()
    return clubs_of(db, admin, person.system_id)


@router.get(
    "/{system_id}/members",
    response_model=List[schemas.MembershipRef],
    summary="A Club's Members",
)
def get_club_members(
    system_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """The visible members of a club, in the club's order. Empty for a person
    who is not a club."""
    person = _visible_person_or_404(db, viewer, system_id)
    return members_of(db, viewer, person.system_id)


@router.put(
    "/{system_id}/members",
    response_model=List[schemas.MembershipRef],
    summary="Replace a Club's Members",
)
def put_club_members(
    system_id: str,
    payload: schemas.MembersReplace,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Whole-list replace, in display order. The person must hold the `club`
    role and every id must be a visible person (422 otherwise); members the
    writer cannot see keep their rows, after the visible ones.
    """
    person = _visible_person_or_404(db, admin, system_id)
    replace_members(db, admin, person.system_id, payload.member_ids)
    db.commit()
    return members_of(db, admin, person.system_id)


@router.get(
    "/{system_id}", response_model=schemas.PersonResponse, summary="Get Person by ID"
)
def get_person_by_id(
    system_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Retrieves a single person by their public_id or their UUID."""
    person = find_entity(db, models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, viewer, models.Person, person.system_id, NOT_FOUND)
    return _to_response(db, person, viewer)


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", response_model=schemas.PersonResponse, summary="Create Person")
def create_person(
    payload: schemas.PersonCreate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Creates a person, or returns the existing one under that name with the
    requested roles added.

    Deliberately find-or-create, matching resolve_person, because this endpoint
    is not only an admin form: ensureSourceValues.js POSTs here whenever a
    typed name is missing from a ROLE-FILTERED suggestion list. Typing an
    existing producer's name into anime's Director field therefore arrives as
    a "create" for someone who already exists, and minting a second row would
    split their credits across two people. Matching is on the normalized name,
    the same key resolve_person uses, so the two writers agree.

    A payload may carry the four labelled name columns (the admin form) or one
    unslotted `name` (every other writer); see schemas.PersonCreate. An
    unslotted name is placed by name_slot_for, using the first requested role
    for context, so the column it lands in matches what resolve_person would
    have chosen for the same name.

    Metadata on an existing person is left untouched - use PUT to edit it.
    """
    data = payload.model_dump(exclude={"roles", "name"})
    lookup = payload.name or next(
        n
        for n in (
            payload.name_en, payload.name_cn, payload.name_jp, payload.name_alt
        )
        if n
    )
    person = find_person(db, lookup)
    if person is None:
        if payload.name:
            first = payload.roles[0] if payload.roles else None
            slot = name_slot_for(
                payload.name.strip(),
                role=first.role if first else "",
                scope=first.scope if first else "",
            )
            data[f"name_{slot}"] = payload.name.strip()
        person = models.Person(**data)
        db.add(person)
        db.flush()

    held = {(r.role, r.scope) for r in person.roles}
    for role_in in payload.roles:
        if (role_in.role, role_in.scope) in held:
            continue
        db.add(
            models.PersonRole(
                person_id=person.system_id, role=role_in.role, scope=role_in.scope
            )
        )
        held.add((role_in.role, role_in.scope))

    db.commit()
    db.refresh(person)
    return _to_response(db, person)


@router.put(
    "/{system_id}", response_model=schemas.PersonResponse, summary="Update Person"
)
def update_person(
    system_id: UUID,
    payload: schemas.PersonUpdate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Fully updates a person's metadata and the set of roles they hold.

    Roles scoped to a gated type this editor cannot see are kept: the form
    never showed them, so their absence from the payload is not a removal.
    """
    person = db.get(models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, admin, models.Person, system_id, NOT_FOUND)

    data = payload.model_dump(exclude={"roles"})
    for key, value in data.items():
        setattr(person, key, value)

    hidden = hidden_scopes(db, admin)
    replaced = db.query(models.PersonRole).filter_by(person_id=system_id)
    if hidden:
        replaced = replaced.filter(models.PersonRole.scope.notin_(hidden))
    replaced.delete(synchronize_session=False)
    seen = {(r.role, r.scope) for r in person.roles if r.scope in hidden}
    for role_in in payload.roles:
        if (role_in.role, role_in.scope) in seen:
            continue
        seen.add((role_in.role, role_in.scope))
        db.add(
            models.PersonRole(
                person_id=system_id, role=role_in.role, scope=role_in.scope
            )
        )

    db.commit()
    db.refresh(person)
    return _to_response(db, person)


@router.delete("/{system_id}", summary="Delete Person")
def delete_person(
    system_id: UUID,
    credits: int = Query(..., description="Credit count the admin confirmed"),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Permanently deletes a person. Their media_credit rows cascade away with
    them - see the merge endpoint for the correct fix when this person is a
    duplicate.

    Their character_casting rows do NOT: person_id there is ON DELETE SET
    NULL, not CASCADE (Decision H), because a casting is the CHARACTER's link
    to the work, not the person's. Deleting a seiyuu merely un-casts them -
    the character keeps their place in the anime with no seiyuu attached.

    `credits` is the count the UI showed in its confirmation - media_credit
    rows plus castings, the same total credit_count and /entries already use
    - and it is REQUIRED. If it no longer matches, the request is rejected
    with 409: the admin agreed to a specific number, and a count that moved
    underneath them - another session crediting or casting this person while
    the dialog was open - is not what they agreed to.
    """
    person = db.get(models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, admin, models.Person, system_id, NOT_FOUND)

    actual = (
        db.query(models.MediaCredit).filter_by(person_id=system_id).count()
        + db.query(models.CharacterCasting).filter_by(person_id=system_id).count()
    )
    if actual != credits:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This person now has {actual} credits, not {credits}. "
                "Reload and confirm again."
            ),
        )

    db.delete(person)
    db.commit()

    return {"status": "success", "message": "Person deleted successfully."}


@router.post("/{system_id}/merge", summary="Merge Another Person Into This One")
def merge_person(
    system_id: UUID,
    payload: schemas.MergeRequest,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Repoint every credit and role from `source_id` onto this person, then delete
    the source. This - not delete - is the fix for a duplicate: deleting cascades
    the credits away, so merging is the only way to keep them.
    """
    if system_id == payload.source_id:
        raise HTTPException(
            status_code=400, detail="Cannot merge a person into itself."
        )

    keep = db.get(models.Person, system_id)
    drop = db.get(models.Person, payload.source_id)
    if keep is None or drop is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    for person_id in (system_id, payload.source_id):
        require_visible_shared(db, admin, models.Person, person_id, NOT_FOUND)

    # media_id alone identifies the entry - it is globally unique across the
    # nine media tables, which is what the supertable bought.
    held = {
        (c.media_id, c.role)
        for c in db.query(models.MediaCredit).filter_by(person_id=system_id).all()
    }
    moved = 0
    for credit in (
        db.query(models.MediaCredit).filter_by(person_id=payload.source_id).all()
    ):
        if (credit.media_id, credit.role) in held:
            db.delete(credit)
            continue
        credit.person_id = system_id
        moved += 1

    keep_roles = {(r.role, r.scope) for r in keep.roles}
    for role_row in list(drop.roles):
        if (role_row.role, role_row.scope) not in keep_roles:
            db.add(
                models.PersonRole(
                    person_id=system_id, role=role_row.role, scope=role_row.scope
                )
            )

    # Club memberships follow the survivor too, in both directions.
    merge_memberships(db, system_id, payload.source_id)

    db.delete(drop)
    db.commit()
    return {"status": "success", "credits_moved": moved}
