"""
ck_users_mode_keys: an account's mode ceiling and default name one of the four
access modes the code defines, and the database refuses any other - even one
with a row of its own in `access_mode`.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_no_account_can_use_an_unknown_mode(db_session, access_modes, owner_user):
    """The database refuses an account whose ceiling names a mode outside
    the four."""
    db_session.add(models.AccessMode(key="curated", label="Curated", sort_order=5))
    db_session.flush()

    owner_user.mode_ceiling = "curated"
    owner_user.mode_default = "curated"
    with pytest.raises(IntegrityError, match="ck_users_mode_keys"):
        db_session.flush()
