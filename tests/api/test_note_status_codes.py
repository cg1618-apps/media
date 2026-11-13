"""Decision 13: two answers, and 403 disappears from note.py.

    401  you may not do this KIND of thing - a capability failure, matching
         what require_permission already returns and the one error shape the
         SPA knows.
    404  this OBJECT is not yours to see - the same not-found message a
         genuinely absent row gets, because a 403 confirms the row exists
         exactly as surely as a 200 does.

One deliberate divergence from the spec's line list, recorded in the plan:
line 198, "Editing a catalogue note requires the manage.catalog permission",
is a CAPABILITY failure and answers 401. The spec assigned it 404, which
contradicts decision 13's own rule - the caller is being told they may not
edit catalogue notes at all, which is not a fact about this note.
"""

import inspect
import uuid

import pytest

from app import models
from app.services.rbac.seed import default_user_permissions
from tests.api.conftest import make_viewer

PERSONAL = "personal_reviews"
CATALOGUE = "public_reviews"


@pytest.fixture
def note_by(db_session, sample_anime):
    """One note on the sample entry, authored by whoever is passed in."""

    def _make(user, section=PERSONAL):
        row = models.Note(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            section=section,
            content="Something already written.",
            sort_index=0,
            author_id=user.id if user else None,
        )
        db_session.add(row)
        db_session.flush()
        return row

    return _make


def _payload(entry, section):
    return {
        "owner_type": "anime",
        "owner_id": str(entry.system_id),
        "section": section,
        "content": "x",
    }


def test_writing_a_personal_note_without_the_permission_is_401(
    db_session, client, sample_anime
):
    """A capability failure: this account may not write personal notes at
    all, which is not a fact about this entry."""
    c = make_viewer(db_session, client, "nonotes", {"media_type.anime"})
    response = c.post("/api/notes", json=_payload(sample_anime, PERSONAL))
    assert response.status_code == 401


def test_writing_a_catalogue_note_without_manage_catalog_is_401(
    user_client, sample_anime
):
    response = user_client.post("/api/notes", json=_payload(sample_anime, CATALOGUE))
    assert response.status_code == 401


def test_editing_someone_elses_personal_note_is_404(
    db_session, client, admin_user, note_by
):
    """404, not 403: a 403 confirms the note exists as surely as a 200 does,
    which is the argument Phase C spent nine commits on."""
    note = note_by(admin_user)
    c = make_viewer(db_session, client, "othernotes", default_user_permissions())

    response = c.patch(f"/api/notes/{note.system_id}", json={"content": "mine now"})

    assert response.status_code == 404


def test_that_refusal_is_worded_exactly_like_a_missing_note(
    db_session, client, admin_user, note_by
):
    """Indistinguishability is the property, so the message has to match too."""
    note = note_by(admin_user)
    c = make_viewer(db_session, client, "othernotes2", default_user_permissions())

    hidden = c.patch(f"/api/notes/{note.system_id}", json={"content": "x"})
    missing = c.patch(
        f"/api/notes/{uuid.uuid4()}", json={"content": "x"}
    )

    assert hidden.status_code == missing.status_code == 404
    assert hidden.json()["detail"] == missing.json()["detail"]


def test_editing_a_catalogue_note_without_manage_catalog_is_401(
    db_session, client, admin_user, note_by
):
    """A CAPABILITY failure, so 401 - this is the correction to decision 13's
    line list. The caller may not edit catalogue notes at all; refusing with
    404 would claim the note does not exist, which is a different and false
    statement."""
    note = note_by(admin_user, section=CATALOGUE)
    c = make_viewer(db_session, client, "nocatalogue", default_user_permissions())

    response = c.patch(f"/api/notes/{note.system_id}", json={"content": "x"})

    assert response.status_code == 401


def test_naming_an_author_reveals_nothing_about_accounts(
    user_client, admin_user, sample_anime
):
    """There is no way to read another account's notes, so `author` is not a
    parameter: an existing username and a made-up one get the same answer as
    no name at all, and none of them is an oracle."""
    def notes(**extra):
        return user_client.get(
            "/api/notes",
            params={
                "owner_type": "anime",
                "owner_id": str(sample_anime.system_id),
                **extra,
            },
        )

    plain = notes()
    existing = notes(author=admin_user.username)
    absent = notes(author="nobody-by-this-name")

    assert plain.status_code == existing.status_code == absent.status_code == 200
    assert plain.json() == existing.json() == absent.json()


def test_no_403_is_reachable_from_this_router():
    """The property, asserted directly, so a future 'clearer' 403 fails here
    rather than quietly reintroducing an oracle."""
    import app.routers.note as note_module

    assert "status_code=403" not in inspect.getsource(note_module)
