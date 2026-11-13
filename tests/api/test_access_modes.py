"""What an access mode does to a read.

Read scoping, denials, fail-closed resolution and axis independence. The last
of those is the test that proves the redesign did what it set out to do: it
would have been unwritable in the old model, where is_root
short-circuited every gate.
"""

from app import models
from app.services.rbac import cache
from app.services.rbac.seed_modes import MODE_BORDERLINE, MODE_NORMAL, MODE_SAFE


def test_a_labelled_entry_is_invisible_in_safe(nsfw_label, hidden_anime, mode_client):
    c = mode_client(MODE_SAFE)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_the_same_entry_is_visible_in_borderline(
    nsfw_label, hidden_anime, mode_client
):
    c = mode_client(MODE_BORDERLINE)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200


def test_a_hidden_entry_is_absent_from_the_list(
    nsfw_label, hidden_anime, mode_client, plain_user
):
    c = mode_client(MODE_SAFE)
    body = c.get("/api/anime/").json()
    assert str(hidden_anime.system_id) not in {entry["system_id"] for entry in body}
    # The mirror: `normal` shows nsfw, and lists the same entry.
    wider = mode_client(MODE_NORMAL, user=plain_user).get("/api/anime/").json()
    assert str(hidden_anime.system_id) in {entry["system_id"] for entry in wider}


def test_hidden_answers_404_with_the_ordinary_not_found_message(
    nsfw_label, hidden_anime, mode_client
):
    """Indistinguishability is the property being protected. A 403 would leak
    the entry's existence as surely as a 200."""
    c = mode_client(MODE_SAFE)
    missing = c.get("/api/anime/00000000-0000-0000-0000-000000000000")
    hidden = c.get(f"/api/anime/{hidden_anime.system_id}")
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json()["detail"] == missing.json()["detail"]


def test_a_denial_subtracts_one_label_from_a_wide_mode(
    nsfw_label, hidden_anime, mode_client
):
    """An account at ceiling `borderline` denied nsfw sees what `normal` sees,
    without anyone having created a mode for it."""
    c = mode_client(MODE_BORDERLINE, denials=(nsfw_label.key,))
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_deleting_the_account_cascades_its_denials_away(
    db_session, plain_user, nsfw_label, grant_mode
):
    grant_mode(plain_user, MODE_BORDERLINE, denials=(nsfw_label.key,))

    def held():
        return (
            db_session.query(models.UserAccessModeDenial)
            .filter(models.UserAccessModeDenial.user_id == plain_user.id)
            .count()
        )

    assert held() == 1
    db_session.delete(plain_user)
    db_session.flush()
    assert held() == 0


def test_lowering_a_live_sessions_ceiling_resolves_to_nothing_not_to_the_default(
    db_session, admin_user, nsfw_label, hidden_anime, mode_client
):
    """Lower the ceiling below the mode the cookie names: the next request
    must see NOTHING, not fall back to the account's default or its new
    ceiling."""
    c = mode_client(MODE_BORDERLINE)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200

    admin_user.mode_ceiling = MODE_NORMAL
    admin_user.mode_default = MODE_NORMAL
    db_session.flush()
    cache.bump()

    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404
    assert c.get("/api/auth/me").json()["mode"]["key"] is None


def test_a_guest_sees_nothing_labelled_when_the_safe_mode_is_missing(
    db_session, client, access_modes, nsfw_label, hidden_anime
):
    """Fail closed. A misconfiguration must hide everything, not publish it."""
    db_session.query(models.AccessMode).filter(
        models.AccessMode.key == MODE_SAFE
    ).delete(synchronize_session=False)
    db_session.flush()
    cache.bump()
    assert client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_a_root_role_sitting_in_safe_does_not_see_a_labelled_entry(
    db_session, admin_user, nsfw_label, hidden_anime, mode_client
):
    """The test that proves the two axes are independent.

    admin_user is on the `admin` role, which is is_root=True. Under the
    old model that short-circuited every label check and this could not have
    been written. is_root now means "holds every CAPABILITY permission"
    and says nothing about which objects a session reaches.
    """
    assert db_session.get(models.Role, admin_user.role_id).is_root is True
    c = mode_client(MODE_SAFE, user=admin_user)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_a_root_role_in_a_narrow_mode_still_holds_every_capability(
    db_session, admin_user, nsfw_label, mode_client, sample_anime
):
    """The other half of axis independence: narrowing the objects a session
    reaches must NOT take away what it may do. Dropping to `safe` does not
    drop the manage.catalog grant."""
    c = mode_client(MODE_SAFE, user=admin_user)
    assert c.get("/api/auth/me").json()["is_admin"] is True
