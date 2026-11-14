"""/api/access-modes - reading the modes and editing their names.

The four modes and what each shows are fixed in code (seed_modes.py,
labels.py), so this router lists them with their DERIVED label and field-group
sets and lets an admin change a mode's name, description and display order -
nothing else. The routes that created, deleted or regranted a mode are gone;
test_labels_in_code.py asserts that they answer 404 or 405.

Everything here is `admin.authz`: a `super` manages the catalogue and is
refused the authorization surface.
"""

import uuid

from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.labels import LABEL_KEYS
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
)

MODES = "/api/access-modes/"


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def test_listing_returns_the_four_modes_with_their_derived_sets(admin_client, mode):
    rows = admin_client.get(MODES).json()
    by_key = {r["key"]: r for r in rows}

    assert set(by_key) == {MODE_UNRESTRICTED, MODE_BORDERLINE, MODE_NORMAL, MODE_SAFE}
    assert by_key[MODE_SAFE]["label_keys"] == []
    assert by_key[MODE_SAFE]["field_group_keys"] == []
    assert by_key[MODE_NORMAL]["label_keys"] == ["nsfw", "ecchi"]
    assert by_key[MODE_BORDERLINE]["label_keys"] == ["nsfw", "ecchi", "erotica"]
    assert by_key[MODE_UNRESTRICTED]["label_keys"] == list(LABEL_KEYS)
    for key in (MODE_NORMAL, MODE_BORDERLINE, MODE_UNRESTRICTED):
        assert set(by_key[key]["field_group_keys"]) == set(FIELD_GROUP_KEYS)


def test_one_mode_reads_the_same_as_its_listing_row(admin_client, mode):
    listed = {r["key"]: r for r in admin_client.get(MODES).json()}[MODE_BORDERLINE]

    one = admin_client.get(f"{MODES}{mode(MODE_BORDERLINE).system_id}")

    assert one.status_code == 200
    assert one.json() == listed


# ---------------------------------------------------------------------------
# The adjustable parts
# ---------------------------------------------------------------------------


def test_a_patch_changes_the_name_and_not_what_the_mode_shows(admin_client, mode):
    """The extra keys are the old grant fields. They are ignored, not
    honoured: what a mode shows is not an administrator's to edit."""
    target = mode(MODE_NORMAL)

    response = admin_client.patch(
        f"{MODES}{target.system_id}",
        json={
            "label": "一般",
            "sort_order": 7,
            "label_keys": list(LABEL_KEYS),
            "field_group_keys": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["label"], body["sort_order"]) == ("一般", 7)
    assert body["label_keys"] == ["nsfw", "ecchi"]
    assert set(body["field_group_keys"]) == set(FIELD_GROUP_KEYS)


def test_a_rename_is_felt_on_the_next_read(admin_client, mode):
    target = mode(MODE_SAFE)
    admin_client.patch(f"{MODES}{target.system_id}", json={"label": "安全"})

    rows = {r["key"]: r for r in admin_client.get(MODES).json()}
    assert rows[MODE_SAFE]["label"] == "安全"


# ---------------------------------------------------------------------------
# The anonymous policy is not an admin's to move
# ---------------------------------------------------------------------------


def test_the_mode_response_publishes_no_guest_flag(admin_client, mode):
    """There is no such field any more, on any mode."""
    rows = admin_client.get(MODES).json()
    assert rows
    assert all("is_guest_default" not in row for row in rows)


def test_nothing_an_admin_can_patch_changes_what_a_visitor_sees(
    db_session, client, admin_client, owner_client, mode, nsfw_label, hidden_anime
):
    """The anonymous policy is `safe`, by key, and is not an administrator's
    choice. Patching `unrestricted` with the old flag must not publish every
    labelled entry to the internet - it would look like an ordinary edit and
    nothing on any screen would report what it did.
    """
    assert client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404

    response = admin_client.patch(
        f"{MODES}{mode(MODE_UNRESTRICTED).system_id}",
        json={"is_guest_default": True, "label": "Unrestricted"},
    )
    assert response.status_code == 200

    # Still hidden. The extra key was ignored, not honoured.
    assert client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404
    # The mirror: the entry exists and the owner, in `unrestricted`, reads it.
    assert owner_client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200


# ---------------------------------------------------------------------------
# Refusals
# ---------------------------------------------------------------------------


def test_user_count_is_the_accounts_whose_ceiling_reaches_the_mode(
    admin_client, plain_user, db_session, mode
):
    """`normal` is reached by a `normal` ceiling and by every wider one; a
    `safe` ceiling does not reach it."""

    def count(mode_id):
        return admin_client.get(f"{MODES}{mode_id}").json()["user_count"]

    normal_id = mode(MODE_NORMAL).system_id
    before = count(normal_id)
    plain_user.mode_ceiling = MODE_SAFE
    plain_user.mode_default = MODE_SAFE
    db_session.flush()
    assert count(normal_id) == before - 1
    assert count(mode(MODE_SAFE).system_id) >= 1


def test_each_mode_carries_its_rank(admin_client):
    """The SPA orders the ceiling and default selects by this, so it never
    keeps a copy of MODE_ORDER."""
    by_key = {m["key"]: m["rank"] for m in admin_client.get(MODES).json()}

    assert [by_key[k] for k in (MODE_SAFE, MODE_NORMAL, "borderline", MODE_UNRESTRICTED)] == [
        0,
        1,
        2,
        3,
    ]
def test_an_unknown_mode_is_404(admin_client):
    assert admin_client.get(f"{MODES}{uuid.uuid4()}").status_code == 404
    assert (
        admin_client.patch(f"{MODES}{uuid.uuid4()}", json={"label": "x"}).status_code
        == 404
    )


def test_a_super_is_refused_the_whole_router(super_client, mode):
    """This is the authorization surface, so admin.authz - not manage.catalog.
    A super manages the catalogue and may not change who reaches what."""
    target = mode(MODE_NORMAL)
    assert super_client.get(MODES).status_code == 401
    assert super_client.get(f"{MODES}{target.system_id}").status_code == 401
    assert (
        super_client.patch(f"{MODES}{target.system_id}", json={"label": "x"}).status_code
        == 401
    )


def test_a_plain_user_is_refused(user_client, mode):
    assert user_client.get(MODES).status_code == 401
    assert (
        user_client.patch(
            f"{MODES}{mode(MODE_NORMAL).system_id}", json={"label": "x"}
        ).status_code
        == 401
    )
