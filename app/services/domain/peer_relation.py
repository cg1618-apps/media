"""
Peer relations: a record related to other records, each side with its own
remark. Companies relate to companies - a studio or a publisher at either end,
in any mix (company_relation) - and franchises to franchises
(franchise_relation). The rules are the same, so the code is one class with an
instance per table.

A relation is mutual and stored as two rows, one per side (see the models,
CompanyRelation in app/models/staff.py and FranchiseRelation in
app/models/franchise.py). This module is the only writer, and it keeps the
pair whole: adding a relation from one side creates the other side's row with
no remark, and removing it from either side removes both. Each side's remark
is its own and is written only from that side.

A record is named by its KIND and its id: ("studio", id), ("publisher", id),
("franchise", id). Each kind is one `Kind` below - the table it lives in, the
pair of relation columns that name it on each end, and its visibility rule.
A table holding one kind (franchise_relation) is the same code with one Kind.

Visibility follows each kind's own rule without adding to it - the
shared-record rule for a studio or a publisher, the label rule for a
franchise. A relation is NOT a connection: it never makes a hidden record
visible. What it does is filter - a visible record's related list, and the
count a library filters on, omit the records the viewer may not see.

The writer REPLACES one side's whole list, the way the editor submits, and
leaves alone the rows naming a record the writer cannot see: a narrowed editor
saving a list it could only partly see must not delete what it was never
shown. The same rule club membership follows (membership.py).

The two-row design and its rejected alternatives:
docs/notes/decisions/2026-11-20-peer-relations-are-two-rows.md; why studios and
publishers share one table:
docs/notes/decisions/2026-11-23-studios-and-publishers-relate-in-one-table.md.
"""

from collections import defaultdict
from dataclasses import dataclass
from typing import Callable, Iterable, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Query, Session

from app import models
from app.services.rbac.enforcement import apply_franchise_visibility
from app.services.rbac.shared_visibility import apply_shared_visibility

# (kind, system_id): one end of a relation.
Ref = tuple[str, UUID]


def _clean_remark(remark: Optional[str]) -> Optional[str]:
    remark = (remark or "").strip()
    return remark or None


@dataclass(frozen=True)
class Kind:
    """One kind of record a relation table can name at either end."""

    key: str
    model: type
    # The relation-table column naming a record of this kind on the OWNING
    # side, and the one naming it on the RELATED side.
    owner_column: str
    related_column: str
    # Narrows a query over `model` to the records the viewer may see.
    visible: Callable[[Query, Session, object], Query]


