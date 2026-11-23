"""
PUT runs the type's write hook - the single-entry Replace - after the update
commits, unless the request says ?replace=false. Modify's "Save" sends that,
so an edit is saved without the external sources rewriting it; "Save & Replace"
and Enter leave it out.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import pytest

from app.registry import MEDIA_REGISTRY

# (registry key, list path, name column). Game saves from Modify by PUT, so
# its "Save" opts out the same way - and nothing else then runs: game's write
# hook is its whole save-time Replace (IGDB, then Steam), and no Fill follows.
TYPES = [
    ("movie", "/api/movies", "movie_name_en"),
    ("game", "/api/game", "game_name_en"),
]


@pytest.fixture(params=TYPES, ids=[t[0] for t in TYPES])
def counting_hook(request):
    key, path, name = request.param
    spec = MEDIA_REGISTRY[key]
    original = spec.write_hook
    calls = []

    async def count(db, entry_id, action_type="Auto", log_action=False):
        calls.append(entry_id)

    # MediaTypeSpec is frozen; the router holds the same object, so this is
    # the one way to swap the hook for the duration of a test.
    object.__setattr__(spec, "write_hook", count)
    yield path, name, calls
    object.__setattr__(spec, "write_hook", original)


def _entry(owner_client, path, name, calls):
    created = owner_client.post(f"{path}/", json={name: "Heat"})
    assert created.status_code in (200, 201), created.text
    calls.clear()  # the create ran the hook too; only the update is measured
    return created.json()["system_id"]


def test_update_runs_the_write_hook_by_default(owner_client, counting_hook):
    path, name, calls = counting_hook
    system_id = _entry(owner_client, path, name, calls)
    response = owner_client.put(f"{path}/{system_id}", json={name: "Heat (1995)"})
    assert response.status_code == 200, response.text
    assert calls == [system_id]


def test_update_with_replace_false_saves_without_the_hook(owner_client, counting_hook):
    path, name, calls = counting_hook
    system_id = _entry(owner_client, path, name, calls)
    response = owner_client.put(
        f"{path}/{system_id}?replace=false", json={name: "Heat (1995)"}
    )
    assert response.status_code == 200, response.text
    assert response.json()[name] == "Heat (1995)"
    assert calls == []
