"""
Following an order: /api/order/follows and /lists/{id}/follow.

A signed-in member follows at most one order per group (the franchise, series
or collection that owns it), and the follow reports where that member stands
in the order, computed from their own list rows. See docs/systems/orders.md,
"Following".

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import text
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
    lst = models.OrderList(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id if franchise else None,
        list_name=name,
        **kw,
    )
    db.add(lst)
    db.flush()
    return lst


def _step(db, lst, entry, position, **kw):
    item = models.OrderItem(
        system_id=uuid.uuid4(),
        list_id=lst.system_id,
        position=float(position),
        entry_id=entry.system_id,
        **kw,
    )
    db.add(item)
    db.flush()
    return item


def _follow(client, lst, importance=None):
    body = {"importance": importance} if importance else None
    return client.put(f"/api/order/lists/{lst.system_id}/follow", json=body)


def _skip_url(lst, step_id):
    return f"/api/order/lists/{lst.system_id}/follow/skips/{step_id}"


def _follow_row(db, user_id, lst):
    db.expire_all()
    return (
        db.query(models.OrderFollow)
        .filter(
            models.OrderFollow.user_id == user_id,
            models.OrderFollow.list_id == lst.system_id,
        )
        .one()
    )


def _follows(client):
    response = client.get("/api/order/follows")
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
            f"/api/order/lists/{split_run.public_id}/follow"
        )
        assert response.status_code == 200

    def test_follow_is_idempotent(self, user_client, db_session, split_run):
        _follow(user_client, split_run)
        _follow(user_client, split_run)
        assert db_session.query(models.OrderFollow).count() == 1

    def test_unfollow_deletes_the_row(self, user_client, db_session, split_run):
        _follow(user_client, split_run)
        response = user_client.delete(
            f"/api/order/lists/{split_run.system_id}/follow"
        )
        assert response.status_code == 200
        assert _follows(user_client) == []
        assert db_session.query(models.OrderFollow).count() == 0

    def test_unfollowing_what_is_not_followed_is_404(self, user_client, split_run):
        response = user_client.delete(
            f"/api/order/lists/{split_run.system_id}/follow"
        )
        assert response.status_code == 404

    def test_unknown_order_is_404(self, user_client):
        response = user_client.put(f"/api/order/lists/{uuid.uuid4()}/follow")
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
        elsewhere = models.OrderList(
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
                models.OrderFollow(
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
            models.OrderFollow(user_id=plain_user.id, list_id=split_run.system_id)
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
            models.OrderFollow(
                user_id=other.id,
                list_id=split_run.system_id,
                franchise_id=sample_franchise.system_id,
            )
        )
        db_session.flush()

        assert _follows(user_client) == []
        _follow(user_client, second_order)
        user_client.delete(f"/api/order/lists/{second_order.system_id}/follow")

        theirs = (
            db_session.query(models.OrderFollow)
            .filter(models.OrderFollow.user_id == other.id)
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
        assert db_session.query(models.OrderFollow).count() == 0
        assert _follows(user_client) == []


class TestPermission:
    """
    Following is a `self.list` capability. The refusals bite because the order
    exists and every caller below may read it: what they lack is the
    permission, and the mirror case with the same order answers 200.
    """

    def test_guest_is_refused(self, client, split_run):
        assert _follow(client, split_run).status_code == 401
        assert client.get("/api/order/follows").status_code == 401
        assert (
            client.get(f"/api/order/follows/entry/{uuid.uuid4()}").status_code
            == 401
        )

    def test_admin_without_self_list_is_refused(self, admin_client, split_run):
        # The admin holds no self.* permission: it follows nothing. The run
        # is THERE (split_run), so the 401 is the gate's.
        assert _follow(admin_client, split_run).status_code == 401
        assert admin_client.get("/api/order/follows").status_code == 401

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
        assert client.get("/api/order/follows").status_code == 401

    def test_member_with_self_list_may_follow(self, client, db_session, split_run):
        make_viewer(db_session, client, "with_self_list", default_user_permissions())
        assert _follow(client, split_run).status_code == 200


class TestOwnerIsImmutable:
    """The copy of the owner on each follow is only sound if this holds."""

    def test_patch_cannot_move_an_order(
        self, owner_client, split_run, sample_collection
    ):
        response = owner_client.patch(
            f"/api/order/lists/{split_run.system_id}",
            json={"franchise_id": None, "collection_id": str(sample_collection.system_id)},
        )
        assert response.status_code == 400

    def test_put_cannot_move_an_order(self, owner_client, split_run, sample_collection):
        response = owner_client.put(
            f"/api/order/lists/{split_run.system_id}",
            json={"franchise_id": None, "collection_id": str(sample_collection.system_id)},
        )
        assert response.status_code == 400

    def test_restating_the_same_owner_is_allowed(
        self, owner_client, split_run, sample_franchise
    ):
        response = owner_client.put(
            f"/api/order/lists/{split_run.system_id}",
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
    8 book G           Completed                   -> done
    """
    f = sample_franchise
    a = _entry(db_session, models.Anime, f, anime_name_en="A", ep_total=12)
    b = _entry(db_session, models.AnimeMovies, f, anime_movie_name_en="B")
    c = _entry(db_session, models.Manga, f, manga_name_en="C")
    d = _entry(db_session, models.Comic, f, comic_name_en="D")
    e = _entry(db_session, models.Anime, f, anime_name_en="E")
    tv = _entry(db_session, models.TVShows, f, tv_name_en="F")
    g = _entry(db_session, models.Book, f, book_name_en="G")

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
        self, user_client, db_session, owner_user, sample_franchise
    ):
        """The admin's Completed row says nothing about the member's progress."""
        a = _entry(db_session, models.Anime, sample_franchise, anime_name_en="X")
        _own(db_session, owner_user.id, a, "Completed")
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


