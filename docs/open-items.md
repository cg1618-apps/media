# Open items

Last verified: 2026-09-26

Known defects, unmade decisions and blocked work. **Everything here is open by
definition** — there is no status column, no claiming, and no lifecycle. An item
is fixed by deleting it in the same change that fixes it, and the commit and
pull request are the record of that.

Nothing here blocks using the application.

This is not a work log and not a plan. Whose turn something is, and what a
session is currently doing, live in the branch and the pull request. Machine
state — which database is at which revision, where the dumps are — is
[switching-environments.md](switching-environments.md).

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
| A DHCP reservation for the box | Its cable is bridged past the home router, so its address comes from the router above it, which needs that router's admin — or the cable moved onto the home router's own network. Until then the address is whatever DHCP hands out, and `ssh` failing is how you learn it moved |
| An idle power reading for the box | No meter |

## The two machines and the backup sheet

The sheet holds exactly one version of the data. The company machine migrated
on 2026-09-24 and its database is at head, so what is left here is about the
**sheet** rather than about that machine being behind. Arrival procedure is
[switching-environments.md](switching-environments.md).

**The backup sheet predates the notes rework, so a Pull from it would undo
part of it.** `note` gained `parent_id` and `fields`, and eleven sections moved
onto the `structured` shape, so the tab is two columns short and its note rows
are in the old shape. Pull matches columns by header name and writes what it
finds: it would restore `entries` values on sections that are `structured` now
— refused by validation the next time anybody edits one — and `side_quests`
rows under a section key the registry no longer has, which nothing renders.

Neither failure is loud. The rows restore, the page loads, and it shows up one
edit later.

Closed by running **Backup** from the machine holding the newer data, which
rewrites every tab in the current shape. Until then, neither machine may Pull:
the company machine's arrival on 2026-09-24 deliberately stopped one step short
of it, so that database is its own 2,081 rows rather than the sheet's.

**The company machine's owner flag is applied; whether every row followed is
unverified.** That database is now at head, it has the
`users.is_installation_owner` column, and `cg1618` holds the flag while `admin`
does not — so the earlier claim that it had "neither the migration nor the
move" is no longer true of it. What is not established is the *move*: its
`user_access_mode` rows still split 4 and 4 between `admin` and `cg1618`, and
nothing here says whether that is the correct end state (both accounts
legitimately holding four modes) or residue. Compare against home before
concluding either.

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

**`Note`, `Meme` and `Quote` carry `author_id` as a raw uuid, so authorship does
not round-trip.** Each installation mints its own `admin`, and the `Users` tab's
username match keeps the local id, so the other machine's admin rows restore
under this one's. The durable fix is a `username` column on the three tabs, the
way `Plan Next` has one. Invisible with one account; needed before a second
person writes a note. `app/services/pipelines/tabs.py:259/268/269`.

## Authorization and accounts

Two auth items are open **by choice**, and neither blocks inviting somebody:
**session lifetime** is a flat 30 days with no refresh and no revocation, and
there is **no password reset** — an admin sets one at `/users`.

**The `guest` role has no `media_type.game`**, so a logged-out visitor sees an
empty Games library. The `role_permission` rows were seeded before games
existed; the other eight types are granted. This is a permissions decision
rather than a bug to fix blind — grant it on `/roles` if guests should see
games.

**Two community-adjacent measurements are unanswered.** Does any endpoint return
an entry's `system_id` for a type the viewer lacks? And the same for a
label-hidden entry — that one is demonstrable: the home database carries three
labels (`nsfw`, `erotica`, `hentai`) across 27 labelled entries, so the case can
be tested against real rows rather than argued.

`franchise_content_label` is the empty one — no franchise carries a label yet,
so the franchise cascade has shipped without ever running against real data.

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

## Frontend

| Item | Where |
|---|---|
| The anime-movie Director picker reads the `anime` scope, so an anime movie's own directors never appear | `AnimeMovieAddTab.jsx:302` and `AnimeMovieModifyTab.jsx:233` pass `scope: "anime"` while `fieldMeta.js:374` declares `anime-movie` |
| Games and comics are absent from the cover lists | `FranchiseLibrary`, `CollectionLibrary`, `CollectionPage`, `usePlanData` |
| No Games tab | `FutureReleases.jsx` |
| `/defaults` shows an inert auto-fill column for Game | `frontend/src/config/formFields/fieldMeta.js` |
| Invented entities never reach the admin log table — `error_message` renders only on Failed rows, never `details_json` | `Admin.jsx` |
| The colour-token table holds pre-archive hexes | `docs/frontend/components.md` |
| Six detail pages each define their own near-identical `CastSection`; it should be one shared component | `pages/detail/{Anime,AnimeMovie,Manga,Novel,HComic,Hentai}.jsx` |
| Two docs still describe a `ScoreBlock` "Last updated" figure that the component no longer has, one of them as the worked example of withheld fields being absent rather than blanked — so replacing it needs a different example, not a deletion | `docs/authorization.md:423`, `:1163`, `:1191` |
