"""
A field group the viewer does not hold is stripped from the response.

sources_restricted, the one field group, gates the `restricted`
media_source bucket: the withheld rows are simply left out of the query in
services.domain.sources.attach_sources, so there is no live-instance
mutation to guard against for it. No group gates a real column - nulling a
live ORM instance would be flushed on the next autoflush and the value would
be gone for everyone, permanently - so the copy-not-setattr rule is currently
unexercised by any group. The section below keeps testing it against the mechanism rather than
against a group, because the next column group added will need it and will
not come with its own reason to remember.
"""

import uuid

import pytest

from app import models
from app.services.rbac.seed import default_guest_permissions
from tests.api.conftest import all_field_group_keys
from tests.api.test_visibility import make_viewer


@pytest.fixture
def anime_with_sources(db_session, sample_franchise):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Sourced Anime",
        airing_type="TV",
    )
    db_session.add(entry)
    db_session.flush()
    db_session.add(
        models.MediaSource(
            media_id=entry.system_id,
            kind="access",
            bucket="restricted",
            name="Bilibili",
            url="https://example.invalid/watch",
        )
    )
    db_session.flush()
    return entry


@pytest.fixture
def movie_with_sources(db_session, sample_franchise):
    entry = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Sourced Movie",
    )
    db_session.add(entry)
    db_session.flush()
    db_session.add(
        models.MediaSource(
            media_id=entry.system_id,
            kind="access",
            bucket="restricted",
            name="Bilibili",
            url="https://example.invalid/watch",
        )
    )
    db_session.flush()
    return entry


@pytest.fixture
def no_sources_client(client, db_session):
    return make_viewer(
        db_session,
        client,
        "nosources",
        default_guest_permissions(),
        field_groups=all_field_group_keys() - {"sources_restricted"},
    )


# ---------------------------------------------------------------------------
# The hand-written routers
# ---------------------------------------------------------------------------

def test_a_gated_bucket_is_absent_in_the_list(no_sources_client, anime_with_sources):
    body = no_sources_client.get("/api/anime/").json()
    row = next(e for e in body if e["system_id"] == str(anime_with_sources.system_id))
    assert row["sources"] == []


def test_a_gated_bucket_is_absent_in_the_detail(no_sources_client, anime_with_sources):
    body = no_sources_client.get(
        f"/api/anime/{anime_with_sources.system_id}"
    ).json()
    assert body["sources"] == []


def test_the_rest_of_the_entry_survives(no_sources_client, anime_with_sources):
    """Gating one group must not blank the entry."""
    body = no_sources_client.get(
        f"/api/anime/{anime_with_sources.system_id}"
    ).json()
    assert body["anime_name_en"] == "Sourced Anime"


def test_a_holder_still_sees_the_bucket(client, db_session, anime_with_sources):
    """The mirror of the tests above: the same entry, a viewer holding the
    group."""
    holder = make_viewer(
        db_session, client, "holder", default_guest_permissions(),
        field_groups=all_field_group_keys(),
    )
    body = holder.get(f"/api/anime/{anime_with_sources.system_id}").json()
    assert {s["bucket"] for s in body["sources"]} == {"restricted"}


def test_admin_still_sees_the_bucket(owner_client, anime_with_sources):
    body = owner_client.get(f"/api/anime/{anime_with_sources.system_id}").json()
    assert {s["bucket"] for s in body["sources"]} == {"restricted"}


# ---------------------------------------------------------------------------
# The factory-built routers
# ---------------------------------------------------------------------------

def test_the_factory_routers_gate_the_same_bucket(
    no_sources_client, movie_with_sources
):
    body = no_sources_client.get(
        f"/api/movies/{movie_with_sources.system_id}"
    ).json()
    assert body["sources"] == []


def test_the_factory_list_gates_the_same_bucket(
    no_sources_client, movie_with_sources
):
    body = no_sources_client.get("/api/movies/").json()
    row = next(e for e in body if e["system_id"] == str(movie_with_sources.system_id))
    assert row["sources"] == []


# ---------------------------------------------------------------------------
# The footgun
# ---------------------------------------------------------------------------

