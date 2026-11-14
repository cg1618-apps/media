"""
Content labels on collections and series, and the cascade down the tree.

  collection  hides itself, its franchises, their series and every entry
  franchise   hides itself, its series and its entries
  series      hides itself and its entries - not its franchise, not a sibling

Every refusal is paired with its mirror: the same request from `owner_client`,
whose mode (`unrestricted`) shows every label, so a 404 or an absence proves
the label did the hiding rather than anything incidental. `narrow` sits in
`safe`, which shows no label at all, and `nsfw` is the label every fixture
attaches - the fixture that makes refusal possible.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain.label_rules import add_missing_nsfw
from app.services.rbac.enforcement import filter_visible_pairs, tier_visible
from app.services.rbac.resolver import Viewer


@pytest.fixture
def narrow(catalog_writer):
    """A catalogue editor whose mode shows NO labels."""
    return catalog_writer(username="narrowgroups", label_keys=())


@pytest.fixture
def tree(db_session, owner_user):
    """
    collection -> franchise -> two series, an entry in one series, and an
    entry of the franchise in no series. Nothing is labelled yet.
    """
    collection = models.Collection(
        system_id=uuid.uuid4(), collection_name_en="Tree Collection"
    )
    db_session.add(collection)
    db_session.flush()
    franchise = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_type="ACG",
        franchise_name_en="Tree Franchise",
        collection_id=collection.system_id,
    )
    db_session.add(franchise)
    db_session.flush()
    series = models.Series(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        series_name_en="Tree Series",
    )
    sibling = models.Series(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        series_name_en="Tree Sibling Series",
    )
    db_session.add_all([series, sibling])
    db_session.flush()
    in_series = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        series_id=series.system_id,
        anime_name_en="Tree Anime In Series",
        airing_type="TV",
    )
    loose = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en="Tree Anime Loose",
        airing_type="TV",
    )
    db_session.add_all([in_series, loose])
    db_session.flush()
    return {
        "collection": collection,
        "franchise": franchise,
        "series": series,
        "sibling": sibling,
        "in_series": in_series,
        "loose": loose,
    }


def _label(db_session, join_model, nsfw_label, **owner):
    db_session.add(join_model(label_id=nsfw_label.system_id, **owner))
    db_session.flush()


def _seen(client, tree):
    """Which of the tree's six objects `client` can open."""
    paths = {
        "collection": f"/api/collection/{tree['collection'].system_id}",
        "franchise": f"/api/franchise/{tree['franchise'].system_id}",
        "series": f"/api/series/{tree['series'].system_id}",
        "sibling": f"/api/series/{tree['sibling'].system_id}",
        "in_series": f"/api/anime/{tree['in_series'].public_id}",
        "loose": f"/api/anime/{tree['loose'].public_id}",
    }
    out = set()
    for name, path in paths.items():
        status = client.get(path).status_code
        assert status in (200, 404), (name, status)
        if status == 200:
            out.add(name)
    return out


EVERYTHING = {"collection", "franchise", "series", "sibling", "in_series", "loose"}


# ---------------------------------------------------------------------------
# The cascade
# ---------------------------------------------------------------------------


def test_an_unlabelled_tree_hides_nothing(narrow, owner_client, tree):
    """The baseline the refusals below are measured against."""
    assert _seen(narrow, tree) == EVERYTHING
    assert _seen(owner_client, tree) == EVERYTHING


def test_a_collection_label_hides_the_whole_tree(
    db_session, narrow, owner_client, tree, nsfw_label
):
    _label(
        db_session,
        models.CollectionContentLabel,
        nsfw_label,
        collection_id=tree["collection"].system_id,
    )

    assert _seen(narrow, tree) == set()
    assert _seen(owner_client, tree) == EVERYTHING


def test_a_series_label_hides_the_series_and_its_entries_only(
    db_session, narrow, owner_client, tree, nsfw_label
):
    _label(
        db_session,
        models.SeriesContentLabel,
        nsfw_label,
        series_id=tree["series"].system_id,
    )

    assert _seen(narrow, tree) == {"collection", "franchise", "sibling", "loose"}
    assert _seen(owner_client, tree) == EVERYTHING


def test_a_franchise_label_hides_its_series_and_entries_not_its_collection(
    db_session, narrow, owner_client, tree, nsfw_label
):
    _label(
        db_session,
        models.FranchiseContentLabel,
        nsfw_label,
        franchise_id=tree["franchise"].system_id,
    )

    assert _seen(narrow, tree) == {"collection"}
    assert _seen(owner_client, tree) == EVERYTHING


