"""
Note marks: each viewer's own values on catalogue note rows.

The row - an item, an enemy, an ending, a stat, a mod, a song - is catalogue
and shared. `collected`, `amount_collected`, `beaten`, `completion`,
`my_value` and the music and mod `status` are each viewer's own, kept in
`note_mark` and overlaid onto the row where the field lives, so the response
shape is unchanged.

Every refusal here is asserted with the refused thing PRESENT - another
account's mark, a stale value on the row, a granted value somebody holds - and
mirrored by the viewer the rule lets through, so a green says the rule did the
refusing and not an empty table.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac import features
from app.services.rbac.permissions import (
    PERM_MANAGE_PIPELINES,
    PERM_SELF_PERSONAL_NOTES,
    media_type_perm,
)
from app.services.rbac.seed import default_user_permissions
from tests.api.conftest import make_viewer


@pytest.fixture(autouse=True)
def _features(features_follow_personal_notes):
    """See conftest.features_follow_personal_notes."""


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def game(db):
    g = models.Game(system_id=uuid.uuid4(), game_name_en="Elden Ring")
    db.add(g)
    db.flush()
    return g


@pytest.fixture
def other_game(db):
    g = models.Game(system_id=uuid.uuid4(), game_name_en="Sekiro")
    db.add(g)
    db.flush()
    return g


def _row(db, author, owner, section, **columns):
    note = models.Note(
        system_id=uuid.uuid4(),
        media_id=owner.system_id,
        author_id=author.id,
        section=section,
        **columns,
    )
    db.add(note)
    db.flush()
    return note


class Accounts:
    """Several accounts on one TestClient, switched by their cookie."""

    def __init__(self, db, client):
        self.db = db
        self.client = client
        self.cookies: dict[str, str] = {}

    def add(self, username, permissions=None, **kw):
        make_viewer(
            self.db,
            self.client,
            username,
            default_user_permissions() if permissions is None else permissions,
            **kw,
        )
        self.cookies[username] = self.client.cookies.get("access_token")
        return self.user(username)

    def user(self, username):
        return self.db.query(models.User).filter(models.User.username == username).one()

    def as_(self, username):
        self.client.cookies.set("access_token", self.cookies[username])
        return self.client

    def anonymous(self):
        self.client.cookies.clear()
        return self.client


@pytest.fixture
def accounts(db, client):
    return Accounts(db, client)


@pytest.fixture
def alice_and_bob(accounts):
    accounts.add("alice")
    accounts.add("bob")
    return accounts


def _notes(c, owner, owner_type="game"):
    r = c.get("/api/notes", params={"owner_type": owner_type, "owner_id": str(owner.system_id)})
    assert r.status_code == 200, r.text
    return {n["system_id"]: n for n in r.json()}


def _mark(c, note, **values):
    return c.put(f"/api/notes/{note.system_id}/mark", json={"values": values})


def _stored(db, user, note):
    db.expire_all()
    row = (
        db.query(models.NoteMark)
        .filter(models.NoteMark.user_id == user.id, models.NoteMark.note_id == note.system_id)
        .first()
    )
    return None if row is None else row.values


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def test_two_accounts_mark_one_row_and_each_reads_its_own(db, alice_and_bob, owner_user, game):
    a = alice_and_bob
    item = _row(db, owner_user, game, "items", title="Flask", fields={"amount_total": "12"})
    stat = _row(db, owner_user, game, "stats_and_points", title="Vigor")

    r = _mark(a.as_("alice"), item, collected="collected", amount_collected="3")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "collected"
    assert r.json()["fields"] == {"amount_total": "12", "amount_collected": "3"}
    assert _mark(a.as_("alice"), stat, my_value="40").status_code == 200
    assert _mark(a.as_("bob"), item, collected="skip").status_code == 200

    mine = _notes(a.as_("alice"), game)
    assert mine[str(item.system_id)]["status"] == "collected"
    assert mine[str(item.system_id)]["fields"]["amount_collected"] == "3"
    assert mine[str(stat.system_id)]["fields"] == {"my_value": "40"}

    theirs = _notes(a.as_("bob"), game)
    assert theirs[str(item.system_id)]["status"] == "skip"
    assert "amount_collected" not in theirs[str(item.system_id)]["fields"]
    assert theirs[str(stat.system_id)]["fields"] is None

    assert _stored(db, a.user("alice"), item) == {"collected": "collected", "amount_collected": "3"}
    assert _stored(db, a.user("bob"), item) == {"collected": "skip"}


def test_no_mark_reads_the_fields_default_or_null_never_the_row(
    db, alice_and_bob, owner_user, game
):
    """The row carries a stale value on every personal field; an unmarked
    viewer must read the registry's empty value, not that."""
    a = alice_and_bob
    item = _row(db, owner_user, game, "items", title="Flask", status="fully collected",
                fields={"amount_collected": "9"})
    enemy = _row(db, owner_user, game, "enemies", title="Malenia", status="beaten")
    ending = _row(db, owner_user, game, "endings", title="Frenzied Flame", status="reached")
    stat = _row(db, owner_user, game, "stats_and_points", title="Vigor", fields={"my_value": "60"})
    # Somebody else's mark on every row, so "no mark" is the viewer's alone.
    for note, values in ((item, {"collected": "skip"}), (enemy, {"beaten": "cheesed"}),
                         (ending, {"completion": "skipped"}), (stat, {"my_value": "1"})):
        assert _mark(a.as_("bob"), note, **values).status_code == 200

    rows = _notes(a.as_("alice"), game)
    assert rows[str(item.system_id)]["status"] == "not collected"
    assert rows[str(item.system_id)]["fields"] is None
    assert rows[str(enemy.system_id)]["status"] == "to beat"
    assert rows[str(ending.system_id)]["status"] is None
    assert rows[str(stat.system_id)]["fields"] is None


