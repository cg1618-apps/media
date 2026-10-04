"""
Tests for seed_sequel_relations: the one-time seed of anime sequel chains in
ACG franchises that have no relations yet, run by Calculate All.

Every refusal test here builds a franchise that WOULD be seeded beside the one
that is refused, and asserts both. A seed that writes nothing at all would
otherwise pass every "gets nothing" test vacuously.
"""

import uuid

from app import models
from app.services import calculation
from app.services.domain.derivation import season_part_sort_key
from app.services.domain.media_relation import seed_sequel_relations

# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def _franchise(db, franchise_type="ACG"):
    f = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_type=franchise_type,
        franchise_name_en=f"Franchise {uuid.uuid4().hex[:6]}",
    )
    db.add(f)
    db.flush()
    return f


def _series(db, franchise):
    s = models.Series(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        series_name_en=f"Series {uuid.uuid4().hex[:6]}",
    )
    db.add(s)
    db.flush()
    return s


def _anime(db, franchise, season_part, series=None, airing_type="TV", **extra):
    a = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        series_id=series.system_id if series else None,
        anime_name_en=f"Anime {season_part} {uuid.uuid4().hex[:6]}",
        airing_type=airing_type,
        airing_status="Finished Airing",
        season_part=season_part,
        **extra,
    )
    db.add(a)
    db.flush()
    return a


def _manga(db, franchise):
    m = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        manga_name_en=f"Manga {uuid.uuid4().hex[:6]}",
    )
    db.add(m)
    db.flush()
    return m


def _sequel_pairs(db, entries):
    """Every stored (from, to) pair among these entries, as sets of ids."""
    ids = {e.system_id for e in entries}
    rows = (
        db.query(models.MediaRelation)
        .filter(
            models.MediaRelation.from_id.in_(ids)
            | models.MediaRelation.to_id.in_(ids)
        )
        .all()
    )
    return rows


def _chain(db, entries):
    """The stored rows as (from, to) id pairs, after asserting their shape."""
    pairs = set()
    for row in _sequel_pairs(db, entries):
        assert row.relation_type == "sequel"
        assert row.from_type == "anime" and row.to_type == "anime"
        assert row.remark is None
        pairs.add((row.from_id, row.to_id))
    return pairs


# ---------------------------------------------------------------------------
# The shared sort key
# ---------------------------------------------------------------------------


def test_season_part_sort_key_reads_season_then_part():
    assert season_part_sort_key("Season 2 Part 2") == (2, 2)
    assert season_part_sort_key("Season 3") == (3, 1)
    assert season_part_sort_key("Part 2") == (1, 2)
    assert season_part_sort_key(None) == (1, 1)


# ---------------------------------------------------------------------------
# Chaining
# ---------------------------------------------------------------------------


def test_chains_one_series_in_season_part_order_later_to_earlier(db_session):
    f = _franchise(db_session)
    s = _series(db_session, f)
    # Created out of order, TV and ONA mixed, so neither insertion order nor
    # airing type can be what produced the chain.
    s3 = _anime(db_session, f, "Season 3", s, airing_type="ONA")
    s1 = _anime(db_session, f, "Season 1", s)
    s2p2 = _anime(db_session, f, "Season 2 Part 2", s, airing_type="ONA")
    s2 = _anime(db_session, f, "Season 2", s)

    counts = seed_sequel_relations(db_session)

    assert _chain(db_session, [s1, s2, s2p2, s3]) == {
        (s2.system_id, s1.system_id),
        (s2p2.system_id, s2.system_id),
        (s3.system_id, s2p2.system_id),
    }
    assert counts["relations_created"] == 3
    assert counts["franchises_seeded"] == 1
    assert counts["groups_skipped_tied"] == 0


