"""
Schemas for peer relations - a company (studio or publisher) related to
companies, a franchise to franchises (app/services/domain/peer_relation.py).
Every kind reads and writes the same shapes.
"""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class PeerRelationRef(BaseModel):
    """One related record, as a page lists it, with the remark this side
    gives the relation (null when it gives none)."""

    # "studio", "publisher" or "franchise": which page the link goes to.
    kind: str
    system_id: UUID
    public_id: int
    display_name: str
    remark: Optional[str] = None


class PeerRelationItem(BaseModel):
    """One relation as the editor sends it: the other record, and this side's
    remark."""

    # "studio" or "publisher" on a company's list; omitted, the kind of the
    # record whose list this is.
    kind: Optional[str] = None
    id: UUID
    remark: Optional[str] = None


class PeerRelationsReplace(BaseModel):
    """PUT .../{id}/related: every record this one relates to."""

    relations: List[PeerRelationItem]
