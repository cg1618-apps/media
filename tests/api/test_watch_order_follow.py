"""
Following a watch order: /api/watch-order/follows and /lists/{id}/follow.

A signed-in member follows at most one order per group (the franchise, series
or collection that owns it), and the follow reports where that member stands
in the order, computed from their own list rows. See docs/systems/watch-orders.md,
"Following".

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.rbac.permissions import PERM_SELF_LIST
from app.services.rbac.seed import default_user_permissions
from tests.api.conftest import make_viewer

# ---------------------------------------------------------------------------
# Fixtures and helpers
# ---------------------------------------------------------------------------


def _own(db, user_id, entry, status, **fields):
    """The given user's list row for `entry`."""
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=user_id,
            media_id=entry.system_id,
            status=status,
            **fields,
        )
    )
    db.flush()


def _entry(db, model, franchise, **names):
    row = model(system_id=uuid.uuid4(), franchise_id=franchise.system_id, **names)
    db.add(row)
    db.flush()
    return row


def _list(db, franchise=None, name="Order", **kw):
    lst = models.WatchOrderList(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id if franchise else None,
        list_name=name,
        **kw,
    )
    db.add(lst)
    db.flush()
    return lst


def _step(db, lst, entry, position, **kw):
    item = models.WatchOrderItem(
        system_id=uuid.uuid4(),
        list_id=lst.system_id,
        position=float(position),
        entry_id=entry.system_id,
        **kw,
    )
    db.add(item)
    db.flush()
    return item


def _follow(client, lst):
    return client.put(f"/api/watch-order/lists/{lst.system_id}/follow")


def _follows(client):
    response = client.get("/api/watch-order/follows")
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def anime_a(db_session, sample_franchise):
    return _entry(
        db_session, models.Anime, sample_franchise, anime_name_en="A", ep_total=12
    )


@pytest.fixture
def movie_b(db_session, sample_franchise):
    return _entry(
        db_session, models.AnimeMovies, sample_franchise, anime_movie_name_en="B"
    )


@pytest.fixture
def split_run(db_session, sample_franchise, anime_a, movie_b):
    """A ep 1-10 -> B (optional, noted) -> A ep 11-12."""
    lst = _list(db_session, sample_franchise, "Split run")
    _step(db_session, lst, anime_a, 1, ep_start=1, ep_end=10, note="first half")
    _step(db_session, lst, movie_b, 2, importance="Optional", note="side story")
    _step(db_session, lst, anime_a, 3, ep_start=11, ep_end=12)
    return lst


@pytest.fixture
def second_order(db_session, sample_franchise, anime_a):
    lst = _list(db_session, sample_franchise, "Release")
    _step(db_session, lst, anime_a, 1)
    return lst


# ---------------------------------------------------------------------------
# Follow and unfollow
# ---------------------------------------------------------------------------


class TestFollowAndUnfollow:
    def test_follow_then_list(self, user_client, split_run):
        response = _follow(user_client, split_run)
        assert response.status_code == 200, response.text

        rows = _follows(user_client)
        assert [r["list"]["system_id"] for r in rows] == [str(split_run.system_id)]
        assert rows[0]["owner"]["tier"] == "franchise"
        assert rows[0]["owner"]["display_name"]

    def test_follow_accepts_the_public_id(self, user_client, split_run):
        response = user_client.put(
            f"/api/watch-order/lists/{split_run.public_id}/follow"
        )
        assert response.status_code == 200

    def test_follow_is_idempotent(self, user_client, db_session, split_run):
        _follow(user_client, split_run)
        _follow(user_client, split_run)
        assert db_session.query(models.WatchOrderFollow).count() == 1

    def test_unfollow_deletes_the_row(self, user_client, db_session, split_run):
        _follow(user_client, split_run)
        response = user_client.delete(
            f"/api/watch-order/lists/{split_run.system_id}/follow"
        )
        assert response.status_code == 200
        assert _follows(user_client) == []
        assert db_session.query(models.WatchOrderFollow).count() == 0

    def test_unfollowing_what_is_not_followed_is_404(self, user_client, split_run):
        response = user_client.delete(
            f"/api/watch-order/lists/{split_run.system_id}/follow"
        )
        assert response.status_code == 404

    def test_unknown_order_is_404(self, user_client):
        response = user_client.put(f"/api/watch-order/lists/{uuid.uuid4()}/follow")
        assert response.status_code == 404


