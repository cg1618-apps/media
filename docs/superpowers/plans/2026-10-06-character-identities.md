# Character Identities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a character carry extra identities (names, gender, remark, cover image), and let each identity be cast in an entry as its own cast row with its own photo, remark and seiyuu.

**Architecture:** A new `character_identity` table hangs off `character`; the character row itself stays the main identity. `character_casting` gains a nullable `identity_id` (NULL = main identity) guarded by a composite FK that forces the identity to belong to the row's character. Everything else — cast editor, cast list, character page, library, admin tabs, Sheets — reads and writes that one column.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 17, pytest; React + Vite, TanStack Query, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-character-identities-design.md`

## Global Constraints

- Python 3.13; run Python as `venv/Scripts/python.exe -m <tool>` from the repo root.
- The image owner type for an identity is **`character-identity`** (hyphenated, like `anime-movie`). Its covers live in `static/covers/character-identity/`. (The spec wrote `character_identity/`; the folder follows the hyphenated owner-type convention instead — Task 11 corrects the spec text while moving it into docs.)
- The composite FK `fk_casting_identity` is `DEFERRABLE INITIALLY DEFERRED` with no ON UPDATE/ON DELETE action (the spec said ON UPDATE CASCADE; deferral is what merge actually needs — both the identity and its cast rows are updated in one flush, checked at COMMIT).
- `PATCH /api/character-identity/{id}` from the spec is **dropped** (YAGNI: nothing edits an identity inline). Only GET list, GET one, POST, PUT, DELETE.
- Identity endpoints are admin-only (`require_manage_catalog`), including reads; public readers get identities through `CharacterResponse.identities`.
- `GET /api/character/?name=` stays characters-only.
- MAL code paths are not touched; MAL-created rows always have `identity_id = NULL`.
- No `Co-Authored-By`, `Claude-Session` or any AI mention in commits or PR text.
- Every behaviour change updates the matching doc in the same commit (Task 11 holds the docs, and is committed with the last code task's review if preferred — but never after the PR is opened).
- Tests in `tests/api/` run against `media_test`; the session never truly commits, so any test relying on a **deferred** constraint must run `db_session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))` to make Postgres check it.
- Full backend suite takes ~5.5 min and must take the machine lock:
  ```bash
  LOCK=/c/Users/$USERNAME/AppData/Local/Temp/anime_site_pytest.lock
  until mkdir "$LOCK" 2>/dev/null; do sleep 10; done
  venv/Scripts/python.exe -m pytest -q; rc=$?
  rmdir "$LOCK"; exit $rc
  ```
  Scoped runs (`pytest tests/api/test_x.py`) also take the lock.

## Review Focus

1. **Folding copies `identity_id` into the main row.** `fill_blank_casting` copies every blank column; the main row's `identity_id` is NULL (blank), so folding an identity row into it would turn the "main" row into the identity's. Expect the main row to stay main. → Task 3 adds `identity_id` to the skip list and pins it with `test_fold_keeps_the_main_row_main`.
2. **Identity covers deleted as orphans.** `bulk_check_unused_cover_images` treats any file under `static/covers/` with no owning row as an orphan and the delete action removes it. Expect an identity's cover to count as used. → Task 5 `test_identity_cover_is_not_an_orphan`.
3. **Identity cover served for a hidden character.** `covers._owner_hidden` returns "not hidden" for an owner type it has no model for. Expect an identity's cover to be hidden exactly when its character is. → Task 5 `test_identity_cover_is_hidden_with_its_character` (uses `nsfw_label`/`hidden_anime` so the refusal can bite).
4. **Identity of another character in a cast PUT.** Expect 422, not a 500 from the composite FK. → Task 4 `test_put_rejects_an_identity_of_another_character`.
5. **Duplicate React keys on the character page.** One entry now appears once per identity cast in it; keying cards on `entry.system_id` collides. Expect every appearance to render. → Task 8 keys on `entry.casting_id`, pinned by the backend test `test_entries_lists_each_identity_appearance` and the vitest in Task 8.

---

## File Structure

Backend:
- Modify `app/models/character.py` — `CharacterIdentity`; `CharacterCasting.identity_id` + constraints; `Character.identities`.
- Modify `app/models/__init__.py` — export `CharacterIdentity`.
- Create `alembic/versions/h1c2i3dentty_character_identity.py` — the migration.
- Modify `app/schemas/character.py`, `app/schemas/__init__.py` — identity schemas; `CharacterResponse.identities`.
- Create `app/services/domain/character_identities.py` — identity responses, gender/photo resolution, delete fold.
- Create `app/routers/character_identity.py` — `/api/character-identity`.
- Modify `app/main.py` — include the router.
- Modify `app/routers/character.py` — nest identities in responses; merge re-parents identities; `/entries` carries identity.
- Modify `app/services/domain/merge_fill.py` — `identity_id` never filled; `absorb_casting`.
- Modify `app/services/domain/casting.py`, `app/routers/casting.py` — `identity_id` in rows, validation, photo fallback.
- Modify `app/services/integrations/image_manager.py`, `app/routers/images.py`, `app/routers/covers.py`, `app/services/rbac/shared_visibility.py`, `app/services/calculation.py` — the `character-identity` image owner.
- Modify `app/services/pipelines/tabs.py`, `app/utils/formatter.py` — Sheets tab and parsers.

Frontend:
- Modify `frontend/src/api/endpoints.js` — `characterIdentity` endpoints.
- Modify `frontend/src/components/forms/CastEditor.jsx` (+ test) — Identity field.
- Modify `frontend/src/components/info/CastSection.jsx` — identity headline.
- Modify `frontend/src/pages/detail/Character.jsx` — Identities section; appearance label and key.
- Create `frontend/src/lib/characterCards.js` (+ test) — flatten characters into library cards.
- Modify `frontend/src/lib/entityFilters.js` — two new filter groups.
- Modify `frontend/src/pages/library/CharacterLibrary.jsx` — identity cards.
- Create `frontend/src/pages/add-tabs/IdentityAddTab.jsx` (exports `IdentityFields`), `frontend/src/pages/modify-tabs/IdentityModifyTab.jsx`, `frontend/src/pages/modify-tabs/IdentityDeleteTab.jsx` (+ tests).
- Modify `frontend/src/config/adminTabs.js`, `frontend/src/config/imageOwnerTypes.js`, `frontend/src/pages/admin/Add.jsx`, `Modify.jsx`, `Delete.jsx`.

Docs (Task 11): `docs/data-model.md`, `docs/api.md`, `docs/systems/credits-and-tags.md`, `docs/data-actions.md`, `docs/external-apis.md`, `docs/frontend/pages.md`, `docs/frontend/components.md`, `docs/notes/decisions.md`; delete the spec and this plan.

---

### Task 0: Workspace

The branch `feat/character-identities` exists on `origin` with the spec, and is checked out in a docs-only worktree at `../media_character-identities` (no venv, no `.env`, no `node_modules`).

- [ ] **Step 1: Check who is in the main checkout**

```bash
cd /c/Users/q601513/Documents/personal/cg1618/media
git status --short && git reflog -8 && git worktree list
```

If the main checkout is clean and the reflog shows no HEAD moves you did not make, use the main checkout (Step 2a). Otherwise build the worktree out (Step 2b).

- [ ] **Step 2a: Main checkout**

```bash
git worktree remove ../media_character-identities
git fetch origin && git checkout feat/character-identities && git pull origin feat/character-identities
```

- [ ] **Step 2b: Worktree, set up by hand** (the helper refuses an existing branch)

From `../media_character-identities`: copy `.env` and `credentials.json` from `../media`; in `.env` set `COMPOSE_PROJECT_NAME=media` and `POSTGRES_DB=media_character_identities`; `../media/venv/Scripts/python.exe -m venv venv && venv/Scripts/python.exe -m pip install -q -r requirements-dev.txt`; `cd frontend && npm install`; `docker exec cg1618-dev-db createdb -U postgres media_character_identities`; `venv/Scripts/python.exe -m alembic upgrade head`.

- [ ] **Step 3: Confirm the head the migration will parent on**

Run: `venv/Scripts/python.exe -m alembic heads`
Expected: one line. If it is not `g2c3hbranch4 (head)`, use the printed id as `down_revision` in Task 1 instead.

---

### Task 1: Schema — `character_identity` and `character_casting.identity_id`

**Files:**
- Modify: `app/models/character.py`
- Modify: `app/models/__init__.py`
- Create: `alembic/versions/h1c2i3dentty_character_identity.py`
- Test: `tests/api/test_character_identity_model.py`

**Interfaces:**
- Produces: `models.CharacterIdentity` (columns `system_id, character_id, name_en, name_cn, name_jp, name_alt, display_name_field, gender, remark, photo_file, photo_focus, position, created_at, updated_at`; property `display_name`); `models.Character.identities` (ordered by position); `models.CharacterCasting.identity_id` (nullable UUID).

- [ ] **Step 1: Write the failing tests**

`tests/api/test_character_identity_model.py`:

```python
"""
character_identity and character_casting.identity_id at the database level.

fk_casting_identity is DEFERRABLE INITIALLY DEFERRED, and the test session
never really commits (its commit releases a SAVEPOINT), so every test that
needs the FK to bite sets the constraints IMMEDIATE first.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


def _immediate(db):
    db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))


def _identity(db, character, **names):
    identity = models.CharacterIdentity(
        system_id=uuid.uuid4(), character_id=character.system_id, **(names or {"name_en": "Conan"})
    )
    db.add(identity)
    db.flush()
    return identity


def _casting(db, character, anime, identity=None):
    row = models.CharacterCasting(
        character_id=character.system_id,
        identity_id=identity.system_id if identity else None,
        media_type="anime",
        entry_id=anime.system_id,
    )
    db.add(row)
    db.flush()
    return row


def test_an_identity_needs_a_name(db_session, character):
    db_session.add(models.CharacterIdentity(system_id=uuid.uuid4(), character_id=character.system_id))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_display_name_follows_display_name_field(db_session, character):
    identity = _identity(db_session, character, name_en="Conan", name_jp="コナン")
    identity.display_name_field = "jp"
    assert identity.display_name == "コナン"


def test_identities_are_ordered_by_position(db_session, character):
    second = _identity(db_session, character, name_en="B")
    first = _identity(db_session, character, name_en="A")
    second.position, first.position = 1, 0
    db_session.flush()
    db_session.expire(character)
    assert [i.name_en for i in character.identities] == ["A", "B"]


def test_main_and_identity_rows_may_share_an_entry(db_session, character, anime):
    identity = _identity(db_session, character)
    _casting(db_session, character, anime)
    _casting(db_session, character, anime, identity)
    _immediate(db_session)


def test_the_main_identity_is_cast_once_per_entry(db_session, character, anime):
    # NULLS NOT DISTINCT: two NULL identity_ids collide. Without it Postgres
    # treats them as different and both rows would be stored.
    _casting(db_session, character, anime)
    with pytest.raises(IntegrityError):
        _casting(db_session, character, anime)


def test_an_identity_of_another_character_is_refused(db_session, character, second_character, anime):
    stranger = _identity(db_session, second_character)
    _casting(db_session, character, anime, stranger)
    with pytest.raises(IntegrityError):
        _immediate(db_session)


def test_deleting_a_character_deletes_its_identities(db_session, character):
    identity_id = _identity(db_session, character).system_id
    db_session.delete(character)
    db_session.flush()
    assert db_session.get(models.CharacterIdentity, identity_id) is None
```

`second_character` lives in `tests/api/test_casting_router.py`; add the same fixture to `tests/api/conftest.py` next to `character` (and delete the local copy in `test_casting_router.py` so there is one):

```python
@pytest.fixture
def second_character(db_session):
    c = models.Character(system_id=uuid.uuid4(), name_en="Yuki")
    db_session.add(c)
    db_session.flush()
    return c
```

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_character_identity_model.py -q`
Expected: FAIL / ERROR — `AttributeError: module 'app.models' has no attribute 'CharacterIdentity'`.

- [ ] **Step 3: Add the model**

In `app/models/character.py`, add to `Character` after `tags`:

```python
    identities = relationship(
        "CharacterIdentity",
        back_populates="character",
        order_by="CharacterIdentity.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
```

Add after `class CharacterTag` (before `CharacterCasting`):

```python
class CharacterIdentity(Base, NameFallbackMixin):
    """
    One more identity of a character - an alter ego, a disguise, a civilian
    name. The character row itself is the MAIN identity; only the others are
    rows here, so names, photo and remark are never held twice.

    Visibility is the character's. There is no public_id: an identity has no
    page of its own, it is shown on its character's.

    uq_character_identity_owner is redundant as a key - system_id alone is
    unique - but it is what character_casting's fk_casting_identity
    references, so a cast row's identity always belongs to that row's
    character.
    """

    __tablename__ = "character_identity"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_character_identity_has_a_name",
        ),
        UniqueConstraint(
            "system_id", "character_id", name="uq_character_identity_owner"
        ),
    )

    _name_fields = ["name_en", "name_cn", "name_jp", "name_alt"]
    _DISPLAY_FIELDS = Character._DISPLAY_FIELDS

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("character.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name_en = Column(String, nullable=True)
    name_cn = Column(String, nullable=True)
    name_jp = Column(String, nullable=True)
    name_alt = Column(String, nullable=True)
    # One of "en" | "cn" | "jp" | "alt", or NULL for the fallback chain.
    display_name_field = Column(String, nullable=True)
    # One of constants.GENDERS, or NULL: the same as the character's,
    # resolved on read (services/domain/character_identities.py), never copied.
    gender = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    # Storage key under static/covers/character-identity/. NULL shows the
    # character's picture.
    photo_file = Column(String, nullable=True)
    photo_focus = Column(String, nullable=True)
    position = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    character = relationship("Character", back_populates="identities")

    # The same rule as the character's own name: display_name_field names the
    # winner, the EN -> CN -> JP -> Alt chain is the fallback.
    names_dict = Character.names_dict
    display_name = Character.display_name
```

In `CharacterCasting.__table_args__` replace the `uq_character_casting` constraint and its comment with:

```python
        # One casting per character per IDENTITY per entry: identity_id NULL is
        # the main identity, and NULLS NOT DISTINCT makes two NULLs collide,
        # so the main identity is still cast at most once per entry.
        UniqueConstraint(
            "character_id",
            "identity_id",
            "media_type",
            "entry_id",
            name="uq_character_casting",
            postgresql_nulls_not_distinct=True,
        ),
```

and add to the same tuple:

```python
        # The identity must be one of THIS row's character's. A NULL
        # identity_id is not checked (MATCH SIMPLE). Deferred, so character
        # merge can move an identity and its cast rows to the survivor in one
        # flush and only the end state is checked, at COMMIT.
        ForeignKeyConstraint(
            ["identity_id", "character_id"],
            ["character_identity.system_id", "character_identity.character_id"],
            name="fk_casting_identity",
            deferrable=True,
            initially="DEFERRED",
        ),
```

Add the column after `character_id`:

```python
    # NULL is the main identity (the character row itself); otherwise one of
    # the character's character_identity rows - see fk_casting_identity.
    identity_id = Column(UUID(as_uuid=True), nullable=True, index=True)
```

In `app/models/__init__.py`, add `CharacterIdentity,` to the `from app.models.character import (...)` list (alphabetical: after `CharacterCastingVoice`).

- [ ] **Step 4: Write the migration**

`alembic/versions/h1c2i3dentty_character_identity.py`:

```python
"""character_identity, and character_casting.identity_id

A character's other identities - the character row stays the main one. A cast
row may name one of them; NULL is the main identity, and the unique key gains
identity_id with NULLS NOT DISTINCT so the main identity is still cast once
per entry. fk_casting_identity holds a row's identity to its own character.

The downgrade drops every cast row that names an identity before restoring the
old (character, entry) key, which those rows would otherwise violate. That is
the data the identities table held - a downgrade of a new table loses its
rows - not an irreversible change to anything that existed before.

Revision ID: h1c2i3dentty
Revises: g2c3hbranch4
Create Date: 2026-10-06 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "h1c2i3dentty"
down_revision: Union[str, Sequence[str], None] = "g2c3hbranch4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

IDENTITY = "character_identity"
CASTING = "character_casting"


def upgrade() -> None:
    op.create_table(
        IDENTITY,
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("character_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name_en", sa.String(), nullable=True),
        sa.Column("name_cn", sa.String(), nullable=True),
        sa.Column("name_jp", sa.String(), nullable=True),
        sa.Column("name_alt", sa.String(), nullable=True),
        sa.Column("display_name_field", sa.String(), nullable=True),
        sa.Column("gender", sa.String(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("photo_file", sa.String(), nullable=True),
        sa.Column("photo_focus", sa.String(), nullable=True),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_character_identity_has_a_name",
        ),
        sa.ForeignKeyConstraint(
            ["character_id"], ["character.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "system_id", "character_id", name="uq_character_identity_owner"
        ),
    )
    op.create_index(op.f("ix_character_identity_system_id"), IDENTITY, ["system_id"])
    op.create_index(
        op.f("ix_character_identity_character_id"), IDENTITY, ["character_id"]
    )

    op.add_column(
        CASTING,
        sa.Column("identity_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(op.f("ix_character_casting_identity_id"), CASTING, ["identity_id"])
    op.drop_constraint("uq_character_casting", CASTING, type_="unique")
    op.create_unique_constraint(
        "uq_character_casting",
        CASTING,
        ["character_id", "identity_id", "media_type", "entry_id"],
        postgresql_nulls_not_distinct=True,
    )
    op.create_foreign_key(
        "fk_casting_identity",
        CASTING,
        IDENTITY,
        ["identity_id", "character_id"],
        ["system_id", "character_id"],
        deferrable=True,
        initially="DEFERRED",
    )


def downgrade() -> None:
    op.execute(f"DELETE FROM {CASTING} WHERE identity_id IS NOT NULL")
    op.drop_constraint("fk_casting_identity", CASTING, type_="foreignkey")
    op.drop_constraint("uq_character_casting", CASTING, type_="unique")
    op.create_unique_constraint(
        "uq_character_casting", CASTING, ["character_id", "media_type", "entry_id"]
    )
    op.drop_index(op.f("ix_character_casting_identity_id"), table_name=CASTING)
    op.drop_column(CASTING, "identity_id")
    op.drop_index(op.f("ix_character_identity_character_id"), table_name=IDENTITY)
    op.drop_index(op.f("ix_character_identity_system_id"), table_name=IDENTITY)
    op.drop_table(IDENTITY)
```

- [ ] **Step 5: Run the model tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_character_identity_model.py -q`
Expected: 7 passed.

- [ ] **Step 6: Prove the chain builds from zero and comes back**

Run: `venv/Scripts/python.exe -m alembic heads` → exactly `h1c2i3dentty (head)`.
Run: `venv/Scripts/python.exe -m pytest tests/api/test_migrations_build_the_schema.py tests/api/test_migration_round_trip.py -q`
Expected: PASS. A model/migration mismatch (an index name, the NULLS NOT DISTINCT flag) shows up here as a schema diff — fix the side that disagrees with Step 3.

Then upgrade the dev database: `venv/Scripts/python.exe -m alembic upgrade head`.

- [ ] **Step 7: Commit**

```bash
git add app/models/character.py app/models/__init__.py alembic/versions/h1c2i3dentty_character_identity.py tests/api/test_character_identity_model.py tests/api/conftest.py tests/api/test_casting_router.py
git commit -m "feat: character_identity table and casting identity_id" -- app/models/character.py app/models/__init__.py alembic/versions/h1c2i3dentty_character_identity.py tests/api/test_character_identity_model.py tests/api/conftest.py tests/api/test_casting_router.py
```

---

### Task 2: Identity API and identities on the character response

**Files:**
- Modify: `app/schemas/character.py`, `app/schemas/__init__.py`
- Create: `app/services/domain/character_identities.py`
- Create: `app/routers/character_identity.py`
- Modify: `app/main.py`, `app/routers/character.py`
- Test: `tests/api/test_character_identity_router.py`

**Interfaces:**
- Consumes: `models.CharacterIdentity`, `models.Character.identities` (Task 1).
- Produces:
  - `schemas.IdentityCreate` (`character_id` + identity fields), `schemas.IdentityUpdate`, `schemas.IdentityResponse` (`system_id, character_id, name_*, display_name_field, display_name, gender, display_gender, remark, photo_file, photo_focus, display_photo_file, display_photo_focus, position`), `schemas.IdentityAdminResponse` (adds `character_display_name: str`, `character_public_id: int`, `casting_count: int`).
  - `schemas.CharacterResponse.identities: List[IdentityResponse]`.
  - `character_identities.identity_response(identity, character, media: EntityMedia) -> IdentityResponse`
  - `character_identities.identities_by_character(db, character_ids) -> dict[UUID, list[models.CharacterIdentity]]`
  - Routes: `GET/POST /api/character-identity/`, `GET/PUT/DELETE /api/character-identity/{system_id}` (DELETE body comes in Task 3).

- [ ] **Step 1: Write the failing tests**

`tests/api/test_character_identity_router.py`:

```python
"""/api/character-identity, and identities nested in the character response."""

import uuid

from app import models

BASE = "/api/character-identity/"


def _create(admin_client, character, **fields):
    body = {"character_id": str(character.system_id), "name_en": "Conan", **fields}
    r = admin_client.post(BASE, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_requires_an_existing_character(admin_client):
    r = admin_client.post(BASE, json={"character_id": str(uuid.uuid4()), "name_en": "Conan"})
    assert r.status_code == 404


def test_create_requires_a_name(admin_client, character):
    r = admin_client.post(BASE, json={"character_id": str(character.system_id)})
    assert r.status_code == 422


def test_guest_cannot_create_or_read(client, character):
    assert client.post(BASE, json={"character_id": str(character.system_id), "name_en": "X"}).status_code == 401
    assert client.get(BASE).status_code == 401


def test_gender_null_inherits_the_characters(admin_client, db_session, character):
    character.gender = "男"
    db_session.flush()
    inherited = _create(admin_client, character)
    own = _create(admin_client, character, name_en="Edogawa", gender="女")
    assert inherited["gender"] is None and inherited["display_gender"] == "男"
    assert own["display_gender"] == "女"


def test_photo_falls_back_to_the_characters(admin_client, character):
    # `character` carries photo_file="characters/ichika.jpg" (conftest).
    bare = _create(admin_client, character)
    own = _create(admin_client, character, name_en="B", photo_file="character-identity/x.jpg")
    assert bare["display_photo_file"] == "characters/ichika.jpg"
    assert own["display_photo_file"] == "character-identity/x.jpg"


def test_new_identities_go_last(admin_client, character):
    first = _create(admin_client, character, name_en="A")
    second = _create(admin_client, character, name_en="B")
    assert (first["position"], second["position"]) == (0, 1)


def test_put_updates_fields_but_not_the_character(admin_client, character, second_character):
    created = _create(admin_client, character)
    r = admin_client.put(
        f"{BASE}{created['system_id']}",
        json={"name_en": "Conan", "remark": "glasses", "character_id": str(second_character.system_id)},
    )
    assert r.status_code == 200
    assert r.json()["remark"] == "glasses"
    assert r.json()["character_id"] == str(character.system_id)


def test_list_filters_by_character_and_name(admin_client, character, second_character):
    _create(admin_client, character, name_en="Conan")
    _create(admin_client, second_character, name_en="Kaito")
    by_character = admin_client.get(BASE, params={"character_id": str(character.system_id)}).json()
    assert [i["name_en"] for i in by_character] == ["Conan"]
    by_name = admin_client.get(BASE, params={"name": "kai"}).json()
    assert [i["name_en"] for i in by_name] == ["Kaito"]
    assert by_name[0]["character_display_name"] == "Yuki"


def test_character_response_nests_its_identities(admin_client, client, character):
    _create(admin_client, character, name_en="B")
    _create(admin_client, character, name_en="A")
    detail = client.get(f"/api/character/{character.system_id}").json()
    assert [i["name_en"] for i in detail["identities"]] == ["B", "A"]
    listed = next(c for c in client.get("/api/character/").json() if c["system_id"] == str(character.system_id))
    assert len(listed["identities"]) == 2
    assert "casting_count" not in listed["identities"][0]
```

(Visibility of an identity is its character's and is tested where it can actually refuse something — the cover route, Task 5.)

- [ ] **Step 2: Run to verify failure**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_character_identity_router.py -q`
Expected: FAIL — 404 on every `/api/character-identity/` route.

- [ ] **Step 3: Schemas**

Append to `app/schemas/character.py`:

```python
class IdentityBase(BaseModel):
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    name_jp: Optional[str] = None
    name_alt: Optional[str] = None
    display_name_field: Optional[str] = None
    # None is "the same as the character's" - resolved into display_gender
    # on read, never copied.
    gender: Optional[str] = None
    remark: Optional[str] = None
    photo_file: Optional[str] = None
    photo_focus: ImageFocus = None

    @model_validator(mode="after")
    def _display_field_is_known(self):
        if self.display_name_field not in (None, "en", "cn", "jp", "alt"):
            raise ValueError("display_name_field must be en, cn, jp or alt.")
        return self


class IdentityWrite(IdentityBase):
    @field_validator("gender")
    @classmethod
    def _known_gender(cls, v):
        return check_gender(v)

    @model_validator(mode="after")
    def _at_least_one_name(self):
        """Mirrors ck_character_identity_has_a_name."""
        if not _has_a_name(self):
            raise ValueError("An identity needs at least one name.")
        return self


class IdentityCreate(IdentityWrite):
    # Required: an identity never exists without its character. Fixed once
    # created - IdentityUpdate has no character_id.
    character_id: UUID


class IdentityUpdate(IdentityWrite):
    position: Optional[int] = None


class IdentityResponse(IdentityBase):
    system_id: UUID
    character_id: UUID
    display_name: str = ""
    display_gender: Optional[str] = None
    # The identity's own photo, else the character's displayed one.
    display_photo_file: Optional[str] = None
    display_photo_focus: Optional[str] = None
    position: int = 0


class IdentityAdminResponse(IdentityResponse):
    """What the admin tabs read: which character it belongs to, and the cast
    rows a delete would fold - the count DELETE checks its ?castings= against."""

    character_display_name: str = ""
    character_public_id: int
    casting_count: int = 0
```

Add to `CharacterResponse` (after `trait`):

```python
    # The character's other identities, in position order. The character
    # itself is the main identity and is not repeated here.
    identities: List["IdentityResponse"] = []
```

Because `CharacterResponse` is defined before `IdentityResponse`, move the four identity classes **above** `class CharacterResponse` (below `CharacterUpdate`) and drop the quotes. Export `IdentityAdminResponse, IdentityCreate, IdentityResponse, IdentityUpdate` from `app/schemas/__init__.py` in the `from app.schemas.character import (...)` block.

- [ ] **Step 4: Domain service**

`app/services/domain/character_identities.py`:

```python
"""
A character's other identities: their responses and the cast rows they own.

The character row is the main identity, so everything an identity leaves
blank is answered by its character - gender (display_gender) and the picture
(display_photo_file). Deleting an identity never deletes cast history: its
rows fold into the main identity's (fold_into_main).
"""

from typing import Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from app import models, schemas
from app.services.domain.entity_photos import EntityMedia


def identities_by_character(
    db: Session, character_ids: Iterable[UUID]
) -> dict[UUID, list[models.CharacterIdentity]]:
    """Every identity of each character, in position order. One query."""
    ids = list(character_ids)
    out: dict[UUID, list[models.CharacterIdentity]] = {i: [] for i in ids}
    if not ids:
        return out
    for identity in (
        db.query(models.CharacterIdentity)
        .filter(models.CharacterIdentity.character_id.in_(ids))
        .order_by(models.CharacterIdentity.position, models.CharacterIdentity.created_at)
    ):
        out[identity.character_id].append(identity)
    return out


def identity_response(
    identity: models.CharacterIdentity,
    character: models.Character,
    media: EntityMedia,
) -> schemas.IdentityResponse:
    own_photo = bool(identity.photo_file)
    return schemas.IdentityResponse(
        system_id=identity.system_id,
        character_id=identity.character_id,
        name_en=identity.name_en,
        name_cn=identity.name_cn,
        name_jp=identity.name_jp,
        name_alt=identity.name_alt,
        display_name_field=identity.display_name_field,
        display_name=identity.display_name,
        gender=identity.gender,
        display_gender=identity.gender or character.gender,
        remark=identity.remark,
        photo_file=identity.photo_file,
        photo_focus=identity.photo_focus,
        display_photo_file=identity.photo_file if own_photo else media.display_photo_file,
        display_photo_focus=identity.photo_focus if own_photo else media.display_photo_focus,
        position=identity.position,
    )


def identity_casting_count(db: Session, identity_id: UUID) -> int:
    return (
        db.query(models.CharacterCasting)
        .filter(models.CharacterCasting.identity_id == identity_id)
        .count()
    )
```

- [ ] **Step 5: Router**

`app/routers/character_identity.py`:

```python
"""
routers/character_identity.py
A character's other identities. Admin-only, reads included: the public reads
them through GET /api/character, nested in each character.

An identity is created under an existing character and stays with it - there
is no way to move one. Visibility is the character's: an identity of a
character this caller cannot see answers 404, as the character does.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.domain.character_identities import (
    identity_casting_count,
    identity_response,
)
from app.services.domain.entity_photos import character_media
from app.services.rbac.resolver import Viewer, require_manage_catalog
from app.services.rbac.shared_visibility import (
    apply_shared_visibility,
    require_visible_shared,
)

router = APIRouter(prefix="/api/character-identity", tags=["Character Identity"])

NOT_FOUND = "Identity not found."


def _admin_response(
    db: Session, identity: models.CharacterIdentity, viewer: Viewer
) -> schemas.IdentityAdminResponse:
    character = identity.character
    media = character_media(db, viewer, [character])[character.system_id]
    base = identity_response(identity, character, media)
    return schemas.IdentityAdminResponse(
        **base.model_dump(),
        character_display_name=character.display_name,
        character_public_id=character.public_id,
        casting_count=identity_casting_count(db, identity.system_id),
    )


def _load(db: Session, viewer: Viewer, system_id: UUID) -> models.CharacterIdentity:
    identity = db.get(models.CharacterIdentity, system_id)
    if identity is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, viewer, models.Character, identity.character_id, NOT_FOUND)
    return identity


