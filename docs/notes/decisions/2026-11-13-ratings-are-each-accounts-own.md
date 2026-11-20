# Ratings, expectations and the unit remark are each account's own

The rating of a collection, franchise, series, character, person, studio or
publisher, the expectation of the three tiers, and a book unit's remark are
per-account rows, not columns on the shared rows: they are one person's
opinion.

- **One `user_rating` table, not seven.** The ratings and expectations are one
  concept, read one way (`attach_ratings`, one query per page) and written one
  way (`PUT /api/me/ratings/{owner_type}/{owner_id}`). The owner is one FK
  column per owning table with a `num_nonnulls(...) = 1` CHECK — the shape
  `note` uses — rather than an `(owner_type, owner_id)` pair, because a real
  foreign key cascades: deleting the franchise or the account takes the rating
  with it. The responses keep their old field names, so the frontend's sorts,
  filters and statistics did not change.
- **The unit remark sits beside the unit rating**, on the per-reader unit table:
  the same kind of thing one level down.
- **Migrations that move personal values freeze their owner query.** A revision
  names the installation-owner rule as a literal rather than importing
  `installation_owner_id`, because a migration must keep meaning what it meant
  when it ran, and never picks `guest`, `shared` or `admin` — handing the
  owner's ratings to a login anyone may use is the failure it prevents.
- **Old-sheet headers are handled in `legacy_personal.py`, not `pull.py`.**
  `tests/services/test_pipelines_write_no_personal_columns.py` forbids every
  pipeline module from naming a personal column. Allowing `my_rating` in the
  guard would exempt it in every pipeline file; a domain module that owns the
  header names keeps the guard whole.
- **Writes sit under `self.list`**, and the catalogue schemas carry no rating,
  so a catalogue write cannot make one account's opinion everybody's.
- **A merge moves ratings to the survivor** where that account has none there,
  and drops the loser's otherwise.
