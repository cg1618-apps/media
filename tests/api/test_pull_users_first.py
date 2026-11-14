"""
Pull All restores the Users tab before every tab that files rows under an
account.

Those tabs fall back to the installation owner (user_list.installation_owner_id),
and the owner is DATA on the Users tab - `is_installation_owner`, or else the
first active member account. Restored after them, the Users tab would arrive
too late: on a fresh machine every owner-dependent row would be skipped as "no
installation owner" although the sheet names one.

This asserts the order Pull All actually iterates, not the registry it is
meant to follow - test_users_sheet.py pins Users at SHEET_TABS[0], which
proves nothing if Pull walked some other list.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

from app.services.pipelines import pull

# Every tab whose restore asks installation_owner_id() for a row's account
# (pull.execute_pull_specific: user_id, author_id, and the Game Copy and Game
# Choice Mark restore).
OWNER_DEPENDENT_TABS = (
    "User Media List",
    "Plan Next",
    "Seasonal",
    "Watch Order Follow",
    "Note",
    "Meme",
    "Quote",
    "Game Copy",
    "Game Choice Mark",
)


def test_pull_all_restores_users_before_every_owner_dependent_tab(
    db_session, monkeypatch
):
    restored: list[str] = []

    def record(db, tab_name, **_kwargs):
        restored.append(tab_name)
        return {"status": "success", "processed": 0}

    monkeypatch.setattr(pull, "execute_pull_specific", record)

    pull.execute_pull_all(db_session, may_restore_authz=True)

    assert "Users" in restored
    users_at = restored.index("Users")
    for tab in OWNER_DEPENDENT_TABS:
        # Present, so the ordering below is not vacuously true of a tab Pull
        # never restores at all.
        assert tab in restored, tab
        assert users_at < restored.index(tab), tab
