"""
Content labels on a franchise, and the gate split that lets `super` set them.

Two things are proved here, and they arrived in the same change because they
are the same feature seen from its two ends.

THE CASCADE. A franchise's labels hide the franchise AND every entry under it.
The join is read-time through `media.franchise_id` (no copy is written onto
the entries), so each cascade assertion is paired with its mirror: the same
request, the same fixtures, from a viewer whose mode DOES carry the label.
Without the mirror a green could mean "the gate refused" or "there was nothing
to see either way", and `nsfw_label` - which appears in almost none of these
test bodies - is the fixture that makes the refusing possible at all.

THE GATE SPLIT. Minting a label is `admin.authz`; putting an existing one on
an entry or a franchise is `manage.catalog`. `super` holds the second and is
locked off the first by construction, so before the split a `super` account
saved an entry and then watched only its labels fail. The refusal tests below
therefore run against a vocabulary that is NOT empty - a 401 on an empty
catalogue would prove nothing about the gate.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def labelled_franchise(db_session, sample_franchise, nsfw_label):
    """`sample_franchise`, carrying `nsfw`."""
    db_session.add(
        models.FranchiseContentLabel(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    db_session.flush()
    return sample_franchise


@pytest.fixture
def narrow(catalog_writer):
    """A catalogue editor whose mode carries NO labels."""
    return catalog_writer(username="narrowwriter", label_keys=())


# ---------------------------------------------------------------------------
# The gate split
# ---------------------------------------------------------------------------


def test_super_may_assign_a_label_to_an_entry(
    super_client, sample_anime, nsfw_label
):
    """The reported defect: the entry saved and only its labels 401'd."""
    res = super_client.put(
        f"/api/content-labels/entry/anime/{sample_anime.system_id}",
        json={"label_keys": ["nsfw"]},
    )
    assert res.status_code == 200, res.text
    assert res.json() == ["nsfw"]


def test_super_may_assign_a_label_to_a_franchise(
    super_client, sample_franchise, nsfw_label
):
    res = super_client.put(
        f"/api/content-labels/franchise/{sample_franchise.system_id}",
        json={"label_keys": ["nsfw"]},
    )
    assert res.status_code == 200, res.text
    assert res.json() == ["nsfw"]


def test_super_may_read_the_vocabulary(super_client, nsfw_label):
    """The picker's checkbox list. Non-empty, so a 200 means something."""
    res = super_client.get("/api/content-labels/")
    assert res.status_code == 200, res.text
    assert [row["key"] for row in res.json()] == ["nsfw"]


def test_super_may_not_mint_a_label(super_client, nsfw_label):
    """The other half of the split: the vocabulary is still admin.authz."""
    res = super_client.post(
        "/api/content-labels/",
        json={"key": "gore", "label": "Gore", "sort_order": 0},
    )
    assert res.status_code == 401


def test_super_may_not_delete_a_label(super_client, nsfw_label):
    res = super_client.delete(f"/api/content-labels/{nsfw_label.system_id}")
    assert res.status_code == 401


def test_a_plain_user_may_assign_nothing(
    user_client, sample_anime, sample_franchise, nsfw_label
):
    """manage.catalog is a real gate, not a formality."""
    entry = user_client.put(
        f"/api/content-labels/entry/anime/{sample_anime.system_id}",
        json={"label_keys": ["nsfw"]},
    )
    franchise = user_client.put(
        f"/api/content-labels/franchise/{sample_franchise.system_id}",
        json={"label_keys": ["nsfw"]},
    )
    assert entry.status_code == 401
    assert franchise.status_code == 401
    assert user_client.get("/api/content-labels/").status_code == 401


def test_a_narrow_editor_cannot_relabel_what_it_cannot_see(
    narrow, admin_client, hidden_anime, labelled_franchise
):
    """
    The write binds to the read. `manage.catalog` says nothing about which
    objects a session reaches, so without this gate a narrowed editor who knew
    the id could clear the very label that was hiding the thing from them -
    and these routes replace the WHOLE set, so one empty PUT would do it.
    """
    entry = narrow.put(
        f"/api/content-labels/entry/anime/{hidden_anime.system_id}",
        json={"label_keys": []},
    )
    franchise = narrow.put(
        f"/api/content-labels/franchise/{labelled_franchise.system_id}",
        json={"label_keys": []},
    )
    assert entry.status_code == 404
    assert franchise.status_code == 404
    # The mirror: the same two calls from a mode that carries the label.
    assert (
        admin_client.put(
            f"/api/content-labels/entry/anime/{hidden_anime.system_id}",
            json={"label_keys": []},
        ).status_code
        == 200
    )
    assert (
        admin_client.put(
            f"/api/content-labels/franchise/{labelled_franchise.system_id}",
            json={"label_keys": []},
        ).status_code
        == 200
    )


# ---------------------------------------------------------------------------
# The franchise itself
# ---------------------------------------------------------------------------


def test_a_labelled_franchise_is_hidden(narrow, labelled_franchise):
    res = narrow.get(f"/api/franchise/{labelled_franchise.system_id}")
    assert res.status_code == 404
    assert res.json()["detail"] == "Franchise not found."