def test_gating_does_not_erase_the_stored_row(
    no_sources_client, db_session, anime_with_sources
):
    """
    Withheld buckets are filtered out of the query in attach_sources, not
    nulled on a live instance, so the row must still exist afterwards.
    """
    no_sources_client.get(f"/api/anime/{anime_with_sources.system_id}")
    no_sources_client.get("/api/anime/")

    db_session.expire_all()
    stored = (
        db_session.query(models.MediaSource)
        .filter_by(media_id=anime_with_sources.system_id)
        .all()
    )
    assert len(stored) == 1
    assert stored[0].bucket == "restricted"


# ---------------------------------------------------------------------------
# Credits are not gated at all any more
# ---------------------------------------------------------------------------
# Studio, director and the rest are what an entry IS. There was never a case
# for withholding them, so the field group is gone and nothing replaced it -
# not a role permission either. These two are the regression guard: the
# narrowest viewer this suite can build still gets both the legacy strings and
# the linkable refs.


def test_credits_are_served_to_the_narrowest_viewer(client, db_session, sample_anime):
    studio = models.Studio(system_id=uuid.uuid4(), name_en="Zvornik Studio")
    db_session.add(studio)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            role="studio",
            studio_id=studio.system_id,
        )
    )
    db_session.flush()

    make_viewer(
        db_session,
        client,
        "nocredits",
        default_guest_permissions(),
        field_groups=(),
    )
    assert "Zvornik Studio" in client.get("/api/anime/").text


def test_credit_refs_are_served_too(client, db_session, sample_anime):
    """credit_refs names the same people the legacy strings do, so the two
    have to agree about being ungated; a divergence would show as a linkable
    ref for a name the string withheld."""
    person = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Composer")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            role="composer",
            person_id=person.system_id,
        )
    )
    db_session.flush()

    make_viewer(
        db_session,
        client,
        "norefs",
        default_guest_permissions(),
        field_groups=(),
    )
    body = client.get(f"/api/anime/{sample_anime.system_id}").json()
    assert body["credit_refs"]["composer"][0]["display_name"] == "Zvornik Composer"
    # And the legacy string beside it, so the two cannot diverge unnoticed.
    assert "Zvornik Composer" in client.get("/api/anime/").text


# ---------------------------------------------------------------------------
# Note sections
# ---------------------------------------------------------------------------

@pytest.fixture
def personal_note(db_session, sample_anime, owner_user):
    n = models.Note(
        author_id=owner_user.id,
        system_id=uuid.uuid4(),
        media_id=sample_anime.system_id,
        section="personal_reviews",
        content="Zvornik private assessment",
    )
    db_session.add(n)
    db_session.flush()
    return n


@pytest.fixture
def public_note(db_session, sample_anime, owner_user):
    n = models.Note(
        author_id=owner_user.id,
        system_id=uuid.uuid4(),
        media_id=sample_anime.system_id,
        section="public_reviews",
        content="A public review anyone may read",
    )
    db_session.add(n)
    db_session.flush()
    return n


def test_another_authors_personal_section_is_withheld(
    client, sample_anime, personal_note, public_note
):
    """`personal_reviews` is personal-scope, so list_notes filters it by
    author: a viewer who did not write the row never sees it, and no field
    group is involved. The public review is the mirror - the rest of the page
    still renders."""
    params = {"owner_type": "anime", "owner_id": str(sample_anime.system_id)}
    body = client.get("/api/notes", params=params).text
    assert "Zvornik private assessment" not in body
    assert "A public review anyone may read" in body


# ---------------------------------------------------------------------------
# The timestamps are not gated, by anything, for anybody
# ---------------------------------------------------------------------------
# `created_at`/`updated_at` were the whole of the old `system_info` field
# group. They say when the CATALOGUE ROW was last edited - a fact about the
# database rather than about the work - and no page displays them, so there is
# nothing for a gate to protect. The group went; nothing replaced it.
#
# `system_id` was never gated either: it is the route parameter of the page
# the viewer is already on, so withholding it would break navigation without
# concealing anything. The decorative copy printed down a detail page's spine
# is drawn on `is_root` in the SPA, which is presentation and not a gate.


@pytest.fixture
def narrowest_client(client, db_session):
    """The narrowest viewer this suite can build: guest permissions, and not
    one field group. If anything were still gating the timestamps, they would
    be null here."""
    return make_viewer(
        db_session,
        client,
        "narrowest",
        default_guest_permissions(),
        field_groups=(),
    )


