# A game's platform group is on its plan row

The Plan page's Game tab groups queued games by where they will be played -
PC, Console, Handheld Console, Switch, or none - and the group is stored on
the `plan_next` row (`platform_group`), not on the game.

**Why the plan row.** Every other Plan bucket is a fact about the entry or
its group - a franchise's size, a manga's serialization status, a book's
type - so it is derived, never chosen. Which machine a game will be picked up
on is not a fact about the game: it is one member's plan, the same kind of
thing as the row's `remark`, and two members queuing the same game can file it
differently. Putting it on the row also means un-planning the game clears it
with the row, so a stale group never outlives the plan.

**Rejected:**

- **Derived from the `game_platform` tags.** A game on PC and Switch has two;
  the queue needs the one the member means to play it on, and `Handheld
  Console` is not a platform the tags name.
- **A column on `games`.** It would be shared by every member and survive
  un-planning, so it would read as a catalogue fact it is not.
- **A free-text group, like a Resources group.** Four fixed values were
  asked for, and a closed list keeps the tab's headings in a fixed order.
  Validated in the API layer rather than as a DB enum, as `media_type` and
  `kind` are, so adding a group needs no migration.

**Only a game's or an h-game's `next` row takes one.** A replay mark is not
a queue in platform order, and no other type is played on a platform. An
h-game is played on one exactly as a game is, and a gated type mirrors its
counterpart, so its Do next tab groups the same way.

**Set from the detail page as well as the Plan page.** The group is chosen
when the game is queued, and the game is queued on its detail page, so the
detail page offers the same picker the Plan card carries. The Plan card keeps
its own: re-filing a queue is done on the Plan page, where the whole queue is
in view.
