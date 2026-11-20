# How note sections are grouped into cards

- **A card answers one question, and holds at least two sections.** A section
  filed by elimination is a sign the categories are wrong, not that the
  section is awkward; a card of one is a section wearing a second header. A
  test keeps every card at two sections or more.
- **`group` is display-only**, so regrouping is a registry edit: no migration,
  no data change. Cards collapse when empty.
- **Rejected: sub-headings inside one card**, which needs a `subgroup` concept
  and a third level of card chrome; a card nested two deep reads as a
  subsection rather than as a group. Sibling cards are the pattern.
- **A section's group can vary per owner (`groups_by_owner`), and that is kept
  rare.** 解析 Analysis belongs beside its sibling sections on films and
  series, but a game has none of them, so on a game it joins the reviews
  rather than standing alone. A second, game-only section was rejected because
  it would split the rows as well as the card. The override is resolved before
  `/api/notes/sections` serves it, so the frontend never learns overrides
  exist. A test pins the exact list of overridden sections: a reader scanning
  the registry for `group=` would otherwise be wrong about where a section
  lands.
- **A card's key stays when its label changes.** The key is what code and
  tests name; only the label reaches a reader.
- **Two cards on one page never share a label**, even when they mirror each
  other (a game's own resources card beside the site-wide Resources card).
