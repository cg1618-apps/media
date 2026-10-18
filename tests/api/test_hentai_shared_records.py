"""
Everything connected only to hentai is hidden from a session that cannot see
the type, and what hentai shares with other types stays where they need it.

  studio, director   shared with mainstream anime: a studio credited only on
                     hentai is hidden with it, one also credited on an anime
                     stays visible through that
  author             shared with h-comic (and the mainstream reading types):
                     an author credited only on hentai is hidden with it, and
                     one who also wrote the h-comic it adapts is seen, with
                     the h-comic credit alone, by a session seeing h-comic
  H Genre            shared with h-comic: the categories serve gated types
                     only, so they hide from a session that sees neither
  /api/constants     a vocabulary hentai shares with h-comic is served while
                     either type is seeable; hentai's own only with hentai

Each refusal has the `hentai` label present - the entries are created through
the API, which stamps it - and is paired with `admin_client`, sitting in
`unrestricted`, reading the same record back. The partial session - a mode
that sees h-comic and not hentai - is `unrestricted` with the `hentai` label
denied, so both labels exist and one of them is hidden.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import credits as credits_service
from app.services.domain.content_labels import label_keys_for_entry
from app.services.security import get_password_hash
from app.utils import constants as c
from tests.api.conftest import role_id_for


def _hentai(admin_client, db_session, name="Zvornik Shared Hentai"):
    body = admin_client.post("/api/hentai/", json={"hentai_name_cn": name}).json()
    entry_id = uuid.UUID(body["system_id"])
    assert label_keys_for_entry(db_session, entry_id) == ["hentai"]
    return entry_id


@pytest.fixture
def hentai_id(admin_client, db_session):
    return _hentai(admin_client, db_session)


@pytest.fixture
def h_comic_only(mode_client, db_session):
    """A signed-in session that sees h-comic but not hentai (nor h-game)."""
    user = models.User(
        id=uuid.uuid4(),
        username="hentai_partial",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db_session, "user"),
    )
    db_session.add(user)
    db_session.flush()
    for key in ("h-comic", "hentai"):
        assert db_session.query(models.ContentLabel).filter_by(key=key).count() == 1
    return mode_client("unrestricted", user=user, denials=("hentai", "h-game"))


# ---------------------------------------------------------------------------
# Studio, director and author
# ---------------------------------------------------------------------------


def test_a_studio_credited_only_on_hentai_is_hidden(
    client, admin_client, db_session, hentai_id
):
    credits_service.replace_credits(
        db_session, "hentai", hentai_id, "studio", ["Zvornik Hentai Studio"]
    )
    studio = credits_service.find_studio(db_session, "Zvornik Hentai Studio")
    assert client.get(f"/api/studio/{studio.system_id}").status_code == 404
    assert admin_client.get(f"/api/studio/{studio.system_id}").status_code == 200


def test_a_studio_also_on_an_anime_stays_visible(
    client, db_session, hentai_id, sample_anime
):
    credits_service.replace_credits(
        db_session, "hentai", hentai_id, "studio", ["Zvornik Crossover Studio"]
    )
    credits_service.replace_credits(
        db_session, "anime", sample_anime.system_id, "studio", ["Zvornik Crossover Studio"]
    )
    studio = credits_service.find_studio(db_session, "Zvornik Crossover Studio")
    assert client.get(f"/api/studio/{studio.system_id}").status_code == 200


def test_a_director_credited_only_on_hentai_is_hidden(
    client, admin_client, db_session, hentai_id
):
    credits_service.replace_credits(
        db_session, "hentai", hentai_id, "director", ["Zvornik Hentai Director"]
    )
    person = credits_service.find_person(db_session, "Zvornik Hentai Director")
    assert client.get(f"/api/person/{person.system_id}").status_code == 404
    assert admin_client.get(f"/api/person/{person.system_id}").status_code == 200


def _ids(response) -> set[str]:
    assert response.status_code == 200, response.text
    return {row["system_id"] for row in response.json()}


def test_an_author_credited_only_on_hentai_is_hidden(
    client, admin_client, h_comic_only, db_session, hentai_id
):
    credits_service.replace_credits(
        db_session, "hentai", hentai_id, "author", ["Zvornik Hentai Author"]
    )
    person = credits_service.find_person(db_session, "Zvornik Hentai Author")
    # The person is really there, credited on a labelled entry.
    assert credits_service.credit_names(db_session, hentai_id, "author") == [
        "Zvornik Hentai Author"
    ]

    for narrow in (client, h_comic_only):
        assert narrow.get(f"/api/person/{person.system_id}").status_code == 404
        assert narrow.get(f"/api/person/{person.system_id}/entries").status_code == 404
        assert str(person.system_id) not in _ids(narrow.get("/api/person/"))

    assert admin_client.get(f"/api/person/{person.system_id}").status_code == 200
    assert str(person.system_id) in _ids(admin_client.get("/api/person/"))
    groups = admin_client.get(f"/api/person/{person.system_id}/entries").json()["groups"]
    assert [(g["media_type"], g["role"], g["label"]) for g in groups] == [
        ("hentai", "author", "Author")
    ]
    assert [e["system_id"] for e in groups[0]["entries"]] == [str(hentai_id)]


def test_the_h_comic_author_credited_on_its_hentai_lists_both(
    admin_client, h_comic_only, db_session, hentai_id
):
    """One person, the h-comic's author and the hentai's. A session seeing
    both types sees both credits on the person's page; one seeing h-comic
    alone sees the person through the h-comic, and the hentai not at all."""
    body = admin_client.post(
        "/api/h-comic/", json={"h_comic_name_cn": "Zvornik Source H-Comic", "region": "KR"}
    ).json()
    h_comic_id = uuid.UUID(body["system_id"])
    for media_type, entry_id in (("h-comic", h_comic_id), ("hentai", hentai_id)):
        credits_service.replace_credits(
            db_session, media_type, entry_id, "author", ["Zvornik Shared Author"]
        )
    person = credits_service.find_person(db_session, "Zvornik Shared Author")

    def groups(cl):
        response = cl.get(f"/api/person/{person.system_id}/entries")
        assert response.status_code == 200, response.text
        return {
            (g["media_type"], g["role"]): [e["system_id"] for e in g["entries"]]
            for g in response.json()["groups"]
        }

    assert groups(admin_client) == {
        ("h-comic", "author"): [str(h_comic_id)],
        ("hentai", "author"): [str(hentai_id)],
    }
    assert groups(h_comic_only) == {("h-comic", "author"): [str(h_comic_id)]}
    roles = h_comic_only.get(f"/api/person/{person.system_id}").json()["roles"]
    assert {(r["role"], r["scope"]) for r in roles} == {("author", "h-comic")}


def test_studio_director_and_author_reach_hentai_and_nothing_hentai_only_is_new():
    from app.utils.credit_roles import CREDIT_ROLES, TAG_FIELDS

    assert "hentai" in CREDIT_ROLES["studio"].media_types
    assert "hentai" in CREDIT_ROLES["director"].media_types
    assert "hentai" in CREDIT_ROLES["author"].media_types
    for key in ("h_genre_plot", "h_genre_appearance", "h_genre_relation"):
        assert TAG_FIELDS[key].media_types == ("h-comic", "h-game", "hentai")
    # No role and no vocabulary exists for hentai alone.
    assert not [r for r in CREDIT_ROLES.values() if r.media_types == ("hentai",)]
    assert not [f for f in TAG_FIELDS.values() if f.media_types == ("hentai",)]


# ---------------------------------------------------------------------------
# H Genre, shared with h-comic
# ---------------------------------------------------------------------------


def test_an_h_genre_value_used_only_by_hentai_is_hidden(
    client, admin_client, db_session, hentai_id
):
    credits_service.replace_tags(db_session, hentai_id, "h_genre_plot", ["Zvornik HPlot"])
    db_session.flush()

    def values(cl):
        return {row["value"] for row in cl.get("/api/options/H Genre Plot").json()}

    assert "Zvornik HPlot" not in values(client)
    assert "Zvornik HPlot" in values(admin_client)


def test_the_h_genre_categories_are_gated_by_both_types():
    from app.services.rbac.gated_types import gated_tag_categories, hidden_option_categories

    served = gated_tag_categories()
    for category in ("H Genre Plot", "H Genre Appearance", "H Genre Relation"):
        assert served[category] == frozenset({"h-comic", "h-game", "hentai"})
    # Hidden only when every type it serves is.
    assert "H Genre Plot" not in hidden_option_categories(frozenset({"hentai", "h-game"}))
    assert "H Genre Plot" in hidden_option_categories(frozenset({"hentai", "h-comic", "h-game"}))


# ---------------------------------------------------------------------------
# /api/constants
# ---------------------------------------------------------------------------


def test_unrestricted_is_served_the_hentai_vocabularies(admin_client):
    body = admin_client.get("/api/constants").json()
    assert body["hentai_source_material"] == list(c.HENTAI_SOURCE_MATERIALS)
    assert "Hentai" in body["franchise_type"]
    assert "hentai" in body["media_type"]


def test_a_session_that_sees_neither_gated_type_is_told_of_neither(client, db_session):
    assert db_session.query(models.ContentLabel).filter_by(key="hentai").count() == 1
    body = client.get("/api/constants").json()
    for key in ("hentai_source_material", "h_comic_originality", "h_comic_usefulness"):
        assert key not in body, key
    assert "Hentai" not in body["franchise_type"]
    assert "hentai" not in body["media_type"]
    # Studio and director serve mainstream types too: never narrowed.
    assert {"director"} <= set(body["person_role"])


def test_a_session_that_sees_h_comic_only_keeps_the_shared_vocabularies(h_comic_only):
    body = h_comic_only.get("/api/constants").json()
    # hentai's own is withheld, and so are its franchise type and key.
    assert "hentai_source_material" not in body
    assert "Hentai" not in body["franchise_type"]
    assert "hentai" not in body["media_type"]
    # What it shares with h-comic is not.
    assert body["h_comic_originality"] == list(c.H_COMIC_ORIGINALITY)
    assert body["h_comic_usefulness"] == list(c.H_COMIC_USEFULNESS)
    assert "H-Comic" in body["franchise_type"]
    assert "H Genre Plot" in body["option_categories"]


def test_me_names_only_h_comic_to_that_session(h_comic_only):
    assert h_comic_only.get("/api/auth/me").json()["visible_gated_types"] == ["h-comic"]
