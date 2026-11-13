"""
The caller's own account settings.

Everything here acts on the caller and only the caller. There is no user id in
any path: an endpoint that took one would be an endpoint that could be pointed
at somebody else.
"""

import pytest

from app.services.rbac.seed import default_guest_permissions
from tests.api.test_visibility import make_viewer


@pytest.fixture
def db(db_session):
    return db_session


def test_an_anonymous_visitor_has_no_settings(client):
    assert client.get("/api/account/settings").status_code == 401


def test_a_signed_in_member_reads_their_own(db, client):
    make_viewer(db, client, "member", default_guest_permissions())
    r = client.get("/api/account/settings")
    assert r.status_code == 200
    assert r.json() == {"username": "member", "role_name": "role-member"}
