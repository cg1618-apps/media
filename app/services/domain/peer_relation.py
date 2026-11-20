"""
Peer relations: a record related to other records of its own kind, each side
with its own remark. Studios relate to studios (studio_relation) and
franchises to franchises (franchise_relation); the rules are the same, so the
code is one class with an instance per table.

A relation is mutual and stored as two rows, one per side (see the models,
StudioRelation in app/models/staff.py and FranchiseRelation in
app/models/franchise.py). This module is the only writer, and it keeps the
pair whole: adding a relation from one side creates the other side's row with
no remark, and removing it from either side removes both. Each side's remark
is its own and is written only from that side.

Visibility follows the kind's own rule without adding to it - the
shared-record rule for a studio, the label rule for a franchise. A relation is
NOT a connection: it never makes a hidden record visible. What it does is
filter - a visible record's related list, and the count a library filters on,
omit the records the viewer may not see.

The writer REPLACES one side's whole list, the way the editor submits, and
leaves alone the rows naming a record the writer cannot see: a narrowed editor
saving a list it could only partly see must not delete what it was never
shown. The same rule club membership follows (membership.py).

The two-row design and its rejected alternatives:
docs/notes/decisions/2026-11-20-peer-relations-are-two-rows.md.
"""

from dataclasses import dataclass
from typing import Callable, Iterable, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Query, Session

from app import models
from app.services.rbac.enforcement import apply_franchise_visibility
from app.services.rbac.shared_visibility import apply_shared_visibility


def _clean_remark(remark: Optional[str]) -> Optional[str]:
    remark = (remark or "").strip()
    return remark or None


