"""
Changing who may do what is admin-only.

A super account manages the catalogue and runs pipelines, but must not be able
to grant itself anything, edit a role, create an account, or change the content
label VOCABULARY - the labels being what the access-mode axis scopes.

The vocabulary, not the whole router. Putting an existing label on an entry or
a franchise is `manage.catalog`, and reading the list is either permission,
because that list is both the admin page's table and the Add/Modify picker's
checkboxes. The split and the assignment gates are
tests/api/test_franchise_content_labels.py; what stays here is the half that
is still admin-only.
"""


import pytest


@pytest.fixture
def db(db_session):
    return db_session


# super_client comes from conftest now - Phase A built this account inline in
# several files and the audit asked for one copy.


@pytest.mark.parametrize("path", ["/api/roles/", "/api/users/"])
def test_super_is_refused_the_authorization_routers(super_client, path):
    response = super_client.get(path)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_super_is_refused_the_content_label_vocabulary(super_client, nsfw_label):
    """
    The write half only. `nsfw_label` is what makes this bite: on an empty
    catalogue a DELETE would 404 and a POST would be the only live assertion.
    """
    created = super_client.post(
        "/api/content-labels/",
        json={"key": "gore", "label": "Gore", "sort_order": 0},
    )
    patched = super_client.patch(
        f"/api/content-labels/{nsfw_label.system_id}", json={"label": "Renamed"}
    )
    deleted = super_client.delete(f"/api/content-labels/{nsfw_label.system_id}")
    assert created.status_code == 401
    assert patched.status_code == 401
    assert deleted.status_code == 401
    assert created.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "path",
    ["/api/roles/", "/api/users/", "/api/content-labels/"],
)
def test_the_admin_account_still_reaches_them(admin_client, path):
    assert admin_client.get(path).status_code == 200
