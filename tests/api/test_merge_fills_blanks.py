"""
Every merge fills the survivor's blank columns from the record merged into
it, and never overwrites what the survivor already holds.

The picture is the one column that is more than a copy: a downloaded one is
stored under the loser's id, so it is renamed onto the survivor's.
"""

import uuid

import pytest

from app import models
from app.services.integrations import image_manager


@pytest.fixture
def cover_dir(tmp_path, monkeypatch):
    """Image storage in a scratch folder, so a rename touches no real file."""
    monkeypatch.setattr(image_manager, "COVER_DIR", str(tmp_path))
    return tmp_path


def _add(db_session, row):
    db_session.add(row)
    db_session.commit()
    return row


def _merge(admin_client, path, keep, drop):
    r = admin_client.post(
        f"/api/{path}/{keep.system_id}/merge",
        json={"source_id": str(drop.system_id)},
    )
    assert r.status_code == 200, r.text
    return r


def test_a_character_merge_fills_the_blanks_and_keeps_the_rest(
    admin_client, db_session
):
    keep = _add(
        db_session,
        models.Character(system_id=uuid.uuid4(), name_cn="一花", remark="mine"),
    )
    drop = _add(
        db_session,
        models.Character(
            system_id=uuid.uuid4(),
            name_en="Ichika",
            name_cn="一華",
            remark="theirs",
            gender="女",
            mal_id=42,
        ),
    )
    _merge(admin_client, "character", keep, drop)

    db_session.expire_all()
    merged = db_session.get(models.Character, keep.system_id)
    assert (merged.name_en, merged.gender, merged.mal_id) == ("Ichika", "女", 42)
    assert (merged.name_cn, merged.remark) == ("一花", "mine")


def test_a_person_merge_fills_the_blanks(admin_client, db_session):
    keep = _add(db_session, models.Person(system_id=uuid.uuid4(), name_cn="花澤香菜"))
    drop = _add(
        db_session,
        models.Person(
            system_id=uuid.uuid4(), name_en="Kana Hanazawa", name_jp="花澤香菜"
        ),
    )
    _merge(admin_client, "person", keep, drop)

    db_session.expire_all()
    merged = db_session.get(models.Person, keep.system_id)
    assert (merged.name_en, merged.name_jp) == ("Kana Hanazawa", "花澤香菜")


def test_a_studio_merge_fills_the_blanks(admin_client, db_session):
    keep = _add(db_session, models.Studio(system_id=uuid.uuid4(), name_en="Kyoto Animation"))
    drop = _add(
        db_session,
        models.Studio(system_id=uuid.uuid4(), name_jp="京都アニメーション", country="JP"),
    )
    _merge(admin_client, "studio", keep, drop)

    db_session.expire_all()
    merged = db_session.get(models.Studio, keep.system_id)
    assert (merged.name_en, merged.name_jp, merged.country) == (
        "Kyoto Animation",
        "京都アニメーション",
        "JP",
    )


def test_a_publisher_merge_fills_the_blanks(admin_client, db_session):
    keep = _add(db_session, models.Publisher(system_id=uuid.uuid4(), name_en="Kadokawa"))
    drop = _add(
        db_session,
        models.Publisher(
            system_id=uuid.uuid4(), name_jp="KADOKAWA", website_url="https://k.test"
        ),
    )
    _merge(admin_client, "publisher", keep, drop)

    db_session.expire_all()
    merged = db_session.get(models.Publisher, keep.system_id)
    assert (merged.name_jp, merged.website_url) == ("KADOKAWA", "https://k.test")