class TestOnePerGroup:
    def test_following_another_order_of_the_group_replaces_the_first(
        self, user_client, split_run, second_order
    ):
        _follow(user_client, split_run)
        _follow(user_client, second_order)

        rows = _follows(user_client)
        assert [r["list"]["system_id"] for r in rows] == [str(second_order.system_id)]

    def test_another_group_keeps_its_follow(
        self, user_client, db_session, split_run, sample_collection, anime_a
    ):
        elsewhere = models.WatchOrderList(
            system_id=uuid.uuid4(),
            collection_id=sample_collection.system_id,
            list_name="Collection order",
        )
        db_session.add(elsewhere)
        db_session.flush()
        _step(db_session, elsewhere, anime_a, 1)

        _follow(user_client, split_run)
        _follow(user_client, elsewhere)

        followed = {r["list"]["system_id"] for r in _follows(user_client)}
        assert followed == {str(split_run.system_id), str(elsewhere.system_id)}

    def test_the_database_refuses_a_second_follow_in_one_group(
        self, db_session, plain_user, split_run, second_order, sample_franchise
    ):
        for lst in (split_run, second_order):
            db_session.add(
                models.WatchOrderFollow(
                    user_id=plain_user.id,
                    list_id=lst.system_id,
                    franchise_id=sample_franchise.system_id,
                )
            )
        with pytest.raises(IntegrityError):
            db_session.flush()
        db_session.rollback()

    def test_the_database_refuses_an_ownerless_follow(
        self, db_session, plain_user, split_run
    ):
        db_session.add(
            models.WatchOrderFollow(user_id=plain_user.id, list_id=split_run.system_id)
        )
        with pytest.raises(IntegrityError):
            db_session.flush()
        db_session.rollback()


class TestFollowsArePerUser:
    def test_another_users_follow_is_neither_seen_nor_replaced(
        self, user_client, db_session, split_run, second_order, sample_franchise
    ):
        other_role = (
            db_session.query(models.Role).filter(models.Role.name == "user").one()
        )
        other = models.User(
            id=uuid.uuid4(),
            username="other_follower",
            hashed_password="!",
            role_id=other_role.system_id,
        )
        db_session.add(other)
        db_session.flush()
        db_session.add(
            models.WatchOrderFollow(
                user_id=other.id,
                list_id=split_run.system_id,
                franchise_id=sample_franchise.system_id,
            )
        )
        db_session.flush()

        assert _follows(user_client) == []
        _follow(user_client, second_order)
        user_client.delete(f"/api/watch-order/lists/{second_order.system_id}/follow")

        theirs = (
            db_session.query(models.WatchOrderFollow)
            .filter(models.WatchOrderFollow.user_id == other.id)
            .all()
        )
        assert [f.list_id for f in theirs] == [split_run.system_id]


class TestCascade:
    def test_deleting_the_order_deletes_the_follow(
        self, user_client, db_session, split_run
    ):
        _follow(user_client, split_run)
        db_session.delete(split_run)
        db_session.flush()
        db_session.expire_all()
        assert db_session.query(models.WatchOrderFollow).count() == 0
        assert _follows(user_client) == []