class TestGameStep:
    """A game is one whole entry: done or not by its playing status alone.

    A stored range on a game step (the editor offers none, the backend does
    not refuse one) never decides anything, because a game has no unit count.
    """

    @pytest.fixture
    def games(self, db_session, sample_franchise, plain_user):
        f = sample_franchise
        done = _entry(db_session, models.Game, f, game_name_en="Done")
        playing = _entry(db_session, models.Game, f, game_name_en="Playing")
        planned = _entry(db_session, models.Game, f, game_name_en="Planned")
        uid = plain_user.id
        _own(db_session, uid, done, "Completed")
        _own(db_session, uid, playing, "Active Playing")
        _own(db_session, uid, planned, "Plan to Play")
        lst = _list(db_session, f, "Play order")
        _step(db_session, lst, done, 1)
        _step(db_session, lst, playing, 2, ep_start=1, ep_end=1)
        _step(db_session, lst, planned, 3)
        return lst

    def test_a_game_step_counts_as_one_whole_unit(self, user_client, games):
        _follow(user_client, games)
        (row,) = _follows(user_client)
        assert (row["done"], row["total"]) == (1, 3)
        assert [s["display_name"] for s in row["now"]] == ["Playing"]
        assert row["up_next"]["display_name"] == "Planned"

    def test_a_game_is_offered_as_a_candidate(
        self, owner_client, db_session, sample_franchise
    ):
        game = _entry(db_session, models.Game, sample_franchise, game_name_en="Pick me")
        response = owner_client.get(
            f"/api/order/candidates?franchise_id={sample_franchise.system_id}"
        )
        assert response.status_code == 200, response.text
        picked = [c for c in response.json() if c["entry_id"] == str(game.system_id)]
        assert [c["media_type"] for c in picked] == ["game"]


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
    def test_a_split_run_reports_each_occurrence_with_its_own_next(
        self, user_client, split_run, anime_a
    ):
        # An Optional follow, so the Optional B is a candidate.
        _follow(user_client, split_run, importance="Optional")
        response = user_client.get(f"/api/order/follows/entry/{anime_a.system_id}")
        assert response.status_code == 200, response.text

        (ctx,) = response.json()
        assert ctx["total"] == 3
        assert ctx["importance"] == "Optional"
        first, second = ctx["occurrences"]
        assert first["step"]["number"] == 1
        assert first["step"]["note"] == "first half"
        assert first["next"]["display_name"] == "B"
        assert first["next"]["note"] == "side story"
        assert second["step"]["number"] == 3
        assert second["next"] is None
        assert "previous" not in first

    def test_a_normal_follow_passes_over_the_optional_step(
        self, user_client, split_run, anime_a
    ):
        _follow(user_client, split_run)
        (ctx,) = user_client.get(
            f"/api/order/follows/entry/{anime_a.system_id}"
        ).json()
        first = ctx["occurrences"][0]
        assert first["next"]["number"] == 3
        assert first["next"]["importance"] == "Normal"

    def test_section_name_travels_with_a_step(
        self, user_client, db_session, split_run, movie_b
    ):
        part = models.OrderSection(
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
            f"/api/order/follows/entry/{movie_b.system_id}"
        ).json()
        assert ctx["occurrences"][0]["step"]["section_name"] == "Part 2"

    def test_an_entry_in_no_followed_order_returns_nothing(
        self, user_client, split_run, second_order, anime_a
    ):
        # Followed nothing yet: the entry is in two orders, neither followed.
        response = user_client.get(f"/api/order/follows/entry/{anime_a.system_id}")
        assert response.json() == []


