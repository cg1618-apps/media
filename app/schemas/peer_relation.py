"""
Schemas for peer relations - a company (studio or publisher) related to
companies, a franchise to franchises, a series to series
(app/services/domain/peer_relation.py).
Every kind reads and writes the same shapes.
"""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class PeerRelationRef(BaseModel):
    """One related record, as a page lists it, with the remark this side
    gives the relation (null when it gives none)."""

    # "studio", "publisher", "franchise" or "series": which page the link goes to.
    kind: str
    system_id: UUID
    public_id: int
    display_name: str
    remark: Optional[str] = None


class PeerRelationTarget(BaseModel):
    """Another record on the same list, named the way an item names one."""

    # Omitted, the kind of the record whose list this is.
    kind: Optional[str] = None
    id: UUID


class PeerRelationItem(BaseModel):
    """One relation as the editor sends it: the other record, this side's
    remark, and the other records on this list it should be related to as
    well."""

    # "studio" or "publisher" on a company's list; omitted, the kind of the
    # record whose list this is.
    kind: Optional[str] = None
    id: UUID
    remark: Optional[str] = None
    # Records elsewhere on this same list to relate this one to as well, both
    # ways, with no remark. A pair already related is left as it is.
    also_related_to: List[PeerRelationTarget] = []


class PeerRelationsReplace(BaseModel):
    """PUT .../{id}/related: every record this one relates to."""

    relations: List[PeerRelationItem]
