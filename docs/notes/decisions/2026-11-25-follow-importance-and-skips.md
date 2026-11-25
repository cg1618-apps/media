# A follow's importance, its skips, and one rule for what is next

A follow carries an importance and a set of skipped steps, and what a follower
is shown as next - on the dashboard and on an entry page - is computed by one
function, `next_steps` in `app/services/domain/order_follow.py`. The
behaviour is described in `docs/systems/orders.md`, "What is next"; this file
keeps why it is shaped this way.

## Skips are a table, not a list on the follow

`order_follow_skip` holds one row per skipped step, hanging off the follow.
A JSONB list of step ids on `order_follow` was the alternative, and it would
have travelled through Google Sheets with the follow row for free. It was
rejected because nothing would hold it true: a deleted step or entry would
leave an id behind that names nothing, uniqueness would be the router's
promise rather than the database's, and every other per-user mark in this
schema (`note_mark`, `user_favorite`, `plan_next`) is a row with foreign keys.
The table gets all of that from its constraints - the cascades,
`ck_order_follow_skip_one_step` and `uq_order_follow_skip_step` - at the cost
of one more Sheets tab.

The skip names its step in one of two columns because an order's steps are of
two kinds. A hand-built order's step is an `order_item` row, and a split run
names one entry in several steps, so the item is the only thing that tells
those steps apart. A built-in order's steps are generated on read and have no
row to point at; such an order names each entry once, so the entry is the
step. One nullable `step_id` with no foreign key would have covered both and
lost every cascade, so it was rejected for the same reason the JSONB list was.

## Skips do not survive an unfollow or a switch of order

A skip belongs to the follow, and goes with it: unfollowing deletes it, and so
does following another order of the same group, which repoints the group's
follow row. Keeping skips across an unfollow would have needed them keyed by
user and step rather than by follow, outliving the thing they qualify, and an
unfollow is the follower saying they are done with that order. Across a switch
of order the old skips name steps of the other order, so they would mean
nothing. Re-following starts clean.

## Next is a pending step, not merely an unfinished one

A step is a candidate for next only when it is **pending**: not done, and not
already active. An active step is "now" - the dashboard lists it as such - and
counting it as next as well would show the same step twice there and, on an
entry page, tell the follower to start what they have already started. Done
keeps its existing meaning: a completed or dropped status, or a range whose
end the viewer has reached.

## The lookahead climbs, and stops at Essential

Past the direct next, the panel shows at most two more steps, each on a higher
rung than the one before it: from a Normal or Optional next, the first
Recommended-or-Essential step, and from a Recommended one, the first Essential.
So an Essential that comes before the next Recommended is shown alone - the
Recommended after it is less important than what the follower already sees.
Showing a fixed number of following steps was rejected: it would fill the
panel with Normal steps and hide the one that matters, which is the reason the
lookahead exists.

## One function decides it

The dashboard's `up_next` and the panel's `next` / `coming_up` are both
`next_steps`, the dashboard reading from before the first step and the panel
from the entry's own step. Computing the panel's rows in the frontend from a
full step list was rejected: two implementations of one rule drift, and the
dashboard and the panel would then disagree about what is next.