@pytest.fixture
def ladder(db_session, sample_franchise):
    """
    The owner's example as an order: F, G (Optional), H, I, J (Recommended),
    K, L (Essential). Nobody has a list row, so every step is pending.
    """
    entries = {
        name: _entry(db_session, models.Anime, sample_franchise, anime_name_en=name)
        for name in "FGHIJKL"
    }
    rungs = {"G": "Optional", "J": "Recommended", "L": "Essential"}
    lst = _list(db_session, sample_franchise, "Ladder")
    items = {}
    for position, (name, entry) in enumerate(entries.items(), start=1):
        items[name] = _step(
            db_session, lst, entry, position, importance=rungs.get(name, "Normal")
        )
    return SimpleNamespace(list=lst, entries=entries, items=items)


def _on(client, entry):
    (ctx,) = client.get(f"/api/order/follows/entry/{entry.system_id}").json()
    (occurrence,) = ctx["occurrences"]
    return occurrence


def _names(occurrence):
    nxt = occurrence["next"]
    return (
        nxt["display_name"] if nxt else None,
        [s["display_name"] for s in occurrence["coming_up"]],
    )


class TestPanelNext:
    def test_the_owners_example_on_f(self, user_client, ladder):
        _follow(user_client, ladder.list)
        assert _names(_on(user_client, ladder.entries["F"])) == ("H", ["J", "L"])

    def test_each_row_carries_its_importance_and_step_id(self, user_client, ladder):
        _follow(user_client, ladder.list)
        occurrence = _on(user_client, ladder.entries["F"])
        assert occurrence["next"]["importance"] == "Normal"
        assert occurrence["next"]["step_id"] == str(ladder.items["H"].system_id)
        assert [s["importance"] for s in occurrence["coming_up"]] == [
            "Recommended",
            "Essential",
        ]

    def test_the_dashboard_reads_the_same_rule(self, user_client, ladder):
        # From the start of the order, a Recommended follow passes over every
        # Normal and Optional step to J.
        _follow(user_client, ladder.list, importance="Recommended")
        (row,) = _follows(user_client)
        assert row["up_next"]["display_name"] == "J"


