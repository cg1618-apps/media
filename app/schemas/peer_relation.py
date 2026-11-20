"""
Schemas for peer relations - a studio related to studios, a franchise to
franchises (app/services/domain/peer_relation.py). Both kinds read and write
the same shapes.
"""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class PeerRelationRef(BaseModel):
    """One related record, as a page lists it, with the remark this side
    gives the relation (null when it gives none)."""

    system_id: UUID
    public_id: int
    display_name: str
    remark: Optional[str] = None


class PeerRelationItem(BaseModel):
    """One relation as the editor sends it: the other record, and this side's
    remark."""

    id: UUID
    remark: Optional[str] = None


class PeerRelationsReplace(BaseModel):
    """PUT .../{id}/related: every record this one relates to."""

    relations: List[PeerRelationItem]