def test_a_downloaded_photo_is_renamed_onto_the_survivor(
    admin_client, db_session, cover_dir
):
    keep = _add(db_session, models.Character(system_id=uuid.uuid4(), name_en="A"))
    drop_id = uuid.uuid4()
    old = image_manager.cover_key("character", str(drop_id))
    (cover_dir / "character").mkdir()
    (cover_dir / "character" / f"{drop_id}.jpg").write_bytes(b"jpeg")
    drop = _add(
        db_session,
        models.Character(
            system_id=drop_id, name_en="B", photo_file=old, photo_focus="10 90"
        ),
    )
    _merge(admin_client, "character", keep, drop)

    new = image_manager.cover_key("character", str(keep.system_id))
    db_session.expire_all()
    merged = db_session.get(models.Character, keep.system_id)
    assert (merged.photo_file, merged.photo_focus) == (new, "10 90")
    assert (cover_dir / "character" / f"{keep.system_id}.jpg").read_bytes() == b"jpeg"
    assert not (cover_dir / "character" / f"{drop_id}.jpg").exists()


def test_an_uploaded_logo_is_shared_not_renamed(admin_client, db_session, cover_dir):
    keep = _add(db_session, models.Studio(system_id=uuid.uuid4(), name_en="A"))
    drop = _add(
        db_session,
        models.Studio(system_id=uuid.uuid4(), name_en="B", logo_file="library/abc.jpg"),
    )
    _merge(admin_client, "studio", keep, drop)

    db_session.expire_all()
    assert db_session.get(models.Studio, keep.system_id).logo_file == "library/abc.jpg"


def test_the_survivors_own_photo_is_kept(admin_client, db_session, cover_dir):
    keep = _add(
        db_session,
        models.Person(system_id=uuid.uuid4(), name_en="A", photo_file="library/mine.jpg"),
    )
    drop = _add(
        db_session,
        models.Person(
            system_id=uuid.uuid4(),
            name_en="B",
            photo_file="library/theirs.jpg",
            photo_focus="10 90",
        ),
    )
    _merge(admin_client, "person", keep, drop)

    db_session.expire_all()
    merged = db_session.get(models.Person, keep.system_id)
    assert (merged.photo_file, merged.photo_focus) == ("library/mine.jpg", None)


def test_a_casting_both_hold_fills_from_the_losers(admin_client, db_session, anime):
    keep = _add(db_session, models.Character(system_id=uuid.uuid4(), name_en="A"))
    drop = _add(db_session, models.Character(system_id=uuid.uuid4(), name_en="B"))
    for character, role, remark in ((keep, None, None), (drop, "Main", "child")):
        db_session.add(
            models.CharacterCasting(
                character_id=character.system_id,
                media_type="anime",
                entry_id=anime.system_id,
                role=role,
                remark=remark,
            )
        )
    db_session.commit()
    _merge(admin_client, "character", keep, drop)

    db_session.expire_all()
    casting = (
        db_session.query(models.CharacterCasting)
        .filter_by(character_id=keep.system_id)
        .one()
    )
    assert (casting.role, casting.remark) == ("Main", "child")


def test_filling_the_losers_own_names_is_not_a_clash(admin_client, db_session):
    # The survivor ends with exactly the loser's names; the loser is gone by
    # then, so uq_person_name has nothing to collide with.
    keep = _add(db_session, models.Person(system_id=uuid.uuid4(), name_en="A"))
    drop = _add(
        db_session, models.Person(system_id=uuid.uuid4(), name_en="A", name_cn="B")
    )
    _merge(admin_client, "person", keep, drop)

    db_session.expire_all()
    merged = db_session.get(models.Person, keep.system_id)
    assert (merged.name_en, merged.name_cn) == ("A", "B")


def test_filling_a_third_records_names_is_a_409_that_changes_nothing(
    admin_client, db_session
):
    _add(db_session, models.Person(system_id=uuid.uuid4(), name_en="A", name_cn="B"))
    keep = _add(db_session, models.Person(system_id=uuid.uuid4(), name_en="A"))
    drop = _add(db_session, models.Person(system_id=uuid.uuid4(), name_cn="B"))
    r = admin_client.post(
        f"/api/person/{keep.system_id}/merge", json={"source_id": str(drop.system_id)}
    )
    assert r.status_code == 409

    db_session.expire_all()
    assert db_session.get(models.Person, drop.system_id) is not None
    assert db_session.get(models.Person, keep.system_id).name_cn is None
