"""
Upcoming books and manga volumes: revision u1p2coming3.

A book unit carries a JP and a TW release date and a cover; a manga carries
its next volume's JP and TW release dates. Every way a value arrives is
covered: the API (and its refusal of a malformed date, beside the same write
with a good one), the image library's attach, and the Google Sheets tabs in
both directions - including a tab backed up before the columns existed.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import importlib.util
import io
import uuid
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from PIL import Image as PILImage
from sqlalchemy import text

from app import models
from app.services.integrations import image_library
from app.services.pipelines import backup, pull
from app.services.rbac.permissions import PERM_MANAGE_IMAGES
from tests.api.conftest import catalog_writer, nsfw_label  # noqa: F401

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "u1p2coming3_upcoming_volumes.py"

UNIT_DATES = ("release_date_jp", "release_date_tw")
MANGA_DATES = ("next_vol_release_date_jp", "next_vol_release_date_tw")


def _book_payload(**overrides):
    payload = {
        "book_name_cn": "預定之書",
        "type": "輕小說",
        "units": [
            {
                "unit_kind": "volume",
                "position": 1,
                "release_date_jp": "2027-03",
                "release_date_tw": "2027-09-15",
            },
        ],
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Book units through the API
# ---------------------------------------------------------------------------


def test_a_unit_keeps_its_two_dates(owner_client):
    resp = owner_client.post("/api/book/", json=_book_payload())

    assert resp.status_code == 201, resp.text
    unit = resp.json()["units"][0]
    assert (unit["release_date_jp"], unit["release_date_tw"]) == ("2027-03", "2027-09-15")
    assert unit["cover_image_file"] is None


def test_every_unit_kind_takes_a_date(owner_client):
    units = [
        {"unit_kind": kind, "position": i + 1, "release_date_jp": "2028"}
        for i, kind in enumerate(("volume", "arc", "story", "chapter"))
    ]
    resp = owner_client.post("/api/book/", json=_book_payload(type="其他", units=units))

    assert resp.status_code == 201, resp.text
    assert [u["release_date_jp"] for u in resp.json()["units"]] == ["2028"] * 4


def test_the_book_list_carries_the_unit_dates(owner_client):
    """Future Releases reads units from the list, so the list must carry them."""
    owner_client.post("/api/book/", json=_book_payload())

    rows = owner_client.get("/api/book/").json()

    unit = rows[0]["units"][0]
    assert (unit["release_date_jp"], unit["release_date_tw"]) == ("2027-03", "2027-09-15")


def test_an_update_changes_and_clears_a_unit_date(owner_client):
    created = owner_client.post("/api/book/", json=_book_payload()).json()
    unit = created["units"][0]

    resp = owner_client.put(
        f"/api/book/{created['system_id']}",
        json=_book_payload(
            units=[
                {
                    "system_id": unit["system_id"],
                    "unit_kind": "volume",
                    "position": 1,
                    "release_date_jp": "2027-04-01",
                    "release_date_tw": "",
                }
            ]
        ),
    )

    assert resp.status_code == 200, resp.text
    unit = resp.json()["units"][0]
    assert (unit["release_date_jp"], unit["release_date_tw"]) == ("2027-04-01", None)


@pytest.mark.parametrize("field", UNIT_DATES)
def test_put_refuses_a_malformed_unit_date(owner_client, field):
    created = owner_client.post("/api/book/", json=_book_payload()).json()
    unit = {"unit_kind": "volume", "position": 1, field: "next spring"}

    resp = owner_client.put(
        f"/api/book/{created['system_id']}", json=_book_payload(units=[unit])
    )

    assert resp.status_code == 422


@pytest.mark.parametrize("field", UNIT_DATES)
def test_put_takes_the_same_unit_with_a_good_date(owner_client, field):
    """Mirror of the refusal: the same write with a valid value succeeds."""
    created = owner_client.post("/api/book/", json=_book_payload()).json()
    unit = {"unit_kind": "volume", "position": 1, field: "2027-05"}

    resp = owner_client.put(
        f"/api/book/{created['system_id']}", json=_book_payload(units=[unit])
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["units"][0][field] == "2027-05"


def test_patch_refuses_a_malformed_unit_date(owner_client, db_session):
    """PATCH's body is a raw dict, so the writer checks it rather than the
    CHECK constraint answering with a 500."""
    created = owner_client.post("/api/book/", json=_book_payload()).json()

    resp = owner_client.patch(
        f"/api/book/{created['system_id']}",
        json={"units": [{"unit_kind": "volume", "position": 1, "release_date_jp": "2027-13"}]},
    )

    assert resp.status_code == 422


def test_patch_takes_a_good_unit_date(owner_client):
    created = owner_client.post("/api/book/", json=_book_payload()).json()

    resp = owner_client.patch(
        f"/api/book/{created['system_id']}",
        json={"units": [{"unit_kind": "volume", "position": 1, "release_date_jp": "2027-12"}]},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["units"][0]["release_date_jp"] == "2027-12"


# ---------------------------------------------------------------------------
# A unit's cover, through the image library
# ---------------------------------------------------------------------------


@pytest.fixture
def _library_in_tmp(tmp_path, monkeypatch):
    """Never write into the developer's real static/library during a test."""
    monkeypatch.setattr(image_library, "STATIC_DIR", str(tmp_path))


