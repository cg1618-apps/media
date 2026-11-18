"""BookUnit model shape — columns, constraints, ordering, kind vocabulary."""

from app import models
from app.utils.constants import BOOK_UNIT_KINDS, BOOK_UNIT_KINDS_BY_TYPE


def test_book_unit_columns():
    """my_rating and remark are deliberately absent: each is one reader's
    opinion of one unit, and lives on user_book_unit_rating."""
    cols = {c.name for c in models.BookUnit.__table__.columns}
    assert cols == {
        "system_id",
        "book_id",
        "unit_kind",
        "position",
        "unit_key",
        "name_cn",
        "name_en",
        "ch_count",
        "release_date_jp",
        "release_date_tw",
        "cover_image_file",
        "created_at",
        "updated_at",
    }


def test_book_unit_fk_cascades():
    fk = list(models.BookUnit.__table__.c.book_id.foreign_keys)[0]
    assert fk.column.table.name == "book"
    assert fk.ondelete == "CASCADE"


def test_book_unit_check_constraints():
    names = {c.name for c in models.BookUnit.__table__.constraints if c.name}
    assert "ck_book_unit_kind" in names
    assert "ck_book_unit_ch_count_arc_only" in names


def test_the_two_stage_cursor_lives_on_the_list_row_and_the_json_lists_are_gone():
    """ch_fin_in_arc was added to `book` by nv1u2n3i4t5s and moved to
    user_media_list by m1b7book: it is one reader's position in the arc they
    are on, not a fact about the work. It still has to exist somewhere."""
    cols = {c.name for c in models.Book.__table__.columns}
    assert "ch_fin_in_arc" not in cols
    assert "ch_fin_in_arc" in {
        c.name for c in models.UserMediaList.__table__.columns
    }
    assert "book_name_each_cn" not in cols
    assert "book_name_each_en" not in cols


def test_kind_vocabulary():
    assert BOOK_UNIT_KINDS == ("volume", "arc", "story", "chapter")
    assert BOOK_UNIT_KINDS_BY_TYPE == {
        "輕小說": ("volume",),
        "小說": ("volume",),
        "網路小說": ("arc",),
        "短篇集": ("volume", "story", "chapter"),
        "指南/設定集": ("volume", "story", "chapter"),
        "其他": ("volume", "story", "chapter"),
    }
    # Every offered kind must be a real kind.
    for kinds in BOOK_UNIT_KINDS_BY_TYPE.values():
        assert set(kinds) <= set(BOOK_UNIT_KINDS)


def test_the_unit_rating_row_carries_the_remark():
    cols = {c.name for c in models.UserBookUnitRating.__table__.columns}
    assert {"user_id", "unit_id", "my_rating", "remark"} <= cols
