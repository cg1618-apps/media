# Open items

Last verified: 2026-11-14

Known defects, unmade decisions and blocked work. **Everything here is open by
definition** — there is no status column, no claiming, and no lifecycle. An item
is fixed by deleting it in the same change that fixes it, and the commit and
pull request are the record of that.

Nothing here blocks using the application.

This is not a work log and not a plan. Whose turn something is, and what a
session is currently doing, live in the branch and the pull request. Machine
state — which database is at which revision, where the dumps are — is
[switching-environments.md](switching-environments.md).

## Per-viewer page detail — first, once the rework is built

**Each page's detailed customisation per viewer is undecided, and it is the
first thing to take up** once everything in [to-do-next.md](to-do-next.md)
has been built — the notes rework and the account and authorization rework
— and the remaining page-level discussions have been had.

What is settled now is each page's **general** version per viewer, in
[viewers.md](viewers.md), "Customised pages": for a library, for instance,
super and user get essentially the same page, and guests and shared
accounts get its catalogue parts only. What is not is the detail beyond
that — which columns, defaults, layout and wording each viewer gets — and
the designs for it, which come from the owner. The same holds for every
customised page: its general version is settled in that discussion, and its
detail waits for this.

## Deployment

**Rollback cannot revert code to a previous release yet.** The platform
`bin/rollback`'s third tier checks out the git revision recorded beside a dump.
The repository was
seeded with a single commit, so for the first few releases there is no earlier
revision to check out and only the database half of a rollback is available.
This closes itself as releases accumulate; it needs no fix, only awareness.

**A migration already sitting in the box's checkout is invisible to the
approval gate.** The platform's `classify` job decides the lane by asking
`deploy/migrations added <before> <after>`, and `bin/deploy --ci` re-checks by
asking `deploy/migrations added HEAD origin/main`.
Both ask whether a revision is *arriving*. Neither notices one that `main`
already contains and the box has already pulled but never applied — there the
diff is empty, so the deploy takes the unattended lane and `alembic upgrade
head` runs the migration with nobody asked.

Reaching that state needs a rollback to have stopped before its `git checkout`,
which is the freeze tier. A completed rollback moves `HEAD` back behind the
revision, and then the box-side re-check does fire. Observed once, on the box,
after a rollback froze at tier 3.

Closing it means asking a different question — comparing the revisions the
database has applied against the revisions the incoming code declares, rather
than comparing two git refs. That is a better check than either of the two
above and would replace both. Not done, because the shape that produces it is
rare and already loud.

**`deploy/migrations downgrade` has never run end to end in a real rollback.**
Its parts are each proven — the gate holds, an added revision is
detected, the `.migration` sidecar resolves the right target, the refusal on
`irreversible = True` is exercised against a scratch chain in
`tests/unit/test_deploy_scripts.py`, and the
`--entrypoint alembic` form works when run by hand — but no single rollback has
executed all of them in sequence. Two rehearsals skipped the downgrade because
the deploy added no revision relative to the box's checkout, and a third had
the command silently discarded before the fix.

## Blocked on hardware

| Item | Why it is stuck |
|---|---|
| A DHCP reservation for the box | Its cable is bridged past the home router, so its address comes from the router above it, which needs that router's admin — or the cable moved onto the home router's own network. Until then the address is whatever DHCP hands out, and `ssh homelab-lan` — the LAN fallback, not the default tunnel route — failing is how you learn it moved |
| An idle power reading for the box | No meter |

## The two machines and the backup sheet

The sheet holds exactly one version of the data, and it is in the current
shape: its `Note` tab carries `parent_id` and `fields`, and a Pull All from it
restores every tab on the company machine. Arrival procedure is
[switching-environments.md](switching-environments.md).

**The company machine's owner flag is applied; whether every row followed is
unverified.** That database is now at head, it has the
`users.is_installation_owner` column, and `cg1618` holds the flag while `admin`
does not — so the earlier claim that it had "neither the migration nor the
move" is no longer true of it. What is not established is the *move*:
before the mode-ceiling migration both `admin` and `cg1618` held all four
modes, and nothing here says whether that was the correct end state or
residue. That migration now sets `cg1618` to `unrestricted` / `borderline`
explicitly, and revision `a1d2minroot45` gives `admin` no mode at all.
Compare against home before concluding either.

The ordering still matters for any future arrival: `git pull`, then
`alembic upgrade head`, then Pull All. The migration picks the first non-root
account and the sheet carries the flag, so the two agree either way — but run
out of order, a restore files under whichever account that database's fallback
names.

**Both machines now hold the full Backup guard.** It refuses to overwrite a
populated sheet with an empty database, and it landed in two commits: the first
is not enough on its own, because it probed `worksheet.get("A2:A2")` for
truthiness and gspread answers an empty cell with `[[]]`, so it refused every
Backup on an installation with a legitimately empty tab. The second commit makes
it usable. The company machine had neither while it was on the pre-migration
tree; its migration on 2026-09-24 was a fresh clone at `dev`, so it has both —
`sheets.py` asks `any(any(cell for cell in row) for row in ...)`, which is the
second form. Kept here because it is the other half of the item below.

