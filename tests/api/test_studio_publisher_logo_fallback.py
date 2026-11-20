"""
display_logo_file / display_logo_focus on studio and publisher responses: the
company's own logo, else the cover of the newest VISIBLE entry it is credited
on that has a cover, else null (app/services/domain/credits.py,
credit_summaries).

The refusal test makes the hidden set non-empty: `hidden_anime` carries a
label the guest's mode lacks, it is the NEWEST credited entry and it HAS a
cover, and an older visible entry has one too - so the guest reading the
older cover, while `owner_client` (whose mode carries every label) reads the
hidden one off the same record, proves the gate did the choosing.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy import event

from app import models

KINDS = ["studio", "publisher"]


def _model(kind):
    return models.Studio if kind == "studio" else models.Publisher


def _company(db_session, kind, name="Zvornik Logo Company", **columns):
    company = _model(kind)(system_id=uuid.uuid4(), name_en=name, **columns)
    db_session.add(company)
    db_session.flush()
    return company


def _set_cover(db_session, entry, cover, focus=None):
    db_session.query(models.Media).filter_by(system_id=entry.system_id).update(
        {"cover_image_file": cover, "cover_image_focus": focus}
    )
    db_session.flush()
    db_session.expire_all()


def _anime(db_session, franchise, name, released, cover=None, focus=None):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en=name,
        airing_type="TV",
        release_date_jp=released,
    )
    db_session.add(entry)
    db_session.flush()
    if cover:
        _set_cover(db_session, entry, cover, focus)
    return entry


def _credit(db_session, kind, company, entry, position=0):
    db_session.add(
        models.MediaCredit(
            media_id=entry.system_id,
            role=kind,
            position=position,
            **{f"{kind}_id": company.system_id},
        )
    )
    db_session.flush()


def _detail(client, kind, company):
    r = client.get(f"/api/{kind}/{company.system_id}")
    assert r.status_code == 200, r.text
    return r.json()


def _from_list(client, kind, company):
    rows = client.get(f"/api/{kind}/").json()
    return next(row for row in rows if row["system_id"] == str(company.system_id))


READS = pytest.mark.parametrize("read", [_detail, _from_list], ids=["detail", "list"])


@pytest.fixture
def credited(db_session, sample_franchise):
    """
    One company per kind, credited on three anime, positioned so that
    position order, release order and "has a cover" all disagree:

      position 0  2020  cover old.jpg  focus 10% 20%
      position 1  2024  NO cover
      position 2  2022  cover mid.jpg  focus 30% 40%
    """

    def build(kind):
        company = _company(db_session, kind)
        old = _anime(db_session, sample_franchise, "Old", "2020-01", "old.jpg", "10% 20%")
        newest = _anime(db_session, sample_franchise, "Newest", "2024-01")
        mid = _anime(db_session, sample_franchise, "Mid", "2022-01", "mid.jpg", "30% 40%")
        for position, entry in enumerate((old, newest, mid)):
            _credit(db_session, kind, company, entry, position)
        return company

    return build


@pytest.mark.parametrize("kind", KINDS)
@READS
def test_no_logo_falls_back_to_the_newest_credited_cover_with_its_focus(
    owner_client, credited, kind, read
):
    body = read(owner_client, kind, credited(kind))
    assert body["logo_file"] is None
    assert body["display_logo_file"] == "mid.jpg"
    assert body["display_logo_focus"] == "30% 40%"


@pytest.mark.parametrize("kind", KINDS)
@READS
def test_own_logo_wins_and_keeps_its_own_focus(
    owner_client, db_session, credited, kind, read
):
    company = credited(kind)
    company.logo_file = "own.png"
    company.logo_focus = "50% 60%"
    db_session.flush()
    body = read(owner_client, kind, company)
    assert body["display_logo_file"] == "own.png"
    assert body["display_logo_focus"] == "50% 60%"
    # The real column is untouched either way.
    assert body["logo_file"] == "own.png"


@pytest.mark.parametrize("kind", KINDS)
def test_equal_dates_keep_credit_position_order(
    owner_client, db_session, sample_franchise, kind
):
    company = _company(db_session, kind)
    second = _anime(db_session, sample_franchise, "B", "2021-01", "second.jpg")
    first = _anime(db_session, sample_franchise, "A", "2021-01", "first.jpg")
    _credit(db_session, kind, company, second, position=1)
    _credit(db_session, kind, company, first, position=0)
    assert _detail(owner_client, kind, company)["display_logo_file"] == "first.jpg"


@pytest.mark.parametrize("kind", KINDS)
@READS
def test_a_hidden_entrys_cover_is_never_used(
    guest_reader, owner_client, db_session, credited, hidden_anime, kind, read
):
    company = credited(kind)
    hidden_anime.release_date_jp = "2030-01"
    db_session.flush()
    _set_cover(db_session, hidden_anime, "hidden.jpg", "70% 80%")
    _credit(db_session, kind, company, hidden_anime, position=3)

    guest = read(guest_reader, kind, company)
    assert guest["display_logo_file"] == "mid.jpg"
    assert guest["display_logo_focus"] == "30% 40%"
    # The mirror, same record: the hidden cover IS the choice when visible.
    owner = read(owner_client, kind, company)
    assert owner["display_logo_file"] == "hidden.jpg"
    assert owner["display_logo_focus"] == "70% 80%"


@pytest.mark.parametrize("kind", KINDS)
@READS
def test_nothing_with_a_cover_is_null(
    owner_client, db_session, sample_franchise, kind, read
):
    company = _company(db_session, kind)
    _credit(db_session, kind, company, _anime(db_session, sample_franchise, "Bare", "2021-01"))
    body = read(owner_client, kind, company)
    assert body["display_logo_file"] is None
    assert body["display_logo_focus"] is None


@pytest.mark.parametrize("kind", KINDS)
def test_uncredited_is_null(owner_client, db_session, kind):
    body = _detail(owner_client, kind, _company(db_session, kind))
    assert body["display_logo_file"] is None
    assert body["display_logo_focus"] is None


def test_search_results_carry_the_same_fallback(guest_reader, credited):
    studio = credited("studio")
    body = guest_reader.get("/api/search/", params={"q": "Zvornik Logo"}).json()
    row = next(
        r for r in body["results"]["studio"] if r["system_id"] == str(studio.system_id)
    )
    assert row["display_logo_file"] == "mid.jpg"
    assert row["display_logo_focus"] == "30% 40%"


# ---------------------------------------------------------------------------
# Batched
# ---------------------------------------------------------------------------

_TX_CONTROL = ("SAVEPOINT", "RELEASE", "ROLLBACK", "COMMIT", "BEGIN")


def _count_queries(db_session, client, url):
    seen = []

    def count(_conn, _cursor, statement, *_args, **_kwargs):
        if not statement.lstrip().upper().startswith(_TX_CONTROL):
            seen.append(1)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", count)
    try:
        body = client.get(url).json()
    finally:
        event.remove(engine, "before_cursor_execute", count)
    return len(seen), body


@pytest.mark.parametrize("kind", KINDS)
def test_the_list_query_count_does_not_grow_with_the_row_count(
    owner_client, db_session, sample_franchise, kind
):
    def add(start, stop):
        for i in range(start, stop):
            entry = _anime(
                db_session, sample_franchise, f"Batch {i}", f"20{10 + i}-01", f"{i}.jpg"
            )
            _credit(db_session, kind, _company(db_session, kind, f"Batch {kind} {i}"), entry)
        db_session.commit()

    add(0, 2)
    owner_client.get(f"/api/{kind}/")  # warm the permission cache
    two, body = _count_queries(db_session, owner_client, f"/api/{kind}/")
    assert len(body) >= 2
    add(2, 5)
    five, body = _count_queries(db_session, owner_client, f"/api/{kind}/")
    assert len(body) >= 5
    assert {row["display_logo_file"] for row in body} >= {f"{i}.jpg" for i in range(5)}
    assert five == two, "query count grew with the number of rows"