def test_moving_a_franchise_out_of_a_labelled_collection_reveals_it(
    db_session, narrow, tree, nsfw_label
):
    """Read-time, not copied: nothing was written onto the franchise."""
    _label(
        db_session,
        models.CollectionContentLabel,
        nsfw_label,
        collection_id=tree["collection"].system_id,
    )
    tree["franchise"].collection_id = None
    db_session.flush()

    assert _seen(narrow, tree) == EVERYTHING - {"collection"}


def test_a_labelled_collection_is_absent_from_lists(
    db_session, narrow, owner_client, tree, nsfw_label
):
    _label(
        db_session,
        models.CollectionContentLabel,
        nsfw_label,
        collection_id=tree["collection"].system_id,
    )

    def ids(client, path):
        res = client.get(path)
        assert res.status_code == 200, res.text
        return {row["system_id"] for row in res.json()}

    for path, obj in (
        ("/api/collection/", "collection"),
        ("/api/franchise/", "franchise"),
        ("/api/series/", "series"),
        ("/api/anime/", "in_series"),
    ):
        key = str(tree[obj].system_id)
        assert key not in ids(narrow, path), path
        assert key in ids(owner_client, path), path


def test_a_labelled_collection_and_series_are_absent_from_search(
    db_session, narrow, owner_client, tree, nsfw_label
):
    """The `collection` bucket had no visibility gate at all before groups
    could carry labels."""
    _label(
        db_session,
        models.CollectionContentLabel,
        nsfw_label,
        collection_id=tree["collection"].system_id,
    )

    def bucket(client, key, q):
        res = client.get("/api/search/", params={"q": q})
        assert res.status_code == 200, res.text
        return {row["system_id"] for row in res.json()["results"][key]}

    collection = str(tree["collection"].system_id)
    series = str(tree["series"].system_id)
    assert collection not in bucket(narrow, "collection", "Tree Collection")
    assert collection in bucket(owner_client, "collection", "Tree Collection")
    assert series not in bucket(narrow, "series", "Tree Series")
    assert series in bucket(owner_client, "series", "Tree Series")


# ---------------------------------------------------------------------------
# The id-only gates other routers use
# ---------------------------------------------------------------------------


def _safe_viewer():
    """A session that sees no label, built directly for the helpers."""
    return _viewer(frozenset())


def _viewer(visible_label_ids):
    return Viewer(
        username=None,
        role_id=None,
        role_name="guest",
        permissions=frozenset(),
        visible_label_ids=visible_label_ids,
    )


def test_tier_visible_resolves_a_collection_id(db_session, tree, nsfw_label):
    viewer = _safe_viewer()
    collection_id = tree["collection"].system_id
    assert tier_visible(db_session, viewer, collection_id)

    _label(
        db_session,
        models.CollectionContentLabel,
        nsfw_label,
        collection_id=collection_id,
    )

    assert not tier_visible(db_session, viewer, collection_id)
    assert not tier_visible(db_session, viewer, tree["series"].system_id)
    # The mirror: a session that shows the label.
    wide = _viewer(frozenset({nsfw_label.system_id}))
    assert tier_visible(db_session, wide, collection_id)


def test_filter_visible_pairs_drops_a_hidden_collection_and_series(
    db_session, tree, nsfw_label
):
    _label(
        db_session,
        models.SeriesContentLabel,
        nsfw_label,
        series_id=tree["series"].system_id,
    )
    pairs = {
        ("collection", tree["collection"].system_id),
        ("series", tree["series"].system_id),
        ("series", tree["sibling"].system_id),
    }

    kept = filter_visible_pairs(db_session, _safe_viewer(), pairs)

    assert kept == pairs - {("series", tree["series"].system_id)}


# ---------------------------------------------------------------------------
# Assignment
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tier", ["collection", "series"])
def test_assigning_a_label_brings_nsfw(owner_client, tree, tier, nsfw_label):
    res = owner_client.put(
        f"/api/content-labels/{tier}/{tree[tier].system_id}",
        json={"label_keys": ["erotica"]},
    )
    assert res.status_code == 200, res.text
    assert res.json() == ["erotica", "nsfw"]
    assert (
        owner_client.get(f"/api/content-labels/{tier}/{tree[tier].system_id}").json()
        == ["erotica", "nsfw"]
    )