**Who emptied the backup sheet is unknown**, and only the owner can close it.
Eliminated with evidence rather than recollection: the test suite (every test
re-run with the Sheets accessor patched to throw, now enforced permanently by an
autouse guard), the other sessions of that day, every database on the home
machine, and the stale codex worktree. What remains is a Backup run on the
company machine against a freshly-migrated-but-empty database — which would
blank every tab and be invisible from home — or a manual clear in the browser.
That machine can no longer produce the first of those: it holds the working
guard, and its database is populated rather than fresh.

## Authorization and accounts

The account and authorization rework is decided work, queued in
[to-do-next.md](to-do-next.md); what is still undecided about it is in its
design.

**Libraries cannot filter by content label.** The franchise library already
receives each franchise's labels and only draws them as chips; the collection
and series responses carry their own labels too. A label
filter is wanted — "only `ecchi`", "without `nsfw`" — and is not designed.
The shape proposed so far: include and exclude; offer only the labels the
viewer's mode can see; match inherited labels (a group's label counts for
everything under it), so the filter agrees with what the mode hides; no filter
in `safe`, where every labelled entry is hidden. Undecided: every library,
or the group libraries only.

**The `guest` role may lack `media_type.game`**, which shows a logged-out
visitor an empty Games library. `role_permission` rows seeded before games
existed miss it, and a role is topped up only when it holds nothing; the
company development database has the grant, so it is a per-database fact.
Guests are to see games: on `/roles`, check the `guest` role on each
database and grant `media_type.game` where it is missing.

**A watch order owned by a hidden group still lists.** `routers/watch_order.py`
filters the entries inside an order but never asks whether its owning
collection, franchise or series is visible, so a viewer whose mode hides that
group still sees the order and the group's display name. `media_relation`'s
`/graph` and scope listing behave the same way. Fix by gating each on
`tier_visible` and answering a hidden owner as missing.

**System Options shows the admin zero people and studios.** The page's Tier 3
counts — people by role, and studios — read `/api/person/role-counts` and
`/api/studio/`, which are `view.person` and `view.studio` reads. The admin
reaches `/options` through `manage.options` but holds neither key, so both
requests are refused and the page draws zeros, with no error. Unmade
decision: give the counts an endpoint of their own behind `manage.options`,
or accept the gap until the admin's own pages are designed with the
per-viewer pages ([to-do-next.md](to-do-next.md)).

**Two community-adjacent measurements are unanswered.** Does any endpoint return
an entry's `system_id` for a type the viewer lacks? And the same for a
label-hidden entry — that one is demonstrable: the home database carries three
labels (`nsfw`, `erotica`, `hentai`) across 27 labelled entries, so the case can
be tested against real rows rather than argued.

`collection_content_label` and `series_content_label` are created empty by
their migration, so the collection and series cascade has not run against
real data until something is labelled.

**Count these before citing them.** This item asserted **0 rows** and 2 labels
for a long time and was wrong on both, because each reader inherited the number
instead of asking. One query settles it, and nothing here should state a row
count that has not just been read:

```bash
docker exec cg1618-dev-db psql -U postgres -d media -tAc   "SELECT cl.key, count(mcl.system_id) FROM content_label cl
   LEFT JOIN media_content_label mcl ON mcl.label_id = cl.system_id
   GROUP BY cl.key ORDER BY cl.key"
```

## Backend