@router.get("/", response_model=List[schemas.IdentityAdminResponse], summary="List Identities")
def list_identities(
    character_id: Optional[UUID] = None,
    name: Optional[str] = Query(default=None, description="Substring of any of the four names."),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    visible_characters = apply_shared_visibility(
        db.query(models.Character.system_id), models.Character, db, admin
    )
    query = db.query(models.CharacterIdentity).filter(
        models.CharacterIdentity.character_id.in_(visible_characters)
    )
    if character_id is not None:
        query = query.filter(models.CharacterIdentity.character_id == character_id)
    if name:
        term = f"%{name}%"
        query = query.filter(
            or_(
                models.CharacterIdentity.name_en.ilike(term),
                models.CharacterIdentity.name_cn.ilike(term),
                models.CharacterIdentity.name_jp.ilike(term),
                models.CharacterIdentity.name_alt.ilike(term),
            )
        )
    identities = query.order_by(models.CharacterIdentity.position).all()
    out = [_admin_response(db, i, admin) for i in identities]
    out.sort(key=lambda r: (r.character_display_name.casefold(), r.position))
    return out


@router.get("/{system_id}", response_model=schemas.IdentityAdminResponse, summary="Get Identity")
def get_identity(
    system_id: UUID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    return _admin_response(db, _load(db, admin, system_id), admin)


@router.post("/", response_model=schemas.IdentityAdminResponse, summary="Create Identity")
def create_identity(
    payload: schemas.IdentityCreate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """A plain create under an existing character, placed after its others."""
    character = db.get(models.Character, payload.character_id)
    if character is None:
        raise HTTPException(status_code=404, detail="Character not found.")
    require_visible_shared(db, admin, models.Character, character.system_id, "Character not found.")
    position = (
        db.query(models.CharacterIdentity)
        .filter(models.CharacterIdentity.character_id == character.system_id)
        .count()
    )
    identity = models.CharacterIdentity(**payload.model_dump(), position=position)
    db.add(identity)
    db.commit()
    db.refresh(identity)
    return _admin_response(db, identity, admin)


@router.put("/{system_id}", response_model=schemas.IdentityAdminResponse, summary="Update Identity")
def update_identity(
    system_id: UUID,
    payload: schemas.IdentityUpdate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Replaces the identity's fields. Its character never changes; a
    character_id in the body is ignored. A null position keeps the current one."""
    identity = _load(db, admin, system_id)
    data = payload.model_dump()
    if data.get("position") is None:
        data.pop("position", None)
    for key, value in data.items():
        setattr(identity, key, value)
    db.commit()
    db.refresh(identity)
    return _admin_response(db, identity, admin)
```

In `app/main.py` add `character_identity,` to the router import list (alphabetical, after `character,`) and `app.include_router(character_identity.router)` right after `app.include_router(character.router)`.

- [ ] **Step 6: Nest identities in the character response**

In `app/routers/character.py`:

```python
from app.services.domain.character_identities import (
    identities_by_character,
    identity_response,
)
```

`_to_response` gains a parameter `identities: Optional[list] = None` and, before `return`:

```python
    if identities is None:
        identities = identities_by_character(db, [character.system_id])[character.system_id]
```

and the `CharacterResponse(...)` call gains:

```python
        identities=[identity_response(i, character, media) for i in identities],
```

In `get_all_characters`, load them in bulk next to `tags` and pass them:

```python
    identities = identities_by_character(db, [c.system_id for c in characters])
    return [
        _to_response(
            db, character, viewer, media[character.system_id],
            tags[character.system_id], identities[character.system_id],
        )
        for character in characters
    ]
```

- [ ] **Step 7: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_character_identity_router.py tests/api/test_character_router.py -q`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/schemas/character.py app/schemas/__init__.py app/services/domain/character_identities.py app/routers/character_identity.py app/main.py app/routers/character.py tests/api/test_character_identity_router.py
git commit -m "feat: character identity API, nested in the character response" -- app/schemas/character.py app/schemas/__init__.py app/services/domain/character_identities.py app/routers/character_identity.py app/main.py app/routers/character.py tests/api/test_character_identity_router.py
```

---

### Task 3: Deleting an identity folds its cast rows; merge carries identities

**Files:**
- Modify: `app/services/domain/merge_fill.py`
- Modify: `app/services/domain/character_identities.py`
- Modify: `app/routers/character_identity.py`, `app/routers/character.py`
- Test: `tests/api/test_character_identity_fold.py`

**Interfaces:**
- Consumes: Task 2's router and service.
- Produces: `merge_fill.absorb_casting(keep: CharacterCasting, drop: CharacterCasting) -> None` (fills keep's blanks from drop, appends drop's voices keep lacks; does NOT delete drop); `character_identities.fold_into_main(db, identity) -> int` (returns rows folded); `DELETE /api/character-identity/{id}?castings=N`.

- [ ] **Step 1: Write the failing tests**

`tests/api/test_character_identity_fold.py`:

```python
"""
Deleting an identity never deletes cast history: each of its cast rows either
becomes the main identity's row in that entry, or - when the main identity is
already cast there - is folded into that row, seiyuu unioned.

Every fold test gives the two rows DIFFERENT seiyuu, so the union has
something to prove, and a main row with a blank remark, so filling has
something to fill.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def identity(db_session, character):
    i = models.CharacterIdentity(system_id=uuid.uuid4(), character_id=character.system_id, name_en="Conan")
    db_session.add(i)
    db_session.flush()
    return i


def _person(db, name):
    p = models.Person(system_id=uuid.uuid4(), name_jp=name)
    db.add(p)
    db.flush()
    return p


def _row(db, character, anime, identity=None, person=None, remark=None):
    row = models.CharacterCasting(
        character_id=character.system_id,
        identity_id=identity.system_id if identity else None,
        media_type="anime",
        entry_id=anime.system_id,
        remark=remark,
    )
    if person is not None:
        row.voices = [models.CharacterCastingVoice(media_type="anime", entry_id=anime.system_id, person_id=person.system_id)]
    db.add(row)
    db.flush()
    return row


def _delete(admin_client, identity, count):
    return admin_client.delete(f"/api/character-identity/{identity.system_id}?castings={count}")


def test_a_stale_count_is_409(admin_client, db_session, character, anime, identity):
    _row(db_session, character, anime, identity)
    assert _delete(admin_client, identity, 0).status_code == 409


def test_a_lone_identity_row_becomes_the_main_row(admin_client, db_session, character, anime, identity):
    takayama = _person(db_session, "高山みなみ")
    row_id = _row(db_session, character, anime, identity, takayama, remark="glasses").system_id
    assert _delete(admin_client, identity, 1).status_code == 200
    db_session.expire_all()
    row = db_session.get(models.CharacterCasting, row_id)
    assert row.identity_id is None
    assert row.remark == "glasses"
    assert [v.person_id for v in row.voices] == [takayama.system_id]
    assert db_session.get(models.CharacterIdentity, identity.system_id) is None


def test_fold_keeps_the_main_row_main(admin_client, db_session, character, anime, identity):
    yamaguchi = _person(db_session, "山口勝平")
    takayama = _person(db_session, "高山みなみ")
    main_id = _row(db_session, character, anime, None, yamaguchi).system_id
    _row(db_session, character, anime, identity, takayama, remark="as Conan")
    assert _delete(admin_client, identity, 1).status_code == 200
    db_session.expire_all()
    rows = db_session.query(models.CharacterCasting).filter_by(character_id=character.system_id).all()
    assert [r.system_id for r in rows] == [main_id]
    assert rows[0].identity_id is None  # filling must not copy identity_id
    assert rows[0].remark == "as Conan"
    assert {v.person_id for v in rows[0].voices} == {yamaguchi.system_id, takayama.system_id}


def test_merge_moves_identities_to_the_survivor(admin_client, db_session, character, second_character, anime):
    stray = models.CharacterIdentity(system_id=uuid.uuid4(), character_id=second_character.system_id, name_en="Kid")
    db_session.add(stray)
    db_session.flush()
    _row(db_session, second_character, anime, stray)
    r = admin_client.post(f"/api/character/{character.system_id}/merge", json={"source_id": str(second_character.system_id)})
    assert r.status_code == 200
    db_session.expire_all()
    moved = db_session.get(models.CharacterIdentity, stray.system_id)
    assert moved.character_id == character.system_id
    row = db_session.query(models.CharacterCasting).filter_by(identity_id=stray.system_id).one()
    assert row.character_id == character.system_id


def test_merge_matches_castings_per_identity(admin_client, db_session, character, second_character, anime, identity):
    # The survivor's identity row and the loser's MAIN row share the entry but
    # not the identity, so they are different appearances and both survive.
    _row(db_session, character, anime, identity)
    _row(db_session, second_character, anime)
    _row(db_session, character, anime)  # survivor's main row - absorbs the loser's main row
    r = admin_client.post(f"/api/character/{character.system_id}/merge", json={"source_id": str(second_character.system_id)})
    assert r.status_code == 200
    db_session.expire_all()
    rows = db_session.query(models.CharacterCasting).filter_by(character_id=character.system_id).all()
    assert sorted(str(r.identity_id) for r in rows) == sorted([str(identity.system_id), "None"])
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_character_identity_fold.py -q`
Expected: FAIL — DELETE is 405; merge leaves the identity on the deleted character (CASCADE removes it).

- [ ] **Step 3: `absorb_casting`, and `identity_id` is never filled**

In `app/services/domain/merge_fill.py`, change `fill_blank_casting`'s skip tuple to include `"identity_id"`:

```python
        skip=(
            "character_id", "identity_id", "media_type", "entry_id", "position",
            *CASTING_IMAGE_COLUMNS,
        ),
```

and add below `fill_blank_casting`:

```python
def absorb_casting(keep, drop) -> None:
    """
    One appearance folded into another of the same entry: `keep`'s blanks
    filled from `drop`'s (fill_blank_casting), and every seiyuu `drop` has
    that `keep` lacks appended after `keep`'s own. The caller deletes `drop`.
    """
    from app import models

    fill_blank_casting(keep, drop)
    voiced = {v.person_id for v in keep.voices}
    for voice in list(drop.voices):
        if voice.person_id not in voiced:
            keep.voices.append(
                models.CharacterCastingVoice(
                    media_type=keep.media_type,
                    entry_id=keep.entry_id,
                    person_id=voice.person_id,
                    position=len(keep.voices),
                    remark=voice.remark,
                )
            )
```

(If `merge_fill.py` already imports `models` at module level, use that import instead of the local one.)

- [ ] **Step 4: Fold, and the DELETE route**

Append to `app/services/domain/character_identities.py`:

```python
from app.services.domain.merge_fill import absorb_casting


def fold_into_main(db: Session, identity: models.CharacterIdentity) -> int:
    """
    Hand every cast row of `identity` to its character's main identity: the
    row itself when the main identity is not cast in that entry, otherwise
    absorbed into the main identity's row there. Returns the rows handled.
    """
    rows = (
        db.query(models.CharacterCasting)
        .filter(models.CharacterCasting.identity_id == identity.system_id)
        .all()
    )
    for row in rows:
        main = (
            db.query(models.CharacterCasting)
            .filter(
                models.CharacterCasting.character_id == identity.character_id,
                models.CharacterCasting.identity_id.is_(None),
                models.CharacterCasting.media_type == row.media_type,
                models.CharacterCasting.entry_id == row.entry_id,
            )
            .first()
        )
        if main is None:
            row.identity_id = None
        else:
            absorb_casting(main, row)
            db.delete(row)
        db.flush()
    return len(rows)
```

(Move the import to the top of the module with the others.)

Append to `app/routers/character_identity.py` (import `fold_into_main` alongside the others):

```python
@router.delete("/{system_id}", summary="Delete Identity")
def delete_identity(
    system_id: UUID,
    castings: int = Query(..., description="Cast-row count the admin confirmed"),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Deletes an identity. Its cast rows are not deleted: they fold into the
    main identity (character_identities.fold_into_main).

    `castings` is the count the confirmation showed and is required, as on
    character delete: a count that moved underneath the dialog is 409.
    """
    identity = _load(db, admin, system_id)
    actual = identity_casting_count(db, system_id)
    if actual != castings:
        raise HTTPException(
            status_code=409,
            detail=f"This identity now has {actual} cast rows, not {castings}. Reload and confirm again.",
        )
    fold_into_main(db, identity)
    db.delete(identity)
    db.commit()
    return {"status": "success", "castings_folded": actual}
```

- [ ] **Step 5: Merge carries identities**

In `merge_character` (`app/routers/character.py`), import `absorb_casting` from `merge_fill` (alongside `fill_blank_casting, finish_merge`) and replace everything from `held = {` down to (not including) `merge_character_tags(...)` with:

```python
    # The loser's identities move to the survivor first, after its own. Their
    # cast rows move with them below, unmatched: no survivor row names a
    # loser's identity. fk_casting_identity is deferred, so the identity and
    # its rows may change in either order inside this flush.
    offset = len(keep.identities)
    for identity in (
        db.query(models.CharacterIdentity)
        .filter_by(character_id=payload.source_id)
        .order_by(models.CharacterIdentity.position)
        .all()
    ):
        identity.character_id = system_id
        identity.position += offset

    held = {
        (c.identity_id, c.media_type, c.entry_id): c
        for c in db.query(models.CharacterCasting)
        .filter_by(character_id=system_id)
        .all()
    }
    moved = 0
    for casting in (
        db.query(models.CharacterCasting)
        .filter_by(character_id=payload.source_id)
        .all()
    ):
        kept = held.get((casting.identity_id, casting.media_type, casting.entry_id))
        if kept is not None:
            absorb_casting(kept, casting)
            db.delete(casting)
            continue
        casting.character_id = system_id
        moved += 1
```

Update the docstring's second paragraph to say castings are matched per identity and the loser's identities move to the survivor.

- [ ] **Step 6: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_character_identity_fold.py tests/api/test_character_router.py tests/api/test_character_identity_router.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/services/domain/merge_fill.py app/services/domain/character_identities.py app/routers/character_identity.py app/routers/character.py tests/api/test_character_identity_fold.py
git commit -m "feat: identity delete folds cast rows into the main identity; merge carries identities" -- app/services/domain/merge_fill.py app/services/domain/character_identities.py app/routers/character_identity.py app/routers/character.py tests/api/test_character_identity_fold.py
```

---

### Task 4: Cast rows carry an identity

**Files:**
- Modify: `app/services/domain/casting.py`, `app/routers/casting.py`, `app/routers/character.py` (`get_character_entries`)
- Test: `tests/api/test_casting_identities.py`

**Interfaces:**
- Consumes: Task 1 column, Task 2 model relationship.
- Produces: cast row dicts gain `identity_id: str | None`, `identity_name: str | None`; `CastRowIn.identity_id: Optional[UUID]`; `/api/character/{id}/entries` entries gain `casting_id: str`, `identity_id: str | None`, `identity_name: str | None`.

- [ ] **Step 1: Write the failing tests**

`tests/api/test_casting_identities.py`:

```python
"""Cast rows that name an identity: PUT validation, GET shape, photo fallback, /entries."""

import uuid

import pytest

from app import models


@pytest.fixture
def identity(db_session, character):
    i = models.CharacterIdentity(system_id=uuid.uuid4(), character_id=character.system_id, name_en="Conan")
    db_session.add(i)
    db_session.flush()
    return i


def _put(admin_client, anime, rows):
    return admin_client.put(f"/api/casting/anime/{anime.system_id}", json={"cast": rows})


def _row(character, identity=None, **extra):
    row = {"character_id": str(character.system_id), **extra}
    if identity is not None:
        row["identity_id"] = str(identity.system_id)
    return row


def test_main_and_identity_rows_round_trip(admin_client, anime, character, identity):
    assert _put(admin_client, anime, [_row(character), _row(character, identity)]).status_code == 200
    cast = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert [(r["identity_id"], r["identity_name"]) for r in cast] == [
        (None, None),
        (str(identity.system_id), "Conan"),
    ]


def test_put_rejects_an_identity_of_another_character(admin_client, db_session, anime, character, second_character):
    stranger = models.CharacterIdentity(system_id=uuid.uuid4(), character_id=second_character.system_id, name_en="Kid")
    db_session.add(stranger)
    db_session.flush()
    r = _put(admin_client, anime, [_row(character, stranger)])
    assert r.status_code == 422
    assert "does not belong" in r.json()["detail"]


def test_put_rejects_an_unknown_identity(admin_client, anime, character):
    r = _put(admin_client, anime, [{"character_id": str(character.system_id), "identity_id": str(uuid.uuid4())}])
    assert r.status_code == 422


def test_put_rejects_one_identity_twice(admin_client, anime, character, identity):
    r = _put(admin_client, anime, [_row(character, identity), _row(character, identity)])
    assert r.status_code == 422


def test_put_still_rejects_the_main_identity_twice(admin_client, anime, character):
    assert _put(admin_client, anime, [_row(character), _row(character)]).status_code == 422


def test_photo_falls_back_row_then_identity_then_character(admin_client, db_session, anime, character, identity):
    identity.photo_file = "character-identity/conan.jpg"
    db_session.flush()
    rows = [
        _row(character),
        _row(character, identity),
    ]
    assert _put(admin_client, anime, rows).status_code == 200
    cast = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert cast[0]["photo_file"] == "characters/ichika.jpg"
    assert cast[1]["photo_file"] == "character-identity/conan.jpg"
    rows[1]["photo_file"] = "character/own.jpg"
    assert _put(admin_client, anime, rows).status_code == 200
    cast = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert cast[1]["photo_file"] == "character/own.jpg"


def test_entries_lists_each_identity_appearance(admin_client, client, anime, character, identity):
    assert _put(admin_client, anime, [_row(character), _row(character, identity)]).status_code == 200
    groups = client.get(f"/api/character/{character.system_id}/entries").json()["groups"]
    entries = [e for g in groups for e in g["entries"]]
    assert len(entries) == 2
    assert len({e["casting_id"] for e in entries}) == 2
    assert sorted(str(e["identity_name"]) for e in entries) == ["Conan", "None"]
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_casting_identities.py -q`
Expected: FAIL — `KeyError: 'identity_id'` / 200 where 422 expected.

- [ ] **Step 3: `CastRowIn`**

In `app/routers/casting.py`, `CastRowIn` gains after `character_id`:

```python
    # NULL is the character's main identity; otherwise one of ITS identities
    # (casting_service._validate_rows checks which).
    identity_id: Optional[UUID] = None
```

- [ ] **Step 4: Service — read, validate, write**

In `app/services/domain/casting.py`:

`casting_rows`: after `characters = {...}` add

```python
    identity_ids = {c.identity_id for c in castings if c.identity_id}
    identities = (
        {
            i.system_id: i
            for i in db.query(models.CharacterIdentity).filter(
                models.CharacterIdentity.system_id.in_(identity_ids)
            )
        }
        if identity_ids
        else {}
    )
```

and in the row loop replace the `photo_file`/`photo_focus` entries with a three-step fallback, adding the identity keys:

```python
        identity = identities.get(casting.identity_id) if casting.identity_id else None
        # Row's own photo, then the identity's, then the character's; the
        # focus travels with whichever photo won.
        if casting.photo_file:
            photo_file, photo_focus = casting.photo_file, casting.photo_focus
        elif identity is not None and identity.photo_file:
            photo_file, photo_focus = identity.photo_file, identity.photo_focus
        elif character is not None:
            photo_file, photo_focus = character.photo_file, character.photo_focus
        else:
            photo_file = photo_focus = None
```

```python
                "identity_id": str(casting.identity_id) if casting.identity_id else None,
                "identity_name": identity.display_name if identity else None,
                ...
                "photo_file": photo_file,
                "photo_focus": photo_focus,
```

`_validate_rows`: replace the repeated-character loop with a per-appearance key, and add the identity check:

```python
    seen: set = set()
    for row in rows:
        if not row.get("character_id"):
            continue
        key = (row["character_id"], row.get("identity_id"))
        if key in seen:
            raise CastingValidationError(
                f"Character {row['character_id']} is cast twice as the same identity in the same payload."
            )
        seen.add(key)
```

and after the unknown-character check:

```python
    wanted = {
        row["identity_id"]: row["character_id"]
        for row in rows
        if row.get("identity_id")
    }
    if wanted:
        owners = {
            i.system_id: i.character_id
            for i in db.query(
                models.CharacterIdentity.system_id, models.CharacterIdentity.character_id
            ).filter(models.CharacterIdentity.system_id.in_(set(wanted)))
        }
        for identity_id, character_id in wanted.items():
            if identity_id not in owners:
                raise CastingValidationError(f"Unknown identity id: {identity_id}.")
            if owners[identity_id] != character_id:
                raise CastingValidationError(
                    f"Identity {identity_id} does not belong to character {character_id}."
                )
```

Keep `character_ids = [...]` (still used by the unknown-character query) — only the duplicate loop is replaced.

`replace_casting`: the `models.CharacterCasting(...)` call gains `identity_id=row.get("identity_id"),`. Update the docstring's 422 list: "a (character, identity) repeated within the payload, an identity that is unknown or belongs to another character".

- [ ] **Step 5: `/entries` carries the appearance**

In `get_character_entries` (`app/routers/character.py`), after `people = {...}` load identities:

```python
    identity_ids = {r.identity_id for r in rows if r.identity_id}
    identities = {
        i.system_id: i
        for i in db.query(models.CharacterIdentity).filter(
            models.CharacterIdentity.system_id.in_(identity_ids)
        )
    } if identity_ids else {}
```

and in `payload.append({...})` add:

```python
                # One entry appears once per identity cast in it, so the
                # casting - not the entry - is what tells two cards apart.
                "casting_id": str(row.system_id),
                "identity_id": str(row.identity_id) if row.identity_id else None,
                "identity_name": (
                    identities[row.identity_id].display_name
                    if row.identity_id in identities
                    else None
                ),
```

- [ ] **Step 6: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_casting_identities.py tests/api/test_casting_router.py tests/api/test_casting_voices.py tests/api/test_character_router.py -q`
Expected: PASS. (If an existing test asserted the old "cast twice in the same payload" message text, update its expected substring to "cast twice".)

- [ ] **Step 7: Commit**

```bash
git add app/services/domain/casting.py app/routers/casting.py app/routers/character.py tests/api/test_casting_identities.py
git commit -m "feat: cast rows name an identity" -- app/services/domain/casting.py app/routers/casting.py app/routers/character.py tests/api/test_casting_identities.py
```

---

### Task 5: `character-identity` as an image owner

**Files:**
- Modify: `app/services/integrations/image_manager.py`, `app/routers/images.py`, `app/routers/covers.py`, `app/services/rbac/shared_visibility.py`, `app/services/calculation.py`
- Test: `tests/api/test_identity_images.py`

**Interfaces:**
- Consumes: `models.CharacterIdentity`.
- Produces: owner type `"character-identity"` accepted by `cover_key`, `POST /api/images/{id}/attach` (mirrors to `photo_file`/`photo_focus`), served by `GET /api/covers/character-identity/<id>.jpg`; `shared_visibility.identity_visible(db, viewer, identity_id) -> bool`.

- [ ] **Step 1: Write the failing tests**

`tests/api/test_identity_images.py`:

```python
"""An identity owns a cover image like a character does - and is hidden with it."""

import os
import uuid

import pytest

from app import models
from app.services.calculation import bulk_check_unused_cover_images
from app.services.integrations import image_manager
from tests.api.conftest import hidden_anime, nsfw_label  # noqa: F401


@pytest.fixture
def identity(db_session, character):
    i = models.CharacterIdentity(system_id=uuid.uuid4(), character_id=character.system_id, name_en="Conan")
    db_session.add(i)
    db_session.flush()
    return i


def test_cover_key_accepts_the_owner_type(identity):
    assert image_manager.cover_key("character-identity", str(identity.system_id)) == (
        f"character-identity/{identity.system_id}.jpg"
    )


def test_identity_cover_is_not_an_orphan(db_session, identity, tmp_path, monkeypatch):
    key = image_manager.cover_key("character-identity", str(identity.system_id))
    identity.photo_file = key
    db_session.flush()
    monkeypatch.setattr("app.services.calculation.list_all_cover_images", lambda: [key])
    result = bulk_check_unused_cover_images(db_session)
    assert key not in [o["file"] if isinstance(o, dict) else o for o in result.get("orphaned", [])]


def test_unrecorded_identity_cover_is_should_use_not_orphan(db_session, identity, monkeypatch):
    key = image_manager.cover_key("character-identity", str(identity.system_id))
    monkeypatch.setattr("app.services.calculation.list_all_cover_images", lambda: [key])
    result = bulk_check_unused_cover_images(db_session)
    assert result.get("orphaned", []) == []


def test_identity_cover_is_hidden_with_its_character(
    client, admin_client, db_session, character, identity, hidden_anime, tmp_path, monkeypatch
):
    # The character's only casting is on a label-hidden entry: the guest
    # cannot see the character, so must not get its identity's picture.
    db_session.add(models.CharacterCasting(character_id=character.system_id, media_type="anime", entry_id=hidden_anime.system_id))
    db_session.flush()
    folder = tmp_path / "character-identity"
    folder.mkdir()
    (folder / f"{identity.system_id}.jpg").write_bytes(b"\xff\xd8\xff")
    monkeypatch.setattr("app.routers.covers.COVER_DIR", str(tmp_path))
    url = f"/api/covers/character-identity/{identity.system_id}.jpg"
    assert client.get(url).status_code == 404
    assert admin_client.get(url).status_code == 200
```

Before writing the assertions on `bulk_check_unused_cover_images`, read its return value in `app/services/calculation.py` (the function after line 102) and make the two orphan assertions match its actual shape — the lists may hold dicts or keys. The point of each test is fixed: a recorded identity cover is not orphaned; an unrecorded one whose identity exists is `should_use`, not `orphaned`.

- [ ] **Step 2: Run to verify failure**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_identity_images.py -q`
Expected: FAIL — `ValueError: Unknown cover owner type 'character-identity'`.

- [ ] **Step 3: Register the owner everywhere it is listed**

`app/services/integrations/image_manager.py` — `COVER_OWNERS` set gains `"character-identity"`; update its comment ("staff and character portraits, character identity portraits, publisher and studio logos").

`app/routers/images.py`:
- `ATTACHABLE_OWNERS` gains `"character-identity"`.
- `MIRROR_COLUMNS` gains `"character-identity": "photo_file",`.
- `FOCUS_COLUMNS` gains `"character-identity": "photo_focus",`.
- `_ENTITY_MODELS` gains `"character-identity": models.CharacterIdentity,`.
- In `_require_reachable_owner`, before the `elif owner_type in ENTITY_OWNER_MODELS:` branch add:

```python
    elif owner_type == IDENTITY_OWNER:
        if not identity_visible(db, viewer, owner_id):
            raise HTTPException(status_code=404, detail="Entry not found.")
```

and import `IDENTITY_OWNER, identity_visible` from `app.services.rbac.shared_visibility`.

`app/services/rbac/shared_visibility.py`, after `ENTITY_OWNER_MODELS`:

```python
# A character identity is not a shared record of its own: it is seen exactly
# when its character is. Kept out of ENTITY_OWNER_MODELS on purpose - that
# map's contract is "the model whose own appearances decide visibility".
IDENTITY_OWNER = "character-identity"


def identity_visible(db: Session, viewer, identity_id) -> bool:
    """Whether `viewer` may see this identity - i.e. its character."""
    character_id = (
        db.query(models.CharacterIdentity.character_id)
        .filter(models.CharacterIdentity.system_id == identity_id)
        .scalar()
    )
    if character_id is None:
        return False
    return shared_record_visible(db, viewer, models.Character, character_id)
```

(Check the module's existing `Session` import name and `shared_record_visible` signature and match them.)

`app/routers/covers.py`, in `_owner_hidden`, before `model = ENTITY_OWNER_MODELS.get(owner_type)`:

```python
    if owner_type == IDENTITY_OWNER:
        return not identity_visible(db, viewer, owner_id)
```

with the matching import.

`app/services/calculation.py` — `COVER_OWNER_TABLES` gains `("character-identity", CharacterIdentity, "photo_file"),` (import `CharacterIdentity` from `app.models` beside `CharacterCasting`).

- [ ] **Step 4: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_identity_images.py tests/api/test_cover_image_bulk.py tests/unit/test_image_manager.py -q`
Expected: PASS. Then restart nothing — `app/main.py` creates `static/covers/<owner>/` for every `COVER_OWNERS` entry at import, so the folder appears on the next start.

- [ ] **Step 5: Commit**

```bash
git add app/services/integrations/image_manager.py app/routers/images.py app/routers/covers.py app/services/rbac/shared_visibility.py app/services/calculation.py tests/api/test_identity_images.py
git commit -m "feat: identities own a cover image, hidden with their character" -- app/services/integrations/image_manager.py app/routers/images.py app/routers/covers.py app/services/rbac/shared_visibility.py app/services/calculation.py tests/api/test_identity_images.py
```

---

### Task 6: Google Sheets — the Character Identity tab

**Files:**
- Modify: `app/utils/formatter.py`, `app/services/pipelines/tabs.py`
- Test: `tests/api/test_character_identity_sheets.py`, `tests/api/test_sheet_restore_order.py`

**Interfaces:**
- Produces: `formatter.parse_character_identity_from_sheet(raw) -> dict`; tab `"Character Identity"` registered between `"Character"` and `"Character Casting"`; `parse_character_casting_from_sheet` returns `identity_id`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/api/test_sheet_restore_order.py`:

```python
def test_character_identity_sits_between_character_and_its_castings():
    # character_identity.character_id is a real FK, and a cast row's
    # identity_id must find its identity.
    assert _at("Character") < _at("Character Identity") < _at("Character Casting")
```

`tests/api/test_character_identity_sheets.py`, modelled on `tests/api/test_resources_sheets.py` (copy its `db`, `sheets`, `_force_deferred_checks` helpers and its backup-capture approach):

```python
"""Character Identity travels through Backup and Pull, and so does a cast row's identity_id."""

import uuid

import pytest
from sqlalchemy import text

from app import models
from app.services.pipelines import backup, pull
from app.services.pipelines.tabs import TAB_BY_NAME


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


def _backed_up(db, monkeypatch):
    written = {}

    def record(tab, matrix):
        written[tab] = matrix
        return True

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", record)
    backup.execute_backup(db)
    return written


def test_the_tab_is_registered():
    assert TAB_BY_NAME["Character Identity"].model is models.CharacterIdentity


def test_identities_and_cast_identity_round_trip(db, sheets, monkeypatch, character, anime):
    identity = models.CharacterIdentity(
        system_id=uuid.uuid4(), character_id=character.system_id,
        name_en="Conan", gender="男", remark="glasses", position=0,
    )
    db.add(identity)
    db.flush()
    casting = models.CharacterCasting(
        character_id=character.system_id, identity_id=identity.system_id,
        media_type="anime", entry_id=anime.system_id,
    )
    db.add(casting)
    db.flush()
    written = _backed_up(db, monkeypatch)
    assert "identity_id" in written["Character Casting"][0]

    db.delete(casting)
    db.delete(identity)
    db.flush()

    # Pull reads the tabs as list-of-dicts rows; build them from the matrices.
    def rows(matrix):
        header, *body = matrix
        return [dict(zip(header, r)) for r in body]

    sheets({name: rows(m) for name, m in written.items()})
    pull.execute_pull_specific(db, "Character Identity")
    pull.execute_pull_specific(db, "Character Casting")
    db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))

    restored = db.get(models.CharacterIdentity, identity.system_id)
    assert (restored.name_en, restored.remark, restored.character_id) == ("Conan", "glasses", character.system_id)
    row = db.query(models.CharacterCasting).filter_by(entry_id=anime.system_id).one()
    assert row.identity_id == identity.system_id
```

Before running, read `tests/api/test_resources_sheets.py` past line 90 to see exactly how it feeds `pull` (the shape `get_all_raw_rows` returns and the real signature of `execute_pull_specific`), and match it — the `rows()` adapter and the call above are the intended behaviour, not a guess to keep if the real API differs.

Add one more test for an older sheet:

```python
def test_a_casting_tab_without_identity_id_restores_main_rows(db, sheets, character, anime):
    row = {
        "system_id": str(uuid.uuid4()), "character_id": str(character.system_id),
        "media_type": "anime", "entry_id": str(anime.system_id), "position": "0",
    }
    sheets({"Character Casting": [row]})
    pull.execute_pull_specific(db, "Character Casting")
    restored = db.query(models.CharacterCasting).filter_by(entry_id=anime.system_id).one()
    assert restored.identity_id is None
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_character_identity_sheets.py tests/api/test_sheet_restore_order.py -q`
Expected: FAIL — `KeyError: 'Character Identity'`.

- [ ] **Step 3: Parser and tab**

`app/utils/formatter.py`, after `parse_character_from_sheet`:

```python
def parse_character_identity_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Character Identity sheet into typed data
    ready for the Database. The Character tab restores first, so character_id
    round-trips as a plain UUID.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "character_id": _uuid_or_none(raw.get("character_id")),
        "name_en": parse_from_sheet(raw.get("name_en"), str),
        "name_cn": parse_from_sheet(raw.get("name_cn"), str),
        "name_jp": parse_from_sheet(raw.get("name_jp"), str),
        "name_alt": parse_from_sheet(raw.get("name_alt"), str),
        "display_name_field": parse_from_sheet(raw.get("display_name_field"), str),
        "gender": normalize_gender(parse_from_sheet(raw.get("gender"), str)),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "photo_file": parse_from_sheet(raw.get("photo_file"), str),
        "photo_focus": _focus_from_sheet(raw.get("photo_focus")),
        "position": parse_from_sheet(raw.get("position"), int) or 0,
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }
```

`parse_character_casting_from_sheet` gains, after `character_id`:

```python
        # Blank on a sheet from before identities existed: the main identity.
        "identity_id": _uuid_or_none(raw.get("identity_id")),
```

`app/services/pipelines/tabs.py`, directly after the `"Character"` `SheetTab(...)`:

```python
    # After Character (character_identity.character_id is a real FK) and
    # before Character Casting, whose identity_id must find its identity.
    SheetTab(
        "Character Identity",
        models.CharacterIdentity,
        f.parse_character_identity_from_sheet,
    ),
```

Add `Character -> Character Identity -> Character Casting` to the module docstring's chain list.

- [ ] **Step 4: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_character_identity_sheets.py tests/api/test_sheet_restore_order.py tests/api/test_sheet_tabs.py tests/api/test_multi_user_sheet_roundtrip.py -q`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite** (with the lock — see Global Constraints)

Expected: all green. This closes the backend.

- [ ] **Step 6: Commit**

```bash
git add app/utils/formatter.py app/services/pipelines/tabs.py tests/api/test_character_identity_sheets.py tests/api/test_sheet_restore_order.py
git commit -m "feat: Character Identity sheet tab, identity_id on Character Casting" -- app/utils/formatter.py app/services/pipelines/tabs.py tests/api/test_character_identity_sheets.py tests/api/test_sheet_restore_order.py
```

---

### Task 7: Cast editor Identity field and cast list headline

**Files:**
- Modify: `frontend/src/api/endpoints.js`
- Modify: `frontend/src/components/forms/CastEditor.jsx`, `frontend/src/components/forms/CastEditor.test.jsx`
- Modify: `frontend/src/components/info/CastSection.jsx`

**Interfaces:**
- Consumes: `/api/character-identity/?character_id=` (Task 2), cast rows with `identity_id`/`identity_name` (Task 4).
- Produces: `endpoints.characterIdentity = { list(qs), detail(id), create(), update(id), remove(id, castings) }`; editor rows carry `identity_id: string|null`, `identity_name: string`.

- [ ] **Step 1: Endpoints**

In `frontend/src/api/endpoints.js`, after the `character: {...}` block:

```js
  // A character's other identities (admin-only). `list` takes
  // character_id= and/or name=.
  characterIdentity: {
    list: (qs = "") => `/api/character-identity/${qs ? `?${qs}` : ""}`,
    detail: (id) => `/api/character-identity/${id}`,
    create: () => "/api/character-identity/",
    update: (id) => `/api/character-identity/${id}`,
    // The cast-row count the admin confirmed; 409 if it moved.
    remove: (id, castings) => `/api/character-identity/${id}?castings=${castings}`,
  },
```

- [ ] **Step 2: Write the failing tests**

Read `frontend/src/components/forms/CastEditor.test.jsx` first and follow its render/mocking helpers (how it stubs `fetch` and renders `CastEditor` with `value`/`onChange`). Add:

```jsx
describe("Identity field", () => {
  it("is disabled until the row has a character", () => {
    renderEditor({ value: [emptyCastRow()] });
    expect(screen.getByRole("combobox", { name: /identity/i })).toBeDisabled();
  });

  it("lists only the chosen character's identities", async () => {
    mockFetch({
      "/api/character-identity/?character_id=c1": [
        { system_id: "i1", display_name: "Conan", character_id: "c1" },
      ],
    });
    renderEditor({ value: [{ ...emptyCastRow(), character_id: "c1", character_name: "Shinichi" }] });
    await userEvent.click(screen.getByRole("combobox", { name: /identity/i }));
    expect(await screen.findByText("Conan")).toBeInTheDocument();
  });

  it("clears the identity when the character changes", async () => {
    const onChange = vi.fn();
    renderEditor({
      value: [{ ...emptyCastRow(), character_id: "c1", character_name: "Shinichi", identity_id: "i1", identity_name: "Conan" }],
      onChange,
    });
    await userEvent.click(screen.getByRole("button", { name: /clear character/i }));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ character_id: null, identity_id: null, identity_name: "" }),
    ]);
  });

  it("creates a new identity under the row's character", async () => {
    const posted = mockFetchPost("/api/character-identity/", { system_id: "i9", display_name: "Kid" });
    renderEditor({ value: [{ ...emptyCastRow(), character_id: "c1", character_name: "Kaito" }] });
    const box = screen.getByRole("combobox", { name: /identity/i });
    await userEvent.type(box, "Kid");
    await userEvent.click(await screen.findByText('Create new identity named "Kid"'));
    expect(JSON.parse(posted.mock.calls[0][1].body)).toEqual({ character_id: "c1", name_cn: "Kid", display_name_field: "cn" });
  });
});
```

`renderEditor`, `emptyCastRow`, `mockFetch`, `mockFetchPost` stand for whatever the existing test file already uses for the same jobs; if it lacks one, write it in that file in the existing style. The clear-button and combobox accessible names must match what ComboBox actually renders — read `ComboBox.jsx` and use its real labels.

- [ ] **Step 3: Run to verify failure**

Run: `cd frontend && npx vitest run src/components/forms/CastEditor.test.jsx`
Expected: FAIL — no "identity" combobox.

- [ ] **Step 4: Implement the Identity field**

In `CastEditor.jsx`:

1. Add `identity_id: null, identity_name: "",` to `emptyRow()` and to `importedRow()` (`identity_id: source.identity_id || null, identity_name: source.identity_name || "",`).
2. `appendCast`'s "already held" check keys on the appearance:

```js
    const appearance = (r) => `${r.character_id}:${r.identity_id || ""}`;
    const held = new Set(current.filter((r) => r.character_id).map(appearance));
    const incoming = (cast || []).filter((r) => !held.has(appearance(r)));
```

3. Add a sentinel and per-character identity cache below `CREATE_CHARACTER_PREFIX`:

```js
// The same idea for an identity: "mint a new identity of this row's
// character with this typed name". An identity is always created under the
// row's character - never free-standing.
const CREATE_IDENTITY_PREFIX = "__create_identity__:";
```

and in the component, beside `characterResults`:

```js
  // character_id -> that character's identities, fetched once per character
  // the first time a row with it is shown.
  const [identitiesByCharacter, setIdentitiesByCharacter] = useState({});
  const characterIdsKey = rows.map((r) => r.character_id).filter(Boolean).join(",");
  useEffect(() => {
    const missing = [...new Set(characterIdsKey.split(",").filter(Boolean))].filter(
      (id) => !(id in identitiesByCharacter),
    );
    missing.forEach((id) => {
      const qs = new URLSearchParams({ character_id: id }).toString();
      fetch(endpoints.characterIdentity.list(qs), { credentials: "include" })
        .then((res) => (res.ok ? res.json() : []))
        .then((list) =>
          setIdentitiesByCharacter((prev) => ({ ...prev, [id]: Array.isArray(list) ? list : [] })),
        )
        .catch(() => {
          /* best effort - the identity box offers only "create" */
        });
    });
    // identitiesByCharacter is read, not depended on: a fetched character is
    // never fetched again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterIdsKey]);

  function identityItems(row) {
    const typed = (row.identity_name || "").trim();
    const items = (identitiesByCharacter[row.character_id] || []).map((identity) => ({
      id: identity.system_id,
      label: identity.display_name,
      searchText: identity.display_name,
    }));
    if (typed && !items.some((item) => item.label === typed)) {
      items.push({
        id: `${CREATE_IDENTITY_PREFIX}${typed}`,
        label: `Create new identity named "${typed}"`,
        searchText: typed,
      });
    }
    return items;
  }

  async function handleIdentitySelect(i, id) {
    const row = latestRows.current[i];
    if (!id.startsWith(CREATE_IDENTITY_PREFIX)) {
      const found = (identitiesByCharacter[row.character_id] || []).find((x) => x.system_id === id);
      updateRow(i, { identity_id: id, identity_name: found?.display_name || "" });
      return;
    }
    const name = id.slice(CREATE_IDENTITY_PREFIX.length);
    try {
      const res = await fetch(endpoints.characterIdentity.create(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: row.character_id, name_cn: name, display_name_field: "cn" }),
        credentials: "include",
      });
      if (!res.ok) return;
      const created = await res.json();
      setIdentitiesByCharacter((prev) => ({
        ...prev,
        [row.character_id]: [...(prev[row.character_id] || []), created],
      }));
      updateRow(i, { identity_id: created.system_id, identity_name: created.display_name || name });
    } catch {
      /* leave the row untouched - the admin can retry */
    }
  }
```

4. Every place that changes a row's character also clears the identity: in `handleCharacterSelect` both `updateRow` calls gain `identity_id: null, identity_name: ""`, and the character ComboBox's `onClear` becomes `updateRow(i, { character_id: null, character_name: "", identity_id: null, identity_name: "" })`.

5. Render the Identity box right after the Character box `<div className={NAME_CELL} aria-label="Character">…</div>`:

```jsx
                {/* Empty is the character's main identity. Disabled until the
                    row has a character: an identity is always one of THAT
                    character's, and "Create new identity" makes it under it. */}
                <div className={NAME_CELL} aria-label="Identity">
                  <ComboBox
                    items={row.character_id ? identityItems(row) : []}
                    selectedId={row.identity_id || null}
                    inputText={row.identity_name || ""}
                    disabled={!row.character_id}
                    onSelect={(id) => handleIdentitySelect(i, id)}
                    onType={(text) => updateRow(i, { identity_name: text, identity_id: null })}
                    onClear={() => updateRow(i, { identity_id: null, identity_name: "" })}
                    placeholder="Main identity"
                  />
                </div>
```

If `ComboBox` has no `disabled` prop, add one in `ComboBox.jsx` that sets `disabled` on its input and suppresses the dropdown, and an `ariaLabel` prop if the test needs the accessible name on the input itself.

6. `useReplaceCasting` already spreads `...row`; make sure a blank identity is sent as null. In `frontend/src/hooks/useCasting.js`'s row map add `identity_id: row.identity_id || null,` after `...row,`, and strip `identity_name` (server ignores it, but keep the body clean): `const { identity_name: _identityName, ...rest } = row;` and spread `rest` instead of `row`.

- [ ] **Step 5: Cast list headline**

In `CastSection.jsx`, `CastRow`: replace the single character `<Link>` with the identity first when there is one:

```jsx
        <Link
          to={entityPath("character", {
            public_id: row.character_public_id,
            display_name: row.character_name,
          }) + (row.identity_id ? `#identity-${row.identity_id}` : "")}
          className={castLinkCls}
        >
          {row.identity_name || row.character_name || "Unknown"}
        </Link>
        {row.identity_name && (
          <span className="text-text-faint text-xs">({row.character_name})</span>
        )}
```

- [ ] **Step 6: Fast checks**

Run: `cd frontend && npx vitest run src/components/forms src/components/info && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/endpoints.js frontend/src/components/forms/CastEditor.jsx frontend/src/components/forms/CastEditor.test.jsx frontend/src/components/forms/ComboBox.jsx frontend/src/hooks/useCasting.js frontend/src/components/info/CastSection.jsx
git commit -m "feat: cast editor Identity field; cast list shows the identity" -- frontend/src/api/endpoints.js frontend/src/components/forms/CastEditor.jsx frontend/src/components/forms/CastEditor.test.jsx frontend/src/components/forms/ComboBox.jsx frontend/src/hooks/useCasting.js frontend/src/components/info/CastSection.jsx
```

(Drop `ComboBox.jsx` from both lists if Step 4.5 did not touch it.)

---

### Task 8: Character page — Identities section and per-identity appearances

**Files:**
- Modify: `frontend/src/pages/detail/Character.jsx`
- Test: `frontend/src/pages/detail/Character.test.jsx` (create if absent, in the style of the nearest detail-page test)

**Interfaces:**
- Consumes: `character.identities` (Task 2), entries' `casting_id`/`identity_name` (Task 4).

- [ ] **Step 1: Write the failing test**

```jsx
it("lists identities and one appearance card per cast row", async () => {
  mockFetch({
    "/api/character/7": {
      system_id: "c1", public_id: 7, display_name: "Kudo Shinichi", identities: [
        { system_id: "i1", display_name: "Edogawa Conan", display_gender: "男", remark: "glasses", display_photo_file: null },
      ],
    },
    "/api/character/c1/entries": { groups: [{ media_type: "anime", nav_path: "/anime", entries: [
      { system_id: "e1", casting_id: "k1", display_name: "Detective Conan", identity_name: null, seiyuu: [] },
      { system_id: "e1", casting_id: "k2", display_name: "Detective Conan", identity_name: "Edogawa Conan", seiyuu: [] },
    ] }] },
  });
  renderAt("/character/7");
  expect(await screen.findByRole("heading", { name: /identities/i })).toBeInTheDocument();
  expect(screen.getByText("glasses")).toBeInTheDocument();
  expect(screen.getAllByText("Detective Conan")).toHaveLength(2);
  expect(screen.getByText("as Edogawa Conan")).toBeInTheDocument();
});
```

(Use the repo's existing router/fetch test helpers; `renderAt`/`mockFetch` name their jobs.)

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/pages/detail/Character.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `Character.jsx`:

1. Keys: `<CastingCard key={entry.casting_id ?? entry.system_id} …/>`.
2. In `CastingCard`, under the title's `<h3>` inside `facts`, add:

```jsx
      {entry.identity_name && (
        <span className="text-xs text-text-muted truncate">as {entry.identity_name}</span>
      )}
```

3. A hash-aware Identities section, placed after the remark block and before the appearances groups:

```jsx
          {character.identities?.length > 0 && (
            <section>
              <h2 className="flex items-center gap-3 mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                Identities
                <span className="text-text-faint">{character.identities.length}</span>
                <span className="flex-1 border-t border-dotted border-border-strong/60" />
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {character.identities.map((identity) => (
                  <IdentityCard
                    key={identity.system_id}
                    identity={identity}
                    highlighted={hash === `#identity-${identity.system_id}`}
                  />
                ))}
              </div>
            </section>
          )}
```

with `const { hash } = useLocation();` (import `useLocation` from react-router-dom) and an effect that scrolls the highlighted card into view once the character has loaded:

```jsx
  useEffect(() => {
    if (!character || !hash.startsWith("#identity-")) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [character, hash]);
```

and the card, below `CastingCard`:

```jsx
// One of the character's other identities. `highlighted` when the URL's hash
// names it - a library identity card and a cast row both link here that way.
function IdentityCard({ identity, highlighted }) {
  return (
    <div
      id={`identity-${identity.system_id}`}
      className={`bg-surface border flex flex-col ${
        highlighted ? "border-brand ring-2 ring-brand" : "border-border"
      }`}
    >
      <div className="bg-surface-2 overflow-hidden" style={{ aspectRatio: "2/3" }}>
        <img
          loading="lazy"
          src={getCoverUrl(identity.display_photo_file)}
          alt=""
          className="w-full h-full object-cover"
          style={focusStyle(identity.display_photo_focus)}
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>
      <div className="p-2.5 flex flex-col gap-1 border-t border-border">
        <h3 className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight">
          {identity.display_name}
        </h3>
        {identity.display_gender && (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
            {identity.display_gender}
          </span>
        )}
        {identity.remark && <p className="text-xs text-text-muted whitespace-pre-line">{identity.remark}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Fast checks**

Run: `cd frontend && npx vitest run src/pages/detail && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/detail/Character.jsx frontend/src/pages/detail/Character.test.jsx
git commit -m "feat: character page lists identities and per-identity appearances" -- frontend/src/pages/detail/Character.jsx frontend/src/pages/detail/Character.test.jsx
```

---

### Task 9: Character library — identity cards and filters

**Files:**
- Create: `frontend/src/lib/characterCards.js`, `frontend/src/lib/characterCards.test.js`
- Modify: `frontend/src/lib/entityFilters.js`, `frontend/src/pages/library/CharacterLibrary.jsx`, `frontend/src/pages/library/CharacterLibrary.test.jsx`

**Interfaces:**
- Consumes: `CharacterResponse.identities` (Task 2).
- Produces: `characterCards(characters) -> Card[]` where a card is the character row plus `card_kind: "character"`, `has_identities: boolean`, `search_names: string[]` — or an identity card `{ card_kind: "identity", card_id, system_id: identity.system_id, display_name, character_display_name, public_id (character's), identity_id, display_photo_file, display_photo_focus, gender (resolved), my_rating, role, media_types, appearance, trait, casting_count (character's), has_identities: true, search_names }`; `CARD_KIND_CHARACTER = "Characters"`, `CARD_KIND_IDENTITY = "Identities"`, `HAS_IDENTITIES = "Has identities"`, `NO_IDENTITIES = "No identities"`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/characterCards.test.js`:

```js
import { describe, expect, it } from "vitest";
import { characterCards } from "./characterCards";

const shinichi = {
  system_id: "c1", public_id: 7, display_name: "Kudo Shinichi", name_en: "Kudo Shinichi",
  gender: "男", my_rating: "A", role: "Main", media_types: ["anime"], appearance: ["glasses"], trait: [],
  casting_count: 3, display_photo_file: "character/c1.jpg",
  identities: [{ system_id: "i1", display_name: "Edogawa Conan", name_en: "Edogawa Conan", name_jp: "江戸川コナン",
    display_gender: "男", display_photo_file: "character-identity/i1.jpg", display_photo_focus: null }],
};
const ran = { system_id: "c2", public_id: 8, display_name: "Mouri Ran", name_en: "Mouri Ran", identities: [] };

describe("characterCards", () => {
  it("puts each identity card after its character", () => {
    expect(characterCards([shinichi, ran]).map((c) => c.display_name)).toEqual([
      "Kudo Shinichi", "Edogawa Conan", "Mouri Ran",
    ]);
  });

  it("an identity card links to its character and inherits its filterable fields", () => {
    const card = characterCards([shinichi])[1];
    expect(card).toMatchObject({
      card_kind: "identity", public_id: 7, identity_id: "i1", character_display_name: "Kudo Shinichi",
      display_photo_file: "character-identity/i1.jpg", appearance: ["glasses"], my_rating: "A",
    });
  });

  it("every card of one character is found by any of that character's names", () => {
    const cards = characterCards([shinichi]);
    for (const card of cards) {
      expect(card.search_names).toEqual(expect.arrayContaining(["Kudo Shinichi", "Edogawa Conan", "江戸川コナン"]));
    }
  });

  it("marks whether a character has identities", () => {
    const [shinichiCard, , ranCard] = characterCards([shinichi, ran]);
    expect(shinichiCard.has_identities).toBe(true);
    expect(ranCard.has_identities).toBe(false);
  });
});
```

Add to `CharacterLibrary.test.jsx` (reuse its existing render/fetch setup):

```jsx
it("shows identity cards and can hide them", async () => {
  mockCharacters([shinichiWithConan]);
  renderLibrary();
  expect(await screen.findByText("Edogawa Conan")).toBeInTheDocument();
  expect(screen.getByText(/identity of Kudo Shinichi/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Characters" }));
  expect(screen.queryByText("Edogawa Conan")).not.toBeInTheDocument();
});
```

(`shinichiWithConan` is the `shinichi` fixture above; the filter chip's accessible name is whatever `FilterPanel` renders for an option — read it.)

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/lib/characterCards.test.js src/pages/library/CharacterLibrary.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: `characterCards.js`**

```js
// Frontend: the character library's cards. Each character is one card, and
// each of its other identities is another card right after it - an identity
// is listed, searched and filtered as part of the same character, and links
// to the character's page with that identity highlighted.
import { PERSON_NAME_FIELDS } from "./naming";

export const CARD_KIND_CHARACTER = "Characters";
export const CARD_KIND_IDENTITY = "Identities";
export const HAS_IDENTITIES = "Has identities";
export const NO_IDENTITIES = "No identities";

function namesOf(row) {
  return PERSON_NAME_FIELDS.map(({ field }) => row[field]).filter(Boolean);
}

export function characterCards(characters) {
  const cards = [];
  for (const character of characters || []) {
    const identities = character.identities || [];
    // Every card of one character answers to every name it goes by.
    const searchNames = [...namesOf(character), ...identities.flatMap(namesOf)];
    const hasIdentities = identities.length > 0;
    cards.push({
      ...character,
      card_kind: "character",
      card_id: character.system_id,
      has_identities: hasIdentities,
      search_names: searchNames,
    });
    for (const identity of identities) {
      cards.push({
        // The character's filterable facts: an identity is the same
        // character, so its tags, rating, role and entry types are its.
        my_rating: character.my_rating,
        role: character.role,
        media_types: character.media_types,
        restricted: character.restricted,
        appearance: character.appearance,
        trait: character.trait,
        casting_count: character.casting_count,
        // Its own face and name.
        card_kind: "identity",
        card_id: identity.system_id,
        system_id: identity.system_id,
        identity_id: identity.system_id,
        public_id: character.public_id,
        display_name: identity.display_name,
        character_display_name: character.display_name,
        gender: identity.display_gender,
        display_photo_file: identity.display_photo_file,
        display_photo_focus: identity.display_photo_focus,
        has_identities: true,
        search_names: searchNames,
      });
    }
  }
  return cards;
}
```

Check `PERSON_NAME_FIELDS` exists in `lib/naming.js` with `{ field }` entries (CharacterAddTab imports it); if the library already uses `STUDIO_NAME_FIELDS` for the same four fields, either works.

- [ ] **Step 4: Filters**

In `entityFilters.js`, import the four constants from `./characterCards` and add:

```js
// Character cards and identity cards, so either can be shown alone. Empty
// (the default) shows both.
const cardKindDef = {
  key: "cardKind",
  label: "Card",
  type: "set",
  options: [CARD_KIND_CHARACTER, CARD_KIND_IDENTITY],
  match: (item, active) =>
    active.has(item.card_kind === "identity" ? CARD_KIND_IDENTITY : CARD_KIND_CHARACTER),
};

// Whether the character has other identities. An identity card always does.
const hasIdentitiesDef = {
  key: "hasIdentities",
  label: "Identities",
  type: "set",
  options: [HAS_IDENTITIES, NO_IDENTITIES],
  match: (item, active) => active.has(item.has_identities ? HAS_IDENTITIES : NO_IDENTITIES),
};
```

and append `cardKindDef, hasIdentitiesDef` to `characterFilterDefs`'s array; update its doc comment.

- [ ] **Step 5: Library page**

In `CharacterLibrary.jsx`:
- `const cards = useMemo(() => characterCards(allCharacters), [allCharacters]);` and pass `cards` (not `allCharacters`) to `useEntityFilterState` and to the search filter.
- The search predicate becomes `(c.search_names || []).some((n) => cleanString(n).includes(qClean))`.
- The grid keys on `character.card_id`.
- The count line says `card`/`cards` rather than `character`/`characters`.
- `CharacterCard`: when `character.card_kind === "identity"`, the link is `entityPath("character", { public_id: character.public_id, display_name: character.character_display_name }) + "#identity-" + character.identity_id`, the vertical strip reads `Identity`, and the castings line is replaced by `<span className="… text-text-faint truncate">identity of {character.character_display_name}</span>`; the `RatingStamp` is omitted on identity cards (the rating is the character's, already on its card).

- [ ] **Step 6: Fast checks**

Run: `cd frontend && npx vitest run src/lib src/pages/library && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/characterCards.js frontend/src/lib/characterCards.test.js frontend/src/lib/entityFilters.js frontend/src/pages/library/CharacterLibrary.jsx frontend/src/pages/library/CharacterLibrary.test.jsx
git commit -m "feat: identity cards and identity filters in the character library" -- frontend/src/lib/characterCards.js frontend/src/lib/characterCards.test.js frontend/src/lib/entityFilters.js frontend/src/pages/library/CharacterLibrary.jsx frontend/src/pages/library/CharacterLibrary.test.jsx
```

---

### Task 10: Admin Identity tabs — Add, Modify, Delete

**Files:**
- Create: `frontend/src/pages/add-tabs/IdentityAddTab.jsx` (exports `IdentityFields`, `defaultIdentity`)
- Create: `frontend/src/pages/modify-tabs/IdentityModifyTab.jsx`, `frontend/src/pages/modify-tabs/IdentityDeleteTab.jsx`
- Create: `frontend/src/pages/add-tabs/IdentityAddTab.test.jsx`, `frontend/src/pages/modify-tabs/IdentityDeleteTab.test.jsx`
- Modify: `frontend/src/config/adminTabs.js`, `frontend/src/config/imageOwnerTypes.js`, `frontend/src/pages/admin/Add.jsx`, `Modify.jsx`, `Delete.jsx`

**Interfaces:**
- Consumes: `endpoints.characterIdentity` (Task 7), `endpoints.character.list` (character picker), `attachUploadedImage` from `components/forms/ImagePicker`.
- Produces: admin tab key `"identity"`.

The three tabs are self-contained like `CharacterModifyTab`: each owns its fetches and state, so `Add.jsx`/`Modify.jsx`/`Delete.jsx` only render them.

- [ ] **Step 1: Write the failing tests**

`IdentityAddTab.test.jsx`:

```jsx
it("will not submit without a character", async () => {
  const post = mockFetchPost("/api/character-identity/", {});
  render(<IdentityAddTab />);
  await userEvent.type(screen.getByLabelText("Name (English)"), "Conan");
  expect(screen.getByRole("button", { name: /add identity/i })).toBeDisabled();
  expect(post).not.toHaveBeenCalled();
});

it("posts the chosen character with the identity", async () => {
  mockFetch({ "/api/character/?name=kudo": [{ system_id: "c1", display_name: "Kudo Shinichi" }] });
  const post = mockFetchPost("/api/character-identity/", { system_id: "i1", display_name: "Conan" });
  render(<IdentityAddTab />);
  await userEvent.type(screen.getByRole("combobox", { name: /character/i }), "kudo");
  await userEvent.click(await screen.findByText("Kudo Shinichi"));
  await userEvent.type(screen.getByLabelText("Name (English)"), "Conan");
  await userEvent.click(screen.getByRole("button", { name: /add identity/i }));
  expect(JSON.parse(post.mock.calls[0][1].body)).toMatchObject({ character_id: "c1", name_en: "Conan", gender: null });
});
```

`IdentityDeleteTab.test.jsx`:

```jsx
it("confirms with the cast-row count and says the rows fold into the main identity", async () => {
  mockFetch({ "/api/character-identity/": [
    { system_id: "i1", display_name: "Conan", character_display_name: "Kudo Shinichi", casting_count: 2 },
  ] });
  const del = mockFetchDelete("/api/character-identity/i1?castings=2", { status: "success" });
  render(<IdentityDeleteTab />);
  await userEvent.click(await screen.findByText("Conan"));
  expect(screen.getByText(/2 cast rows move to Kudo Shinichi's main identity/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /delete identity/i }));
  expect(del).toHaveBeenCalled();
});
```

(Again: use the repo's existing fetch-mock helpers by whatever name they have.)

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/pages/add-tabs/IdentityAddTab.test.jsx src/pages/modify-tabs/IdentityDeleteTab.test.jsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: `IdentityAddTab.jsx`**

```jsx
// Frontend: add tab for a character's other identity.
//
// An identity is always created under an EXISTING character - there is no
// free-standing identity - so the tab opens with a required character
// picker, and the form below it is the identity's own fields: names, gender
// (empty = the character's), photo, remark. Self-contained like
// CharacterModifyTab: it owns its fetches, so Add.jsx only renders it.
//
// IdentityFields is exported for IdentityModifyTab, which edits the same
// inputs against an existing identity.
import { useState } from "react";

import { Field, SectionHeader, inputCls, selectCls } from "../../components/forms/FormField";
import ComboBox from "../../components/forms/ComboBox";
import ImagePicker, { attachUploadedImage } from "../../components/forms/ImagePicker";
import { GENDERS } from "../../config/fieldOptions";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { PERSON_NAME_FIELDS } from "../../lib/naming";

export const IDENTITY_NAME_FIELDS = PERSON_NAME_FIELDS;

export function defaultIdentity() {
  return {
    name_en: "", name_cn: "", name_jp: "", name_alt: "",
    display_name_field: "", gender: "", remark: "",
    photo_file: "", photo_focus: null, pending_image_id: null,
  };
}

export function identityPayload(form) {
  return {
    name_en: form.name_en.trim() || null,
    name_cn: form.name_cn.trim() || null,
    name_jp: form.name_jp.trim() || null,
    name_alt: form.name_alt.trim() || null,
    display_name_field: form.display_name_field || null,
    gender: form.gender || null,
    remark: form.remark || null,
    photo_file: form.photo_file || null,
    photo_focus: form.photo_focus || null,
  };
}

export function hasAnyIdentityName(form) {
  return IDENTITY_NAME_FIELDS.some(({ field }) => form[field]?.trim());
}

// `characterGender` is what an empty gender means - the character's own -
// shown in the empty option so the admin sees what they are inheriting.
export function IdentityFields({ form, update, ownerId, characterGender }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {IDENTITY_NAME_FIELDS.map(({ key, label, field }) => (
          <Field key={key} label={`Name (${label})`}>
            <input
              aria-label={`Name (${label})`}
              className={inputCls}
              value={form[field] ?? ""}
              onChange={(e) => update(field, e.target.value)}
            />
          </Field>
        ))}
      </div>
      {!hasAnyIdentityName(form) && (
        <p className="text-[10px] font-bold text-danger -mt-2">An identity needs at least one name.</p>
      )}
      <Field label="Display Name" hint="Which name to show. Falls back through English, Chinese, Japanese, Alternative when unset.">
        <select className={selectCls} value={form.display_name_field ?? ""} onChange={(e) => update("display_name_field", e.target.value)}>
          <option value="">Default (English)</option>
          {IDENTITY_NAME_FIELDS.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </Field>
      <Field label="Gender" hint="Empty means the same as the character.">
        <select aria-label="Gender" className={selectCls} value={form.gender ?? ""} onChange={(e) => update("gender", e.target.value)}>
          <option value="">Same as character{characterGender ? ` (${characterGender})` : ""}</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </Field>
      <Field label="Photo">
        <ImagePicker
          ownerType="character-identity"
          ownerId={ownerId}
          role="cover"
          value={form.photo_file}
          focus={form.photo_focus}
          onFocusChange={(focus) => update("photo_focus", focus)}
          onChange={(key, imageId) => {
            update("photo_file", key);
            update("pending_image_id", ownerId ? null : imageId);
          }}
        />
      </Field>
      <Field label="Remark">
        <textarea className={inputCls} rows={3} value={form.remark ?? ""} onChange={(e) => update("remark", e.target.value)} />
      </Field>
    </div>
  );
}

// The required character: searched by name as the cast editor does, never
// created here - a new character is made on the Character tab.
export function CharacterPicker({ value, onChange }) {
  const [results, setResults] = useState([]);
  const [text, setText] = useState(value?.display_name || "");
  async function search(q) {
    setText(q);
    if (!q.trim()) return setResults([]);
    const qs = new URLSearchParams({ name: q.trim() }).toString();
    try {
      setResults(await fetchJson(endpoints.character.list(qs)));
    } catch {
      setResults([]);
    }
  }
  return (
    <Field label="Character" hint="The character this is an identity of. Required, and fixed once saved.">
      <div aria-label="Character">
        <ComboBox
          items={results.map((c) => ({ id: c.system_id, label: c.display_name, searchText: text }))}
          selectedId={value?.system_id || null}
          inputText={text}
          onType={search}
          onSelect={(id) => {
            const picked = results.find((c) => c.system_id === id);
            onChange(picked || null);
            setText(picked?.display_name || "");
          }}
          onClear={() => {
            onChange(null);
            setText("");
          }}
          placeholder="Search characters..."
        />
      </div>
    </Field>
  );
}

export default function IdentityAddTab() {
  const { showToast } = useToast();
  const [character, setCharacter] = useState(null);
  const [form, setForm] = useState(defaultIdentity());
  const [submitting, setSubmitting] = useState(false);
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const ready = !!character && hasAnyIdentityName(form);

  async function submit(e) {
    e.preventDefault();
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      const created = await fetchJson(endpoints.characterIdentity.create(), {
        method: "POST",
        ...jsonBody({ character_id: character.system_id, ...identityPayload(form) }),
      });
      if (form.pending_image_id) {
        try {
          await attachUploadedImage(form.pending_image_id, "character-identity", created.system_id, "cover");
        } catch (err) {
          showToast("error", err.message || "Identity saved, but attaching the image failed.");
        }
      }
      showToast("success", `Identity added to ${character.display_name}.`);
      setForm(defaultIdentity());
    } catch (err) {
      showToast("error", err.message || "Failed to create identity.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-masks-theater" title="Identity" />
      <CharacterPicker value={character} onChange={setCharacter} />
      <IdentityFields form={form} update={update} characterGender={character?.gender} />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!ready || submitting}
          className="flex items-center gap-2 px-6 py-3 bg-brand text-on-brand rounded-xl font-black text-sm hover:bg-brand-hover transition disabled:opacity-60"
        >
          <i className={`fas ${submitting ? "fa-spinner fa-spin" : "fa-plus"}`}></i>
          Add Identity
        </button>
      </div>
    </form>
  );
}
```

Check: `fetchJson`/`jsonBody` are exported from `api/client` (CharacterModifyTab imports them from there); `GENDERS` from `config/fieldOptions`; `Field` passes a label through so `getByLabelText` works — if not, the explicit `aria-label`s above carry it.

- [ ] **Step 4: `IdentityModifyTab.jsx`**

Model it on `CharacterModifyTab.jsx` without role tabs and scope chips: a search box over `GET /api/character-identity/` (all identities, filtered client-side on the four names and on `character_display_name`), a grid of buttons labelled `"{display_name} — {character_display_name}"`, and on pick an editor showing the character's name read-only above `<IdentityFields form={…} update={…} ownerId={selectedId} />` with a Save button that `PUT`s `identityPayload(form)` to `endpoints.characterIdentity.update(id)` and invalidates the `["identities-admin"]` query. Use `useQuery({ queryKey: ["identities-admin"], queryFn: () => fetchJson(endpoints.characterIdentity.list()) })`. Accept `initialId` like `CharacterModifyTab` for deep links. Empty states: "No identities yet." / "No identity matches that name."

- [ ] **Step 5: `IdentityDeleteTab.jsx`**

Same picker as Step 4 (extract the search+grid into a small `IdentityPicker` component inside `IdentityModifyTab.jsx`, exported, and reuse it here — it is the second use). On pick, show a confirmation panel:

```jsx
<p className="text-sm text-text-muted">
  {selected.casting_count === 0
    ? "This identity is not cast anywhere."
    : `${selected.casting_count} cast row${selected.casting_count === 1 ? "" : "s"} move to ${selected.character_display_name}'s main identity. Where the main identity is already cast in the same entry, the two rows are combined.`}
</p>
```

and a danger button "Delete Identity" that calls `fetch(endpoints.characterIdentity.remove(selected.system_id, selected.casting_count), { method: "DELETE", credentials: "include" })`; on 409 show the server's `detail` as an error toast and refetch; on success toast, clear the selection, invalidate `["identities-admin"]`.

- [ ] **Step 6: Wire the tabs**

`config/adminTabs.js`, after the `character` entry:

```js
  // A character's other identities. Self-contained tabs (IdentityAddTab,
  // IdentityModifyTab, IdentityDeleteTab); an identity always belongs to an
  // existing character.
  {
    key: "identity",
    group: "entity",
    icon: "fa-masks-theater",
    label: "Identity",
  },
```

and add `"identity"` to `FORM_TABS`' exclusion list (it has no form factory) with the comment updated to name it.

`config/imageOwnerTypes.js`: add `{ value: "character-identity", label: "Character Identity" },` after `character`, and update the comment's count.

`Add.jsx`: import `IdentityAddTab` and render `{activeTab === "identity" && <IdentityAddTab />}` beside the `activeTab === "character"` block (~line 3762). Make sure the page's shared submit bar is not shown for `identity` — read the `activeTab === "character" &&` condition near line 3816 and whatever decides the shared Save button, and exclude `identity` the way other self-contained tabs (`quote`/`meme` if they are) are excluded.

`Modify.jsx`: render `{activeTab === "identity" && <IdentityModifyTab initialId={entityDeepLink?.type === "identity" ? entityDeepLink.id : null} />}` beside the character block (~line 3964), and add `activeTab !== "identity" &&` to the two guards at ~4001 and ~4159 that already exclude `character`.

`Delete.jsx`: render `{activeTab === "identity" && <IdentityDeleteTab />}` in the tab body, and exclude `identity` from the page's per-type list machinery the same way it treats any tab that has no `db[type]` list (read how `activeTab` selects `db[...]` and guard it).

Permission surfaces: the Identity tabs ride on the existing `/add`, `/modify`, `/delete` routes and their `ProtectedRoute` permission, and `navigation.js` links to those pages, not to tabs — so no new permission wiring. Confirm by reading `App.jsx`'s routes for those three pages.

- [ ] **Step 7: Fast checks, build, notify**

Run:

```bash
cd frontend && npx vitest run && npm run lint && npm run build
venv/Scripts/ruff.exe check .
```

Expected: all PASS. Then send the owner a push notification that the feature is viewable on :8000 (per `media/CLAUDE.md`), and carry on without waiting.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/add-tabs/IdentityAddTab.jsx frontend/src/pages/add-tabs/IdentityAddTab.test.jsx frontend/src/pages/modify-tabs/IdentityModifyTab.jsx frontend/src/pages/modify-tabs/IdentityDeleteTab.jsx frontend/src/pages/modify-tabs/IdentityDeleteTab.test.jsx frontend/src/config/adminTabs.js frontend/src/config/imageOwnerTypes.js frontend/src/pages/admin/Add.jsx frontend/src/pages/admin/Modify.jsx frontend/src/pages/admin/Delete.jsx
git commit -m "feat: Identity add, modify and delete admin tabs" -- frontend/src/pages/add-tabs/IdentityAddTab.jsx frontend/src/pages/add-tabs/IdentityAddTab.test.jsx frontend/src/pages/modify-tabs/IdentityModifyTab.jsx frontend/src/pages/modify-tabs/IdentityDeleteTab.jsx frontend/src/pages/modify-tabs/IdentityDeleteTab.test.jsx frontend/src/config/adminTabs.js frontend/src/config/imageOwnerTypes.js frontend/src/pages/admin/Add.jsx frontend/src/pages/admin/Modify.jsx frontend/src/pages/admin/Delete.jsx
```

---

### Task 11: Docs, and retire the spec and plan

**Files:**
- Modify: `docs/data-model.md`, `docs/api.md`, `docs/systems/credits-and-tags.md`, `docs/data-actions.md`, `docs/external-apis.md`, `docs/frontend/pages.md`, `docs/frontend/components.md`, `docs/notes/decisions.md`
- Delete: `docs/superpowers/specs/2026-10-06-character-identities-design.md`, `docs/superpowers/plans/2026-10-06-character-identities.md`

Present tense, no history, no dates in the non-`notes/` pages; bump each edited page's `Last verified` line to 2026-10-06. Write it **as built** — where this plan diverged from the spec (owner type spelling, deferred FK instead of ON UPDATE CASCADE, no PATCH, admin-only identity reads, cast-row photo falls back to `character.photo_file`), the docs say what is true now.

- [ ] **Step 1: `data-model.md`** — a `character_identity` section beside `character` (~line 1156): columns, `ck_character_identity_has_a_name`, `uq_character_identity_owner`, gender-inherits, no public_id. In `character_casting` (~line 1226): `identity_id`, the new `uq_character_casting` (with NULLS NOT DISTINCT and why), `fk_casting_identity` (composite, deferred, and why). Grep the page for every other statement of "one casting per character per entry" and fix each (`grep -n "per character per entry\|uq_character_casting" docs -r`).
- [ ] **Step 2: `api.md`** — a "Character Identity" section (`/api/character-identity`: the five routes, admin-only, 404/409/422 cases); `CharacterResponse.identities`; casting rows' `identity_id`/`identity_name` and the new 422s; `/entries`' `casting_id`/`identity_id`/`identity_name`; `character-identity` in the image owner list if `api.md` enumerates owners.
- [ ] **Step 3: `systems/credits-and-tags.md`** — under "Character and character_casting": identities, main identity = the character, the cast-row photo fallback (row → identity → character), deleting an identity folds rows, merge re-parents identities and matches per identity, MAL never writes an identity, copying a cast from a sibling carries `identity_id`. Under "Photo fallback": the identity's displayed photo.
- [ ] **Step 4: `data-actions.md`** — the Character Identity tab, its place in restore order, `identity_id` on Character Casting, an old sheet without the column restores main-identity rows. `external-apis.md` — one line under the cast mapping: MAL imports characters only; identities are never matched or created.
- [ ] **Step 5: `frontend/pages.md` and `frontend/components.md`** — library identity cards and the Card / Identities filters, the character page's Identities section and `#identity-<id>` highlight, the three Identity admin tabs; CastEditor's Identity field, CastSection's identity headline, `characterCards`.
- [ ] **Step 6: `notes/decisions.md`** — one entry, "Character identities", carrying D1–D11 from the spec with their reasons, the rejected alternatives (all identities in the table with an is-main flag; identity on the voice row; a combined character/identity picker; identity tags this round; converting a character into an identity), and the as-built divergences listed above with why.
- [ ] **Step 7: Delete the spec and this plan**

```bash
git rm docs/superpowers/specs/2026-10-06-character-identities-design.md docs/superpowers/plans/2026-10-06-character-identities.md
```

- [ ] **Step 8: Full verification, then commit**

Run the full backend suite under the lock, then `cd frontend && npm run test:run && npm run lint && npm run build`, and `venv/Scripts/ruff.exe check .`. All green.

```bash
git add docs/data-model.md docs/api.md docs/systems/credits-and-tags.md docs/data-actions.md docs/external-apis.md docs/frontend/pages.md docs/frontend/components.md docs/notes/decisions.md
git commit -m "docs: character identities" -- docs/data-model.md docs/api.md docs/systems/credits-and-tags.md docs/data-actions.md docs/external-apis.md docs/frontend/pages.md docs/frontend/components.md docs/notes/decisions.md docs/superpowers/specs/2026-10-06-character-identities-design.md docs/superpowers/plans/2026-10-06-character-identities.md
```

- [ ] **Step 9: Push and open the PR into `dev`**

`alembic heads` once more after `git fetch origin && git merge origin/dev` (reparent `down_revision` if `dev` gained a revision). Push, open the PR into `dev` with a body describing the shape of the change (no AI mentions), wait for CI green, merge it. Then ask the owner "merged" or "done".