@dataclass(frozen=True)
class PeerRelations:
    """The relations between records of one kind, through one table."""

    # The relation table's model, and the model both ends point at.
    model: type
    owner: type
    # The two columns of `model`: the side whose page lists the relation, and
    # the record listed there.
    owner_column: str
    related_column: str
    # Narrows a query over `owner` to the records the viewer may see.
    visible: Callable[[Query, Session, object], Query]
    # How an error names the kind: "studio", "franchise".
    noun: str

    # --- reading ------------------------------------------------------------

    def _visible_records(self, db: Session, viewer, ids: Iterable[UUID]) -> dict:
        """{id: record} for the ids the viewer may see. One query."""
        ids = list(set(ids))
        if not ids:
            return {}
        query = db.query(self.owner).filter(self.owner.system_id.in_(ids))
        query = self.visible(query, db, viewer)
        return {r.system_id: r for r in query.all()}

    def _rows_of(self, db: Session, owner_id: UUID):
        return (
            db.query(self.model)
            .filter(getattr(self.model, self.owner_column) == owner_id)
            .all()
        )

    def _related_id(self, row) -> UUID:
        return getattr(row, self.related_column)

    def related_of(self, db: Session, viewer, owner_id: UUID) -> list[dict]:
        """The related records the viewer may see, by name, each with the
        remark this side gives the relation."""
        rows = self._rows_of(db, owner_id)
        visible = self._visible_records(db, viewer, map(self._related_id, rows))
        out = [
            {
                "system_id": record.system_id,
                "public_id": record.public_id,
                "display_name": record.display_name,
                "remark": row.remark,
            }
            for row in rows
            if (record := visible.get(self._related_id(row))) is not None
        ]
        return sorted(
            out,
            key=lambda ref: (ref["display_name"].casefold(), str(ref["system_id"])),
        )

    def related_counts(self, db: Session, viewer, owner_ids: list[UUID]) -> dict:
        """{owner_id: how many related records the viewer may see}, for a page
        of records in two queries. A relation to a hidden record does not
        count, so a library's "has relation" filter reveals nothing either."""
        counts = {owner_id: 0 for owner_id in owner_ids}
        if not owner_ids:
            return counts
        owner_col = getattr(self.model, self.owner_column)
        related_col = getattr(self.model, self.related_column)
        rows = db.query(owner_col, related_col).filter(owner_col.in_(owner_ids)).all()
        visible = self._visible_records(db, viewer, (related for _, related in rows))
        for owner_id, related in rows:
            if related in visible:
                counts[owner_id] += 1
        return counts

    def attach_has_relations(self, db: Session, viewer, records) -> None:
        """Set `has_relations` on ORM records in place, for a response schema
        that reads it as an attribute. Accepts one record or a sequence."""
        rows = list(records) if isinstance(records, (list, tuple)) else [records]
        counts = self.related_counts(db, viewer, [r.system_id for r in rows])
        for row in rows:
            row.has_relations = counts.get(row.system_id, 0) > 0

    # --- writing ------------------------------------------------------------

    def _mirror(self, db: Session, owner_id: UUID, related_id: UUID):
        """The other side's row of the (owner, related) relation."""
        return db.query(self.model).filter(
            getattr(self.model, self.owner_column) == related_id,
            getattr(self.model, self.related_column) == owner_id,
        )

    def replace_related(
        self,
        db: Session,
        viewer,
        owner_id: UUID,
        relations: list[tuple[UUID, Optional[str]]],
    ) -> None:
        """
        Make `relations` - (related id, this side's remark) pairs - the
        records related to this one. Does not commit.

        Each must be a record the writer may see and must not be this one; a
        repeated id keeps its first remark. A new relation also creates the
        other side's row, with no remark; a removed one takes the other
        side's row with it. Relations to records the writer cannot see are
        kept.
        """
        wanted: dict[UUID, Optional[str]] = {}
        for related_id, remark in relations:
            wanted.setdefault(related_id, _clean_remark(remark))
        if owner_id in wanted:
            raise HTTPException(
                status_code=422, detail=f"A {self.noun} cannot be related to itself."
            )
        visible_wanted = self._visible_records(db, viewer, wanted)
        missing = [str(i) for i in wanted if i not in visible_wanted]
        if missing:
            raise HTTPException(
                status_code=422, detail=f"Unknown {self.noun}(s): {', '.join(missing)}"
            )

        rows = self._rows_of(db, owner_id)
        visible_held = self._visible_records(db, viewer, map(self._related_id, rows))
        by_related = {self._related_id(r): r for r in rows}

        for row in rows:
            related_id = self._related_id(row)
            # Only the rows the writer could see are theirs to remove.
            if related_id in visible_held and related_id not in wanted:
                db.delete(row)
                self._mirror(db, owner_id, related_id).delete(
                    synchronize_session="fetch"
                )

        for related_id, remark in wanted.items():
            row = by_related.get(related_id)
            if row is None:
                db.add(
                    self.model(
                        **{self.owner_column: owner_id, self.related_column: related_id},
                        remark=remark,
                    )
                )
            else:
                row.remark = remark
            if self._mirror(db, owner_id, related_id).first() is None:
                db.add(
                    self.model(
                        **{self.owner_column: related_id, self.related_column: owner_id}
                    )
                )
        db.flush()

    def merge_relations(self, db: Session, keep_id: UUID, drop_id: UUID) -> None:
        """
        Move every relation of `drop_id` onto `keep_id`, for a merge.

        Both sides move together. A row that would duplicate one the survivor
        already holds - the survivor's remark wins - or would relate the
        survivor to itself is dropped. Does not commit.
        """
        owner_col, related_col = self.owner_column, self.related_column
        q = db.query(self.model)
        kept_out = {
            getattr(r, related_col) for r in q.filter_by(**{owner_col: keep_id})
        }
        kept_in = {getattr(r, owner_col) for r in q.filter_by(**{related_col: keep_id})}
        for row in q.filter_by(**{owner_col: drop_id}).all():
            other = getattr(row, related_col)
            if other == keep_id or other in kept_out:
                db.delete(row)
                continue
            setattr(row, owner_col, keep_id)
            kept_out.add(other)
        for row in q.filter_by(**{related_col: drop_id}).all():
            other = getattr(row, owner_col)
            if other == keep_id or other in kept_in:
                db.delete(row)
                continue
            setattr(row, related_col, keep_id)
            kept_in.add(other)
        db.flush()


def _studio_visibility(query: Query, db: Session, viewer) -> Query:
    return apply_shared_visibility(query, models.Studio, db, viewer)


STUDIO_RELATIONS = PeerRelations(
    model=models.StudioRelation,
    owner=models.Studio,
    owner_column="studio_id",
    related_column="related_studio_id",
    visible=_studio_visibility,
    noun="studio",
)

FRANCHISE_RELATIONS = PeerRelations(
    model=models.FranchiseRelation,
    owner=models.Franchise,
    owner_column="franchise_id",
    related_column="related_franchise_id",
    visible=apply_franchise_visibility,
    noun="franchise",
)
