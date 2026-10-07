"""Unit tests for find_duplicate_anime's shared-name rule.

Same stub-session shape as test_game_duplicates: the finder's only database
access is one `db.query(Anime).all()`.
"""

import uuid

from app.models.anime import Anime
from app.services.domain.duplicates import find_duplicate_anime


class _StubQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._rows


class _StubSession:
    def __init__(self, rows):
        self._rows = rows

    def query(self, _model):
        return _StubQuery(self._rows)


FRANCHISE = uuid.uuid4()


def _anime(**kwargs):
    kwargs.setdefault("system_id", uuid.uuid4())
    kwargs.setdefault("franchise_id", FRANCHISE)
    kwargs.setdefault("airing_type", "TV")
    return Anime(**kwargs)


def test_entries_sharing_one_alt_fragment_are_clustered():
    rows = [
        _anime(anime_name_en="Frieren", anime_name_alt="Sousou no Frieren, Frieren BTJ"),
        _anime(anime_name_en="Frieren TV", anime_name_alt="Frieren BTJ, 葬送"),
    ]
    clusters = find_duplicate_anime(_StubSession(rows))
    assert len(clusters) == 1
    assert len(clusters[0]) == 2


def test_entries_whose_alt_lists_share_no_fragment_are_not_clustered():
    # Both alt lists are non-empty, and one fragment is a prefix of another,
    # so a compare that did not split exactly would have something to match.
    rows = [
        _anime(anime_name_en="Frieren", anime_name_alt="Sousou no Frieren, Frieren BTJ"),
        _anime(anime_name_en="Frieren TV", anime_name_alt="Frieren BTJ 2, 葬送"),
    ]
    assert find_duplicate_anime(_StubSession(rows)) == []


def test_get_all_names_splits_alt_and_keeps_case_folding():
    row = _anime(anime_name_en=" Frieren ", anime_name_alt="Sousou, FRIEREN BTJ")
    assert row.get_all_names() == {"frieren", "sousou", "frieren btj"}
