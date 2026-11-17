"""The startup move of a renamed owner type's cover folder (novel -> book)."""

import logging
import os

from app.services.integrations.image_manager import (
    LEGACY_COVER_FOLDERS,
    THUMB_FOLDER,
    move_legacy_cover_folders,
)


def _write(path, content: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)


def _read(path) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def test_the_rename_is_novel_to_book():
    assert LEGACY_COVER_FOLDERS == {"novel": "book"}


def test_covers_and_thumbnails_move_and_the_old_folders_go(tmp_path):
    root = str(tmp_path)
    _write(os.path.join(root, "novel", "a.jpg"), b"cover a")
    _write(os.path.join(root, THUMB_FOLDER, "novel", "a.jpg"), b"thumb a")
    os.utime(os.path.join(root, THUMB_FOLDER, "novel", "a.jpg"), ns=(1, 1_234_567_800))

    result = move_legacy_cover_folders(root)

    assert result == {"moved": 2, "kept": 0}
    assert _read(os.path.join(root, "book", "a.jpg")) == b"cover a"
    thumb = os.path.join(root, THUMB_FOLDER, "book", "a.jpg")
    assert _read(thumb) == b"thumb a"
    # The thumbnail cache compares mtimes exactly; the move keeps them.
    assert os.stat(thumb).st_mtime_ns == 1_234_567_800
    assert not os.path.exists(os.path.join(root, "novel"))
    assert not os.path.exists(os.path.join(root, THUMB_FOLDER, "novel"))


def test_it_is_idempotent(tmp_path):
    root = str(tmp_path)
    _write(os.path.join(root, "novel", "a.jpg"), b"cover a")
    move_legacy_cover_folders(root)

    assert move_legacy_cover_folders(root) == {"moved": 0, "kept": 0}
    assert _read(os.path.join(root, "book", "a.jpg")) == b"cover a"


def test_nothing_to_move_is_a_no_op(tmp_path):
    assert move_legacy_cover_folders(str(tmp_path)) == {"moved": 0, "kept": 0}
    assert os.listdir(tmp_path) == []


def test_it_never_overwrites_and_keeps_the_old_file(tmp_path, caplog):
    root = str(tmp_path)
    _write(os.path.join(root, "novel", "a.jpg"), b"old a")
    _write(os.path.join(root, "novel", "b.jpg"), b"old b")
    _write(os.path.join(root, "book", "a.jpg"), b"new a")

    with caplog.at_level(logging.WARNING):
        result = move_legacy_cover_folders(root)

    assert result == {"moved": 1, "kept": 1}
    assert _read(os.path.join(root, "book", "a.jpg")) == b"new a"
    assert _read(os.path.join(root, "novel", "a.jpg")) == b"old a"
    assert _read(os.path.join(root, "book", "b.jpg")) == b"old b"
    # The folder still holds a file, so it stays.
    assert os.listdir(os.path.join(root, "novel")) == ["a.jpg"]
    assert any("was not moved" in r.getMessage() for r in caplog.records)
