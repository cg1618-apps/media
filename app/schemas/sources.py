from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SourceRef(BaseModel):
    """One row of an entry's Sources card."""

    system_id: UUID
    kind: str
    bucket: str
    # The vocabulary row a `main` row points at, so the SPA can find one
    # (Bahamut, say) without string-matching a name an admin may rename.
    # None on the free-form buckets, which carry typed text instead.
    option_id: Optional[UUID] = None
    name: str
    available: Optional[bool] = None
    url: Optional[str] = None
    position: int = 0

    model_config = ConfigDict(from_attributes=True)


class SourceWrite(BaseModel):
    """One row of the `sources` list accepted on POST/PUT/PATCH.

    Shaped for `services.domain.sources.replace_sources`, which resolves
    `name` against the vocabulary itself - no id or position is accepted
    here, the writer always replaces the whole set in list order.
    """

    kind: str
    bucket: str
    name: str
    available: Optional[bool] = None
    url: Optional[str] = None


class SourceWriteFields(BaseModel):
    """Mixed into every media type's Create/Update schema.

    `None` means "the payload said nothing about sources" (PUT with
    exclude_unset, or a POST that omits the key) - the nested-collections
    writer only runs when the key is present, so the existing set is left
    alone. An empty list means "clear the sources".
    """

    sources: Optional[list[SourceWrite]] = None


class ExclusiveSourceWriteFields(BaseModel):
    """Mixed into the Create/Update schemas of the types with an exclusive source.

    The tag is otherwise written through PUT /api/credits; carried here it
    lands in the same request as `sources`, so the rule tying the two
    (services.domain.sources.exclusive_source_problem) is checked on the
    state that one write leaves. Absent means "said nothing"; null or blank
    clears it.
    """

    exclusive_source: Optional[str] = None
