"""
MAL-aware studio and person matching (app/services/domain/credits.py).

A MAL studio or author is matched on its MAL id first, then by name the way
every other credit is (_find_by_name), and a person also on the western-order
form of MAL's "Family, Given". The find_* functions never write; the
resolve_* ones create what is missing, carrying the MAL id and link, and give
a name-matched row with no MAL id the one MAL names.
"""

import pytest

from app import models
from app.services.domain import credits as svc

MADHOUSE_URL = "https://myanimelist.net/anime/producer/11/Madhouse"
ODA_URL = "https://myanimelist.net/people/1881/Eiichiro_Oda"


def _studio(db, **names):
    row = models.Studio(**names)
    db.add(row)
    db.flush()
    return row


def _person(db, **names):
    row = models.Person(**names)
    db.add(row)
    db.flush()
    return row


class TestFindStudioForMal:
    def test_the_mal_id_beats_a_name_held_by_a_different_studio(self, db_session):
        # Both would match if the lookup went by name first: `impostor` holds
        # MAL's name exactly, `linked` holds a different one and the MAL id.
        impostor = _studio(db_session, name_en="Madhouse")
        linked = _studio(db_session, name_en="Madhouse Inc.", mal_id=11)

        found = svc.find_studio_for_mal(db_session, 11, "Madhouse")

        assert found.system_id == linked.system_id
        assert found.system_id != impostor.system_id

    def test_falls_back_to_a_name_in_an_alt_list(self, db_session):
        studio = _studio(db_session, name_jp="マッドハウス", name_alt="MAD, Madhouse")
        _studio(db_session, name_en="Bones", mal_id=4)

        assert svc.find_studio_for_mal(db_session, 11, "Madhouse").system_id == studio.system_id

    def test_none_when_nothing_matches(self, db_session):
        _studio(db_session, name_en="Bones", mal_id=4)
        assert svc.find_studio_for_mal(db_session, 11, "Madhouse") is None

    def test_an_ambiguous_name_raises(self, db_session):
        _studio(db_session, name_en="Madhouse")
        _studio(db_session, name_jp="Madhouse")
        with pytest.raises(svc.AmbiguousNameError):
            svc.find_studio_for_mal(db_session, 11, "Madhouse")

    def test_finding_writes_nothing(self, db_session):
        studio = _studio(db_session, name_en="Madhouse")
        svc.find_studio_for_mal(db_session, 11, "Madhouse")
        assert studio.mal_id is None
        assert studio.mal_link is None


class TestFindPersonForMal:
    def test_the_mal_id_beats_a_name_held_by_a_different_person(self, db_session):
        impostor = _person(db_session, name_en="Eiichiro Oda")
        linked = _person(db_session, name_jp="尾田栄一郎", mal_id=1881)

        found = svc.find_person_for_mal(db_session, 1881, "Oda, Eiichiro")

        assert found.system_id == linked.system_id != impostor.system_id

    def test_matches_the_western_order_form(self, db_session):
        oda = _person(db_session, name_en="Eiichiro Oda")
        assert svc.find_person_for_mal(db_session, 1881, "Oda, Eiichiro").system_id == oda.system_id

    def test_matches_the_name_as_mal_writes_it(self, db_session):
        # "Oda, Eiichiro" cannot sit in an alt list - the comma splits it - so
        # a row holding MAL's own order holds it in a single-name column.
        oda = _person(db_session, name_jp="Oda, Eiichiro")
        assert svc.find_person_for_mal(db_session, 1881, "Oda, Eiichiro").system_id == oda.system_id

    def test_none_when_nothing_matches(self, db_session):
        _person(db_session, name_en="Akira Toriyama", mal_id=2)
        assert svc.find_person_for_mal(db_session, 1881, "Oda, Eiichiro") is None


