"""The four seeded modes.

ensure_access_mode_seed creates any of the four that is missing and nothing
else: what a mode shows is derived in code (cache.mode_sets), so there are no
items to seed, and a mode's name and description are the admin's once it
exists.
"""

from app import models
from app.services.rbac import cache
from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
    ensure_access_mode_seed,
)


def _mode(db, key):
    return db.query(models.AccessMode).filter(models.AccessMode.key == key).one()


def test_seeds_four_system_modes(db_session):
    ensure_access_mode_seed(db_session)
    keys = {m.key for m in db_session.query(models.AccessMode)}
    assert keys == {MODE_UNRESTRICTED, MODE_BORDERLINE, MODE_NORMAL, MODE_SAFE}
    assert all(m.is_system for m in db_session.query(models.AccessMode))


def test_the_seed_stores_no_anonymous_policy(db_session):
    """Which mode a logged-out visitor gets is resolved by key, not seeded as
    a flag, so there is no row here for a restore to move."""
    ensure_access_mode_seed(db_session)
    assert not hasattr(models.AccessMode, "is_guest_default")

    # The mirror: `safe` itself is still seeded, so the green above is the
    # flag being gone and not the mode.
    keys = {m.key for m in db_session.query(models.AccessMode)}
    assert MODE_SAFE in keys


def test_safe_withholds_restricted_sources_and_the_wider_modes_show_them(db_session):
    """The one step that changes what a REACHABLE entry shows. The top three
    tiers differ only in which entries exist for you."""
    ensure_access_mode_seed(db_session)
    cache.bump()

    def groups(key):
        return set(cache.mode_sets(db_session, _mode(db_session, key).system_id).field_groups)

    assert "sources_restricted" in FIELD_GROUP_KEYS
    assert groups(MODE_SAFE) == set()
    for key in (MODE_NORMAL, MODE_BORDERLINE, MODE_UNRESTRICTED):
        assert groups(key) == set(FIELD_GROUP_KEYS)


def test_is_idempotent(db_session):
    """The lifespan runs against a database that may already hold these rows,
    and it must not duplicate them."""
    ensure_access_mode_seed(db_session)
    ensure_access_mode_seed(db_session)
    assert db_session.query(models.AccessMode).count() == 4


def test_a_missing_mode_is_recreated(db_session):
    ensure_access_mode_seed(db_session)
    db_session.query(models.AccessMode).filter(
        models.AccessMode.key == MODE_SAFE
    ).delete(synchronize_session=False)
    db_session.flush()
    assert db_session.query(models.AccessMode).filter_by(key=MODE_SAFE).count() == 0

    ensure_access_mode_seed(db_session)

    assert _mode(db_session, MODE_SAFE).is_system is True
    assert db_session.query(models.AccessMode).count() == 4


def test_an_admins_name_and_description_are_not_overwritten(db_session):
    ensure_access_mode_seed(db_session)
    normal = _mode(db_session, MODE_NORMAL)
    normal.label = "一般"
    normal.description = "日常"
    db_session.flush()

    ensure_access_mode_seed(db_session)
    db_session.expire_all()

    normal = _mode(db_session, MODE_NORMAL)
    assert (normal.label, normal.description) == ("一般", "日常")
