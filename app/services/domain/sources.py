"""
Reading and writing media_source rows.

Modelled on services.domain.credits: the read path is batched (one query for
rows, one for the options they cite) because attach runs on every list
endpoint, and the write path is a whole-set replace that does not commit -
the caller owns the transaction.
"""

from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.schemas.sources import SourceRef
from app.utils.source_fields import FREE_FORM_BUCKETS, category_for_kind


def _option_lookup(
    db: Session, option_ids: set[UUID]
) -> dict[UUID, tuple[str, int]]:
    """option_id -> (value, sort_order) for every option the rows cite."""
    if not option_ids:
        return {}
    rows = (
        db.query(
            models.SystemOption.system_id,
            models.SystemOption.value,
            models.SystemOption.sort_order,
        )
        .filter(models.SystemOption.system_id.in_(option_ids))
        .all()
    )
    return {system_id: (value, sort_order) for system_id, value, sort_order in rows}


def attach_sources(
    db: Session, media_type: str, entries, viewer=None
) -> None:
    """
    Set `entry.sources` on ORM entries in place.

    Rows in a bucket the viewer is not granted are dropped here rather than in
    field_gate.gate(), because the filtering is partial: a viewer may hold
    `other` and not `restricted`, so the attribute cannot simply be blanked.

    Order: `main` rows follow the vocabulary's own system_option.sort_order,
    which the admin sets once on the Options page; the free-form buckets keep
    their insertion order in `position`. Sorting `main` by position would be
    arbitrary - the backfill inserted every migrated row with position 0.
    """
    # Imported here: field_groups imports credits, and credits must not import
    # rbac back at module scope.
    from app.services.rbac.field_gate import gated_source_buckets

    if entries is None:
        return
    rows_in = list(entries) if isinstance(entries, (list, tuple)) else [entries]
    if not rows_in:
        return

    withheld = set(gated_source_buckets(viewer))
    entry_ids = [e.system_id for e in rows_in]

    query = db.query(models.MediaSource).filter(
        models.MediaSource.media_id.in_(entry_ids),
    )
    if withheld:
        query = query.filter(models.MediaSource.bucket.notin_(withheld))
    source_rows = query.order_by(models.MediaSource.position).all()

    options = _option_lookup(
        db, {r.option_id for r in source_rows if r.option_id}
    )

    def _order(row) -> tuple[int, int, int]:
        if row.bucket == "main":
            _value, sort_order = options.get(row.option_id, ("", 0))
            return (0, sort_order, row.position)
        return (1, row.position, 0)

    by_entry: dict[UUID, list[SourceRef]] = {}
    for row in sorted(source_rows, key=_order):
        if row.option_id is None:
            name = row.name
        else:
            name = (options.get(row.option_id) or (None, 0))[0]
        if not name:
            # The option was deleted out from under the row. Skip rather than
            # render a nameless link.
            continue
        by_entry.setdefault(row.media_id, []).append(
            SourceRef(
                system_id=row.system_id,
                kind=row.kind,
                bucket=row.bucket,
                option_id=row.option_id,
                name=name,
                available=row.available,
                url=row.url,
                position=row.position,
            )
        )

    for entry in rows_in:
        entry.sources = by_entry.get(entry.system_id, [])


def replace_sources(
    db: Session,
    media_id: UUID,
    payload: list[dict],
    viewer=None,
    media_type: str | None = None,
) -> None:
    """
    Make the entry's sources exactly `payload`, in that order.

    A row is a dict of kind, bucket, name, and optionally url and available.
    `name` is resolved against the vocabulary for `main` rows and stored as
    typed text for the free-form buckets. Does not commit.

    Buckets `viewer` does not hold are left completely alone - neither deleted
    nor written. The admin form prefills from the same gated GET the reader
    saw, so a whole-set replace would otherwise delete exactly the rows the
    saver was never shown. `viewer=None` means an internal caller with no
    gating, and replaces everything.

    `media_type` picks the vocabulary a main access row resolves against
    (category_for_kind): a manga's or book's is Serialization Platform.
    """
    from app.services.domain.credits import resolve_option
    from app.services.rbac.field_gate import gated_source_buckets

    withheld = set(gated_source_buckets(viewer))

    doomed = db.query(models.MediaSource).filter_by(media_id=media_id)
    if withheld:
        doomed = doomed.filter(models.MediaSource.bucket.notin_(withheld))
    doomed.delete(synchronize_session=False)

    for position, item in enumerate(payload or []):
        name = (item.get("name") or "").strip()
        if not name:
            continue
        kind = item.get("kind") or "access"
        bucket = item.get("bucket") or "other"
        if bucket in withheld:
            # Not visible to this caller, so not theirs to add either.
            continue

        option_id = None
        stored_name = name
        if bucket not in FREE_FORM_BUCKETS:
            option = resolve_option(db, category_for_kind(kind, media_type), name)
            option_id = option.system_id
            stored_name = None

        db.add(
            models.MediaSource(
                media_id=media_id,
                kind=kind,
                bucket=bucket,
                option_id=option_id,
                name=stored_name,
                available=item.get("available"),
                url=(item.get("url") or None),
                position=position,
            )
        )
    db.flush()


