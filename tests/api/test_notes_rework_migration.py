"""
API integration tests for revision n1o2tesrwk3: the notes rework's catalogue
half - the game note suggestion categories seeded, the gated types'
`reviews_and_comments` rows moved into `public_reviews`, and `ng_reset`
backfilled on the three 物品 sections.

Runs the shipped revision's own data steps against the test session - the
suite has no Alembic harness. The from-zero proof is
test_migrations_build_the_schema.py.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "n1o2tesrwk3_notes_rework_catalogue.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_notes_rework", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _add(db, row):
    db.add(row)
    db.flush()
    return row


def _note(db, owner, author_id, section, **columns):
    return _add(
        db,
        models.Note(
            system_id=uuid.uuid4(),
            media_id=owner.system_id,
            author_id=author_id,
            section=section,
            **columns,
        ),
    )


def _reload(db, row):
    db.expire_all()
    return db.get(models.Note, row.system_id)


# --- seeds ------------------------------------------------------------------


def test_the_suggestions_are_seeded_once_with_no_scope(db_session, revision):
    existing = _add(
        db_session,
        models.SystemOption(category="Item Type", value="任務道具", sort_order=9),
    )

    conn = db_session.connection()
    revision.seed_note_suggestions(conn)
    revision.seed_note_suggestions(conn)
    db_session.expire_all()

    def values(category):
        return [
            o.value
            for o in db_session.query(models.SystemOption)
            .filter(models.SystemOption.category == category)
            .order_by(models.SystemOption.sort_order, models.SystemOption.value)
        ]

    assert values("Character Group") == ["商人", "重要NPC", "主角", "同伴", "可攻略", "反派"]
    assert values("Collectible Type") == ["重要物品"]
    assert sorted(values("Item Type")) == sorted(["重要道具", "任務道具"])
    # Geography Group exists as a category with no value yet.
    assert values("Geography Group") == []
    seeded = (
        db_session.query(models.SystemOption)
        .filter(
            models.SystemOption.category.in_(
                ["Character Group", "Collectible Type", "Item Type"]
            )
        )
        .all()
    )
    # No scope rows: `?scope=` reads none as everywhere, so game and h-game
    # both get them.
    assert seeded and all(o.scopes == [] for o in seeded)
    # A value that already existed keeps what it had.
    assert db_session.get(models.SystemOption, existing.system_id).sort_order == 9


# --- reviews ----------------------------------------------------------------


@pytest.fixture
def gated(db_session):
    return {
        "h-comic": _add(db_session, models.HComic(h_comic_name_cn="Zvornik Comic")),
        "hentai": _add(db_session, models.Hentai(hentai_name_cn="Zvornik Hentai")),
        "h-game": _add(db_session, models.HGame(h_game_name_cn="Zvornik Game")),
    }


def test_reviews_and_comments_become_public_reviews_and_go_back(
    db_session, gated, admin_user, super_user, revision
):
    rows = {
        media_type: _note(
            db_session,
            owner,
            super_user.id,
            "reviews_and_comments",
            content=f"{media_type} review",
            links=["https://example.com/r"],
            sort_index=3.0,
        )
        for media_type, owner in gated.items()
    }
    # A game's public review is not a gated type's, so downgrade leaves it.
    game = _add(db_session, models.Game(game_name_en="Zvornik Ring"))
    game_review = _note(
        db_session, game, admin_user.id, "public_reviews", content="liked"
    )

    conn = db_session.connection()
    revision.move_reviews(conn)
    for media_type, row in rows.items():
        moved = _reload(db_session, row)
        assert moved.section == "public_reviews", media_type
        # Kept as provenance: the row is everyone's now, its author recorded.
        assert moved.author_id == super_user.id
        assert moved.content == f"{media_type} review"
        assert moved.links == ["https://example.com/r"]
        assert moved.sort_index == 3.0
    assert (
        db_session.query(models.Note)
        .filter(models.Note.section == "reviews_and_comments")
        .count()
        == 0
    )

    # A personal review written on a gated type after the upgrade has nowhere
    # else to go in the old registry, which had no personal_reviews there.
    personal = _note(
        db_session, gated["hentai"], super_user.id, "personal_reviews", content="mine"
    )
    revision.restore_reviews(conn)
    for media_type, row in rows.items():
        assert _reload(db_session, row).section == "reviews_and_comments", media_type
    assert _reload(db_session, personal).section == "reviews_and_comments"
    assert _reload(db_session, game_review).section == "public_reviews"


# --- 物品: ng_reset, amount_total, collected ----------------------------------


def test_ng_reset_is_backfilled_on_the_three_gear_sections(
    db_session, admin_user, revision
):
    game = _add(db_session, models.Game(game_name_en="Zvornik Ring"))
    with_fields = _note(
        db_session, game, admin_user.id, "items", title="Flask",
        fields={"variant": "+3"},
    )
    # links=None on a JSONB column stores JSON null, not SQL NULL; fields
    # the same - the shape most rows carry, and one `||` would turn into an
    # array.
    json_null = _note(db_session, game, admin_user.id, "collectibles", title="Seed")
    already = _note(
        db_session, game, admin_user.id, "weapons_and_gear", title="Sword",
        fields={"ng_reset": "no"},
    )
    # Not a gear section: left alone, so the backfill is section-bound.
    other = _note(
        db_session, game, admin_user.id, "skills", title="Parry",
        fields={"variant": "x"},
    )

    conn = db_session.connection()
    revision.backfill_ng_reset(conn)
    revision.backfill_ng_reset(conn)

    assert _reload(db_session, with_fields).fields == {"variant": "+3", "ng_reset": "yes"}
    assert _reload(db_session, json_null).fields == {"ng_reset": "yes"}
    assert _reload(db_session, already).fields == {"ng_reset": "no"}
    assert _reload(db_session, other).fields == {"variant": "x"}

    # Downgrade: the keys the old registry does not know go, the rest stays.
    _reload(db_session, with_fields).fields = {
        "variant": "+3",
        "ng_reset": "yes",
        "amount_total": "12",
    }
    db_session.flush()
    revision.drop_gear_fields(conn)
    assert _reload(db_session, with_fields).fields == {"variant": "+3"}
    assert _reload(db_session, already).fields == {}
    assert _reload(db_session, other).fields == {"variant": "x"}


def test_collected_falls_back_to_fully_collected_on_downgrade(
    db_session, admin_user, revision
):
    game = _add(db_session, models.Game(game_name_en="Zvornik Ring"))
    collected = _note(
        db_session, game, admin_user.id, "items", title="Flask", status="collected"
    )
    enough = _note(
        db_session, game, admin_user.id, "items", title="Seed",
        status="enough collected",
    )
    # A status of the same spelling on another section is not this vocabulary.
    elsewhere = _note(
        db_session, game, admin_user.id, "mods_and_tools", title="Mod",
        status="collected",
    )

    revision.collected_to_fully_collected(db_session.connection())

    assert _reload(db_session, collected).status == "fully collected"
    assert _reload(db_session, enough).status == "enough collected"
    assert _reload(db_session, elsewhere).status == "collected"


def test_guide_resource_groups_are_cleared_on_downgrade(
    db_session, admin_user, revision
):
    game = _add(db_session, models.Game(game_name_en="Zvornik Ring"))
    grouped = _note(
        db_session, game, admin_user.id, "guide_resources", title="Wiki", kind="Wikis"
    )
    # `kind` on another section is that section's own column.
    controls = _note(
        db_session, game, admin_user.id, "controls", title="L2", kind="Combat"
    )

    revision.clear_guide_resource_groups(db_session.connection())

    assert _reload(db_session, grouped).kind is None
    assert _reload(db_session, controls).kind == "Combat"