| Item | Where |
|---|---|
| Shutdown dies when stdout is not UTF-8 — one `print()` of an emoji, with nothing catching it. The startup half of this is closed: the seeding handler logs with `%s` through `logging`, which never lets an emit failure propagate | `app/main.py`, the `print` after `yield` in `lifespan` |
| `delete_studio` never calls `delete_cover_image`, so a studio logo leaks; publisher does it correctly | `app/routers/studio.py` |
| `_STRIPPED` holds a stray backslash. `"\/"` is not an escape in Python, so the backslash survives and `clean_string` strips a character the JS `cleanString` it is kept "character-for-character in step with" does not. Warns today, and is a `SyntaxError` in a future Python | `app/services/domain/search.py:39` |
| A Pull after a character merge done on the other machine rolls back the `Character Identity` and `Character Casting` tabs: the deferred `fk_casting_identity` fails at commit while the local cast rows still name the old character. Repeat the merge locally before running Pull | `docs/data-actions.md`, Pull All; `app/routers/character.py` merge |
| A Pull fails with `duplicate key value violates unique constraint "uq_character_casting"` when the sheet's casting for an entry was rebuilt under new row ids while this database still holds the old rows: Pull writes the sheet's rows before removing local ones, so the same character-in-entry exists twice for a moment. Seen pulling production onto the company machine, on a novel whose casting production had re-saved. Until Pull removes the local rows of a re-cast entry first, delete that entry's local casting rows (or rebuild the database from the sheet) before pulling | `app/services/pipelines/pull.py`, the Character Casting tab |
| A person, character or other public entity created on **both** machines fails Pull at commit with `duplicate key value violates unique constraint "uq_<table>_public_id"`. Each machine mints the row under its own uuid and `public_id`; Pull matches it to the local copy only by uuid or, for a person, by all four names exactly, so a copy whose names differ (one filled in from MAL, one not) restores as a second row carrying the sheet's `public_id`, which a row that exists only here may already hold. Nothing renumbers a local-only row. Until it does, delete or merge the local duplicate before pulling. A copy that does not collide still arrives as a duplicate, which the credit pass then reports as ambiguous | `app/services/pipelines/pull.py`, `_match_by_natural_key`, `resync_public_id_sequence` |
| A Sheets Pull drops link columns that Backup writes, when the tab's parser does not name them: Pull keeps only the keys a parser emits. Game's `studio`, `publisher`, `director`, `composer`, `game_genre`, `game_theme`, `game_mode`, `combat_mode` and `game_platform`, anime's and anime-movie's `exclusive_source`, and manga's and novel's `serialization_platform` are written to the sheet and never read back. The fix is to add each key to its parser and widen `test_every_parser_reads_back_the_genre_and_label_columns_its_tab_writes` to every link header | `app/utils/formatter.py`, the `parse_*_from_sheet` functions; `app/services/pipelines/pull.py`, the header filter |
| Entry tabs may still mint entities. `credits.resolve_*` is find-or-create for the Add form too, and whether entry tabs should refuse instead is a policy call | `app/services/domain/credits.py` |

## Tooling

**`ruff format` has never been enforced, and the backend has drifted from it.**
`ruff.toml` opens with `Run: ruff check . && ruff format --check .`, but
`.github/workflows/ci.yml` runs only the first. Running the second today
rewrites **145 files** — about 1500 insertions and 2200 deletions, none of it
behaviour.

Fixing it is one mechanical commit, `ruff format .` plus the `--check` step in
CI, and it needs both halves: without the CI step it silently drifts again, and
the missing step is the actual defect. What makes it awkward is not the work
but the timing — a whole-repo reformat conflicts with every open branch on
every machine. That is one tree fewer than it was: the company machine's
unmigrated `anime_site` tree was deleted on 2026-09-24. So it lands when
nothing else is in flight, and not before.

**Some vitest tests fail under local load.** Three tests have each failed once
in a full `npm run test:run` on a development machine that was also running
other sessions' builds and tests. Each passes alone, and none has failed on CI:

- `src/pages/admin/Add.anime.test.jsx`, "attaches the pending image once the
  entry is saved";
- `src/pages/notes/sections/MusicTrackSection.test.jsx`, "sends every field of
  a song, links as pairs";
- `src/pages/detail/Anime.test.jsx`, "renders the cast with links to the
  character and the seiyuu".

Each fails with `Unable to find ...` from a `findBy*` query. Those wait only
testing-library's default `asyncUtilTimeout` of 1 second, and a heavy page
rendered by a saturated machine can take longer. This is a class of test, not
one test's bug, so the remedy is a decision rather than a patch. The options
are:

- raise the timeout on the slow queries one at a time;
- set `configure({ asyncUtilTimeout })` once in `src/test-setup.js`, which
  also lets a genuinely missing element take longer to report;
- run fewer vitest workers (`poolOptions` / `maxWorkers` in
  `vitest.config.js`), which makes the whole suite slower but takes load off
  each test.

It is left until a run on CI goes red on one of them.

## Frontend

**The controls for each account's own data are plain placeholders, waiting
for the owner's designs.** They are built from existing controls and the
design system so the behaviour can be used, and their look is undecided:

- the per-unit rating and remark on the novel page;
- reordering highlight groups, which is the existing drag;
- editing a personal value on a catalogue note row (collected, beaten,
  completion, my value, the music and mod statuses) and the NG reset button;
- how a personal row sits among the catalogue rows of a mixed section,
  including its **Mine** chip;
- the favourite star on quotes and memes.

| Item | Where |
|---|---|
| Games and comics are absent from the cover lists | `FranchiseLibrary`, `CollectionLibrary`, `CollectionPage`, `usePlanData` |
| No Games tab | `FutureReleases.jsx` |
| `/defaults` shows an inert auto-fill column for Game | `frontend/src/config/formFields/fieldMeta.js` |
| Invented entities never reach the admin log table — `error_message` renders only on Failed rows, never `details_json` | `Admin.jsx` |
| The colour-token table holds pre-archive hexes | `docs/frontend/components.md` |
| Two docs still describe a `ScoreBlock` "Last updated" figure that the component no longer has, one of them as the worked example of withheld fields being absent rather than blanked — so replacing it needs a different example, not a deletion | `docs/authorization.md:423`, `:1163`, `:1191` |
