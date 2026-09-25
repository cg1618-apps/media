# Authorization (RBAC)

Last verified: 2026-09-25

## What this is for

A **role** is a named bundle of **permissions**. Every request resolves to a
viewer with exactly one role, and the read routes narrow what they return to
what that role may see. Permissions are declared in code; only their
**grants** live in the database.

**There are TWO axes, and they answer different questions.**

- The **role** answers *what kinds of operation may this account perform* —
  read, edit the catalogue, run a pipeline, change authorization. It holds
  `admin.*`, `manage.*`, `media_type.*` and `self.*`.
- The **access mode** answers *which objects can those operations reach in
  this session*. It carries content labels and field groups, and nothing
  else.

Effective access = (the role's permissions) applied to (the active mode's
object set). The two are disjoint **by construction**: there is no column on
the access-mode tables in which `manage.catalog` could be stored, and no
helper exists that would let code ask the role axis an object question. That
is what lets the owner's own admin account sit in a narrow mode and actually
be narrowed.

Entries and franchises are hidden with **content labels** (`nsfw`,
`spoiler`, …) that never name a role: a *mode* carries `label`, and a session
whose mode does not carry it never learns the thing exists. A label on a
**franchise** hides that franchise and, by a read-time join through
`media.franchise_id`, every entry in it. The seeds are deliberately permissive — the
guest role holds every read permission and the `safe` mode carries what the
guest role holds — so an admin narrows either axis by *removing* grants.

Related: [authentication.md](authentication.md) (login, cookie),
[data-model.md](data-model.md) (tables), [api.md](api.md) (routes),
[notes/decisions.md](notes/decisions.md) (2026-08-29 View authorization).

## What each role and mode holds

The two matrices below are the seeds — what `ensure_rbac_seed` and
`ensure_access_mode_seed` create on a fresh database. Both are editable
afterwards (`/roles`, `/access-modes`), and both seeders **top up only a row
holding nothing at all**, so a grant an admin removed is never handed back on
restart. An established installation can therefore differ from either table;
read the rows, do not assume them.

### Roles — what an account may DO

Columns are the four seeded roles. `admin` is `is_root`, so it holds no
explicit grants at all; *implicit* means `Viewer.has()` short-circuits to
true, including for permissions that do not exist yet.

| Permission | `guest` | `user` | `super` | `admin` | a custom role |
|---|---|---|---|---|---|
| `media_type.anime`, `anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`, `comic`, `game`, `h-comic`, `h-game`, `hentai` (all twelve) | yes (as seeded) | yes (as seeded) | yes | implicit | — |
| `self.list` | **locked off** | yes | **locked on** | **never implicit** | — |
| `self.personal_notes` | **locked off** | yes | **locked on** | **never implicit** | — |
| `manage.catalog` | **locked off** | — | **locked on** | implicit | — |
| `manage.pipelines` | **locked off** | **locked off** | **locked on** | implicit | **locked off** |
| `admin.authz` | **locked off** | **locked off** | **locked off** | implicit | **locked off** |

- **A custom role is created empty.** Every cell is `—` until an admin grants
  it; grants are replaced as a whole set by `PUT`, never appended.
