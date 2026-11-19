# Nestable notes: parent rows cascade, and reorder names the whole section

- **`note.parent_id` cascades on delete, not SET NULL.** Promoting every child
  to a root reads as a flat pile rather than as a loss, which is much harder to
  notice.
- **The reorder endpoint requires exactly the notes in the section, and stays
  that way.** A hierarchical move swaps two siblings, so sending only that
  sibling group would be the smaller payload — and is refused with a 400.
  Relaxing the endpoint was the obvious fix and the wrong one: the rule is what
  stops a partial list renumbering half a section. The page flattens its whole
  tree depth-first with the swap applied instead, so `sort_index` ascends in
  the order the page draws, and a reader of the raw rows sees the tree's
  order too.
- **A row whose parent is missing renders as a root.** It should not happen —
  the router refuses a parent from another owner or section, and a delete
  cascades — but the alternative is dropping it, which hides a row with
  nothing on screen to say so.
- **Parallel strands are separate sections, not one section with a `kind`.**
  `sort_index` orders rows within one `(owner, section)` pair, so a
  kind-tagged single section could not order entries within a strand.