class TestPermission:
    """
    Following is a `self.list` capability. The refusals bite because the order
    exists and every caller below may read it: what they lack is the
    permission, and the mirror case with the same order answers 200.
    """

    def test_guest_is_refused(self, client, split_run):
        assert _follow(client, split_run).status_code == 401
        assert client.get("/api/watch-order/follows").status_code == 401
        assert (
            client.get(f"/api/watch-order/follows/entry/{uuid.uuid4()}").status_code
            == 401
        )

    def test_admin_without_self_list_is_refused(self, admin_client, split_run):
        # The admin is root and holds every non-self permission.
        assert admin_client.get(
            f"/api/watch-order/lists/{split_run.system_id}"
        ).status_code == 200
        assert _follow(admin_client, split_run).status_code == 401
        assert admin_client.get("/api/watch-order/follows").status_code == 401

    def test_member_without_self_list_is_refused(
        self, client, db_session, split_run
    ):
        make_viewer(
            db_session,
            client,
            "no_self_list",
            default_user_permissions() - {PERM_SELF_LIST},
        )
        assert _follow(client, split_run).status_code == 401
        assert client.get("/api/watch-order/follows").status_code == 401

    def test_member_with_self_list_may_follow(self, client, db_session, split_run):
        make_viewer(db_session, client, "with_self_list", default_user_permissions())
        assert _follow(client, split_run).status_code == 200


class TestOwnerIsImmutable:
    """The copy of the owner on each follow is only sound if this holds."""

    def test_patch_cannot_move_an_order(
        self, admin_client, split_run, sample_collection
    ):
        response = admin_client.patch(
            f"/api/watch-order/lists/{split_run.system_id}",
            json={"franchise_id": None, "collection_id": str(sample_collection.system_id)},
        )
        assert response.status_code == 400

    def test_put_cannot_move_an_order(self, admin_client, split_run, sample_collection):
        response = admin_client.put(
            f"/api/watch-order/lists/{split_run.system_id}",
            json={"franchise_id": None, "collection_id": str(sample_collection.system_id)},
        )
        assert response.status_code == 400

    def test_restating_the_same_owner_is_allowed(
        self, admin_client, split_run, sample_franchise
    ):
        response = admin_client.put(
            f"/api/watch-order/lists/{split_run.system_id}",
            json={"franchise_id": str(sample_franchise.system_id), "list_name": "X"},
        )
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Progress
# ---------------------------------------------------------------------------


@pytest.fixture
def progress_order(db_session, sample_franchise, plain_user):
    """
    Eight steps, one per rule:

    1 anime A ep 1-10   Active Watching, ep_fin 10  -> done (range reached)
    2 movie B           Completed                   -> done
    3 anime A ep 11-12  Active Watching, ep_fin 10  -> active (range reached next)
    4 manga C           Dropped                     -> done
    5 comic D           Temp Dropped                -> done
    6 anime E           no list row                 -> pending  (up next: a gap)
    7 tv F              Passive Watching            -> active
    8 novel G           Completed                   -> done
    """
    f = sample_franchise
    a = _entry(db_session, models.Anime, f, anime_name_en="A", ep_total=12)
    b = _entry(db_session, models.AnimeMovies, f, anime_movie_name_en="B")
    c = _entry(db_session, models.Manga, f, manga_name_en="C")
    d = _entry(db_session, models.Comic, f, comic_name_en="D")
    e = _entry(db_session, models.Anime, f, anime_name_en="E")
    tv = _entry(db_session, models.TVShows, f, tv_name_en="F")
    g = _entry(db_session, models.Novel, f, novel_name_en="G")

    uid = plain_user.id
    _own(db_session, uid, a, "Active Watching", ep_fin=10)
    _own(db_session, uid, b, "Completed")
    _own(db_session, uid, c, "Dropped")
    _own(db_session, uid, d, "Temp Dropped")
    _own(db_session, uid, tv, "Passive Watching")
    _own(db_session, uid, g, "Completed")

    lst = _list(db_session, f, "Everything")
    _step(db_session, lst, a, 1, ep_start=1, ep_end=10)
    _step(db_session, lst, b, 2)
    _step(db_session, lst, a, 3, ep_start=11, ep_end=12)
    _step(db_session, lst, c, 4)
    _step(db_session, lst, d, 5)
    _step(db_session, lst, e, 6, importance="Essential", note="do not skip")
    _step(db_session, lst, tv, 7)
    _step(db_session, lst, g, 8)
    return lst


