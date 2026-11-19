"""An image attachment may carry a caption

A person who holds the author or illustrator role keeps a gallery of their
works: library images attached to the person (`owner_type` "staff") under the
role "work", ordered by `position`. That is the multi-image case
`image_attachment.position` was reserved for, so the only schema change is
somewhere for the caption to live.

Revision ID: w1o2rkimage3
Revises: d1i2rnocred3
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "w1o2rkimage3"
down_revision: Union[str, Sequence[str], None] = "d1i2rnocred3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("image_attachment", sa.Column("caption", sa.String(), nullable=True))


def downgrade() -> None:
    """
    The captions go with the column. The gallery's attachment rows stay:
    the older code reads no "work" role, and still counts the images as in
    use, so nothing it does deletes them.
    """
    op.drop_column("image_attachment", "caption")