def test_movie_ova_special_and_blank_season_part_are_left_out(db_session):
    f = _franchise(db_session)
    s = _series(db_session, f)
    s1 = _anime(db_session, f, "Season 1", s)
    s2 = _anime(db_session, f, "Season 2", s)
    movie = _anime(db_session, f, "Season 1", s, airing_type="Movie")
    ova = _anime(db_session, f, "Season 1", s, airing_type="OVA")
    special = _anime(db_session, f, "Season 1", s, ep_special=1)
    blank = _anime(db_session, f, "   ", s)
    unset = _anime(db_session, f, None, s)

    seed_sequel_relations(db_session)

    # Every excluded entry carries a season_part that would tie with or sort
    # before Season 1 - had any been eligible, the group would have tied and
    # written nothing, or gained a link.
    assert _chain(db_session, [s1, s2, movie, ova, special, blank, unset]) == {
        (s2.system_id, s1.system_id),
    }


def test_series_chain_separately_and_no_series_entries_chain_among_themselves(
    db_session,
):
    f = _franchise(db_session)
    a = _series(db_session, f)
    b = _series(db_session, f)
    a1 = _anime(db_session, f, "Season 1", a)
    a2 = _anime(db_session, f, "Season 2", a)
    b1 = _anime(db_session, f, "Season 1", b)
    b2 = _anime(db_session, f, "Season 2", b)
    loose1 = _anime(db_session, f, "Season 1")
    loose2 = _anime(db_session, f, "Season 2")

    counts = seed_sequel_relations(db_session)

    assert _chain(db_session, [a1, a2, b1, b2, loose1, loose2]) == {
        (a2.system_id, a1.system_id),
        (b2.system_id, b1.system_id),
        (loose2.system_id, loose1.system_id),
    }
    assert counts["relations_created"] == 3
    assert counts["franchises_seeded"] == 1


def test_a_group_of_one_writes_nothing(db_session):
    f = _franchise(db_session)
    s = _series(db_session, f)
    only = _anime(db_session, f, "Season 1", s)

    counts = seed_sequel_relations(db_session)

    assert _chain(db_session, [only]) == set()
    assert counts["franchises_seeded"] == 0


# ---------------------------------------------------------------------------
# Refusals - each paired with an otherwise identical franchise that is seeded
# ---------------------------------------------------------------------------


def test_any_relation_touching_the_franchise_refuses_the_whole_seed(db_session):
    curated = _franchise(db_session)
    cs = _series(db_session, curated)
    c1 = _anime(db_session, curated, "Season 1", cs)
    c2 = _anime(db_session, curated, "Season 2", cs)
    manga = _manga(db_session, curated)
    # The relation touches neither anime - only a manga in the franchise, at
    # the `to` end - and still has to stop the seed.
    other = _manga(db_session, _franchise(db_session, "Comic"))
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="manga", from_id=other.system_id,
            relation_type="adaptation",
            to_type="manga", to_id=manga.system_id,
        )
    )

    fresh = _franchise(db_session)
    fs = _series(db_session, fresh)
    f1 = _anime(db_session, fresh, "Season 1", fs)
    f2 = _anime(db_session, fresh, "Season 2", fs)
    db_session.flush()

    counts = seed_sequel_relations(db_session)

    assert _chain(db_session, [c1, c2]) == set()
    assert _chain(db_session, [f1, f2]) == {(f2.system_id, f1.system_id)}
    assert counts["franchises_seeded"] == 1


def test_a_relation_at_the_from_end_refuses_too(db_session):
    curated = _franchise(db_session)
    cs = _series(db_session, curated)
    c1 = _anime(db_session, curated, "Season 1", cs)
    c2 = _anime(db_session, curated, "Season 2", cs)
    manga = _manga(db_session, curated)
    elsewhere = _manga(db_session, _franchise(db_session, "Comic"))
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="manga", from_id=manga.system_id,
            relation_type="related",
            to_type="manga", to_id=elsewhere.system_id,
        )
    )

    fresh = _franchise(db_session)
    fs = _series(db_session, fresh)
    f1 = _anime(db_session, fresh, "Season 1", fs)
    f2 = _anime(db_session, fresh, "Season 2", fs)
    db_session.flush()

    seed_sequel_relations(db_session)

    assert _chain(db_session, [c1, c2]) == set()
    assert _chain(db_session, [f1, f2]) == {(f2.system_id, f1.system_id)}