def find_main_source(db: Session, media_id: UUID, kind: str, value: str):
    """
    The entry's `main` row pointing at one vocabulary value, or None.

    Matching goes through system_option rather than a stored string so a
    renamed value still finds its rows, and uses the same normalisation
    `resolve_option` uses so "Bahamut" and "bahamut " are one value.
    """
    from app.utils.name_normalize import normalize_name

    key = normalize_name(value)
    rows = (
        db.query(models.MediaSource, models.SystemOption)
        .join(
            models.SystemOption,
            models.SystemOption.system_id == models.MediaSource.option_id,
        )
        .filter(
            models.MediaSource.media_id == media_id,
            models.MediaSource.kind == kind,
            models.MediaSource.bucket == "main",
            models.SystemOption.category == category_for_kind(kind),
        )
        .all()
    )
    for row, option in rows:
        if normalize_name(option.value) == key:
            return row
    return None


def upsert_main_source(
    db: Session,
    media_id: UUID,
    kind: str,
    value: str,
    url: str,
) -> bool:
    """
    Give the entry a `main` row for one vocabulary value, if it has none.

    Used by the Fill pipeline, which owns "fill what is empty, never
    overwrite": an existing row - even one with no url - is left alone.
    Returns True when a row was added. Does not commit.
    """
    from app.services.domain.credits import resolve_option

    if not url:
        return False
    if find_main_source(db, media_id, kind, value) is not None:
        return False

    option = resolve_option(db, category_for_kind(kind), value)
    db.add(
        models.MediaSource(
            media_id=media_id,
            kind=kind,
            bucket="main",
            option_id=option.system_id,
            url=url,
        )
    )
    db.flush()
    return True


def media_sources_writer(media_type: str):
    """
    Build the `nested_collections` adapter for one media type.

    The media type picks the vocabulary a main access row resolves against -
    Serialization Platform on manga and book, Platform elsewhere. The
    signature the factory produces is what nested_collections expects.
    See app/routers/_factory.py:83-96.
    """

    def write(db: Session, entry, value, viewer=None) -> None:
        replace_sources(
            db, entry.system_id, value or [], viewer=viewer, media_type=media_type
        )

    return write


# The media types whose exclusive_source must be backed by a source row: the
# platform an entry is exclusive to is a platform it can be watched on, so the
# tag needs a `main` access row for that same platform, marked available.
# Every type that carries the tag (TAG_FIELDS["exclusive_source"]).
EXCLUSIVE_SOURCE_TYPES: tuple[str, ...] = ("anime", "anime-movie")
EXCLUSIVE_SOURCE_FIELD = "exclusive_source"


def exclusive_source_problem(db: Session, media_id: UUID) -> str | None:
    """
    Why the entry's stored exclusive_source breaks the rule, or None.

    Reads what is stored (flushed) now, so a caller checks after writing its
    own half. The tag and a `main` access row draw from the same Platform
    vocabulary, so they are matched by option_id rather than by name: an
    `other` row typed "Netflix" is not the Netflix platform.
    """
    db.flush()
    tags = (
        db.query(models.MediaTag, models.SystemOption)
        .join(
            models.SystemOption,
            models.SystemOption.system_id == models.MediaTag.option_id,
        )
        .filter(
            models.MediaTag.media_id == media_id,
            models.MediaTag.field == EXCLUSIVE_SOURCE_FIELD,
        )
        .all()
    )
    for tag, option in tags:
        backed = (
            db.query(models.MediaSource)
            .filter_by(
                media_id=media_id,
                kind="access",
                bucket="main",
                option_id=tag.option_id,
                available=True,
            )
            .first()
        )
        if backed is None:
            return (
                f"Exclusive source {option.value} needs a {option.value} row "
                f"under Main Sources marked Available."
            )
    return None


def exclusive_source_writer():
    """
    The `nested_collections` adapter for an entry payload's exclusive_source.

    Lets one entry write carry both halves of the rule - the sources and the
    tag - so a save that swaps the platform and its row together is checked
    once, on the state it leaves behind. A blank value clears the tag.
    """

    def write(db: Session, entry, value, viewer=None) -> None:
        from app.services.domain.credits import replace_tags

        value = (value or "").strip()
        replace_tags(
            db, entry.system_id, EXCLUSIVE_SOURCE_FIELD, [value] if value else []
        )

    return write


def check_exclusive_source_write(db: Session, entry, touched) -> str | None:
    """
    The entry write's check: run only when the write touched either half.

    A write that changes neither - a toolbar PATCH of the airing status -
    must not be refused for a row stored before the rule existed.
    """
    if not {"sources", EXCLUSIVE_SOURCE_FIELD} & set(touched):
        return None
    return exclusive_source_problem(db, entry.system_id)