- **"As seeded" is what a fresh database gets.** The seed derives every
  `media_type.*` grant from `MEDIA_TYPE_KEYS`, but it tops up only a role
  holding nothing, so on an established database a media type added later -
  `h-comic`, `h-game`, `hentai` - reaches `super` (locked on) and `admin`
  (implicit) and not `guest` or `user` until an admin grants it. The type axis
  is not what hides a gated type from a narrow session anyway: its label is (see
  [Gated types](#gated-types)).
- **Locked means that cell is not an admin choice** — see
  [Locked grants](#locked-grants) below. Saving a locked-off grant answers
  **409**, and so does a save that drops a locked-on one.
- **`admin` never holds `self.*`, implicitly or otherwise**, so an
  administrative account keeps no list, plan queue, season ratings, game
  copies or personal notes. An explicit grant still wins. See
  [The admin account holds no user data](#the-admin-account-holds-no-user-data).
- **`user` and `super` are derived, not restated**:
  `default_user_permissions()` builds on `default_guest_permissions()` and
  `default_super_permissions()` on that, so a media type added later reaches
  all three at once.
- **No role holds a content label or a field group.** Neither family is in
  `catalog()`, so neither can be granted here — they are the other axis.

#### Locked grants

Some cells of the role grid are not an administrator's to decide.
`permissions.locked_permissions(role_name, is_root)` returns
`(locked_on, locked_off)` for one role: what it must hold and what it may
never hold. A permission in neither set is a free choice.

| Role | Locked ON | Locked OFF | Left to decide |
|---|---|---|---|
| `admin` (any root role) | everything except `self.*` | `self.*` | nothing |
| `super` | everything except `admin.authz` | `admin.authz` | nothing |
| `guest` | — | `admin.*`, `manage.*`, `self.*` | `media_type.*` |
| `user`, every custom role | — | `admin.authz`, `manage.pipelines` | `manage.catalog`, `self.*`, `media_type.*` |

- **`admin.authz` is grantable to nothing.** The root short-circuit is
  the only way to hold it: handing out the permission to change who may do
  what, through the very page that governs it, is how an installation loses
  control of itself.
- **A root role's `self.*` is locked OFF, not on.** `Viewer.has()` does not
  short-circuit that family (`resolver.py`), so an administrative account
  genuinely keeps no list and no personal notes — a ticked box there would
  state the opposite of what the resolver does. It is the one cell where the
  admin column is not uniform.
- **`guest` can only view.** Every anonymous request resolves to it, so a
  `self.*` grant would hand one shared list to the whole internet, and any
  `manage.*` grant would hand an anonymous visitor the collection.
- **`super` means everything except changing authorization**, so there is
  nothing on that role to tick or untick at all.
- **One table, three readers.** `RoleResponse` serves `locked_on` /
  `locked_off`, so the editor draws those boxes disabled; `PUT
  /api/roles/{id}/permissions` and `POST /api/roles/` refuse a payload that
  disagrees; and `ensure_rbac_seed` reconciles every stored grant set on
  start, adding a missing locked-on grant and dropping a locked-off one. The
  seed rule that tops up only a role holding nothing at all still governs
  everything else, so a deliberate removal of a *free* grant survives a
  restart. A locked one does not, because it was never anyone's to remove.

### Access modes — which OBJECTS those operations reach

Columns are the four seeded modes. A mode carries content labels and field
groups and nothing else; there is no column on `access_mode_label` or
`access_mode_field_group` in which `manage.catalog` could be stored.

| Item | `unrestricted` | `borderline` | `normal` | `safe` |
|---|---|---|---|---|
| `sort_order` | 0 | 10 | 20 | 30 |
| what a logged-out visitor gets | — | — | — | **always** |
| every content label that exists | **always, derived** | at seed time, **except a gated type's required label** | — | — |
| `field_group.sources_other` | yes | yes | yes | derived from guest |
| `field_group.personal_notes` | yes | yes | yes | derived from guest |
| `field_group.sources_restricted` | yes | yes | yes | **—** |

- **`unrestricted` is DERIVED; every other mode is a row set.** Its sets are
  not read from `access_mode_label` and `access_mode_field_group` at all —
  `cache.mode_sets()` returns every `content_label` row and every
  `FIELD_GROUP_KEYS` entry for it, whatever the tables hold. That is the only
  shape in which "the widest mode" survives a label being minted tomorrow.
  `PUT /access-modes/{id}/grants` answers **409** for it and the SPA draws its
  boxes disabled with no Save; the rows are still written (by the seed, and by
  label creation) so the page and anything else reading the tables sees the
  same thing, but nothing depends on them being complete.
- **`borderline` is seeded identically to `unrestricted` and then diverges.**
  At seed time it carries every label and every field group; only the label,
  description and `sort_order` differ. The distinction their descriptions draw
  is one an admin makes by editing `borderline`'s label set — modes are
  deliberately unordered for enforcement, so nothing in the code treats one as
  narrower than the other. A label minted later reaches `borderline` only if
  an admin grants it there. The seed's "every label" never includes a label a
  gated type requires (`required_label_keys()`, see
  [Gated types](#gated-types)): `h-comic`, `h-game` and `hentai` belong to
  `unrestricted` alone,
  including on the boot where `borderline`, still holding no labels, would
  otherwise be topped up with every label that exists.
- **"derived from guest"** is the rule, not the fallback: `safe` means "today's
  guest exactly", so `ensure_access_mode_seed` reads the field groups the guest
  *role* actually holds (`guest_field_groups()`) and seeds those. Only when
  that role holds none — a database where `ensure_rbac_seed` has not run — does
  it fall back to every group minus `SAFE_WITHHELD_FIELD_GROUPS`, currently
  `{"sources_restricted"}`. Assuming the two were the same would have published
  the other-sources list and other people's personal reviews to every
  logged-out visitor.
- **Content labels are admin-created, with the gated types' system labels.**
  On a fresh database the label row is empty for every mode except for
  `h-comic`, `h-game` and `hentai`, which the lifespan seeds and grants to
  `unrestricted` only — and a label minted
  *after* the seed reaches no mode, hiding its entries from everyone until an
  admin grants it on `/access-modes`. Fail-closed, deliberately.
- **A mode is a ceiling.** What an account actually reaches is the mode's sets
  minus that account's `user_access_mode_denial` rows; there is no grant
  counterpart, so the effective set is always a subset of the column above.

**Effective access is the two read together.** `super` in `safe` can write the
catalogue but cannot see a labelled entry to write it; `admin` in `safe` is
narrowed the same way, which is the whole reason the axes are separate.

### What each role can DO

The matrix above is the grants; this is what holding one means. `implicit` is
the root short-circuit; `never` is the `self` family, which that
short-circuit deliberately does not cover.

| A viewer may… | `guest` | `user` | `super` | `admin` |
|---|---|---|---|---|
| browse entries of a type — lists, detail, search | yes | yes | yes | implicit |
| switch their own access mode | — (no account) | yes | yes | yes |
| keep a list row — status, rating, progress | — | yes | yes | **never** |
| keep a plan queue | — | yes | yes | **never** |
| rate a season | — | yes | yes | **never** |
| change their own account settings | — | yes | yes | **never** |
| write a personal note — a review or a remark | — | yes | yes | **never** |
| write the catalogue — entries, groups, people, credits, options, relations, watch orders, quotes, memes, catalogue notes | **409 if granted** | grantable | **always** | implicit |
| run a pipeline — Backup, Pull, Fill, Replace, Calculate | **409 if granted** | **409 if granted** | **always** | implicit |
| restore accounts, content labels and label assignments on a Pull | — | — | **no** — those four tabs are skipped | implicit |
| create roles and change what they hold | **409 if granted** | — | — | implicit |
| create accounts, set a role, assign modes | **409 if granted** | — | — | implicit |
| label an entry or a franchise | **409 if granted** | grantable | **always** | implicit |
| create, rename or delete a content label | **409 if granted** | — | — | implicit |
| create and edit access modes | **409 if granted** | — | — | implicit |

- **`super` is the row to read down.** Everything catalogue-shaped is yes and
  everything authorization-shaped is `—`; that gap is why the bare `admin`
  permission became three named ones. None of it is editable —
  [Locked grants](#locked-grants).
- **A capability refusal is 401, never 403**, so the SPA sees one error shape.
  An *object* refusal is 404 — a hidden entry answers exactly as an absent one.
- **`guest` cannot hold any of these**: granting one answers **409**, because
  every anonymous request resolves to that role. Nor can it hold `self.*` — it
  has no account to own rows in.
- **`user` and a custom role may be granted `manage.catalog`**, and nothing
  else from this block. Running a pipeline is refused there because one Pull
  All overwrites every table, accounts and role assignments included.

### What each mode lets a session SEE

Same reading for the object axis: the matrix above is what a mode carries,
this is what carrying it means.

| Item | Without it, a session… | `unrestricted` | `borderline` | `normal` | `safe` |
|---|---|---|---|---|---|
| `label.<key>` | never learns an entry carrying that label exists — absent from lists, search, relations, watch orders, quotes, memes and a public profile, 404 on its detail page | **always, derived** | at seed time, never `h-comic` or `h-game` | — | — |
| `field_group.sources_other` | gets a source list with the `other` bucket missing | yes | yes | yes | from guest |
| `field_group.sources_restricted` | gets a source list with the `restricted` bucket missing | yes | yes | yes | **—** |
| `field_group.personal_notes` | cannot read **another** user's personal notes; its own are never withheld | yes | yes | yes | from guest |

Which fields each group covers is [Field groups](#field-groups); it is not
restated here, or the two copies drift.

- **A fresh database carries three labels, `h-comic`, `h-game` and
  `hentai`.** Every other content
  label is admin-created, so the first row is empty for every mode but
  `unrestricted`, which derives its set rather than reading rows. A label minted later reaches
  no other mode until an admin grants it there, hiding its entries from
  everyone else. Fail-closed, deliberately.
- **Withheld fields are absent, not blanked**, in the API and the UI both: no
  `—` placeholder, because a placeholder announces what it conceals.
- **A mode is a ceiling, and an account can sit below it.** What it actually
  reaches is the column above minus that account's denials; there is no grant
  counterpart.

## Tables

| Table | Purpose | Notable columns / constraints |
|---|---|---|
| `role` | one named bundle of permissions | `name` unique (`guest`, `admin` read by name), `label`, `description`, `is_system` (cannot be deleted or renamed), `is_root` (holds every permission implicitly **except the `self` family** — see [The admin account holds no user data](#the-admin-account-holds-no-user-data)), `sort_order` |
| `role_permission` | one grant | `role_id` FK → role (`CASCADE`), `permission` string; unique `(role_id, permission)` |
| `content_label` | one admin-managed reason an entry or franchise may be restricted | `key` unique (becomes permission `label.<key>`), `label`, `description`, `sort_order` |
| `media_content_label` | one label on one entry | `media_id` FK → `media.system_id` (`CASCADE`), `label_id` FK → content_label (`CASCADE`), `position`; unique `(media_id, label_id)`. A label on a deleted entry is cleaned up by the database |
| `franchise_content_label` | one label on one franchise | `franchise_id` FK → `franchise.system_id` (`CASCADE`), `label_id` FK → content_label (`CASCADE`), `position`; unique `(franchise_id, label_id)`. A second table rather than a nullable owner pair on the one above: a pair could name both owners or neither, and nothing in the database would say which was meant |
| `access_mode` | one named ceiling on what a session may reach | `key` unique, `label`, `description`, `sort_order` (UI only — modes are deliberately **not** ordered for enforcement), `is_system`. There is **no** column for the anonymous policy: a logged-out visitor resolves `safe` by key |
| `access_mode_label` | one content label a mode CARRIES (i.e. does not hide) | `mode_id` → access_mode (`CASCADE`), `label_id` → content_label (`CASCADE`); unique `(mode_id, label_id)` |
| `access_mode_field_group` | one field group a mode carries | `mode_id` (`CASCADE`), `field_group_key` — a plain string validated against `FIELD_GROUP_KEYS`, not an FK, because field groups are code and not rows; unique `(mode_id, field_group_key)` |
| `user_access_mode` | one mode an account holds | `user_id` → users (`CASCADE`), `mode_id` (`CASCADE`), `is_default` with a partial unique index `ix_one_default_mode_per_user`. `is_default` lives here rather than on `users` so an account's landing mode is necessarily one it holds |
| `user_access_mode_denial` | one item this account does NOT get from that mode | `user_access_mode_id` (`CASCADE`), and exactly one of `label_id` / `field_group_key`, enforced by `ck_denial_names_one_thing`. **Subtraction only** — there is no grant counterpart and there must not be one: a mode is a ceiling, so an account's reach is always a subset of its mode's |
| `users.role_id` | the user's role | FK → role (`RESTRICT`), NOT NULL. `users.role` is not a column: it is a read-only `column_property` over `role.name` (bottom of `app/models/__init__.py`), because `auth.py` returns the name on login and mints it as a JWT claim |

Models: `app/models/system.py` (`Role`, `RolePermission`, `User`),
`app/models/content_label.py` (`ContentLabel`, `MediaContentLabel`,
`FranchiseContentLabel`),
`app/models/access_mode.py` (the five access-mode tables).

**Why two typed link tables instead of one generic
`access_mode_grant(permission text)`:** neither has a column in which
`manage.catalog` or `admin.authz` could be stored, so "a mode scopes objects,
it never grants powers" is a property of the schema rather than a rule a
reviewer has to remember.

Labels are deliberately **not** rows in `media_tag`: that table is keyed to
`system_option` and written by the Fill/backfill pipelines, so a pipeline run
could silently change who sees an entry.

All three tables travel between machines on the `Content Label`, `Media
Content Label` and `Franchise Content Label` sheet tabs. They are the only
tables whose absence from the sheet fails **open** — a Pull All would restore
every entry and franchise unlabelled, i.e. visible — so treat a Backup as part
of labelling work, not an afterthought. `role` and
`role_permission` have no tab: `ensure_rbac_seed` recreates guest and admin
anywhere, but a role added or a grant removed by hand is per-machine. See
[data-actions.md](data-actions.md#2-sheet-tab-registry-tabspy).

## Permission catalog (code)

`app/services/rbac/permissions.py`. A permission is `<family>.<key>`.

There is no bare `admin` permission. Administration is three named
permissions, so an account can administer *who* may do what without also being
handed the catalogue, or vice versa:

| Name | Meaning | Source of keys |
|---|---|---|
| `admin.authz` | may **change who may do what** — roles, accounts, and the content-label **vocabulary** (minting, renaming, deleting a label) | `ADMIN_PERMISSION_KEYS` in `app/services/rbac/permissions.py` |
| `manage.catalog` | may **write the catalogue** — entries, groups, people, credits, options, relations, watch orders, catalogue notes, and **which labels an entry or franchise carries** | `MANAGE_PERMISSION_KEYS` in the same module |
| `manage.pipelines` | may **run a pipeline** — Backup, Pull, Fill, Replace, Calculate | `MANAGE_PERMISSION_KEYS` in the same module |
| `media_type.<key>` | may see any entry of that type; keys are hyphenated (`media_type.tv-show`) | `MEDIA_TYPE_KEYS` in `app/utils/media_resolver.py` |
| `field_group.<key>` | may see the fields in one `FIELD_GROUPS` entry | `app/services/rbac/field_groups.py` |
| `label.<key>` | may see entries and franchises carrying that content label | `content_label.key`, read at request time |
| `self.<key>` | may **write** your own rows of that kind — `self.list`, `self.personal_notes` | `SELF_PERMISSION_KEYS` in `app/services/rbac/permissions.py` |

`manage.pipelines` is separate from `manage.catalog` because the two carry
very different blast radii: an account can fix a typo on an entry without being
able to overwrite the entire database with a Pull All. `/api/auth/me`'s
`is_admin` flag, which 394 call sites across the SPA read as "may this person
edit the catalogue", means `manage.catalog`; only the genuinely
authorization-shaped screens (`Roles.jsx`, the users page,
`ContentLabels.jsx`) ask for `admin.authz`. See [Roles](#roles) for the
`super` role this makes possible — every catalogue capability, none of the
authorization one.

`self` is the odd family out and deliberately so: every other family answers
"may you *see* this", and this one answers "may you *write* your own". It is
also the only family whose keys are constants rather than derived, because each
one names a router dependency — a `self.<key>` with no route behind it would be
an inert grant.

`static_catalog()` is the half knowable without a database; `catalog(db)` adds
the label half. Writes to `PUT /api/roles/{id}/permissions` validate every
name against `catalog(db)` and reject unknown ones with **422**, so a grant
naming nothing is never stored. `split_perm()` partitions on the first dot so
hyphenated keys survive.

### Roles

Four roles are seeded by `app/services/rbac/seed.py`, and the app reads three
of them by name (`guest`, `user`, `admin`; `super` is reached only through its
grants, the way any custom role is):

| Name | `sort_order` | System | Root | Holds |
|---|---|---|---|---|
| `guest` | 0 | yes | no | `default_guest_permissions()` — every media type, and nothing else. Field groups are the mode axis, not this one |
| `user` | 50 | yes | no | `default_user_permissions()` — guest's set plus `self.list` and `self.personal_notes` |
| `super` | 75 | yes | no | `default_user_permissions()` plus `manage.catalog` and `manage.pipelines` — every catalogue capability, deliberately **not** `admin.authz` |
| `admin` | 100 | yes | **yes** | nothing explicitly; a root role holds every permission implicitly **except `self.*`**, which is ownership rather than privilege and so has no implicit holder |

`super` is the helper account the three named permissions make possible: it
can write the catalogue and run pipelines without being able to touch roles,
accounts or content labels. It is `is_system` (cannot be deleted or renamed)
but **not** `is_root` — its grants are real rows, inspectable and
editable on `/roles` like a custom role's, and `viewer.has()` does not
short-circuit for it the way it does for `admin`.

`default_user_permissions()` is *derived* from `default_guest_permissions()`
rather than restated, so a media type or field group added later reaches both
roles at once. The `user` role is three ideas and not a subsystem: guest reads,
write-own-list, write-own-personal-notes. Catalogue writes stay behind
`require_manage_catalog`, so granting this role adds **no catalogue-write
surface**.

The same `if not held:` top-up rule applies to `user` as to `guest`: the seed
grants the defaults only to a role holding nothing at all, so a permission an
admin deliberately removed is never handed back on the next restart.

Migration `m2a1users` seeds the role for a database that already has its
schema. It copies **this installation's** guest grants rather than recomputing
the defaults, so an admin who narrowed guest gets a `user` role narrowed the
same way.

`self.personal_notes` is what `app/routers/note.py` requires of every
personal-scope note write. See [Note scope](#note-scope) below.

### Field groups

| Key | Label | What it gates | How |
|---|---|---|---|
| `sources_other` | Other Sources | `media_source` rows with `bucket='other'`, on every media type | fifth `FieldGroup` flavour, `source_buckets`; filtered inside `attach_sources` before the response is built (not `field_gate.gate()` — see below) |
| `sources_restricted` | Restricted Sources | `media_source` rows with `bucket='restricted'`, on every media type | same flavour, `source_buckets=("restricted",)` |
| `personal_notes` | Personal Reviews | reading **another user's** personal notes, through `GET /api/notes?author=<username>` | Narrow by design: personal sections filter by `author_id` on the entry page, so this group withholds nothing a viewer wrote themselves. See [Note scope](#note-scope) |
Three groups, and all three are genuinely object-scoped. Two others used to
be here:

- **`credits` is ungated.** Studio, director and the rest are what an entry
  *is*, and there was never a case for withholding them from anyone. Nothing
  replaced it — not a role permission either.
- **`system_info` is gone too, and became nothing.** It gated
  `created_at` / `updated_at` — when the catalogue *row* was last edited,
  which is a fact about the database rather than about the work, and which no
  page displays. Nothing withheld it usefully, so the group went and no
  permission replaced it. See
  [The entry id on the poster spine](#the-entry-id-on-the-poster-spine) for
  the one visible thing it also named.

`sources_other` points at the `other` bucket of `media_source`.

**`sources_restricted` is deliberately excluded from a fresh `safe` mode.**
`app/services/rbac/seed_modes.py`'s `SAFE_WITHHELD_FIELD_GROUPS` (currently
just `{"sources_restricted"}`) is subtracted from the group set seeded onto
`safe`, the mode a logged-out visitor resolves — a field group whose whole
point is to withhold something from ordinary viewers must not be granted by
default, or it withholds nothing until an admin remembers to revoke it. Every
other field group is granted to every seeded mode. That subtraction is only
the fallback: on a database whose guest role already holds field groups,
`safe` is seeded from those instead, so it means "today's guest exactly".
Either way it applies to a *fresh* seed only — `ensure_access_mode_seed` tops
up only a mode holding nothing, so an item an admin removed is not handed back
on restart.

**Gating a `media_source` bucket is not the "real columns" copy-and-strip
path described below** — it happens earlier, inside
`services.domain.sources.attach_sources`, because the filter is *partial*: a
viewer may hold `sources_other` and not `sources_restricted`, so the whole
`sources` attribute cannot simply be blanked. `attach_sources` queries
`media_source` with the withheld buckets excluded and sets `entry.sources` to
the result; `field_gate.gate()` never sees it.

`tests/unit/test_field_groups.py` asserts every declared column and link
field still exists (drift test).

**There is no `ui_block` field.** One used to name the SPA component a group
hides — `"info.SourcesCard.other"` — and the module docstring described it as
a mechanism, but nothing in `app/` ever read it and nothing was served from
it: the SPA hides those blocks by checking the permission, with the component
named in JSX. A string documenting a mapping the code does not make is worse
than no string, because the next reader changes it and expects an effect.

#### The entry id on the poster spine

**`system_id` is not gated at all**, and never was. That id is the route
parameter of the page the viewer is already on (`/anime/<system_id>`), as well
as the query cache key, the notes owner and every link out, so withholding it
would break navigation while concealing nothing. This is not a hole — an id is
not a credential here; a hidden entry is protected by `entry_visible`
answering 404, and a viewer can only learn an id for an entry they were
already allowed to see. Removing it from the UI entirely would mean routing on
slugs instead of UUIDs.

A decorative copy of it is printed down the spine of a detail page's poster,
and **that block is drawn on `is_root`** — not on a permission, and
deliberately not on `super`, which is not a root role. There is nothing to
gate server-side, so there is no permission to invent: the SPA reads the
`is_root` field `/api/auth/me` already carries. It is presentation, like
every `has()` call that hides a block the server has already emptied.

Withheld fields are **absent, not blanked**, in the UI as well as the API: the
"Last updated" figure is dropped rather than showing `—`, for the same reason
`note.py` drops a withheld section instead of serving an empty card.

#### Changing which columns a group hides — code only

> **There is no admin page for this.** `/roles` decides *who holds* a field
> group; *what a field group contains* is `FIELD_GROUPS` in
> `app/services/rbac/field_groups.py` and changing it is a commit and a deploy.
> This is the same rule as the rest of the catalog — permissions live in code,
> grants live in the database — so a string the code branches on cannot be
> edited out from under it by an admin editing a row. `PUT
> /api/roles/{id}/permissions` validates against `catalog(db)` and answers
> **422** for anything unknown, so a group cannot be invented from the UI
> either.

Edit the `columns` mapping on a group. `ALL` (`"*"`) means every media type;
otherwise key by the **hyphenated** media type. Both forms merge.

```python
"sources_other": FieldGroup(
    ...
    columns={ALL: ("some_column",)},   # every type
),
# or, for columns that only exist on some types:
    columns={"anime": ("mal_rank",), "tv-show": ("imdb_rating",)},
```

A new `FieldGroup` entry appears on `/roles` by itself: the editor grid is
built from `GET /api/roles/catalog`, never mirrored in the SPA. No migration —
the vocabulary is code, only the grants are rows. Restart to pick it up.

**Three rules before adding a column.**

1. **It must be `Optional` in that media type's Response schema.** The gated
   response is a copy with the column set to `None`, and FastAPI re-validates
   it against the route's `response_model`. A required field means the route
   answers **500** instead of a blanked entry. `AnimeResponse` was the one
   schema with required timestamps and had to be widened before they could be
   gated at all.
2. **Never gate a column the SPA routes on.** `system_id` is the route
   parameter, the query cache key and the notes owner id; withholding it breaks
   navigation and conceals nothing, since it is the page's own URL.
3. **Check the frontend for a placeholder.** The API blanking a value is the
   gate, but a component that renders `—` in its place still announces that
   something is being withheld. Drop the element instead.

`tests/unit/test_field_groups.py` is a drift test: it fails if a group names a
column or link field that does not exist, so a typo surfaces in CI rather than
as a silent no-op.

**The two edits default opposite ways.** Adding a column to an *existing* group
changes nothing until someone unticks it, because guest already holds that
permission. Creating a *new* group hides it from guests immediately: the seed
only tops up a guest role holding no grants at all (`seed.py`, `if not held`),
so an established guest role never receives the new permission and an admin
grants it deliberately. Same safe direction as content labels — new
restrictions start restrictive.

## Role guards

What each role is *seeded* with is in [Roles](#roles) above; this is what the
API refuses to let an admin do to one.

| Role | Rules |
|---|---|
| `guest` | Has no user rows; every anonymous or unresolvable request becomes this role. Can hold `media_type.*` and nothing else — the whole of `admin.*`, `manage.*` and `self.*` is locked off → **409** ([Locked grants](#locked-grants)), because that would hand any anonymous caller the ability to administer, write the catalogue, run a pipeline, or keep a list every visitor shares. Cannot be deleted or renamed. |
| `user` | A system role like the others, so it cannot be deleted or renamed either. Its grants *can* be edited - it is not root role - and `self.list` / `self.personal_notes` are the only things separating it from `guest`. |
| `super` | A system role too. Not root role - its grants are ordinary rows and editable on `/roles` - but seeded with `manage.catalog` and `manage.pipelines` and deliberately without `admin.authz`. |
| `admin` | `is_root=True`, so `Viewer.has()` short-circuits and it holds every permission including ones that do not exist yet (a new content label hides nothing from it) - **except the `self` family, which the short-circuit deliberately does not cover**, so an admin keeps no list, plan queue, season ratings, game copies or personal notes. `PUT /permissions` on a root role → **409**. Cannot be deleted or renamed. |
| custom | `is_root=False`. Created empty; grants replaced as a whole set (`PUT`, never append). Locked exactly like `user`: `admin.authz` and `manage.pipelines` refused, everything else a free choice. Deleting one with users still holding it → **409**. |

Seed: `app/services/rbac/seed.py::ensure_rbac_seed` is idempotent and runs
from both the `r1b2a3c4c5o6_add_rbac_core` migration and the app lifespan
(`app/main.py`), because the API tests build the schema with `create_all` and
never run Alembic. It only tops up a guest role that has *no* grants, so a
grant an admin removed is not handed back on restart.

## Viewer resolution

`app/services/rbac/resolver.py::resolve_viewer(request, db)` → frozen
`Viewer(username, role_id, role_name, is_root, permissions, user_id,
token_payload, mode_id, mode_key, visible_label_ids, field_groups)`.

The last four are the **object axis**; `permissions` is the ROLE's capability
set. `visible_label_ids` holds the labels this session may SEE —
`hidden_label_ids()` derives the complement, so do not invert it.

`user_id` is the resolved account's id, or `None` for a guest. It is what every
per-user read and write keys on, and it is why a guest sees no list at all —
see [What a guest sees](#what-a-guest-sees).

- Reads the `access_token` cookie, decodes the JWT (which carries `sub` and a
  decorative `role` and `mode`), loads the user, takes `user.role_ref` or the
  guest role, then resolves the access mode.
- **Which mode**: the `access_mode` cookie's mode if that cookie holds a live
  override minted for this account, otherwise the account's `is_default` mode,
  read from the database. The login token's `mode` claim is not read. An
  override that is expired, badly signed or minted for another account counts
  as no override. See [Switching mid-session](#switching-mid-session-post-apiauthaccess-mode).

**Mode resolution, fail-closed** (`app/services/rbac/modes.py::resolve_mode`):

```
mode        ->  still granted to this user?
                  yes -> effective = mode's sets - this pair's denials
                  no  -> effective = EMPTY SET
no token    ->  the `safe` mode by key, or EMPTY SET if it is missing
```

An override **names a choice, not a grant**: whether the account may still use
that mode is re-resolved from the database on every request, exactly as the
role already is, so revoking a mode or ticking a denial takes effect on the
viewer's next request even with a live cookie. It carries the mode's **uuid**
rather than its key, so renaming a mode does not invalidate live sessions.

Three fallbacks that all go to the **empty set**, and each for a reason worth
keeping:

- A revoked mode does **not** fall back to the account's default: an override
  naming it resolves to nothing until it expires or is switched away from.
  "Narrowest"
  is not well defined once modes are deliberately unordered, and falling back
  to `is_default` could *widen* a session — sitting in `safe` when an admin
  revokes `safe` would hand the viewer `unrestricted` with no password.
- A signed-in account with no override and no default mode does **not**
  inherit the guest default. That mode is the anonymous policy, not this
  account's.
- A missing `safe` mode gives a guest nothing, rather than everything. A
  misconfiguration must hide, not publish.
- **Never raises.** Missing/garbage/expired cookie, deleted user, deleted role,
  any exception → `GUEST_FALLBACK` (no permissions). Fails closed; this is what
  lets `/api/auth/me` and the public routes share it.
- `get_viewer` is the `Depends` form (deduped per request);
  `require_permission(name)` is a dependency factory.
- `app/services/rbac/resolver.py` binds three capability gates at import time,
  one per capability: `require_admin_authz`, `require_manage_catalog`,
  `require_manage_pipelines` — each `require_permission(<name>)`, else
  **401**. There is no single "is an admin" dependency, deliberately: routers
  depend on these by name rather than calling `require_permission` inline, so
  swapping a router's gate is a one-word edit and grepping for a capability
  finds every route holding it. A valid token for a deleted user, or for a
  role that lost the permission, is rejected.
- `app/dependencies.py::get_current_user_id` asks a different question from
  the other three: not "does this viewer hold a permission" but "is there an
  account at all". It returns `viewer.user_id` or **401**. Routes under
  `/api/plan-next` and `/api/seasonal` take it *in addition to* their
  `self.list` gate, because they need the id to scope the row they read or
  write, not because being signed in is sufficient.
  `app/services/rbac/resolver.py::viewer_user_id(viewer)` is the non-raising
  companion for the handful of routes that stay public and must simply show
  nothing per-user - the entry `watch_next` / `read_next` flags and the
  `seasonal` bucket of `/api/search`. It returns the viewer's own id or `None`,
  and there is deliberately **no fallback to another account**.
- The frontend counterpart is `ProtectedRoute`'s `requireAuth` prop
  (`frontend/src/components/layout/ProtectedRoute.jsx`), which gates on
  `username` rather than on `has(permission)`. `/plan`, `/seasonal`,
  `/seasonal/:seasonal_id` and `/statistics` use it.
- `/api/auth/me` returns `is_admin`, `username`, `role`, `is_root`,
  `permissions` (sorted); `AuthContext.jsx` builds a `Set` and exposes `has()`.
  It also returns `visible_gated_types`, the sorted gated media types this
  session may see (`gated_types.visible_gated_types`) - `["h-comic", "h-game",
  "hentai"]` in `unrestricted`, which carries every label, only the types
  whose label a mode carries otherwise, `[]` in a mode carrying none. It names
  only the seeable
  ones, so a session that cannot see a gated type is not told it exists.

### Cache (`cache.py`)

Permissions are resolved from the DB on every request rather than carried in
the JWT so that revoking one takes effect immediately. **Three caches now,
and one `bump()` that clears all of them:**

| Cache | Key | Holds |
|---|---|---|
| `_CACHE` | `role_id` | that role's permissions |
| `_MODE_CACHE` | `mode_id` | that mode's labels and field groups — shared by everyone holding it, so this is the hot one |
| `_DENIAL_CACHE` | `user_access_mode_id` | that (account, mode) pair's denials, usually empty |

They are keyed on the thing that is SHARED, never on the account: adding the
user to a key would make the cache unbounded in accounts and destroy the
sharing that makes it worth having. Every write in `roles.py` and
`content_labels.py` calls `cache.bump()`, which clears all three — a `bump()`
that cleared only the first would leave a revoked mode live until restart, and
would leak mode state between tests in a way whose failures are random and
order-dependent.
**Single-instance caveat:** the cache is process-local, so it is only
correct while the app runs as one process - which it does today, local
development being the only runtime. Self-hosting keeps that shape (one
container behind the tunnel), but any future second worker would serve stale
grants until its own restart and would need a short TTL instead.

## Visibility enforcement (`enforcement.py`)

Two gates, always applied together, reading **different axes**: the viewer's
ROLE holds `media_type.<key>` or the whole type disappears; the viewer's
active MODE carries every label the entry carries **and every label its
franchise carries**, or the entry disappears. Both run in SQL — filtering in
Python after `limit/offset` would shrink pages and shift the next page's start.

**The franchise half is a read-time cascade, not a stored copy.** No label row
is written onto an entry when its franchise is labelled, so moving an entry
between franchises changes what hides it at once, and clearing a franchise's
labels reveals everything it covered. `_hidden_by_label(entry_id, hidden)` is
the one place the two halves are spelled out, and every gate below calls it —
a second spelling is how one of them would end up asking only half the
question.

| Helper | Use | Behaviour |
|---|---|---|
| `hidden_label_ids(db, viewer)` | building block | ids of labels the viewer's ACTIVE MODE does not carry; `[]` is the common case and every caller short-circuits on it. **No `is_root` short-circuit** — labels are an object question, and holding every capability does not answer one |
| `apply_entry_visibility(query, model, media_type, db, viewer)` | list routes | `filter(false)` if the type is not held; otherwise `NOT EXISTS` anti-join on `media_content_label` **and** on `franchise_content_label` reached through `media.franchise_id` |
| `apply_franchise_visibility(query, db, viewer)` | franchise list, franchise search bucket | `NOT EXISTS` anti-join on `franchise_content_label`. No media-type half: a franchise has no type of its own and may hold entries of several |
| `franchise_visible(db, viewer, franchise_id)` | franchise detail and its writes | bool; callers **404 with their normal not-found message** |
| `apply_series_visibility(query, db, viewer)` / `series_visible(db, viewer, series_id)` | series list, search bucket, detail and writes; series-scope plan targets | A series carries no labels; it is hidden when its franchise is, through the same `franchise_content_label` anti-join reached read-time via `series.franchise_id`. A series with no franchise is never hidden |
| `tier_visible(db, viewer, tier_id)` / `require_visible_owner(db, viewer, owner_id, detail)` | note and meme owners | `tier_visible` resolves a franchise or series **from the id**, never from a caller-supplied tier type, and answers True for anything else. `require_visible_owner` is `require_visible_media` plus that tier half, raising the caller's own 404 |
| `apply_media_visibility(query, db, viewer)` | anything spanning every type at once | The same two gates over the `media` supertable rather than one detail table: the media-type check becomes an `IN` over the types the viewer holds, and the label anti-join goes through `media_content_label.media_id` and `media.franchise_id`. The profile page needs this — it answers for all twelve types in one query. The query must already select from or join `Media` |
| `entry_visible(db, viewer, media_type, entry_id)` | detail and per-entry sub-routes | bool; callers **404 with their normal not-found message** |
| `filter_visible_pairs(db, viewer, pairs)` | cross-type batches | one query for many `(media_type, id)` pairs. A pair naming a grouping tier passes the media-type half (a tier holds no such permission) and meets the label half as a tier: a `franchise` pair by its own labels, a `series` pair by its franchise's, a `collection` pair never |
| `label_hidden_entry_ids(db, viewer, ids)` | shared-record sub-routes | the ids hidden by a **label** alone, without the media-type half. A person's or character's `/entries` drops these rows whole, group and all, because a label-hidden appearance is a hidden connection; a row withheld only by a type gap is not (see [Shared records](#shared-records)) |
| `drop_hidden_rows(db, viewer, rows, type_attr, id_attr)` | quotes, memes, plan-next | rows are **dropped**, not degraded to `missing=True` (the text itself is the leak; `missing` means "dangling reference, fix it"); rows with no reference are kept |

`viewer=None` returns input untouched everywhere, and that half of the guard
**must stay**: internal callers pass `None` to mean "not a request", and
`_factory._finish(db, entry, viewer=None)` relies on it. There is deliberately
no `is_root` half: object scoping lives on the mode axis, which holding
every capability does not reach. The media-type half goes through `has()`,
which does short-circuit on `is_root`, because `media_type.*` is a role
permission.

**404, not 403.** A hidden entry answers exactly as an absent one, so a viewer
cannot enumerate what exists. Admin routes use **401**, never 403, so the SPA
sees one error shape.

### Shared records

People (in every role), characters, studios, publishers and vocabulary values
(`system_option`) are **shared records**: entries point at them, and none
carries a content label. They are hidden by what they are connected to, in
`app/services/rbac/shared_visibility.py`:

> **A shared record is hidden when it has at least one connection and every
> connection it has is hidden.** A record with no connections at all stays
> visible.

| Record | Connections (`CONNECTIONS`) |
|---|---|
| person | `media_credit` rows, `character_casting` rows (a seiyuu is credited through casting), `person_role` scopes |
| character | `character_casting` rows |
| studio | `media_credit` rows |
| publisher | `media_credit` rows, `publisher_scope` scopes |
| vocabulary value | `media_tag` rows, `system_option_scope` scopes |

A connection is one of three kinds:

- **An appearance** — a row placing the record on an entry. Hidden when the
  entry is **label-hidden**, by its own label or its franchise's. A media-type
  permission gap does **not** hide an appearance: a viewer lacking
  `media_type.game` still sees a person credited only on games, exactly as
  before the rule existed.
- **A scope naming a gated type.** A media type named in
  `REQUIRED_LABEL_FOR_TYPE` (`app/services/rbac/gated_types.py`) is a *gated
  type*: every entry of it carries that label. A viewer can see a gated type
  when its required label is not in the viewer's hidden set
  (`can_see_gated_type`). A scope row naming a gated type is a connection,
  hidden when the viewer cannot see that type. **A scope naming an ordinary
  type is not a connection at all** — every credit writes a matching role row,
  so counting ordinary scopes would keep visible every person whose only
  credits are hidden. The gated types are `h-comic`, `h-game` and `hentai`, so
  a person role, a publisher scope or an option scope naming one is a hidden
  connection for a session that cannot see that type: a club created before
  its first credit (its `club` role is scoped to h-comic alone) and an unused
  H Genre value are hidden by their scope. A studio or director credited on a
  hentai is the ordinary case: hidden when every credit is on a hidden entry,
  visible through any mainstream anime it is also credited on.
- **A category serving gated types only.** A vocabulary value's own
  `category` is a connection when every tag field drawing on that category
  serves gated types alone (`gated_tag_categories`,
  `DeclaredScope("category")` in `shared_visibility.py`). The code declares
  it, so no row is needed: every value of `H Genre Plot`, `H Genre
  Appearance` and `H Genre Relation` - shared by h-comic, h-game and hentai -
  is hidden from a session that can see none of them, even with no scope row
  and no use. A session that sees one of them keeps the categories. A category
  shared with an ungated type (Official Source; Game Genre and Game Theme,
  which serve game as well as h-game) is not a connection, and its values
  follow the two rules above: a game genre used only by an h-game is hidden
  through that appearance, an unused one stays visible.

**Club membership is not a connection.** `person_membership` never makes a
hidden club or artist visible. A visible club's `/members` omits the members
the viewer cannot see, a visible artist's `/clubs` omits the hidden clubs, and
either route 404s when the person asked about is hidden. The two replace
writers keep the rows naming a person the writer cannot see, as the scope
writers below do.

So crediting somebody on a visible entry reveals them and removing that credit
hides them again; nothing is stored. The rule is one SQL condition
(`_hidden_condition`, `EXISTS connection AND NOT EXISTS visible connection`,
built on `hidden_label_ids` and `_hidden_by_label`), applied three ways:

| Helper | Use |
|---|---|
| `apply_shared_visibility(query, model, db, viewer)` | list, search and option routes — a filter, so pages do not shrink after `LIMIT` and a list costs no per-row query |
| `shared_record_visible(db, viewer, model, id)` / `require_visible_shared(...)` | detail routes, `/entries`, writes, `/api/covers` and image attach — callers 404 with their own not-found message |
| `hidden_scopes(db, viewer)` / `without_hidden_scopes(...)` | the gated types a viewer cannot see, left out of a visible record's `roles` / `scopes` and of `role-scopes`; a `?scope=` naming one answers `[]` |

The connection tables are **aliased** inside the condition. The person list
already joins `person_role` to filter by role, and an unaliased `EXISTS` over
the same table would correlate to the caller's row instead of scanning its
own.

**A visible record omits its hidden connections.** Counts and entry lists go
through `filter_visible_pairs`, as before; a person's and a character's
`/entries` additionally drop label-hidden rows *whole*, so no empty group is
left naming the hidden work's media type. A scope the viewer cannot see is
left out of the record's `roles` / `scopes`, and the full-replace writers
(`PUT /api/person`, `PUT /api/publisher`, `PUT /api/options`) **keep** those
rows, because a form that never showed them cannot mean to delete them.

Hidden means what it means for an entry: absent from list, search, filter and
combobox endpoints; **404** on the detail route, its sub-routes and its
writes; its photo or logo not served by `/api/covers`. The `viewer=None`
convention holds here too.

### Gated types

A **gated type** is a media type every entry of which carries one content
label. `REQUIRED_LABEL_FOR_TYPE` (`app/services/rbac/gated_types.py`) names
them; today it is `{"h-comic": "h-comic", "h-game": "h-game", "hentai": "hentai"}`. A session can see a gated type
when its mode carries the required label, which in practice means
`unrestricted`: the label is granted to no other mode, and the seed keeps it
off `borderline` (see [Access modes](#access-modes--which-objects-those-operations-reach)).

Each label is a **system label**, and nothing about it is left to an admin,
because a missing label means a public entry. The mechanics are shared by
every gated type (`app/services/domain/gated_labels.py`):

- **Created** by its type's migration (`h1c2o3m4i5c6` for h-comic,
  `h2g3a4m5e6t7` for h-game, `h2e3n4t5a6i7` for hentai) and by the lifespan
  seed (`ensure_system_labels` in `app/services/domain/gated_labels.py`, which
  finds the label by key and so adopts a row an admin made by hand - a
  `hentai` label made by hand is adopted, not duplicated), granted to
  `unrestricted` only. `DELETE /api/content-labels/{id}` refuses it (409).
- **The `hentai` label means the type.** Its migration removed it from every
  entry that is not a hentai, and removed any grant to a mode other than
  `unrestricted`; neither is restored by the downgrade. Nothing refuses a
  gated label on another type's entry afterwards.
- **Stamped on every entry of the type on every write path**: the registry's
  `progress_hook` on create, update and the tracker PATCH; and
  `enforce_gated_label_invariants` after Pull restores the type's own tab
  (H-Comic, H-Game, Hentai), Franchise or any label tab, and in Calculate
  (`run_sync_gated_labels`).
- **Stamped on every franchise whose type list names the type's franchise
  type** (`H-Comic` -> `h-comic`, `H-Game` -> `h-game`, `Hentai` -> `hentai`;
  a franchise holding `H-Comic` and `Hentai` carries both): when the resolver
  auto-creates one, when a franchise is created, updated or patched with that
  type, and by the same invariant pass.
- **Never removable**: a label replace on a gated entry, or on a franchise
  whose types require it, whose new set lacks the required label is refused
  with 422 before anything is deleted (`refuse_label_removal_on_entry` /
  `refuse_label_removal_on_franchise`).
- **Kept in its own franchises, both ways.** A mainstream entry under a gated
  family's franchise would be hidden by that franchise's label, and a gated
  entry under a mainstream franchise would put a gated work in a public group.
  `FRANCHISE_FAMILY_FOR_TYPE` sorts franchise types into families - `H-Comic`
  and `Hentai` are one, `H-Game` is its own - and every write path keeps an
  entry in its own ([entry-types.md](entry-types.md#franchise-families-franchise_family_for_type-apputilsconstantspy)).

The label handling lives in `app/services/domain/gated_labels.py` and is driven by
`REQUIRED_LABEL_FOR_TYPE` and `FRANCHISE_TYPE_FOR` alone: a further gated
type adds its map entry and its row in `gated_labels.SYSTEM_LABELS`, and every
bullet above applies to it.

With the label on every entry, the ordinary gates hide the type everywhere
`enforcement.py` reaches, and the shared-record rule above hides everything
connected only to it. `/api/auth/me`'s `visible_gated_types` tells the SPA
whether to offer the type at all: `AuthContext` exposes it, and one helper,
`canSeeGatedType` (`frontend/src/lib/gatedTypes.js`), is what both SPA
permission surfaces ask - `<ProtectedRoute gatedType="h-comic">`,
`gatedType="h-game"` and `gatedType="hentai"` around each type's library and
detail routes, and the nav row's `gatedType` in `navigation.js` - along with
every picker, tab, list and favourite grid that names the type
([frontend/components.md](frontend/components.md#gated-media-types)). A root
account in a narrower mode is not shown the type either: the gate is the
mode's label, not a capability.

#### What a narrow session is not told

A session that cannot see a gated type is not told the type exists. Each
surface below narrows by what the code already declares (`gated_types.py`), so
a second gated type needs no edit to them:

| Surface | Left out |
|---|---|
| `GET /api/constants` | a vocabulary serving only hidden gated types (`TYPE_ONLY_VOCABULARIES`: `h_comic_region` and `h_comic_animation_status` with h-comic, the `h_game_*` keys with h-game, `hentai_source_material` with hentai, `h_comic_originality` only when h-comic and hentai are both hidden, `h_comic_usefulness` only when h-comic, h-game and hentai all are), its key from `media_type`, a franchise type stamped only for it from `franchise_type` (`H-Comic`, `H-Game`, `Hentai`), a person role scoped only to hidden types from `person_role` (`club`), a category serving only hidden types from `option_categories` / `tag_categories` (the H Genre categories, when every type they serve is hidden) |
| `GET /api/person/role-scopes`, `/role-counts` | the gated type from every role's scopes, and a role scoped only to it (`club`) entirely |
| `GET /api/notes/sections?owner_type=h-comic` (or `h-game`, `hentai`) | the whole answer: 400, as for an unknown owner type. No other owner type lists `h_comic_highlights` / `h_game_highlights` |
| `GET /api/auth/me` | the type from `visible_gated_types` |
| `GET /api/constants/external-apis` | the type's row in `media` |
| `GET /api/search` | the type's bucket key from `results` - absent, not empty |

The mirror is `unrestricted`, which is told everything. The SPA adds nothing
to this list - it draws what the server tells it - but it does leave the
type's nav row, routes, tabs and pickers out rather than render them empty.

### Covered surfaces

| Surface | Where wired |
|---|---|
| media lists, detail (every type, incl. gating) | `app/routers/_factory.py` (`apply_entry_visibility`, `entry_visible`, `gate`) |
| credits for an entry | `routers/credits.py` → 404; hidden entries' credits not counted on person/studio |
| people, characters, studios, publishers (list, detail, `/entries`, `role-counts`, `role-scopes`, writes) | `routers/person.py`, `character.py`, `studio.py`, `publisher.py` — [Shared records](#shared-records) |
| option lists (`/api/options/`, `/api/options/{category}`) and option writes | `routers/options.py` (`_visible_options`) — [Shared records](#shared-records) |
| series (list, detail, writes) | `routers/series.py` (`apply_series_visibility`, `series_visible`) — hidden with a label-hidden franchise |
| notes for an owner | `routers/note.py` → 404 for a hidden entry, franchise or series owner (`tier_visible`, `require_visible_owner`), `gated_note_sections` withheld |
| quotes (list, grouped, by id) | `routers/quote.py` (`drop_hidden_rows`) |
| memes (list, grouped, by id) | `routers/meme.py` — a meme on a hidden entry, franchise or series is dropped; writes use `require_visible_owner` |
| plan-next rows | `routers/plan_next.py` |
| relations `for-entry`, `scope`, `graph` | `routers/media_relation.py` — hidden anchor → 404; an edge naming a hidden entry is dropped whole; graph is viewer-filtered |
| attaching an image to a media entry or an entity | `routers/images.py` → 404 "Entry not found." An entity owner is asked through `shared_record_visible`; quote/meme owners carry no label and are not checked |
| serving a cover image (`/api/covers/{owner_type}/{id}.jpg`) | `routers/covers.py` → 404. The media type is resolved from the `media` row, never read out of the path: both halves of the pair are caller-supplied there, so trusting the folder would gate an entry under another type's permission. An id naming no `media` row is an entity owner (staff, character, publisher, studio), a shared record asked through `shared_record_visible`; its folder is read from the path, which is safe because the folder names the file |
| watch-order items, addable candidates | `routers/watch_order.py` (`resolve_items`, `list_candidate_entries`) |
| search | `routers/search.py` — entries, franchises, series and the person/studio/publisher buckets |
| a public profile (`/api/profile/{username}`) | `routers/profile.py` (`apply_media_visibility`) - filtered by the **reader's** permissions, never the list owner's |
| own-list reads and writes (`/api/me/list/{media_id}`) | `routers/me_list.py`, behind `self.list` **and** `entry_visible` in `_media_or_404`. Both are needed: the capability gate alone lets an account holding `self.list` rate an entry it cannot see, or a media type it does not hold, by knowing the uuid. Writes follow reads: 404 with the not-found message, never 403 |
| account settings (`/api/account/settings`) | `routers/account.py` - the `list_is_public` toggle, writable only by its owner |
| `data_control` / `system` GETs | behind `require_manage_pipelines` |
| Pull's four authorization tabs (`Users`, `Content Label`, `Media Content Label`, `Franchise Content Label`) | `routers/data_control.py` passes `may_restore_authz=viewer.has(PERM_ADMIN_AUTHZ)` into `pull.py`. Without it each returns `status: "skipped"` and is named in `unresolved_refs`, so the rest of the restore still lands and the gap is visible. Stops a `manage.pipelines` holder promoting themselves by typing `admin` into the sheet's Users tab. **Backup is not gated** - it writes local -> sheet and cannot change this database |

### Write binding

**A write answers exactly what a read would.** Nine routers — the per-type
entry routes, `casting`, `credits`, `quote`, `meme`, `note`, `media_relation`,
`watch_order`, `images` — resolve a client-supplied entry id through
`entry_visible` before writing, and a hidden or nonexistent entry gets the
same answer a `GET` of it would: the per-type routes and `casting`/`credits`
their existing 404, `media_relation`/`watch_order` their existing
`400 "Referenced entry does not exist."`, `note` its existing
`404 "Owner not found."`, `images` its existing `404 "Entry not found."`.
`entry_visible` (`enforcement.py`) is the single place this is decided;
nothing else re-implements the check. No route gained a new status code or a
new message — a 403 would itself confirm the entry exists, which is the
property being protected.

`images.py`'s `POST /api/images/{image_id}/attach` is gated by
`require_manage_catalog` first — that answers *may this account write the
catalogue at all* — and only then, when `owner_type` names a media type,
calls `entry_visible` to answer *may it reach this particular entry*. A
holder of `manage.catalog` who lacks an entry's restriction label would
otherwise be able to attach a cover to (and so overwrite the cover of) an
entry it cannot even read; the same trap `casting.py`'s `_resolve_entry`
documents. An entity owner (`staff`, `character`, `publisher`, `studio`) is a
shared record and is asked through `shared_record_visible`, with the same 404.
`quote`/`meme` carry no content label, so attach skips the check for them —
there is nothing for it to test.

`_factory.py::_get_or_404`'s `viewer` parameter **has no default, and must not
be given one**. `entry_visible` returns `True` for a `None` viewer, so a
default silently closes the check on every call site that omits it — 36
routes, including the four per-type write routes across all twelve media types.
Required means a write route that forgets it is a `TypeError` rather than a
silent grant.

That is ten routers, not *every* route in the app.
`POST /api/data-control/replace/{key}/{entry_id}` is deliberately outside it —
see the residuals below — so do not read the list of ten as proof of
completeness.

Three routers — `quote`, `note`, `meme` — take a `(type, id)` pair from the
client but write against the id alone. **The type in the payload is not
evidence of anything**: gating on it checks the wrong `media_type.<key>`
permission while the label half, keyed on `media_id`, still bites, which is a
silent bypass of the type axis alone. All three share
`enforcement.require_visible_media(db, viewer, entry_id, detail)`, which
resolves the type from the media row and raises the caller's own 404. The
helper exists because the shortest form has to be the safe one.

`content_labels.py`'s four assignment routes bind the same way, through
`_resolve_entry` / `_resolve_franchise`: assignment is `manage.catalog`, which
says nothing about which objects a session reaches, so a narrowed editor who
knew the id could otherwise clear the very label hiding the thing from them.
Both answer 404 in the words the router already uses for missing. A replace
that would drop a gated type's label from one of its entries or from a
franchise of its franchise type (`h-comic` / `H-Comic`, `h-game` / `H-Game`, `hentai` / `Hentai`)
is a **422**, checked before anything is deleted - see
[Gated types](#gated-types).

**Accepted residuals, deliberately not closed here:**

- `franchise.py` stores `cover_entry_id` unvalidated. The consequence of a
  mismatched or hidden id is a cover image, not a data leak.
- `POST /api/data-control/replace/{key}/{entry_id}` (`data_control.py`, ten
  media types) takes a client-supplied entry id, is gated by
  `require_manage_pipelines` alone and never asks `entry_visible`:
  `services/pipelines/runner.py` answers 404 "<label> entry not found" for a
  missing entry and 200 "Successfully updated <display_name>." for a hidden
  one — a write, an existence oracle and a title leak. It is left alone on
  purpose: gating it while `Replace All` in the same router stays ungated
  would enforce the object axis incoherently inside one subsystem, and what
  the object axis means for a pipeline is the parked policy question (a
  `manage.pipelines` holder can already rewrite labels and role assignments
  through Pull All).
- `note.py`'s owner guard waves through an `owner_id` naming neither a
  `media` row nor a hidden franchise or series, because a collection is a
  legitimate owner and is neither. A *nonexistent* id therefore reaches the
  insert and fails on a foreign key, surfacing as a 500, while a hidden id
  answers 404 — so on that one path hidden and missing are still
  distinguishable, by the status code rather than by the body.

### Accepted residuals

- Seasonal counts (`/api/seasonal`) include hidden entries. The whole prefix
  is behind `self.list`, so this leaks a count to accounts that keep a library,
  never to the public.
- Watch-order *list* summaries expose `media_types` and `item_count` including
  hidden items.
- `/static/library/...` files are served without checks. The mount is
  unauthenticated, so anyone holding the URL gets the bytes — but a
  `/static/library/<checksum>.jpg` path is **not constructible**: the key is a
  content hash, so nothing a viewer already knows about an entry yields one.
  An uploaded image is therefore not "secure", only unguessable. Quote images
  under `/static/quotes/` are the same bargain with legacy filenames.

  **Covers are no longer in that bargain, because their keys are
  constructible.** `<owner_type>/<system_id>.jpg` is derivable by anyone who
  learns an entry id from any source, and the cover is exactly the thing a
  content label hides — so `static/covers/` is not mounted at all. Only
  `static/library/` and `static/quotes/` are (`app/main.py`), and covers are
  served by `routers/covers.py`, which asks the same gates the API does before
  opening the file.
- Franchise/series hubs may render empty rather than 404 when all children are hidden.
- A newly created content label reaches **`unrestricted` and no other mode**,
  so it hides its entries from every narrower session until somebody carries
  it at `/access-modes`. Fail-closed everywhere it can be: "hidden from
  everyone, the owner included" is not a safe default, because a hidden entry
  404s and therefore looks deleted rather than restricted.

### The two-spellings trap

`MEDIA_REGISTRY` (router configs, `_factory.py`) uses underscore keys
(`anime_movie`, `tv_show`); `MEDIA_TABLES`/`OWNER_TABLES`
(`app/utils/media_resolver.py`) and every stored `media_type` column use
hyphens (`anime-movie`, `tv-show`). Permissions are keyed on the hyphenated
form. Always pass `spec.owner_type` (hyphenated) into the rbac helpers — a
registry key would never match a grant and would hide the whole type.

## Field gating (`field_gate.py`)

`gate(viewer, media_type, payload, schema)` applies withheld field groups to
one entry or a list. **`_withheld(viewer)` reads `viewer.field_groups` — the
active MODE's set — not `viewer.has(field_group.<key>)`, and it does not
short-circuit on `is_root`.** A `None` viewer
still withholds nothing, because internal callers pass `None` to mean "not a
request".

- **Link fields** (credits) are plain attributes attached at read time by
  `attach_link_fields`, so they are blanked in place — nothing to flush.
- **Real columns** (no group gates one today; `created_at`/`updated_at` were
  the last and are now served to everyone) are
  stripped from a **copy**: `schema.model_validate(entry).model_copy(update=
  {col: None})`. Never `setattr` on a live ORM row — autoflush would persist
  the blank and gating would become silent data loss.
- **`media_source` buckets** are a fifth flavour, gated earlier and
  differently: `attach_sources` (called before `gate()` runs) excludes the
  withheld buckets at the query level, so `entry.sources` never carries the
  rows in the first place. `gate()` and `gated_columns()` know nothing about
  `source_buckets` — see [Field groups](#field-groups) above.
- Returns the ORM instances untouched when nothing is withheld (the common case).
- `gated_note_sections(viewer)` lists `note.section` values to withhold. It is
  applied **only to rows the viewer did not author** - hiding somebody's own
  notes from them is not a permission, it is a bug.
- **`remark` is not gated here at all.** It is a personal-scope note, read
  per viewer by `app.services.domain.remark_field.attach_remark`, filtered on
  `note.author_id`. It must never become a class-level `column_property`: a
  scalar subquery cannot know who is asking, so it would serve one person's
  private assessment to everybody and would force
  `ix_note_one_remark_per_owner` back to per-owner, which makes the database
  refuse a second account's remark outright. See
  [business-rules.md](business-rules.md).

## What a guest sees

**Which OBJECTS:** a logged-out visitor resolves to the `safe` mode, always.
It is looked up **by key**, and there is no column anywhere that says
otherwise — which mode an anonymous visitor gets is the definition of that
mode, not an administrator's choice, so no page offers to change it and no
row stores it. Had it stayed data, a Pull All, a migration or a hand-edit
could point it at `unrestricted`, publishing every labelled entry to the
internet while looking like a successful restore, with nothing on any screen
reporting it. The `key` column is safe to depend on because it is deliberately
not patchable: renaming one would detach the seeder from the row it maintains.
If the `safe` row is missing, a guest gets the **empty set** rather than
everything.

A logged-out visitor also gets **no mode switcher at all** — not a disabled
one. `held_modes()` returns `[]` without an account and the switcher renders
`null` below two modes, so the control is absent from the chrome and the
existence of other modes is never advertised.

`safe` is seeded from whatever the **guest role actually holds**, not from
the default set. The two differ: `ensure_rbac_seed` tops up only a role
holding *nothing*, deliberately, so an admin's removal survives a restart —
which means a field group added to `FIELD_GROUPS` after the roles were first
seeded never reaches an established guest role. Seeding `safe` from the
defaults would publish the other-sources list and other people's personal
reviews to every logged-out visitor.

**Which LIST:** a logged-out visitor has **no list**, and is shown none. `acting_user_id`
returns None for an unresolved viewer, `attach_list_fields` sets nothing, and
the twelve `*Response` schemas declare their status field `Optional[str] = None`
so it serialises as null. The library table renders `-`, and the detail page's
"My tracker" card does not render at all - the card is one person's by name,
and there is no "my" without a viewer.

**There is deliberately no fallback to another account.** A status is a claim
about a person; with nobody asking there is nobody to make it about, so the
fields come back empty rather than naming whoever happens to sort first.

**A filter over a personal column matches nothing for a guest.** That is not
cosmetic: `join_list` is a no-op when there is no user, so a reference to
`user_media_list` in a `WHERE` clause became an implicit **cross join** and
`?watching_status=Completed` would have matched rows from *every* account.
`app/routers/_factory.py` short-circuits such a filter to `false()`.

Two rules that are **not** this one:

- **`installation_owner_id(db)`** (`app/services/domain/user_list.py`) — whose
  rows a restore or a pipeline writes. The sheet holds one person's collection
  and carries no owner column, and `user_media_list.user_id` is NOT NULL, so
  Pull and Calculate have to name somebody. A data-ownership question, never a
  visibility one; nothing on a request path may call it. The answer is
  `users.is_installation_owner` — see [The admin account holds no user
  data](#the-admin-account-holds-no-user-data) below — with two fallbacks for
  a database where nobody holds the flag: the alphabetically-first
  non-root account, then the first account of any kind, so a restore onto
  a fresh machine still lands.
- **`viewer_user_id`** — the non-raising companion for the two public paths
  that must show nothing per-user. It has no fallback either.

## The admin account holds no user data

An administrative account administers the site. It does not keep a library on
it — no list rows, no plan queue, no season ratings, no game copies, no
personal notes.

**The rule is one condition in `Viewer.has()`: the root short-circuit
does not cover the `self` family.** `self.list` and `self.personal_notes` are
not privileges — they are OWNERSHIP, the right to keep rows of your own. "May
do anything to the system" and "has a personal library" are different claims,
and conflating them is what fills an admin account with somebody's collection.
Everything else short-circuits, so a content label or a media type added
tomorrow hides nothing from an admin.

It lives in the permission model rather than in refusals scattered through the
write routes: a rule spelled out in twenty routers is a rule that will be
missing from the twenty-first.

| Surface | What it does with the rule |
|---|---|
| `Viewer.has()` (`services/rbac/resolver.py`) | the rule itself |
| `AuthContext.has()` (`frontend/src/contexts/AuthContext.jsx`) | mirrors it. **Both halves or neither** — with only the server half, the nav advertises Plan, Seasonal and Statistics to an account the API answers 401 |
| `/api/me/*`, `/api/plan-next/*`, `/api/seasonal/*` | all three prefixes are gated on `self.list` at the router, so a route added later is covered by default. An admin gets 401 |
| Nested game `copies` | skipped, not refused, for a viewer without `self.list` (`services/domain/game_copies.py`). A copy is personal ownership written through a **catalogue** route, so failing the whole Game edit would refuse a legitimate catalogue change. The SPA hides the editor, so this is the second stop |
| `navigation.js`, `App.jsx` | both ask `self.list`, so the personal pages disappear from an admin's nav with no change of their own — the payoff of putting the rule in `has()` |

**A grant beats the carve-out.** The rule removes the *implicit* hold, so an
account whose role is explicitly granted `self.list` keeps its library
whatever its `is_root` flag says.

**Authorship is not ownership, and an admin does create rows.** Quotes, memes
and catalogue-scope notes are `manage.catalog` writes, and `author_id` records
who wrote them (`models/note.py`). An admin doing its job makes them. "Holds
no user data" is a statement about ownership — lists, queues, ratings, copies,
personal notes — not about authorship.

Whose rows a pipeline files under is the matching data question, answered by
`users.is_installation_owner` and never by a role. See
`installation_owner_id()` in [What a guest sees](#what-a-guest-sees) above and
the column in [data-model.md](data-model.md).

## Note scope

Every entry in `NOTE_SECTIONS` (`app/utils/note_sections.py`) declares a
`scope`, with no default: **`catalog`** (20 sections) holds one shared set of
rows, **`personal`** (7) holds one set per user, and the two `SHAPE_EXTERNAL`
sections - `quotes` and `memes` - declare `None`, because they store no `note`
row and are universal by design. The distinction lives in the registry rather
than in the schema, so reclassifying a section stays a registry edit plus a
data reassignment, never an `ALTER TABLE`. `/api/notes/sections` serves it.

| Scope | Write | Read |
|---|---|---|
| `catalog` | `manage.catalog` | everyone, unfiltered |
| `personal` | any signed-in account holding `self.personal_notes`, own rows only | `WHERE author_id = viewer` - or the profile owner's, through `?author=`, when their `list_is_public` **and** the viewer's MODE carries `personal_notes` |

**Two answers, and there is no 403 in this router.** `401` means *you may not
do this kind of thing* — a capability failure, matching what
`require_permission` returns and the one error shape the SPA knows. `404`
means *this object is not yours to see*, in the same words a genuinely absent
row gets, because a 403 confirms a row exists exactly as surely as a 200 does.

| Situation | Answer |
|---|---|
| no `self.personal_notes` (a guest included) | **401** |
| no `manage.catalog`, creating a catalogue note | **401** |
| no `manage.catalog`, editing a catalogue note | **401** — the caller may not edit catalogue notes at all, which is not a fact about this note |
| somebody else's personal note | **404**, worded identically to a missing one |
| `?author=` naming a private list, a viewer whose mode lacks `personal_notes`, or a username that does not exist | **404**, all three identical, so the reply cannot be read as "this account exists" |

`tests/api/test_note_status_codes.py` asserts the absence of 403 directly, so
a "clearer" 403 fails the suite rather than quietly reintroducing an oracle.

**Quotes and memes are untouched by scope.** They carry an `author_id` for
provenance and every viewer reads the same rows.

**A remark belongs to its author.** `remark` is read per viewer by
`attach_remark`, filtered on `note.author_id`, and
`ix_note_one_remark_per_owner` carries `author_id`, so two accounts may each
hold a remark on one entry and each reads back their own. The index and the
read path are one mechanism: narrowing the index without a viewer-aware read
turns a loud refusal into an accepted-then-invisible write.

**`field_group.personal_notes` is a mode item, not a role grant.** It gates
the `personal_reviews` section on every row the viewer did not author.

## Admin routes

| Method & path | Notes |
|---|---|
| `GET /api/roles/`, `GET /api/roles/{id}` | with `permissions` and `user_count` |
| `GET /api/roles/catalog` | the vocabulary grouped by family — the editor grid is built from it, never mirrored in the SPA. **Four families only**: `admin`, `manage`, `media_type`, `self`. Content labels and field groups are not offered, because a role cannot express "minus this label" — permission resolution is a union |
| `POST /api/roles/` | 409 on duplicate name or a locked-off grant; created non-root |
| `PATCH /api/roles/{id}` | label/description/sort_order only; `guest`/`admin` cannot be renamed |
| `PUT /api/roles/{id}/permissions` | replaces the set; 422 unknown, 409 root role, 409 if the payload holds a locked-off grant or drops a locked-on one |
| `DELETE /api/roles/{id}` | 204; 409 for system roles or roles still held |
| `GET/POST/PATCH/DELETE /api/users/…` | `role_id` must exist (422); username 409 |
| `GET /api/content-labels/`, `POST`, `PATCH`, `DELETE` | 409 duplicate key; delete cascades assignments (entries become visible again); 204. `DELETE` of a label a gated type requires (`h-comic`, `h-game`, `hentai`) is **409** |
| `GET/PUT /api/content-labels/entry/{media_type}/{entry_id}` | list / replace an entry's label keys; 400 unknown type, 404 entry, 422 unknown label, 422 a set without the required label on a gated entry (`h-comic` on an h-comic, `h-game` on an h-game, `hentai` on a hentai) |
| `GET/PUT /api/content-labels/franchise/{franchise_id}` | the same for a franchise; 422 a set without the required label on a franchise whose type includes `H-Comic` / `H-Game` / `Hentai` |

`ContentLabelResponse` carries no `permission` field. A label is not a
permission — publishing `label.<key>` would name something that does not
exist. The admin table shows the label's `key`.

All are behind `require_admin_authz`; every write calls `cache.bump()`.

### Editing modes: `/api/access-modes`

| Method & path | Notes |
|---|---|
| `GET /api/access-modes/`, `GET /{id}` | modes with their items and holder counts |
| `GET /api/access-modes/catalog` | two labelled groups, Content Labels and Field Groups, each item carrying `mode_count` |
| `POST /`, `PATCH /{id}`, `PUT /{id}/grants`, `DELETE /{id}` | 409 duplicate key; 422 unknown item; `PUT` replaces both sets wholesale |

All under `admin.authz`; every write calls `cache.bump()`.

**Three rules the router enforces that the page alone could not:**

- **Nothing here touches the anonymous policy.** `PATCH` changes a mode's
  label, description and sort order and that is all; which mode a logged-out
  visitor gets is `safe`, by key, and no endpoint can move it.
- **A mode an account still holds cannot be deleted** (409). The FK would
  cascade the grants away and silently narrow those accounts, possibly to
  nothing if it was their only mode.
- **`is_system` is never settable through the API.** It marks the four modes
  the seeder maintains.

**The label carried by no mode.** `/catalog` lists **every** content label
with a `mode_count`, and a count of zero is the case the page exists to
surface - such a label hides its entries from everyone, the owner included,
and there is nowhere else to learn that. The page shows it in red, computed
from the DRAFT so the warning appears the moment you untick the last mode
carrying it, while it can still be reconsidered. With `unrestricted` derived
the warning should never fire; it stays as the last check on that invariant,
since a set comparison is cheap and nothing else on the page would show the
invariant breaking.

`unrestricted` is listed like any other mode and is the one row whose boxes
are drawn **disabled, with no Save**. `PUT /grants` refuses it with a 409 —
both halves, because a UI-only lock is a suggestion. An admin who wants a
narrower ceiling narrows `borderline`, or makes a mode of their own.

### Assigning modes: `PUT /api/users/{id}/access-modes`

Replaces an account's whole set - grants, login default and denials - in one
payload, matching `PUT /roles/{id}/permissions`.

**The system-mode rule is enforced twice, and neither half would be enough alone.** The
server refuses a denial naming something the mode does not carry (422): a mode
is a ceiling, so such a denial subtracts nothing and storing it would be a
no-op that reads like a setting. The panel renders a held mode's items as
**the mode's own list with tick-to-deny**, which makes the control
structurally incapable of asking for one. A UI that cannot express the invalid
thing paired with a server that would accept it is one refactor away from a
silent no-op; a server rule with no matching affordance is an error people hit
and work around.

Two defaults answers 422 rather than the 500 `ix_one_default_mode_per_user`
would give. An empty list is allowed - an account holding no mode resolves the
empty object set, fail-closed, and a legitimate way to park somebody. The
users table calls that state out in red, because it is correct and looks
exactly like a broken site.

**A new account holds `safe` and only `safe`** (in `users.py`'s
create handler). An invitee starts narrow and is widened deliberately rather
than starting wide and being narrowed if somebody remembers. It is granted at
creation rather than left empty because a mode-less account reaches nothing,
which is correct and indistinguishable from a broken invitation.

### Switching mid-session: `POST /api/auth/access-mode`

Narrowing is instant; widening asks for the password again, so nobody widens
a session they merely find logged in. The test is a set
comparison - modes are deliberately unordered, so "narrower" can only mean
"its effective set is a subset of mine" - and it runs against **effective**
sets, after denials.

`/api/auth/me` advertises the cost per mode as `requires_password`, and the
endpoint enforces it with the **same function**, because the endpoint that
enforces a rule must not be able to disagree with the payload that advertises
it. The SPA never models the rule.

**A SWITCHED-TO MODE IS TEMPORARY; THE DEFAULT IS NOT.** The login cookie
says who is asking and lasts a month; it does not say which mode. Switching to
anything but the account's default sets a second cookie, `access_mode`
(`resolver.MODE_OVERRIDE_COOKIE`):

| Property | Value | Why |
|---|---|---|
| lifetime in the browser | session cookie: no `max_age`, no `expires` | closing the browser drops it |
| token `exp` | `ACCESS_MODE_OVERRIDE_MINUTES` (60) after the switch, capped at the login's `exp` | a browser that restores its session, or is never closed, still returns to the default |
| token claims | `sub`, `mode` | an override minted for another account is ignored |
| cleared by | switching to the default, login, logout | a new login always starts in the default |

So a laptop switched to `unrestricted` and left alone is back in its default
mode within the hour. This applies to narrowing as well as widening: a session
switched below its default returns to the default when the override ends,
without the password, because the default is what the account's own login
already grants. `/api/auth/me` publishes the end as `mode.expires_at`, and
`AuthContext` reloads the page just after, so nothing fetched in the old mode stays
on screen.

**The login cookie is not reissued by a switch.** Minting a fresh month-long
login on each switch would make toggling between two modes an unlimited
session-extension oracle, and the lifetime here is flat with no refresh flow
and no revocation. `create_access_token` takes an explicit `expires_at` so the
override can be capped at the login's.

A mode the account does not hold answers **404**, identically to one that does
not exist, and deliberately **not** flagged `requires_password`: it is not a
password problem, and saying so would invite a prompt that cannot help.

**The control** is `frontend/src/components/layout/ModeSwitcher.jsx`, mounted
in the site chrome. Four rules it does not get to decide, kept here because
each is easy to get wrong from the browser and none is visible from the
component alone:

- **It reads no permission**, and it is the one control in the SPA for which
  that is right. Every signed-in account holds at least one mode, so gating it
  would hide it from the `user` role - the account that most needs to narrow
  itself.
- **It renders only above ONE held mode.** A control with one option is noise.
- **`requires_password` comes from the server**, per mode, on
  `/api/auth/me`. Never recompute the subset test in the browser: two
  implementations of one rule drift, and the browser's is the one nobody
  tested.
- **On success it loads the page again from scratch** - a real browser
  navigation, not a client-side route change. A mode is a ceiling on what the
  session may SEE, so every answer already on screen was computed under the
  old ceiling: narrowing leaves rows visible that the new mode hides, widening
  leaves them missing. Refetching `/api/auth/me` alone fixes neither, because
  the stale rows live in the React Query cache and in component state, not in
  the auth snapshot. There is no success toast, for the same reason: the load
  discards it.

### The pipeline routers gate on the ROLE only

`data_control.py` and `system.py` carry **one** router-level dependency:
`require_manage_pipelines`. The session's access mode is not consulted, so
`admin` and `super` may run any pipeline from whatever mode they are sitting
in.

`manage.pipelines` is **unscoped on the object axis** — no pipeline filters by
label, field group or media type. `execute_backup` reads
`db.query(tab.model).all()`, `runner.py` reads `db.query(spec.model).all()`,
and `calculation.py` states outright that Calculate "is a pipeline with no
viewer"; `entry_visible` and `hidden_label_ids` are called only from the entry
routers. A pipeline therefore reads the whole database whatever the caller's
mode, and writes the same complete sheet either way.

**One route gives something up, and it is `/clean/scan`.** Its report names
every orphan row, including entries a narrow mode conceals, and `/clean/apply`
deletes by `system_id`; `/replace/{type}/{id}` likewise distinguishes a hidden
entry from a missing one. Both are now reachable from a narrowed session. The
caller holds `manage.pipelines` — `admin` or `super` — and a mode is a view
ceiling they chose for themselves rather than a boundary against them. If
either needs closing, close it at the route (filter the report, add an
`entry_visible` check to replace-one), not by gating the router on a mode the
other four pipelines never read.

This does **not** contradict "a mode never changes which kinds of operation an
account may perform". A pipeline's object set is every entry, declared and not
negotiable; the mode still only decides which objects an operation reaches, and
it is the *operation* that refuses to run against a subset, because a partial
Backup is not a smaller version of the job. `viewer.has(manage.pipelines)`
answers the same in `safe` as in `unrestricted`.

The test is **computed** — both full sets — never a comparison against the key
`unrestricted`. Editing that mode must not silently widen who qualifies, and an
admin's own equivalent custom mode must qualify. A label minted today narrows
every mode that does not carry it, which is the fail-closed direction.

It also closes an oracle for free: `POST /api/data-control/replace/{key}/
{entry_id}` answered 404 for a missing entry and 200 `"Successfully updated
<display_name>."` for a hidden one — a write, an existence oracle and a title
leak in one answer. A caller who can reach the route has no hidden entries.

401 rather than 404 here because the route's existence is not a secret and the
caller is being told to widen, which is something they can act on. 404 is the
object axis, where indistinguishability is the property being protected.

### Guards on users (`app/routers/users.py`)

- **Last admin:** changing the role of, or deleting, the last account whose
  role can administer (root role or holds `admin.authz`) → **409** "last
  account that can administer the site".
- **Self-delete:** deleting your own account → **409**.

## Admin UI

| Page | File | What it does |
|---|---|---|
| Roles | `frontend/src/pages/admin/Roles.jsx` | role list, create/delete, checkbox grid per family from `/api/roles/catalog`; root role roles show a notice instead of a grid |
| Users | `frontend/src/pages/admin/Users.jsx` | create users, assign roles, reset passwords, delete |
| Content Labels | `frontend/src/pages/admin/ContentLabels.jsx` | key/label/description; shows the `label.<key>` permission each becomes |
| Label picker | `frontend/src/components/forms/ContentLabelPicker.jsx` | rendered **once** on Add and once on Modify (not in the per-type tabs); on Add the parent holds the selection and `PUT`s after create, mirroring the credits control |
| Field groups | — | **No page exists.** `/roles` grants them; their contents are `FIELD_GROUPS` in code. See [Changing which columns a group hides](#changing-which-columns-a-group-hides--code-only). |

What an admin can change from the browser, and what needs a commit:

| | Browser | Code |
|---|---|---|
| who holds a permission | `/roles` | |
| which content labels exist | `/content-labels` | |
| which entries carry a label | Add / Modify | |
| which columns a field group hides | | `field_groups.py` |
| which field groups exist | | `field_groups.py` |
| which media types / field-group families exist | | `permissions.py`, the registry |

Some blocks the SPA hides itself: the detail pages read
`useAuth().isRoot` to draw the poster-spine id. The component is named in
JSX, not declared anywhere server-side — there is no `ui_block` field and
never was a mapping behind it.
Where the server already blanks the value there is nothing to ask —
`ScoreBlock.jsx` drops its "Last updated" figure on a null timestamp, so the
component stays presentational. Either way this is cosmetic; every gate that
matters is enforced server-side.

## Tests

| File | Covers |
|---|---|
| `tests/unit/test_rbac_permissions.py` | catalog, naming, `split_perm` |
| `tests/unit/test_rbac_viewer.py` | `Viewer.has`, root role, guest |
| `tests/unit/test_field_groups.py` | every declared column/link field exists |
| `tests/api/test_rbac_core.py` | seed idempotence, `/me` never raises, deleted-user / de-admined tokens rejected |
| `tests/api/test_rbac_admin_api.py` | roles/users/labels routes, 409/422 guards |
| `tests/api/test_role_locks.py` | the locked-grant table and both halves that read it: what the role list serves, what the write path refuses, and what the seed reconciles |
| `tests/api/test_admin_compat.py` | characterization test: every route enumerated from the app itself must stay gated by one of the three capabilities, so a route that loses its guard in a refactor fails here |
| `tests/api/test_capability_dependencies.py` | `require_admin_authz` / `require_manage_catalog` / `require_manage_pipelines` each answer 401, never 403 |
| `tests/api/test_catalog_router_gates.py` | a `super` account may edit the catalogue, an ordinary `user` may not - one representative route per router family, pinning that the *right* capability was chosen |
| `tests/api/test_no_bare_admin_permission.py` | the bare `admin` permission is absent from `static_catalog()`, and no module imports a single all-powerful admin dependency |
| `tests/api/test_media_type_gating.py` | whole type disappears, 404 on detail |
| `tests/api/test_field_gating.py` | link and source stripping; the narrowest viewer there is still gets credits, both timestamps and `system_id`; and a probe group stands the columns flavour up so the copy-not-setattr rule stays tested with no real column group left |
| `tests/api/test_cover_images_are_gated.py` | a hidden entry's cover 404s and the same file 200s for an admin, the lying-folder case, and that `/static/covers/` no longer answers. The written file and `nsfw_label` are load-bearing: a missing file 404s too, and an empty label set makes every refusal vacuous |
| `tests/api/test_shared_record_visibility.py` | the shared-record rule: a person, seiyuu, character, studio, publisher or vocabulary value connected only to label-hidden entries is hidden, one visible connection keeps it visible with the hidden one omitted, no connections stays visible, a type gap hides nothing; series under a hidden franchise; entity photos; notes on a hidden series; and scope connections through a gated type registered for the test (`manga` pointed at `nsfw`), independent of h-comic. Every refusal pairs with `admin_client` seeing the same record |
| `tests/api/test_h_comic_entries.py` | h-comic: the label stamped on every router write path and refused removal (422) and deletion (409), guest / `normal` / `borderline` 404 and absent from list and search while `unrestricted` sees it, only `unrestricted` carries the label after a re-seed, `visible_gated_types`, no `h-comic` search bucket for a narrow session, `PUT /api/me/list` running the list hook, H-Comic franchises labelled and segregated from mainstream ones |
| `tests/api/test_hentai_entries.py` | hentai: the same set as h-comic's - label stamped, refused removal and deletion, narrow modes 404 while `unrestricted` sees it, only `unrestricted` carries the label - plus its franchise family |
| `tests/api/test_hentai_shared_records.py` | a studio or director credited only on hentai is hidden, one also on an anime is not; an H Genre value used only by hentai is hidden; `/api/constants` for a session seeing neither gated type and for one seeing h-comic only (`unrestricted` with `hentai` denied, both labels present) |
| `tests/api/test_hentai_label_migration.py` | the hentai revision's own `settle_label`: the label leaves an anime and stays on a hentai, adopted not duplicated, granted to `unrestricted` alone |
| `tests/api/test_franchise_family.py` | franchise families: a `franchise_id` of another family refused on create, `PUT` and `PATCH`, in both directions, a franchise type spanning two families refused, a franchise holding mainstream entries not retyped into the gated family - each with its accepted mirror |
| `tests/api/test_franchise_families.py` | what hentai adds to the families: `"ACG, Hentai"` refused on every write path and `"H-Comic, Hentai"` accepted, a franchise holding a hentai not retyped mainstream, both gated labels on an `H-Comic, Hentai` franchise and neither removable, an h-comic and its hentai resolving to one franchise |
| `tests/unit/test_search_gated_buckets.py` | every gated type's `SearchBuckets` field defaults to absent, so a new gated type cannot put its key back |
| `tests/api/test_h_game_entries.py` | h-game: CRUD and the vocabularies (422 on create, update and the tracker PATCH), the DLC chain, purchase records on h-game and still on game, the `h-game` label stamped on every write path and refused removal (422) and deletion (409), guest / `normal` / `borderline` 404 while `unrestricted` sees it, the h-game franchise family refused both ways, by name and by id |
| `tests/api/test_h_game_shared_records.py` | a studio, a game genre and an H Genre value connected only to h-game are hidden; an unused game genre stays visible; the notes registry, `/api/constants` and the external-API catalogue leave h-game out for a narrow session, with the `unrestricted` mirror |
| `tests/api/test_h_comic_shared_records.py` | people in every h-comic role, a club with no credit, characters and vocabulary values connected only to h-comic are hidden; club membership filters hidden members and reveals nobody |
| `tests/api/test_visibility.py` | label hiding on lists/detail — asserts on `response.text` so an id cannot leak through any field |
| `tests/api/test_visibility_aggregates.py` | quotes, memes, credits, notes, plan, relations, watch orders, person counts |
| `tests/api/test_visibility_graph.py` | `/graph` filtering |
| `tests/api/test_guest_has_no_list.py` | a guest reads no status, rating or progress; the personal-column filter matches nothing rather than cross-joining; `installation_owner_id` still answers |
| `tests/api/test_viewer_user_id.py` | `Viewer.user_id`, and that `acting_user_id` does **not** fall back |
| `tests/api/test_note_scope_reads.py`, `test_note_scope_writes.py` | personal note sections filter by author; catalogue sections do not; who may write which |
| `tests/api/test_profile.py`, `test_community_aggregate.py` | a private list 404s; public figures count public lists only; a community aggregate the viewer may not see 404s in the same words as one that does not exist, and each refusal is paired with its mirror on the same fixture |
| `frontend/src/components/info/ScoreBlock.test.jsx` | the "Last updated" figure is dropped, not blanked to `—` |
| `frontend/src/components/tracker/trackerGuard.test.jsx` | the "My tracker" card is withheld from a logged-out visitor |

## Why it is built this way

- **RBAC over tiers.** A fixed ladder (guest < member < admin) cannot express
  "sees anime but not personal reviews" without a new tier per combination;
  named permissions and free-form roles can.
- **401, not 403.** The SPA already redirects on one error shape; and a 403
  would confirm the resource exists. Hidden data is 404.
- **Content labels, not `media_tag`.** Tags are descriptive vocabulary that
  pipelines write; access control must not be something a Fill run can change.
- **Permissions in code, grants in DB.** Code branches on the exact string, so
  the string cannot be renamed out from under it (same rule as Tier 1 options).
- **Per-request resolution, not JWT claims.** Revocation is immediate; the
  cache pays for it.

## Rules not to break

### Four ways of asking, and a fifth would be a smell

Every new surface should say which of these it uses rather than invent
another:

| Gate | Question | Answer when it fails |
|---|---|---|
| `require_admin_authz` / `require_manage_catalog` / `require_manage_pipelines` | do you hold this one capability? | 401 |
| `require_permission(name)` | do you hold this one grant? | 401 |
| `get_current_user_id` | is there an **account** at all? | 401 |
| `viewer_user_id(viewer)` / `acting_user_id(db, viewer)` | who are you, if anyone? | `None`, never an error |

The third is the one people forget exists. It asks for a person rather than a
permission, and `/api/plan-next` and `/api/seasonal` take it *alongside* their
`self.list` gate, because they need the id to scope a row and not merely proof
of a session.

### Two families, and one member that does not fit

- **`field_group.<key>`** answers *may you see this* over the columns, link
  fields and source buckets of a media type. `field_gate` applies it to a
  response.
- **`self.<key>`** answers *may you write your own*, and each key names a
  router dependency.

`field_group.personal_notes` is in neither shape. Personal note sections are
filtered by `author_id` on the entry page, so the group gates a **query
parameter** (`GET /api/notes?author=`) and nothing on any response, while
still being labelled "Personal Reviews". It is the one member of the
vocabulary whose name and behaviour have drifted apart.

### The rules

- **Permissions live in code, grants in the database.** A permission naming no
  code is an inert grant and is rejected: check `catalog(db)` before minting a
  name, and look for an existing one that already means it.
- **Fail closed.** `resolve_viewer` never raises; anything unresolvable is the
  guest role holding nothing.
- **`cache.bump()` on every grant write.** Permissions resolve per request so
  revocation is immediate; the cache is process-local.
- **The SPA mirrors no vocabulary.** `/api/roles/catalog` is served, which is
  why the role editor renders the whole `self.*` family with no frontend
  change. Keep that property.
- **One error shape.** **401 means you may not do this kind of thing** — a
  capability failure, which is what `require_permission` answers and the one
  shape the SPA redirects on. **404 means this object is not yours to see** —
  the object axis, answered in the same words a genuinely absent row gets.
  **There is no 403 anywhere in the app**, and adding one "for clarity" is the
  failure this rule exists to prevent: a 403 confirms the row exists exactly
  as surely as a 200 does. `app/routers/note.py` carries the comment saying so
  at the site that most invites one.
- **Test with two accounts.** Two defects once survived the entire suite
  because only one user ever existed: `POST /{type}/{id}/complete` wrote to
  another account's list rather than the caller's, and a guest filtering on a
  personal column cross-joined `user_media_list` and matched every account's
  rows. Any per-user surface needs a two-account test.
- **"Nobody is asking" is not "asked, and has nothing."** `attach_list_fields`
  returns early for a `user_id` of `None` rather than filling in the type's
  default status, because a default status is a claim about a person.
- **A class-level read path cannot know the viewer.** A `column_property` is a
  scalar subquery: it cannot take a viewer, so anything per-user needs a read
  path that does — `attach_remark` is the worked example. The constraint
  protecting such a read path has to move in the same commit, because
  relaxing it alone turns a loud database refusal into a silent loss.
- **Per-user data has to cross machines.** A new per-user table needs a
  `username` column on its sheet tab, and Pull's header filter drops any
  parsed key the sheet's header row did not carry.
- **Migrations must not import ORM models**, which is enforced rather than
  advised: `tests/unit/test_migration_imports.py` fails any revision under
  `alembic/versions/` that imports from `app`. A revision has to be
  self-contained, because a query through a live model selects every column
  that model declares *today* and breaks the moment a later migration adds one.

## What is not built

- **`field_group.personal_notes` reads "Personal Reviews".** The label is
  accurate — it gates the `personal_reviews` section — but the group is a mode
  item, not a role grant, and no admin page says so.
- **Seasonal counts include hidden entries.** In [Accepted
  residuals](#accepted-residuals) with its blast radius.
- **Sessions are flat 30 days** with no refresh or revocation, and there is
  no password reset — an admin sets one at `/users`. See
  [authentication.md](authentication.md).