class TestImportance:
    def test_a_new_follow_is_normal(self, user_client, db_session, plain_user, split_run):
        _follow(user_client, split_run)
        assert _follow_row(db_session, plain_user.id, split_run).importance == "Normal"
        (row,) = _follows(user_client)
        assert row["importance"] == "Normal"

    def test_a_follow_may_name_its_importance(
        self, user_client, db_session, plain_user, split_run
    ):
        response = _follow(user_client, split_run, importance="Recommended")
        assert response.status_code == 200, response.text
        assert response.json()["importance"] == "Recommended"
        follow = _follow_row(db_session, plain_user.id, split_run)
        assert follow.importance == "Recommended"

    def test_following_again_changes_the_importance(
        self, user_client, db_session, plain_user, split_run
    ):
        _follow(user_client, split_run, importance="Essential")
        _follow(user_client, split_run, importance="Optional")
        follow = _follow_row(db_session, plain_user.id, split_run)
        assert follow.importance == "Optional"

    def test_following_again_without_a_body_keeps_the_importance(
        self, user_client, db_session, plain_user, split_run
    ):
        _follow(user_client, split_run, importance="Essential")
        _follow(user_client, split_run)
        follow = _follow_row(db_session, plain_user.id, split_run)
        assert follow.importance == "Essential"

    def test_an_unknown_importance_is_refused(
        self, user_client, db_session, split_run
    ):
        response = _follow(user_client, split_run, importance="Crucial")
        assert response.status_code == 400
        assert db_session.query(models.OrderFollow).count() == 0

    def test_the_importance_decides_up_next(self, user_client, split_run):
        # Every step is Normal or Optional: an Optional follow starts at step
        # 1, a Recommended one has nothing to be next.
        _follow(user_client, split_run, importance="Optional")
        assert _follows(user_client)[0]["up_next"]["number"] == 1
        _follow(user_client, split_run, importance="Recommended")
        assert _follows(user_client)[0]["up_next"] is None

    def test_another_users_follow_keeps_its_importance(
        self, user_client, client, db_session, plain_user, split_run
    ):
        # The other account may follow and set ITS rung; it reaches only its
        # own row. The mirror: the member's own call above did change theirs.
        _follow(user_client, split_run, importance="Essential")
        make_viewer(db_session, client, "other_rung", default_user_permissions())
        assert _follow(client, split_run, importance="Optional").status_code == 200

        assert _follow_row(db_session, plain_user.id, split_run).importance == (
            "Essential"
        )

    def test_the_importance_column_defaults_to_normal_in_the_database(
        self, db_session, plain_user, split_run, sample_franchise
    ):
        db_session.execute(
            text(
                "INSERT INTO order_follow (system_id, user_id, list_id, franchise_id)"
                " VALUES (:id, :user, :list, :franchise)"
            ),
            {
                "id": uuid.uuid4(),
                "user": plain_user.id,
                "list": split_run.system_id,
                "franchise": sample_franchise.system_id,
            },
        )
        assert _follow_row(db_session, plain_user.id, split_run).importance == "Normal"