class TestResolveStudioForMal:
    def test_creates_a_studio_carrying_the_mal_id_and_link(self, db_session):
        studio = svc.resolve_studio_for_mal(db_session, 11, "Madhouse", MADHOUSE_URL)
        assert (studio.name_en, studio.mal_id, studio.mal_link) == ("Madhouse", 11, MADHOUSE_URL)

    def test_links_a_name_matched_studio_that_has_no_mal_id(self, db_session):
        existing = _studio(db_session, name_en="Madhouse")
        studio = svc.resolve_studio_for_mal(db_session, 11, "Madhouse", MADHOUSE_URL)
        assert studio.system_id == existing.system_id
        assert (studio.mal_id, studio.mal_link) == (11, MADHOUSE_URL)
        assert db_session.query(models.Studio).count() == 1

    def test_never_overwrites_a_different_mal_id(self, db_session):
        existing = _studio(db_session, name_en="Madhouse", mal_id=999, mal_link="https://keep")
        studio = svc.resolve_studio_for_mal(db_session, 11, "Madhouse", MADHOUSE_URL)
        assert studio.system_id == existing.system_id
        assert (studio.mal_id, studio.mal_link) == (999, "https://keep")

    def test_an_ambiguous_name_creates_nothing(self, db_session):
        _studio(db_session, name_en="Madhouse")
        _studio(db_session, name_jp="Madhouse")
        assert svc.resolve_studio_for_mal(db_session, 11, "Madhouse", MADHOUSE_URL) is None
        assert db_session.query(models.Studio).count() == 2


class TestResolvePersonForMal:
    def test_creates_a_person_with_the_role_scope_and_mal_columns(self, db_session):
        person = svc.resolve_person_for_mal(
            db_session, 1881, "Oda, Eiichiro", ODA_URL, role="author", scope="manga"
        )
        assert person.name_en == "Eiichiro Oda"
        assert (person.mal_id, person.mal_link) == (1881, ODA_URL)
        assert [(r.role, r.scope) for r in person.roles] == [("author", "manga")]

    def test_adds_the_role_to_a_matched_person(self, db_session):
        oda = _person(db_session, name_en="Eiichiro Oda", mal_id=1881)
        person = svc.resolve_person_for_mal(
            db_session, 1881, "Oda, Eiichiro", ODA_URL, role="illustrator", scope="manga"
        )
        assert person.system_id == oda.system_id
        assert ("illustrator", "manga") in {(r.role, r.scope) for r in person.roles}
        assert db_session.query(models.Person).count() == 1

    def test_links_a_name_matched_person_and_keeps_a_link_already_there(self, db_session):
        oda = _person(db_session, name_en="Eiichiro Oda", mal_link="https://mine")
        person = svc.resolve_person_for_mal(
            db_session, 1881, "Oda, Eiichiro", ODA_URL, role="author", scope="manga"
        )
        assert person.system_id == oda.system_id
        assert (person.mal_id, person.mal_link) == (1881, "https://mine")

    def test_an_ambiguous_name_creates_nothing(self, db_session):
        _person(db_session, name_en="Eiichiro Oda")
        _person(db_session, name_jp="Eiichiro Oda")
        assert (
            svc.resolve_person_for_mal(
                db_session, 1881, "Oda, Eiichiro", ODA_URL, role="author", scope="manga"
            )
            is None
        )
        assert db_session.query(models.Person).count() == 2


class TestReplaceCreditTargets:
    def test_writes_resolved_rows_in_order(self, db_session, sample_anime):
        a = _studio(db_session, name_en="A")
        b = _studio(db_session, name_en="B")
        svc.replace_credit_targets(db_session, sample_anime.system_id, "studio", [b, a])
        assert svc.credit_names(db_session, sample_anime.system_id, "studio") == ["B", "A"]

    def test_replace_credits_still_resolves_names(self, db_session, sample_anime):
        svc.replace_credits(db_session, "anime", sample_anime.system_id, "studio", ["X", "Y"])
        svc.replace_credits(db_session, "anime", sample_anime.system_id, "studio", ["Y"])
        assert svc.credit_names(db_session, sample_anime.system_id, "studio") == ["Y"]
