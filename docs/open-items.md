# Open items

Last verified: 2026-09-18

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

**Rollback cannot revert code to a previous release yet.** `rollback.sh`'s third
tier checks out the git revision recorded beside a dump. The repository was
seeded with a single commit, so for the first few releases there is no earlier
revision to check out and only the database half of a rollback is available.
This closes itself as releases accumulate; it needs no fix, only awareness.

**A migration already sitting in the box's checkout is invisible to the
approval gate.** `classify` decides the lane from the push range, and
`deploy.sh --ci` re-checks `git diff HEAD origin/main -- alembic/versions/`.
Both ask whether a revision is *arriving*. Neither notices one that `main`
already contains and the box has already pulled but never applied — there the
diff is empty, so the deploy takes the unattended lane and `alembic upgrade
head` runs the migration with nobody asked.

Reaching that state needs a rollback to have stopped before its `git checkout`,
which is the freeze tier. A completed rollback moves `HEAD` back behind the
revision, and then the box-side re-check does fire. Observed once, on the box,
after `rollback.sh` froze at tier 3.

Closing it means asking a different question — comparing the revisions the
database has applied against the revisions the incoming code declares, rather
than comparing two git refs. That is a better check than either of the two
above and would replace both. Not done, because the shape that produces it is
rare and already loud.

**`rollback.sh`'s `alembic downgrade` has never run end to end in a real
rollback.** Its parts are each proven — the gate holds, an added revision is
detected, the `.alembic` sidecar resolves the right target, and the
`--entrypoint alembic` form works when run by hand — but no single rollback has
executed all of them in sequence. Two rehearsals skipped the downgrade because
the deploy added no revision relative to the box's checkout, and a third had
the command silently discarded before the fix.

## Blocked on hardware

| Item | Why it is stuck |
|---|---|
| A DHCP reservation for the box | A phone hotspot offers none. The address is whatever DHCP hands out, and `ssh` failing is how you learn it moved |
| The cable handover | No Ethernet yet. When it arrives, the reservation moves to the Ethernet MAC, the `wifis:` block leaves the netplan file, and the `iwlwifi` power-save override goes with it |
| An idle power reading for the box | No meter |

## The two machines and the backup sheet

The sheet holds exactly one version of the data, so these are about the company
machine being behind. Arrival procedure is
[switching-environments.md](switching-environments.md).

**The company machine still files rows under `admin`.** The home database moved
every row to `cg1618` under `o1a1ownerflag`; the company database has neither
the migration nor the move. Arriving there, the order matters: `git pull`, then
`alembic upgrade head`, then Pull All. The migration picks the first non-root
account and the sheet carries the flag, so the two agree either way — but run
out of order, a restore files under whichever account that database's fallback
names.

**The company machine can still erase the sheet.** The Backup guard that refuses
to overwrite a populated sheet with an empty database landed in two commits, and
the first is not enough on its own: it probed `worksheet.get("A2:A2")` for
truthiness, and gspread answers an empty cell with `[[]]`, so it refused every
Backup on an installation with a legitimately empty tab. The second commit makes
it usable. That machine has neither. **`git pull` there before running Backup**,
not after.

**Who emptied the backup sheet is unknown**, and only the owner can close it.
Eliminated with evidence rather than recollection: the test suite (every test
re-run with the Sheets accessor patched to throw, now enforced permanently by an
autouse guard), the other sessions of that day, every database on the home
machine, and the stale codex worktree. What remains is a Backup run on the
company machine against a freshly-migrated-but-empty database — which would
blank every tab and be invisible from home — or a manual clear in the browser.

**`Note`, `Meme` and `Quote` carry `author_id` as a raw uuid, so authorship does
not round-trip.** Each installation mints its own `admin`, and the `Users` tab's
username match keeps the local id, so the other machine's admin rows restore
under this one's. The durable fix is a `username` column on the three tabs, the
way `Plan Next` has one. Invisible with one account; needed before a second
person writes a note. `app/services/pipelines/tabs.py:259/268/269`.

## Authorization and accounts

Two auth items are open **by choice**, and neither blocks inviting somebody:
**session lifetime** is a flat 24 hours with no refresh and no revocation, and
there is **no password reset** — an admin sets one at `/users`.

**The `guest` role has no `media_type.game`**, so a logged-out visitor sees an
empty Games library. The `role_permission` rows were seeded before games
existed; the other eight types are granted. This is a permissions decision
rather than a bug to fix blind — grant it on `/roles` if guests should see
games.

**Two community-adjacent measurements are unanswered.** Does any endpoint return
an entry's `system_id` for a type the viewer lacks? And the same for a
label-hidden entry — `media_content_label` has **0 rows** in the real database,
with 2 labels defined and nothing labelled, so that case can be argued but not
demonstrated there.

## Backend

| Item | Where |
|---|---|
| Startup dies when stdout is not UTF-8 — emoji prints, and the error handler itself throws, hiding the real cause | `app/main.py` 108/118/123/129 |
| `delete_studio` never calls `delete_cover_image`, so a studio logo leaks; publisher does it correctly | `app/routers/studio.py` |
| Entry tabs may still mint entities. `credits.resolve_*` is find-or-create for the Add form too, and whether entry tabs should refuse instead is a policy call | `app/services/domain/credits.py` |

## Frontend

| Item | Where |
|---|---|
| The anime-movie Director picker reads the `anime` scope, so an anime movie's own directors never appear | `AnimeMovieAddTab.jsx:302` and `AnimeMovieModifyTab.jsx:233` pass `scope: "anime"` while `fieldMeta.js:374` declares `anime-movie` |
| Games and comics are absent from the cover lists | `FranchiseLibrary`, `CollectionLibrary`, `CollectionPage`, `usePlanData` |
| No Games tab | `FutureReleases.jsx` |
| `/defaults` shows an inert auto-fill column for Game | `frontend/src/config/formFields/fieldMeta.js` |
| Invented entities never reach the admin log table — `error_message` renders only on Failed rows, never `details_json` | `Admin.jsx` |
| The colour-token table holds pre-archive hexes | `docs/frontend/components.md` |