@pytest.mark.parametrize("tier", ["collection", "series"])
def test_dropping_nsfw_while_another_label_stays_is_refused(
    owner_client, tree, tier, nsfw_label
):
    url = f"/api/content-labels/{tier}/{tree[tier].system_id}"
    assert owner_client.put(url, json={"label_keys": ["erotica"]}).status_code == 200

    refused = owner_client.put(url, json={"label_keys": ["erotica"]})

    assert refused.status_code == 422
    assert owner_client.get(url).json() == ["erotica", "nsfw"]
    # The mirror: dropping every label at once is allowed.
    assert owner_client.put(url, json={"label_keys": []}).json() == []


@pytest.mark.parametrize("tier", ["collection", "series"])
def test_an_unknown_label_is_422(owner_client, tree, tier, nsfw_label):
    res = owner_client.put(
        f"/api/content-labels/{tier}/{tree[tier].system_id}",
        json={"label_keys": ["no-such-label"]},
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "tier,join_model,column",
    [
        ("collection", models.CollectionContentLabel, "collection_id"),
        ("series", models.SeriesContentLabel, "series_id"),
    ],
)
def test_a_narrow_editor_cannot_relabel_what_it_cannot_see(
    db_session, narrow, owner_client, tree, nsfw_label, tier, join_model, column
):
    _label(db_session, join_model, nsfw_label, **{column: tree[tier].system_id})
    url = f"/api/content-labels/{tier}/{tree[tier].system_id}"

    assert narrow.put(url, json={"label_keys": []}).status_code == 404
    assert narrow.get(url).status_code == 404
    # The mirror: the same call from a mode that shows the label.
    assert owner_client.put(url, json={"label_keys": []}).status_code == 200


@pytest.mark.parametrize("tier", ["collection", "series"])
def test_a_plain_user_may_assign_nothing(user_client, tree, tier, nsfw_label):
    res = user_client.put(
        f"/api/content-labels/{tier}/{tree[tier].system_id}",
        json={"label_keys": ["nsfw"]},
    )
    assert res.status_code == 401


def test_the_group_responses_carry_their_own_labels(
    db_session, owner_client, tree, nsfw_label
):
    """Each group shows only its OWN labels - a series does not claim its
    collection's, or the page could not say which one to edit."""
    _label(
        db_session,
        models.CollectionContentLabel,
        nsfw_label,
        collection_id=tree["collection"].system_id,
    )

    collection = owner_client.get(
        f"/api/collection/{tree['collection'].system_id}"
    ).json()
    series = owner_client.get(f"/api/series/{tree['series'].system_id}").json()

    assert [label["key"] for label in collection["content_labels"]] == ["nsfw"]
    assert series["content_labels"] == []


def test_the_reference_counts_each_tier(db_session, owner_client, tree, nsfw_label):
    _label(
        db_session,
        models.CollectionContentLabel,
        nsfw_label,
        collection_id=tree["collection"].system_id,
    )
    _label(
        db_session,
        models.SeriesContentLabel,
        nsfw_label,
        series_id=tree["series"].system_id,
    )

    rows = {row["key"]: row for row in owner_client.get("/api/content-labels/").json()}

    assert rows["nsfw"]["collection_count"] >= 1
    assert rows["nsfw"]["series_count"] >= 1
    # The mirror: a label nothing carries counts nothing.
    assert rows["ecchi"]["collection_count"] == 0
    assert rows["ecchi"]["series_count"] == 0


@pytest.mark.parametrize(
    "tier,join_model,column",
    [
        ("collection", models.CollectionContentLabel, "collection_id"),
        ("series", models.SeriesContentLabel, "series_id"),
    ],
)
def test_the_invariant_pass_adds_the_missing_nsfw_to_a_group(
    db_session, tree, tier, join_model, column
):
    """A row written without the rule - by a Pull, say - gets nsfw."""
    ecchi = (
        db_session.query(models.ContentLabel)
        .filter(models.ContentLabel.key == "ecchi")
        .one()
    )
    db_session.add(join_model(label_id=ecchi.system_id, **{column: tree[tier].system_id}))
    db_session.flush()

    added = add_missing_nsfw(db_session)

    assert added[tier] >= 1
    keys = {
        key
        for (key,) in db_session.query(models.ContentLabel.key)
        .join(join_model, join_model.label_id == models.ContentLabel.system_id)
        .filter(getattr(join_model, column) == tree[tier].system_id)
    }
    assert keys == {"ecchi", "nsfw"}