class TestSkips:
    def test_a_skipped_step_is_never_next(self, user_client, ladder):
        _follow(user_client, ladder.list)
        response = user_client.put(_skip_url(ladder.list, ladder.items["H"].system_id))
        assert response.status_code == 200, response.text
        assert response.json()["skipped"] == [str(ladder.items["H"].system_id)]

        # H skipped: I is the next Normal step, and the lookahead is unchanged.
        assert _names(_on(user_client, ladder.entries["F"])) == ("I", ["J", "L"])
        occurrence = _on(user_client, ladder.entries["H"])
        assert occurrence["step"]["skipped"] is True

    def test_skipping_is_idempotent(self, user_client, db_session, ladder):
        _follow(user_client, ladder.list)
        url = _skip_url(ladder.list, ladder.items["H"].system_id)
        user_client.put(url)
        assert user_client.put(url).status_code == 200
        assert db_session.query(models.OrderFollowSkip).count() == 1

    def test_unskipping_restores_the_step(self, user_client, db_session, ladder):
        _follow(user_client, ladder.list)
        url = _skip_url(ladder.list, ladder.items["H"].system_id)
        user_client.put(url)
        response = user_client.delete(url)
        assert response.status_code == 200
        assert response.json()["skipped"] == []
        assert _names(_on(user_client, ladder.entries["F"])) == ("H", ["J", "L"])
        # And again: clearing what is not skipped changes nothing.
        assert user_client.delete(url).status_code == 200

    def test_a_skip_on_a_step_of_another_order_is_404(
        self, user_client, ladder, second_order
    ):
        _follow(user_client, ladder.list)
        (foreign,) = second_order.items
        response = user_client.put(_skip_url(ladder.list, foreign.system_id))
        assert response.status_code == 404

    def test_skipping_in_an_order_not_followed_is_404(self, user_client, ladder):
        response = user_client.put(
            _skip_url(ladder.list, ladder.items["H"].system_id)
        )
        assert response.status_code == 404

    def test_unfollowing_drops_the_skips(self, user_client, db_session, ladder):
        _follow(user_client, ladder.list)
        user_client.put(_skip_url(ladder.list, ladder.items["H"].system_id))
        user_client.delete(f"/api/order/lists/{ladder.list.system_id}/follow")
        assert db_session.query(models.OrderFollowSkip).count() == 0

        _follow(user_client, ladder.list)
        assert _names(_on(user_client, ladder.entries["F"]))[0] == "H"

    def test_following_another_order_of_the_group_drops_the_skips(
        self, user_client, db_session, ladder, second_order
    ):
        _follow(user_client, ladder.list)
        user_client.put(_skip_url(ladder.list, ladder.items["H"].system_id))
        _follow(user_client, second_order)
        db_session.expire_all()
        assert db_session.query(models.OrderFollowSkip).count() == 0

    def test_deleting_the_step_deletes_its_skip(
        self, user_client, db_session, ladder
    ):
        _follow(user_client, ladder.list)
        user_client.put(_skip_url(ladder.list, ladder.items["H"].system_id))
        db_session.execute(
            text("DELETE FROM order_item WHERE system_id = :id"),
            {"id": ladder.items["H"].system_id},
        )
        assert db_session.query(models.OrderFollowSkip).count() == 0

    def test_a_built_in_orders_step_is_skipped_by_its_entry(
        self, user_client, db_session, sample_franchise, anime_a, movie_b
    ):
        built_in = _list(
            db_session,
            sample_franchise,
            "Release Order",
            list_type="Release",
            auto_source="release",
        )
        _follow(user_client, built_in)
        first = _follows(user_client)[0]["up_next"]
        response = user_client.put(_skip_url(built_in, first["step_id"]))
        assert response.status_code == 200, response.text

        (skip,) = db_session.query(models.OrderFollowSkip).all()
        assert (skip.item_id, str(skip.media_id)) == (None, first["step_id"])
        (row,) = _follows(user_client)
        assert row["up_next"]["step_id"] != first["step_id"]

    def test_the_database_refuses_a_skip_naming_no_step(
        self, user_client, db_session, plain_user, ladder
    ):
        _follow(user_client, ladder.list)
        follow = _follow_row(db_session, plain_user.id, ladder.list)
        db_session.add(models.OrderFollowSkip(follow_id=follow.system_id))
        with pytest.raises(IntegrityError):
            db_session.flush()
        db_session.rollback()