def test_a_guest_reads_the_defaults(db, alice_and_bob, owner_user, game):
    a = alice_and_bob
    item = _row(db, owner_user, game, "items", title="Flask")
    enemy = _row(db, owner_user, game, "enemies", title="Malenia")
    assert _mark(a.as_("alice"), item, collected="collected", amount_collected="2").status_code == 200
    assert _mark(a.as_("alice"), enemy, beaten="beaten").status_code == 200

    rows = _notes(a.anonymous(), game)
    assert rows[str(item.system_id)]["status"] == "not collected"
    assert rows[str(item.system_id)]["fields"] is None
    assert rows[str(enemy.system_id)]["status"] == "to beat"
    # The mirror: alice still reads hers.
    assert _notes(a.as_("alice"), game)[str(enemy.system_id)]["status"] == "beaten"


# ---------------------------------------------------------------------------
# Granted values
# ---------------------------------------------------------------------------


@pytest.fixture
def featureless(accounts):
    """An account lacking self.personal_notes: the stub grants it no feature."""
    accounts.add("alice")
    accounts.add("nofeature", default_user_permissions() - {PERM_SELF_PERSONAL_NOTES})
    return accounts


def test_a_granted_value_is_absent_without_the_feature(db, featureless, owner_user, game, sample_anime):
    a = featureless
    mod = _row(db, owner_user, game, "mods_and_tools", title="Seamless Co-op", status="played")
    song = _row(db, owner_user, sample_anime, "op", title="紅蓮華", kind="normal", status="Need")
    lst = _row(db, owner_user, sample_anime, "music_status", kind="op", status="Need")
    assert _mark(a.as_("alice"), mod, status="常駐").status_code == 200
    assert _mark(a.as_("alice"), song, status="Pending").status_code == 200
    assert _mark(a.as_("alice"), lst, status="Done").status_code == 200

    without = _notes(a.as_("nofeature"), game)
    assert without[str(mod.system_id)]["status"] is None
    songs = _notes(a.as_("nofeature"), sample_anime, "anime")
    assert songs[str(song.system_id)]["status"] is None
    assert songs[str(lst.system_id)]["status"] is None

    # The mirror: the feature holder reads its own.
    assert _notes(a.as_("alice"), game)[str(mod.system_id)]["status"] == "常駐"
    songs = _notes(a.as_("alice"), sample_anime, "anime")
    assert songs[str(song.system_id)]["status"] == "Pending"
    assert songs[str(lst.system_id)]["status"] == "Done"