@dataclass(frozen=True)
class PeerRelations:
    """The relations held in one table, between records of `kinds`."""

    model: type
    kinds: tuple[Kind, ...]
    # How an error names a record: "company", "franchise".
    noun: str

    # --- the two ends of a row ----------------------------------------------

    def kind(self, key: str) -> Kind:
        for kind in self.kinds:
            if kind.key == key:
                return kind
        raise HTTPException(
            status_code=422,
            detail=f"A {self.noun} relation cannot name a {key}.",
        )

    def _end(self, row, side: str) -> Ref:
        """The (kind, id) a row names on `side` ("owner" or "related")."""
        for kind in self.kinds:
            value = getattr(row, getattr(kind, f"{side}_column"))
            if value is not None:
                return kind.key, value
        raise ValueError(f"{self.model.__tablename__} row names no {side}")

    def _columns(self, ref: Ref, side: str) -> dict:
        """The column values that name `ref` on `side`, every other kind's
        column of that side NULL."""
        key, record_id = ref
        return {
            getattr(kind, f"{side}_column"): (record_id if kind.key == key else None)
            for kind in self.kinds
        }

    def _naming(self, ref: Ref, side: str):
        """A filter matching the rows that name `ref` on `side`."""
        kind = self.kind(ref[0])
        return getattr(self.model, getattr(kind, f"{side}_column")) == ref[1]

    # --- reading ------------------------------------------------------------

    def _visible_records(self, db: Session, viewer, refs: Iterable[Ref]) -> dict:
        """{(kind, id): record} for the refs the viewer may see. One query per
        kind named."""
        by_kind: dict[str, set[UUID]] = defaultdict(set)
        for key, record_id in refs:
            by_kind[key].add(record_id)
        out = {}
        for key, ids in by_kind.items():
            kind = self.kind(key)
            query = db.query(kind.model).filter(kind.model.system_id.in_(ids))
            for record in kind.visible(query, db, viewer).all():
                out[(key, record.system_id)] = record
        return out

    def _rows_of(self, db: Session, owner: Ref):
        return db.query(self.model).filter(self._naming(owner, "owner")).all()

    def related_of(self, db: Session, viewer, owner: Ref) -> list[dict]:
        """The related records the viewer may see, by name, each with the
        remark this side gives the relation."""
        rows = self._rows_of(db, owner)
        ends = [(row, self._end(row, "related")) for row in rows]
        visible = self._visible_records(db, viewer, (ref for _, ref in ends))
        out = [
            {
                "kind": ref[0],
                "system_id": record.system_id,
                "public_id": record.public_id,
                "display_name": record.display_name,
                "remark": row.remark,
            }
            for row, ref in ends
            if (record := visible.get(ref)) is not None
        ]
        return sorted(
            out,
            key=lambda r: (r["display_name"].casefold(), r["kind"], str(r["system_id"])),
        )

    def related_counts(
        self, db: Session, viewer, owner_kind: str, owner_ids: list[UUID]
    ) -> dict:
        """{owner_id: how many related records the viewer may see}, for a page
        of records of one kind. A relation to a hidden record does not count,
        so a library's "has relation" filter reveals nothing either."""
        counts = {owner_id: 0 for owner_id in owner_ids}
        if not owner_ids:
            return counts
        owner_col = getattr(self.model, self.kind(owner_kind).owner_column)
        rows = db.query(self.model).filter(owner_col.in_(owner_ids)).all()
        ends = [(self._end(row, "owner")[1], self._end(row, "related")) for row in rows]
        visible = self._visible_records(db, viewer, (ref for _, ref in ends))
        for owner_id, ref in ends:
            if ref in visible:
                counts[owner_id] += 1
        return counts

    def attach_has_relations(self, db: Session, viewer, owner_kind: str, records) -> None:
        """Set `has_relations` on ORM records in place, for a response schema
        that reads it as an attribute. Accepts one record or a sequence."""
        rows = list(records) if isinstance(records, (list, tuple)) else [records]
        counts = self.related_counts(db, viewer, owner_kind, [r.system_id for r in rows])
        for row in rows:
            row.has_relations = counts.get(row.system_id, 0) > 0

    # --- writing ------------------------------------------------------------

    def _mirror(self, db: Session, owner: Ref, related: Ref):
        """The other side's row of the (owner, related) relation."""
        return db.query(self.model).filter(
            self._naming(related, "owner"), self._naming(owner, "related")
        )

    def replace_from_payload(self, db: Session, viewer, owner: Ref, items) -> None:
        """`replace_related` from the editor's items (PeerRelationItem): a
        ref without a kind is of the owner's kind. Does not commit."""

        def ref(item) -> Ref:
            return (item.kind or owner[0], item.id)

        self.replace_related(
            db,
            viewer,
            owner,
            [(ref(item), item.remark) for item in items],
            also_related=[
                (ref(item), ref(other)) for item in items for other in item.also_related_to
            ],
        )

    def replace_related(
        self,
        db: Session,
        viewer,
        owner: Ref,
        relations: list[tuple[Ref, Optional[str]]],
        also_related: Iterable[tuple[Ref, Ref]] = (),
    ) -> None:
        """
        Make `relations` - (related ref, this side's remark) pairs - the
        records related to this one. Does not commit.

        Each must be a record the writer may see and must not be this one; a
        repeated ref keeps its first remark. A new relation also creates the
        other side's row, with no remark; a removed one takes the other
        side's row with it. Relations to records the writer cannot see are
        kept.

        `also_related` pairs two records of `relations` to relate to each
        other as well - both sides, no remark, a pair already related left as
        it is. This is how the editor relates a newly added record to the
        others on the list: it is still one pair at a time, so an unticked
        pair simply has no rows. A pair naming a record not in `relations`,
        or one record twice, is refused.
        """
        wanted: dict[Ref, Optional[str]] = {}
        for ref, remark in relations:
            self.kind(ref[0])
            wanted.setdefault(ref, _clean_remark(remark))
        if owner in wanted:
            raise HTTPException(
                status_code=422, detail=f"A {owner[0]} cannot be related to itself."
            )
        also_related = list(also_related)
        for one, other in also_related:
            if one == other:
                raise HTTPException(
                    status_code=422, detail=f"A {one[0]} cannot be related to itself."
                )
            if one not in wanted or other not in wanted:
                raise HTTPException(
                    status_code=422,
                    detail=f"Also-related {self.noun}s must both be on this list.",
                )
        visible_wanted = self._visible_records(db, viewer, wanted)
        missing = [f"{key} {record_id}" for key, record_id in wanted
                   if (key, record_id) not in visible_wanted]
        if missing:
            raise HTTPException(
                status_code=422, detail=f"Unknown {self.noun}(s): {', '.join(missing)}"
            )

        rows = self._rows_of(db, owner)
        by_related = {self._end(row, "related"): row for row in rows}
        visible_held = self._visible_records(db, viewer, by_related)

        for ref, row in by_related.items():
            # Only the rows the writer could see are theirs to remove.
            if ref in visible_held and ref not in wanted:
                db.delete(row)
                self._mirror(db, owner, ref).delete(synchronize_session="fetch")

        for ref, remark in wanted.items():
            row = by_related.get(ref)
            if row is None:
                db.add(
                    self.model(
                        **self._columns(owner, "owner"),
                        **self._columns(ref, "related"),
                        remark=remark,
                    )
                )
            else:
                row.remark = remark
            if self._mirror(db, owner, ref).first() is None:
                db.add(
                    self.model(
                        **self._columns(ref, "owner"), **self._columns(owner, "related")
                    )
                )
        db.flush()

        for one, other in also_related:
            self._ensure_side(db, one, other)
            self._ensure_side(db, other, one)
        db.flush()

    def _ensure_side(self, db: Session, owner: Ref, related: Ref) -> None:
        """Give `owner` a row naming `related`, unless it has one."""
        exists = (
            db.query(self.model)
            .filter(self._naming(owner, "owner"), self._naming(related, "related"))
            .first()
        )
        if exists is None:
            db.add(self.model(**self._columns(owner, "owner"), **self._columns(related, "related")))
            db.flush()

    def merge_relations(self, db: Session, kind_key: str, keep_id: UUID, drop_id: UUID) -> None:
        """
        Move every relation of `drop_id` onto `keep_id`, both of `kind_key`,
        for a merge.

        Both sides move together. A row that would duplicate one the survivor
        already holds - the survivor's remark wins - or would relate the
        survivor to itself is dropped. Does not commit.
        """
        keep, drop = (kind_key, keep_id), (kind_key, drop_id)
        kind = self.kind(kind_key)
        q = db.query(self.model)
        kept_out = {self._end(r, "related") for r in q.filter(self._naming(keep, "owner"))}
        kept_in = {self._end(r, "owner") for r in q.filter(self._naming(keep, "related"))}
        for row in q.filter(self._naming(drop, "owner")).all():
            other = self._end(row, "related")
            if other == keep or other in kept_out:
                db.delete(row)
                continue
            setattr(row, kind.owner_column, keep_id)
            kept_out.add(other)
        for row in q.filter(self._naming(drop, "related")).all():
            other = self._end(row, "owner")
            if other == keep or other in kept_in:
                db.delete(row)
                continue
            setattr(row, kind.related_column, keep_id)
            kept_in.add(other)
        db.flush()


def _studio_visibility(query: Query, db: Session, viewer) -> Query:
    return apply_shared_visibility(query, models.Studio, db, viewer)


def _publisher_visibility(query: Query, db: Session, viewer) -> Query:
    return apply_shared_visibility(query, models.Publisher, db, viewer)


COMPANY_RELATIONS = PeerRelations(
    model=models.CompanyRelation,
    kinds=(
        Kind("studio", models.Studio, "studio_id", "related_studio_id", _studio_visibility),
        Kind(
            "publisher",
            models.Publisher,
            "publisher_id",
            "related_publisher_id",
            _publisher_visibility,
        ),
    ),
    noun="company",
)

FRANCHISE_RELATIONS = PeerRelations(
    model=models.FranchiseRelation,
    kinds=(
        Kind(
            "franchise",
            models.Franchise,
            "franchise_id",
            "related_franchise_id",
            apply_franchise_visibility,
        ),
    ),
    noun="franchise",
)
