"""The startup copy of a renamed owner type's cover folder (novel -> book).

A copy, not a move: the old folder stays whole, so code from before the rename
still finds every cover after a rollback.
"""

import os

from app.services.integrations.image_manager import (
    LEGACY_COVER_FOLDERS,
    THUMB_FOLDER,
    copy_legacy_cover_folders,
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


def test_covers_and_thumbnails_are_copied_and_the_old_folders_stay(tmp_path):
    root = str(tmp_path)
    _write(os.path.join(root, "novel", "a.jpg"), b"cover a")
    _write(os.path.join(root, THUMB_FOLDER, "novel", "a.jpg"), b"thumb a")
    os.utime(os.path.join(root, THUMB_FOLDER, "novel", "a.jpg"), ns=(1, 1_234_567_800))

    result = copy_legacy_cover_folders(root)

    assert result == {"copied": 2, "present": 0}
    assert _read(os.path.join(root, "book", "a.jpg")) == b"cover a"
    thumb = os.path.join(root, THUMB_FOLDER, "book", "a.jpg")
    assert _read(thumb) == b"thumb a"
    # The thumbnail cache compares mtimes exactly; the copy keeps them.
    assert os.stat(thumb).st_mtime_ns == 1_234_567_800
    # A rollback's code reads the old folder, so it is left whole.
    assert _read(os.path.join(root, "novel", "a.jpg")) == b"cover a"
    assert _read(os.path.join(root, THUMB_FOLDER, "novel", "a.jpg")) == b"thumb a"


def test_it_is_idempotent(tmp_path):
    root = str(tmp_path)
    _write(os.path.join(root, "novel", "a.jpg"), b"cover a")
    copy_legacy_cover_folders(root)

    assert copy_legacy_cover_folders(root) == {"copied": 0, "present": 1}
    assert _read(os.path.join(root, "book", "a.jpg")) == b"cover a"


def test_nothing_to_copy_is_a_no_op(tmp_path):
    assert copy_legacy_cover_folders(str(tmp_path)) == {"copied": 0, "present": 0}
    assert os.listdir(tmp_path) == []


def test_it_never_overwrites_a_file_the_new_folder_holds(tmp_path):
    """A cover saved under book/ after the deploy is newer than the old
    folder's, so it wins."""
    root = str(tmp_path)
    _write(os.path.join(root, "novel", "a.jpg"), b"old a")
    _write(os.path.join(root, "novel", "b.jpg"), b"old b")
    _write(os.path.join(root, "book", "a.jpg"), b"new a")

    result = copy_legacy_cover_folders(root)

    assert result == {"copied": 1, "present": 1}
    assert _read(os.path.join(root, "book", "a.jpg")) == b"new a"
    assert _read(os.path.join(root, "book", "b.jpg")) == b"old b"
    assert sorted(os.listdir(os.path.join(root, "novel"))) == ["a.jpg", "b.jpg"]