class TestProgress:
    @pytest.fixture
    def summary(self, user_client, progress_order):
        _follow(user_client, progress_order)
        (row,) = _follows(user_client)
        return row

    def test_done_over_total(self, summary):
        assert (summary["done"], summary["total"]) == (5, 8)

    def test_every_active_step_is_now(self, summary):
        assert [s["number"] for s in summary["now"]] == [3, 7]
        assert all(s["state"] == "active" for s in summary["now"])

    def test_up_next_is_the_earliest_pending_step_even_after_done_ones(
        self, summary
    ):
        up = summary["up_next"]
        assert up["number"] == 6
        assert up["display_name"] == "E"
        assert up["importance"] == "Essential"
        assert up["note"] == "do not skip"
        assert up["public_id"] is not None

    def test_a_range_not_yet_reached_is_pending_not_active(
        self, user_client, db_session, plain_user, sample_franchise
    ):
        a = _entry(db_session, models.Anime, sample_franchise, anime_name_en="Z")
        _own(db_session, plain_user.id, a, "Active Watching", ep_fin=3)
        lst = _list(db_session, sample_franchise, "Halves")
        _step(db_session, lst, a, 1, ep_start=1, ep_end=10)
        _step(db_session, lst, a, 2, ep_start=11, ep_end=12)

        _follow(user_client, lst)
        (row,) = _follows(user_client)
        assert [s["number"] for s in row["now"]] == [1]
        assert row["up_next"]["number"] == 2

    def test_nothing_left_means_no_up_next(
        self, user_client, db_session, plain_user, sample_franchise
    ):
        a = _entry(db_session, models.Anime, sample_franchise, anime_name_en="Y")
        _own(db_session, plain_user.id, a, "Completed")
        lst = _list(db_session, sample_franchise, "Done")
        _step(db_session, lst, a, 1)

        _follow(user_client, lst)
        (row,) = _follows(user_client)
        assert (row["done"], row["total"], row["up_next"]) == (1, 1, None)

    def test_progress_is_read_from_the_followers_own_rows(
        self, user_client, db_session, admin_user, sample_franchise
    ):
        """The admin's Completed row says nothing about the member's progress."""
        a = _entry(db_session, models.Anime, sample_franchise, anime_name_en="X")
        _own(db_session, admin_user.id, a, "Completed")
        lst = _list(db_session, sample_franchise, "Theirs")
        _step(db_session, lst, a, 1)

        _follow(user_client, lst)
        (row,) = _follows(user_client)
        assert row["done"] == 0


class TestVisibility:
    def test_a_hidden_entry_is_dropped_for_a_viewer_who_cannot_see_it(
        self, client, db_session, sample_franchise, hidden_anime, anime_a
    ):
        # The hidden set is non-empty: hidden_anime carries a label this
        # viewer's mode does not.
        lst = _list(db_session, sample_franchise, "With a hidden step")
        _step(db_session, lst, anime_a, 1)
        _step(db_session, lst, hidden_anime, 2)

        make_viewer(
            db_session, client, "narrow", default_user_permissions(), label_keys=()
        )
        _follow(client, lst)
        (row,) = _follows(client)
        assert row["total"] == 1
        assert row["up_next"]["display_name"] == "A"

    def test_the_same_entry_counts_for_a_viewer_who_can_see_it(
        self, client, db_session, sample_franchise, hidden_anime, anime_a
    ):
        lst = _list(db_session, sample_franchise, "With a hidden step")
        _step(db_session, lst, anime_a, 1)
        _step(db_session, lst, hidden_anime, 2)

        make_viewer(
            db_session, client, "wide", default_user_permissions(), label_keys=("nsfw",)
        )
        _follow(client, lst)
        (row,) = _follows(client)
        assert row["total"] == 2


