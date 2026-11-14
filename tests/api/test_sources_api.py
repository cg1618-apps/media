"""Sources travel with the entry: read on GET, written on POST/PATCH."""

from app import models


def test_a_new_entry_reports_no_sources(owner_client, sample_anime):
    r = owner_client.get(f"/api/anime/{sample_anime.system_id}")
    assert r.status_code == 200
    assert r.json()["sources"] == []


def test_posting_sources_creates_rows(owner_client, sample_franchise, db_session):
    db_session.add(models.SystemOption(category="Platform", value="Netflix"))
    db_session.commit()

    r = owner_client.post(
        "/api/anime/",
        json={
            "anime_name_en": "Sourced",
            "franchise_id": str(sample_franchise.system_id),
            "sources": [
                {
                    "kind": "access",
                    "bucket": "main",
                    "name": "Netflix",
                    "url": "https://netflix.test/x",
                    "available": True,
                },
                {"kind": "access", "bucket": "other", "name": "Elsewhere"},
            ],
        },
    )
    assert r.status_code == 201
    names = [s["name"] for s in r.json()["sources"]]
    assert names == ["Netflix", "Elsewhere"]


def test_patching_sources_replaces_the_whole_set(
    owner_client, sample_anime, db_session
):
    owner_client.patch(
        f"/api/anime/{sample_anime.system_id}",
        json={"sources": [{"kind": "access", "bucket": "other", "name": "One"}]},
    )
    r = owner_client.patch(
        f"/api/anime/{sample_anime.system_id}",
        json={"sources": [{"kind": "access", "bucket": "other", "name": "Two"}]},
    )
    assert [s["name"] for s in r.json()["sources"]] == ["Two"]


def test_deleting_the_entry_deletes_its_sources(
    owner_client, sample_anime, db_session
):
    db_session.add(
        models.MediaSource(
            media_id=sample_anime.system_id,
            kind="access",
            bucket="other",
            name="Site",
        )
    )
    db_session.commit()

    owner_client.delete(f"/api/anime/{sample_anime.system_id}")

    assert db_session.query(models.MediaSource).count() == 0


def test_the_list_endpoint_attaches_sources(owner_client, sample_anime, db_session):
    db_session.add(
        models.MediaSource(
            media_id=sample_anime.system_id,
            kind="reference",
            bucket="main",
            name=None,
            option_id=_wiki(db_session),
        )
    )
    db_session.commit()

    rows = owner_client.get("/api/anime/").json()
    mine = next(r for r in rows if r["system_id"] == str(sample_anime.system_id))
    assert [s["name"] for s in mine["sources"]] == ["Wikipedia"]


def _wiki(db):
    option = models.SystemOption(category="Reference Source", value="Wikipedia")
    db.add(option)
    db.flush()
    return option.system_id