def test_the_sections_listing_drops_a_granted_value_without_the_feature(featureless):
    a = featureless

    def listing(c, owner_type):
        r = c.get("/api/notes/sections", params={"owner_type": owner_type})
        assert r.status_code == 200, r.text
        return {s["key"]: s for s in r.json()}

    without = listing(a.as_("nofeature"), "game")
    with_it = listing(a.as_("alice"), "game")
    assert "status" not in {f["key"] for f in without["mods_and_tools"]["fields"]}
    assert "status" in {f["key"] for f in with_it["mods_and_tools"]["fields"]}
    status = next(f for f in with_it["mods_and_tools"]["fields"] if f["key"] == "status")
    assert status["personal"] is True and status["granted"] == "mod_status"
    collected = next(f for f in without["items"]["fields"] if f["key"] == "collected")
    assert collected["personal"] is True and collected["granted"] is None

    op_without = listing(a.as_("nofeature"), "anime")["op"]
    op_with = listing(a.as_("alice"), "anime")["op"]
    assert op_without["statuses"] == [] and op_without["type_status_section"] is None
    assert op_with["statuses"] and op_with["type_status_section"] == "music_status"
    assert op_with["personal_status"] is True and op_with["status_granted"] == "music_status"


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------


def test_the_admin_may_not_mark(db, admin_client, admin_user, owner_user, game):
    """The admin holds no self.*: it keeps no personal data."""
    item = _row(db, owner_user, game, "items", title="Flask")
    r = _mark(admin_client, item, collected="collected")
    assert r.status_code == 401
    assert _stored(db, admin_user, item) is None


def test_a_granted_value_needs_its_feature(db, alice_and_bob, owner_user, game, monkeypatch):
    a = alice_and_bob
    mod = _row(db, owner_user, game, "mods_and_tools", title="Seamless Co-op")
    item = _row(db, owner_user, game, "items", title="Flask")
    real = features.has_feature
    monkeypatch.setattr(
        features, "has_feature",
        lambda db_, viewer, name: False if name == "mod_status" else real(db_, viewer, name),
    )

    refused = _mark(a.as_("alice"), mod, status="played")
    assert refused.status_code == 401
    assert "mod_status" in refused.json()["detail"]
    assert _stored(db, a.user("alice"), mod) is None
    # The mirror: the same account, an ungranted value.
    assert _mark(a.as_("alice"), item, collected="skip").status_code == 200
    # And with the feature back, the same write lands.
    monkeypatch.setattr(features, "has_feature", real)
    assert _mark(a.as_("alice"), mod, status="played").status_code == 200


@pytest.mark.parametrize("key", ["name", "amount_total", "ng_reset", "nonsense"])
def test_a_key_that_is_not_personal_on_the_section_is_refused(
    db, alice_and_bob, owner_user, game, key
):
    a = alice_and_bob
    item = _row(db, owner_user, game, "items", title="Flask")
    assert _mark(a.as_("alice"), item, **{key: "x"}).status_code == 422
    assert _stored(db, a.user("alice"), item) is None
    # "beaten" is personal - but on 敵人, not here.
    assert _mark(a.as_("alice"), item, beaten="beaten").status_code == 422
    assert _mark(a.as_("alice"), item, amount_collected="1").status_code == 200


