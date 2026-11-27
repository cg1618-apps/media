"""
What hides a person, studio or publisher by itself, as opposed to by what it
is connected to (shared_visibility.py has both rules and the reasoning).

Its own module, importing nothing but the models, because the domain services
that name these records on another record's page - credits, casting - sit
below shared_visibility in the import graph and need the type at import time
for their defaults. shared_visibility.own_hiding builds one for a viewer.
"""

from dataclasses import dataclass
from typing import Iterable
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.orm import Session, aliased

from app import models

# The shared records that carry content labels of their own: the join table
# and the column in it naming the record.
LABELLED_MODELS: dict[type, tuple[type, str]] = {
    models.Person: (models.PersonContentLabel, "person_id"),
}


def labelled_out(model, hidden_labels):
    """
    "This record carries a label in `hidden_labels`", correlated on
    `model.system_id`. The join table is aliased for the reason the module
    app/services/rbac/shared_visibility.py's docstring gives for its connection
    tables: a caller's query may already join this table.
    """
    join_model, record_column = LABELLED_MODELS[model]
    table = aliased(join_model)
    return sa.exists().where(
        getattr(table, record_column) == model.system_id,
        table.label_id.in_(list(hidden_labels)),
    )


@dataclass(frozen=True)
class OwnHiding:
    """
    What hides a person, studio or publisher by ITSELF: its content rating,
    and a person's content labels. The connection rule is left out on
    purpose - a record named on a visible entry's page is connected to it.

    The readers that name such a record on another record's page leave out
    what this hides, and the writers that replace such a list wholesale keep
    it, because the writer was never shown it. Falsy when it hides nothing,
    so `if keep:` still reads "is there anything to keep".
    """

    ratings: frozenset[str] = frozenset()
    labels: tuple[UUID, ...] = ()

    def __bool__(self) -> bool:
        return bool(self.ratings or self.labels)

    def condition(self, model):
        """"This row of `model` is hidden by itself", as SQL - false when
        nothing is hidden, so `~condition` keeps every row."""
        parts = []
        if self.ratings:
            parts.append(model.content_rating.in_(sorted(self.ratings)))
        if self.labels and model in LABELLED_MODELS:
            parts.append(labelled_out(model, self.labels))
        return sa.or_(*parts) if parts else sa.false()

    def hidden_ids(self, db: Session, records: Iterable) -> set[UUID]:
        """
        The system_ids among `records` - loaded rows of any rated model,
        mixed - that this hides: the rating read off the row, the labels in
        one query per labelled model.
        """
        records = [record for record in records if record is not None]
        out = {
            record.system_id
            for record in records
            if record.content_rating in self.ratings
        }
        if not self.labels:
            return out
        for model, (join_model, record_column) in LABELLED_MODELS.items():
            ids = {r.system_id for r in records if isinstance(r, model)}
            if not ids:
                continue
            column = getattr(join_model, record_column)
            out |= {
                record_id
                for (record_id,) in db.query(column).filter(
                    column.in_(ids), join_model.label_id.in_(list(self.labels))
                )
            }
        return out
