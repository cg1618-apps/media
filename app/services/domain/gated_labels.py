"""
The system labels the gated types require, kept on entries and franchises.

A gated type (app/services/rbac/gated_types.py, REQUIRED_LABEL_FOR_TYPE) is
one whose every entry carries one content label. A missing label means a
PUBLIC entry, so the label is never left to the admin: this module attaches it
server-side and refuses a request that would take it off (422). The same holds
for a franchise whose type list names a gated type's franchise type
(FRANCHISE_TYPE_FOR): `H-Comic` brings `h-comic`, `Hentai` brings `hentai`,
and a franchise holding both carries both.

Written once for every gated type; each type's own module
(app/services/domain/h_comic.py, hentai.py) calls it with its label key.
Every function is idempotent.
"""

from typing import Iterable

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models

# label key -> (display name, description). The system labels, one per gated
# type. A migration keeps a frozen copy of its own row; the lifespan seeds
# from here.
SYSTEM_LABELS: dict[str, tuple[str, str]] = {
    "h-comic": (
        "H-Comic",
        "Adult comics. Carried by every h-comic entry and every H-Comic "
        "franchise; seen in the unrestricted mode only.",
    ),
    "hentai": (
        "Hentai",
        "Adult anime. Carried by every hentai entry and every Hentai "
        "franchise; seen in the unrestricted mode only.",
    ),
}


def _required_label_for_type() -> dict[str, str]:
    # Imported per call: the rbac layer imports the domain layer's models,
    # and this module is loaded while app.services.domain initialises.
    from app.services.rbac.gated_types import REQUIRED_LABEL_FOR_TYPE

    return REQUIRED_LABEL_FOR_TYPE


def label_for_franchise_type() -> dict[str, str]:
    """{franchise type: the label key it brings}, for every gated type."""
    from app.services.domain.hierarchy import FRANCHISE_TYPE_FOR

    return {
        str(FRANCHISE_TYPE_FOR[media_type].value): label_key
        for media_type, label_key in _required_label_for_type().items()
        if media_type in FRANCHISE_TYPE_FOR
    }


def franchise_label_keys(franchise) -> list[str]:
    """The label keys a franchise's types require, in type-list order."""
    from app.services.domain.hierarchy import franchise_type_tokens

    by_type = label_for_franchise_type()
    out: list[str] = []
    for token in franchise_type_tokens(getattr(franchise, "franchise_type", None)):
        key = by_type.get(token)
        if key and key not in out:
            out.append(key)
    return out


def ensure_label(db: Session, key: str) -> models.ContentLabel:
    """
    The system label `key`, created if it is missing - found by KEY, so a row
    an admin created by hand is adopted rather than duplicated.

    Called from the lifespan as well as named by each type's migration, for
    the reason seed_modes.py gives: API tests build the schema with
    create_all and never run Alembic. A label this creates is granted to
    `unrestricted` and to no other mode - exactly what creating a label
    through the API does. An adopted row keeps the grants it has.
    """
    label = (
        db.query(models.ContentLabel)
        .filter(models.ContentLabel.key == key)
        .first()
    )
    if label is not None:
        return label
    name, description = SYSTEM_LABELS[key]
    label = models.ContentLabel(
        key=key, label=name, description=description, sort_order=0
    )
    db.add(label)
    db.flush()

    from app.services.rbac.seed_modes import MODE_UNRESTRICTED

    unrestricted = (
        db.query(models.AccessMode)
        .filter(models.AccessMode.key == MODE_UNRESTRICTED)
        .first()
    )
    if unrestricted is not None:
        db.add(
            models.AccessModeLabel(
                mode_id=unrestricted.system_id, label_id=label.system_id
            )
        )
        db.flush()
    from app.services.rbac import cache

    cache.bump()
    return label


def ensure_system_labels(db: Session) -> None:
    """Every gated type's label. What the lifespan calls."""
    for key in _required_label_for_type().values():
        ensure_label(db, key)


def ensure_entry_label(db: Session, entry_id, key: str) -> None:
    """Attach label `key` to one entry unless it already carries it."""
    label = ensure_label(db, key)
    exists = (
        db.query(models.MediaContentLabel.system_id)
        .filter(
            models.MediaContentLabel.media_id == entry_id,
            models.MediaContentLabel.label_id == label.system_id,
        )
        .first()
    )
    if exists is None:
        db.add(
            models.MediaContentLabel(
                media_id=entry_id, label_id=label.system_id, position=0
            )
        )
        db.flush()


def ensure_franchise_labels(db: Session, franchise) -> None:
    """Attach the label of every gated type the franchise's types name."""
    if franchise is None:
        return
    for key in franchise_label_keys(franchise):
        label = ensure_label(db, key)
        exists = (
            db.query(models.FranchiseContentLabel.system_id)
            .filter(
                models.FranchiseContentLabel.franchise_id == franchise.system_id,
                models.FranchiseContentLabel.label_id == label.system_id,
            )
            .first()
        )
        if exists is None:
            db.add(
                models.FranchiseContentLabel(
                    franchise_id=franchise.system_id,
                    label_id=label.system_id,
                    position=0,
                )
            )
            db.flush()


def franchises_of_type(db: Session, franchise_type: str) -> list:
    """Every franchise whose type list names `franchise_type`, as a token."""
    from app.services.domain.hierarchy import franchise_type_tokens

    return [
        franchise
        for franchise in db.query(models.Franchise).filter(
            models.Franchise.franchise_type.ilike(f"%{franchise_type}%")
        )
        if franchise_type in franchise_type_tokens(franchise.franchise_type)
    ]


def refuse_label_removal_on_entry(
    db: Session, media_type: str, entry_id, wanted_keys: Iterable[str]
) -> None:
    """
    422 when a whole-set replace of a gated entry's labels would drop its
    required label. Called by the content-label endpoints before they delete
    anything.
    """
    key = _required_label_for_type().get(media_type)
    if key is None:
        return
    if key not in set(wanted_keys):
        raise HTTPException(
            status_code=422,
            detail=f"Every {media_type} carries the '{key}' label; it cannot be removed.",
        )


def refuse_label_removal_on_franchise(
    db: Session, franchise_id, wanted_keys: Iterable[str]
) -> None:
    """The same refusal for a franchise whose types name a gated type."""
    franchise = db.get(models.Franchise, franchise_id)
    if franchise is None:
        return
    missing = [k for k in franchise_label_keys(franchise) if k not in set(wanted_keys)]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=(
                f"A franchise of type '{franchise.franchise_type}' carries the "
                f"'{missing[0]}' label; it cannot be removed."
            ),
        )