def test_an_option_outside_the_vocabulary_is_refused(db, alice_and_bob, owner_user, game):
    a = alice_and_bob
    enemy = _row(db, owner_user, game, "enemies", title="Malenia")
    assert _mark(a.as_("alice"), enemy, beaten="defeated").status_code == 422
    assert _stored(db, a.user("alice"), enemy) is None
    assert _mark(a.as_("alice"), enemy, beaten="cheesed").status_code == 200


def test_a_note_on_an_owner_the_viewer_cannot_see_is_404(db, accounts, owner_user, game):
    accounts.add("alice")
    accounts.add("nogames", default_user_permissions() - {media_type_perm("game")})
    item = _row(db, owner_user, game, "items", title="Flask")
    # The read is refused first, so the write's 404 is the same answer.
    hidden = accounts.as_("nogames").get(
        "/api/notes", params={"owner_type": "game", "owner_id": str(game.system_id)}
    )
    assert hidden.status_code == 404
    assert _mark(accounts.as_("nogames"), item, collected="skip").status_code == 404
    assert _stored(db, accounts.user("nogames"), item) is None
    # The mirror: an account that sees games marks the same row.
    assert _mark(accounts.as_("alice"), item, collected="skip").status_code == 200


def test_clearing_every_value_deletes_the_mark(db, alice_and_bob, owner_user, game):
    a = alice_and_bob
    item = _row(db, owner_user, game, "items", title="Flask")
    assert _mark(a.as_("alice"), item, collected="skip", amount_collected="2").status_code == 200
    assert _mark(a.as_("alice"), item, collected=None).status_code == 200
    assert _stored(db, a.user("alice"), item) == {"amount_collected": "2"}
    r = _mark(a.as_("alice"), item, amount_collected="  ")
    assert r.status_code == 200
    assert _stored(db, a.user("alice"), item) is None
    assert r.json()["status"] == "not collected"


# ---------------------------------------------------------------------------
# NG reset
# ---------------------------------------------------------------------------


def test_ng_reset_clears_only_the_viewers_resettable_values(
    db, alice_and_bob, owner_user, game, other_game
):
    a = alice_and_bob
    resets = _row(db, owner_user, game, "items", title="Flask", fields={"ng_reset": "yes"})
    unset = _row(db, owner_user, game, "weapons_and_gear", title="Sword")
    kept = _row(db, owner_user, game, "collectibles", title="Key", fields={"ng_reset": "no"})
    enemy = _row(db, owner_user, game, "enemies", title="Malenia")
    stat = _row(db, owner_user, game, "stats_and_points", title="Vigor")
    elsewhere = _row(db, owner_user, other_game, "items", title="Gourd")
    alice = a.as_("alice")
    for note in (resets, unset, kept, elsewhere):
        assert _mark(alice, note, collected="collected", amount_collected="4").status_code == 200
    assert _mark(alice, enemy, beaten="beaten").status_code == 200
    assert _mark(alice, stat, my_value="40").status_code == 200
    assert _mark(a.as_("bob"), resets, collected="skip").status_code == 200
    assert _mark(a.as_("bob"), enemy, beaten="cheesed").status_code == 200

    r = a.as_("alice").post(
        "/api/notes/ng-reset", json={"owner_type": "game", "owner_id": str(game.system_id)}
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"cleared": 3}

    alice_user, bob_user = a.user("alice"), a.user("bob")
    assert _stored(db, alice_user, resets) is None
    assert _stored(db, alice_user, unset) is None
    assert _stored(db, alice_user, enemy) is None
    # ng_reset "no", a value the reset does not touch, another owner, another user.
    assert _stored(db, alice_user, kept) == {"collected": "collected", "amount_collected": "4"}
    assert _stored(db, alice_user, stat) == {"my_value": "40"}
    assert _stored(db, alice_user, elsewhere) == {"collected": "collected", "amount_collected": "4"}
    assert _stored(db, bob_user, resets) == {"collected": "skip"}
    assert _stored(db, bob_user, enemy) == {"beaten": "cheesed"}


