"""
PUT runs the type's write hook - the single-entry Replace - after the update
commits, unless the request says ?replace=false. Modify's "Save" sends that,
so an edit is saved without the external sources rewriting it; "Save & Replace"
and Enter leave it out.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import pytest

from app.registry import MEDIA_REGISTRY


@pytest.fixture
def counting_movie_hook():
    spec = MEDIA_REGISTRY["movie"]
    original = spec.write_hook
    calls = []

    async def count(db, entry_id, action_type="Auto", log_action=False):
        calls.append(entry_id)

    # MediaTypeSpec is frozen; the router holds the same object, so this is
    # the one way to swap the hook for the duration of a test.
    object.__setattr__(spec, "write_hook", count)
    yield calls
    object.__setattr__(spec, "write_hook", original)


def _movie(owner_client, calls):
    created = owner_client.post("/api/movies/", json={"movie_name_en": "Heat"}).json()
    calls.clear()  # the create ran the hook too; only the update is measured
    return created["system_id"]


def test_update_runs_the_write_hook_by_default(owner_client, counting_movie_hook):
    system_id = _movie(owner_client, counting_movie_hook)
    response = owner_client.put(
        f"/api/movies/{system_id}", json={"movie_name_en": "Heat (1995)"}
    )
    assert response.status_code == 200, response.text
    assert counting_movie_hook == [system_id]


def test_update_with_replace_false_saves_without_the_hook(owner_client, counting_movie_hook):
    system_id = _movie(owner_client, counting_movie_hook)
    response = owner_client.put(
        f"/api/movies/{system_id}?replace=false", json={"movie_name_en": "Heat (1995)"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["movie_name_en"] == "Heat (1995)"
    assert counting_movie_hook == []