def _upload(client):
    buf = io.BytesIO()
    PILImage.new("RGB", (40, 60), (30, 90, 200)).save(buf, format="PNG")
    resp = client.post("/api/images", files={"file": ("u.png", buf.getvalue(), "image/png")})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _attach(client, image, unit_id):
    return client.post(
        f"/api/images/{image['system_id']}/attach",
        json={"owner_type": "book-unit", "owner_id": str(unit_id), "role": "cover"},
    )


@pytest.fixture
def unit(db_session, sample_franchise):
    book = models.Book(book_name_en="Covered", franchise_id=sample_franchise.system_id)
    db_session.add(book)
    db_session.flush()
    row = models.BookUnit(
        system_id=uuid.uuid4(), book_id=book.system_id, unit_kind="volume", position=1
    )
    db_session.add(row)
    db_session.flush()
    return row


@pytest.fixture
def hidden_unit(db_session, sample_franchise, nsfw_label):  # noqa: F811
    """A unit of a book carrying `nsfw`. The label is what makes the refusal
    below possible: without it every writer sees the book."""
    book = models.Book(book_name_en="Hidden Covered", franchise_id=sample_franchise.system_id)
    db_session.add(book)
    db_session.flush()
    db_session.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(), media_id=book.system_id, label_id=nsfw_label.system_id
        )
    )
    row = models.BookUnit(
        system_id=uuid.uuid4(), book_id=book.system_id, unit_kind="volume", position=1
    )
    db_session.add(row)
    db_session.flush()
    return row


def test_attaching_a_unit_cover_writes_its_mirror_column(
    owner_client, db_session, unit, _library_in_tmp
):
    image = _upload(owner_client)

    resp = _attach(owner_client, image, unit.system_id)

    assert resp.status_code == 201, resp.text
    db_session.refresh(unit)
    assert unit.cover_image_file == image["storage_key"]
    book = owner_client.get(f"/api/book/{unit.book_id}").json()
    assert book["units"][0]["cover_image_file"] == image["storage_key"]


def test_clearing_a_unit_cover_empties_its_mirror_column(
    owner_client, db_session, unit, _library_in_tmp
):
    _attach(owner_client, _upload(owner_client), unit.system_id)

    resp = owner_client.delete(f"/api/images/owners/book-unit/{unit.system_id}/cover")

    assert resp.status_code == 204
    db_session.refresh(unit)
    assert unit.cover_image_file is None
    assert db_session.query(models.ImageAttachment).count() == 0


def test_attaching_to_a_unit_that_does_not_exist_is_a_404(owner_client, _library_in_tmp):
    resp = _attach(owner_client, _upload(owner_client), uuid.uuid4())

    assert resp.status_code == 404


def test_a_writer_who_cannot_see_the_book_cannot_cover_its_unit(
    db_session, catalog_writer, hidden_unit, _library_in_tmp  # noqa: F811
):
    writer = catalog_writer(extra={PERM_MANAGE_IMAGES}, username="blindunit", label_keys=())

    resp = _attach(writer, _upload(writer), hidden_unit.system_id)

    assert resp.status_code == 404
    assert db_session.query(models.ImageAttachment).count() == 0


def test_a_writer_who_sees_the_book_covers_its_unit(
    db_session, catalog_writer, hidden_unit, _library_in_tmp  # noqa: F811
):
    """Mirror of the refusal, on the same labelled book."""
    writer = catalog_writer(extra={PERM_MANAGE_IMAGES}, username="seeingunit", label_keys=("nsfw",))

    resp = _attach(writer, _upload(writer), hidden_unit.system_id)

    assert resp.status_code == 201, resp.text
    assert db_session.query(models.ImageAttachment).count() == 1


def test_a_units_save_never_writes_the_cover(owner_client, unit, _library_in_tmp):
    """The cover is the image library's: a units save from a form loaded
    before it was attached - sending no cover, or a stale empty one - keeps it."""
    image = _upload(owner_client)
    _attach(owner_client, image, unit.system_id)

    resp = owner_client.patch(
        f"/api/book/{unit.book_id}",
        json={
            "units": [
                {
                    "system_id": str(unit.system_id),
                    "unit_kind": "volume",
                    "position": 1,
                    "name_en": "Renamed",
                    "cover_image_file": None,
                }
            ]
        },
    )

    assert resp.status_code == 200, resp.text
    saved = resp.json()["units"][0]
    assert (saved["name_en"], saved["cover_image_file"]) == ("Renamed", image["storage_key"])


