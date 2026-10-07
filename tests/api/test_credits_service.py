"""Name <-> entity resolution and link replacement."""

import pytest

from app import models
from app.services.domain import credits as svc


def test_resolve_person_creates_once_and_reuses(db_session):
    a = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    b = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    assert a.system_id == b.system_id
    assert db_session.query(models.Person).count() == 1


def test_resolve_person_matches_across_spelling_variants(db_session):
    a = svc.resolve_person(db_session, "新海 誠", role="director", scope="anime")
    b = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    assert a.system_id == b.system_id


def test_resolve_person_keeps_the_first_spelling(db_session):
    svc.resolve_person(db_session, "新海 誠", role="director", scope="anime")
    p = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    # An anime director's CJK name is recorded in the cn slot; see name_slot_for.
    assert p.name_cn == "新海 誠"


def test_resolve_person_records_the_role(db_session):
    p = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    assert [(r.role, r.scope) for r in p.roles] == [("director", "anime")]


def test_resolve_person_adds_a_second_scope_without_duplicating_the_person(
    db_session,
):
    svc.resolve_person(db_session, "宮崎駿", role="director", scope="anime")
    p = svc.resolve_person(db_session, "宮崎駿", role="director", scope="movie")
    assert db_session.query(models.Person).count() == 1
    assert {r.scope for r in p.roles} == {"anime", "movie"}


def test_resolve_studio_creates_once(db_session):
    a = svc.resolve_studio(db_session, "MAPPA")
    b = svc.resolve_studio(db_session, "ＭＡＰＰＡ")
    assert a.system_id == b.system_id


def test_resolve_option_creates_within_a_category(db_session):
    a = svc.resolve_option(db_session, "Genre Main", "Action")
    b = svc.resolve_option(db_session, "Genre Sub", "Action")
    assert a.system_id != b.system_id


def test_resolve_option_records_a_scope(db_session):
    o = svc.resolve_option(
        db_session, "Official Source", "Netflix", scope="tv-show"
    )
    assert [s.scope for s in o.scopes] == ["tv-show"]


def _anime_id(db_session, name="測試"):
    """A real anime entry: media_credit.media_id is a FK to media.system_id."""
    a = models.Anime(anime_name_cn=name)
    db_session.add(a)
    db_session.flush()
    return a.system_id


def test_replace_credits_writes_rows_in_order(db_session):
    entry_id = _anime_id(db_session)
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    assert svc.credit_names(db_session, entry_id, "studio") == ["A", "B"]


def test_replace_credits_is_idempotent(db_session):
    entry_id = _anime_id(db_session)
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    assert db_session.query(models.MediaCredit).count() == 2


def test_replace_credits_removes_names_no_longer_listed(db_session):
    entry_id = _anime_id(db_session)
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["B"])
    assert svc.credit_names(db_session, entry_id, "studio") == ["B"]


def test_replace_credits_leaves_other_roles_alone(db_session):
    entry_id = _anime_id(db_session)
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A"])
    svc.replace_credits(db_session, "anime", entry_id, "director", ["D"])
    assert svc.credit_names(db_session, entry_id, "studio") == ["A"]


def test_replace_credits_with_an_empty_list_clears_the_role(db_session):
    entry_id = _anime_id(db_session)
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A"])
    svc.replace_credits(db_session, "anime", entry_id, "studio", [])
    assert svc.credit_names(db_session, entry_id, "studio") == []


def test_replace_credits_does_not_delete_the_person_itself(db_session):
    entry_id = _anime_id(db_session)
    svc.replace_credits(db_session, "anime", entry_id, "director", ["D"])
    svc.replace_credits(db_session, "anime", entry_id, "director", [])
    assert db_session.query(models.Person).count() == 1


def test_replace_tags_round_trips(db_session):
    entry_id = _anime_id(db_session)
    svc.replace_tags(db_session, entry_id, "genre_main", ["Action", "SF"])
    assert svc.tag_values(db_session, entry_id, "genre_main") == [
        "Action",
        "SF",
    ]


def test_director_scope_follows_the_media_type(db_session):
    movie = models.Movies(movie_name_en="Tenet")
    db_session.add(movie)
    db_session.flush()
    svc.replace_credits(db_session, "movie", movie.system_id, "director", ["Nolan"])
    p = db_session.query(models.Person).one()
    assert [r.scope for r in p.roles] == ["movie"]


def test_find_studio_matches_a_japanese_name(db_session):
    from app.services.domain.credits import find_studio

    db_session.add(models.Studio(name_en="Kyoto Animation", name_jp="京都アニメーション"))
    db_session.commit()
    assert find_studio(db_session, "京都アニメーション").name_en == "Kyoto Animation"


def test_find_studio_matches_an_alt_name(db_session):
    from app.services.domain.credits import find_studio

    db_session.add(models.Studio(name_en="Kyoto Animation", name_alt="KyoAni"))
    db_session.commit()
    assert find_studio(db_session, "kyoani").name_en == "Kyoto Animation"