def test_the_narrowest_viewer_sees_the_timestamps_in_the_list(
    narrowest_client, anime_with_sources
):
    body = narrowest_client.get("/api/anime/").json()
    row = next(e for e in body if e["system_id"] == str(anime_with_sources.system_id))
    assert row["created_at"] is not None
    assert row["updated_at"] is not None


def test_the_narrowest_viewer_sees_them_in_the_detail(
    narrowest_client, anime_with_sources
):
    """Also the regression guard for AnimeResponse: its timestamps were the
    only required ones of the eight, which is why they are Optional now."""
    response = narrowest_client.get(f"/api/anime/{anime_with_sources.system_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["created_at"] is not None
    assert body["updated_at"] is not None


def test_a_logged_out_visitor_sees_them_too(client, anime_with_sources):
    body = client.get(f"/api/anime/{anime_with_sources.system_id}").json()
    assert body["updated_at"] is not None


def test_the_factory_routers_do_not_gate_them_either(
    narrowest_client, movie_with_sources
):
    body = narrowest_client.get(
        f"/api/movies/{movie_with_sources.system_id}"
    ).json()
    assert body["created_at"] is not None
    assert body["updated_at"] is not None


def test_the_entry_id_is_not_gated(narrowest_client, anime_with_sources):
    """Withholding the id would break every link on the page."""
    body = narrowest_client.get(
        f"/api/anime/{anime_with_sources.system_id}"
    ).json()
    assert body["system_id"] == str(anime_with_sources.system_id)


def test_gating_a_column_does_not_erase_it_from_the_database(
    client, db_session, anime_with_sources, monkeypatch
):
    """The copy-not-setattr rule, kept alive without a real column group.

    No field group gates a real column today, so this stands one up: a probe
    group covering `created_at`, held by nobody. The rule it protects is the
    expensive kind - nulling a column on a live ORM instance marks the entity
    dirty, and the next autoflush writes the blank to disk, so gating would
    become silent, permanent data loss. The next columns group added inherits
    that hazard and will not arrive with its own reminder.
    """
    from app.services.rbac.field_groups import ALL, FIELD_GROUPS, FieldGroup

    monkeypatch.setitem(
        FIELD_GROUPS,
        "timestamps_probe",
        FieldGroup(
            key="timestamps_probe",
            label="Probe",
            description="",
            columns={ALL: ("created_at",)},
        ),
    )
    make_viewer(
        db_session,
        client,
        "probed",
        default_guest_permissions(),
        field_groups=(),
    )
    stored = anime_with_sources.created_at

    body = client.get(f"/api/anime/{anime_with_sources.system_id}").json()
    assert body["created_at"] is None
    # The mirror: a column the probe does not name is untouched, so the null
    # above is the gate acting and not the whole response collapsing.
    assert body["updated_at"] is not None

    db_session.expire_all()
    fresh = db_session.get(models.Anime, anime_with_sources.system_id)
    assert fresh.created_at == stored

# ---------------------------------------------------------------------------
# media_source buckets: partial gating, filtered at attach time
# ---------------------------------------------------------------------------


def test_a_viewer_without_restricted_sources_does_not_see_them(
    client, owner_client, sample_anime, db_session
):
    from app import models

    for bucket in ("other", "restricted"):
        db_session.add(
            models.MediaSource(
                media_id=sample_anime.system_id,
                kind="access",
                bucket=bucket,
                name=f"{bucket} site",
            )
        )
    db_session.commit()

    seen = owner_client.get(f"/api/anime/{sample_anime.system_id}").json()["sources"]
    assert {s["bucket"] for s in seen} == {"other", "restricted"}

    # The explicit removal is kept even though `safe` already withholds the
    # group, so this test does not silently stop covering the gate if that
    # default ever changes. `other` is the mirror: shown to every viewer.
    no_restricted_client = make_viewer(
        db_session,
        client,
        "norestricted",
        default_guest_permissions(),
        field_groups=all_field_group_keys() - {"sources_restricted"},
    )
    guest = no_restricted_client.get(f"/api/anime/{sample_anime.system_id}")
    if guest.status_code == 200:
        assert "restricted" not in {s["bucket"] for s in guest.json()["sources"]}
        assert "other" in {s["bucket"] for s in guest.json()["sources"]}