class TestBuiltInOrder:
    def test_a_generated_order_can_be_followed(
        self, user_client, db_session, sample_franchise, anime_a, movie_b, plain_user
    ):
        _own(db_session, plain_user.id, movie_b, "Completed")
        built_in = _list(
            db_session,
            sample_franchise,
            "Release Order",
            list_type="Release",
            auto_source="release",
        )

        assert _follow(user_client, built_in).status_code == 200
        (row,) = _follows(user_client)
        assert row["list"]["auto_source"] == "release"
        assert row["total"] == 2
        assert row["done"] == 1


# ---------------------------------------------------------------------------
# Entry context, for the entry detail page's panel
# ---------------------------------------------------------------------------


class TestEntryContext:
    def test_a_split_run_reports_each_occurrence_with_its_neighbours(
        self, user_client, split_run, anime_a
    ):
        _follow(user_client, split_run)
        response = user_client.get(f"/api/watch-order/follows/entry/{anime_a.system_id}")
        assert response.status_code == 200, response.text

        (ctx,) = response.json()
        assert ctx["total"] == 3
        first, second = ctx["occurrences"]
        assert first["step"]["number"] == 1
        assert first["step"]["note"] == "first half"
        assert first["previous"] is None
        assert first["next"]["display_name"] == "B"
        assert first["next"]["note"] == "side story"
        assert second["step"]["number"] == 3
        assert second["previous"]["importance"] == "Optional"
        assert second["next"] is None

    def test_section_name_travels_with_a_step(
        self, user_client, db_session, split_run, movie_b
    ):
        part = models.WatchOrderSection(
            system_id=uuid.uuid4(), list_id=split_run.system_id, section_name="Part 2"
        )
        db_session.add(part)
        db_session.flush()
        for item in split_run.items:
            if item.entry_id == movie_b.system_id:
                item.section_id = part.system_id
        db_session.flush()

        _follow(user_client, split_run)
        (ctx,) = user_client.get(
            f"/api/watch-order/follows/entry/{movie_b.system_id}"
        ).json()
        assert ctx["occurrences"][0]["step"]["section_name"] == "Part 2"

    def test_an_entry_in_no_followed_order_returns_nothing(
        self, user_client, split_run, second_order, anime_a
    ):
        # Followed nothing yet: the entry is in two orders, neither followed.
        response = user_client.get(f"/api/watch-order/follows/entry/{anime_a.system_id}")
        assert response.json() == []


# ---------------------------------------------------------------------------
# Google Sheets
# ---------------------------------------------------------------------------


class TestSheets:
    """Follows travel like Plan Next: by username, after the lists they cite."""

    def test_the_tab_carries_a_username_not_a_user_id(self):
        from app.services.pipelines.tabs import TAB_BY_NAME

        tab = TAB_BY_NAME["Watch Order Follow"]
        assert "user_id" in tab.drop_columns
        assert [name for name, _fn in tab.extra_columns] == ["username"]

    def test_the_tab_restores_after_lists_and_users(self):
        from app.services.pipelines.tabs import TAB_NAMES

        at = TAB_NAMES.index
        assert at("Users") < at("Watch Order Follow")
        assert at("Watch Order List") < at("Watch Order Follow")
        assert at("Franchise") < at("Watch Order Follow")

    def test_a_row_is_restored_to_the_user_it_names(
        self, db_session, monkeypatch, plain_user, split_run, sample_franchise
    ):
        from app.services.pipelines import pull

        headers = [
            "system_id", "list_id", "franchise_id", "series_id",
            "collection_id", "created_at", "updated_at", "username",
        ]
        row = [
            str(uuid.uuid4()), str(split_run.system_id),
            str(sample_franchise.system_id), "", "", "", "", plain_user.username,
        ]
        monkeypatch.setattr(
            pull, "get_all_raw_rows", lambda tab: {"Watch Order Follow": [headers, row]}[tab]
        )

        result = pull.execute_pull_specific(
            db_session, "Watch Order Follow", log_action=False
        )

        assert result["status"] == "success", result
        (follow,) = db_session.query(models.WatchOrderFollow).all()
        assert follow.user_id == plain_user.id
        assert follow.list_id == split_run.system_id
