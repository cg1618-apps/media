# Related records stay pairs; the editor offers the group

Related records - `company_relation`, `franchise_relation` and `series_relation` - relate two
records at a time. A related to B and to C says nothing about B and C. What
the editor does instead is offer it: every record on a list gets an **Also
related to** tick for each record above it - all ticked on a record just
added, and on one already there ticked where the pair is related now - and a
changed tick is written as an ordinary pair (`also_related_to` or
`not_related_to` on the `PUT .../related` item).

## Why not a group

Being related is not transitive. A parent company's two subsidiaries belong
together; two studios that each worked with A need not have anything to do
with each other. A group model would assert the first case everywhere and
make the second something to undo.

## Rejected

- **A group, everyone related to everyone.** Wrong for the non-transitive
  case above, with no way to say so.
- **A group by default, with links that can be cut.** "Not related" becomes a
  stored fact - an exception row every read has to apply. A new member's
  inheritance of the cuts, and what survives when a member leaves, both need
  rules that pairs never raise. And each side keeps its own remark
  ([two rows](2026-11-20-peer-relations-are-two-rows.md)), so a group of five
  holds twenty remark slots, mostly blank, with cut links leaving orphans.

The tick gives the group-by-default convenience at the moment of writing,
where the person writing can see and untick each pair, and stores nothing but
pairs. Unticking leaves no row - or removes the pair's two rows when it was
related - so there is nothing to apply on read.

## Not this decision

A named group - a corporate group, a shared universe - is a different fact
from a relation: an entity with members. If it is wanted, it gets its own
table, not a reading of these.