def test_the_same_franchise_is_visible_to_a_mode_carrying_the_label(
    admin_client, labelled_franchise
):
    """The mirror. Without it the 404 above could be any other refusal."""
    res = admin_client.get(f"/api/franchise/{labelled_franchise.system_id}")
    assert res.status_code == 200, res.text
    assert res.json()["system_id"] == str(labelled_franchise.system_id)


def test_a_labelled_franchise_is_absent_from_the_list(
    narrow, admin_client, labelled_franchise
):
    hidden = {row["system_id"] for row in narrow.get("/api/franchise/").json()}
    shown = {
        row["system_id"] for row in admin_client.get("/api/franchise/").json()
    }
    assert str(labelled_franchise.system_id) not in hidden
    assert str(labelled_franchise.system_id) in shown


def test_a_labelled_franchise_is_absent_from_search(
    narrow, admin_client, labelled_franchise
):
    """
    The `franchise` bucket is not an entry type, so it is not covered by the
    media-type gate and had no gate of its own until this change.
    """

    def franchise_ids(client):
        res = client.get("/api/search/", params={"q": "Test"})
        assert res.status_code == 200, res.text
        return {row["system_id"] for row in res.json()["results"]["franchise"]}

    assert str(labelled_franchise.system_id) not in franchise_ids(narrow)
    assert str(labelled_franchise.system_id) in franchise_ids(admin_client)


# ---------------------------------------------------------------------------
# The cascade
# ---------------------------------------------------------------------------


def test_a_labelled_franchise_hides_its_entries(
    narrow, admin_client, sample_anime, labelled_franchise
):
    """
    The entry carries NO label of its own - only its franchise does.

    This is the whole feature: one edit on the franchise covers everything
    under it, without writing a row onto any entry.
    """
    assert sample_anime.franchise_id == labelled_franchise.system_id
    assert narrow.get(f"/api/anime/{sample_anime.public_id}").status_code == 404
    assert (
        admin_client.get(f"/api/anime/{sample_anime.public_id}").status_code
        == 200
    )


def test_a_labelled_franchise_hides_its_entries_from_the_list(
    narrow, admin_client, sample_anime, labelled_franchise
):
    def anime_ids(client):
        res = client.get("/api/anime/")
        assert res.status_code == 200, res.text
        return {row["system_id"] for row in res.json()}

    assert str(sample_anime.system_id) not in anime_ids(narrow)
    assert str(sample_anime.system_id) in anime_ids(admin_client)


def test_clearing_the_franchise_labels_reveals_its_entries(
    db_session, narrow, sample_anime, labelled_franchise
):
    """Nothing was copied onto the entry, so removing the row is enough."""
    assert narrow.get(f"/api/anime/{sample_anime.public_id}").status_code == 404
    db_session.query(models.FranchiseContentLabel).filter(
        models.FranchiseContentLabel.franchise_id == labelled_franchise.system_id
    ).delete(synchronize_session=False)
    db_session.flush()
    assert narrow.get(f"/api/anime/{sample_anime.public_id}").status_code == 200


def test_moving_an_entry_out_of_the_franchise_reveals_it(
    db_session, narrow, sample_anime, labelled_franchise
):
    """The join is on media.franchise_id, read at request time."""
    assert narrow.get(f"/api/anime/{sample_anime.public_id}").status_code == 404
    sample_anime.franchise_id = None
    db_session.flush()
    assert narrow.get(f"/api/anime/{sample_anime.public_id}").status_code == 200


def test_an_unlabelled_franchise_hides_nothing(
    narrow, sample_anime, sample_franchise, nsfw_label
):
    """
    The vacuous-pass guard. `nsfw_label` exists and `narrow` carries no
    labels, so every gate above is armed - and this entry is still visible,
    because nothing it belongs to is labelled.
    """
    assert narrow.get(f"/api/anime/{sample_anime.public_id}").status_code == 200
    assert (
        narrow.get(f"/api/franchise/{sample_franchise.system_id}").status_code
        == 200
    )


# ---------------------------------------------------------------------------
# What the detail pages are given
# ---------------------------------------------------------------------------


def test_the_franchise_response_carries_its_labels(
    admin_client, labelled_franchise
):
    body = admin_client.get(
        f"/api/franchise/{labelled_franchise.system_id}"
    ).json()
    assert [row["key"] for row in body["content_labels"]] == ["nsfw"]
    assert body["content_labels"][0]["label"] == "NSFW"


def test_the_entry_response_carries_its_own_labels(admin_client, hidden_anime):
    body = admin_client.get(f"/api/anime/{hidden_anime.public_id}").json()
    assert [row["key"] for row in body["content_labels"]] == ["nsfw"]


def test_an_entry_does_not_claim_its_franchises_labels(
    admin_client, sample_anime, labelled_franchise
):
    """
    The franchise's set is shown on the franchise, where it can be changed.
    Merging the two here would leave a reader no way to tell which one to
    edit to reveal the entry.
    """
    body = admin_client.get(f"/api/anime/{sample_anime.public_id}").json()
    assert body["content_labels"] == []
