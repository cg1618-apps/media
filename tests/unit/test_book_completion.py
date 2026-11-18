"""The book /complete halves with the two-stage cursor.

Ported from mark_book_completed, which Task 15 retires: the work's half
(serialization, the volume and arc totals) is mark_book_catalog's, and the
reader's half (status and every *_fin) is mark_book_list's. Every assertion
below is the one the single helper carried, re-aimed at whichever half now
owns that field.
"""

from types import SimpleNamespace

from app.services.domain.completion import mark_book_catalog, mark_book_list


def arc(position, ch_count):
    return SimpleNamespace(unit_kind="arc", position=position, ch_count=ch_count)


def book(**overrides):
    base = dict(
        units=[],
        serialization_status=None,
        vol_total_original=None,
        vol_total_tw=None,
        arc_total=None,
        ch_total=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def row(**overrides):
    base = dict(status="Active Reading", vol_fin=0, arc_fin=0, ch_fin=0,
                ch_fin_in_arc=0)
    base.update(overrides)
    return SimpleNamespace(**base)


def test_completing_an_arc_book_closes_every_arc():
    entry = book(units=[arc(1, 100), arc(2, 112)])
    r = row(arc_fin=1, ch_fin_in_arc=101)
    mark_book_catalog(entry)
    mark_book_list(r, entry)
    assert r.status == "Completed"
    assert entry.serialization_status == "完結"
    assert r.arc_fin == 2
    assert r.ch_fin_in_arc == 0
    assert r.ch_fin == 212
    assert entry.ch_total == 212


def test_completing_a_volume_book_is_unchanged():
    entry = book(vol_total_original=12, vol_total_tw=9)
    r = row(vol_fin=3)
    mark_book_catalog(entry)
    mark_book_list(r, entry)
    assert r.vol_fin == 12
    assert entry.vol_total_tw == 12
    assert r.ch_fin_in_arc == 0


def test_completing_an_already_finished_arc_book_is_idempotent():
    entry = book(units=[arc(1, 50), arc(2, 60)])
    r = row(arc_fin=2, ch_fin_in_arc=0)
    mark_book_catalog(entry)
    mark_book_list(r, entry)
    assert r.status == "Completed"
    assert entry.serialization_status == "完結"
    assert r.arc_fin == 2
    assert r.ch_fin_in_arc == 0
    assert r.ch_fin == 110
    assert entry.ch_total == 110