# ---------------------------------------------------------------------------
# Manga's next volume through the API
# ---------------------------------------------------------------------------


def _manga_payload(**overrides):
    payload = {"manga_name_cn": "下一卷", "region": "日本"}
    payload.update(overrides)
    return payload


def test_a_manga_keeps_its_next_volume_dates(owner_client):
    resp = owner_client.post(
        "/api/manga/",
        json=_manga_payload(next_vol_release_date_jp="2027-01-05", next_vol_release_date_tw="2027"),
    )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert (body["next_vol_release_date_jp"], body["next_vol_release_date_tw"]) == (
        "2027-01-05",
        "2027",
    )


def test_an_update_moves_the_next_volume_date(owner_client):
    created = owner_client.post(
        "/api/manga/", json=_manga_payload(next_vol_release_date_jp="2027-01")
    ).json()

    resp = owner_client.put(
        f"/api/manga/{created['system_id']}",
        json=_manga_payload(next_vol_release_date_jp="2027-06", next_vol_release_date_tw=""),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["next_vol_release_date_jp"], body["next_vol_release_date_tw"]) == ("2027-06", None)


@pytest.mark.parametrize("field", MANGA_DATES)
def test_a_malformed_next_volume_date_is_refused(owner_client, field):
    resp = owner_client.post("/api/manga/", json=_manga_payload(**{field: "soon"}))

    assert resp.status_code == 422


@pytest.mark.parametrize("field", MANGA_DATES)
def test_the_same_manga_with_a_good_date_is_taken(owner_client, field):
    """Mirror of the refusal."""
    resp = owner_client.post("/api/manga/", json=_manga_payload(**{field: "2027-02"}))

    assert resp.status_code == 201, resp.text
    assert resp.json()[field] == "2027-02"


# ---------------------------------------------------------------------------
# Google Sheets
# ---------------------------------------------------------------------------


@pytest.fixture
def sheet(monkeypatch):
    """Install a stubbed sheet: {title: matrix}. Titles it lacks read empty."""

    def _install(tabs: dict):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs.get(tab, []))
        monkeypatch.setattr(pull, "sheet_tab_titles", lambda: frozenset(tabs))

    return _install


@pytest.fixture
def backed_up(db_session, monkeypatch):
    """Run Backup and return {tab: matrix} as Sheets would read it back: a
    date cell's leading apostrophe forces a text cell and is not part of the
    value."""

    def _run():
        written = {}

        def record(tab, matrix):
            written[tab] = [
                [c[1:] if isinstance(c, str) and c.startswith("'") else c for c in row]
                for row in matrix
            ]
            return True

        monkeypatch.setattr(backup, "bulk_overwrite_sheet", record)
        backup.execute_backup(db_session)
        return written

    return _run


def _column(matrix, row_id, header):
    headers = matrix[0]
    row = next(r for r in matrix[1:] if r[headers.index("system_id")] == str(row_id))
    return row[headers.index(header)]


def test_the_book_unit_tab_round_trips_dates_and_cover(
    db_session, unit, sheet, backed_up
):
    unit.release_date_jp = "2027-03"
    unit.release_date_tw = "2027-09-15"
    unit.cover_image_file = "library/abc.jpg"
    db_session.flush()

    matrix = backed_up()["Book Unit"]

    assert _column(matrix, unit.system_id, "release_date_jp") == "2027-03"
    assert _column(matrix, unit.system_id, "release_date_tw") == "2027-09-15"
    assert _column(matrix, unit.system_id, "cover_image_file") == "library/abc.jpg"

    unit.release_date_jp = unit.release_date_tw = unit.cover_image_file = None
    db_session.flush()
    sheet({"Book Unit": matrix})
    result = pull.execute_pull_specific(db_session, "Book Unit", log_action=False)

    assert result["status"] == "success", result
    db_session.refresh(unit)
    assert (unit.release_date_jp, unit.release_date_tw, unit.cover_image_file) == (
        "2027-03",
        "2027-09-15",
        "library/abc.jpg",
    )