class TestSkipPermission:
    """
    A skip is the follower's own. Every refusal below has something to refuse:
    the order exists, the member follows it, and the step is one of its steps
    - so what decides is who is asking. The mirror case, the member skipping
    the same step, answers 200 and writes the row.
    """

    @pytest.fixture
    def followed(self, user_client, ladder):
        assert _follow(user_client, ladder.list).status_code == 200
        return ladder

    def test_the_follower_may_skip(self, user_client, db_session, followed):
        url = _skip_url(followed.list, followed.items["H"].system_id)
        assert user_client.put(url).status_code == 200
        assert db_session.query(models.OrderFollowSkip).count() == 1

    def test_a_guest_is_refused(self, user_client, client, db_session, followed):
        url = _skip_url(followed.list, followed.items["H"].system_id)
        client.cookies.clear()
        assert client.put(url).status_code == 401
        assert client.delete(url).status_code == 401
        assert db_session.query(models.OrderFollowSkip).count() == 0

    def test_another_user_cannot_skip_on_the_members_follow(
        self, user_client, client, db_session, plain_user, followed
    ):
        make_viewer(db_session, client, "other_skipper", default_user_permissions())
        url = _skip_url(followed.list, followed.items["H"].system_id)
        # They do not follow the order: nothing of theirs to write to, and the
        # member's follow is not theirs.
        assert client.put(url).status_code == 404
        assert db_session.query(models.OrderFollowSkip).count() == 0

    def test_another_users_skip_lands_on_their_own_follow(
        self, user_client, client, db_session, plain_user, followed
    ):
        make_viewer(db_session, client, "other_follower2", default_user_permissions())
        _follow(client, followed.list)
        url = _skip_url(followed.list, followed.items["H"].system_id)
        assert client.put(url).status_code == 200

        mine = _follow_row(db_session, plain_user.id, followed.list)
        assert mine.skips == []
        assert _names(_on(user_client, followed.entries["F"]))[0] == "H"

    def test_another_user_cannot_unskip_the_members_skip(
        self, user_client, client, db_session, followed
    ):
        url = _skip_url(followed.list, followed.items["H"].system_id)
        user_client.put(url)
        make_viewer(db_session, client, "other_unskipper", default_user_permissions())
        assert client.delete(url).status_code == 404
        assert db_session.query(models.OrderFollowSkip).count() == 1

    def test_an_admin_account_is_refused(self, admin_client, db_session, followed):
        url = _skip_url(followed.list, followed.items["H"].system_id)
        assert admin_client.put(url).status_code == 401
        assert db_session.query(models.OrderFollowSkip).count() == 0


# ---------------------------------------------------------------------------
# Google Sheets
# ---------------------------------------------------------------------------


class TestSheets:
    """Follows travel like Plan Next: by username, after the lists they cite."""

    def test_the_tab_carries_a_username_not_a_user_id(self):
        from app.services.pipelines.tabs import TAB_BY_NAME

        tab = TAB_BY_NAME["Order Follow"]
        assert "user_id" in tab.drop_columns
        assert [name for name, _fn in tab.extra_columns] == ["username"]

    def test_the_tab_restores_after_lists_and_users(self):
        from app.services.pipelines.tabs import TAB_NAMES

        at = TAB_NAMES.index
        assert at("Users") < at("Order Follow")
        assert at("Order List") < at("Order Follow")
        assert at("Franchise") < at("Order Follow")

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
            pull, "get_all_raw_rows", lambda tab: {"Order Follow": [headers, row]}[tab]
        )

        result = pull.execute_pull_specific(
            db_session, "Order Follow", log_action=False
        )

        assert result["status"] == "success", result
        (follow,) = db_session.query(models.OrderFollow).all()
        assert follow.user_id == plain_user.id
        assert follow.list_id == split_run.system_id

    def _pull_follow(self, db_session, monkeypatch, headers, row):
        from app.services.pipelines import pull

        monkeypatch.setattr(
            pull, "get_all_raw_rows", lambda tab: {"Order Follow": [headers, row]}[tab]
        )
        return pull.execute_pull_specific(db_session, "Order Follow", log_action=False)

    def test_the_importance_travels(
        self, db_session, monkeypatch, plain_user, split_run, sample_franchise
    ):
        headers = ["system_id", "list_id", "franchise_id", "importance", "username"]
        row = [
            str(uuid.uuid4()), str(split_run.system_id),
            str(sample_franchise.system_id), "Recommended", plain_user.username,
        ]
        result = self._pull_follow(db_session, monkeypatch, headers, row)
        assert result["status"] == "success", result
        (follow,) = db_session.query(models.OrderFollow).all()
        assert follow.importance == "Recommended"

    def test_a_sheet_without_the_column_restores_a_normal_follow(
        self, db_session, monkeypatch, plain_user, split_run, sample_franchise
    ):
        headers = ["system_id", "list_id", "franchise_id", "username"]
        row = [
            str(uuid.uuid4()), str(split_run.system_id),
            str(sample_franchise.system_id), plain_user.username,
        ]
        result = self._pull_follow(db_session, monkeypatch, headers, row)
        assert result["status"] == "success", result
        (follow,) = db_session.query(models.OrderFollow).all()
        assert follow.importance == "Normal"

    def test_a_sheet_without_the_column_keeps_an_existing_importance(
        self, user_client, db_session, monkeypatch, plain_user, split_run,
        sample_franchise,
    ):
        _follow(user_client, split_run, importance="Essential")
        existing = _follow_row(db_session, plain_user.id, split_run)
        headers = ["system_id", "list_id", "franchise_id", "username"]
        row = [
            str(existing.system_id), str(split_run.system_id),
            str(sample_franchise.system_id), plain_user.username,
        ]
        result = self._pull_follow(db_session, monkeypatch, headers, row)
        assert result["status"] == "success", result
        assert _follow_row(db_session, plain_user.id, split_run).importance == (
            "Essential"
        )


