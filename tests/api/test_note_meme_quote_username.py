"""
Note, Meme and Quote carry their author by name.

author_id is a uuid minted per database, and the Users tab matches accounts on
`username`, so the same person holds a different uuid on each machine - above
all the `admin` account, which app/main.py mints everywhere. Written as a raw
uuid, every row the other machine's admin wrote named nobody here and fell back
to the installation owner. So the three tabs drop author_id for `username`, the
way Plan Next, Seasonal and Watch Order Follow drop user_id.

A sheet written before the column existed still carries author_id and no
`username` header; it restores the old way.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain.user_list import installation_owner_id
from app.services.pipelines import pull
from app.services.pipelines.tabs import TAB_BY_NAME
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


@pytest.fixture
def owner(db):
    """The installation owner, pinned by the flag.

    Load-bearing: without it the owner is the alphabetically-first non-root
    account - `kana_author` below - and a row that fell back to the owner is
    indistinguishable from a row restored to the author it names.
    """
    user = models.User(
        id=uuid.uuid4(),
        username="zzz_owner",
        hashed_password="!",
        role_id=role_id_for(db, "user"),
        is_installation_owner=True,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def kana(db, owner):
    """A second account, so a row restored to the owner and a row restored to
    the account it names are distinguishable."""
    user = models.User(
        id=uuid.uuid4(),
        username="kana_author",
        hashed_password="!",
        role_id=role_id_for(db, "user"),
    )
    db.add(user)
    db.flush()
    return user


@pytest.mark.parametrize("name", ["Note", "Meme", "Quote"])
def test_the_tab_carries_a_username_and_no_author_id(name):
    tab = TAB_BY_NAME[name]
    assert "author_id" in tab.drop_columns
    assert "username" in [n for n, _fn in tab.extra_columns]


@pytest.mark.parametrize("model", [models.Note, models.Meme, models.Quote])
def test_backup_writes_the_authors_username(db, kana, model):
    tab = next(t for t in TAB_BY_NAME.values() if t.model is model)
    write_username = dict(tab.extra_columns)["username"]
    row = model(author_id=kana.id)

    assert write_username(row, db) == "kana_author"


QUOTE_HEADERS = ["system_id", "text", "is_general", "username"]


def test_a_quote_is_restored_to_the_author_it_names(db, sheets, kana):
    sheets({"Quote": [QUOTE_HEADERS, ["", "名指しの一句", "true", "kana_author"]]})

    result = pull.execute_pull_specific(db, "Quote", log_action=False)

    assert result["status"] == "success"
    quote = db.query(models.Quote).filter_by(text="名指しの一句").one()
    assert quote.author_id == kana.id


def test_a_quote_naming_an_unknown_author_still_restores_to_the_owner(
    db, sheets, owner
):
    """The rule the uuid fallback already argues: a line whose author is
    uncertain is still the line, and the sheet is its only copy. So unlike
    Plan Next, an unknown name files the row under the installation owner
    rather than skipping it."""
    sheets({"Quote": [QUOTE_HEADERS, ["", "誰かの一句", "true", "nobody"]]})

    result = pull.execute_pull_specific(db, "Quote", log_action=False)

    assert result["status"] == "success"
    quote = db.query(models.Quote).filter_by(text="誰かの一句").one()
    assert quote.author_id == owner.id == installation_owner_id(db)


NOTE_HEADERS = [
    "system_id", "owner_type", "owner_id", "section", "content", "sort_index",
    "username",
]


def _remark(owner_id, content, username):
    return ["", "anime", str(owner_id), "remark", content, "0", username]


def test_two_accounts_remarks_on_one_entry_come_back_as_two_rows(
    db, sheets, sample_anime, owner_user, kana
):
    """remark is one row per owner PER AUTHOR. Once authors round-trip, the
    remark fold in Pull must match on the author too - or the second remark
    is written over the first."""
    owner = sample_anime.system_id
    sheets({
        "Note": [
            NOTE_HEADERS,
            _remark(owner, "admin's remark", owner_user.username),
            _remark(owner, "kana's remark", "kana_author"),
        ]
    })

    result = pull.execute_pull_specific(db, "Note", log_action=False)

    assert result["status"] == "success"
    remarks = {
        n.author_id: n.content
        for n in db.query(models.Note).filter(
            models.Note.media_id == owner, models.Note.section == "remark"
        )
    }
    assert remarks == {owner_user.id: "admin's remark", kana.id: "kana's remark"}


def test_a_remark_folds_onto_the_same_authors_local_row(
    db, sheets, sample_anime, kana
):
    """The fold itself still works: kana's remark in the sheet, with a stale
    system_id, updates kana's local remark in place."""
    owner = sample_anime.system_id
    local = models.Note(
        author_id=kana.id, media_id=owner, section="remark",
        content="local", sort_index=0,
    )
    db.add(local)
    db.flush()
    sheets({"Note": [NOTE_HEADERS, _remark(owner, "from the sheet", "kana_author")]})

    result = pull.execute_pull_specific(db, "Note", log_action=False)

    assert result["status"] == "success"
    rows = db.query(models.Note).filter(
        models.Note.media_id == owner, models.Note.section == "remark"
    ).all()
    assert [(r.system_id, r.content) for r in rows] == [
        (local.system_id, "from the sheet")
    ]