def test_a_franchise_that_is_not_acg_gets_nothing(db_session):
    tv = _franchise(db_session, "TV")
    ts = _series(db_session, tv)
    t1 = _anime(db_session, tv, "Season 1", ts)
    t2 = _anime(db_session, tv, "Season 2", ts)

    # ACG as one token of several still counts.
    acg = _franchise(db_session, "Game, ACG")
    a_s = _series(db_session, acg)
    a1 = _anime(db_session, acg, "Season 1", a_s)
    a2 = _anime(db_session, acg, "Season 2", a_s)

    seed_sequel_relations(db_session)

    assert _chain(db_session, [t1, t2]) == set()
    assert _chain(db_session, [a1, a2]) == {(a2.system_id, a1.system_id)}


def test_a_tied_group_is_skipped_and_counted_while_its_neighbour_is_chained(
    db_session,
):
    f = _franchise(db_session)
    tied = _series(db_session, f)
    clean = _series(db_session, f)
    t1 = _anime(db_session, f, "Season 1", tied)
    t2a = _anime(db_session, f, "Season 2", tied)
    # "Season 2 Part 1" parses to the same (2, 1) as "Season 2".
    t2b = _anime(db_session, f, "Season 2 Part 1", tied)
    c1 = _anime(db_session, f, "Season 1", clean)
    c2 = _anime(db_session, f, "Season 2", clean)

    counts = seed_sequel_relations(db_session)

    assert _chain(db_session, [t1, t2a, t2b]) == set()
    assert _chain(db_session, [c1, c2]) == {(c2.system_id, c1.system_id)}
    assert counts["groups_skipped_tied"] == 1
    assert counts["relations_created"] == 1
    assert counts["franchises_seeded"] == 1


def test_a_second_run_creates_nothing(db_session):
    f = _franchise(db_session)
    s = _series(db_session, f)
    s1 = _anime(db_session, f, "Season 1", s)
    s2 = _anime(db_session, f, "Season 2", s)

    first = seed_sequel_relations(db_session)
    # A season added after the seed is linked by hand, not by a re-seed.
    s3 = _anime(db_session, f, "Season 3", s)
    second = seed_sequel_relations(db_session)

    assert first["relations_created"] == 1
    assert second == {
        "relations_created": 0,
        "franchises_seeded": 0,
        "groups_skipped_tied": 0,
    }
    assert _chain(db_session, [s1, s2, s3]) == {(s2.system_id, s1.system_id)}


# ---------------------------------------------------------------------------
# Calculate All
# ---------------------------------------------------------------------------


def test_calculate_all_runs_the_seed_and_reports_its_counts(
    db_session, monkeypatch
):
    # The other steps walk every table and the cover store; they are not what
    # this test is about.
    monkeypatch.setattr(calculation, "run_post_processing", lambda db: None)
    monkeypatch.setattr(calculation, "run_sync", lambda db: None)
    monkeypatch.setattr(calculation, "bulk_check_cover_image", lambda db: None)

    f = _franchise(db_session)
    s = _series(db_session, f)
    s1 = _anime(db_session, f, "Season 1", s)
    s2 = _anime(db_session, f, "Season 2", s)

    result = calculation.run_calculate_all(db_session)

    assert result["status"] == "success"
    assert result["message"].startswith("Full calculation complete.")
    assert "Created 1 sequel relation(s) in 1 franchise(s)" in result["message"]
    assert "0 group(s) skipped (tied season/part)" in result["message"]
    assert _chain(db_session, [s1, s2]) == {(s2.system_id, s1.system_id)}