class TestSkipSheets:
    """Skips travel on their own tab, naming the follow by (username, list_id)."""

    def test_the_tab_names_the_follow_not_its_uuid(self):
        from app.services.pipelines.tabs import TAB_BY_NAME, TAB_NAMES

        tab = TAB_BY_NAME["Order Follow Skip"]
        assert "follow_id" in tab.drop_columns
        assert [name for name, _fn in tab.extra_columns] == ["username", "list_id"]
        assert TAB_NAMES.index("Order Follow") < TAB_NAMES.index("Order Follow Skip")
        assert TAB_NAMES.index("Order Item") < TAB_NAMES.index("Order Follow Skip")

    def test_backup_writes_the_followers_name_and_the_order(
        self, user_client, db_session, plain_user, ladder
    ):
        from app.services.pipelines.tabs import TAB_BY_NAME

        _follow(user_client, ladder.list)
        user_client.put(_skip_url(ladder.list, ladder.items["H"].system_id))
        (skip,) = db_session.query(models.OrderFollowSkip).all()
        values = {
            name: fn(skip, db_session)
            for name, fn in TAB_BY_NAME["Order Follow Skip"].extra_columns
        }
        assert values == {
            "username": plain_user.username,
            "list_id": str(ladder.list.system_id),
        }

    def _pull(self, db_session, monkeypatch, headers, row):
        from app.services.pipelines import pull

        monkeypatch.setattr(
            pull,
            "get_all_raw_rows",
            lambda tab: {"Order Follow Skip": [headers, row]}[tab],
        )
        return pull.execute_pull_specific(
            db_session, "Order Follow Skip", log_action=False
        )

    HEADERS = ["system_id", "item_id", "media_id", "username", "list_id"]

    def test_a_row_is_restored_onto_the_local_follow(
        self, user_client, db_session, monkeypatch, plain_user, ladder
    ):
        _follow(user_client, ladder.list)
        row = [
            str(uuid.uuid4()), str(ladder.items["H"].system_id), "",
            plain_user.username, str(ladder.list.system_id),
        ]
        result = self._pull(db_session, monkeypatch, self.HEADERS, row)
        assert result["status"] == "success", result

        follow = _follow_row(db_session, plain_user.id, ladder.list)
        assert [s.item_id for s in follow.skips] == [ladder.items["H"].system_id]
        assert _names(_on(user_client, ladder.entries["F"]))[0] == "I"

    def test_a_row_whose_follow_is_not_here_is_skipped(
        self, db_session, monkeypatch, plain_user, ladder
    ):
        # The order and the user exist; only the follow does not.
        row = [
            str(uuid.uuid4()), str(ladder.items["H"].system_id), "",
            plain_user.username, str(ladder.list.system_id),
        ]
        result = self._pull(db_session, monkeypatch, self.HEADERS, row)
        assert db_session.query(models.OrderFollowSkip).count() == 0
        assert result["status"] == "success", result