def test_ng_reset_refusals(db, admin_client, accounts, owner_user, game):
    accounts.add("nogames", default_user_permissions() - {media_type_perm("game")})
    body = {"owner_type": "game", "owner_id": str(game.system_id)}
    assert admin_client.post("/api/notes/ng-reset", json=body).status_code == 401
    assert accounts.as_("nogames").post("/api/notes/ng-reset", json=body).status_code == 404


# ---------------------------------------------------------------------------
# Catalogue writes
# ---------------------------------------------------------------------------


def test_a_catalogue_write_ignores_personal_keys(db, super_client, super_user, game):
    r = super_client.post(
        "/api/notes",
        json={
            "owner_type": "game",
            "owner_id": str(game.system_id),
            "section": "items",
            "title": "Flask",
            "status": "fully collected",
            "fields": {"amount_total": "12", "amount_collected": "12"},
        },
    )
    assert r.status_code == 201, r.text
    note_id = r.json()["system_id"]
    db.expire_all()
    stored = db.get(models.Note, uuid.UUID(note_id))
    assert stored.status is None
    assert stored.fields == {"amount_total": "12"}
    assert db.query(models.NoteMark).count() == 0
    # The writer reads its own (empty) value, not what it sent.
    assert r.json()["status"] == "not collected"

    r = super_client.patch(f"/api/notes/{note_id}", json={"status": "skip", "title": "Flask+1"})
    assert r.status_code == 200, r.text
    db.expire_all()
    stored = db.get(models.Note, uuid.UUID(note_id))
    assert (stored.title, stored.status) == ("Flask+1", None)


def test_a_catalogue_row_carrying_only_a_personal_value_is_empty(super_client, game):
    r = super_client.post(
        "/api/notes",
        json={"owner_type": "game", "owner_id": str(game.system_id),
              "section": "endings", "status": "reached"},
    )
    assert r.status_code == 422


def test_a_music_status_row_is_written_without_a_status(db, super_client, sample_anime):
    db.query(models.Note).filter(models.Note.media_id == sample_anime.system_id).delete()
    r = super_client.post(
        "/api/notes",
        json={"owner_type": "anime", "owner_id": str(sample_anime.system_id),
              "section": "music_status", "kind": "op", "status": "Need"},
    )
    assert r.status_code == 201, r.text
    db.expire_all()
    assert db.get(models.Note, uuid.UUID(r.json()["system_id"])).status is None


# ---------------------------------------------------------------------------
# The review queue
# ---------------------------------------------------------------------------


def test_the_review_queue_lists_music_flagged_by_the_viewer_only(db, accounts, owner_user):
    perms = default_user_permissions() | {PERM_MANAGE_PIPELINES}
    accounts.add("alice", perms)
    accounts.add("bob", perms)
    anime = models.Anime(system_id=uuid.uuid4(), anime_name_en="Flagged")
    db.add(anime)
    db.flush()
    song = _row(db, owner_user, anime, "op", title="Opening", kind="normal")
    lst = _row(db, owner_user, anime, "music_status", kind="ed")
    assert _mark(accounts.as_("alice"), song, status="Need").status_code == 200
    assert _mark(accounts.as_("alice"), lst, status="Pending").status_code == 200
    assert _mark(accounts.as_("bob"), song, status="Done").status_code == 200

    def queue(name):
        r = accounts.as_(name).get("/api/data-control/check/music")
        assert r.status_code == 200, r.text
        return r.json()

    (row,) = queue("alice")
    assert row["system_id"] == str(anime.system_id)
    assert row["lists"] == [{"kind": "ed", "status": "Pending"}]
    assert row["songs"] == [
        {"section": "op", "title": "Opening", "status": "Need", "locator": None}
    ]
    # The mirror: bob's own status is Done, so the same anime is not his.
    assert queue("bob") == []
