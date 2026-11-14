"""
A watch order, or a relations scope, whose owning group is hidden reads as
missing.

The entries inside an order were already filtered, but the order itself - its
name, its owner's id and display name - listed for a viewer whose mode hides
the collection, franchise or series that owns it, and the relations graph and
scope listing answered a hidden scope with a 200. See docs/systems/watch-orders.md
and docs/authorization.md, "Object scoping".

Every refusal runs from a mode that hides `nsfw` (`client`, logged out, is
`safe`; `safe_follower` is a `self.list` account in a mode carrying no label),
with the owner labelled `nsfw` - the label is what makes refusal possible. Its
mirror is `user_client`, whose mode (`unrestricted`) carries every label, so a
404 or an absence proves the label did the hiding.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import PERM_SELF_LIST
from tests.api.conftest import make_viewer, nsfw_label  # noqa: F401

HIDDEN_ORDER = "Zvornik Hidden Order"


@pytest.fixture
def labelled_tree(db_session, nsfw_label):
    """
    A labelled collection, a labelled franchise in an unlabelled collection,
    and a series under the labelled franchise. Each tier owns one order.
    """
    collection = models.Collection(
        system_id=uuid.uuid4(), collection_name_en="Hidden Owner Collection"
    )
    open_collection = models.Collection(
        system_id=uuid.uuid4(), collection_name_en="Open Owner Collection"
    )
    db_session.add_all([collection, open_collection])
    db_session.flush()
    franchise = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_type="ACG",
        franchise_name_en="Hidden Owner Franchise",
        collection_id=open_collection.system_id,
    )
    db_session.add(franchise)
    db_session.flush()
    series = models.Series(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        series_name_en="Series Under Hidden Franchise",
    )
    db_session.add(series)
    db_session.flush()
    db_session.add_all(
        [
            models.CollectionContentLabel(
                collection_id=collection.system_id, label_id=nsfw_label.system_id
            ),
            models.FranchiseContentLabel(
                franchise_id=franchise.system_id, label_id=nsfw_label.system_id
            ),
        ]
    )
    db_session.flush()
    orders = {}
    for tier, owner in (
        ("collection", collection),
        ("franchise", franchise),
        ("series", series),
    ):
        order = models.WatchOrderList(
            system_id=uuid.uuid4(),
            list_name=f"{HIDDEN_ORDER} {tier}",
            **{f"{tier}_id": owner.system_id},
        )
        db_session.add(order)
        orders[tier] = order
    db_session.flush()
    return {
        "collection": collection,
        "franchise": franchise,
        "series": series,
        "orders": orders,
    }


@pytest.fixture
def safe_follower(db_session, client):
    """`client`, signed in with `self.list` in a mode that carries no label."""
    make_viewer(db_session, client, "safefollower", {PERM_SELF_LIST}, label_keys=())
    return client


TIERS = ("collection", "franchise", "series")


def _list_ids(client, **params):
    response = client.get("/api/watch-order/lists", params=params)
    assert response.status_code == 200, response.text
    return {row["system_id"] for row in response.json()}


# ---------------------------------------------------------------------------
# Watch-order reads
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tier", TIERS)
def test_the_unfiltered_listing_omits_an_order_whose_owner_is_hidden(
    client, user_client, labelled_tree, tier
):
    order_id = str(labelled_tree["orders"][tier].system_id)
    assert order_id not in _list_ids(client)
    assert order_id in _list_ids(user_client)


@pytest.mark.parametrize("tier", TIERS)
def test_the_owner_filtered_listing_omits_a_hidden_owner(
    client, user_client, labelled_tree, tier
):
    params = {f"{tier}_id": str(labelled_tree[tier].system_id)}
    order_id = str(labelled_tree["orders"][tier].system_id)
    assert _list_ids(client, **params) == set()
    assert _list_ids(user_client, **params) == {order_id}


@pytest.mark.parametrize("tier", TIERS)
def test_opening_an_order_whose_owner_is_hidden_is_404(
    client, user_client, labelled_tree, tier
):
    path = f"/api/watch-order/lists/{labelled_tree['orders'][tier].system_id}"
    response = client.get(path)
    assert response.status_code == 404
    assert HIDDEN_ORDER not in response.text
    assert user_client.get(path).status_code == 200


def test_candidates_for_a_hidden_owner_are_404(client, user_client, labelled_tree):
    params = {"franchise_id": str(labelled_tree["franchise"].system_id)}
    assert client.get("/api/watch-order/candidates", params=params).status_code == 404
    assert (
        user_client.get("/api/watch-order/candidates", params=params).status_code
        == 200
    )


# ---------------------------------------------------------------------------
# Following
# ---------------------------------------------------------------------------


def test_following_an_order_whose_owner_is_hidden_is_404(
    safe_follower, user_client, labelled_tree
):
    path = f"/api/watch-order/lists/{labelled_tree['orders']['franchise'].system_id}/follow"
    assert safe_follower.put(path).status_code == 404
    assert user_client.put(path).status_code == 200


def test_a_followed_order_whose_owner_is_hidden_leaves_the_follows(
    db_session, safe_follower, user_client, labelled_tree
):
    """
    The follow row exists - followed in a wider mode, or before the label was
    set - and the narrow session neither lists it nor names its owner.
    """
    order = labelled_tree["orders"]["franchise"]
    follower = (
        db_session.query(models.User).filter_by(username="safefollower").one()
    )
    db_session.add(
        models.WatchOrderFollow(
            user_id=follower.id,
            list_id=order.system_id,
            franchise_id=order.franchise_id,
        )
    )
    db_session.flush()

    response = safe_follower.get("/api/watch-order/follows")
    assert response.status_code == 200
    assert response.json() == []
    assert "Hidden Owner Franchise" not in response.text

    # Mirror: the same follow, held by an account whose mode shows the label.
    assert user_client.put(
        f"/api/watch-order/lists/{order.system_id}/follow"
    ).status_code == 200
    names = [row["list"]["list_name"] for row in user_client.get(
        "/api/watch-order/follows"
    ).json()]
    assert order.list_name in names


# ---------------------------------------------------------------------------
# Relations
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tier", TIERS)
def test_the_graph_of_a_hidden_scope_is_404(client, user_client, labelled_tree, tier):
    params = {f"{tier}_id": str(labelled_tree[tier].system_id)}
    assert client.get("/api/media-relation/graph", params=params).status_code == 404
    assert (
        user_client.get("/api/media-relation/graph", params=params).status_code == 200
    )


@pytest.mark.parametrize("tier", ("collection", "franchise"))
def test_the_scope_listing_of_a_hidden_scope_is_404(
    client, user_client, labelled_tree, tier
):
    params = {f"{tier}_id": str(labelled_tree[tier].system_id)}
    assert client.get("/api/media-relation/", params=params).status_code == 404
    assert user_client.get("/api/media-relation/", params=params).status_code == 200
