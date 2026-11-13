"""`unrestricted` reaches every object, including a label row the code does not
name.

The mode's whole meaning is "Every entry and every field. The widest mode."
`hidden_label_ids` hides every label the ACTIVE MODE lacks, so a label row the
widest mode did not reach would make every entry carrying it vanish from every
session in the installation, the owner's included - and it would look like a
deletion, because a hidden entry is deliberately indistinguishable from a
missing one.

So cache.mode_sets gives `unrestricted` every content_label ROW, not just the
six the code names. The migration and ensure_labels keep the two the same; a
row nobody expected is still reachable in the widest mode and hidden in every
other. The tests below hold that from both sides, through resolution and
through the admin surface.

`stray_label` inserts a row the code does not name: that is what makes the
widest mode's "every row" observably different from "every code label".
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache
from app.services.rbac.enforcement import entry_visible, hidden_label_ids
from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.labels import LABEL_KEYS
from app.services.rbac.resolver import Viewer
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_UNRESTRICTED,
)

MODES = "/api/access-modes/"


@pytest.fixture
def stray_label(db_session, access_modes):
    """A label row whose key is not in labels.CONTENT_LABELS.

    Load-bearing, not decoration: it is the one row no code rule names, so it
    is what can tell "unrestricted shows every row" from "unrestricted shows
    what the code lists" - and the mirror below needs it to have something to
    hide from `normal`.
    """
    label = models.ContentLabel(
        system_id=uuid.uuid4(), key="stray-row", label="Stray", sort_order=99
    )
    db_session.add(label)
    db_session.flush()
    cache.bump()
    return label


@pytest.fixture
def labelled_entry(db_session, sample_franchise, stray_label):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Immoral Guild",
        airing_type="TV",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    db_session.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(),
            media_id=entry.system_id,
            label_id=stray_label.system_id,
        )
    )
    db_session.flush()
    return entry


def _viewer_in(db_session, mode_row):
    """A viewer holding every permission, sitting in `mode_row`.

    The role axis is deliberately wide so that anything these tests observe is
    the OBJECT axis doing it - labels, not capabilities.
    """
    sets = cache.mode_sets(db_session, mode_row.system_id)
    return Viewer(
        username="someone",
        role_id=None,
        role_name="admin",
        is_root=True,
        permissions=frozenset(),
        mode_id=mode_row.system_id,
        mode_key=mode_row.key,
        visible_label_ids=sets.label_ids,
        field_groups=sets.field_groups,
    )


def _ids(db_session, keys):
    return {
        row.system_id
        for row in db_session.query(models.ContentLabel).filter(
            models.ContentLabel.key.in_(tuple(keys))
        )
    }


# ---------------------------------------------------------------------------
# Resolution: what a session sitting in the mode actually reaches
# ---------------------------------------------------------------------------


def test_unrestricted_hides_nothing_not_even_a_row_the_code_does_not_name(
    db_session, mode, stray_label
):
    viewer = _viewer_in(db_session, mode(MODE_UNRESTRICTED))
    assert hidden_label_ids(db_session, viewer) == []


def test_borderline_hides_that_row_and_the_gated_labels(db_session, mode, stray_label):
    """The mirror, with the same fixture. Without it the test above could pass
    because nothing was hidden from anyone - a green that proves the gate was
    asked, not that it answered."""
    hidden = hidden_label_ids(
        db_session, _viewer_in(db_session, mode(MODE_BORDERLINE))
    )
    gated = _ids(db_session, ("h-comic", "h-game", "hentai"))
    assert len(gated) == 3
    assert set(hidden) == {stray_label.system_id} | gated


def test_an_entry_carrying_that_row_stays_visible_in_unrestricted(
    db_session, mode, labelled_entry
):
    """The symptom the derivation prevents: an entry tagged with an unexpected
    label 404s for everybody, which reads as a deletion."""
    viewer = _viewer_in(db_session, mode(MODE_UNRESTRICTED))
    assert entry_visible(db_session, viewer, "anime", labelled_entry.system_id) is True


def test_that_entry_is_still_hidden_in_normal(db_session, mode, labelled_entry):
    viewer = _viewer_in(db_session, mode(MODE_NORMAL))
    assert entry_visible(db_session, viewer, "anime", labelled_entry.system_id) is False


def test_unrestricted_carries_every_field_group(db_session, mode, stray_label):
    sets = cache.mode_sets(db_session, mode(MODE_UNRESTRICTED).system_id)
    assert set(sets.field_groups) == set(FIELD_GROUP_KEYS)


# ---------------------------------------------------------------------------
# The admin surface
# ---------------------------------------------------------------------------


def test_the_api_reports_unrestricted_as_carrying_every_label(admin_client, mode):
    """What the page draws: every code label and every field group on
    `unrestricted`, and the mirror - `normal` without the labels it hides."""
    rows = {r["key"]: r for r in admin_client.get(MODES).json()}
    assert rows[MODE_UNRESTRICTED]["label_keys"] == list(LABEL_KEYS)
    assert set(rows[MODE_UNRESTRICTED]["field_group_keys"]) == set(FIELD_GROUP_KEYS)
    assert "erotica" not in rows[MODE_NORMAL]["label_keys"]
    assert "hentai" not in rows[MODE_NORMAL]["label_keys"]


def test_the_api_reports_what_unrestricted_resolves_to(admin_client, stray_label):
    """The page and resolution answer the same: a row the code does not name
    is listed on `unrestricted`, which reaches it, and on no other mode."""
    rows = {r["key"]: r for r in admin_client.get(MODES).json()}
    assert "stray-row" in rows[MODE_UNRESTRICTED]["label_keys"]
    assert "stray-row" not in rows[MODE_NORMAL]["label_keys"]