def test_a_credited_display_name_resolves_back_to_the_same_row(db_session):
    """The Sheets round trip: backup writes display_name, restore resolves it."""
    from app.services.domain.credits import credit_names, resolve_studio

    studio = models.Studio(
        name_en="Kyoto Animation", name_alt="KyoAni", display_name_field="alt"
    )
    db_session.add(studio)
    db_session.flush()
    entry_id = _anime_id(db_session)
    db_session.add(
        models.MediaCredit(
            media_id=entry_id,
            role="studio",
            studio_id=studio.system_id,
        )
    )
    db_session.commit()

    written = credit_names(db_session, entry_id, "studio")
    assert written == ["KyoAni"]
    assert resolve_studio(db_session, written[0]).system_id == studio.system_id


def test_resolve_person_uses_the_shared_name_slot_rule(db_session):
    latin = svc.resolve_person(
        db_session, "Jon Favreau", role="director", scope="movie"
    )
    assert latin.name_en == "Jon Favreau" and latin.name_jp is None

    cjk_anime = svc.resolve_person(
        db_session, "渡部高志", role="director", scope="anime"
    )
    assert cjk_anime.name_cn == "渡部高志"

    cjk_manga = svc.resolve_person(db_session, "諫山創", role="author", scope="manga")
    assert cjk_manga.name_jp == "諫山創"

    # And never name_alt, whichever route created them.
    for p in (latin, cjk_anime, cjk_manga):
        assert p.name_alt is None


def test_a_person_name_round_trips_through_sheets(db_session, manga_entry):
    """
    credit_names feeds the Sheets backup column; the restore resolves that
    string back through _find_by_name. A display name must land on the same
    row it came from, whichever column holds it.
    """
    svc.replace_credits(
        db_session, "manga", manga_entry.system_id, "author", ["諫山創"]
    )
    db_session.flush()

    written = svc.credit_names(db_session, manga_entry.system_id, "author")
    assert written == ["諫山創"]

    same = svc.resolve_person(db_session, written[0], role="author", scope="manga")
    assert db_session.query(models.Person).count() == 1
    assert same.system_id is not None


# ---------------------------------------------------------------------------
# name_alt is a comma-separated list: each fragment is a name of its own
# ---------------------------------------------------------------------------


def _studio_one(db_session):
    studio = models.Studio(name_en="Studio 1", name_alt="S1, Studio One")
    db_session.add(studio)
    db_session.flush()
    return studio


def test_resolve_studio_matches_each_fragment_of_name_alt(db_session):
    studio = _studio_one(db_session)
    assert svc.resolve_studio(db_session, "Studio One").system_id == studio.system_id
    assert svc.resolve_studio(db_session, "S1").system_id == studio.system_id
    assert db_session.query(models.Studio).count() == 1


def test_resolve_studio_creates_a_name_no_fragment_holds(db_session):
    # The mirror, with Studio 1 present so a lookup that matched too much
    # would have something to wrongly return.
    studio = _studio_one(db_session)
    other = svc.resolve_studio(db_session, "Studio Two")
    assert other.system_id != studio.system_id
    assert db_session.query(models.Studio).count() == 2


def test_resolve_person_matches_each_fragment_of_name_alt(db_session):
    person = models.Person(name_en="Taro Tanaka", name_alt="Tanaka T., タナカ")
    db_session.add(person)
    db_session.flush()
    found = svc.resolve_person(db_session, "タナカ", role="director", scope="anime")
    assert found.system_id == person.system_id
    found = svc.resolve_person(db_session, "Tanaka T.", role="director", scope="anime")
    assert found.system_id == person.system_id
    assert db_session.query(models.Person).count() == 1


def test_resolve_person_creates_a_name_no_fragment_holds(db_session):
    person = models.Person(name_en="Taro Tanaka", name_alt="Tanaka T., タナカ")
    db_session.add(person)
    db_session.flush()
    other = svc.resolve_person(db_session, "Jiro Suzuki", role="director", scope="anime")
    assert other.system_id != person.system_id
    assert db_session.query(models.Person).count() == 2


def test_two_people_sharing_one_alt_fragment_are_ambiguous(db_session):
    db_session.add_all(
        [
            models.Person(name_en="Taro A", name_alt="Taro, T-chan"),
            models.Person(name_en="Taro B", name_alt="Big T, Taro"),
        ]
    )
    db_session.flush()
    with pytest.raises(svc.AmbiguousNameError):
        svc.find_person(db_session, "Taro")
    # The mirror: a fragment only one of them holds is not ambiguous.
    assert svc.find_person(db_session, "Big T").name_en == "Taro B"


def test_one_row_holding_a_name_in_two_fields_is_not_ambiguous(db_session):
    # De-dup by primary key: name_en and an alt fragment of the same row.
    studio = models.Studio(name_en="KyoAni", name_alt="Kyoto Animation, KyoAni")
    db_session.add(studio)
    db_session.flush()
    assert svc.find_studio(db_session, "kyoani").system_id == studio.system_id