def test_an_older_book_unit_tab_without_the_columns_still_pulls(db_session, unit, sheet):
    sheet(
        {
            "Book Unit": [
                ["system_id", "book_id", "unit_kind", "position", "unit_key"],
                [str(unit.system_id), str(unit.book_id), "volume", "1", "Vol 1"],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "Book Unit", log_action=False)

    assert result["status"] == "success", result
    assert result["unresolved_refs"] == []
    db_session.refresh(unit)
    assert unit.unit_key == "Vol 1"
    assert (unit.release_date_jp, unit.release_date_tw, unit.cover_image_file) == (None, None, None)


@pytest.fixture
def manga(db_session, sample_franchise):
    row = models.Manga(manga_name_en="Next Volume", franchise_id=sample_franchise.system_id)
    db_session.add(row)
    db_session.flush()
    return row


def test_the_manga_tab_round_trips_the_next_volume_dates(db_session, manga, sheet, backed_up):
    manga.next_vol_release_date_jp = "2027-01-05"
    manga.next_vol_release_date_tw = "2027-02"
    db_session.flush()

    matrix = backed_up()["Manga"]

    assert _column(matrix, manga.system_id, "next_vol_release_date_jp") == "2027-01-05"
    assert _column(matrix, manga.system_id, "next_vol_release_date_tw") == "2027-02"

    manga.next_vol_release_date_jp = manga.next_vol_release_date_tw = None
    db_session.flush()
    sheet({"Manga": matrix})
    result = pull.execute_pull_specific(db_session, "Manga", log_action=False)

    assert result["status"] == "success", result
    db_session.refresh(manga)
    assert (manga.next_vol_release_date_jp, manga.next_vol_release_date_tw) == ("2027-01-05", "2027-02")


def test_an_older_manga_tab_without_the_columns_still_pulls(db_session, manga, sheet):
    sheet(
        {
            "Manga": [
                ["system_id", "franchise_id", "manga_name_en", "release_date"],
                [str(manga.system_id), str(manga.franchise_id), "Old Tab Manga", "2010"],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "Manga", log_action=False)

    assert result["status"] == "success", result
    db_session.refresh(manga)
    assert (manga.manga_name_en, manga.release_date) == ("Old Tab Manga", "2010")
    assert (manga.next_vol_release_date_jp, manga.next_vol_release_date_tw) == (None, None)


# ---------------------------------------------------------------------------
# The revision
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_upcoming_volumes", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def conn(db_session, revision, monkeypatch):
    connection = db_session.connection()
    # Deferred FK checks still pending block an ALTER; a migration runs with
    # none queued.
    connection.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    monkeypatch.setattr(revision, "op", Operations(MigrationContext.configure(connection)))
    return connection


def _columns(conn, table):
    return set(
        conn.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name = :t"),
            {"t": table},
        ).scalars()
    )


def _checks(conn):
    return set(
        conn.execute(text("SELECT conname FROM pg_constraint WHERE contype = 'c'")).scalars()
    )


EXPECTED_CHECKS = {
    "ck_book_unit_release_date_jp_iso",
    "ck_book_unit_release_date_tw_iso",
    "ck_manga_next_vol_release_date_jp_iso",
    "ck_manga_next_vol_release_date_tw_iso",
}


def test_the_revision_follows_the_rename(revision):
    assert revision.down_revision == "b1o2okrename3"


def test_the_downgrade_drops_every_column_and_check(conn, revision):
    revision.downgrade()

    assert not {"release_date_jp", "release_date_tw", "cover_image_file"} & _columns(conn, "book_unit")
    assert not set(MANGA_DATES) & _columns(conn, "manga")
    assert not EXPECTED_CHECKS & _checks(conn)


def test_the_upgrade_adds_them_back_empty(db_session, conn, revision, unit, manga):
    revision.downgrade()

    revision.upgrade()

    assert {"release_date_jp", "release_date_tw", "cover_image_file"} <= _columns(conn, "book_unit")
    assert set(MANGA_DATES) <= _columns(conn, "manga")
    assert EXPECTED_CHECKS <= _checks(conn)
    row = conn.execute(
        text("SELECT release_date_jp, release_date_tw, cover_image_file FROM book_unit WHERE system_id = :id"),
        {"id": unit.system_id},
    ).one()
    assert tuple(row) == (None, None, None)


def test_the_upgraded_check_refuses_a_malformed_date(db_session, conn, revision, unit):
    revision.downgrade()
    revision.upgrade()

    savepoint = conn.begin_nested()
    with pytest.raises(Exception, match="ck_book_unit_release_date_jp_iso"):
        conn.execute(
            text("UPDATE book_unit SET release_date_jp = 'soon' WHERE system_id = :id"),
            {"id": unit.system_id},
        )
    savepoint.rollback()


def test_the_upgraded_check_takes_a_partial_date(db_session, conn, revision, unit):
    """Mirror of the refusal, on the same row."""
    revision.downgrade()
    revision.upgrade()

    conn.execute(
        text("UPDATE book_unit SET release_date_jp = '2027-03' WHERE system_id = :id"),
        {"id": unit.system_id},
    )

    assert conn.execute(
        text("SELECT release_date_jp FROM book_unit WHERE system_id = :id"), {"id": unit.system_id}
    ).scalar() == "2027-03"
