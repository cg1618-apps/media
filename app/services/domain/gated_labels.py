"""
The system labels the gated types require, kept on entries and franchises.

A gated type (app/services/rbac/gated_types.py, REQUIRED_LABEL_FOR_TYPE) is
one whose every entry carries one content label. A missing label means a
PUBLIC entry, so the label is never left to the admin: this module attaches it
server-side and refuses a request that would take it off (422). The same holds
for a franchise whose type list names a gated type's franchise type
(hierarchy.FRANCHISE_TYPE_FOR): `H-Comic` brings `h-comic`, `Hentai` brings
`hentai`.

Everything here is driven by those two maps, so a further gated type needs
only its label in app/services/rbac/labels.py (with `gated_type` set) and its
franchise type - no code here names a type. Each type's own module (app/services/domain/h_comic.py, hentai.py) keeps
the rules that are not about the label.

The write paths that keep the label on:

  form create / update, tracker PATCH   the type's progress hook calls
                                        ensure_entry_label
  franchise create / update / PATCH,    ensure_franchise_labels
  the hierarchy resolver
  Pull, sheet restore                   enforce_gated_label_invariants, run
                                        after every gated entry tab, the
                                        Franchise tab and the label tabs
                                        (pull.GATED_LABEL_INVARIANT_TABS)
  Calculate                             run_sync_gated_labels, the same pass

Every function is idempotent.
"""

from typing import Iterable

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models


def _required_label_for_type() -> dict[str, str]:
    # Imported per call: the rbac layer imports the domain layer's models,
    # and this module is loaded while app.services.domain initialises.
    from app.services.rbac.gated_types import REQUIRED_LABEL_FOR_TYPE

    return REQUIRED_LABEL_FOR_TYPE


def _franchise_type_tokens(value) -> list[str]:
    """A franchise's comma-separated franchise_type, as tokens."""
    raw = (value or "").strip() if isinstance(value, str) else ""
    return [t.strip() for t in raw.split(",") if t.strip()]


def label_for_franchise_type() -> dict[str, str]:
    """{franchise type: the label key it brings}, for every gated type."""
    from app.services.domain.hierarchy import FRANCHISE_TYPE_FOR

    out: dict[str, str] = {}
    for media_type, label_key in _required_label_for_type().items():
        franchise_type = FRANCHISE_TYPE_FOR.get(media_type)
        if franchise_type is not None:
            out[str(getattr(franchise_type, "value", franchise_type))] = label_key
    return out


def franchise_label_keys(franchise) -> list[str]:
    """The label keys a franchise's types require, in type-list order."""
    by_type = label_for_franchise_type()
    out: list[str] = []
    for token in _franchise_type_tokens(getattr(franchise, "franchise_type", None)):
        key = by_type.get(token)
        if key and key not in out:
            out.append(key)
    return out


def ensure_label(db: Session, key: str) -> models.ContentLabel:
    """
    The `content_label` row for code label `key`, created if it is missing and
    otherwise brought back in line with the code: name, description and
    display order are the code's, whatever the row says. Found by KEY, so a
    row that predates the code is adopted rather than duplicated.

    Called from the lifespan as well as by the write paths below, because API
    tests build the schema with create_all and never run Alembic. Which modes
    show the label is derived (cache.mode_sets), so nothing is granted here.
    """
    from app.services.rbac.labels import LABEL_KEYS, label_by_key

    definition = label_by_key(key)
    if definition is None:
        raise KeyError(f"{key!r} is not a content label")
    label = (
        db.query(models.ContentLabel)
        .filter(models.ContentLabel.key == key)
        .first()
    )
    order = LABEL_KEYS.index(key)
    if label is None:
        label = models.ContentLabel(key=key)
        db.add(label)
    changed = (label.label, label.description, label.sort_order) != (
        definition.name,
        definition.description,
        order,
    )
    if changed:
        label.label = definition.name
        label.description = definition.description
        label.sort_order = order
        db.flush()
        from app.services.rbac import cache

        cache.bump()
    return label


def ensure_labels(db: Session) -> None:
    """Every code label as a row, in step with the code. What the lifespan
    calls. Never deletes: a row whose key the code does not name is the
    migration's to handle, and it refuses rather than guesses."""
    from app.services.rbac.labels import LABEL_KEYS

    for key in LABEL_KEYS:
        ensure_label(db, key)


def ensure_entry_label(db: Session, media_id, key: str) -> None:
    """Attach label `key` to one entry unless it already carries it."""
    label = ensure_label(db, key)
    exists = (
        db.query(models.MediaContentLabel.system_id)
        .filter(
            models.MediaContentLabel.media_id == media_id,
            models.MediaContentLabel.label_id == label.system_id,
        )
        .first()
    )
    if exists is None:
        db.add(
            models.MediaContentLabel(
                media_id=media_id, label_id=label.system_id, position=0
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
    return [
        franchise
        for franchise in db.query(models.Franchise).filter(
            models.Franchise.franchise_type.ilike(f"%{franchise_type}%")
        )
        if franchise_type in _franchise_type_tokens(franchise.franchise_type)
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
    wanted = set(wanted_keys)
    missing = [k for k in franchise_label_keys(franchise) if k not in wanted]
    if missing:
        type_for_label = {v: k for k, v in label_for_franchise_type().items()}
        raise HTTPException(
            status_code=422,
            detail=(
                f"Every {type_for_label[missing[0]]} franchise carries the "
                f"'{missing[0]}' label; it cannot be removed."
            ),
        )


# ---------------------------------------------------------------------------
# The paths that bypass the router: Pull, sheet restore, Calculate
# ---------------------------------------------------------------------------


def enforce_gated_label_invariants(db: Session) -> dict[str, int]:
    """
    Every entry of every gated type carries its required label, and every
    franchise whose types name a gated type's franchise type carries that
    label. Idempotent.

    A Pull writes rows straight to the tables, so no write hook ran; this is
    the net under it. Returns {media type: entries checked}. Does not commit -
    the caller owns the transaction.
    """
    # The label rows themselves first: a Pull may have written a sheet's name
    # or description over the code's.
    ensure_labels(db)
    counts: dict[str, int] = {}
    for media_type, key in _required_label_for_type().items():
        ids = [
            media_id
            for (media_id,) in db.query(models.Media.system_id).filter(
                models.Media.media_type == media_type
            )
        ]
        for media_id in ids:
            ensure_entry_label(db, media_id, key)
        counts[media_type] = len(ids)

    for franchise_type in label_for_franchise_type():
        for franchise in franchises_of_type(db, franchise_type):
            ensure_franchise_labels(db, franchise)
    db.flush()
    return counts
