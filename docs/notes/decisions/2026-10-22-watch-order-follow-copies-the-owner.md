# Following a watch order: the owner is copied, so the owner cannot move

A member follows at most one watch order per group. The rule lives in the
database: `watch_order_follow` copies the order's owner onto the row and
`uq_watch_order_follow_group` is UNIQUE NULLS NOT DISTINCT over the user and the
three owner columns, the shape `plan_next` uses. A copy is only sound if the
original cannot change, so a list's owner is fixed at creation; `PUT` and
`PATCH` answer 400 when a body names a different owner.

- **Rejected: no copy, one-per-group checked in the router.** An editor moving
  an order into another group would leave a member following two orders of
  that group with nothing to say so.
- **Rejected: a movable owner, re-syncing follows on every move.** Three write
  paths would each need to repoint follows and resolve a collision that has no
  good answer. Making the owner immutable removes the case.
- **Rejected: a composite foreign key with ON UPDATE CASCADE.** Under MATCH
  SIMPLE a key with any NULL column is not checked, and two of the three owner
  columns are NULL on every row.
- The remaining hole is a hand-edited sheet; an ordinary Backup / Pull cannot
  move an owner, because each list's uuid is minted once with it.

Smaller choices:

- **Progress counts the steps the page draws**, from the same resolver as the
  detail endpoint, so the guide and "step N / total" never disagree.
- **A ranged step is active only once reached.** Otherwise both halves of a
  split run are "now" at once; a step whose start lies beyond the next unit is
  pending, so "Up next" can name the other half.
- **A split run shows every occurrence**, since each half sits between
  different neighbours.
